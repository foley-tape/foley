# 交接 · Track-SOUND 下一会话入职包

> 写给：接手声音相的**全新会话**。你没有历史记忆，本文＋台账即全部上下文。写于 SOUND-R2 收官（2026-07-05）。
> 阅读顺序：本文 → `FEEDBACK-SOUND.md`（台账，EAR-5~11 全史）→ 最新施工令（若有）。白皮书=`docs/canon/TAPE0_WHITEPAPER_SENSES_v1.md`（v1.1）。

## 0. 你是谁、围栏在哪

Track-SOUND。围栏：`sound/` ＋ 声音金测试（golden/sound.test.ts）＋ `cli ear` ＋ probe 页壳（cli/probe.ts）＋ `sound/assets/`。
**勿触**：engine/**（v0.1.0 冻结；断电落针的"唯一例外"已用掉）、stage/**、docs/**（白皮书 v1.1 是 R2 特批动过一次，之后仍归架构师）、params/verdict/tapes。多轨并行：STAGE 与 M-T1（dub/预告片）轨同时在这个仓上干活——**合并冲突与共享文件踩踏是日常，见 §4-7**。

## 1. 现状一屏（截至 40d7de4）

- **SOUND-R2 三层床已交付全绿**：L1 真采样织体（CC0 三条，`sound/assets/`＋LICENSES.md 逐条溯源）＋L2 三关铁律和声垫＋L3 hiss/crackle 出低通直达输出。
- **机器耳朵 v2**：`node cli/index.ts ear` —— G1 停止静默/G2 总闸/G3 五带守设计/**G7 响度（BS.1770，−26±2 LUFS）** 四门 active 全绿；G6 织体占用度 8/8、G4 r=0.351、G5 Δ−4.4dB 三门 informational。金测试 **68/68**（`npm test`，~35s）。
- **EAR-11 判读**：预言成立（正常音量"像开着旧设备的安静房间"获船长确认）；**"不怎么好听"=美学余项**——下一轮就是**美学调音轮**（候架构师令）。
- 船长设备：**蓝牙耳机**（设备栏已入册）。
- 双哈希：sound-params `efbb571d`（若有人改过 params 以 ear 报告为准）/ assets `6cc0c971`。

## 2. 架构地图（10 行版）

```
sound/core.js    纯映射律（bedTargets/习惯化/量化/track 压缩）——纯 JS，无 WebAudio 无 Node
sound/graph.js   音频图引擎：注册表（三规矩）+三关铁律 pitchedStack+三层床拓扑（文件头有全图注释，改图必改注释）
sound/offline.ts 自研离线渲染器（Node 无 WebAudio；param 计算值=内在+外接是保真命门）+LUFS 表+频带量具
sound/assets.js  WAV 解析/内容哈希/内嵌装载（Node 与浏览器同一份）
cli/ear.ts       机器耳朵 G1-G7（门函数导出，金测试复用同一把尺）
cli/probe.ts     探针页薄壳：数据准备+UI 壳；【同源纪律】页内逐字内嵌 core/assets/graph 真源（剥 import/export）——
                 永远不许手抄"同源律"，那是 EAR-4 四轮失明的土壤
```
类型面走 `.d.ts` 伴生文件；`sound/index.ts` 是 TS 门面（老进口路径不变）。

## 3. 铁律（每条都是血泪，出处在台账）

1. **只信渲染波形**。`.value` 账本只作接线自检，永不作发声证明（EAR-4；门规已入 ear.ts 头）。
2. **每个"修好了"先过 `cli ear`＋金测试**，全绿才许请船长耳朵；**一批修复只请一次耳朵**；申请必附**可证伪预言**（预言落空自动重审——预言法）。
3. **测量条件必须=船长条件**（EAR-8/9 学费：恒态轨迹测不出真带问题、12×≠1×、bedBus≠destination）。
4. **浏览器验证要显式跑一帧 `frame()` 断言不抛＋交互后读 console**——无头预览 rAF 被掐，UI 死了你看不见（EAR-11 学费）。
5. **probe.ts 里的页壳 JS 是模板串，tsc 不查**——改 BedTargets 字段必 `grep 'bt\.' cli/probe.ts`（bt.s1 遗留曾冻死整页动画）。
6. 改 `sound/assets/` 必须走 prep 流程重算 manifest 内容哈希（加载器校验，不符即抛）；资产 CC0-only、逐条登记 LICENSES.md。
7. 定标常数（graph.js `CALIB`、core.js `S2_CREST`）不许手拍——跑定标轮实测冻结；㊴ 金测试的失败信息里自带实测值，可反推修正系数。定标口径 @48k。
8. 判据冻结纪律：不许顺手换金测试的尺（㉛ 有前科注释）；判据修订走 informational 试用期法。

## 4. 环境坑（不修只避）

1. `.claude/launch.json` 被各轨反复覆写——起预览服务器前**先 cat 确认你的条目还在**；本轨用的静态服务器脚本在易失 scratchpad，重写一个 20 行的即可（serve runs/ 目录、端口 8931）。
2. `node_modules` 曾是指向他会话 /tmp 的符号链接（已拆除入仓）；typescript 凭空消失时先 `npm ls typescript` 再 `npm install`。
3. `runs/`、`tapes/` gitignored；runs 命名规约 `runs/<kind>-<tape>-<ts>/`，kind ∈ replay/sweep/probe/ear/soak。
4. 全仓 typecheck 目前带一个别轨红：`golden/dub.test.ts(15)` TS7016（stage/js/cut.js 缺 .d.ts，归 M-T1 补）——你的改动以"新增错误数为零"为准。
5. shell 的 cwd 会漂回主工作目录——跑 npm/node 前 `cd /Users/shadow/tape0`。

## 5. 打开就能用的命令

```bash
cd /Users/shadow/tape0
npm test                                        # 68 金测试（~35s）
node cli/index.ts ear                           # 机器耳朵 G1-G7（~14s，报告落 runs/ear-machine-*）
node cli/index.ts probe tapes/storm.tape.jsonl --kind storm   # 生成探针页（镜像 runs/probe-latest/）
node cli/index.ts probe ... --sp bed.hissDbLo=-120            # 试听变体（不覆盖 probe-latest）
```
探针页：默认 1×（原速法）；曲线画布点击/拖动=跳转；隔离板七层实时禁声；`?tuner=1` 调音抽屉（v2 旋钮已备：l1/l2/crackle/air——注意 l1AirRatio 建图时定，拖动需重开页）；页头有欠载记录仪与 assets 哈希。

## 6. 开放项（大概率就是你的下一单）

| 项 | 状态 | 一句话 |
|---|---|---|
| **美学调音轮** | 候架构师令 | 靶心="好听"；方法建议已呈（预设 A/B/C 盲选＋参考锚，见复盘 §八）；tuner v2 就绪 |
| G5 呼唤穿透判据 | 候裁 | 织体占满 1.2–2.2k 专区后带能量差判据失效（Δ−4.4dB）；三案在白皮书 §4 |
| G4 转正路径 | 候裁 | 床响度已近恒平（五带 −23.6~−23.8），T 表达全靠音色——F5 语义之争见复盘 §七.4 |
| 未执法红字 ×4 | 候补仪器 | 真峰/前景响度/DONE 渲染静默/场景档听感（白皮书 v1.1 标红处） |
| 定标轮入仓 | 建议 | 现在活在 scratchpad；升 cli 子命令半日活 |
| hiss 采样率漂移 | 冰箱 | ±0.4dB @44.1/48k；带内归一噪声源候选 |
| EAR-10 证伪口残尾 | 低优 | 船长已答（安静正弦无颗粒）；旧滋啦定性=pad 谐波毛刺，已闭环 |

## 7. 与船长协作的手感（重要程度不亚于代码）

- 船长的词汇是感受性的（"滋啦""翻江倒海""不怎么好听"）——**先翻译成可测量假设、逐条排除，禁止拿第一联想当定论**（"滋啦=hiss"错了四轮）。
- 给船长的每次听感请求：一次只请一次、附预言、附操作路径（点哪里、听哪段、留意什么）、附"如果 X 说明 Y"的判读表——他会照做并给出高质量证词。
- 他说"是 bug"基本就是 bug（黄线不动=真 rAF 断链）；他没说到的也别放过（"进度条拖不了"背后是功能从未存在）。
- 台账（FEEDBACK-SOUND）逐轮如实记：证词原文/诊断/处置/状态——这是本轨最重要的资产，比代码还重要。

（入职包完。愿你不用再学一遍我们交过学费的课。）
