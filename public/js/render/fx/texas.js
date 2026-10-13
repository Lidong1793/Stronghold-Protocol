// Optional original Texas FX, exported by tools/local-extract/texas_fx.py. Visuals only; no sim imports or writes.
// Supports her two Torappu particle shaders, meshes, streamed Transform animation, bursts and lifetime curves.
// TrailRenderer and depth-buffer intersections are not reproduced; unavailable art keeps the existing FX.

import { UNIT } from '../style.js';

const ROOT = '/assets/local/fx/texas/';
const MAX_PARTS = 320, MAX_EFFECTS = 32;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const xyz = (v, fallback = 0) => [v?.x ?? fallback, v?.y ?? fallback, v?.z ?? fallback];
const mul = (a, b) => a.map((v, i) => v * b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const heading = (src, tgt) => tgt ? Math.atan2(tgt.y - src.y, tgt.x - src.x) : src.facing < 0 ? Math.PI : 0;

/** Follow the rendered attack clip, including its wind-up compression and attack-speed changes. */
export function attackClock(view, until = 0) {
  const actor = view?.actor, entry = actor?.spine?.state?.tracks?.[0];
  const clip = actor?.roles?.attack?.loop;
  if (!entry || !clip || (entry.animation?.name || actor.current) !== clip) return null;
  const duration = actor.dur(clip), hit = actor.entry?.hits?.[clip]?.[0] ?? duration / 2;
  const rate = Math.max(0.001, entry.timeScale || 1);
  // v0.2.5 plays one clip per attack. Its recovery must never be mistaken for a future loop cycle.
  const start = entry.loop === false ? 0 : Math.round((entry.trackTime + Math.max(0, until) * rate - hit) / duration) * duration || 0;
  return { view, entry, clip, start, age: entry.trackTime - start, rate };
}

/** Ground FX are authored in Unity's XY floor plane, with negative Z pointing up. */
export function groundPoint(origin, point) {
  return [origin.x + point[0], origin.y + point[1], origin.z - point[2]];
}

export const isTexas = (view) => !!view && !view.isEnemy &&
  [view.info?.spine, view.info?.defId].some(id => id === 'char_102_texas' || /^chess_char_1_08(?:_[ab])?$/.test(id || ''));

function hermite(keys, t, fallback = 1) {
  if (!keys?.length) return fallback;
  if (t <= keys[0].time) return keys[0].value;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t > b.time) continue;
    const span = b.time - a.time, u = span > 0 ? (t - a.time) / span : 1, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a.value + (u3 - 2 * u2 + u) * span * (a.outSlope || 0)
      + (-2 * u3 + 3 * u2) * b.value + (u3 - u2) * span * (b.inSlope || 0);
  }
  return keys[keys.length - 1].value;
}

/** Unity MinMaxCurve: constant, curve, two curves, two constants. A stable random value belongs to each particle. */
export function curveValue(curve, time = 0, random = 0.5, fallback = 0) {
  if (!curve) return fallback;
  const high = curve.scalar ?? fallback, low = curve.minScalar ?? high;
  if (curve.minMaxState === 1) return high * hermite(curve.maxCurve?.m_Curve, time);
  if (curve.minMaxState === 2) return lerp(low * hermite(curve.minCurve?.m_Curve, time), high * hermite(curve.maxCurve?.m_Curve, time), random);
  if (curve.minMaxState === 3) return lerp(low, high, random);
  return high;
}

const rgba = c => [c?.r ?? 1, c?.g ?? 1, c?.b ?? 1, c?.a ?? 1];
function sampleGradient(gradient, t) {
  if (!gradient) return [1, 1, 1, 1];
  const channel = (prefix, count, index) => {
    const keys = Array.from({ length: count }, (_, i) => [gradient[`${prefix}${i}`] / 65535, rgba(gradient[`key${i}`])[index]]);
    if (!keys.length) return 1;
    for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      return lerp(a[1], b[1], clamp((t - a[0]) / (b[0] - a[0] || 1)));
    }
    return keys[keys.length - 1][1];
  };
  return [0, 1, 2].map(i => channel('ctime', gradient.m_NumColorKeys, i)).concat(channel('atime', gradient.m_NumAlphaKeys, 3));
}
export function gradientValue(value, t, random = 0.5) {
  if (!value) return [1, 1, 1, 1];
  if (value.minMaxState === 1) return sampleGradient(value.maxGradient, t);
  if (value.minMaxState === 2) return rgba(value.minColor).map((v, i) => lerp(v, rgba(value.maxColor)[i], random));
  if (value.minMaxState === 3) return sampleGradient(value.minGradient, t).map((v, i) => lerp(v, sampleGradient(value.maxGradient, t)[i], random));
  return rgba(value.maxColor);
}

