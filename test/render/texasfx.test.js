import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackClock, curveValue, gradientValue, groundPoint, isTexas, nodePoses, transformPoint, TexasFx } from '../../public/js/render/fx/texas.js';
import { UNIT } from '../../public/js/render/style.js';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';

test('original FX selects base/elite Texas; alter, other operators and enemies retain their FX', () => {
  for (const id of ['char_102_texas', 'chess_char_1_08_a', 'chess_char_1_08_b']) assert.equal(isTexas({ info: { defId: id } }), true);
  for (const id of ['char_1028_texas2', 'chess_char_4_16_a', 'char_002_amiya', null]) assert.equal(isTexas({ info: { defId: id } }), false);
  assert.equal(isTexas({ info: { defId: 'char_102_texas' }, isEnemy: true }), false);
});

test('Unity MinMaxCurve preserves constants, random intervals and Hermite lifetime curves', () => {
  assert.equal(curveValue({ minMaxState: 0, scalar: 4 }), 4);
  assert.equal(curveValue({ minMaxState: 3, minScalar: 2, scalar: 6 }, 0, 0.25), 3);
  const keys = [{ time: 0, value: 0, outSlope: 1 }, { time: 1, value: 1, inSlope: 1 }];
  assert.equal(curveValue({ minMaxState: 1, scalar: 2, maxCurve: { m_Curve: keys } }, 0.25), 0.5);
  assert.equal(curveValue({ minMaxState: 1, scalar: 2, maxCurve: { m_Curve: keys } }, 2), 2);
});

test('original particle gradient keeps color and transparency on their own timelines', () => {
  const c = gradientValue({ minMaxState: 1, maxGradient: { m_NumColorKeys: 2, m_NumAlphaKeys: 2,
    key0: { r: 1, g: 0, b: 0, a: 1 }, key1: { r: 0, g: 0, b: 1, a: 0 }, ctime0: 0, ctime1: 65535, atime0: 0, atime1: 32767.5 } }, 0.25);
  assert.deepEqual(c, [0.75, 0, 0.25, 0.5]);
});

test('sword Transform animation and parent scale place original mesh vertices in world space', () => {
  const effect = { nodes: [
    { parent: -1, position: { x: 1, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 }, rotation: { w: 1 } },
    { parent: 0, position: { x: 0, y: 3, z: 0 }, scale: { x: 1, y: 1, z: 1 }, rotation: { w: 1 } },
  ], tracks: [{ node: 1, property: 'position', keys: [[0, 0, 4, 0], [1, 0, 0, 0]] }] };
  assert.deepEqual(transformPoint([1, 0, 0], 1, nodePoses(effect, 0.5)), [3, 4, 0]);
  effect.tracks.push({ node: 1, property: 'tint', channel: 3, keys: [[0, 0], [1, 1]] });
  assert.deepEqual(nodePoses(effect, 0.5)[1].tint, [1, 1, 1, 0.5]);
});

test('ground FX use Unity XY as the tile floor, and negative Z as elevation', () => {
  assert.deepEqual(groundPoint({ x: 3, y: 2, z: 0.42 }, [0.5, 2.5, 0]), [3.5, 4.5, 0.42]);
  assert.deepEqual(groundPoint({ x: 3, y: 2, z: 0 }, [-2.5, 0.5, -0.3]), [0.5, 2.5, 0.3]);
});

test('an attached slash uses the rendered Spine matrix, including horizontal mirroring', () => {
  const fx = new TexasFx({ P: {}, cam: () => ({ project: () => ({ x: 10, y: 20, s: 50, depth: 10 }) }) });
  const effect = { space: 'billboard', x: 0, y: 0, z: 0, mountMatrix: { a: UNIT.modelScale * 80, b: 0, c: 0, d: UNIT.modelScale * 80, tx: 300, ty: 400 } };
  const right = fx.project(effect, [0.25, 0.5, 0]);
  assert.equal(right.x, 320); assert.equal(right.y, 360);
  effect.mountMatrix.a *= -1;
  const left = fx.project(effect, [0.25, 0.5, 0]);
  assert.equal(left.x, 280); assert.equal(left.y, 360);
});

test('attack clocks choose the upcoming Spine cycle rather than a fixed wall-clock delay', () => {
  const entry = { animation: { name: 'Attack_Loop' }, trackTime: 0.1, timeScale: 2 };
  const view = { actor: { roles: { attack: { loop: 'Attack_Loop' } }, dur: () => 1,
    entry: { hits: { Attack_Loop: [0.467] } }, spine: { state: { tracks: [entry] } } } };
  assert.equal(attackClock(view, 0.1835).start, 0);
  entry.trackTime = 1.1;
  assert.equal(attackClock(view, 0.1835).start, 1);
  assert.ok(attackClock(view, 0.6835).age < 0, 'the next cycle has not started yet');
});

