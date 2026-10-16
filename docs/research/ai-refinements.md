# 罗素 AI 上游修复对照（2026-10-16）

结论：保留“实验新策略＋v0.1 旧站位”，叠加演习真实性和手牌容量修复。优先看前 10、11 回合。
本批 60 个配对设置，前 10 回合漏怪 83 → 72，前 11 回合 151 → 128；通关仍为 18/60。
这两项现在是该显式组合的默认改进；全局默认策略未切换。重卫、医疗和低价同分选择保留实验开关。

## 代码与实验边界

- 上游来源：`sganggs/Stronghold-Protocol@c24e17eec3af1e6dedfa9935a6d15245cf2f4586`，0.3.0。
- 本地保留 0.2.6 战斗机制、罗素阶段策略和权重；未引入 0.3.0 射程碰撞箱等战斗规则。
- 参考 #452 / #577 / #315，移植预演隔离、正常开战输入和容量修复；局部站位按本地约束适配。
- 实验新策略仍包含 [IOLETA-POLICY §8](../IOLETA-POLICY.md) 中的 `[ASSUMED]` 参数，本轮不调整它们。
- 先运行种子 1–10，再用 11–20 复验，均为 NORMAL/HARD/ABYSS、单人固定罗素。
- 六组各 60 局，共 360 局；选定后在最终源码上重跑 baseline/capacity 各 60 局，总计 480 局。
- 最终 120 局的逐回合结果和胜负，与前两批同设置结果完全一致。没有把重复复跑当成新增独立样本。
- 源码指纹、开关、每个种子的窗口指标和三批摘要保存在 [机器可读证据](ai-refinements-2026-10-16.json)。

## 统计口径

窗口只包含普通战斗：`early10` = R1–10，`early11` = R1–11；`lateAfter10` = R11–13，
`lateAfter11` = R12–13。两种切法互相重叠，不能把四列相加。Boss/隐藏关另计。
`summarizeRecords({ minRound, maxRound })` 还支持任意绝对回合区间，边界均包含。

漏怪为 counted 场地漏怪，包含悬赏，不等于实际扣血；额外报告普通／悬赏／Boss 敌人、实际出怪、
玩家回合和漏怪率。死后无战斗不补零；每种方案保留全部结果，并按同种子双方共同参与的玩家回合配对。
本批前 11 回合双方全部存活，每难度均 220 玩家回合，因此前期降低不是死亡截断造成的。
实际出怪可能因分裂／召唤不同而变化，证据同时保留分母。

## 最终对照

每难度各 20 局；每格为“基线 → 演习＋容量修复”。

| 难度 | R1–10 漏怪 | R1–11 漏怪 | R11–13 漏怪 | R12–13 漏怪 | 通关 | 进入 Boss |
|---|---:|---:|---:|---:|---:|---:|
| NORMAL | 8 → 7 | 8 → 7 | 160 → 133 | 160 → 133 | 15 → 15 | 20 → 20 |
| HARD | 11 → 8 | 22 → 19 | 83 → 86 | 72 → 75 | 3 → 3 | 20 → 20 |
| ABYSS | 64 → 57 | 121 → 102 | 565 → 544 | 508 → 499 | 0 → 0 | 16 → 17 |
| 合计 | 83 → 72 | 151 → 128 | 808 → 763 | 740 → 707 | 18 → 18 | 56 → 57 |

前 10 回合降低 13.3%，前 11 回合降低 15.2%。HARD 后两回合增加 3 个漏怪，前期减少 3 个，
前 13 回合总数不变；不能描述为各阶段都更强。样本量较小，没有统计显著性或所有地图提升的结论。
按同难度同种子逐局配对，前 10 回合为 7 局改善、1 局退步、52 局持平；前 11 回合为 11 局改善、
2 局退步、47 局持平。仅验证了单人罗素，多人共享卡池下的收益需要另做配对评测。

## 各项贡献与取舍

1. **preview**：演习复用正常 `_normalOpts` 的种子、开战效果、敌人替换和战斗内叠层。
   `previewPlayer` 复制棋盘、手牌、临时区；受限 meta 上下文只读副本，写 API 不作用于真实状态，
   RNG 从当前状态克隆。异常丢弃候选，不污染真实错误计数。它评估当前整备状态下的开战输入，
   不预测尚未执行的休整结束效果或后续采购。本批前期改善来自这一项。
