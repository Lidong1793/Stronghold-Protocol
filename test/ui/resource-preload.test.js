import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createResourcePreloader, resourcePlan } from '../../public/js/resourcePreload.js';
import { rewriteManifest } from '../../server/http/assetViews.js';

const manifest = (paths) => ({ stats: { files: paths.length }, files: paths });
const ok = () => new Response(new Uint8Array([1, 2, 3]));

test('v0.2.6 served manifests retain model/file hashes and rewrite hashed audio to the playback URL', () => {
  const index = { hashOf: () => '1111111111111111', modelHash: () => '2222222222222222' };
  const source = { stats: { files: 4 }, model: { skel: '/assets/spine/a.skel', atlas: '/assets/spine/a.atlas', textures: ['/assets/spine/a.png'] }, audio: '/assets/audio/bgm/a.mp3' };
  const served = rewriteManifest(source, 'assets.json', index).doc;
  const local = rewriteManifest({ groups: { 'fx/texas': { pack: { path: '/assets/local/fx/texas/pack.json' } } } }, 'local-assets.json', index).doc;
  const plan = resourcePlan(served, local);
  assert.ok(plan.some(e => e.url === '/assets/~2222222222222222/spine/a.skel'));
  assert.ok(plan.some(e => e.url === '/assets/~2222222222222222/spine/a.atlas'));
  assert.ok(plan.some(e => e.url === '/assets/~2222222222222222/spine/a.png'));
  assert.ok(plan.some(e => e.url === '/assets/~1111111111111111/local/fx/texas/pack.json'));
  assert.deepEqual(plan.find(e => e.url.startsWith('/media/')), { url: '/media/~1111111111111111/bgm/a', fallback: '/assets/~1111111111111111/audio/bgm/a.mp3' });
  assert.ok(plan.filter(e => e.url.startsWith('/assets/')).every(e => e.url.startsWith('/assets/~')));
});
function fixture(paths, handler, options = {}) {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push(url);
    assert.equal(opts.cache, url.startsWith('/data/') && ['assets.json', 'local-assets.json'].includes(url.split('/').pop()) ? 'no-cache' : 'default');
    if (url === '/data/assets.json') return Response.json(manifest(paths));
    if (url === '/data/local-assets.json') return new Response(null, { status: 404 });
    return handler?.(url, opts) || ok();
  };
  return { calls, loader: createResourcePreloader({ fetch, retryDelayMs: 0, ...options }) };
}

