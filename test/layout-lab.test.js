import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getData } from '../server/data.js';
import { buildDeployMap, canPlace } from '../server/match/board.js';
import { attackRangeGrid, loadoutRecord, resolveRecordLoadout } from '../shared/loadoutRecord.js';
import { makeCorpus, validateAnnotation, describeLayout } from '../tools/layout-lab/model.mjs';
import { startLayoutLab } from '../tools/layout-lab.mjs';

const data = getData();
const corpus = makeCorpus(data);
function complete(c) {
  const deploy = new Map(Object.entries(corpus.maps.find(m => m.id === c.mapId).deploy));
  const used = new Set();
  const placements = c.units.map(u => {
    const key = [...deploy.keys()].find(k => !used.has(k) && canPlace(deploy, u.place, ...k.split(',').map(Number)));
    assert.ok(key, `room for ${c.id}/${u.uid}`); used.add(key);
    const [row, col] = key.split(',').map(Number);
    return { uid: u.uid, row, col, dir: 'RIGHT' };
  });
  return { placements, notes: 'Human notes', confirmed: true };
}

test('layout corpus covers exactly the Dire pool, six distributions, with reproducible real ranges and legal eight-unit layouts', () => {
  assert.deepEqual(corpus, makeCorpus(data));
  assert.deepEqual(corpus.maps.map(m => m.id), data.config.modes.mode_single_hard.stages);
  assert.equal(corpus.maps.length, 7); assert.equal(corpus.cases.length, 42);
  for (const m of corpus.maps) {
    assert.deepEqual(m.deploy, Object.fromEntries(buildDeployMap(data.stages[m.id])));
    assert.equal(m.routes.length, 2);
    assert.ok(m.routes.every(r => r.tiles.at(-1).join(',') === '9,2'));
  }
  for (const c of corpus.cases) {
    assert.equal(c.units.length, 8);
    assert.equal(new Set(c.units.map(u => u.id)).size, 8);
    for (const u of c.units) {
      const rec = data.chess[u.id];
      assert.deepEqual(u.range, attackRangeGrid(loadoutRecord(rec, resolveRecordLoadout(rec))));
      if (u.role === 'heal') assert.equal(rec.attackKind, 'heal');
      if (u.role === 'block') assert.ok(u.block >= 2 && u.place === 'melee');
    }
    assert.deepEqual(validateAnnotation(corpus, c.id, complete(c)), complete(c));
  }
});

test('annotations reject overlap, invalid facing, incomplete confirmations and illegal terrain', () => {
  const c = corpus.cases[0], a = complete(c);
  const overlap = structuredClone(a); Object.assign(overlap.placements[1], { row: a.placements[0].row, col: a.placements[0].col });
  assert.throws(() => validateAnnotation(corpus, c.id, overlap));
  const facing = structuredClone(a); facing.placements[0].dir = 'NORTH';
  assert.throws(() => validateAnnotation(corpus, c.id, facing));
  assert.throws(() => validateAnnotation(corpus, c.id, { ...a, placements: [] }));
  const gate = structuredClone(a); Object.assign(gate.placements[0], { row: 9, col: 10 });
  assert.throws(() => validateAnnotation(corpus, c.id, gate));
  assert.equal(validateAnnotation(corpus, c.id, { ...a, placements: [], confirmed: false }).placements.length, 0);
});

test('feature export rotates healer coverage and records approach tiles and route order', () => {
  const c = corpus.cases[0], a = complete(c);
  const f = describeLayout(corpus, c.id, a);
  assert.equal(f.units.length, 8);
  assert.equal(f.routes.length, 2);
  for (const rt of f.routes) assert.deepEqual(rt.blockers.map(b => b.routeIndex), rt.blockers.map(b => b.routeIndex).sort((a, b) => a - b));
  const h = a.placements.find(p => p.uid === 'heal-1');
  const old = f.units.find(p => p.uid === h.uid).coverage;
  h.dir = 'LEFT';
  const next = describeLayout(corpus, c.id, a).units.find(p => p.uid === h.uid).coverage;
  assert.deepEqual(next, old.map(k => { const [r, c] = k.split(',').map(Number); return `${2 * h.row - r},${2 * h.col - c}`; }));
});

test('local API saves atomically, rejects invalid writes, exports only confirmed features and restores on restart', async t => {
  const storage = await mkdtemp(join(tmpdir(), 'sp-layout-test-'));
  let lab = await startLayoutLab({ port: 0, storage });
  t.after(async () => { await new Promise(ok => lab.server.close(ok)); await rm(storage, { recursive: true, force: true }); });
  const id = corpus.cases[0].id, a = complete(corpus.cases[0]);
  const put = value => fetch(`${lab.url}/api/annotation/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  assert.equal((await put(a)).status, 200);
  assert.equal((await put({ ...a, placements: [] })).status, 400);
  const stored = JSON.parse(await readFile(lab.savePath, 'utf8'));
  assert.deepEqual(stored.annotations[id], a);
  let exported = await (await fetch(`${lab.url}/api/export`)).json();
  assert.ok(exported.features[id]);
  await put({ ...a, confirmed: false });
  exported = await (await fetch(`${lab.url}/api/export`)).json();
  assert.equal(Object.keys(exported.features).length, 0);
  assert.equal((await fetch(`${lab.url}/api/annotation/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://elsewhere.test' }, body: JSON.stringify(a) })).status, 403);
  await new Promise(ok => lab.server.close(ok));
  lab = await startLayoutLab({ port: 0, storage });
  const restored = await (await fetch(`${lab.url}/api/state`)).json();
  assert.deepEqual(restored.annotations[id], { ...a, confirmed: false });
});