2. **capacity**：候选阵容计入撤下单位时检查手牌空间，购买评估先扣一个手牌格；未满部署数量时不为
   预留空格提前卖掉必要单位。相对 preview，本批只在 NORMAL 后两回合再少漏 11 个，前期持平。
   上游容量反例均通过，保留为评估正确性修复。
3. **guards**：完整阵型之后检查重卫；要求火力覆盖阻挡格及每条来敌路线前一格，且不降低几何估值。
4. **medics**：完整阵型之后尝试让有阻挡医疗离开无支援道路，并保留已覆盖友方的治疗。
   guards/medics 都不消耗 RNG，仅在非示教的普通回合候选中替换最后一个变体，保留第一候选及总预算；
   无新布局则不替换，Boss/隐藏关不变。本批两组相对 capacity 的战斗指标完全一致，未证明额外收益，保持关闭。
5. **cheap**：同分优先低价，但不越过既有核心合成优先级。合计前 10 回合相对 capacity 再少 1 个，
   前 11 回合却多 1 个（ABYSS 第 11 回合的取舍）；缺少稳定优势，保持关闭。

局部修复采用同预算候选替换，不是上游直接覆盖布阵的完整复制；因此本轮没有收益不代表上游算法普遍无效。
房主浏览器代演习属于负载优化，本轮未移植。

## 使用与复现

程序内显式选择 `m.botIoletaPolicy = 'experimental'`、`m.botFormationEnabled = false`，默认使用
`['preview', 'capacity']`；`m.botRefinements = []` 恢复原基线。其他策略／站位组合默认无本轮修复。

```sh
# 推荐方案；单独旧基线加 --refinements none
node tools/botbench.mjs --configs solo:NORMAL,solo:HARD,solo:ABYSS --seeds 20 --seed 1 --jobs 4 --band band_ioleta --ioleta-policy experimental --formation legacy --json .cache/recommended.json --quiet
# 最终配对复跑
node tools/botbench-refinements.mjs --groups baseline,capacity --out .cache/ai-refinements-final --seeds 20 --seed 1 --jobs 4
# 全六组，或重建已有结果摘要
node tools/botbench-refinements.mjs --seeds 20 --out .cache/ai-refinements
node tools/botbench-refinements.mjs --out .cache/ai-refinements-final --report-only
```

历史四组实验 `tools/botbench-factorial.mjs` 固定所有组默认 `--refinements none`，保持其原对照含义；
可以显式传相同修复给四组。运行时指纹现在覆盖 server/shared/data，旧的仅 bot 指纹不能混用配对。

## 验证

新增回归涵盖窗口边界与死亡截断、来源/设置校验、真实开战效果与叠层的优劣选择、试算隔离和失败回退、
状态零的 RNG 克隆、手牌容量反例、重卫接敌支援以及 Boss/隐藏关不变。

- 新增及相关专项：`tests 52; pass 52; fail 0`。
- 480 局评测均无引擎错误，最终 120 局逐回合复现前两批结果。
- `npm run golden`：49 roster + 46 bonds + 22 fields + 20 matches + 10 standins + 140 diy，287/287；本轮未更新 golden。
- `npm run ci -- --keep-going`：setup、smoke、lint、imports 命令、typecheck 均退出 0；
  测试摘要 `tests 6481; pass 6436; fail 5; skipped 40`。五项为已有的 Windows symlink EPERM、
  README 缺单人 24 小时重连说明、`public/fonts/` 缺失，以及两项并发网络限流测试。
- 网络测试独立复跑：`tests 66; pass 66; fail 0`。文档检查单独复跑 30/32，仅剩上述两项既有文档问题。
- imports 默认是非 strict，虽退出 0，仍报告 `server/sim/nodeData.js` 的三项既有 Node 导入边界诊断；未把它描述为零诊断。
- lint：0 errors / 135 warnings；`git diff --check` 通过。

日志保存在 `.cache/ai-refinements-{targeted,ci,lobby,docs,golden}.log`；原始对局位于上述三个 `.cache` 批次目录。