function rotate(v, q) {
  const [x, y, z] = v, { x: a = 0, y: b = 0, z: c = 0, w = 1 } = q || {};
  const tx = 2 * (b * z - c * y), ty = 2 * (c * x - a * z), tz = 2 * (a * y - b * x);
  return [x + w * tx + b * tz - c * ty, y + w * ty + c * tx - a * tz, z + w * tz + a * ty - b * tx];
}
function euler(v, angles) {
  let [x, y, z] = v;
  for (const axis of [2, 0, 1]) {
    const c = Math.cos(angles[axis]), s = Math.sin(angles[axis]);
    if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
    if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
    if (axis === 2) [x, y] = [x * c - y * s, x * s + y * c];
  }
  return [x, y, z];
}

export function nodePoses(effect, time) {
  const poses = effect.nodes.map(n => ({ ...n, position: xyz(n.position), scale: xyz(n.scale, 1), euler: null }));
  for (const track of effect.tracks) {
    const keys = track.keys;
    let i = 0;
    while (i + 1 < keys.length && keys[i + 1][0] <= time) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)], t = clamp((time - a[0]) / (b[0] - a[0] || 1));
    const value = a.slice(1).map((v, k) => lerp(v, b[k + 1], t));
    if (track.property === 'tint') { poses[track.node].tint ||= [1, 1, 1, 1]; poses[track.node].tint[track.channel] = value[0]; }
    else if (track.property === 'rotation') poses[track.node].rotation = { x: value[0], y: value[1], z: value[2], w: value[3] };
    else poses[track.node][track.property] = track.property === 'euler' ? value.map(v => v * Math.PI / 180) : value;
  }
  return poses;
}
export function transformPoint(point, node, poses) {
  let p = point;
  for (let i = node; i >= 0; i = poses[i].parent) {
    const n = poses[i];
    p = add(n.euler ? euler(mul(p, n.scale), n.euler) : rotate(mul(p, n.scale), n.rotation), n.position);
  }
  return p;
}

let sharedArt;
/** Use the served local manifest's content hashes, matching resource preload and the other v0.2.6 loaders. */
export async function loadTexasArt(P, assets, fetcher = (...args) => globalThis.fetch(...args)) {
  await assets?.local?.();
  const url = (key, file) => assets?.localUrl?.('fx/texas', key) || ROOT + file;
  const response = await fetcher(url('pack', 'pack.json'), { cache: 'default' });
  if (!response.ok) return null;
  const pack = await response.json();
  if (pack.format !== 1 || pack.operator !== 'char_102_texas' || !pack.effects?.skill_01_range) return null;
  const entries = await Promise.all(Object.entries(pack.textures).map(async ([name, file]) => {
    if (!/^[A-Za-z0-9_-]+\.png$/.test(file)) throw new Error('Invalid FX texture');
    return [name, await P.Assets.load(url(file.slice(0, -4), file))];
  }));
  return { pack, textures: Object.fromEntries(entries) };
}
async function loadArt(P, assets) {
  if (!sharedArt) sharedArt = loadTexasArt(P, assets).catch(() => null);
  return sharedArt;
}

export class TexasFx {
  constructor(ctx) {
    this.ctx = ctx; this.P = ctx.P; this.effects = []; this.prepared = new Map(); this.planned = new WeakSet(); this.art = null; this.status = 'missing'; this.disposed = false;
    // Existing Node/fake-PIXI suites and installs without optional art must keep their original rendering path.
    if (typeof window !== 'undefined' && this.P.SimpleMesh && this.P.Assets) {
      this.status = 'loading';
      loadArt(this.P, ctx.assets).then(art => { if (!this.disposed) { this.art = art; this.status = art ? 'ready' : 'missing'; } });
    }
  }

  play(name, view, options = {}) {
    const data = this.art?.pack.effects[name];
    if (!data || this.disposed) return false;
    if (this.effects.length >= MAX_EFFECTS) this.remove(this.effects.shift());
    const effect = { data, view: options.follow ? view : null, x: view.x, y: view.y, z: (view.z || 0) + (options.height || 0),
      angle: options.angle || 0, space: options.space || 'world', clock: options.clock || null, rate: options.clock?.rate || 1, mount: options.mount || null,
      age: -(options.delay || 0), parts: [], emit: data.emitters.map(() => ({ rate: 0, bursts: new Set() })) };
    this.effects.push(effect);
    if (options.age) {
      try {
        let remaining = Math.min(2, options.age);
        while (remaining > 1e-8) { const dt = Math.min(remaining, 1 / 120); this.step(effect, dt); remaining -= dt; }
      }
      catch { this.clear(); this.art = null; this.status = 'error'; return false; }
    }
    return true;
  }

