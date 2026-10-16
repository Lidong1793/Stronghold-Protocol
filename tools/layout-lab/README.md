# Layout demonstration lab

Run `npm run layout:lab`, then open <http://127.0.0.1:3217>. This is a separate local tool for teaching the AI
ordinary positioning. Editing/exporting examples does not itself alter the live game's AI, battle rules or golden results.

The Dire solo/multi stage pools from `data/config.json` must agree. Each of the seven maps receives six examples
of eight abstract operators, with blocker/damage/healer counts: 2/5/1, 3/4/1, 4/3/1, 2/4/2, 3/3/2, 4/2/2.
Seed 20261015 samples distinct normal operators, choosing range shapes first, then an operator with that shape.
Blockers are melee TANK/PIONEER records with block count at least two; healers have `attackKind: heal`; remaining
attacking records provide damage positions. These are annotation categories, not combat power or job classifications.
Ranges use `loadoutRecord` and `attackRangeGrid` under the default loadout. Each piece retains its original record id,
range, block count and deployment class. The source operator is available in the detail panel.

Maps use `buildDeployMap` and `groundPathsWithDevices`, the two ordinary ground entrances and default active devices.
Row 12 is displayed at the top. Fenced tiles allow deployment but do not block ground routes. Active platforms,
obstacles and wind coverage are displayed. This first corpus excludes bosses, flying routes, skill uptime, special
enemy behavior and per-round terrain-card changes; its output is a human positioning preference, not a win estimate.

## Annotating

- Select a role card, then a legal tile; or drag a card/piece. Drag between occupied compatible tiles to swap.
- Use the direction controls, arrow keys, or R to turn. Delete returns the selected unit to the bench.
- The selected range is highlighted; an unplaced piece previews its range when hovering over a tile.
- Toggle routes and collective healing coverage. Add a short reason in the notes field.
- Changes auto-save as drafts. Mark a full eight-piece layout complete when it is ready to use as a demonstration.
  Any layout/notes edit returns it to draft; undo restores the previous state.
- Switch freely between the 42 examples. A completed example need not be repeated. Export downloads a portable JSON
  with the full corpus, annotations, and geometric features for confirmed examples only.

## Files and follow-up learning

The tool writes `local/layout-training/<corpus-fingerprint>/examples.json` and `annotations.json` (ignored by Git).
Draft writes are serialized and replaced atomically; pending browser drafts survive reloads and can be retried.
Back up this directory or export JSON before deleting local work. `--storage <directory>` selects another storage root;
`--port <number>` selects a port. Changing map/range data creates a different fingerprint and keeps the previous corpus.

After the owner confirms examples, read the exported annotations and notes to propose general rules: road-intersection
blockers, route entry coverage before blocking, front/back separation, healing coverage of multiple blockers,
deployment constraints and special-terrain exceptions. The export includes route-ordered blockers, rotated range
coverage, healer-to-unit coverage and each road unit's approach coverage. These are observations, not learned rules.
Do not label drafts or generated arrangements as owner demonstrations. Test proposed rules against withheld maps /
range shapes, then implement them in the planner and repeat seeded match comparisons before claiming an improvement.

Checks: `node --test test/layout-lab.test.js`; `node tools/i18n.mjs check --all --strict public/dev/layout-lab/app.js`.

## Integrated owner demonstrations (2026-10-16)

The owner confirmed all 42 cases of corpus `046ba07edeaf63ed`, restricted to ordinary R1–13. The explicit import
`node tools/layout-lab/learn.mjs --storage local/layout-training/046ba07edeaf63ed` saves anonymous role/range/position
evidence under `docs/research/` and compiles soft map/role frequencies into `server/match/botFormationProfiles.js`.
The default `node tools/layout-lab/learn.mjs` regenerates from committed evidence without needing local saves.
Example 6 of each map is withheld. `node tools/layout-lab/evaluate.mjs` compares geometry on these seven compositions;
the runtime candidate also scores healing and fire on blocking points, then competes in the real-wave rehearsal.
Boss and Hidden Core layouts bypass this policy. Full method and seeded results: [layout learning](../../docs/research/layout-learning.md).