test('native RotationModule.curve rotates the slash and repeated look-ahead does not duplicate it', () => {
  const fake = installFakePixi();
  try {
    const entry = { animation: { name: 'Attack_Loop' }, trackTime: 0, timeScale: 1 };
    const texas = { id: 1, x: 0, y: 0, info: { defId: 'char_102_texas' }, actor: { roles: { attack: { loop: 'Attack_Loop' } },
      dur: () => 1, entry: { hits: { Attack_Loop: [0.467] } }, spine: { state: { tracks: [entry] } } } };
    const ctx = fakeViewCtx(fake.P, { cam: () => ({ project: () => ({ x: 0, y: 0, s: 50 }) }) });
    const fx = new TexasFx(ctx);
    const emitter = { node: 0, duration: 0, delay: { scalar: 0 }, material: { texture: 'white', shader: 'AlphaBlend' }, modules: {
      InitialModule: { startLifetime: { scalar: 1 }, startSize: { scalar: 1 } },
      EmissionModule: { m_Bursts: [{ time: 0, countCurve: { scalar: 1 } }] }, RotationModule: { separateAxes: false, curve: { scalar: Math.PI } },
    } };
    fx.art = { pack: { effects: { attack_01_start: { nodes: [{ name: 'slash', parent: -1 }], tracks: [], emitters: [emitter] } }, meshes: {} }, textures: { white: fake.P.Texture.WHITE } };
    const token = [];
    fx.windUp(texas, 0.467, null, token); fx.windUp(texas, 0.467, null, token);
    assert.equal(fx.effects.length, 1);
    entry.trackTime = 0.2; fx.update(0.01);
    assert.ok(Math.abs(fx.effects[0].age - 0.2) < 1e-6);
    assert.ok(Math.abs(fx.effects[0].parts[0].rotation[2] - Math.PI * 0.2) < 1e-6);
    fx.update(0.2);
    assert.ok(Math.abs(fx.effects[0].age - 0.2) < 1e-6, 'an unchanged pose does not advance the attached effect');
    fx.destroy();
  } finally { fake.restore(); }
});

test('Sword Rain visual hits use the configured grid, including two-tile cardinal targets', () => {
  const texas = { id: 1, x: 0, y: 0, info: { defId: 'char_102_texas' } };
  const targets = [{ id: 2, x: 2, y: 0 }, { id: 3, x: 1, y: 1 }, { id: 4, x: 2, y: 2 }].map(v => ({ ...v, alive: true, isEnemy: true }));
  const fx = new TexasFx({ P: {}, view: () => texas, units: () => targets, skillGrid: () => [[0, 2], [1, 1]] });
  fx.art = {};
  const calls = [];
  fx.play = (name, v) => { calls.push([name, v.id]); return true; };
  assert.equal(fx.swordRain('aoe', 0, 0, { id: 1, skill: 'swordRain' }), true);
  assert.deepEqual(calls.filter(([name]) => name === 'skill_01_hit'), [['skill_01_hit', 2], ['skill_01_hit', 3]]);
});

test('missing optional art never suppresses attacks or skills, and cleanup releases native particles', () => {
  const fake = installFakePixi();
  try {
    const ctx = fakeViewCtx(fake.P, { cam: () => ({ project: (x, y, z) => ({ x: x * 50, y: y * 50 - z * 50, s: 50 }) }) });
    const fx = new TexasFx(ctx), texas = { id: 1, x: 0, y: 0, info: { defId: 'char_102_texas' } };
    assert.equal(fx.attack(texas, null, 'none'), false);
    assert.equal(fx.swordRain('aoe', 0, 0, { id: 1, skill: 'swordRain' }), false);
    const emitter = { node: 0, duration: 0.01, delay: { scalar: 0 }, renderMode: 0, material: { texture: 'white', shader: 'AlphaBlend' },
      modules: { InitialModule: { startLifetime: { scalar: 0.2 }, startSize: { scalar: 1 } }, EmissionModule: { m_Bursts: [{ time: 0, countCurve: { scalar: 1 } }] } } };
    fx.art = { pack: { effects: { test: { nodes: [{ name: 'test', parent: -1 }], tracks: [], emitters: [emitter] } }, meshes: {} }, textures: { white: fake.P.Texture.WHITE } };
    assert.equal(fx.play('test', texas), true);
    fx.update(0.01);
    assert.equal(fx.effects[0].parts.length, 1);
    const display = fx.effects[0].parts[0].display;
    fx.clear();
    assert.equal(fx.effects.length, 0);
    assert.equal(display.destroyed, true);
    fx.destroy();
    assert.equal(fx.play('test', texas), false);
  } finally { fake.restore(); }
});
