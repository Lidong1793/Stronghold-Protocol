# 卫戍协议站位决策优化交接给 Opus 5.5

更新日期：2026-10-16。本文件用于让 Opus 5.5 从 GitHub 接手站位决策设计。请先阅读下面的版本说明和仓库阅读步骤，再使用历史实验与附录。

## 0 当前 GitHub 状态与阅读入口

仓库为公开仓库：[YuliCao/Stronghold-Protocol](https://github.com/YuliCao/Stronghold-Protocol)，默认分支 **master**。

- **当前代码基线已合并上游 0.3.0**，并保留本地 AI 策略。对应提交：[975e1593](https://github.com/YuliCao/Stronghold-Protocol/commit/975e1593aa34ef6c2feec7152be364dce3059d23)。这不是仅下载上游作参考的阶段了。
- 本文最初写于合并前；交接文档和本地 AI 实验代码已保存于历史提交 `d725b632`。下面的 **560 场站位实验、60/60 专项测试、287 个 golden、源码/地图摘录及源指纹，都是合并前快照**，不能当成 0.3.0 当前工程的验证结果。
- 后续合并修改了战斗引擎、内容与整局 golden。最新集成记录见 [docs/history/0.3.0.md](https://github.com/YuliCao/Stronghold-Protocol/blob/master/docs/history/0.3.0.md)。其中记录 288 个 golden 匹配，但全量测试并非全绿；请区分集成测试与站位强度基准。
- 当前没有在本交接更新中重新跑 0.3.0 的 HARD/ABYSS 站位对照。**第一项工作应是在当前同一代码版本上重建 legacy / learned / optimized 三组基线**，再判断历史推荐是否仍成立。
- 本文旧段落中的“当前”“本轮”若涉及算法细节、测量、默认开关或待修风险，均指合并前实验状态；以实际 GitHub 源码及当前设计文档为准。附录保留原样用于追溯，不伪装成新版摘录。

### 给 Opus 的仓库阅读步骤

1. 先确认能实际读取仓库。报告读到的分支、完整提交 SHA 和 `package.json` 的版本；不能只读 README 就声称读过工程。
2. 依次阅读 `AGENTS.md`、`docs/ARCHITECTURE.md`、`docs/DESIGN.md`、`docs/META.md`、`docs/SIM.md`、`docs/history/0.3.0.md`，再读本文。
3. 阅读实际 AI 文件：`server/match/bot.js`、`botFormation.js`、`botFormationProfiles.js`、`botIoletaExperimental.js`、`botRefinements.js`，以及 `server/match/preview.js`、`server/match/match/combat.js`、`server/match/board.js`、`server/sim/dir.js`。需要时沿导入继续追踪，不能用本文摘录替代现有实现。
4. 阅读 `tools/botbench-formations.mjs`、`tools/botbench.mjs`、`tools/botbench/formations.mjs`、`tools/botbench/metrics.mjs`、`test/match/bot-formation.test.js`，核查当前候选生成、预算、演习、统计和回退逻辑。
5. 阅读 `docs/research/formation-optimization.md`、`formation-optimization-2026-10-16.json` 和 `layout-demonstrations.json`，将它们当历史证据。`.cache/` 中原始日志通常未上传，不能假定 GitHub 上存在；需要时请求本地执行者导出。
6. 输出“已经核实的当前实现”“历史证据”“待验证假设”三类结论。若可运行，则在独立分支进行实验；若只能阅读，则按第13节输出可由本地 Codex 实施的设计。

如有终端，可克隆后读取；已有 checkout 不要重新覆盖：

```sh
git clone https://github.com/YuliCao/Stronghold-Protocol.git
cd Stronghold-Protocol
git branch --show-current
git rev-parse HEAD
git status --short
```

需要改代码时先创建 `codex/opus-formation-next` 或其他清晰命名的新分支。任务完成可提交 PR 供用户检查，不直接推送 master、不自行合并 PR。

如果平台只提供网页读取，可以先用 [本文 Raw 文本](https://raw.githubusercontent.com/YuliCao/Stronghold-Protocol/master/docs/research/opus55-formation-handoff.md)，再按上述路径读取文件。如果平台无法访问 GitHub，须明确说明，并让用户连接 GitHub 仓库或上传 ZIP；单独收到网址不代表已经取得整个仓库。

## 以下为保留的实验交接内容

正文与附录保存了合并前的算法、42份示教、7张地图摘要和逐种子结果，可用于理解设计和提出假设。当前实现和当前强度需要按第0节重新核实。

## 1 直接交给接收方的任务

你负责完善站位决策设计。请先按第0节读取 GitHub 当前工程；有执行环境时可在新分支实现和验证，否则由本地 Codex 实现、运行真实引擎和反馈。明确区分当前源码事实、历史实验结论、推测和待采集证据，不声称运行了未执行的测试。

目标是把用户提供的 v0.2 示教站位与原上游 0.3.0 的 AI 思路结合，进一步降低 HARD、ABYSS 的前期漏怪，特别是累计前 10 回合和累计前 11 回合。不要测 NORMAL。用户允许多轮有序实验。保留 Boss/隐藏关站位与现有可回退方案，不升级或替换项目，不夹带经济策略、战斗机制改动。

请先评审当前实现与实验是否足以支持其推荐，再给出优先级明确的下一轮方案。不要只说“加强协同”“增加医疗覆盖”“使用强化学习”；需要具体输入字段、评分公式或比较关系、候选生成/修正步骤、伪代码、复杂度、候选预算、接入点、失败回退、消融设计和验收条件。未知机制可以列出需要本地代理验证的最小问题，但先完成可由本文支持的工作。

**特别注意：**用户同时关心前 10 和前 11 回合，并未授权“任意牺牲前 10 来换前 11”的固定加权。当前推荐有这方面小幅取舍；请优先寻找同时不退步的方案，若有取舍要展示 Pareto 关系，不能自行把任意综合分当作用户偏好。

## 2 项目和术语

这是《明日方舟》「卫戍协议：盟约」的非商业浏览器同人复刻。Node.js 服务端处理商店、经济、回合、房间和 AI；共享的确定性战斗模拟器运行于 Node 和浏览器。每回合准备期购买/合成/升级/装备并部署单位，随后自动战斗。敌人沿路线通向目标点，计入伤害的漏怪影响玩家生存。前期存活、战斗奖励和层数会影响后续阵容，故整局结果不仅反映单次战斗的静态站位。

三个版本轴不可混淆：

| 名称 | 含义 |
|---|---|
| 合并前项目 0.2.6 | 本文历史站位实验的引擎基底 |
| 当前项目 0.3.0 | 已通过 TempesTKF 合并上游，并保留本地 AI；须重建站位基准 |
| 站位 v0.1 / v0.2 / v0.3 实验版 | 旧站位 / 用户示教站位 / 本轮新候选与难度预设，与项目发布号无关 |
| experimental Ioleta | 罗素采购、合成和升级策略，与站位开关独立 |
| preview、capacity | 演习输入隔离/真实性修正，以及手牌与阵容容量修正，本轮比较全部固定启用 |

原上游：`https://github.com/sganggs/Stronghold-Protocol`，参考提交 `c24e17eec3af1e6dedfa9935a6d15245cf2f4586`。继承链为 sganggs → TempesTKF → YuliCao。早期研究时，上游源码以 ZIP 独立保存；这描述历史取样方式。之后已经完成 0.3.0 合并，当前应结合仓库提交记录审查，不要沿用“仅下载而未合并”的旧状态。

本地工程：`D:\Code\VibeProject\StrongholdProtocol`。历史 AI 修改和交接文档已经提交并推送。执行者仍须先检查自己的 git status，保护任何新增未提交修改，不得 reset 或整体覆盖。本次更新只修正文档，不另改 AI 行为。

## 3 范围与验收原则

- 新站位只用于有普通波次的 R1–13，且地图有示教 profile；显式排除配置中的 Boss 和 hidden 回合。未知地图沿用旧逻辑。
- Boss 通常 R14、隐藏核心通常 R15，具体以 `gd.bossRound/hiddenRound` 为准。前期改变可能改变 Boss 到达率和阵容，但不能修改 Boss 站位算法。
- 本轮强度证据只来自 **solo:HARD、solo:ABYSS，固定 band_ioleta**。不能推断多人或其他策略同样受益。
- 固定经济策略 `experimental` 和 `preview,capacity`，先只优化最后一次站位；购买过程中的临时布局、阵容选择、召唤物逻辑保持原实现。
- 额外搜索不得消耗 `m.rngBots`，不得污染实时棋盘、商店、层数或其他 RNG。真实决策改变后产生的后续状态差异是正常的，纯粹增加候选不能额外改变随机流。
- `server/sim/` 必须保持纯 ESM、确定性，不使用 Node API、时钟、Math.random 或未经允许的近似数学。站位算法在 `server/match/`，当前模型已有 Math.exp，不要把其规则误套为“模拟器允许 Math.exp”。
- 不手改生成的 `data/*.json`，不提交游戏美术。不改变官方机制；启发式权重标记 `[ASSUMED]`。
- 相同计算预算下比较算法，再单独报告更大搜索预算的收益。不要把增加演习次数的收益全部归功于新评分。

## 4 棋盘和实际合法性

普通部署区在全图坐标行 9–12、列 2–10，是最多 4×9 个格子的包围盒；不是所有格子可放人。坐标键是字符串 `"row,col"`。**行号向上增加**，不是常见屏幕坐标：UP=(+1,0)、RIGHT=(0,+1)、DOWN=(-1,0)、LEFT=(0,-1)。

所有 `rangeGrid` 都按朝 RIGHT 的相对 `[dr,dc]` 存储。旋转为 RIGHT:(dr,dc)，UP:(dc,-dr)，LEFT:(-dr,-dc)，DOWN:(-dc,dr)。候选朝向顺序 RIGHT、UP、DOWN、LEFT，同分保留更早候选。不能把全部干员固定朝右。

合法性来自玩家的 `ps.deployMap()` 与 `placeClass(ps, rec)`，受动态地形/装置影响：

- 地面 `melee` 格可放近战，也可放远程。**远程并非只能放高台。**
- 高台 `ranged` 格可放远程及被规则允许上高台的近战；不能把近战高台资格由职业名简单推断。
- 缺失的格不可部署；动态箱体、平台、地形覆盖都要服从实际 deployMap。
- 一格一个单位，不踩 occupied 保留格。候选需要同时决定格子和朝向。
- 医疗原始记录也可能 `stats.blockCnt=1`，即使 `position='RANGED'`。原伤害模型的 `unit.block` 仅为近战建立阻挡估计；**它不等于所有单位的实际阻挡数**。
- 有近身盲区的要塞类重装不一定适合当第一阻挡：其射程可能只有前方 3–5 格，不包含自身格。
- 射程需经过 `rangeRec(ps, rec)` 解析选定技能/模组/替身；不能只读基础 `rangeGrid`。其余动态战斗能力仍以真实模拟为准。
- 气流地形根据朝向调整攻击倍率；把同一覆盖格集合的不同朝向合并前，还要看气流倍率是否相同。
- 召唤物还可能受主人射程内/外等特殊约束，本轮新算法不接管其布局。

附录地图只展示静态部署格与路线，不能代替运行时玩家地形、波次或完整地图装置语义。

## 5 用户的 v0.2 示教究竟包含什么

用户确认了 42 份布局：7 张地图，各 6 种八人组合，名义阻挡/输出/治疗数为 2/5/1、3/4/1、4/3/1、2/4/2、3/3/2、4/2/2。数据保留角色、部署类型、阻挡数、射程格、位置、朝向，不保留干员身份；备注均为空。语料指纹 `046ba07edeaf63ed`。附录包含全部例子。

每图前 5 份训练角色区域频次，第 6 份留出。因此只验证了**已见地图上的新角色组合**，不是未见地图或新战斗强度的泛化。真实对局不固定八人。

v0.2 的角色识别：医疗为 heal；MELEE 且 TANK/PIONEER、blockCnt≥2，若射程含自身则 block，否则 support；其余 damage。示教的标签不等同于运行时所有实际战斗职责。

区域分：对该角色所有示教格 q，取 `max(该格频次/该角色最高频次/(1+曼哈顿距离(p,q)))`。它是软偏好，不是固定槽位，不存固定朝向。

关系分：前排被医疗覆盖 +1.4，其他攻击单位被医疗覆盖 +0.7；攻击单位覆盖另一阻挡单位的格子 +1；每条有近身阻挡单位的地面路线 +1.5。前排指模型中有阻挡、射程含自身且站在路上的单位。再乘 `Σ路线敌人数 × 0.3 / max(4,上场人数)`，加到旧伤害暴露评分上。权重是手写启发式，没有统计拟合。

几何留出检查的历史结果：42 个非治疗单位中被治疗覆盖从 32 提升到 39，人工示例 41；但这不等于生存能力、有效治疗量或真实少漏怪。v0.2 先放阻挡、再医疗、再输出，局部选点会受顺序影响。

## 6 合并前决策流水线和接口

1. `chooseLineup` 决定本次部署哪些棋子；这一步不属于本轮优化。
2. `arrangeSteps(...,{final:true})` 构造多个站位候选。
3. 普通候选由 `planLayoutSteps` 贪心逐人选合法格+朝向。
4. 去重并取预算内候选，调用真实战斗引擎做演习。
5. `applyPlanSteps` 用真实移动接口落实，处理占用交换、未部署单位的合法回退，再放召唤物。

输入对象摘要（不是完整 API，附录代码可校对）：

```ts
m: { round, difficulty, stageId, stage, wave, gd, rngBots,
     botRehearsal, botFormationEnabled, botFormationMode, botIoletaPolicy, botRefinements }
ps: { gd, board: Map<string,Piece>, hand, deployMap(), loadoutFor(), ... }
Piece: { uid:number, id:string, kind:'chess'|'token', dir?, ... }
Record: { chessId, position, profession, subProfessionId, attackKind, dmgType,
          rangeGrid:[number,number][], stats:{atk,bat,aspd,blockCnt,...}, ... }
Model: {
  routes: {n,fly,tiles:string[],tileTime,hp,dwell}[],
  index: Map<string,[routeIndex,tileIndex][]>,
  ground: Map<string,{flow,prog}>,
  armor: {def,res,w}[], airflow:Map, dps:Map, flyTotal:number
}
LayoutUnit: {rec,key,dir,dps,atkMul,air,ground,block,heal,cover:Set<string>}
// LayoutUnit.ground 是能否对地输出，不是“站在地面”；Model.ground 才是地面路线格集合。
LayoutPlan: Map<uid,string> & { dirs:Map<uid,dir>, dirOf(uid):dir }
```

`fieldModel` 根据本回合敌人按路线统计数量、平均 HP/速度、装甲分布。路径从入口到目标，裁剪到己方区域且去掉目标格。无有效数据有静态路线回退。`index` 可反查经过某格的所有路线及下标；不要假设每格只有一条路线。

路线抽象会把同一路线敌人平均化，没有保留完整时间轴、波次重叠或阻挡饱和。`effDps` 用攻击/间隔与粗略群攻系数计算对本回合敌人 DEF/RES 的有效 DPS，再按敌人 HP 权重平均；不是完整技能输出曲线。

## 7 旧暴露评分与新候选

旧评分近似每个敌人经过各格的受伤量：

`value = Σroute n * (1 - exp(-exposure/(kill*hp))) - 路上非模型阻挡者惩罚`

每格时间约为 `tileTime + hold*blockCount*二道防线系数*(1+healHold*min(2,覆盖该格的医疗数))`，再乘该格有效 DPS 累加 exposure。基础参数 hold=4、kill=1.5、secondHold=0.5、healHold=0.5、roadPenalty=0.15、spread=99。路线上的阻挡者不能继续计入敌人已经越过自身后的对地伤害；盟友火力和对空另算。治疗只按覆盖人数增益，并没有估计 HPS、承伤、治疗目标竞争或阵亡。

当前可选模式：

| 模式 | 生成逻辑 | 默认实际演习预算上限 |
|---|---|---:|
| legacy，v0.1 | 旧暴露模型的参数变体 | 3 |
| learned，v0.2 | 旧候选 + 示教候选，示教候选排首位 | 4 |
| ordered | 示教区域不变，顺序改为阻挡→输出→医疗 | 4 |
| contact | ordered + 接敌支援/医疗安全分 | 4 |
| refined | contact 全阵型完成后，逐人全合法格/朝向微调，最多两轮，只接受评分严格提高 | 4 |
| combined | 旧候选在先，追加 learned/contact/refined | 6 |
| optimized，v0.3 实验预设 | HARD 选 contact，ABYSS 选 combined，其他难度 learned | 4 或 6 |

接敌分：地面阻挡点的**每一条来路**都必须有另一名非医疗、可对地输出且 DPS>0 的盟友，同时覆盖阻挡格与路径前一格，才算有支援。有支援阻挡 +2；可阻挡医疗在非道路 +2，在有支援道路 +1，在无支援道路 −2。医疗按原始 stats.blockCnt 判断，其他单位仍用模型 block。该分与 v0.2 关系分一起缩放，不是强制安全约束。

refined 的邻域目前仅为把一个棋子移动到空格或原格、改变朝向，不包含两人交换/联合移动；保持已经站在路上的自身格攻击阻挡不离路。完整阵型的评分非下降不保证真实战斗改善。

旧 planner 会尝试 5 个参数变体：原参数、{spread:3,secondHold:0.2}、{hold:2}、{hold:8}、{kill:3}，再去重并按预算截取；“预算 3”不等于“只生成 3 个方案”。完整接入代码见附录。

### 一个值得优先核查的代码细节

当前 combined 在追加新候选前执行 `plans.splice(m.botRehearsal)`，而 legacy 是在 `distinctPlans` 之后截取预算。如果原始前几个变体重复，后面的旧变体可能本应进入 legacy 的前 3 个唯一候选，却被 combined 的提前截断丢弃。因此“combined 保留全部旧候选”的说法不是对所有输入成立的已证明不变量。此点是本次交接静态阅读识别的条件风险，尚未定位实际受影响种子，也未修改运行代码。请设计去重顺序明确的候选构造及重复候选单测，再通过真实对照验证；不要直接宣称它解释了某局漏怪。

## 8 演习选择及其边界

本轮全部启用 `preview`：候选棋盘/手牌/临时区独立拷贝，重新计算羁绊，用 `_normalOpts(ps,{preview:true,board})` 构造与普通战斗一致的输入，包含战斗开始效果、替换与战内层数；使用真实普通战斗种子 `deriveSeed(m.seed, 'n:'+round+':'+seat)`。RNG clone 不推进实时随机流，演习修改器隔离。旧代码注释中“演习永远使用不同 seed、没有开始效果”只描述未启用 preview 的历史路径，**不适用于本轮结果**。

演习使用真实 Battle、固定 tick；评分为 `-1000*计入的漏怪数 + 击杀数 - candidateIndex*0.01`，同结果偏好先来的候选。每 64 tick 若当前计入漏怪已经超过最好结果可提前停止；有总 tick 上限，允许分片调度。候选构建失败会中止后续构建，已有候选仍可能被评估；不要把异常当成高分。外部 wall-clock 预算只调度计算，不可让新搜索依机器速度选择不同答案。

演习不是完美预言：它基于**当下准备状态**，没有预演未来购买或尚未执行的 prep-end 行为。候选只包含本次选定单位，最终摆放后召唤物及其他流程也可能形成差异。具体差异需捕获相同回合的演习与真实 BattleSpec 对比，不要先入为主归因。已启用同种子预览是模拟器 AI 的既有设计；可以建议鲁棒性评估，但别用随机扰动引入未经验证的机制。

采购策略保持 experimental Ioleta：以精锐数量、三助力/三坚守/两精准（次选两助力/三坚守/三精准）等目标调整购买、升级和合成。capacity 修正会在评估购买/阵容时考虑可退回手牌的现有单位和购买所需手牌槽。站位比较不要同时改这些条件，也不能比较一个默认开启 preview/capacity 的旧站位与一个未开启它们的新站位。

## 9 合并前实验结果和可信边界

最终修正版，同种子 51–70，每难度每方案 20 局，固定 experimental + preview,capacity：

| 难度/方案 | R1–10漏怪 | R1–11漏怪 | R12–13漏怪 | 到达Boss | 胜局 |
|---|---:|---:|---:|---:|---:|
| HARD legacy | 2 | 2 | 63 | 20 | 3 |
| HARD learned | 1 | 1 | 61 | 20 | 3 |
| HARD optimized=contact | 1 | 1 | 57 | 20 | 3 |
| ABYSS legacy | 40 | 81 | 397 | 17 | 0 |
| ABYSS learned | 25 | 70 | 333 | 18 | 0 |
| ABYSS optimized=combined | 27 | 53 | 320 | 20 | 0 |

ABYSS 新方案比 v0.2 前 10 回合多漏 2、前 11 回合少漏 17（24.3%），进入 Boss 增加 2 局，但没有证明最终能通关。HARD 这批早期漏怪已接近零，有地板效应，不宜只据此认定模型解决了高难度问题。

统计包含普通与悬赏的计入漏怪；非计入敌人排除。分母使用实际生成敌人（包括子敌人），并保留预定出怪数。淘汰回合计入，淘汰后不存在的回合不补零。R1–10、R1–11 是重叠累计窗口，不能直接相加；R11 单回合可用两者差值。另提供 R11–13、R12–13。Boss/hidden 不混入普通回合窗口。

后期除了全量总数，还按每个 config/seed/player 双方都实际参加的回合配对。最终新方案相对 legacy 的 R12–13 配对漏怪差 HARD −6、ABYSS −77。这不是早死造成的虚假改善。

实验过程：

1. 21–26：五组 legacy/learned/ordered/contact/refined，各难度6局，总60；refined 对 HARD 有收益，对 ABYSS 退步。
2. 1–10：五组 legacy/learned/contact/refined/combined，各难度10局，总100；combined 的 ABYSS 前10/11为8/24，legacy12/28，learned19/38。
3. 31–50：四组 legacy/learned/contact/combined，总160；用于选择 HARD contact、ABYSS combined。HARD 前10/11依次17/20、16/19、13/14、17/20；ABYSS80/126、72/114、69/105、59/97。
4. 51–70：三组 legacy/learned/optimized，总120，确认选定预设；之后发现远程医疗阻挡判定遗漏，修复后在相同种子完整重跑120。修复让 ABYSS 新方案26/52变为27/53，最终表使用修正版。

共560场强度运行，但只有112个不同的难度/种子组合；不得把复测当成独立样本。前几轮医疗安全评分不完整，不能把它们当成当前代码的完全等价消融。各轮内部源指纹一致，跨轮不同。没有做统计显著性承诺，没有证明这是全局最优。

单 worker、种子51的一次耗时观察，前11回合整个准备流程的耗时中位数（包含采购、启发式和演习）：HARD legacy108.4ms、learned133.0ms、optimized132.7ms；ABYSS99.2ms、116.2ms、176.7ms。只表示粗略代价，不是每个候选平均耗时，也不是稳定性能区间。

## 10 值得研究的方向与尚缺证据

下面是研究候选，**没有完成验证**。请自行判断先后，必要时反驳。

1. **先保证候选组合与演习比较可靠。** 核查去重/截断顺序；记录哪些候选真正进入演习、评分、谁获选；区分“没有生成更好布局”和“选错/应用失败”。
2. **有限邻域联合修正。** 单人空格移动无法解决拥挤棋盘的两人交换、阻挡/医疗联合移动、先暂时降分才能改善等情况。可设计确定性小邻域、top-K 候选、局部 beam，不无限枚举全排列。
3. **接敌评分从二元覆盖变为需求匹配。** 弱输出仅覆盖格子即可通过支援判定；缺少敌人装甲、流量、到达时刻、每路输出缺口的分配。但要防止多个阻挡点重复占用同一份 DPS 预算。
4. **阻挡时间估计不应把 blockCnt直接等同生存时长。** 可探索有效承伤、治疗供给与敌人爆发的保守模型；当前没有逐单位死亡、堵塞溢出或伤害时间线，不能声称已知哪个因素主导。
5. **医疗职责与安全的联合优化。** 目前简单覆盖+安全加分没有 HPS、目标竞争、治疗死角和分散需求；不应硬性“所有医疗必须离路”而破坏关键治疗。
6. **示教先验的强度随局势调整。** 42例都是八人抽象布局；开局只有少量棋子，强套区域可能过早分散。可按阵容人数、路线压力或模型置信度调整先验，但不要按训练种子或地图结果表硬编码。
7. **评价器与真实模拟差异。** 对反例捕获候选 BattleSpec、实际 BattleSpec、准备结束动作及召唤物；先证明是否存在演习误差，再改选择器或增加鲁棒演习。
8. **前10与R11的折中。** 检查单独R10/R11、逐地图/禁用羁绊/角色构成；可以提出阶段自适应，但先声明新规则来自假设，并用新种子验证，不能把已看过的51–70继续叫全新留出集。

现有基准逐回合仅记录 level/units/bonds/layers/value/elites/items、LP、击杀/漏怪、敌人种类等聚合信息；`preps`主要是时长。**没有完整上场棋子ID→格子/朝向快照，也没有逐单位死亡、有效治疗、阻挡溢出时间线。** 附录的逐种子结果只能用于挑选诊断案例，不能还原漏怪因果。

建议新增诊断而不改变战斗：candidateId、候选来源、布局签名、棋子实际配置、各分项分值、实际候选预算、演习漏怪/击杀及异常、最终实际应用布局、演习/实战输入摘要、R10/R11计入漏怪和漏怪敌人ID。如需战斗事件，先检查引擎已有可读事件接口，避免为了日志改变模拟逻辑。

## 11 给本地执行者的实验安排

第一阶段先做最小诊断与确定性回归；第二阶段一次只改一类机制，冻结源代码后跑同种子配对；第三阶段锁定候选再用未用于选择的新种子验证。已使用的种子为1–10、21–26、31–70；未来可从71以上预先固定筛选和最终留出集，或按地图/禁用组合分层，**新增独立种子范围必须事先记录，不按结果挑选**。

必须保留三个基线 legacy、learned、当前 optimized。先以同样候选预算检验新评分或搜索，再单独做增加预算的实验。当前工具把 formation 枚举当实验组；新增模式要更新 `FORMATION_MODES`，报告器要保证策略/refinements/初始 setup/schema/source 相同。要做“旧候选预算增加但无新算法”的公平对照，目前还需扩展 runner：现有脚本没有按组配置不同 rehearsal 预算的接口。

报告每个难度的前10、前11、单独R11、R11–13、R12–13，普通/悬赏漏怪，敌人数和参战回合分母，配对改善/持平/退步种子数，Boss到达与通关、准备耗时。不要只汇总两种难度的总漏怪。先追求两个早期窗口同时不退步；任何折中都单列，权重若要变成产品决策需明确。

在当前工程重建对照的命令入口（结果属于新的代码版本，不应期待重现下面历史数字；接收方不能运行时交给本地代理）：

```powershell
node tools/botbench-formations.mjs --groups legacy,learned,optimized --seed 51 --seeds 20 --out .cache/ai-formations-reproduce
node tools/botbench.mjs --configs solo:HARD,solo:ABYSS --band band_ioleta --ioleta-policy experimental --formation optimized --refinements preview,capacity --seed 71 --seeds 10 --jobs 4 --json .cache/next-screen.json
```

第二条只示范新种子入口，不能单独当作有完整配对的结论。`botbench-formations` runner 默认且仅允许 HARD/ABYSS；不要误用旧 refinement runner 的包含 NORMAL 的默认配置。

当前运行时启用：

```js
m.botIoletaPolicy = 'experimental';
m.botFormationEnabled = true;
m.botFormationMode = 'optimized';
m.botRefinements = ['preview', 'capacity'];
```

全局默认尚未切换，仍保留原默认策略/示教站位；没有新UI开关。显式 false 禁用示教；仅设置 mode 不应假定已经打开 experimental 采购或 preview。未来部署默认变更应作为独立、明确的决策。

## 12 文件索引与历史验证状态

| 文件 | 职责 |
|---|---|
| server/match/bot.js | fieldModel、Layout、planLayoutSteps、arrangeSteps、createRehearsalSteps、应用布局 |
| server/match/botFormation.js | profile适用范围、角色/区域/关系/接敌分、optimized难度选择 |
| server/match/botFormationProfiles.js | 由示教生成的角色频次 |
| server/match/board.js；server/sim/dir.js | 合法部署格、部署类型、坐标与朝向 |
| server/match/preview.js；match/combat.js；effectsMeta.js | 演习隔离、普通战斗输入与开始效果 |
| server/match/botIoletaExperimental.js；botRefinements.js | 固定采购策略及独立修正开关 |
| tools/botbench.mjs；tools/botbench-formations.mjs；tools/botbench/formations.mjs | 完整对局、实验组、严格配对报告 |
| tools/botbench/metrics.mjs | 分窗、暴露和漏怪统计 |
| docs/research/layout-demonstrations.json；tools/layout-lab/learn.mjs | 示教原料与profile生成 |
| test/match/bot-formation.test.js；test/botbench-metrics.test.js | 站位/预算/确定性、统计回归 |

合并前记录：相关测试60/60，golden287/287不变。完整CI并非全绿：既有Windows symlink EPERM、README重连说明缺失、public/fonts缺失；大厅并发失败独立重跑66/66。lint零错误但135条既有警告；imports退出0仍有nodeData.js三项旧边界诊断。不要将这些旧问题误判为新站位性能或功能问题，也不能声称所有CI都通过。

改动后先跑相关测试，再按项目要求跑CI/golden；生成规则变更须更新docs/design、当前history、META。合并0.3.0时已经更新整局golden，详见当前发布历史；不能将其回滚到合并前结果。若真正修改默认游戏行为且需要变更golden，应明确列出移动场景与原因。

## 13 请 Opus 按此格式交付

1. **结论与审查**：当前最值得修复/验证的3–5个问题，分别给代码证据、推测、所缺证据和预期影响；明确是否保留当前难度分流。
2. **最小可实施方案**：函数签名、输入/输出、具体算法与伪代码；如何维持合法性、方向、特殊射程、同分稳定、随机流和Boss回退。
3. **候选生成与选择预算**：候选组成、去重顺序、是否保留旧候选、每轮搜索上限、真实演习数量、无有效候选/异常时的回退；估计时间复杂度而非猜测固定毫秒。
4. **评分定义**：每项计算方法、单位/量纲、归一化、防止重复计分的方法；权重初值标注假设与调参范围。不把示教覆盖率当实战目标。
5. **最小诊断数据需求**：先能支持哪几个反例判断；给JSON草案，字段没有API时写明需要本地检查。
6. **实验矩阵与验收**：固定条件、等预算消融、新种子/留出方案、前10/11取舍与后期保护指标、明确淘汰条件。
7. **可交给本地Codex执行的任务清单**：第一批、第二批和仅在前两批证据支持时做的后续项；每批列修改文件、测试、停止/回退条件。避免一次同时重写采购、阵容、站位与模拟器。

如果认为当前最合理的是先修演习/候选管理而非发明新评分，请直接提出。请挑战现有方案，不必维护前一位代理的判断；但不要把缺少验证的建议包装成已获得提升。

---

# 技术附录（合并前快照）

以下为合并0.3.0之前本地实现/数据的直接摘录，不是接收方可独立运行的完整工程。代码依赖的未展开函数以正文合同为准；不应凭片段虚构完整类定义。原始文件名与SHA-256用于本地核对。

## 源码 server/match/botFormation.js

SHA-256（完整文件原始字节）：`4da16a1de6588bb528c6f55a45dda72666a246b6972aa94f1b446e32def3a869`

```js
// [ASSUMED] Normal-round positioning preferences distilled from the owner's 42 layouts.
// docs/research/layout-learning.md records the evidence, held-out cases and match comparisons.
import { FORMATION_PROFILES } from './botFormationProfiles.js';

const tileValues = new WeakMap();

// [ASSUMED] Experimental combinations of owner v0.2 zones and upstream 0.3 contact/safety ideas.
export const FORMATION_MODES = ['legacy', 'learned', 'ordered', 'contact', 'refined', 'combined', 'optimized'];

/** Explicit experimental preset; unmeasured difficulties retain owner v0.2. */
export function resolveFormationMode(m) {
  const mode = m.botFormationMode || 'learned';
  if (mode !== 'optimized') return mode;
  return m.difficulty === 'HARD' ? 'contact' : m.difficulty === 'ABYSS' ? 'combined' : 'learned';
}

export function contactValue(model, units) {
  let value = 0;
  for (const u of units) {
    // The damage model's `block` excludes ranged professions; medics still have real blocking stats.
    const block = u.heal ? (u.rec?.stats?.blockCnt ?? u.block) : u.block;
    if (!(block > 0)) continue;
    if (!model.ground.has(u.key)) { if (u.heal) value += 2; continue; }
    const routes = (model.index.get(u.key) || []).filter(([ri]) => !model.routes[ri].fly);
    if (!routes.length) continue;
    const supported = routes.every(([ri, i]) => units.some(a => a !== u && !a.heal && a.ground && a.dps > 0
      && a.cover.has(u.key) && a.cover.has(model.routes[ri].tiles[Math.max(0, i - 1)])));
    if (supported) value += u.heal ? 1 : 2;
    else if (u.heal) value -= 2;
  }
  return value;
}

export function formationProfile(m) {
  // Explicitly exclude both boss modes even if a caller supplies a stale normal wave.
  if (!m.wave || !Number.isInteger(m.round) || m.round < 1 || m.round > 13
    || m.round === m.gd.bossRound || m.round === m.gd.hiddenRound) return null;
  return FORMATION_PROFILES[m.stageId] || null;
}

export function formationRole(rec) {
  if (rec.attackKind === 'heal' || rec.dmgType === 'heal') return 'heal';
  if (rec.position === 'MELEE' && ['TANK', 'PIONEER'].includes(rec.profession) && rec.stats?.blockCnt >= 2) {
    return rec.rangeGrid?.some(([r, c]) => r === 0 && c === 0) ? 'block' : 'support';
  }
  return 'damage';
}

/** Soft terrain-specific deployment zones, not fixed slots: actual legality/ranges always win. */
export function formationTileValue(profile, role, key) {
  let cache = tileValues.get(profile);
  if (!cache) { cache = new Map(); tileValues.set(profile, cache); }
  const cacheKey = `${role}|${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const cells = profile[role] || {};
  const peak = Math.max(1, ...Object.values(cells));
  const [r, c] = key.split(',').map(Number);
  let best = 0;
  for (const [k, count] of Object.entries(cells)) {
    const [rr, cc] = k.split(',').map(Number);
    best = Math.max(best, count / peak / (1 + Math.abs(r - rr) + Math.abs(c - cc)));
  }
  cache.set(cacheKey, best);
  return best;
}

/** Score formation relationships without assuming a particular roster or always facing RIGHT. */
export function formationValue(model, units, profile) {
  const healers = units.filter(u => u.heal);
  const fronts = units.filter(u => u.block > 0 && u.cover.has(u.key) && model.ground.has(u.key));
  let value = 0;
  for (const u of units) {
    value += formationTileValue(profile, formationRole(u.rec), u.key);
    if (!u.heal && healers.some(h => h.cover.has(u.key))) value += fronts.includes(u) ? 1.4 : 0.7;
    // A rear dealer should reach a blocking point (including from its side). A dead-zone
    // fortress stays useful behind a defender instead of taking the foremost blocking tile.
    if (!u.heal && u.dps > 0 && fronts.some(f => f !== u && u.cover.has(f.key))) value += 1;
  }
  for (const rt of model.routes) {
    if (rt.fly) continue;
    const onRoute = fronts.filter(u => rt.tiles.includes(u.key));
    if (onRoute.length) value += 1.5;
  }
  return value;
}
```

## 源码 server/match/botFormationProfiles.js

SHA-256（完整文件原始字节）：`173f8aafd1abad9501089a0402829c04daef7193116c3b0a1b8d43efc3d3b3b1`

```js
// Generated by tools/layout-lab/learn.mjs from confirmed owner layouts (2026-10-15).
// Five examples/map train these role frequencies; example 6 is reserved for validation.
// No operator identities, directions or boss layouts are encoded.
export const FORMATION_PROFILES = Object.freeze({
  "act1autochess_m02": {"block":{"12,8":1,"11,8":1,"11,7":2,"12,7":3,"11,6":1,"12,6":1},"damage":{"11,6":4,"12,6":4,"11,7":2,"12,7":1,"10,6":4,"11,5":2,"12,5":1,"11,8":1},"heal":{"11,5":1,"11,4":1,"10,5":3,"12,5":2},"support":{"12,5":1,"11,4":1,"12,4":1,"11,5":2}},
  "act1autochess_m03": {"block":{"9,6":4,"10,5":2,"9,5":1,"10,6":1},"support":{"9,3":3,"9,4":1,"10,5":1,"9,6":1},"damage":{"10,5":2,"9,5":4,"10,4":4,"9,4":4,"10,3":2,"9,3":1,"11,7":1,"10,6":1},"heal":{"12,5":3,"10,3":3,"9,3":1}},
  "act1autochess_m04": {"support":{"11,7":2,"10,7":2,"10,4":2,"11,5":1,"10,5":1,"11,8":1},"heal":{"11,4":2,"11,5":3,"10,6":1,"10,4":1},"damage":{"11,6":5,"10,5":4,"10,6":4,"11,5":1,"10,4":1,"10,8":1,"10,7":1,"11,7":2},"block":{"10,7":2,"11,8":1,"10,8":1,"11,7":1}},
  "act2autochess_m01": {"damage":{"10,5":4,"11,5":3,"12,4":2,"10,4":3,"11,4":3,"12,7":1,"12,6":1,"12,5":2},"block":{"12,6":4,"12,5":2,"10,5":1,"9,5":1,"11,7":2,"12,7":2},"heal":{"9,5":1,"9,4":1,"12,5":1,"10,4":1,"12,4":1,"11,4":1,"11,5":1},"support":{"9,4":1,"10,7":1}},
  "act2autochess_m02": {"damage":{"10,6":5,"9,4":2,"10,5":5,"11,6":2,"11,8":1,"9,5":2,"9,3":1,"12,6":1},"heal":{"10,4":5,"11,5":1,"11,6":1},"block":{"9,5":2,"9,6":4,"9,7":3},"support":{"9,4":3,"9,5":1,"9,6":1}},
  "act2autochess_m03": {"damage":{"9,5":1,"9,6":1,"10,7":1,"10,6":4,"12,6":1,"10,5":2,"11,6":3,"11,7":2,"11,5":3,"10,4":1},"block":{"10,8":1,"12,7":3,"10,6":1,"12,6":1,"10,7":3},"heal":{"11,5":1,"11,4":4,"10,5":1,"11,6":1},"support":{"9,5":1,"11,5":1,"10,5":1,"10,4":1,"12,6":1}},
  "act2autochess_m04": {"support":{"11,4":2,"11,5":2,"12,5":3},"block":{"11,5":3,"12,5":1,"11,4":2,"12,4":1},"damage":{"10,5":5,"10,4":2,"11,3":5,"12,4":4,"10,3":1,"12,3":1,"11,4":1},"heal":{"9,4":1,"10,3":4,"12,3":1,"10,4":1}},
});
```

## bot.js 摘录 旧评分与单位模型

```js
export const LAYOUT_PARAMS = Object.freeze({ hold: 4, kill: 1.5, secondHold: 0.5, healHold: 0.5, roadPenalty: 0.15, spread: 99 });

/**
 * Exposure model of a layout: every enemy of route ρ spends tileTime on each tile of its route (plus the hold time
 * of blockers standing on it: hold × blockCnt, later blockers on the same route secondHold ×, healer-covered
 * blockers (1 + healHold) ×) and takes the DPS of every unit whose range covers that tile (flyers: anti-air only).
 * Value = Σρ n × (1 − e^(−exposure / (kill × hp))) — the expected enemies killed.
 */
class Layout {
  constructor(model, params) {
    this.model = model;
    this.p = params;
    this.units = []; // { rec, key, dps, air, ground, block, heal, cover: Set }
  }

  value() {
    const { routes } = this.model;
    const p = this.p;
    const cover = new Map(); // key → { g: dps on ground, a: dps on air }
    const healCover = new Map();
    for (const u of this.units) {
      for (const k of u.cover) {
        const e = cover.get(k) || { g: 0, a: 0 };
        if (u.ground) e.g += u.dps;
        if (u.air) e.a += u.dps;
        cover.set(k, e);
        if (u.heal) healCover.set(k, (healCover.get(k) || 0) + 1);
      }
    }
    const blockAt = new Map();
    for (const u of this.units) if (u.block > 0 && this.model.ground.has(u.key)) blockAt.set(u.key, (blockAt.get(u.key) || 0) + u.block);
    let total = 0;
    for (const rt of routes) {
      let exp = 0;
      let lastBlock = -Infinity;
      // [ASSUMED] A road blocker cannot count on hitting the same ground enemy after
      // it has passed its blocking tile. Prefer exposure on approach (usually RIGHT).
      // Keep flying exposure and allies' fire independent of this unit's own block.
      const passedDps = new Map();
      if (!rt.fly) for (const u of this.units) {
        if (!u.block || !u.ground || !this.model.ground.has(u.key)) continue;
        const stop = rt.tiles.indexOf(u.key);
        if (stop < 0) continue;
        for (let j = stop + 1; j < rt.tiles.length; j++) {
          const key = rt.tiles[j];
          if (u.cover.has(key)) passedDps.set(j, (passedDps.get(j) || 0) + u.dps);
        }
      }
      for (let i = 0; i < rt.tiles.length; i++) {
        const k = rt.tiles[i];
        let t = rt.tileTime + (i < 2 && rt.dwell ? rt.dwell : 0);
        if (!rt.fly && blockAt.has(k)) {
          // a blocker right behind another one mostly holds what slipped past; a separate line holds again
          const fresh = i - lastBlock >= p.spread;
          t += p.hold * blockAt.get(k) * (fresh ? 1 : p.secondHold) * (1 + p.healHold * Math.min(2, healCover.get(k) || 0));
          lastBlock = i;
        }
        const c = cover.get(k);
        if (c) exp += t * (rt.fly ? c.a : Math.max(0, c.g - (passedDps.get(i) || 0)));
      }
      total += rt.n * (1 - Math.exp(-exp / (p.kill * rt.hp)));
    }
    // ranged units standing on a road block and get hit: a small penalty per road tile they occupy
    for (const u of this.units) if (!u.block && this.model.ground.has(u.key)) total -= p.roadPenalty * this.model.ground.get(u.key).flow;
    return total;
  }
}

function unitOf(rec, key, r, c, dir = 'RIGHT', model = null) {
  const block = isBlocker(rec) ? Math.max(1, rec.stats?.blockCnt ?? 1) : 0;
  const atkMul = airflowAtkMul(model, key, dir);
  return {
    rec, key, dir, dps: effDps(model, rec) * atkMul, atkMul, air: hitsFly(rec), ground: rec.attackKind !== 'heal' && !isHealer(rec),
    block, heal: isHealer(rec), cover: new Set(rangeTiles(rec, r, c, dir)),
  };
}
```

## bot.js 摘录 贪心规划与完整布局微调

```js
export function* planLayoutSteps(m, ps, pieces, params = LAYOUT_PARAMS, { occupied = new Set(), recOf = null, formation = false, formationMode = resolveFormationMode(m) } = {}) {
  const model = fieldModel(m, ps);
  const map = ps.deployMap();
  const pgd = ps.gd || m.gd;
  const rec = recOf || ((p) => (p.kind === 'token' ? pgd.token(p.id) : rangeRec(ps, pgd.chess(p.id))));
  const layout = new Layout(model, params);
  const profile = formation && formationProfile(m);
  const formationScale = profile ? model.routes.reduce((n, rt) => n + rt.n, 0) * 0.3 / Math.max(4, pieces.length) : 0;
  const mode = formationMode;
  const contact = profile && ['contact', 'refined'].includes(mode);
  const score = () => layout.value() + (profile ? formationScale * (formationValue(model, layout.units, profile)
    + (contact ? contactValue(model, layout.units) : 0)) : 0);
  // In a taught formation, establish the defence and healing footprint before placing rear dealers.
  const rank = (p) => {
    const r = rec(p);
    if (profile && r) {
      const role = formationRole(r);
      return role === 'block' ? 0 : role === 'heal' ? (mode === 'learned' ? 1 : 2) : (mode === 'learned' ? 2 : 1);
    }
    return isBlocker(r) ? 0 : isHealer(r) ? 2 : 1;
  };
  const order = pieces.slice().sort((a, b) => rank(a) - rank(b) || dpsOf(rec(b)) - dpsOf(rec(a)) || a.uid - b.uid);
  const taken = new Set(occupied);
  const out = new LayoutPlan();
  for (const p of order) {
    const r0 = rec(p);
    if (!r0) continue;
    let best = null;
    let bestV = -Infinity;
    // a "只能部署在召唤者攻击范围内" summon (伺夜's 狼群, 缪尔赛思's 流形): only the tiles of its owner's range
    const within = p.kind === 'token' && typeof ps.summonRange === 'function' ? ps.summonRange(p) : null;
    // and an outside-bound one (凯尔希·思衡托's 战术锚点): never a tile of its owner's range
    const without = p.kind === 'token' && typeof ps.summonExcluded === 'function' ? ps.summonExcluded(p) : null;
    // ground tiles for a MELEE blocker. placeClass 'all' on a MELEE record is a chess whose trait reads 「可以放置于远程位」
    // (歌蕾蒂娅, 崖心, 见行者, any module): it may stand on a 高台, and when one of those tiles covers the enemy road it is
    // planned there even with the ground free (owner 2026-10-04: the bot uses the 高台; 2026-10-05: every such chess).
    const cls = p.kind === 'token' ? positionClass(r0) : placeClass(ps, pgd.chess(p.id) || r0);
    const preferHigh = cls === 'all' && basePositionClass(r0) === 'melee';
    let bestHigh = null;
    let bestHighV = -Infinity;
    // a blocker whose range is its own tile only (range 0-1: 角峰, 古米, 泡泡, 折桠, 菲莱, 蛇屠箱, 塞雷娅, 余) neither blocks nor
    // hits anything off the enemy road — the official range "0-1" (excel range_table) is the one grid (0,0) — so a free road tile
    // comes first (the kill estimate saturates in a full layout and then cannot tell the tiles apart)
    const preferRoad = isBlocker(r0) && r0.rangeGrid?.length === 1 && r0.rangeGrid[0].every((v) => v === 0);
    let bestRoad = null;
    let bestRoadV = -Infinity;
    for (const [r, c] of legalTiles(map, cls)) {
      const k = tileKey(r, c);
      if (taken.has(k) || (within && !within.has(k)) || (without && without.has(k))) continue;
      // The extra candidate consumes no random draws; adding it cannot perturb later bot randomness.
      const noise = profile ? 0 : m.rngBots() * 1e-6;
      const seen = new Set();
      for (const dir of PLAN_DIRS) {
        const u = unitOf(r0, k, r, c, dir, model);
        // (the same covered tiles under a different airflow ATK factor are a different candidate)
        const sig = `${u.atkMul}|${[...u.cover].sort().join(' ')}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        layout.units.push(u);
        const v = score() + noise;
        layout.units.pop();
        if (v > bestV) { bestV = v; best = [k, r, c, dir]; }
        // (the best road tile by the same value)
        if (preferRoad && model.ground.has(k) && v > bestRoadV) { bestRoadV = v; bestRoad = [k, r, c, dir]; }
        if (preferHigh && map.get(k) === 'ranged' && [...u.cover].some((ck) => model.ground.has(ck)) && v > bestHighV) {
          bestHighV = v;
          bestHigh = [k, r, c, dir];
        }
      }
    }
    const pick = bestHigh || bestRoad || best;
    if (!pick) continue;
    taken.add(pick[0]);
    layout.units.push(unitOf(r0, pick[0], pick[1], pick[2], pick[3], model));
    out.set(p.uid, pick[0]);
    out.dirs.set(p.uid, pick[3]);
    yield;
  }
  // Revisit a complete formation: dealers and medics can now see every blocking/contact point.
  // Strict improvements, stable order, two bounded passes; the original v0.2 and RNG are untouched.
  if (profile && mode === 'refined') for (let pass = 0; pass < 2; pass++) {
    let changed = false;
    for (const p of order) {
      if (p.kind !== 'chess' || !out.has(p.uid)) continue;
      const index = layout.units.findIndex(u => u.key === out.get(p.uid));
      const old = layout.units[index], r0 = rec(p);
      let best = old, bestV = score();
      for (const [r, c] of legalTiles(map, placeClass(ps, pgd.chess(p.id)))) {
        const key = tileKey(r, c);
        if (taken.has(key) && key !== old.key) continue;
        const selfOnly = isBlocker(r0) && r0.rangeGrid?.length === 1 && r0.rangeGrid[0].every(v => v === 0);
        if (selfOnly && model.ground.has(old.key) && !model.ground.has(key)) continue;
        for (const dir of PLAN_DIRS) {
          const candidate = unitOf(r0, key, r, c, dir, model);
          layout.units[index] = candidate;
          const v = score();
          if (v > bestV + 1e-9) { best = candidate; bestV = v; }
        }
      }
      layout.units[index] = best;
      if (best !== old) {
        taken.delete(old.key); taken.add(best.key);
        out.set(p.uid, best.key); out.dirs.set(p.uid, best.dir); changed = true;
      }
      yield;
    }
    if (!changed) break;
  }
  return out;
}

/** A plan's direction for a piece (plans without directions ⇒ RIGHT). */
const planDir = (plan, uid) => (plan && plan.dirs instanceof Map ? plan.dirs.get(uid) : null) ?? 'RIGHT';

/** Layout-model variants the rehearsal compares (the first one is the default plan). */
export const REHEARSAL_VARIANTS = Object.freeze([
  {},
  { spread: 3, secondHold: 0.2 },
  { hold: 2 },
  { hold: 8 },
  { kill: 3 },
]);

/** Distinct plans (same unit → tile assignment ⇒ one candidate), in order. */
function distinctPlans(plans) {
  const out = [];
  const seen = new Set();
  for (const plan of plans) {
    const sig = [...plan.entries()].sort((a, b) => a[0] - b[0]).map(([u, k]) => `${u}@${k}:${planDir(plan, u)}`).join(' ');
    if (!seen.has(sig)) { seen.add(sig); out.push(plan); }
  }
  return out;
}
```

## bot.js 摘录 演习构造与选择

```js
export function* createRehearsalSteps(m, ps, chosen, plans, limit = m.botRehearsal) {
  const wave = m.wave;
  const distinct = distinctPlans(plans);
  if (!wave || distinct.length < 2 || !(m.botRehearsal > 0)) return null;
  const cands = distinct.slice(0, limit);
  const byUid = new Map(chosen.map((p) => [p.uid, p]));
  const battles = [];
  for (const plan of cands) {
    if (botRefinement(m, 'preview')) {
      try {
        const board = new Map([...plan].map(([uid, key]) => [key, { ...byUid.get(uid), dir: planDir(plan, uid) }]));
        const opts = { ...m._normalOpts(ps, { preview: true, board }), fieldId: `r:${ps.playerId}` };
        battles.push(m.newBattle(opts, { preview: true }));
      } catch { break; } // discard failed estimates without touching live diagnostics
      yield;
      continue;
    }
    const saved = [...ps.board.entries()];
    // the candidate's directions are set on the pieces while its input is taken; restored exactly afterwards
    const savedDirs = new Map([...byUid.values(), ...saved.map(([, p]) => p)].map((p) => [p, Object.hasOwn(p, 'dir') ? { v: p.dir } : null]));
    let failed = false;
    try {
      ps.board.clear();
      for (const [uid, k] of plan) { const p = byUid.get(uid); if (p) { p.dir = planDir(plan, uid); ps.board.set(k, p); } }
      ps.recompute();
      const spawns = withBounties(m.gd, m.round, wave, ps.bounties, ps.playerId).map((sp) => ({ ...sp, ownerPlayerId: ps.playerId }));
      battles.push(m.newBattle({
        seed: deriveSeed(m.seed, `rehearse:${m.round}:${ps.seat}`), kind: 'normal', modeId: m.modeId, round: m.round,
        stageId: m.stageId, rect: { ...GEO.NORMAL_RECT }, timeLimit: wave.timeLimit, players: [ps.battleInput({ side: 'L', colOffset: 0 })],
        spawns: m._sanitizeSpawns(spawns, ps.playerId), routes: wave.routes, sharedBoss: null,
        flags: { layerGainsEnabled: false, ...m.gd.dp }, fieldId: `r:${ps.playerId}`, enemyOverrides: wave.overrides, waveId: wave.templateId,
      }));
    } catch (e) {
      failed = true;
      m.log.warn?.(`[match ${m.roomCode}] bot rehearsal failed: ${e && e.message}`);
    } finally {
      ps.board.clear();
      for (const [p, d] of savedDirs) { if (d) p.dir = d.v; else delete p.dir; }
      for (const [k, p] of saved) ps.board.set(k, p);
      ps.recompute();
    }
    if (failed) break;
    yield;
  }
  const cap = Math.ceil(((wave.timeLimit || 60) + 5) * 30);
  let i = 0;
  let t = 0;
  let bestScore = -Infinity;
  let bestLeaks = Infinity;
  const job = {
    chosen,
    plans: cands,
    best: cands[0],
    done: false,
    run(budgetMs = Infinity) {
      const timed = Number.isFinite(budgetMs);
      const t0 = timed ? performance.now() : 0;
      let n = 0;
      while (i < battles.length) {
        // a candidate that ended mid-slice (finished, cap, or beaten at a 64-tick check that skipped the budget test):
        // check the budget before stepping the next one, so a slice never exceeds 4 ticks past its budget
        if (timed && n > 0 && performance.now() - t0 >= budgetMs) return false;
        const battle = battles[i];
        try {
          let beaten = false;
          while (t < cap && !battle.finished) {
            battle.step();
            t++;
            n++;
            if ((t & 63) === 0 && bestLeaks < Infinity && countedLeaks(battle, ps.playerId) > bestLeaks) { beaten = true; break; }
            if (timed && (n & 3) === 0 && performance.now() - t0 >= budgetMs) return false;
          }
          if (!beaten) {
            if (!battle.finished) battle.forceEnd('timeout');
            const r = battle.result();
            const pp = r && !r.synthetic && r.perPlayer && r.perPlayer[ps.playerId];
            if (pp) {
              const leaks = (pp.leaked || []).filter((l) => l && l.counted !== false).length;
              const score = -leaks * 1000 + (pp.killed || 0) - i * 0.01;
              if (score > bestScore) { bestScore = score; bestLeaks = leaks; job.best = cands[i]; }
            }
          }
        } catch (e) {
          if (!botRefinement(m, 'preview')) m.log.warn?.(`[match ${m.roomCode}] bot rehearsal failed: ${e && e.message}`);
        }
        battles[i] = null;
        i++;
        t = 0;
      }
      job.done = true;
      return true;
    },
  };
  return job;
}
```

## bot.js 摘录 最终准备阶段接入

```js
export function* arrangeSteps(m, ps, { final = false, defer = false } = {}) {
  const ctx = context(m, ps);
  const chosen = chooseLineup(m, ps, ctx).set;
  const chosenSet = new Set(chosen.map((p) => p.uid));
  // withdraw board chess that are not chosen (to free cap) when the hand has space
  for (const [, p] of [...ps.board]) {
    if (p.kind !== 'chess' || chosenSet.has(p.uid)) continue;
    const idx = freeSlot(ps.hand);
    if (idx >= 0) tryDo(() => ps.move(p.uid, { area: 'hand', idx }));
    else tryDo(() => ps.sell(p.uid));
  }
  yield;
  const plans = [];
  if (final && m.wave && m.botRehearsal > 0) {
    for (const v of REHEARSAL_VARIANTS) plans.push(yield* planLayoutSteps(m, ps, chosen, { ...LAYOUT_PARAMS, ...v }));
  } else {
    plans.push(yield* planLayoutSteps(m, ps, chosen));
  }
  // Only the final ordinary-round placement uses the demonstrations. Preserve every old
  // rehearsal candidate within the configured budget, plus one taught candidate (ties favour it).
  const taught = final && m.botFormationEnabled !== false && formationProfile(m);
  if (final && !taught && plans.length > 1 && (botRefinement(m, 'guards') || botRefinement(m, 'medics'))) {
    const repaired = repairLayout(m, ps, chosen, plans[0]);
    if (distinctPlans([...plans, repaired]).length > distinctPlans(plans).length) plans[plans.length - 1] = repaired;
  }
  const combined = taught && resolveFormationMode(m) === 'combined';
  if (combined) {
    if (m.botRehearsal > 0) plans.splice(m.botRehearsal);
    // Retain old candidates on rehearsal ties. Extra candidates cost at most three rehearsals.
    for (const mode of ['learned', 'contact', 'refined']) {
      plans.push(yield* planLayoutSteps(m, ps, chosen, LAYOUT_PARAMS, { formation: true, formationMode: mode }));
    }
  } else if (taught) plans.unshift(yield* planLayoutSteps(m, ps, chosen, LAYOUT_PARAMS, { formation: true }));
  const rehearsalLimit = m.botRehearsal + (taught ? (combined ? 3 : 1) : 0);
  if (defer && plans.length > 1) {
    const job = yield* createRehearsalSteps(m, ps, chosen, plans, rehearsalLimit);
    yield* applyPlanSteps(m, ps, chosen, plans[0]);
    return job;
  }
  yield* applyPlanSteps(m, ps, chosen, plans.length > 1 ? rehearse(m, ps, chosen, plans, rehearsalLimit) : plans[0]);
  return null;
}
```

## 七张地图的静态摘要

JSON每行一张地图。normalDeploy 是原数据的普通部署区；groundPaths 为普通区域起点的路线，保留路径全长。groundPathsWithDevices 是存在时优先使用的装置路径。它们没有本回合敌人数量/到达时刻；运行时覆盖与装置变化仍须查真实状态。

```json
{"id":"act1autochess_m02","name":"战场#02","normalDeploy":{"melee":[[9,3],[9,4],[9,5],[9,6],[9,9],[10,3],[10,4],[10,5],[10,6],[11,3],[11,4],[11,5],[11,6],[11,7],[11,8],[12,3],[12,4],[12,5],[12,6],[12,7],[12,8]],"rangedOnly":[],"changedByDevices":[]},"groundPaths":{"9,10->9,2":[[9,10],[9,9],[10,9],[11,9],[11,8],[11,7],[11,6],[10,6],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[12,3],[11,3],[10,3],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[10,17],[11,17],[11,16],[11,15],[12,14],[12,13],[12,12],[12,11],[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[12,3],[11,3],[10,3],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[12,14],[12,13],[12,12],[12,11],[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[12,3],[11,3],[10,3],[9,3],[9,2]]},"groundPathsWithDevices":{"9,10->9,2":[[9,10],[9,9],[10,9],[11,9],[11,8],[11,7],[11,6],[10,6],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[12,3],[11,3],[10,3],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[10,17],[11,17],[11,16],[11,15],[12,14],[12,13],[12,12],[12,11],[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[12,3],[11,3],[10,3],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[12,14],[12,13],[12,12],[12,11],[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[12,3],[11,3],[10,3],[9,3],[9,2]]}}
{"id":"act1autochess_m03","name":"战场#03","normalDeploy":{"melee":[[9,3],[9,4],[9,5],[9,6],[9,7],[9,8],[9,9],[10,5],[10,6],[10,7],[10,8],[11,6],[12,5],[12,6],[12,7],[12,8]],"rangedOnly":[[10,3],[10,4],[11,7],[11,8]],"changedByDevices":[[11,5],[11,7],[11,8]]},"groundPaths":{"9,10->9,2":[[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[12,6],[11,6],[10,6],[9,5],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[9,16],[9,15],[9,14],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[12,14],[11,14],[10,14],[10,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]]},"groundPathsWithDevices":{"9,10->9,2":[[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[12,6],[11,6],[10,6],[9,5],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[9,16],[9,15],[9,14],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[12,14],[11,14],[10,14],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]]}}
{"id":"act1autochess_m04","name":"战场#04 活性源石","normalDeploy":{"melee":[[9,3],[9,4],[9,8],[9,9],[10,3],[10,4],[10,5],[10,6],[10,7],[10,8],[11,3],[11,4],[11,5],[11,6],[11,7],[11,8]],"rangedOnly":[],"changedByDevices":[[12,3],[12,4],[12,8]]},"groundPaths":{"9,10->9,2":[[9,10],[9,9],[10,8],[10,7],[10,6],[10,5],[10,4],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[11,8],[11,7],[11,6],[11,5],[11,4],[10,4],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[10,16],[10,15],[10,14],[10,13],[10,12],[9,12],[9,11],[9,10],[9,9],[10,8],[10,7],[10,6],[10,5],[10,4],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[11,16],[11,15],[11,14],[11,13],[11,12],[10,12],[9,12],[9,11],[9,10],[9,9],[10,8],[10,7],[10,6],[10,5],[10,4],[9,4],[9,3],[9,2]]},"groundPathsWithDevices":{"9,10->9,2":[[9,10],[9,9],[10,8],[10,7],[10,6],[10,5],[10,4],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[11,9],[11,8],[11,7],[11,6],[11,5],[11,4],[10,4],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[10,16],[10,15],[10,14],[10,13],[10,12],[9,12],[9,11],[9,10],[9,9],[10,8],[10,7],[10,6],[10,5],[10,4],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[11,17],[11,16],[11,15],[11,14],[11,13],[11,12],[10,12],[9,12],[9,11],[9,10],[9,9],[10,8],[10,7],[10,6],[10,5],[10,4],[9,4],[9,3],[9,2]]}}
{"id":"act2autochess_m01","name":"战场#05(下半) 源石流发生装置","normalDeploy":{"melee":[[9,3],[9,4],[9,5],[9,7],[9,8],[9,9],[10,5],[10,7],[11,5],[11,7],[12,5],[12,6],[12,7]],"rangedOnly":[[10,4],[11,4],[12,4]],"changedByDevices":[]},"groundPaths":{"9,10->9,2":[[9,10],[9,9],[9,8],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[11,9],[10,9],[9,9],[9,8],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[9,16],[9,15],[10,15],[11,15],[12,15],[12,14],[12,13],[11,13],[10,13],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[11,17],[10,17],[9,17],[9,16],[9,15],[10,15],[11,15],[12,15],[12,14],[12,13],[11,13],[10,13],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[9,4],[9,3],[9,2]]},"groundPathsWithDevices":{"9,10->9,2":[[9,10],[9,9],[9,8],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[11,9],[10,9],[9,9],[9,8],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[9,16],[9,15],[10,15],[11,15],[12,15],[12,14],[12,13],[11,13],[10,13],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[11,17],[10,17],[9,17],[9,16],[9,15],[10,15],[11,15],[12,15],[12,14],[12,13],[11,13],[10,13],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[10,7],[11,7],[12,7],[12,6],[12,5],[11,5],[10,5],[9,5],[9,4],[9,3],[9,2]]}}
{"id":"act2autochess_m02","name":"战场#06(下半) 沼泽控制","normalDeploy":{"melee":[[9,3],[9,4],[9,5],[9,6],[9,7],[9,8],[9,9],[10,5],[10,6],[10,7],[10,8],[11,6],[11,7],[11,8],[12,7],[12,8]],"rangedOnly":[[10,4],[11,5],[12,6]],"changedByDevices":[]},"groundPaths":{"9,10->9,2":[[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[11,7],[10,7],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[9,16],[9,15],[9,14],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[11,15],[10,15],[9,15],[9,14],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]]},"groundPathsWithDevices":{"9,10->9,2":[[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[11,7],[10,7],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[9,16],[9,15],[9,14],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[11,15],[10,15],[9,15],[9,14],[9,13],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[9,5],[9,4],[9,3],[9,2]]}}
{"id":"act2autochess_m03","name":"战场#07(下半) 排气格栅","normalDeploy":{"melee":[[9,3],[9,4],[9,5],[9,6],[9,9],[10,3],[10,4],[10,5],[10,6],[10,7],[10,8],[11,4],[11,5],[11,6],[11,7],[11,8],[12,4],[12,5],[12,6],[12,7],[12,8]],"rangedOnly":[],"changedByDevices":[[11,3],[12,3]]},"groundPaths":{"9,10->9,2":[[9,10],[9,9],[10,9],[10,8],[10,7],[10,6],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[11,4],[10,4],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[10,17],[10,16],[10,15],[10,14],[9,14],[9,13],[9,12],[9,11],[9,10],[9,9],[10,9],[10,8],[10,7],[10,6],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[12,14],[12,13],[12,12],[11,12],[10,12],[9,12],[9,11],[9,10],[9,9],[10,9],[10,8],[10,7],[10,6],[9,6],[9,5],[9,4],[9,3],[9,2]]},"groundPathsWithDevices":{"9,10->9,2":[[9,10],[9,9],[10,9],[10,8],[10,7],[10,6],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[11,4],[10,4],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[10,17],[10,16],[10,15],[10,14],[9,14],[9,13],[9,12],[9,11],[9,10],[9,9],[10,9],[10,8],[10,7],[10,6],[9,6],[9,5],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[12,14],[12,13],[12,12],[11,12],[10,12],[9,12],[9,11],[9,10],[9,9],[10,9],[10,8],[10,7],[10,6],[9,6],[9,5],[9,4],[9,3],[9,2]]}}
{"id":"act2autochess_m04","name":"战场#08(下半) 涨潮控制","normalDeploy":{"melee":[[9,3],[9,4],[9,5],[9,6],[9,7],[9,8],[9,9],[10,3],[10,4],[10,5],[10,7],[10,8],[11,3],[11,4],[11,5],[11,7],[11,8],[12,3],[12,4],[12,5],[12,7],[12,8]],"rangedOnly":[],"changedByDevices":[]},"groundPaths":{"9,10->9,2":[[9,10],[9,9],[9,8],[9,7],[9,6],[10,6],[11,6],[11,5],[11,4],[10,4],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[11,4],[10,4],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[9,16],[9,15],[9,14],[10,14],[11,14],[11,13],[11,12],[10,12],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[10,6],[11,6],[11,5],[11,4],[10,4],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[12,14],[12,13],[12,12],[11,12],[10,12],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[10,6],[11,6],[11,5],[11,4],[10,4],[9,4],[9,3],[9,2]]},"groundPathsWithDevices":{"9,10->9,2":[[9,10],[9,9],[9,8],[9,7],[9,6],[10,6],[11,6],[11,5],[11,4],[10,4],[9,4],[9,3],[9,2]],"12,10->9,2":[[12,10],[12,9],[12,8],[12,7],[12,6],[12,5],[12,4],[11,4],[10,4],[9,4],[9,3],[9,2]],"9,18->9,2":[[9,18],[9,17],[9,16],[9,15],[9,14],[10,14],[11,14],[11,13],[11,12],[10,12],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[10,6],[11,6],[11,5],[11,4],[10,4],[9,4],[9,3],[9,2]],"12,18->9,2":[[12,18],[12,17],[12,16],[12,15],[12,14],[12,13],[12,12],[11,12],[10,12],[9,12],[9,11],[9,10],[9,9],[9,8],[9,7],[9,6],[10,6],[11,6],[11,5],[11,4],[10,4],[9,4],[9,3],[9,2]]}}
```

## 全部42份用户示教

每行一个例子；heldOut=true的7例未用于编译profile。range坐标按朝RIGHT定义，dir为用户选定朝向；role保留示教标记，运行时会按正文规则另判近身盲区support。

```json
{"id":"act1autochess_m02-1","mapId":"act1autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":12,"col":8,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":11,"col":8,"dir":"RIGHT"},{"role":"damage","place":"all","block":2,"range":[[0,0],[0,1],[0,2],[0,3]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":12,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":11,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[1,0],[1,1],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-2,0]],"row":12,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":11,"col":5,"dir":"RIGHT"}]}
{"id":"act1autochess_m02-2","mapId":"act1autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":12,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":11,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":7,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1],[0,2]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1]],"row":12,"col":6,"dir":"RIGHT"},{"role":"damage","place":"all","block":2,"range":[[0,0],[0,1],[0,2],[0,3]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":10,"col":6,"dir":"UP"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":4,"dir":"RIGHT"}]}
{"id":"act1autochess_m02-3","mapId":"act1autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":11,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":11,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":12,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[0,0],[0,1],[0,2],[-1,1],[-1,2]],"row":10,"col":6,"dir":"UP"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":12,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":10,"col":5,"dir":"UP"}]}
{"id":"act1autochess_m02-4","mapId":"act1autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":7,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":11,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"all","block":2,"range":[[0,0],[0,1],[0,2],[0,3]],"row":12,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":12,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":10,"col":5,"dir":"RIGHT"}]}
{"id":"act1autochess_m02-5","mapId":"act1autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":11,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":12,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":7,"dir":"RIGHT"},{"role":"damage","place":"melee","block":0,"range":[[1,-1],[1,0],[1,1],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1]],"row":11,"col":8,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":12,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":5,"dir":"RIGHT"}]}
{"id":"act1autochess_m02-6","mapId":"act1autochess_m02","heldOut":true,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":12,"col":8,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":11,"col":8,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":11,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":0,"range":[[1,-1],[1,0],[1,1],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1]],"row":12,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":12,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":10,"col":6,"dir":"UP"}]}
{"id":"act1autochess_m03-1","mapId":"act1autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":9,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":3,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1]],"row":9,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":10,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":12,"col":5,"dir":"DOWN"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1]],"row":9,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":10,"col":3,"dir":"RIGHT"}]}
{"id":"act1autochess_m03-2","mapId":"act1autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":3,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":10,"col":3,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":9,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":9,"col":6,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1],[0,2]],"row":9,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":12,"col":5,"dir":"DOWN"}]}
{"id":"act1autochess_m03-3","mapId":"act1autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":9,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":10,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":10,"col":3,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]],"row":9,"col":3,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1],[0,2]],"row":10,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":9,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":10,"col":6,"dir":"RIGHT"}]}
{"id":"act1autochess_m03-4","mapId":"act1autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":10,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":9,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":9,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":9,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":11,"col":7,"dir":"DOWN"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":9,"col":3,"dir":"RIGHT"}]}
{"id":"act1autochess_m03-5","mapId":"act1autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":3,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":9,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":10,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":9,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":12,"col":5,"dir":"DOWN"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":9,"col":4,"dir":"RIGHT"},{"role":"damage","place":"melee","block":0,"range":[[1,-1],[1,0],[1,1],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1]],"row":10,"col":6,"dir":"RIGHT"}]}
{"id":"act1autochess_m03-6","mapId":"act1autochess_m03","heldOut":true,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":9,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":3,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":9,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":9,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":0,"range":[[1,-1],[1,0],[1,1],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":4,"dir":"RIGHT"}]}
{"id":"act1autochess_m04-1","mapId":"act1autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":11,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":10,"col":7,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[1,0],[1,1],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-2,0]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":4,"dir":"RIGHT"}]}
{"id":"act1autochess_m04-2","mapId":"act1autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":10,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":10,"col":7,"dir":"UP"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":11,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":11,"col":7,"dir":"RIGHT"},{"role":"damage","place":"melee","block":0,"range":[[1,-1],[1,0],[1,1],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1]],"row":10,"col":8,"dir":"LEFT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1]],"row":10,"col":5,"dir":"RIGHT"}]}
{"id":"act1autochess_m04-3","mapId":"act1autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":11,"col":8,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":10,"col":8,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[0,0],[0,1],[0,2],[-1,1],[-1,2]],"row":10,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":11,"col":7,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":6,"dir":"RIGHT"}]}
{"id":"act1autochess_m04-4","mapId":"act1autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":10,"col":7,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1],[0,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"melee","block":1,"range":[[0,0],[0,1]],"row":11,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":11,"col":8,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":11,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":10,"col":4,"dir":"RIGHT"}]}
{"id":"act1autochess_m04-5","mapId":"act1autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":11,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":10,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":10,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":5,"dir":"RIGHT"}]}
{"id":"act1autochess_m04-6","mapId":"act1autochess_m04","heldOut":true,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":10,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":10,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":11,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":11,"col":7,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m01-1","mapId":"act2autochess_m01","heldOut":false,"notes":"","units":[{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":12,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[1,0],[1,1],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-2,0]],"row":12,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":9,"col":5,"dir":"UP"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":11,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m01-2","mapId":"act2autochess_m01","heldOut":false,"notes":"","units":[{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":11,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[0,0],[0,1],[0,2],[-1,1],[-1,2]],"row":12,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":9,"col":4,"dir":"UP"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":12,"col":6,"dir":"DOWN"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":10,"col":5,"dir":"DOWN"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":11,"col":5,"dir":"RIGHT"}]}
{"id":"act2autochess_m01-3","mapId":"act2autochess_m01","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":9,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":11,"col":7,"dir":"DOWN"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":4,"dir":"RIGHT"},{"role":"damage","place":"all","block":2,"range":[[0,0],[0,1],[0,2],[0,3]],"row":12,"col":7,"dir":"DOWN"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":12,"col":5,"dir":"DOWN"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":12,"col":6,"dir":"DOWN"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":10,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":10,"col":5,"dir":"RIGHT"}]}
{"id":"act2autochess_m01-4","mapId":"act2autochess_m01","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":7,"dir":"DOWN"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[1,0],[1,1],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-2,0]],"row":12,"col":5,"dir":"DOWN"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":10,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":10,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":12,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m01-5","mapId":"act2autochess_m01","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":11,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":7,"dir":"DOWN"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":6,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1],[0,2]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[1,0],[1,1],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-2,0]],"row":12,"col":5,"dir":"DOWN"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":10,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":11,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":11,"col":5,"dir":"RIGHT"}]}
{"id":"act2autochess_m01-6","mapId":"act2autochess_m01","heldOut":true,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":9,"col":5,"dir":"UP"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":11,"col":5,"dir":"DOWN"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":11,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":12,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":10,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":12,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m02-1","mapId":"act2autochess_m02","heldOut":false,"notes":"","units":[{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]],"row":9,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"DOWN"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":10,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":9,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":9,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":11,"col":8,"dir":"DOWN"}]}
{"id":"act2autochess_m02-2","mapId":"act2autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":9,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":9,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":9,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":9,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"DOWN"}]}
{"id":"act2autochess_m02-3","mapId":"act2autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":9,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":9,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":9,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":9,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[1,0],[1,1],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-2,0]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"melee","block":1,"range":[[0,0],[0,1],[0,2]],"row":9,"col":3,"dir":"RIGHT"}]}
{"id":"act2autochess_m02-4","mapId":"act2autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":9,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":9,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":12,"col":6,"dir":"DOWN"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":5,"dir":"DOWN"}]}
{"id":"act2autochess_m02-5","mapId":"act2autochess_m02","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":9,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":9,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":9,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1]],"row":10,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"DOWN"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m02-6","mapId":"act2autochess_m02","heldOut":true,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":9,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":9,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":9,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":9,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":1,"range":[[0,0],[0,1]],"row":10,"col":7,"dir":"DOWN"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":10,"col":6,"dir":"LEFT"}]}
{"id":"act2autochess_m03-1","mapId":"act2autochess_m03","heldOut":false,"notes":"","units":[{"role":"damage","place":"ranged","block":1,"range":[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]],"row":9,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":10,"col":8,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":9,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":10,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":12,"col":7,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[0,0],[0,1],[0,2]],"row":12,"col":6,"dir":"RIGHT"}]}
{"id":"act2autochess_m03-2","mapId":"act2autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"all","block":2,"range":[[0,0],[0,1],[0,2],[0,3]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[1,0],[1,1],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-2,0]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":11,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":12,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m03-3","mapId":"act2autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":10,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":10,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":12,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"melee","block":1,"range":[[0,0],[0,1],[0,2]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]],"row":10,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m03-4","mapId":"act2autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":10,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":12,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":11,"col":6,"dir":"RIGHT"},{"role":"damage","place":"all","block":2,"range":[[0,0],[0,1],[0,2],[0,3]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":11,"col":7,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m03-5","mapId":"act2autochess_m03","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":10,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":12,"col":6,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":10,"col":7,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":1,"range":[[0,0],[0,1]],"row":10,"col":6,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"LEFT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":11,"col":4,"dir":"RIGHT"}]}
{"id":"act2autochess_m03-6","mapId":"act2autochess_m03","heldOut":true,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":10,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":12,"col":7,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":9,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"all","block":2,"range":[[0,0],[0,1],[0,2],[0,3]],"row":10,"col":6,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":11,"col":5,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":11,"col":4,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":11,"col":6,"dir":"LEFT"}]}
{"id":"act2autochess_m04-1","mapId":"act2autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":11,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":10,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":11,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3]],"row":9,"col":4,"dir":"UP"},{"role":"damage","place":"melee","block":0,"range":[[1,-1],[1,0],[1,1],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1]],"row":12,"col":4,"dir":"DOWN"},{"role":"damage","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[1,3],[0,-1],[0,0],[0,1],[0,2],[0,3],[-1,-1],[-1,0],[-1,1],[-1,2],[-1,3]],"row":10,"col":3,"dir":"RIGHT"}]}
{"id":"act2autochess_m04-2","mapId":"act2autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":12,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":11,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":12,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":10,"col":5,"dir":"UP"},{"role":"damage","place":"ranged","block":1,"range":[[2,0],[2,1],[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2],[-2,0],[-2,1]],"row":10,"col":4,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1]],"row":11,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":3,"dir":"RIGHT"}]}
{"id":"act2autochess_m04-3","mapId":"act2autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":11,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":12,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":12,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":11,"col":3,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":12,"col":3,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":10,"col":5,"dir":"UP"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":3,"dir":"RIGHT"}]}
{"id":"act2autochess_m04-4","mapId":"act2autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":12,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[0,5],[-1,3],[-1,4]],"row":11,"col":5,"dir":"RIGHT"},{"role":"damage","place":"melee","block":1,"range":[[0,0],[0,1]],"row":12,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[0,0],[0,1],[0,2],[-1,1],[-1,2]],"row":11,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":11,"col":3,"dir":"RIGHT"},{"role":"damage","place":"melee","block":2,"range":[[1,1],[0,0],[0,1],[-1,1]],"row":10,"col":5,"dir":"UP"},{"role":"heal","place":"ranged","block":1,"range":[[2,0],[2,1],[2,2],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,0],[-2,1],[-2,2]],"row":12,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":3,"dir":"RIGHT"}]}
{"id":"act2autochess_m04-5","mapId":"act2autochess_m04","heldOut":false,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":11,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[1,3],[1,4],[0,3],[0,4],[-1,3],[-1,4]],"row":12,"col":5,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,1],[-1,2],[-1,3]],"row":11,"col":3,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2]],"row":12,"col":4,"dir":"RIGHT"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[1,2],[0,0],[0,1],[0,2],[-1,0],[-1,1],[-1,2]],"row":10,"col":5,"dir":"UP"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[1,-1],[1,0],[1,1],[1,2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-1,2]],"row":10,"col":4,"dir":"UP"}]}
{"id":"act2autochess_m04-6","mapId":"act2autochess_m04","heldOut":true,"notes":"","units":[{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1],[0,2]],"row":11,"col":4,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":11,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":2,"range":[[0,0],[0,1]],"row":12,"col":5,"dir":"RIGHT"},{"role":"block","place":"melee","block":3,"range":[[0,0],[0,1]],"row":12,"col":4,"dir":"RIGHT"},{"role":"damage","place":"melee","block":0,"range":[[1,-1],[1,0],[1,1],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1]],"row":10,"col":5,"dir":"UP"},{"role":"damage","place":"ranged","block":1,"range":[[1,0],[1,1],[0,0],[0,1],[0,2],[0,3],[0,4],[-1,0],[-1,1]],"row":11,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":10,"col":3,"dir":"RIGHT"},{"role":"heal","place":"ranged","block":1,"range":[[2,1],[2,2],[2,3],[1,0],[1,1],[1,2],[1,3],[0,0],[0,1],[0,2],[0,3],[-1,0],[-1,1],[-1,2],[-1,3],[-2,1],[-2,2],[-2,3]],"row":9,"col":4,"dir":"UP"}]}
```

## 最终修正版逐种子窗口

每行一个难度/种子，数组为[R1–10,R1–11,R12–13,是否到达Boss]。各组共同setup已经由报告器校验。只含聚合指标，不能还原棋子站位或断定死因。

```json
{"config":"solo:HARD","seed":51,"stage":"act2autochess_m03","legacy":[0,0,19,1],"learned":[0,0,19,1],"optimized":[0,0,21,1]}
{"config":"solo:HARD","seed":52,"stage":"act1autochess_m02","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":53,"stage":"act1autochess_m03","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":54,"stage":"act1autochess_m04","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":55,"stage":"act1autochess_m03","legacy":[0,0,14,1],"learned":[0,0,15,1],"optimized":[0,0,15,1]}
{"config":"solo:HARD","seed":56,"stage":"act1autochess_m04","legacy":[0,0,0,1],"learned":[1,1,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":57,"stage":"act1autochess_m03","legacy":[0,0,16,1],"learned":[0,0,17,1],"optimized":[0,0,14,1]}
{"config":"solo:HARD","seed":58,"stage":"act2autochess_m01","legacy":[0,0,4,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":59,"stage":"act2autochess_m01","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":60,"stage":"act2autochess_m02","legacy":[1,1,0,1],"learned":[0,0,0,1],"optimized":[1,1,0,1]}
{"config":"solo:HARD","seed":61,"stage":"act1autochess_m03","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":62,"stage":"act2autochess_m02","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":63,"stage":"act1autochess_m04","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":64,"stage":"act1autochess_m04","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":65,"stage":"act2autochess_m04","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":66,"stage":"act1autochess_m03","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":67,"stage":"act1autochess_m02","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":68,"stage":"act1autochess_m04","legacy":[0,0,10,1],"learned":[0,0,10,1],"optimized":[0,0,7,1]}
{"config":"solo:HARD","seed":69,"stage":"act2autochess_m04","legacy":[1,1,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:HARD","seed":70,"stage":"act1autochess_m04","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:ABYSS","seed":51,"stage":"act2autochess_m03","legacy":[1,1,38,1],"learned":[1,1,37,1],"optimized":[1,1,38,1]}
{"config":"solo:ABYSS","seed":52,"stage":"act1autochess_m02","legacy":[0,0,25,1],"learned":[0,1,19,1],"optimized":[0,0,19,1]}
{"config":"solo:ABYSS","seed":53,"stage":"act1autochess_m03","legacy":[6,6,8,1],"learned":[0,0,8,1],"optimized":[5,5,8,1]}
{"config":"solo:ABYSS","seed":54,"stage":"act1autochess_m04","legacy":[0,0,15,1],"learned":[0,11,12,1],"optimized":[0,0,15,1]}
{"config":"solo:ABYSS","seed":55,"stage":"act1autochess_m03","legacy":[1,9,41,0],"learned":[1,9,36,0],"optimized":[1,4,36,1]}
{"config":"solo:ABYSS","seed":56,"stage":"act1autochess_m04","legacy":[2,2,12,1],"learned":[1,2,0,1],"optimized":[2,2,0,1]}
{"config":"solo:ABYSS","seed":57,"stage":"act1autochess_m03","legacy":[5,5,41,1],"learned":[5,5,37,1],"optimized":[3,3,32,1]}
{"config":"solo:ABYSS","seed":58,"stage":"act2autochess_m01","legacy":[0,2,30,1],"learned":[0,0,18,1],"optimized":[0,0,16,1]}
{"config":"solo:ABYSS","seed":59,"stage":"act2autochess_m01","legacy":[0,7,6,1],"learned":[0,8,7,1],"optimized":[0,7,6,1]}
{"config":"solo:ABYSS","seed":60,"stage":"act2autochess_m02","legacy":[6,17,0,1],"learned":[4,7,0,1],"optimized":[4,7,0,1]}
{"config":"solo:ABYSS","seed":61,"stage":"act1autochess_m03","legacy":[0,0,21,1],"learned":[0,0,10,1],"optimized":[0,0,21,1]}
{"config":"solo:ABYSS","seed":62,"stage":"act2autochess_m02","legacy":[0,0,25,1],"learned":[1,1,36,1],"optimized":[0,0,25,1]}
{"config":"solo:ABYSS","seed":63,"stage":"act1autochess_m04","legacy":[0,0,14,1],"learned":[0,0,5,1],"optimized":[0,0,0,1]}
{"config":"solo:ABYSS","seed":64,"stage":"act1autochess_m04","legacy":[0,0,19,1],"learned":[0,0,19,1],"optimized":[0,0,18,1]}
{"config":"solo:ABYSS","seed":65,"stage":"act2autochess_m04","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:ABYSS","seed":66,"stage":"act1autochess_m03","legacy":[0,0,0,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
{"config":"solo:ABYSS","seed":67,"stage":"act1autochess_m02","legacy":[3,9,46,0],"learned":[3,9,43,0],"optimized":[2,8,40,1]}
{"config":"solo:ABYSS","seed":68,"stage":"act1autochess_m04","legacy":[7,14,36,0],"learned":[0,7,30,1],"optimized":[0,7,30,1]}
{"config":"solo:ABYSS","seed":69,"stage":"act2autochess_m04","legacy":[9,9,18,1],"learned":[9,9,16,1],"optimized":[9,9,16,1]}
{"config":"solo:ABYSS","seed":70,"stage":"act1autochess_m04","legacy":[0,0,2,1],"learned":[0,0,0,1],"optimized":[0,0,0,1]}
```

合并前最终基准源指纹：`2d8d1ec2eefa46b0d77b1616d2c656170fe7aaa2a293dfc54b513a80881eb946`。完整机器证据在本地 `docs/research/formation-optimization-2026-10-16.json`，含原始记录哈希、各轮和逐种子配对数据。本文件已内嵌设计讨论所需的核心材料；完整战斗技能与敌人数据未打包，若需具体干员/敌人因果诊断，应向本地执行者索取对应最小快照。
