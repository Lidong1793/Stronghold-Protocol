// Warm the same HTTP cache used by Image, Spine, scene and Web Audio loaders. Read raw bodies only:
// decoding the whole catalogue would exceed the renderer's memory budget. Works on HTTP hosts too.
import { mediaUrl } from './media.js';

const VENDOR = ['pixi.min.js', 'pixi-spine.js', 'three.module.js', 'three.core.js'];
const RECORD_KEY = 'sp.resource-preload';

function browserStorage() { try { return globalThis.localStorage || null; } catch { return null; } }

function readRecord(storage) {
  try {
    const raw = storage?.getItem(RECORD_KEY);
    if (!raw || raw.length > 4096) return null;
    const record = JSON.parse(raw);
    if (record?.format !== 1 || !/^[a-f0-9]{16}$/.test(record.fingerprint)
      || !Number.isSafeInteger(record.total) || record.total <= 0 || record.total > 1000000
      || !Number.isSafeInteger(record.bytes) || record.bytes < 0
      || !Number.isSafeInteger(record.completedAt) || record.completedAt <= 0) return null;
    return record;
  } catch { return null; }
}

// Two independent 32-bit hashes of the complete catalogues and app version. No Web Crypto / HTTPS requirement.
function catalogueFingerprint(manifest, local, dataFiles, version) {
  const text = JSON.stringify([version, dataFiles, manifest, local]);
  let a = 2166136261, b = 2654435769;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822507);
  }
  return [a, b].map((n) => (n >>> 0).toString(16).padStart(8, '0')).join('');
}

/** Collect only same-origin manifest assets, including local scene/FX dependencies; never follow metadata URLs. */
export function resourcePlan(manifest, local, dataFiles = [], origin = 'http://localhost') {
  const urls = new Set();
  function visit(value) {
    if (typeof value === 'string') {
      if (!/^\/(?:assets|fonts)\//.test(value)) return;
      const u = new URL(value, origin);
      if (u.origin === origin && /^\/(?:assets|fonts)\//.test(u.pathname)) urls.add(u.pathname + u.search);
    } else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) visit(v);
    }
  }
  visit(manifest);
  visit(local?.groups);
  for (const name of dataFiles) if (/^[\w-]+\.json$/.test(name) && !['assets.json', 'local-assets.json'].includes(name)) urls.add(`/data/${name}`);
  for (const name of VENDOR) urls.add(`/vendor/${name}`);
  const entries = new Map();
  for (const original of urls) {
    const url = mediaUrl(original, origin);
    if (!entries.has(url)) entries.set(url, { url, fallback: url === original ? null : original });
  }
  return [...entries.values()];
}