  windUp(src, until, _tgt, token) {
    if (!isTexas(src) || !this.art || token && this.planned.has(token)) return;
    const clock = attackClock(src, until);
    if (src.actor && !clock) return; // a casting/stunned pose is not a normal sword swing
    if (clock && clock.age < -1e-6) return; // the upcoming attack belongs to a later animation cycle
    const lead = 0.3;
    if (!clock && until > lead) return;
    this.play('attack_01_start', src, { follow: true, space: 'billboard', clock,
      age: clock ? Math.max(0, clock.age) : Math.max(0, lead - until), mount: src });
    if (token) this.planned.add(token);
    this.prepared.set(src.id, Math.max(0.7, until + 0.25));
  }
  attack(src, _tgt, kind) {
    if (!isTexas(src) || kind && kind !== 'none' || !this.art) return false;
    if (src.actor && !attackClock(src)) return false;
    if (!this.prepared.has(src.id)) {
      const clock = attackClock(src);
      this.play('attack_01_start', src, { follow: true, space: 'billboard', clock, mount: src, age: clock ? Math.max(0, clock.age) : 0.3 });
    }
    this.prepared.delete(src.id);
    return true;
  }
  hit(target, src) {
    if (!isTexas(src) || !this.art) return false;
    if (src.actor && !attackClock(src)) return false;
    return this.play('attack_01_hit', target, { height: 0.5, angle: heading(src, target) });
  }
  swordRain(kind, x, y, extra) {
    if (kind !== 'aoe' || extra?.skill !== 'swordRain' || !this.art) return false;
    const src = this.ctx.view?.(extra.id);
    if (!isTexas(src)) return false;
    this.play('skill_01_start', src, { follow: true });
    this.play('skill_01_range', src, { follow: true, space: 'ground' });
    // [ASSUMED] Boundary positions use interpolated views; the grid is the game's own. Damage/stun stay in the sim.
    const grid = this.ctx.skillGrid?.(src) || [];
    for (const target of this.ctx.units?.() || []) if (target.isEnemy && target.alive && !target.destroyed &&
      grid.some(([dr, dc]) => dr === Math.round(target.y - y) && dc === Math.round(target.x - x))) {
      this.play('skill_01_hit', target, { height: 0.35 });
    }
    return true;
  }

  spawn(effect, emitter, time) {
    const cap = this.ctx.settings?.quality === 'low' ? 80 : this.ctx.settings?.quality === 'medium' ? 160 : MAX_PARTS;
    if (this.effects.reduce((n, e) => n + e.parts.length, 0) >= cap) return;
    const P = this.P, m = emitter.modules, init = m.InitialModule, random = Math.random();
    const value = (c, fallback = 0) => curveValue(c, 0, random, fallback);
    const texture = this.art.textures[emitter.material.texture], mesh = this.art.pack.meshes[emitter.mesh];
    const display = mesh ? new P.SimpleMesh(texture, new Float32Array(mesh.vertices.length * 2), new Float32Array(mesh.uvs.flatMap(v => [v[0], 1 - v[1]])), new Uint16Array(mesh.triangles.flat()), P.DRAW_MODES.TRIANGLES) : new P.Sprite(texture);
    if (!mesh) display.anchor.set(0.5);
    display.blendMode = /Additive/.test(emitter.material.shader) ? P.BLEND_MODES.ADD : P.BLEND_MODES.NORMAL;
    const name = effect.data.nodes[emitter.node].name;
    const layer = /^(dimian|fanwei)/.test(name) ? this.ctx.layers.groundFx : this.ctx.layers.fxNormal;
    layer.addChild(display);
    const shape = m.ShapeModule, pos = [0, 0, 0];
    const theta = Math.random() * Math.PI * 2, r = (shape?.radius?.value || 0) * Math.sqrt(Math.random());
    let direction = [0, 0, 1];
    if (shape) {
      if (shape.type === 5) { for (let i = 0; i < 3; i++) pos[i] = (Math.random() - 0.5) * xyz(shape.m_Scale, 1)[i]; }
      else { pos[0] = Math.cos(theta) * r; pos[1] = Math.sin(theta) * r; }
      if (shape.type === 0) { const z = random * 2 - 1; direction = [Math.cos(theta) * Math.sqrt(1 - z * z), Math.sin(theta) * Math.sqrt(1 - z * z), z]; }
      if (shape.type === 4) { const a = (shape.angle || 0) * Math.PI / 180; direction = [Math.cos(theta) * Math.sin(a), Math.sin(theta) * Math.sin(a), Math.cos(a)]; }
      const angles = xyz(shape.m_Rotation).map(v => v * Math.PI / 180);
      direction = euler(direction, angles);
      const p = add(euler(pos, angles), xyz(shape.m_Position)); pos.splice(0, 3, ...p);
    }
    const size = value(init.startSize, 1);
    effect.parts.push({ emitter, display, mesh, birth: time, age: 0, life: Math.max(0.01, value(init.startLifetime, 0.3)), random, pos,
      velocity: direction.map(v => v * value(init.startSpeed)), color: gradientValue(init.startColor, 0, random),
      size: init.size3D ? [size, value(init.startSizeY, size), value(init.startSizeZ, size)] : [size, size, size],
      rotation: init.rotation3D ? [value(init.startRotationX), value(init.startRotationY), value(init.startRotation)] : [0, 0, value(init.startRotation)] });
  }

