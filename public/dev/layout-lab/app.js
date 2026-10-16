import { t, setLang, addMessages } from '/shared/i18n.js';
import { rotateOffset } from '/sim/dir.js';

const response = await fetch('/api/state');
if (!response.ok) throw new Error('Start with node tools/layout-lab.mjs');
const { corpus, annotations, savePath } = await response.json();
const app = document.querySelector('#app');
const draftKey = `sp.layout-lab.${corpus.fingerprint}`;
const roles = { block: () => t('阻挡位'), damage: () => t('输出位'), heal: () => t('治疗位') };
const arrows = { UP: '↑', RIGHT: '→', DOWN: '↓', LEFT: '←' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const blank = () => ({ placements: [], notes: '', confirmed: false });
let index = Math.max(0, corpus.cases.findIndex(c => c.id === location.hash.slice(1)));
let selected = null, hover = null, dragging = null, showRoutes = true, showHealing = false;
let history = [], pending = 0, queue = Promise.resolve(), saveError = false;
const localDrafts = JSON.parse(localStorage.getItem(draftKey) || '{}');
for (const [id, a] of Object.entries(localDrafts)) if (corpus.cases.some(c => c.id === id)) annotations[id] = a;
const current = () => corpus.cases[index];
const mapOf = () => corpus.maps.find(m => m.id === current().mapId);
const state = () => annotations[current().id] ||= blank();
const unit = () => current().units.find(u => u.uid === selected);
const at = uid => state().placements.find(p => p.uid === uid);
const label = u => `${roles[u.role]()} ${u.number}`;
const legal = (u, row, col) => { const cls = mapOf().deploy[`${row},${col}`]; return !!cls && (u.place !== 'melee' || cls === 'melee') && (u.place !== 'high' || cls === 'ranged'); };
const cover = (u, p) => new Set(u.range.map(([dr, dc]) => { const [r, c] = rotateOffset(dr, dc, p.dir); return `${p.row + r},${p.col + c}`; }));
let draftDirs = {};
const dirOf = uid => at(uid)?.dir || draftDirs[uid] || 'RIGHT';
const terrain = tile => {
  if (tile.glyph === 'S') return t('敌方入口');
  if (tile.glyph === 'E') return t('保护目标');
  if (tile.deploy === 'ranged') return t('高台');
  if (tile.deploy && !tile.groundPassable) return t('围栏：可部署，不阻挡地面敌人');
  if (tile.terrain.includes('deepsea')) return t('深水区');
  if (tile.terrain.includes('infection')) return t('活性源石');
  if (tile.terrain.includes('smog')) return t('排气格栅');
  if (tile.terrain.includes('mire')) return t('沼泽');
  return tile.deploy ? t('地面部署格') : t('不可部署');
};

function status() {
  const el = document.querySelector('#save-status');
  if (el) { el.textContent = saveError ? t('保存失败，可重试；草稿保留在浏览器') : pending ? t('保存中') : t('已保存到本机'); el.classList.toggle('error', saveError); }
}
function persist(id = current().id) {
  const snapshot = structuredClone(annotations[id]);
  localDrafts[id] = snapshot;
  localStorage.setItem(draftKey, JSON.stringify(localDrafts));
  pending++; status();
  queue = queue.catch(() => {}).then(async () => {
    try {
      const r = await fetch(`/api/annotation/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) });
      if (!r.ok) throw new Error((await r.json()).error);
      if (JSON.stringify(localDrafts[id]) === JSON.stringify(snapshot)) { delete localDrafts[id]; localStorage.setItem(draftKey, JSON.stringify(localDrafts)); }
      saveError = false;
    } catch { saveError = true; }
    finally { pending--; if (!pending) saveError = Object.keys(localDrafts).length > 0; status(); }
  });
}
function edit(fn) {
  history.push(structuredClone(state()));
  if (history.length > 80) history.shift();
  fn(state()); state().confirmed = false; persist(); render();
}
function notice(msg) { const el = document.querySelector('#notice'); if (el) el.textContent = msg; }
function refreshCompletion() {
  document.querySelector('.progress').textContent = t('已完成 {n} / {total}', { n: Object.values(annotations).filter(a => a.confirmed).length, total: corpus.cases.length });
  for (const el of document.querySelectorAll('[data-map]')) {
    const mapId = corpus.maps[Number(el.dataset.map)].id;
    el.querySelector('small').textContent = `${corpus.cases.filter(c => c.mapId === mapId && annotations[c.id]?.confirmed).length}/6`;
  }
  document.querySelector('.example.active small').textContent = state().confirmed ? t('已完成') : t('草稿');
  document.querySelector('#confirm').textContent = state().confirmed ? t('已标记完成') : t('标记本组完成');
}
function move(uid, row, col, swap = false) {
  const u = current().units.find(u => u.uid === uid);
  if (!u || !legal(u, row, col)) return notice(t('此位置不能部署选中单位'));
  const occupied = state().placements.find(p => p.row === row && p.col === col && p.uid !== uid);
  if (occupied && !swap) { selected = occupied.uid; render(); return; }
  const old = at(uid);
  if (occupied && (!old || !legal(current().units.find(u => u.uid === occupied.uid), old.row, old.col))) return notice(t('无法交换这两个位置'));
  const dir = dirOf(uid);
  selected = uid;
  edit(s => {
    if (occupied) { occupied.row = old.row; occupied.col = old.col; }
    s.placements = s.placements.filter(p => p.uid !== uid);
    s.placements.push({ uid, row, col, dir });
  });
}
function face(dir) {
  if (!selected) return;
  draftDirs[selected] = dir;
  if (at(selected)) edit(() => { at(selected).dir = dir; }); else render();
}
function go(i) {
  index = Math.max(0, Math.min(corpus.cases.length - 1, i));
  selected = null; hover = null; history = []; draftDirs = {};
  location.hash = current().id; render();
}
function mini(u) {
  const points = u.range.map(([r, c]) => rotateOffset(r, c, dirOf(u.uid)));
  const rows = points.map(p => p[0]).concat(0), cols = points.map(p => p[1]).concat(0);
  const r0 = Math.min(...rows), r1 = Math.max(...rows), c0 = Math.min(...cols), c1 = Math.max(...cols);
  const width = (c1 - c0 + 1) * 18, height = (r1 - r0 + 1) * 18;
  return `<svg class="mini" viewBox="-1 -1 ${width + 2} ${height + 2}" role="img" aria-label="${esc(t('攻击或治疗范围'))}">${points.map(([r, c]) => `<rect x="${(c - c0) * 18}" y="${(r1 - r) * 18}" width="16" height="16" fill="currentColor" opacity=".5"/>`).join('')}<rect x="${-c0 * 18}" y="${r1 * 18}" width="16" height="16" fill="white"/><text x="${-c0 * 18 + 8}" y="${r1 * 18 + 12}" text-anchor="middle" font-size="14" fill="#101b20">${arrows[dirOf(u.uid)]}</text></svg>`;
}
function rangeOverlay() {
  const u = unit(), p = u ? at(u.uid) || (hover && { ...hover, dir: dirOf(u.uid) }) : null;
  const keys = p ? cover(u, p) : new Set();
  const heal = new Set();
  if (showHealing) for (const h of current().units.filter(u => u.role === 'heal')) { const p = at(h.uid); if (p) for (const k of cover(h, p)) heal.add(k); }
  for (const el of document.querySelectorAll('.cell')) {
    el.classList.toggle('range', keys.has(el.dataset.key));
    el.classList.toggle('heal-range', heal.has(el.dataset.key));
    const [r, c] = el.dataset.key.split(',').map(Number);
    el.classList.toggle('legal', !!u && legal(u, r, c));
  }
}

function render() {
  document.title = t('站位示范工作台');
  const c = current(), m = mapOf(), s = state(), u = unit();
  const done = Object.values(annotations).filter(a => a.confirmed).length;
  app.innerHTML = `<header><div><div class="eyebrow">STRONGHOLD / LAYOUT LAB</div><h1>${t('站位示范工作台')}</h1></div><div class="header-actions"><span class="progress">${t('已完成 {n} / {total}', { n: done, total: corpus.cases.length })}</span><button id="export">${t('导出布局')}</button><select id="language" aria-label="Language"><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option><option value="zh-TW">繁體中文</option></select></div></header>
  <div class="workspace"><nav><div class="section-label">${t('绝境地图池')}</div>${corpus.maps.map((map, i) => {
    const n = corpus.cases.filter(c => c.mapId === map.id && annotations[c.id]?.confirmed).length;
    return `<button class="map-tab ${map.id === m.id ? 'active' : ''}" data-map="${i}"><span class="map-num">0${i + 1}</span><span>${esc(map.name)}</span><small>${n}/6</small></button>`;
  }).join('')}<div class="nav-note">${t('每图六组，每组八人。完成后再将示范提炼为 AI 经验。')}</div><details><summary>${t('保存位置')}</summary><code>${esc(savePath)}</code></details></nav>
  <section class="main"><div class="case-heading"><div><div class="section-label">${esc(m.id)}</div><h2>${esc(m.name)}</h2></div><span class="badge">${t('普通战场 · 双入口')}</span></div>
  <div class="examples">${corpus.cases.filter(x => x.mapId === m.id).map(x => `<button data-case="${corpus.cases.indexOf(x)}" class="example ${x.id === c.id ? 'active' : ''}"><b>${String(x.example).padStart(2, '0')}</b><span>${x.counts.join(' / ')}</span><small>${annotations[x.id]?.confirmed ? t('已完成') : annotations[x.id]?.placements.length ? t('草稿') : t('未开始')}</small></button>`).join('')}</div>
  <div class="distribution">${t('阻挡 {b} · 输出 {d} · 治疗 {h}', { b: c.counts[0], d: c.counts[1], h: c.counts[2] })}<span>${t('已部署 {n} / 8', { n: s.placements.length })}</span></div>
  <div class="board-controls"><label><input id="routes" type="checkbox" ${showRoutes ? 'checked' : ''}>${t('显示路线')}</label><label><input id="healing" type="checkbox" ${showHealing ? 'checked' : ''}>${t('治疗覆盖')}</label><span>${t('上方为第 12 行，右侧为敌方入口')}</span></div>
  <div class="board-wrap"><div class="columns">${Array.from({ length: 9 }, (_, i) => `<span>${i + 2}</span>`).join('')}</div><div class="board">${m.tiles.map(tile => {
    const p = s.placements.find(p => `${p.row},${p.col}` === tile.key), rec = p && c.units.find(u => u.uid === p.uid);
    const dev = m.devices.filter(d => d.pos.join(',') === tile.key || d.role === 'blower' && d.rangeTiles.some(k => k.join(',') === tile.key));
    const special = !['tile_road', 'tile_floor', 'tile_start', 'tile_end', 'tile_forbidden'].includes(tile.terrain);
    return `<button class="cell ${tile.deploy || 'closed'} ${tile.deploy && !tile.groundPassable ? 'fence' : ''} ${tile.glyph === 'S' ? 'gate' : ''} ${tile.glyph === 'E' ? 'goal' : ''} ${special ? 'special' : ''}" data-key="${tile.key}" data-terrain="${tile.terrain}" aria-label="${esc(`${tile.key} ${terrain(tile)}${rec ? ` ${label(rec)}` : ''}`)}" title="${esc(`${tile.key} · ${terrain(tile)}${dev.length ? ' · ' + dev.map(d => d.name + (d.role === 'blower' ? arrows[d.dir] : '')).join(' / ') : ''}`)}"><span class="coordinate">${tile.key}</span>${tile.glyph === 'S' ? '<span class="tile-mark">IN</span>' : tile.glyph === 'E' ? '<span class="tile-mark">END</span>' : ''}${tile.deploy === 'ranged' ? '<span class="height-mark">▰</span>' : ''}${dev.some(d => d.role === 'blower') ? `<span class="wind">${arrows[dev.find(d => d.role === 'blower').dir]}</span>` : ''}${!rec && tile.special ? `<span class="terrain-note">${terrain(tile)}</span>` : ''}${dev.some(d => d.role === 'crate' || d.role === 'mound') ? '<span class="obstacle">▧</span>' : ''}${rec ? `<span class="piece ${rec.role} ${p.uid === selected ? 'selected' : ''}" draggable="true" data-unit="${p.uid}"><b>${label(rec)}</b><strong>${arrows[p.dir]}</strong></span>` : ''}</button>`;
  }).join('')}<svg class="routes ${showRoutes ? '' : 'hidden'}" viewBox="0 0 900 400" preserveAspectRatio="none"><defs>${[0, 1].map(i => `<marker id="arrow${i}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="${i ? '#e8ad69' : '#7ac9f3'}"/></marker>`).join('')}</defs>${m.routes.map((rt, i) => rt.tiles.slice(1).map(([r, col], j) => {
    const [pr, pc] = rt.tiles[j], off = i ? 9 : -9;
    return `<line x1="${(pc - 2) * 100 + 50}" y1="${(12 - pr) * 100 + 50 + off}" x2="${(col - 2) * 100 + 50}" y2="${(12 - r) * 100 + 50 + off}" stroke="${i ? '#e8ad69' : '#7ac9f3'}" stroke-width="2" marker-end="url(#arrow${i})"/>`;
  }).join('')).join('')}</svg></div></div>
  <div class="legend"><span><i class="ground-key"></i>${t('地面部署格')}</span><span><i class="high-key"></i>${t('高台')}</span><span><i class="fence-key"></i>${t('围栏')}</span><span><i class="closed-key"></i>${t('不可部署')}</span><span>${t('特殊地形和装置：悬停查看')}</span></div>
  <div id="notice" role="status">${t('选单位，再点格子；也可拖动。方向键转向，R 旋转，Delete 撤回。')}</div>
  <div class="bench" id="bench">${c.units.map((rec, i) => `<button class="unit-card ${rec.role} ${rec.uid === selected ? 'active' : ''} ${at(rec.uid) ? 'deployed' : ''}" data-unit="${rec.uid}" draggable="true"><small>${i + 1} · ${at(rec.uid) ? t('已部署') : t('待部署')}</small><b>${label(rec)}</b><span>${mini(rec)}</span></button>`).join('')}</div>
  <div class="case-footer"><button id="prev" ${index === 0 ? 'disabled' : ''}>${t('上一组')}</button><span>${t('第 {n} / {total} 组', { n: index + 1, total: corpus.cases.length })}</span><button id="next" ${index === corpus.cases.length - 1 ? 'disabled' : ''}>${t('下一组')}</button></div>
  </section><aside><div class="section-label">${t('选中单位')}</div>${u ? `<h2 class="role-text ${u.role}">${label(u)}</h2>${mini(u)}<p>${u.place === 'melee' ? t('仅地面部署') : t('可部署于地面或高台')}</p><p>${t('地面阻挡数：{n}', { n: u.block })}</p><div class="direction-pad">${Object.entries(arrows).map(([dir, glyph]) => `<button data-dir="${dir}" class="${dirOf(u.uid) === dir ? 'active' : ''}" aria-label="${dir}">${glyph}</button>`).join('')}</div><button id="remove" ${at(u.uid) ? '' : 'disabled'}>${t('撤回选中单位')}</button><details><summary>${t('范围来源')}</summary><p>${esc(u.sourceName)} · ${esc(u.sourceSkill)}</p><code>${esc(u.id)}</code></details>` : `<p>${t('点击下方角色卡开始布置')}</p>`}
  <hr><label class="section-label" for="notes">${t('布局思路')}</label><textarea id="notes" rows="6" maxlength="8000" placeholder="${esc(t('例如：前排卡住交汇处，治疗覆盖两个阻挡位。'))}">${esc(s.notes)}</textarea><p class="small">${t('记录优先保护的位置、朝向理由和可替换方案。')}</p><div class="edit-buttons"><button id="undo" ${history.length ? '' : 'disabled'}>${t('撤销')}</button><button id="clear" ${s.placements.length ? '' : 'disabled'}>${t('清空本组')}</button></div><button id="confirm" class="primary" ${s.placements.length < 8 ? 'disabled' : ''}>${s.confirmed ? t('已标记完成') : t('标记本组完成')}</button><button id="retry" class="quiet">${t('重新保存')}</button><div id="save-status" role="status"></div><p class="small scope">${t('这是常规站位示范：使用默认装配的常驻范围，不评估技能、伤害、飞行敌人或首领战。')}</p></aside></div>`;
  document.querySelector('#language').value = document.documentElement.lang || 'zh';
  for (const el of document.querySelectorAll('[data-map]')) el.onclick = () => go(Number(el.dataset.map) * 6);
  for (const el of document.querySelectorAll('[data-case]')) el.onclick = () => go(Number(el.dataset.case));
  for (const el of document.querySelectorAll('[data-unit]')) {
    el.onclick = e => { e.stopPropagation(); selected = el.dataset.unit; hover = null; render(); };
    el.ondragstart = e => { dragging = el.dataset.unit; selected = dragging; e.dataTransfer.setData('text/plain', dragging); e.dataTransfer.effectAllowed = 'move'; };
    el.ondragend = () => { dragging = null; };
  }
  for (const el of document.querySelectorAll('.cell')) {
    const [row, col] = el.dataset.key.split(',').map(Number);
    el.onclick = () => { if (selected) move(selected, row, col); else { selected = s.placements.find(p => p.row === row && p.col === col)?.uid || null; render(); } };
    el.onmouseenter = () => { hover = { row, col }; rangeOverlay(); };
    el.onmouseleave = () => { hover = null; rangeOverlay(); };
    el.ondragover = e => { e.preventDefault(); hover = { row, col }; rangeOverlay(); };
    el.ondrop = e => { e.preventDefault(); const uid = dragging || e.dataTransfer.getData('text/plain'); dragging = null; move(uid, row, col, true); };
  }
  for (const el of document.querySelectorAll('[data-dir]')) el.onclick = () => face(el.dataset.dir);
  document.querySelector('#prev').onclick = () => go(index - 1);
  document.querySelector('#next').onclick = () => go(index + 1);
  document.querySelector('#routes').onchange = e => { showRoutes = e.target.checked; render(); };
  document.querySelector('#healing').onchange = e => { showHealing = e.target.checked; rangeOverlay(); };
  document.querySelector('#notes').oninput = e => { s.notes = e.target.value; s.confirmed = false; persist(); refreshCompletion(); };
  document.querySelector('#remove')?.addEventListener('click', () => edit(s => { s.placements = s.placements.filter(p => p.uid !== selected); }));
  document.querySelector('#undo').onclick = () => { if (!history.length) return; annotations[c.id] = history.pop(); persist(); render(); };
  document.querySelector('#clear').onclick = () => edit(s => { s.placements = []; });
  document.querySelector('#confirm').onclick = () => { s.confirmed = true; persist(); render(); };
  document.querySelector('#retry').onclick = () => { for (const id of Object.keys(localDrafts)) persist(id); if (!Object.keys(localDrafts).length) persist(); };
  document.querySelector('#export').onclick = async () => {
    await queue;
    if (saveError) return notice(t('请先重试保存，再导出'));
    const r = await fetch('/api/export'); if (!r.ok) return notice(t('导出失败'));
    const url = URL.createObjectURL(await r.blob()), a = document.createElement('a'); a.href = url; a.download = 'layout-training.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  document.querySelector('#language').onchange = async e => {
    const lang = e.target.value;
    if (lang !== 'zh') { const r = await fetch(`/i18n/${lang}.json`); addMessages(lang, await r.json()); }
    setLang(lang); document.documentElement.lang = lang; render();
  };
  rangeOverlay(); status();
}
window.addEventListener('keydown', e => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  if (e.key >= '1' && e.key <= '8') { selected = current().units[Number(e.key) - 1].uid; render(); return; }
  const dirs = { ArrowUp: 'UP', ArrowRight: 'RIGHT', ArrowDown: 'DOWN', ArrowLeft: 'LEFT' };
  if (dirs[e.key] && selected) { e.preventDefault(); face(dirs[e.key]); }
  if (e.key.toLowerCase() === 'r' && selected) { const dirs = ['UP', 'RIGHT', 'DOWN', 'LEFT']; face(dirs[(dirs.indexOf(dirOf(selected)) + 1) % 4]); }
  if (e.key === 'Delete' && selected && at(selected)) edit(s => { s.placements = s.placements.filter(p => p.uid !== selected); });
  if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); document.querySelector('#undo').click(); }
});
window.addEventListener('beforeunload', e => { if (pending || saveError) { e.preventDefault(); e.returnValue = ''; } });
render();
for (const id of Object.keys(localDrafts)) persist(id);
