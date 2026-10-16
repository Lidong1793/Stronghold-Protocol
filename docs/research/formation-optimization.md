# v0.2 示教站位与上游 0.3.0 AI 的组合实验

本轮仅比较 HARD、ABYSS；固定 experimental Ioleta + preview,capacity。当前全局默认不变。

## 实现与来源

用户 42 份示教布局及其 v0.2 区域/协作评分保留；上游 0.3.0 独立快照
`sganggs/Stronghold-Protocol@c24e17eec3af1e6dedfa9935a6d15245cf2f4586`
提供接敌支援和医疗安全站位的思路。没有替换项目或升级战斗引擎。

- ordered：阻挡、输出、医疗的放置顺序。
- contact：在此顺序上，奖励对所有来路的阻挡格及前一格火力支援；偏好医疗离开无支援道路。
- refined：完整部署后最多两轮合法格子/朝向微调，严格提高评分，自身格攻击阻挡不离开已有道路。
- combined：保留原候选优先级，再加入 v0.2、contact、refined，演习同分保留旧候选。

以上均为 [ASSUMED] AI 启发式，不改变官方战斗规则。只作用于示教地图普通 R1–13；
Boss/隐藏关、购买中的中间布局与召唤物逻辑保持原实现。额外候选不消耗随机数。
默认候选上限：旧站位 3，v0.2 与单个新变体 4，combined 6；combined 的改善包含额外计算预算。
关闭演习时 combined 使用原站位。运行时开关为 `m.botFormationEnabled=true`、
`m.botFormationMode='optimized'`，配合显式 `m.botIoletaPolicy='experimental'` 与
`m.botRefinements=['preview','capacity']`；目前为实验开关。

## 实验设计

第一轮：种子 21–26，每难度 6 局，legacy/learned/ordered/contact/refined，共 60 局。
第二轮：种子 1–10，每难度 10 局，legacy/learned/contact/refined/combined，共 100 局。
独立验证：种子 31–50，每难度 20 局，legacy/learned/contact/combined，共 160 局。
每轮内部核对源文件指纹、初始设置和种子配对；第一轮与后两轮代码指纹不同，不跨轮混用结果。
验证阶段不调数值参数；根据该批结果选择 HARD contact、ABYSS combined。随后冻结选择，在种子 51–70 上做最终确认（每难度每组 20 局，legacy/learned/optimized，共 120 局）。最终确认覆盖全部 7 张示教地图。完整逐回合记录在 `.cache/ai-formations-{screen,screen2,validation}/`。
统计包含实际淘汰回合，并提供共同存活回合配对，避免少活几轮造成漏怪更少的假象。
前 10 与前 11 回合为累计值；另记 R11–13 与 R12–13，Boss 不计入这些窗口。

## 复现

```sh
node tools/botbench-formations.mjs --groups legacy,learned,contact,refined,combined --seed 1 --seeds 10 --out .cache/ai-formations-screen2
node tools/botbench-formations.mjs --groups legacy,learned,contact,combined --seed 31 --seeds 20 --out .cache/ai-formations-validation
```

最后代码检查修正了医疗阻挡判定：原模型的 `block` 只计近战，医疗安全评分应读取
`rec.stats.blockCnt`。修正后在相同 51–70 种子重跑三组（120 场），ABYSS 新方案前 10/11
回合从 26/52 变为 27/53，后两回合和 Boss 到达数不变。下表、推荐和百分比以修正版为准；
历史探索记录保留原源指纹，最终复测原始记录在 `.cache/ai-formations-final/`。

## 推荐结果：v0.3 实验站位

推荐 `optimized`：HARD 用 contact，ABYSS 用 combined。其他难度沿用原 v0.2，未参与本次强度基准。
这是本次候选中的前期优先方案，并非所有种子、窗口均占优。全局默认未切换，旧站位与原 v0.2 均保留。

最终修正版确认（种子 51–70，每格为 20 局合计漏怪；前期指标不含 Boss）：

| 难度 | 方案 | R1–10 | R1–11 | R11–13 | R12–13 | 到达 Boss | 胜局 |
|---|---|---:|---:|---:|---:|---:|---:|
| HARD | 旧站位 v0.1 | 2 | 2 | 63 | 63 | 20 | 3 |
| HARD | 原 v0.2 | 1 | 1 | 61 | 61 | 20 | 3 |
| HARD | 新方案（contact） | 1 | 1 | 57 | 57 | 20 | 3 |
| ABYSS | 旧站位 v0.1 | 40 | 81 | 438 | 397 | 17 | 0 |
| ABYSS | 原 v0.2 | 25 | 70 | 378 | 333 | 18 | 0 |
| ABYSS | 新方案（combined） | 27 | 53 | 346 | 320 | 20 | 0 |

