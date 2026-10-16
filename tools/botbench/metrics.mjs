// Benchmark accounting only: no decisions, RNG draws or game-state mutations.
export const BENCHMARK_SCHEMA = 2;
export const FACTORIAL_GROUPS = [
  { id: 'legacy-legacy', policy: 'legacy', formation: 'legacy' },
  { id: 'experimental-legacy', policy: 'experimental', formation: 'legacy' },
  { id: 'legacy-learned', policy: 'legacy', formation: 'learned' },
  { id: 'experimental-learned', policy: 'experimental', formation: 'learned' },
];

export function leakMetrics(result) {
  const leaked = (result?.leaked || []).filter(l => l && l.counted !== false);
  const bounty = leaked.filter(l => l.tag === 'bounty');
  const boss = leaked.filter(l => l.boss || l.tag === 'boss');
  const byEnemy = {};
  for (const l of leaked) byEnemy[l.enemyKey] = (byEnemy[l.enemyKey] || 0) + 1;
  return {
    leaks: leaked.length, bountyLeaks: bounty.length, bossEnemyLeaks: boss.length,
    ordinaryLeaks: leaked.length - bounty.length - boss.length,
    bountyKeys: bounty.map(l => l.enemyKey), leaksByEnemy: byEnemy,
    scheduledLeaks: result?.leakedInTotal ?? null,
  };
}

const ratio = (a, b) => b > 0 ? a / b : null;
const sum = (values) => values.reduce((a, b) => a + b, 0);
const optionalMean = (records, key) => { const values = records.map(r => r[key]).filter(Number.isFinite); return ratio(sum(values), values.length); };
export function summarizeRecords(records, { normalOnly = false, minRound = 1, maxRound = Infinity } = {}) {
  const observations = records.flatMap(r => r.rounds
    .filter(row => (!normalOnly || row.kind === 'normal') && row.round >= minRound && row.round <= maxRound)
    .flatMap(row => Object.values(row.players).filter(p => p.total != null)));
  const count = key => sum(observations.map(p => p[key] || 0));
  const leaks = count('leaks');
  const enemies = count('spawnedEnemies');
  const byEnemy = {};
  for (const p of observations) {
    for (const [key, n] of Object.entries(p.spawnedByEnemy || {})) (byEnemy[key] ||= { enemies: 0, leaks: 0 }).enemies += n;
    for (const [key, n] of Object.entries(p.leaksByEnemy || {})) (byEnemy[key] ||= { enemies: 0, leaks: 0 }).leaks += n;
  }
  for (const value of Object.values(byEnemy)) value.leakRate = ratio(value.leaks, value.enemies);
  return {
    matches: records.length, wins: records.filter(r => r.victory).length,
    reachedBoss: records.filter(r => r.reachedBoss).length,
    hiddenReached: records.filter(r => r.hidden).length,
    meanRoundsPassed: ratio(sum(records.map(r => r.roundsPassed)), records.length),
    meanFinalLp: optionalMean(records, 'finalLp'), meanLpAtBoss: optionalMean(records, 'lpAtBoss'),
    playerRounds: observations.length, enemies, leaks,
    scheduledEnemies: count('total'), scheduledLeaks: count('scheduledLeaks'),
    scheduledLeakRate: ratio(count('scheduledLeaks'), count('total')),
    ordinaryLeaks: count('ordinaryLeaks'), bountyLeaks: count('bountyLeaks'), bossEnemyLeaks: count('bossEnemyLeaks'),
    leaksPerMatch: ratio(leaks, records.length), leaksPerPlayerRound: ratio(leaks, observations.length),
    leaksPerEnemy: ratio(leaks, enemies), byEnemy,
    errors: sum(records.map(r => r.errors || 0)),
  };
}

// Fixed absolute windows, not the last N rounds a surviving match happened to play.
// Boss/hidden fields remain separate even in modes with a different final round.
export const ROUND_WINDOWS = {
  early10: [1, 10], early11: [1, 11], lateAfter10: [11, 13], lateAfter11: [12, 13],
};
export function summarizeWindows(records) {
  return Object.fromEntries(Object.entries(ROUND_WINDOWS).map(([key, [minRound, maxRound]]) =>
    [key, summarizeRecords(records, { normalOnly: true, minRound, maxRound })]));
}

