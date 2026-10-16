import { summarizeRecords, summarizeWindows } from './metrics.mjs';

/** Paired windows, retaining the eliminating round and never inventing observations after elimination. */
export function formationReport(runs) {
  if (!runs.legacy?.length) throw new Error('A baseline is required');
  const key = r => `${r.config}|${r.seed}`;
  const baseline = new Map(runs.legacy.map(r => [key(r), r]));
  const sources = new Set(Object.values(runs).flat().map(r => r.sourceFingerprint));
  if (sources.size !== 1) throw new Error('Sources differ between runs; rerun on one frozen source');
  const rows = [];
  for (const [group, records] of Object.entries(runs)) {
    if (records.length !== baseline.size || new Set(records.map(key)).size !== baseline.size) throw new Error(`Unpaired seeds: ${group}`);
    const pairs = records.map(r => {
      const b = baseline.get(key(r));
      if (!b || !r.completed || r.errors || !b.completed || b.errors) throw new Error(`Incomplete or erroneous match: ${group}/${key(r)}`);
      if (r.setupFingerprint !== b.setupFingerprint || r.schema !== b.schema) throw new Error(`Setup/schema differs: ${key(r)}`);
      for (const k of ['band', 'ioletaPolicy', 'rehearsal']) if (r.options[k] !== b.options[k]) throw new Error(`Option differs: ${k}`);
      if (r.options.formation !== group || b.options.formation !== 'legacy') throw new Error('Incorrect formation switches');
      for (const k of [r, b]) if (JSON.stringify(k.options.refinements) !== JSON.stringify(['preview', 'capacity'])
        || k.options.ioletaPolicy !== 'experimental' || !['solo:HARD', 'solo:ABYSS'].includes(k.config)) throw new Error('Incorrect fixed settings');
      const keys = record => new Set(record.rounds.filter(row => row.kind === 'normal' && row.round <= 13)
        .flatMap(row => Object.entries(row.players).filter(([, p]) => p.total != null).map(([pid]) => `${row.round}|${pid}`)));
      const a = keys(b), z = keys(r), common = new Set([...a].filter(k => z.has(k)));
      const restrict = record => ({ ...record, rounds: record.rounds.map(row => ({ ...row,
        players: Object.fromEntries(Object.entries(row.players).filter(([pid]) => common.has(`${row.round}|${pid}`))) })) });
      return { record: r, base: b, paired: restrict(r), pairedBase: restrict(b) };
    });
    for (const config of new Set(records.map(r => r.config))) {
      const selected = pairs.filter(p => p.record.config === config);
      const windows = summarizeWindows(selected.map(p => p.record));
      const common = summarizeWindows(selected.map(p => p.paired));
      const base = summarizeWindows(selected.map(p => p.pairedBase));
      rows.push({ group, config, all: summarizeRecords(selected.map(p => p.record)), windows,
        common, deltas: Object.fromEntries(Object.keys(common).map(k => [k, common[k].leaks - base[k].leaks])),
        seeds: selected.map(p => ({ seed: p.record.seed, stageId: p.record.stageId,
          windows: summarizeWindows([p.record]), common: summarizeWindows([p.paired]), base: summarizeWindows([p.pairedBase]) })),
      });
    }
  }
  return { sourceFingerprint: [...sources][0], groups: Object.keys(runs), rows };
}
