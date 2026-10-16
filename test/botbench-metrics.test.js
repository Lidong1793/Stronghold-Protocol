import { formationReport } from '../tools/botbench/formations.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BENCHMARK_SCHEMA, FACTORIAL_GROUPS, leakMetrics, summarizeRecords, summarizeWindows, factorialReport } from '../tools/botbench/metrics.mjs';
import { refinementReport } from '../tools/botbench/refinements.mjs';

test('benchmark leakage separates ordinary, bounty and boss enemies and excludes non-counted records', () => {
  assert.deepEqual(leakMetrics({ leaked: [
    { enemyKey: 'ordinary' }, { enemyKey: 'ordinary' }, { enemyKey: 'bounty', tag: 'bounty' },
    { enemyKey: 'boss', boss: true, tag: 'boss' }, { enemyKey: 'part', counted: false }, null,
  ], leakedInTotal: 2 }), {
    leaks: 4, ordinaryLeaks: 2, bountyLeaks: 1, bossEnemyLeaks: 1, bountyKeys: ['bounty'],
    leaksByEnemy: { ordinary: 2, bounty: 1, boss: 1 }, scheduledLeaks: 2,
  });
});

function observation(n, alive = true) {
  return { total: 10, alive, leaks: n, ordinaryLeaks: n, bountyLeaks: 0, bossEnemyLeaks: 0,
    spawnedEnemies: 10, spawnedByEnemy: { enemy: 10 }, leaksByEnemy: { enemy: n } };
}
function record(group, rounds = 2) {
  return {
    schema: BENCHMARK_SCHEMA, config: 'solo:HARD', seed: 1, stageId: 'stage', bossId: 'boss',
    sourceFingerprint: 'code', setupFingerprint: 'setup', completed: true, errors: 0,
    setup: { disabledBonds: ['bond_dmg', 'bond_tank'], staticInactiveBonds: ['bond_diy'] },
    options: { ioletaPolicy: group.policy, formation: group.formation, rehearsal: 'default', band: 'band_ioleta' },
    formationMapSupported: true, victory: false, roundsPassed: rounds, reachedBoss: false, hidden: false,
    rounds: Array.from({ length: rounds }, (_, i) => ({ round: i + 1, kind: 'normal', players: { ai_0: observation(2, i < rounds - 1) } })),
  };
}

test('early and late windows use inclusive absolute round boundaries and exclude Boss', () => {
  const r = record(FACTORIAL_GROUPS[0], 13);
  for (const row of r.rounds) row.players.ai_0 = observation(row.round);
  r.rounds.push({ round: 14, kind: 'boss', players: { ai_0: observation(999) } });
  const w = summarizeWindows([r]);
  assert.equal(w.early10.leaks, 55);
  assert.equal(w.early11.leaks, 66);
  assert.equal(w.lateAfter10.leaks, 36);
  assert.equal(w.lateAfter11.leaks, 25);
  assert.equal(w.early10.playerRounds, 10);
  const eliminated = summarizeWindows([record(FACTORIAL_GROUPS[0], 9)]);
  assert.equal(eliminated.lateAfter10.playerRounds, 0);
  assert.equal(eliminated.lateAfter10.leaksPerEnemy, null);
});

test('window pairing excludes unmatched late rounds without hiding full exposure', () => {
  const runs = Object.fromEntries(FACTORIAL_GROUPS.map((g, i) => [g.id, [record(g, i ? 13 : 10)]]));
  const p = factorialReport(runs).pairs[0];
  assert.equal(p.groups['experimental-legacy'].windows.lateAfter10.leaks, 6);
  assert.equal(p.groups['experimental-legacy'].commonWindows.lateAfter10.leaks, 0);
  assert.equal(p.groups['experimental-legacy'].commonWindows.early11.playerRounds, 10);
});

test('refinement report validates frozen inputs and pairs each early/late window', () => {
  const base = record(FACTORIAL_GROUPS[1], 10), candidate = record(FACTORIAL_GROUPS[1], 13);
  base.options.refinements = []; candidate.options.refinements = ['preview'];
  const runs = { baseline: [base], preview: [candidate] };
  const row = refinementReport(runs).rows.find(r => r.group === 'preview');
  assert.equal(row.windows.lateAfter10.leaks, 6);
  assert.equal(row.common.lateAfter10.playerRounds, 0);
  assert.equal(row.deltas.early11, 0);
  for (const alter of [r => r.preview[0].sourceFingerprint = 'different', r => r.preview[0].setupFingerprint = 'different',
    r => r.preview[0].options.refinements = [], r => r.preview.push(structuredClone(r.preview[0])), r => r.preview[0].errors = 1]) {
    const copy = structuredClone(runs); alter(copy); assert.throws(() => refinementReport(copy));
  }
});