// Death truncates exposure: retain each group's full totals and compare leakage only over rounds all four played.
export function factorialReport(runs) {
  const groups = FACTORIAL_GROUPS.filter(g => runs[g.id]);
  if (groups.length !== FACTORIAL_GROUPS.length) throw new Error('Four factorial groups are required');
  const maps = Object.fromEntries(groups.map(g => [g.id, new Map(runs[g.id].map(r => [`${r.config}|${r.seed}`, r]))]));
  if (new Set(groups.flatMap(g => runs[g.id].map(r => r.sourceFingerprint))).size !== 1) throw new Error('Bot source changed within the experiment');
  const keys = [...maps[groups[0].id].keys()];
  if (!keys.length) throw new Error('No matches to compare');
  const pairs = [];
  for (const key of keys) {
    const records = groups.map(g => maps[g.id].get(key));
    if (records.some(r => !r)) throw new Error(`Missing paired match: ${key}`);
    const base = records[0];
    for (const [i, r] of records.entries()) {
      if (r.schema !== BENCHMARK_SCHEMA) throw new Error(`Unsupported benchmark schema: ${key}`);
      if (r.setupFingerprint !== base.setupFingerprint || r.stageId !== base.stageId || r.bossId !== base.bossId) throw new Error(`Initial setup differs: ${key}`);
      if (r.sourceFingerprint !== base.sourceFingerprint) throw new Error(`Bot source changed between groups: ${key}`);
      if (r.options.ioletaPolicy !== groups[i].policy || r.options.formation !== groups[i].formation) throw new Error(`Incorrect group switches: ${key}`);
      if (r.options.rehearsal !== base.options.rehearsal || r.options.band !== base.options.band) throw new Error(`Benchmark settings differ: ${key}`);
      if (JSON.stringify(r.options.refinements || []) !== JSON.stringify(base.options.refinements || [])) throw new Error(`Refinements differ: ${key}`);
      if (!r.completed || r.errors) throw new Error(`Incomplete or erroneous match: ${key}/${groups[i].id}`);
    }
    const commonKeys = records.map(r => new Set(r.rounds.filter(row => row.kind === 'normal' && row.round <= 13)
      .flatMap(row => Object.entries(row.players).filter(([, p]) => p.total != null).map(([pid]) => `${row.round}|${pid}`))));
    const common = new Set([...commonKeys[0]].filter(k => commonKeys.every(s => s.has(k))));
    const outcomes = {};
    groups.forEach((g, i) => {
      const r = records[i];
      const commonRecord = { ...r, rounds: r.rounds.filter(row => row.kind === 'normal' && row.round <= 13)
        .map(row => ({ ...row, players: Object.fromEntries(Object.entries(row.players).filter(([pid]) => common.has(`${row.round}|${pid}`))) })) };
      outcomes[g.id] = {
        victory: r.victory, roundsPassed: r.roundsPassed, reachedBoss: r.reachedBoss,
        normal: summarizeRecords([r], { normalOnly: true, maxRound: 13 }),
        boss: summarizeRecords([{ ...r, rounds: r.rounds.filter(row => row.kind !== 'normal') }]),
        all: summarizeRecords([r]), common: summarizeRecords([commonRecord]),
        windows: summarizeWindows([r]), commonWindows: summarizeWindows([commonRecord]),
      };
    });
    pairs.push({ config: base.config, seed: base.seed, stageId: base.stageId, bossId: base.bossId,
      disabledBonds: base.setup?.disabledBonds || [], staticInactiveBonds: base.setup?.staticInactiveBonds || [],
      formationMapSupported: base.formationMapSupported, commonPlayerRounds: common.size, groups: outcomes });
  }
  for (const g of groups) if (maps[g.id].size !== keys.length || maps[g.id].size !== runs[g.id].length) throw new Error(`Duplicate or unpaired matches: ${g.id}`);
  const aggregates = [];
  const configNames = [...new Set(pairs.map(p => p.config))];
  for (const config of configNames) {
    const stageIds = [...new Set(pairs.filter(p => p.config === config).map(p => p.stageId))];
    for (const stageId of [null, ...stageIds]) for (const g of groups) {
      const selected = runs[g.id].filter(r => r.config === config && (stageId == null || r.stageId === stageId));
      const selectedPairs = pairs.filter(p => p.config === config && (stageId == null || p.stageId === stageId));
      aggregates.push({ config, stageId, group: g.id,
        normal: summarizeRecords(selected, { normalOnly: true, maxRound: 13 }), all: summarizeRecords(selected),
        windows: summarizeWindows(selected),
        commonWindows: Object.fromEntries(Object.keys(ROUND_WINDOWS).map(key => [key, {
          leaks: sum(selectedPairs.map(p => p.groups[g.id].commonWindows[key].leaks)),
          playerRounds: sum(selectedPairs.map(p => p.groups[g.id].commonWindows[key].playerRounds)),
          enemies: sum(selectedPairs.map(p => p.groups[g.id].commonWindows[key].enemies)),
        }])),
        commonPlayerRounds: sum(selectedPairs.map(p => p.commonPlayerRounds)),
        commonLeaks: sum(selectedPairs.map(p => p.groups[g.id].common.leaks)),
        commonEnemies: sum(selectedPairs.map(p => p.groups[g.id].common.enemies)),
      });
    }
  }
  const contrastGroups = [
    ['policy-old-formation', 'legacy-legacy', 'experimental-legacy'],
    ['formation-old-policy', 'legacy-legacy', 'legacy-learned'],
    ['policy-new-formation', 'legacy-learned', 'experimental-learned'],
    ['formation-new-policy', 'experimental-legacy', 'experimental-learned'],
    ['joint', 'legacy-legacy', 'experimental-learned'],
  ];
  const contrasts = [];
  for (const config of configNames) for (const stageId of [null, ...new Set(pairs.filter(p => p.config === config).map(p => p.stageId))]) {
    const selected = pairs.filter(p => p.config === config && (stageId == null || p.stageId === stageId));
    for (const [id, before, after] of contrastGroups) {
      const deltas = selected.map(p => {
        const a = p.groups[before], b = p.groups[after];
        return { seed: p.seed, stageId: p.stageId, normalLeaks: b.normal.leaks - a.normal.leaks,
          commonLeaks: b.common.leaks - a.common.leaks, playerRounds: b.normal.playerRounds - a.normal.playerRounds,
          roundsPassed: b.roundsPassed - a.roundsPassed, victory: Number(b.victory) - Number(a.victory),
          reachedBoss: Number(b.reachedBoss) - Number(a.reachedBoss) };
      });
      contrasts.push({ config, stageId, id, before, after, matches: selected.length,
        deltas: Object.fromEntries(['normalLeaks', 'commonLeaks', 'playerRounds', 'roundsPassed', 'victory', 'reachedBoss']
          .map(key => [key, sum(deltas.map(d => d[key]))])),
        fewerCommonLeaks: deltas.filter(d => d.commonLeaks < 0).length,
        moreCommonLeaks: deltas.filter(d => d.commonLeaks > 0).length,
        tiedCommonLeaks: deltas.filter(d => d.commonLeaks === 0).length, pairs: deltas,
        windows: Object.fromEntries(Object.keys(ROUND_WINDOWS).map(key => [key, {
          commonLeaks: sum(selected.map(p => p.groups[after].commonWindows[key].leaks - p.groups[before].commonWindows[key].leaks)),
          leaks: sum(selected.map(p => p.groups[after].windows[key].leaks - p.groups[before].windows[key].leaks)),
        }])),
      });
    }
  }
  const banKey = record => [...(record.setup?.disabledBonds || [])].sort().join(',');
  const banAggregates = [];
  for (const config of configNames) {
    const combinations = [...new Set(runs[groups[0].id].filter(r => r.config === config).map(banKey))];
    for (const combination of combinations) for (const g of groups) {
      const selected = runs[g.id].filter(r => r.config === config && banKey(r) === combination);
      banAggregates.push({ config, disabledBonds: combination ? combination.split(',') : [], group: g.id,
        seeds: selected.map(r => r.seed), stageIds: [...new Set(selected.map(r => r.stageId))],
        normal: summarizeRecords(selected, { normalOnly: true, maxRound: 13 }), all: summarizeRecords(selected), windows: summarizeWindows(selected) });
    }
  }
  return { schema: BENCHMARK_SCHEMA, groups, aggregates, banAggregates, contrasts, pairs };
}