ABYSS 相比当前最佳旧站位，前 10 回合少漏 32.5%，前 11 回合少漏 34.6%；
相比 v0.2，前 10 回合多漏 2，前 11 回合少漏 17（24.3%），到达 Boss 18→20。
因此推荐偏重前 11 回合，保留前 10 回合的取舍；最终通关率尚未提高，ABYSS 仍为 0/20。
HARD 前期与 v0.2 持平，后两回合少漏 4，胜局相同。

最终确认的 R12–13 共同参战回合对比：新方案相对旧站位 HARD −6、ABYSS −77。
没有因更早淘汰而虚减漏怪；ABYSS 新方案反而全部到达 Boss。

验证阶段（31–50，选择难度分支所用，不能当作最终独立确认）：

| 难度 | 旧站位 R1–10 / R1–11 | v0.2 | contact | combined |
|---|---:|---:|---:|---:|
| HARD | 17 / 20 | 16 / 19 | **13 / 14** | 17 / 20 |
| ABYSS | 80 / 126 | 72 / 114 | 69 / 105 | **59 / 97** |

首轮 refined 在 HARD 有益而 ABYSS 退步，因此没有直接全局采用。第二轮 combined 在 ABYSS
前 10/11 回合为 8/24，旧站位为 12/28，v0.2 为 19/38，才进入后续验证。
四轮共 440 场，加医疗判定修复后的 120 场完整复测，共 560 场强度基准；仍是 112 个不同的难度/种子设置。另有两批各 6 场复用种子的单 worker 耗时测量。
所有基准完成且引擎错误为 0。各轮分开保存，不把多次执行当成独立样本。

## 耗时与启用

单 worker、种子 51 的前 11 回合准备耗时中位数（含采购、站位和演习，单位 ms）：

| 难度 | 旧站位 | v0.2 | 新方案 |
|---|---:|---:|---:|
| HARD | 108.4 | 133.0 | 132.7 |
| ABYSS | 99.2 | 116.2 | 176.7 |

这是本机每难度单局的粗略开销观察，不是性能置信区间；主基准的并发耗时不用于速度比较。
ABYSS 的额外演习约增加 60 ms 中位准备时间（相对 v0.2）；HARD 候选预算相同。

```sh
node tools/botbench.mjs --configs solo:HARD,solo:ABYSS --band band_ioleta --ioleta-policy experimental --formation optimized --refinements preview,capacity --seed 51 --seeds 20 --jobs 4 --json .cache/optimized.json
```

程序中设置 `m.botIoletaPolicy='experimental'`、`m.botFormationEnabled=true`、
`m.botFormationMode='optimized'`、`m.botRefinements=['preview','capacity']`。
`learned` 保留 v0.2；`botFormationEnabled=false` 保留旧站位。没有新增用户界面开关。

## 检查与证据

- 最终相关测试 60/60；覆盖新模式合法性、全部示教地图、确定性、Boss/RNG 不变、候选顺序及 1/3 演习预算。
- 最终 golden 287/287（49 roster、46 bonds、22 fields、20 matches、10 standins、140 diy）；未更新 golden 文件。
- 全量 CI 曾报 7 个测试失败：修复此次文档换行引入的 2 个失败；大厅 2 个并发失败单独重跑 66/66。
  剩余为既有 Windows symlink EPERM、README 重连说明缺失、public/fonts 缺失。文档专项 30/32。
- setup/smoke/lint/typecheck 通过；lint 有既有 135 warnings。imports 命令退出 0，仍报告既有 nodeData.js 的 3 项边界诊断。
- [机器可读证据](formation-optimization-2026-10-16.json) 包含各轮源指纹、原始记录 SHA-256、逐种子窗口和配对结果。
  原始回放记录在 `.cache/ai-formations-*/*.json`，日志在同名 `.log`；上游仍独立保存在项目之外。


最终确认复现：

```sh
node tools/botbench-formations.mjs --groups legacy,learned,optimized --seed 51 --seeds 20 --out .cache/ai-formations-final
```
