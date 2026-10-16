#!/usr/bin/env node
// Reproducible 2×2 Ioleta benchmark. Raw results stay in .cache by default.
// node tools/botbench-factorial.mjs --seeds 20 --seed 1 --jobs 4
// Optional: --groups legacy-legacy,legacy-learned to run only the baselines; run the other groups later.
// --report-only rebuilds summary.json from the four existing files without running matches.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTORIAL_GROUPS, factorialReport, summarizeRecords } from './botbench/metrics.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (!key.startsWith('--')) throw new Error(`Unexpected argument: ${key}`);
  options[key.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
}
const directory = resolve(String(options.out || '.cache/ioleta-factorial'));
mkdirSync(directory, { recursive: true });
const selected = String(options.groups || FACTORIAL_GROUPS.map(g => g.id).join(',')).split(',');
for (const id of selected) if (!FACTORIAL_GROUPS.some(g => g.id === id)) throw new Error(`Unknown group: ${id}`);
const configs = String(options.configs || 'solo:NORMAL,solo:HARD,solo:ABYSS');
const seed = String(options.seed || 1);
const seeds = String(options.seeds || 20);
const jobs = String(options.jobs || 4);
const band = String(options.band || 'band_ioleta');
const bench = fileURLToPath(new URL('./botbench.mjs', import.meta.url));
if (!options['report-only']) for (const g of FACTORIAL_GROUPS.filter(g => selected.includes(g.id))) {
  const json = join(directory, `${g.id}.json`);
  const args = [bench, '--configs', configs, '--seed', seed, '--seeds', seeds, '--jobs', jobs, '--band', band,
    '--ioleta-policy', g.policy, '--formation', g.formation, '--refinements', String(options.refinements || 'none'), '--json', json];
  if (options.rehearsal != null) args.push('--rehearsal', String(options.rehearsal));
  if (options.quiet) args.push('--quiet');
  console.error(`Starting ${g.id}: ${configs}; seeds ${seed}..${Number(seed) + Number(seeds) - 1}`);
  await new Promise((ok, fail) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', windowsHide: true });
    child.once('error', fail);
    child.once('exit', code => code === 0 ? ok() : fail(new Error(`${g.id} exited ${code}`)));
  });
}
const runs = {};
for (const g of FACTORIAL_GROUPS) {
  const json = join(directory, `${g.id}.json`);
  if (existsSync(json)) runs[g.id] = JSON.parse(readFileSync(json, 'utf8'));
}
const complete = FACTORIAL_GROUPS.every(g => runs[g.id]);
if (options['report-only'] && !complete) throw new Error('Four group files are required for --report-only');
const report = complete ? factorialReport(runs) : {
  partial: true, groups: Object.keys(runs),
  aggregates: Object.entries(runs).map(([group, records]) => ({ group, normal: summarizeRecords(records, { normalOnly: true, maxRound: 13 }), all: summarizeRecords(records) })),
};
writeFileSync(join(directory, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
console.error(`Saved ${complete ? 'paired four-group' : 'partial'} results to ${directory}`);
