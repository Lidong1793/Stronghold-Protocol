// The 自选 golden match covers what it claims (test/golden/README.md, tools/golden.mjs — 0.2.0 自选编队): reads the stored
// digest only (test/golden.test.js recomputes it). Its human seat (AI 托管) slots 推进之王 and prototypes; its shop draws
// 自选 pieces, its AI fields selected operators in battle, the stock stays within the shared-pool cap, and the match
// ends without errors. The original DIY seed fields 推进之王; the Ioleta coverage seed fields Sharp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const MATCHES = read('./golden/matches.json');
const BACKUPS = read('../data/backups.json');
const CHESS = read('../data/chess.json');
const ECONOMY = read('../data/config.json').economy;

test('matches: the Ioleta 自选 match draws and fields its selected operator', () => {
  const [id, dg] = Object.entries(MATCHES.scenarios).find(([k]) => /-coverage-diy$/.test(k)) || [];
  assert.ok(dg, 'scenario present');
  assert.deepEqual(dg.errors, { engine: 0, logged: 0, sim: 0, dispatcher: 0 }, id);
  assert.deepEqual(Object.keys(dg.diy.picks).sort(), Object.keys(BACKUPS.diy.slots).sort(), 'all four slots filled');
  assert.equal(dg.diy.picks.chess_char_5_diy1_a.charId, 'char_112_siege');
  const draws = dg.diy.rounds.flatMap(([, d]) => (d ? d.split(' ') : []));
  assert.ok(draws.length >= 2, `shop draws: ${draws.join(', ')}`);
  for (const d of draws) assert.ok(Object.hasOwn(BACKUPS.diy.slots, `chess_char_${d}`), d);
  const fielded = dg.diy.rounds.filter(([, , f]) => f).flatMap(([r, , f]) => f.split(' ').map((x) => `${r}:${x}`));
  assert.ok(fielded.some((x) => x.endsWith('5_diy2_a→char_609_acguad')), `fielded: ${fielded.join(', ')}`);
  for (const [r, , f] of dg.diy.rounds) {
    for (const x of f ? f.split(' ') : []) {
      const [slot, charId] = x.split('→');
      const rec = CHESS[`chess_char_${slot}`];
      assert.ok(rec, `round ${r}: known slot ${slot}`);
      assert.equal(dg.diy.picks[rec.baseId || rec.chessId].charId, charId, `round ${r}: ${x} fights as its pick (normal or elite)`);
    }
  }
  // the stock: never above its cap (8 at tier 5, 5 at tier 6 — doubled in co-op like the shared pool, GitHub #650)
  const factor = dg.mode === 'coop' ? ECONOMY.coopPoolMultiplier : 1;
  for (const [slot, left] of Object.entries(dg.diy.stock)) {
    const cap = ECONOMY.poolCopies[BACKUPS.diy.slots[slot].tier] * factor;
    assert.ok(left >= 0 && left <= cap, `${slot}: ${left} left, cap ${cap}`);
  }
  assert.equal(factor, 2, 'the coverage match is co-op');
  assert.ok(Object.values(dg.diy.stock).some((left) => left > 8), 'a co-op stock above the single-player 8 (#650)');
});

test('matches: the original 自选 match fields 推进之王 in battle', () => {
  const dg = MATCHES.scenarios['coop2-NORMAL-70-diy'];
  assert.ok(dg, 'scenario present');
  assert.deepEqual(dg.errors, { engine: 0, logged: 0, sim: 0, dispatcher: 0 });
  assert.ok(dg.diy.rounds.some(([, , f]) => f.includes('5_diy1_a→char_112_siege')), '推进之王 fielded');
});