test('resource plan includes nested Spine, local scene/FX, fonts and data without external or traversal URLs', () => {
  const plan = resourcePlan({
    spine: { skel: '/assets/model.skel', atlas: '/assets/model.atlas', textures: ['/assets/model.png'] },
    duplicate: '/assets/model.png', audio: ['/assets/audio/bgm/a.mp3', '/assets/audio/bgm/a.ogg'],
    fonts: '/fonts/bender.woff2', unrelated: ['https://evil.test/assets/a.png', '//evil.test/assets/b.png',
      '/assets/../../server/index.js', '/assets/..\\..\\server/index.js', '/api/rooms'],
  }, { groups: { scene: { path: '/assets/local/scene/scene.bin' }, fx: { path: '/assets/local/fx/pack.json' } } },
  ['chess.json', 'assets.json', 'local-assets.json', '../server.json']);
  const urls = plan.map((p) => p.url);
  assert.equal(urls.filter((url) => url === '/assets/model.png').length, 1);
  for (const url of ['/assets/model.skel', '/assets/model.atlas', '/assets/local/scene/scene.bin',
    '/assets/local/fx/pack.json', '/fonts/bender.woff2', '/data/chess.json', '/vendor/three.core.js']) assert.ok(urls.includes(url), url);
  assert.deepEqual(plan.find((p) => p.url.startsWith('/media')), { url: '/media/bgm/a', fallback: '/assets/audio/bgm/a.mp3' });
  assert.equal(plan.filter((p) => p.url === '/media/bgm/a').length, 1);
  assert.ok(urls.every((url) => /^\/(assets|fonts|data|vendor|media)\//.test(url)));
  assert.ok(!urls.some((url) => /evil|server|local-assets/.test(url)));
});

test('bounded workers consume complete bodies; missing optional local manifest is harmless', async () => {
  let active = 0, peak = 0;
  const { loader } = fixture(['/assets/a', '/assets/b', '/assets/c'], async () => {
    active++; peak = Math.max(peak, active);
    return new Response(new ReadableStream({ start(c) {
      setTimeout(() => { c.enqueue(new Uint8Array(7)); active--; c.close(); }, 2);
    } }));
  }, { concurrency: 2 });
  await loader.start();
  assert.equal(peak, 2);
  const s = loader.getState();
  assert.equal(s.status, 'done'); assert.equal(s.completed, 7); assert.equal(s.bytes, 49); assert.equal(active, 0);
});

test('pause aborts in-flight work; resume skips successful files, including duplicate start calls', async () => {
  let notify;
  const reached = new Promise((resolve) => { notify = resolve; });
  let block = true;
  const { loader, calls } = fixture(['/assets/a', '/assets/b'], async (url, { signal }) => {
    if (url !== '/assets/b' || !block) return ok();
    notify();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  }, { concurrency: 1 });
  const first = loader.start();
  assert.equal(loader.start(), first);
  await reached;
  loader.pause(); await first;
  assert.equal(loader.getState().status, 'paused'); assert.equal(loader.getState().completed, 1);
  block = false; await loader.start();
  assert.equal(loader.getState().status, 'done');
  assert.equal(calls.filter((url) => url === '/assets/a').length, 1);
  assert.equal(calls.filter((url) => url === '/assets/b').length, 2);
});

test('retry only failures; HTTP 404 is not retried automatically and partial success is not completion', async () => {
  let broken = true;
  const { loader, calls } = fixture(['/assets/a', '/assets/b'], (url) => url === '/assets/b' && broken ? new Response(null, { status: 404 }) : ok());
  await loader.start();
  assert.equal(loader.getState().status, 'error'); assert.equal(loader.getState().failed, 1);
  assert.equal(calls.filter((url) => url === '/assets/b').length, 1);
  broken = false; await loader.start();
  assert.equal(loader.getState().status, 'done'); assert.equal(loader.getState().failed, 0);
  assert.equal(calls.filter((url) => url === '/assets/a').length, 1);
});

test('transient failures retry with a bound; a missing catalogue stops early', async () => {
  const transient = fixture(['/assets/a'], (url) => url === '/assets/a' ? new Response(null, { status: 503 }) : ok());
  await transient.loader.start();
  assert.equal(transient.loader.getState().failed, 1);
  assert.equal(transient.calls.filter((url) => url === '/assets/a').length, 3);
  const absent = fixture(Array.from({ length: 100 }, (_, i) => `/assets/${i}.png`), () => new Response(null, { status: 404 }), { concurrency: 1, missingLimit: 3 });
  await absent.loader.start();
  assert.equal(absent.loader.getState().error, 'unavailable');
  assert.equal(absent.loader.getState().completed, 0);
  assert.equal(absent.calls.length, 5); // 2 manifests, 3 missing files
});

test('static hosts fall back from extensionless audio when they return HTML', async () => {
  const { loader, calls } = fixture(['/assets/audio/bgm/a.mp3'], (url) => url === '/media/bgm/a'
    ? new Response('<html>SPA</html>', { headers: { 'Content-Type': 'text/html' } }) : ok());
  await loader.start();
  assert.equal(loader.getState().status, 'done');
  assert.ok(calls.includes('/media/bgm/a')); assert.ok(calls.includes('/assets/audio/bgm/a.mp3'));
});

test('manifest error can be retried and cannot report successful completion', async () => {
  let broken = true;
  const loader = createResourcePreloader({ fetch: async (url) => url === '/data/assets.json'
    ? Response.json(broken ? {} : manifest(['/assets/a'])) : url === '/data/local-assets.json' ? new Response(null, { status: 404 }) : ok() });
  await loader.start(); assert.equal(loader.getState().error, 'manifest'); assert.equal(loader.getState().completed, 0);
  broken = false; await loader.start(); assert.equal(loader.getState().status, 'done');
});

test('timeout covers a stalled body and retries only twice', async () => {
  const { loader, calls } = fixture(['/assets/a'], (url, { signal }) => url === '/assets/a'
    ? new Response(new ReadableStream({ start(c) { signal.addEventListener('abort', () => c.error(new DOMException('Aborted', 'AbortError')), { once: true }); } })) : ok(),
  { timeoutMs: 5 });
  await loader.start();
  assert.equal(loader.getState().status, 'error');
  assert.equal(calls.filter((url) => url === '/assets/a').length, 3);
});

function memoryStorage() {
  const records = new Map();
  return { getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value), removeItem: (key) => records.delete(key) };
}

test('closing and reopening restores completion; catalogue verification does not download art again', async () => {
  const storage = memoryStorage();
  const first = fixture(['/assets/a'], null, { storage, version: '0.2.5' });
  await first.loader.start();
  const complete = first.loader.getState();
  assert.equal(complete.status, 'done'); assert.equal(complete.persistenceFailed, false);
  assert.ok(storage.getItem('sp.resource-preload').length < 512);
  const reopened = fixture(['/assets/a'], null, { storage, version: '0.2.5' });
  assert.equal(reopened.loader.getState().status, 'saved');
  assert.equal(reopened.loader.getState().completed, complete.completed);
  await reopened.loader.restore();
  const restored = reopened.loader.getState();
  assert.equal(restored.status, 'saved'); assert.equal(restored.bytes, complete.bytes);
  assert.deepEqual(reopened.calls, ['/data/assets.json', '/data/local-assets.json']);
  await reopened.loader.restore();
  assert.equal(reopened.calls.length, 2); // no repeated checks on title remount
});

test('catalogue content changes invalidate completion even with the same resource count', async () => {
  const storage = memoryStorage();
  await fixture(['/assets/a'], null, { storage }).loader.start();
  const updated = fixture(['/assets/b'], null, { storage });
  await updated.loader.restore();
  assert.equal(updated.loader.getState().status, 'outdated');
  assert.equal(updated.loader.getState().completed, 0);
  assert.equal(storage.getItem('sp.resource-preload'), null);
});

test('an app version change or local scene/FX manifest change invalidates the old completion record', async () => {
  const storage = memoryStorage();
  await fixture(['/assets/a'], null, { storage, version: '0.2.5' }).loader.start();
  const updated = fixture(['/assets/a'], null, { storage, version: '0.2.6' });
  await updated.loader.restore(); assert.equal(updated.loader.getState().status, 'outdated');
  await fixture(['/assets/a'], null, { storage, version: '0.2.5' }).loader.start();
  const localChange = createResourcePreloader({ storage, version: '0.2.5', fetch: async (url) =>
    Response.json(url === '/data/assets.json' ? manifest(['/assets/a']) : { groups: { fx: { path: '/assets/local/fx/pack.json' } } }) });
  await localChange.restore(); assert.equal(localChange.getState().status, 'outdated');
});

test('explicit check refetches every URL through HTTP cache rather than trusting a historical completion', async () => {
  const storage = memoryStorage();
  await fixture(['/assets/a'], null, { storage }).loader.start();
  const reopened = fixture(['/assets/a'], null, { storage });
  await reopened.loader.restore(); await reopened.loader.start();
  assert.equal(reopened.loader.getState().status, 'done');
  assert.ok(reopened.calls.includes('/assets/a'));
  assert.ok(reopened.calls.includes('/vendor/pixi.min.js'));
  assert.equal(reopened.loader.getState().completed, reopened.loader.getState().total);
});

test('failed recheck clears completion and cannot preserve a misleading full-preload record', async () => {
  const storage = memoryStorage();
  await fixture(['/assets/a'], null, { storage }).loader.start();
  const reopened = fixture(['/assets/a'], (url) => url === '/assets/a' ? new Response(null, { status: 404 }) : ok(), { storage });
  await reopened.loader.start();
  assert.equal(reopened.loader.getState().status, 'error');
  assert.equal(storage.getItem('sp.resource-preload'), null);
});

test('unavailable storage and malformed records do not prevent resource downloads', async () => {
  const storage = memoryStorage(); storage.setItem('sp.resource-preload', '{broken');
  const malformed = fixture(['/assets/a'], null, { storage });
  assert.equal(malformed.loader.getState().status, 'idle');
  const denied = fixture(['/assets/a'], null, { storage: { getItem() { throw new Error('Denied'); }, setItem() { throw new Error('Quota exceeded'); } } });
  await denied.loader.start();
  assert.equal(denied.loader.getState().status, 'done'); assert.equal(denied.loader.getState().persistenceFailed, true);
});

test('a cancelled version check keeps historical completion and can run again', async () => {
  const storage = memoryStorage();
  await fixture(['/assets/a'], null, { storage }).loader.start();
  let notify, block = true;
  const reached = new Promise((resolve) => { notify = resolve; });
  const loader = createResourcePreloader({ storage, fetch: async (url, { signal }) => {
    if (url === '/data/assets.json' && block) {
      notify(); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    }
    return url === '/data/assets.json' ? Response.json(manifest(['/assets/a'])) : new Response(null, { status: 404 });
  } });
  const pending = loader.restore(); await reached; loader.pause(); await pending;
  assert.equal(loader.getState().status, 'saved');
  block = false; await loader.restore(); assert.equal(loader.getState().status, 'saved');
});
