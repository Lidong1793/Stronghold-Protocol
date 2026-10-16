#!/usr/bin/env node
// Formation experiments: fixed experimental policy + preview/capacity, HARD/ABYSS only.
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formationReport } from './botbench/formations.mjs';
import { FORMATION_MODES } from '../server/match/botFormation.js';
const opt = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (!k.startsWith('--')) throw new Error(`Unexpected argument ${k}`);
  opt[k.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
if (opt.configs && String(opt.configs).split(',').some(c => !['solo:HARD', 'solo:ABYSS'].includes(c))) throw new Error('Formation experiments require solo:HARD or solo:ABYSS');
const out = resolve(String(opt.out || '.cache/ai-formations'));
mkdirSync(out, { recursive: true });
const groups = String(opt.groups || FORMATION_MODES.join(',')).split(',');
if (groups.some(g => !FORMATION_MODES.includes(g))) throw new Error('Unknown refinement group');
if (!opt['report-only']) for (const group of groups) {
  const args = [fileURLToPath(new URL('./botbench.mjs', import.meta.url)), '--configs', String(opt.configs || 'solo:HARD,solo:ABYSS'),
    '--seeds', String(opt.seeds || 10), '--seed', String(opt.seed || 1), '--jobs', String(opt.jobs || 4), '--band', 'band_ioleta',
    '--ioleta-policy', 'experimental', '--formation', group, '--refinements', 'preview,capacity',
    '--json', join(out, `${group}.json`), '--quiet'];
  console.error(`Running ${group}`);
  await new Promise((ok, fail) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
    child.once('error', fail);
    child.once('exit', code => code === 0 ? ok() : fail(new Error(`${group}: ${code}`)));
  });
}
const runs = Object.fromEntries(FORMATION_MODES.filter(g => existsSync(join(out, `${g}.json`)))
  .map(g => [g, JSON.parse(readFileSync(join(out, `${g}.json`), 'utf8'))]));
const report = formationReport(runs);
writeFileSync(join(out, 'summary.json'), JSON.stringify(report));
for (const r of report.rows) console.log(JSON.stringify({ group: r.group, config: r.config, wins: r.all.wins,
  early10: r.windows.early10.leaks, early11: r.windows.early11.leaks, late: r.windows.lateAfter11.leaks,
  delta10: r.deltas.early10, delta11: r.deltas.early11 }));
