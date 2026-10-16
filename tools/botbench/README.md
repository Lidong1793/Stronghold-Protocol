# Ioleta 2×2 benchmark

## Early/late windows and upstream refinements

`summarizeRecords` accepts inclusive `minRound` / `maxRound`. Raw `metrics.windows` and paired reports expose
`early10` (normal R1–10), `early11` (R1–11), `lateAfter10` (R11–13), `lateAfter11` (R12–13).
These overlapping windows are alternative cuts, not four additive buckets. Boss/hidden are separate. Each window
retains leaks, participating player-rounds, actual spawned enemies and rates; no exposure means a null rate.
Common windows intersect actual participating players/rounds separately for each paired seed, including the
eliminating round. Do not compare total leakage without checking exposure and survival.

Run `node tools/botbench-refinements.mjs --seeds 20 --seed 1 --out .cache/ai-refinements` for the upstream ports.
Groups: baseline = no ports; preview = faithful normal-battle preview; capacity = preview + capacity;
guards / medics / cheap each add one independent heuristic to capacity. The recommended group is capacity.
`--groups baseline,capacity` limits the run; `--report-only` rebuilds paired summaries from saved raw files.
The runner always fixes experimental Ioleta, legacy formation and the same rehearsal budget.

Standalone `botbench.mjs --ioleta-policy experimental --formation legacy` defaults to preview + capacity;
pass `--refinements none` for the old baseline or a comma-separated list for ablations. Other policy/formation
combinations default to no ports. The historical factorial runner explicitly defaults to `--refinements none`
in every group; `--refinements preview,capacity` applies the same ports to all groups for a new factorial experiment.
Runtime source fingerprints now cover server, shared and data files, rather than only bot modules. Old reports
remain historical evidence and must not be paired with a new source fingerprint.

Formation version names: **v0.1 = original (`legacy`)**, **v0.2 = taught (`learned`)**.
These version only the layout rules, independently of the Ioleta policy and application release.
The CLI values and historical JSON keys stay `legacy` / `learned` for reproducibility.

Run all four combinations on the same seeds, initial setups, difficulty and fixed solo band:

```sh
node tools/botbench-factorial.mjs --configs solo:NORMAL,solo:HARD,solo:ABYSS --seeds 20 --seed 1 --jobs 4 --band band_ioleta
```

`legacy-legacy`, `experimental-legacy`, `legacy-learned` and `experimental-learned` mean
policy/formation. The independent `botbench.mjs` flags are `--ioleta-policy legacy|experimental`
and `--formation legacy|learned`; defaults preserve the legacy policy and current learned formation.
To run selected groups, pass `--groups legacy-legacy,legacy-learned`. `--report-only` recomputes the
paired summary after all four result files exist. `--out DIR` changes the default `.cache/ioleta-factorial`.

Each raw match records the switches, seed, stage, boss, disabled bonds, factions, source fingerprint,
setup fingerprint, map support, per-round kind and actual participating players. Learned formations
apply only on the demonstrated maps and normal rounds 1–13; unsupported maps keep the legacy formation.
The reporter refuses mismatched source/setup fingerprints, settings, missing seeds, incomplete matches
or engine errors. Run all groups after the implementation stops changing.

Leakage counts every `result.leaked` entry whose `counted` is not false. Ordinary, bounty and actual
boss enemies are disjoint counts; the normal/Boss/hidden round is a separate dimension. Normal totals
cover only normal rounds 1–13. All-round totals also include Boss and hidden leakage. These are field
leaks before the ordinary LP cap or co-op assistance, so they are not the LP-loss total. Overtime and
direct boss LP drains are not enemies and are not included.

`enemies` is the actual number of counted spawned enemies (including counted runtime splits/summons
and the boss), observed only in real normal/Boss/hidden fields. Rehearsals and co-op assistance fields
are excluded. Unspawned scheduled enemies are excluded; surviving spawned enemies at a forced Boss
end remain in the denominator. Consequently the Boss leakage rate is descriptive of that played
Boss exposure, not a kill rate. The official `result.total` is retained separately; it excludes runtime
splits/summons and must not be the denominator of all counted leaks. Each enemy key has its own counts.
The number of runtime children can itself depend on the lineup's kills; interpret the per-enemy rate alongside
raw leakage and survival. `scheduledEnemies`, `scheduledLeaks` and `scheduledLeakRate` additionally retain the
official scheduled-enemy population as a separate, internally consistent numerator/denominator pair.

One player-round means one actual player battle result. It includes a player's eliminating round,
and excludes later rounds with no player field. Sampling hooks run after ordinary settlement and
Boss/hidden completion, retaining Boss results even when the match advances to hidden instead of RESULT.
Every match audits sampled normal leakage against the engine's independently accumulated `players[].stats.leaks`;
a mismatch makes the benchmark record erroneous and prevents inclusion in the paired report.

`summary.json` contains aggregates per configuration, per map and per randomly disabled bond combination,
a paired row per configuration/seed, and policy/formation/joint contrasts. Each group retains its full totals, wins, Boss arrivals and rounds
passed. A second leakage comparison uses only player-rounds all four groups actually played, including
the eliminating round. Use survival and exposure alongside leakage: a bot that dies early can otherwise
appear better simply because it never faced the later waves. Contrasts report `after - before`; lower
leakage and higher survival are favorable. This is a small fixed-seed experiment, not a universal estimate.

`lpAtBoss` records team life when entering the final assault; `finalLp` records actual terminal team life.
The historical `lpLeft`/"legacy LP score" remains for compatibility: a failed Boss can retain its pre-Boss
life in that legacy score, so it must not be described as terminal remaining life.

Parallel jobs preserve seeded outcomes; wall-clock and process CPU timing under workers are affected by
host/thread load. Use `--jobs 1` when decision-time comparisons are the objective.


Formation experiments (HARD/ABYSS only):

```sh
node tools/botbench-formations.mjs --groups legacy,learned,contact,refined,combined --seed 1 --seeds 10 --out .cache/ai-formations-screen2
node tools/botbench-formations.mjs --groups legacy,learned,combined --seed 31 --seeds 20 --out .cache/ai-formations-validation
```

Each group uses experimental Ioleta + explicit preview/capacity. Source/setup fingerprints must agree;
reports include R1–10, R1–11, R11–13 and R12–13 plus paired common-round comparisons. Legacy uses up to
three rehearsals, learned/ordered/contact/refined four, combined six. Do not interpret a combined win as
an equal-compute comparison. Raw results and summary.json are written under the output directory.

The final opt-in recommendation is `--formation optimized`: HARD uses contact, ABYSS combined, other
difficulties retain learned. Confirmation command (fixed seeds 51–70, never used to choose the preset):

```sh
node tools/botbench-formations.mjs --groups legacy,learned,optimized --seed 51 --seeds 20 --out .cache/ai-formations-confirm
```

For a standalone benchmark also pass `--ioleta-policy experimental --refinements preview,capacity`.
No global runtime default has been switched. See `docs/research/formation-optimization.md` for tradeoffs.

## Upstream 0.3.0 integration (2026-10-16)

Preview, capacity accounting and cheaper-score tie breaking are now unconditional upstream behavior. Their old
refinement labels remain accepted for command compatibility but no longer perform independent ablations.
The guards/medics local repair switches and the Ioleta/formation alternatives remain selectable. Reports from
before this merge are historical; use the source fingerprint to keep old and new cohorts separate.