/** Bounded downloader with a persistent completion record. A record is history, not proof against cache eviction. */
export function createResourcePreloader({ fetch: fetcher = (...args) => globalThis.fetch(...args), dataFiles = [],
  origin = globalThis.location?.origin || 'http://localhost', concurrency = 4, timeoutMs = 30000,
  retryDelayMs = 600, missingLimit = 12, storage = browserStorage(), version = '' } = {}) {
  let entries = null, task = null, controller = null, timer = null;
  let saved = readRecord(storage), fingerprint = null, checked = false;
  let status = saved ? 'saved' : 'idle', error = null, bytes = 0, persistenceFailed = false;
  const done = new Set(), failures = new Set(), listeners = new Set();
  const snapshot = () => {
    const history = saved && ['saved', 'checking'].includes(status);
    return { status, error, total: history ? saved.total : entries?.length || 0,
      completed: history ? saved.total : done.size, failed: failures.size, bytes: history ? saved.bytes : bytes,
      completedAt: saved?.completedAt || null, persistenceFailed };
  };
  function forgetRecord() {
    saved = null;
    try { storage?.removeItem(RECORD_KEY); } catch { /* storage can be disabled */ }
  }
  function saveRecord() {
    saved = { format: 1, fingerprint, total: entries.length, bytes, completedAt: Date.now() };
    try {
      if (!storage) throw new Error('Storage unavailable');
      storage.setItem(RECORD_KEY, JSON.stringify(saved)); persistenceFailed = false;
    } catch { persistenceFailed = true; }
  }
  function emit(now = false) {
    if (!now) { if (timer == null) timer = setTimeout(() => emit(true), 100); return; }
    clearTimeout(timer); timer = null;
    const state = snapshot();
    for (const fn of listeners) fn(state);
  }

  async function request(url, signal, json = false, optional = false) {
    // Per-request timeout covers the response body too, not just the headers.
    for (let attempt = 0; ; attempt++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError'); // Safari 15.0 has no throwIfAborted()
      const abort = new AbortController();
      const onAbort = () => abort.abort();
      signal.addEventListener('abort', onAbort, { once: true });
      const timeout = setTimeout(() => abort.abort(), timeoutMs);
      try {
        const res = await fetcher(url, { signal: abort.signal, cache: json ? 'no-cache' : 'default', credentials: 'same-origin', priority: 'low' });
        if (optional && res.status === 404) { await res.body?.cancel(); return null; }
        if (!res.ok || /text\/html/i.test(res.headers.get('content-type') || '')) {
          await res.body?.cancel();
          throw Object.assign(new Error('Resource unavailable'), { status: res.ok ? 404 : res.status });
        }
        if (json) return await res.json();
        let size = 0;
        if (res.body) {
          const reader = res.body.getReader();
          try {
            for (;;) {
              const part = await reader.read();
              if (part.done) break;
              size += part.value.byteLength;
            }
          } finally { reader.releaseLock(); }
        } else size = (await res.arrayBuffer()).byteLength;
        return size;
      } catch (err) {
        if (signal.aborted) throw err;
        const retry = attempt < 2 && (!err.status || err.status >= 500 || [408, 429].includes(err.status));
        if (!retry) throw err;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', onAbort);
      }
      await new Promise((resolve) => {
        const finish = () => { clearTimeout(wait); signal.removeEventListener('abort', finish); resolve(); };
        const wait = setTimeout(finish, retryDelayMs * (attempt + 1));
        signal.addEventListener('abort', finish, { once: true });
        if (signal.aborted) finish();
      });
    }
  }

  async function prepare(signal) {
    const manifest = await request('/data/assets.json', signal, true);
    if (!manifest || typeof manifest !== 'object' || !manifest.stats?.files) throw new Error('No asset manifest');
    const local = await request('/data/local-assets.json', signal, true, true);
    const nextFingerprint = catalogueFingerprint(manifest, local, dataFiles, version);
    if (saved && saved.fingerprint !== nextFingerprint) forgetRecord();
    fingerprint = nextFingerprint;
    entries = resourcePlan(manifest, local, dataFiles, origin);
    checked = true;
  }

  async function restore(signal) {
    try {
      await prepare(signal);
      if (signal.aborted) return;
      checked = true;
      status = saved ? 'saved' : 'outdated';
    } catch {
      // Offline / unavailable catalogue: retain the explicitly labelled historical record, never claim cache checks.
      status = saved ? 'saved' : 'idle';
    } finally {
      if (signal.aborted) { checked = false; status = saved ? 'saved' : 'idle'; }
      controller = null; task = null; emit(true);
    }
  }

  async function run(signal) {
    try {
      if (!entries) await prepare(signal);
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      status = 'running'; emit(true);
      const pending = entries.filter((entry) => !done.has(entry.url));
      let cursor = 0, missing = 0;
      async function worker() {
        while (!signal.aborted && cursor < pending.length) {
          const entry = pending[cursor++];
          try {
            let size;
            try { size = await request(entry.url, signal); }
            catch (err) {
              if (!entry.fallback || signal.aborted || err.status !== 404) throw err;
              size = await request(entry.fallback, signal);
            }
            if (signal.aborted) return;
            done.add(entry.url); bytes += size; missing = 0;
          } catch (err) {
            if (signal.aborted) return;
            failures.add(entry.url);
            if (err.status === 404 && ++missing >= missingLimit) {
              // A source/lite install may have a manifest but no art. Avoid thousands of doomed requests.
              error = 'unavailable'; controller.abort(); return;
            }
          }
          emit();
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, Math.min(8, concurrency)) }, worker));
      if (signal.aborted && !error) status = 'paused';
      else status = error || failures.size ? 'error' : 'done';
      if (status === 'done') saveRecord();
      else if (status === 'error') forgetRecord();
    } catch {
      if (signal.aborted) status = 'paused';
      else { status = 'error'; error = 'manifest'; }
    } finally {
      controller = null; task = null; emit(true);
    }
  }

  return {
    getState: snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    restore() {
      if (!saved || checked) return Promise.resolve();
      if (task) return task;
      status = 'checking'; controller = new AbortController();
      task = restore(controller.signal); emit(true);
      return task;
    },
    start() {
      if (task) return task;
      // A persisted record cannot prove that HTTP cache entries still exist. An explicit recheck reads every URL
      // through normal HTTP caching, retrieving only resources the browser no longer has (or must revalidate).
      if (['saved', 'done'].includes(status)) { entries = null; done.clear(); bytes = 0; }
      error = null; failures.clear();
      status = entries ? 'running' : 'preparing';
      controller = new AbortController();
      task = run(controller.signal);
      emit(true);
      return task;
    },
    pause() { if (controller && !controller.signal.aborted) { controller.abort(); status = 'pausing'; emit(true); } },
  };
}
