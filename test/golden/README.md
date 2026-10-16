# Golden results

The simulation is deterministic: the same seed and inputs give the same battle and the same match, bit for bit. These
files record the exact outcome of a fixed corpus of seeded scenarios, so a change that alters gameplay — even one meant
to be a pure refactor that only reorders random draws, hook order or iteration order — fails loudly instead of slipping
through.

- `tools/golden.mjs` builds the corpus from `data/*.json` (fixed order, fixed seeds) and reduces every scenario to a
  digest. Its header documents the families and the digest fields.
- `test/golden/<family>.json` hold the digests (`roster`, `bonds`, `fields`, `matches`, `standins`, `diy`).
- `test/golden.test.js` recomputes them and compares. On a mismatch it prints the scenario, the field and old → new.

## The corpus

| family | what runs |
|---|---|
| `roster` | 49 battles: every visible chess record (normal and elite) with every selectable skill and module (DESIGN §16), 12 operators per battle on a real stage (all 11 in turn) against the round's real wave three times over, every non-leader enemy kind of `data/enemies.json` as extra spawns (half of them bounties), placeable summons on the board, every equipment item, band, battle-side 机变 card and stage map card in turn, bonds from the board |
| `bonds` | 46 battles: every bond at its activation threshold (1 layer) and at its top tier (999 layers) |
| `fields` | 22 battles: every Final Assault / Hidden Core leader on a pair and a solo template (shared pool, 200 s cap) and the 联防 field with 1 and 2 helpers on the round's stage, both halves (carried HP / SP, a knocked-out operator, two leakers' enemies) |
| `matches` | 21 full matches in virtual time: bot-only solo and co-op, server-run combat, boosted Hidden Core runs, partially owned human rosters and a human with no NORMAL operators (AI 托管, offline; `standIns` records the fielded stand-ins per round), and human 自选 picks with 调度中心 level 5 from the first prep (`diy` records shop draws and deployed pieces). `matchScenarios()` lists every configuration. |
| `standins` | 10 battles: every NORMAL chess record (normal and elite, 110) fielded as its 补位 stand-in (`standIn: true`: the stand-in's body, backup skill / module and kit — all 17 stand-ins, every skill a chess names for them), 12 per battle by strength band, laid out by the stand-in's position on a real stage, against the round's real wave three times over plus 8 ground enemy kinds (melee stand-ins always meet an enemy), an item each, bonds from the board |
| `diy` | battles of 自选 pieces (a DIY slot with its `diy` pick, `shared/diy.js`): every owned 6★ with an operator kit (`kits/index.js OPERATOR_KITS`) in each form of tiers 5 and 6 (normal; elite with no module and with each module) under each skill, then every prototype pick with a kit at its locked selection, normal and elite, 12 per battle against the round's real wave; a new operator kit adds its scenarios (the battle count grows with the kits) |

Battles go through the production BattleSpec path (`server/sim/spec.js`, as browsers and the server's headless fields
run them); matches construct `Match` directly with a `VirtualScheduler`. Every option is explicit, so a change to a
test-harness default never moves a digest.

What a digest ignores on purpose (it does not affect gameplay): object key order, engine unit ids (snapshot ids are
renumbered by first appearance, units are named by board uid or def id), board piece uids, the order of client events
within a tick (they are counted, not hashed) and wall-clock time. Damage / healing sums are rounded to integers and HP
to 2 decimals.

`npm test` runs the fast subset (the scenarios marked `"fast": true`: every chess record with its default loadout,
every stage and every non-leader enemy kind, every bond at its top tier, six fields, ten matches, the five stand-in
battles of the normal records, the first 自选 battle of the operator kits and of the prototypes — 65 of the 288). `GOLDEN_FULL=1` checks everything.

## Workflow

```sh
GOLDEN_FULL=1 node --test test/golden.test.js   # the whole corpus (≈ 20 s with 4 worker threads)
node --test test/golden.test.js                 # the fast subset
npm run golden                                  # the same comparison from the tool (all families, a short report)
npm run golden:update                           # recompute and rewrite test/golden/*.json
node tools/golden.mjs --twice                   # determinism: the corpus twice in one process, the second pass reversed
```

- **A refactor commit must never change these files.** Run `GOLDEN_FULL=1 node --test test/golden.test.js` before
  committing it. If a digest moves, the refactor changed behaviour: find out why (the first differing value of `snaps`
  says when two runs parted, in 10-game-second steps) instead of updating the files.
- **An intended gameplay change** (a fix, new content, a data rebuild): run `npm run golden:update` and commit the
  changed files together with the change, saying in the commit message which scenarios moved and why.
- **Reviewing the diff:** every scenario is a block of its own and every unit / enemy / round is one line, so a diff
  shows which scenarios moved and which values changed. A change confined to the scenarios that contain the touched
  operator, enemy or rule is expected; a change everywhere (every `rngDraws`, every `snaps`) means something global
  moved — the RNG draw order, the tick order, a shared rule.
- **Adding to the corpus** (a new family, more scenarios, a new digest field) changes the files by design: do it in a
  commit of its own, never together with a refactor.
- A new engine hook, event or chess record does not change the digests of the existing scenarios by itself — the
  hook list is frozen in the tool and the corpus is regenerated only on `golden:update` — but new data records do join
  the corpus there (the roster family enumerates `data/chess.json`).

After the measured shared-stock update (DESIGN §29.8), the original stand-in / DIY seeds remain as outcome regressions. Under the local AI Ioleta opening preference (2026-10-15, DESIGN §6.6), companion seeds `coop2-NORMAL-4-coverage-standins` and `coop2-NORMAL-3-coverage-diy` exercise the shop → deployment → battle paths. The stand-in companion starts its human at shop L5 and includes 斯卡蒂 in not-owned chess, covering normal and elite stand-ins despite Ioleta's low-level elite building. The original `coop2-NORMAL-70-diy` fields 推进之王; the companion fields Sharp. The DIY assertion resolves elite slots through their base id, since the bot can merge and deploy its 自选 operator.

The upstream `coop2-NORMAL-1-unowned-roster` scenario supplies no owned NORMAL operators. It starts at shop L5 because Ioleta can otherwise build a PRESET-only board and never field a stand-in; with the higher-tier offers, coverage no longer depends on which NORMAL operators the AI buys. These three companion scenarios are included in the fast subset. The battle-only families retain their upstream fixtures.

The v0.3.0 merge moves every prior match digest as the upstream match rules/data and local Ioleta buying and placement
choices meet. The exact moved scenarios are:

- Solo: `solo-FUNNY-1`, `solo-FUNNY-2`, `solo-NORMAL-1`, `solo-NORMAL-2`, `solo-HARD-1`, `solo-HARD-2`, `solo-ABYSS-1`, `solo-ABYSS-2`.
- Bot co-op: `coop2-NORMAL-3`, `coop2-HARD-4`, `coop3-ABYSS-5`, `coop4-FUNNY-6`, `coop4-ABYSS-7`, `coop2-NORMAL-8-serverrun`.
- Boosted: `solo-HARD-9-boosted`, `coop2-ABYSS-10-boosted`. The latter fields 泡泡 against the 法术护盾 “碎铳之簧”; classifying its retaliation as a counter removes the recursive hook errors seen on the first merged run.
- Human with AI 托管: `coop2-NORMAL-14-standins`, `coop2-NORMAL-70-diy`, `coop2-NORMAL-4-coverage-standins`, `coop2-NORMAL-3-coverage-diy`.

`coop2-NORMAL-1-unowned-roster` is the one added scenario. The upstream coverage companion seeds 1 and 5 are replaced by the local Ioleta seeds 4 and 3; no battle-only fixture was regenerated for this merge.


Ioleta AI proposal (2026-10-16): default procurement, formation candidates and incoming-facing preferences intentionally change the following full-match outcomes; battle-only golden files are unchanged. Recomputed on TempesTKF master 61c6e614, not copied from fork golden files.

- solo-FUNNY-1
- solo-FUNNY-2
- solo-NORMAL-1
- solo-NORMAL-2
- solo-HARD-1
- solo-HARD-2
- solo-ABYSS-1
- solo-ABYSS-2
- coop2-NORMAL-3
- coop2-HARD-4
- coop3-ABYSS-5
- coop4-FUNNY-6
- coop4-ABYSS-7
- coop2-NORMAL-8-serverrun
- solo-HARD-9-boosted
- coop2-ABYSS-10-boosted
- coop2-NORMAL-14-standins
- coop2-NORMAL-70-diy
- coop2-NORMAL-4-coverage-standins
- coop2-NORMAL-3-coverage-diy
- coop2-NORMAL-1-unowned-roster


PR #3 review fix (2026-10-16): Ioleta defers equipment for missing procurement targets only while the existing refresh budget and affordability gate allow another search. With 2 funds and no free refresh it can buy and equip a usable 1-fund item instead of losing unused funds at prep end. Core procurement and upgrade priorities are unchanged.
The resulting equipment purchases intentionally move these full-match golden scenarios; all battle-only fixtures remain unchanged:

- solo-FUNNY-1
- solo-FUNNY-2
- solo-NORMAL-1
- solo-NORMAL-2
- solo-HARD-1
- solo-HARD-2
- solo-ABYSS-1
- solo-ABYSS-2
- coop2-NORMAL-3
- coop2-HARD-4
- coop4-FUNNY-6
- coop4-ABYSS-7
- coop2-NORMAL-8-serverrun
- solo-HARD-9-boosted
- coop2-ABYSS-10-boosted
- coop2-NORMAL-14-standins
- coop2-NORMAL-70-diy
- coop2-NORMAL-4-coverage-standins
- coop2-NORMAL-3-coverage-diy