  project(effect, point, out) {
    if (effect.space === 'ground') return this.ctx.cam().project(...groundPoint(effect, point), out);
    if (effect.space === 'billboard') {
      const p = this.ctx.cam().project(effect.x, effect.y, effect.z);
      const matrix = effect.mountMatrix;
      out ||= { x: 0, y: 0, s: 0, depth: 0 };
      if (matrix) {
        const x = point[0] / UNIT.modelScale, y = -point[1] / UNIT.modelScale;
        out.x = matrix.a * x + matrix.c * y + matrix.tx;
        out.y = matrix.b * x + matrix.d * y + matrix.ty;
        out.s = Math.hypot(matrix.a, matrix.b) / UNIT.modelScale;
      } else {
        const flip = effect.view?.facing < 0 ? -1 : 1;
        out.x = p.x + point[0] * p.s * flip; out.y = p.y - point[1] * p.s; out.s = p.s;
      }
      out.depth = p.depth;
      return out;
    }
    const c = Math.cos(effect.angle), s = Math.sin(effect.angle), [x, y, z] = point;
    return this.ctx.cam().project(effect.x + x * c + z * s, effect.y - (-x * s + z * c), effect.z + y, out);
  }

  step(effect, dt) {
    const old = effect.age; effect.age += dt;
    if (effect.age < 0) return;
    const time = effect.age, poses = nodePoses(effect.data, time);
    if (effect.view && !effect.view.destroyed) { effect.x = effect.view.x; effect.y = effect.view.y; effect.z = (effect.view.z || 0) + (effect.space === 'ground' ? 0 : effect.view.hover || 0); }
    if (effect.space === 'billboard') {
      const spine = effect.mount?.actor?.spine;
      if (spine?.getGlobalPosition) { spine.getGlobalPosition(); effect.mountMatrix = spine.worldTransform; }
    }
    for (let i = 0; i < effect.data.emitters.length; i++) {
      const emitter = effect.data.emitters[i], state = effect.emit[i], delay = curveValue(emitter.delay), clock = time - delay;
      if (clock < 0) continue;
      const emission = emitter.modules.EmissionModule;
      for (const [index, burst] of (emission.m_Bursts || []).entries()) if (!state.bursts.has(index) && clock >= burst.time) {
        state.bursts.add(index);
        const count = Math.min(64, Math.round(curveValue(burst.countCurve, 0, Math.random())));
        for (let k = 0; k < count; k++) this.spawn(effect, emitter, Math.max(old, delay + burst.time));
      }
      if (clock < emitter.duration) {
        state.rate += curveValue(emission.rateOverTime, clock / emitter.duration) * Math.max(0, time - Math.max(old, delay));
        let count = Math.min(32, Math.floor(state.rate)); state.rate -= count;
        while (count-- > 0) this.spawn(effect, emitter, time);
      }
    }
    const keep = [];
    for (const part of effect.parts) {
      const { emitter, display, random } = part, m = emitter.modules;
      part.age = time - part.birth;
      if (part.age >= part.life) { display.destroy({ texture: false, baseTexture: false }); continue; }
      const t = clamp(part.age / part.life), elapsed = Math.min(dt, Math.max(0, part.age));
      for (let axis = 0; axis < 3; axis++) {
        const key = ['x', 'y', 'z'][axis];
        const extra = m.VelocityModule ? curveValue(m.VelocityModule[key], t, random) : 0;
        part.pos[axis] += (part.velocity[axis] + extra) * elapsed;
        if (m.RotationModule) {
          const curve = m.RotationModule.separateAxes ? axis === 2 ? m.RotationModule.curve : m.RotationModule[key] : axis === 2 ? m.RotationModule.curve : null;
          const previous = Math.max(0, part.age - elapsed) / part.life;
          part.rotation[axis] += (curveValue(curve, previous, random) + curveValue(curve, t, random)) * 0.5 * elapsed;
        }
      }
      if (m.ClampVelocityModule) { const damp = m.ClampVelocityModule.dampen || 0; part.velocity = part.velocity.map(v => v * Math.exp(-damp * 30 * elapsed)); }
      const factor = m.SizeModule ? (m.SizeModule.separateAxes ? [m.SizeModule.curve, m.SizeModule.y, m.SizeModule.z].map(c => curveValue(c, t, random, 1)) : Array(3).fill(curveValue(m.SizeModule.curve, t, random, 1))) : [1, 1, 1];
      const size = mul(part.size, factor);
      const color = mul(mul(part.color, m.ColorModule ? gradientValue(m.ColorModule.gradient, t, random) : [1, 1, 1, 1]), poses[emitter.node].tint || rgba(emitter.material.color));
      display.tint = (Math.round(clamp(color[0]) * 255) << 16) | (Math.round(clamp(color[1]) * 255) << 8) | Math.round(clamp(color[2]) * 255);
      display.alpha = clamp(color[3]);
      if (part.mesh) {
        const verts = display.vertices;
        for (let i = 0; i < part.mesh.vertices.length; i++) {
          const local = add(euler(mul(part.mesh.vertices[i], size), part.rotation), part.pos);
          const p = this.project(effect, transformPoint(local, emitter.node, poses));
          verts[i * 2] = p.x; verts[i * 2 + 1] = p.y;
        }
      } else {
        const p = this.project(effect, transformPoint(part.pos, emitter.node, poses));
        display.position.set(p.x, p.y); display.width = Math.abs(size[0] * p.s); display.height = Math.abs(size[1] * p.s); display.rotation = -part.rotation[2];
        if (emitter.renderMode === 1) { display.height *= Math.max(1, Math.abs(curveValue(m.InitialModule.startSpeed)) * emitter.velocityScale + emitter.lengthScale); }
      }
      keep.push(part);
    }
    effect.parts = keep;
  }

