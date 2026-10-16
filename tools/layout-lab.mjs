#!/usr/bin/env node
// Local annotation server, explicitly bound to loopback. No live-game or AI mutations.
import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeCorpus, validateAnnotation, describeLayout } from './layout-lab/model.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function startLayoutLab({ port = 3217, storage = resolve(root, 'local/layout-training') } = {}) {
  const data = Object.fromEntries(await Promise.all(['config', 'stages', 'chess'].map(async name => [name, JSON.parse(await readFile(resolve(root, `data/${name}.json`), 'utf8'))])));
  const corpus = makeCorpus(data);
  const folder = resolve(storage, corpus.fingerprint), savePath = resolve(folder, 'annotations.json');
  await mkdir(folder, { recursive: true });
  await writeFile(resolve(folder, 'examples.json'), JSON.stringify(corpus, null, 2));
  let annotations = {};
  try {
    const saved = JSON.parse(await readFile(savePath, 'utf8'));
    if (saved.fingerprint !== corpus.fingerprint) throw new Error('Saved corpus mismatch');
    for (const [id, a] of Object.entries(saved.annotations)) annotations[id] = validateAnnotation(corpus, id, a);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let writes = Promise.resolve();
  const staticFiles = new Map([
    ['/', ['public/dev/layout-lab/index.html', 'text/html']],
    ['/app.js', ['public/dev/layout-lab/app.js', 'text/javascript']],
    ['/style.css', ['public/dev/layout-lab/style.css', 'text/css']],
    ['/shared/i18n.js', ['shared/i18n.js', 'text/javascript']],
    ['/shared/i18nPacks.js', ['shared/i18nPacks.js', 'text/javascript']],
    ['/sim/dir.js', ['server/sim/dir.js', 'text/javascript']],
    ...['en', 'ja', 'ko', 'zh-TW'].map(code => [`/i18n/${code}.json`, [`public/i18n/${code}.json`, 'application/json']]),
  ]);
  const server = http.createServer(async (req, res) => {
    const reply = (status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
    try {
      if (req.headers.host !== `127.0.0.1:${server.address().port}` && req.headers.host !== `localhost:${server.address().port}`) return reply(403, { error: 'Invalid host' });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/api/state') return reply(200, { corpus, annotations, savePath });
      if (req.method === 'GET' && url.pathname === '/api/export') {
        res.setHeader('Content-Disposition', 'attachment; filename="layout-training.json"');
        return reply(200, { corpus, annotations, features: Object.fromEntries(Object.entries(annotations).filter(([, a]) => a.confirmed).map(([id, a]) => [id, describeLayout(corpus, id, a)])) });
      }
      if (req.method === 'PUT' && url.pathname.startsWith('/api/annotation/')) {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return reply(403, { error: 'Invalid origin' });
        if (!String(req.headers['content-type']).startsWith('application/json')) return reply(415, { error: 'JSON required' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 50000) return reply(413, { error: 'Too large' }); }
        const id = decodeURIComponent(url.pathname.slice('/api/annotation/'.length));
        const a = validateAnnotation(corpus, id, JSON.parse(body));
        const commit = writes.then(async () => {
          const next = { ...annotations, [id]: a };
          await writeFile(`${savePath}.tmp`, JSON.stringify({ schema: 1, fingerprint: corpus.fingerprint, annotations: next }, null, 2));
          await rename(`${savePath}.tmp`, savePath);
          annotations = next;
        });
        writes = commit.catch(() => {});
        await commit;
        return reply(200, { ok: true });
      }
      const file = staticFiles.get(url.pathname);
      if (req.method === 'GET' && file) return reply(200, await readFile(resolve(root, file[0]), 'utf8'), file[1]);
      return reply(404, { error: 'Not found' });
    } catch (e) { reply(400, { error: e.message }); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  return { server, corpus, savePath, url: `http://127.0.0.1:${server.address().port}` };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const at = process.argv.indexOf('--port');
  const storageAt = process.argv.indexOf('--storage');
  const lab = await startLayoutLab({ port: at < 0 ? 3217 : Number(process.argv[at + 1]), storage: storageAt < 0 ? undefined : resolve(process.argv[storageAt + 1]) });
  console.log(`Layout lab: ${lab.url}\n${lab.corpus.cases.length} examples\nSaved to: ${lab.savePath}`);
}
