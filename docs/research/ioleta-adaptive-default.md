# 罗素默认 experimental + adaptive

2026-10-16，维护者明确选择此组合，并要求新 PR 提交后关闭废案 #2。
本次从 master 0b467333 建立独立变更，选取 217e7e0e 中已经测量的 adaptive 及共享演习限制，
不纳入 pool/trio 模式、无联防生产选项或其他采购研究实现。旧 PR 无需合并。

默认采购由 Match 构造器选择 experimental；运行时根据玩家 band_ioleta 选择 adaptive，
同房间其他策略仍使用 learned。显式 legacy 采购与站位覆盖保留，手动操作不变。
adaptive 的参数、候选顺序和评测版本相同；采购权重未改。增加的是默认接入和按玩家选择。

候选先完整生成、按棋子位置与朝向去重，旧默认优先。前三个候选后有零漏结果就停止扩展；
否则继续到累计 tick 预算（单候选上限 ×12），已开始的候选完成后再判断预算。
[ASSUMED] 这些是搜索启发式；零漏时停止不保证最大击杀或后续回合最优。
浏览器与服务端共用限制，委派失败回到相同候选和预算。
普通 R1–13 的已示教地图使用新候选；Boss、隐藏关和未知地图沿用原布局算法。

## 选择依据

[100次快速比较](ioleta-opus-fast-2026-10-16.md)及[配对统计摘录](ioleta-adaptive-evidence.json)：
四席共享采购与团队环境，跳过联防，只评价罗素，到R11结算停止。
HARD 20房间前10/11漏怪 learned 70/134、contact 69/131、adaptive 48/88。
ABYSS 17个共同完整房间前10/11 combined 180/276、adaptive 139/257，
但R11单轮96→118；前11配对均差95%区间跨零。维护者接受该取舍。
这份历史报告不是本次默认接入的全联机或通关率测量；本次回归验证另记于 PR。

## 回退

构造 Match 时传 botIoletaPolicy: 'legacy' 恢复旧采购，botFormationMode: 'learned' 恢复示教，
botFormationMode: 'legacy' 或 botFormationEnabled: false 恢复旧站位。
同名运行时属性可供评测覆盖。省略 formation 时仅 experimental 罗素默认 adaptive。
没有新增面向玩家的 UI 开关，没有修改游戏数据或战斗技能。

## 本次接入验证

- 相关策略／站位／委派／演习测试：tests 72, pass 72, fail 0；默认选择与回退：tests 4, pass 4, fail 0。
- 文档：tests 32, pass 32, fail 0。
- npm run golden：roster 49 / bonds 46 / fields 22 / matches 21 / standins 10 / diy 140，288场景全部匹配；所有整局错误计数为0。
- npm run ci -- --keep-going（Windows / Node 24.19.0）：tests 7730, pass 7600, fail 70, cancelled 2, skipped 58。全套不绿。setup / smoke / lint / imports / typecheck 退出0；lint 0 errors、144 warnings；imports 仍报告 nodeData.js 的3项既有边界诊断。
- 全套失败集中在 Windows symlink EPERM、字体缺失、Forge夹具路径、原生ESM加载、链接依赖下的沙箱权限和并发时限；未将全部失败逐项重跑证明为基线。历史同类问题见 docs/history/0.3.0.md 的集成记录。
- contentBattle、dsl-data、script-integration 三个插件测试进程停滞约10分钟后被显式终止，计为失败／未完成，不声称它们通过。
- 为核对本轮超时与性能失败，独立复跑：WebSocket tests 73/pass 73；插件宿主 tests 7/pass 7；性能 tests 3/pass 3；大厅联机集成 tests 5/pass 5。未重复运行整套CI。
- 全套中的普通整局、联机、托管、服务端回退与客户端一致性回归通过，包括每配置20种子的联机测试。
- git diff --check 通过。未运行浏览器 E2E；本次浏览器演习一致性由委派／共享模拟测试覆盖。