test('eliminating-round observations count in both leakage and exposure, while dead non-participants do not', () => {
  const r = record(FACTORIAL_GROUPS[0]);
  r.rounds.push({ round: 3, kind: 'boss', players: { dead: { alive: false, total: null, leaks: 0 } } });
  const s = summarizeRecords([r], { normalOnly: true, maxRound: 13 });
  assert.equal(s.leaks, 4); assert.equal(s.playerRounds, 2); assert.equal(s.enemies, 20);
  assert.equal(s.leaksPerEnemy, 0.2); assert.equal(s.leaksPerPlayerRound, 2);
  assert.equal(s.byEnemy.enemy.leakRate, 0.2);
});

test('Boss and hidden leakage are retained separately from the first thirteen normal rounds', () => {
  const r = record(FACTORIAL_GROUPS[0]);
  r.rounds.push({ round: 14, kind: 'boss', players: { ai_0: observation(3) } },
    { round: 15, kind: 'hidden', players: { ai_0: observation(4) } });
  assert.equal(summarizeRecords([r]).leaks, 11);
  assert.equal(summarizeRecords([r], { normalOnly: true, maxRound: 13 }).leaks, 4);
});

test('four-group report pairs stage and seed and compares common exposure after early death', () => {
  const runs = Object.fromEntries(FACTORIAL_GROUPS.map((g, i) => [g.id, [record(g, i === 0 ? 1 : 2)]]));
  const report = factorialReport(runs);
  assert.equal(report.pairs.length, 1);
  assert.equal(report.pairs[0].commonPlayerRounds, 1);
  for (const g of FACTORIAL_GROUPS) assert.equal(report.pairs[0].groups[g.id].common.leaks, 2);
  assert.equal(report.pairs[0].groups['legacy-legacy'].normal.leaks, 2);
  assert.equal(report.pairs[0].groups['experimental-learned'].normal.leaks, 4);
  assert.equal(report.aggregates.length, 8);
  assert.equal(report.banAggregates.length, 4);
  assert.deepEqual(report.pairs[0].disabledBonds, ['bond_dmg', 'bond_tank']);
  const joint = report.contrasts.find(c => c.id === 'joint' && c.stageId == null);
  assert.deepEqual(joint.deltas, { normalLeaks: 2, commonLeaks: 0, playerRounds: 1, roundsPassed: 1, victory: 0, reachedBoss: 0 });
});

test('paired report rejects different initial setups, source versions, switches, errors or missing matches', () => {
  const base = Object.fromEntries(FACTORIAL_GROUPS.map(g => [g.id, [record(g)]]));
  for (const [key, value] of [['setupFingerprint', 'different'], ['sourceFingerprint', 'different'], ['errors', 1], ['completed', false]]) {
    const runs = structuredClone(base); runs['experimental-learned'][0][key] = value;
    assert.throws(() => factorialReport(runs));
  }
  const missing = structuredClone(base); missing['experimental-learned'] = [];
  assert.throws(() => factorialReport(missing));
  const switched = structuredClone(base); switched['experimental-learned'][0].options.formation = 'legacy';
  assert.throws(() => factorialReport(switched));
});

test('formation comparison freezes strategy, repairs and setups and rejects NORMAL', () => {
  const base = record(FACTORIAL_GROUPS[1], 10), candidate = record(FACTORIAL_GROUPS[1], 13);
  for (const r of [base, candidate]) { r.config = 'solo:HARD'; r.options.refinements = ['preview', 'capacity']; }
  base.options.formation = 'legacy'; candidate.options.formation = 'refined';
  const runs = { legacy: [base], refined: [candidate] };
  const row = formationReport(runs).rows.find(r => r.group === 'refined');
  assert.equal(row.common.lateAfter10.playerRounds, 0);
  assert.equal(row.deltas.early11, 0);
  for (const alter of [r => r.refined[0].sourceFingerprint = 'different',
    r => r.refined[0].options.refinements = [], r => r.refined[0].options.formation = 'learned',
    r => r.refined[0].config = 'solo:NORMAL', r => r.refined[0].errors = 1]) {
    const copy = structuredClone(runs); alter(copy); assert.throws(() => formationReport(copy));
  }
});