  update(dt) {
    if (!this.art || this.disposed) return;
    const speed = Math.max(0, this.ctx.timeScale?.() ?? 1);
    for (const [id, left] of this.prepared) { if (left <= dt * speed) this.prepared.delete(id); else this.prepared.set(id, left - dt * speed); }
    try {
      const keep = [];
      for (const effect of this.effects) {
        let advance = dt * speed * effect.rate;
        const clock = effect.clock;
        if (clock) {
          const entry = clock.view.actor?.spine?.state?.tracks?.[0];
          if (entry === clock.entry && (entry.animation?.name || clock.view.actor.current) === clock.clip) {
            advance = Math.max(0, entry.trackTime - clock.start - effect.age);
            clock.rate = entry.timeScale || clock.rate;
            effect.rate = clock.rate;
          } else { effect.clock = null; }
        }
        if (advance >= 5) { this.remove(effect); continue; } // a hidden-tab stall has outlived these one-shot prefabs
        // Bound catch-up steps so a stalled/late frame still follows the native angular and velocity curves.
        if (advance <= 1e-8) this.step(effect, 0); // paused poses still need camera/attachment reprojection
        while (advance > 1e-8) { const chunk = Math.min(advance, 1 / 120); this.step(effect, chunk); advance -= chunk; }
        if (effect.age < 5 || effect.parts.length) keep.push(effect); else this.remove(effect);
      }
      this.effects = keep;
    } catch { this.clear(); this.art = null; this.status = 'error'; } // optional art must never stop battle rendering
  }
  remove(effect) { for (const p of effect.parts) p.display.destroy({ texture: false, baseTexture: false }); effect.parts.length = 0; }
  clear() { for (const effect of this.effects) this.remove(effect); this.effects.length = 0; this.prepared.clear(); this.planned = new WeakSet(); }
  destroy() { this.disposed = true; this.clear(); }
}
