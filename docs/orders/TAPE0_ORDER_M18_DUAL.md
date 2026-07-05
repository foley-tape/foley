# TAPE-0 施工令 · M1.8 双轨令（修复即封版 × 琥珀通电）

> 本令开启**双轨并行**。终端一 = Track-FIX（修复→封版→live→声音）；终端二 = Track-STAGE（琥珀舞台）。
> 每个终端开工第一句自报轨道。围栏与合并纪律见 §0。协议 schema 冻结不变。
> 随令附件：《感官设计白皮书 v1》（Track-STAGE 读 §5 绑定表；Track-FIX 封版后进声音相时读全文）。

---

## 0. 双轨治理

| | Track-FIX（终端一） | Track-STAGE（终端二） |
|---|---|---|
| 分支 | `fix/p1-seal` | `stage/amber` |
| 独占写 | engine/ adapter/ cli/ params/ verdict/ golden/ tapes/ | stage/**（新建） |
| 只读 | 全仓 | 全仓（fixtures 用**副本**：复制五带 curve/moments CSV 入 stage/fixtures/，永不触 tapes/ 原件） |
| 汇报 | FEEDBACK-FIX.md（+手记可选） | FEEDBACK-STAGE.md ＋ **屏录/截图必交** |
| 合并次序 | 先合 main | 后 rebase（协议冻结保证引擎修复伤不到舞台） |
| 越栏需求 | 停手，写进 FEEDBACK，不伸手 | 同左 |
| 子代理 | **鼓励轨内并行**：四个审计 repro 复跑、各 P1 子修可派子代理 | 鼓励：两个子代理各做一版器件实现，眼睛赛马择优 |

---

## Track-FIX · M1.8-F（修复即封版）

### F1. 四条 P1 逐项裁决（修复次序即此序）

**① 先拔 P1-4（死参数），它挡住后面的修法。**
`verbs.ts` 等处硬编码正则删除，**真读** `params.adapter.*`；params 里 5 个死键要么接线要么删除（推荐接线）。`askTimeoutSec / doneSilenceSec` 若蒸馏器确实不用，删键并记现实修正。金测试：改参数必须能改行为。

**② P1-1 诚实条款（false-RESOLVE）：全串正则 → 命令头结构化匹配。**
- 解析命令为 `&&`/`;`/`|` 分段，每段取 argv 头（跳过前导 `FOO=bar` 环境变量与 `cd x` 段）。
- SAVE：`argv[0]==git && argv[1]==commit`。test tag：argv[0] ∈ 测试器集（jest/vitest/pytest/cargo/go…）或 `(npm|pnpm|yarn) [run] test*`。build 同理。模式串仍存 params（形态改为 token 集）。
- **附加裁决（采纳审计分歧席 #2，解脱须与被释放的张力成正比）**：SAVE-OK 泄能照旧，但 **RESOLVE 时刻仅当 S ≥ `release.saveResolveMinS`(新参数, 0.15) 才发射**——平静时的提交是一声卡座咔哒（v1 foley），不是和弦。
- 金测试：`grep "test"`、`rm -rf ./test`、`echo "...git commit..."`、`curl …/test` 四类无辜命令零 tag/零 SAVE/零 RESOLVE；真 `npm test`、`cd x && npm test`、`git commit -m` 正常。审计脚本 `redteamC_falsetag.ts` 转正为回归。

**③ P1-3 卡碟塌缩：充能侧与卡碟态一律按目标分槽。**
- rep 复现系数与 jam 状态的键 = `(verb, tool, targetHash)`；`sig`（errClass 聚类）降级为**报告聚类标签**，不再参与充能升级与卡碟判定。
- 跳针隐喻的物理含义写进代码注释：**同一道槽才叫卡碟；29 个不同 URL 是扫射不是跳针。**
- 顺带修 B-5 注记：滴灌是 live-only 机制（replay 中 result 恒已知），params 注明，实测留给 live 落地时。
- **后果处置**：storm 的 `stuckEdges[3,12]` 判据 → `status: informational`（按目标分槽后的诚实数字未知，重校准前不拦路）。五带重跑 + 重扫。若 storm 峰值跌出 [0.65,0.92] 且网格内无组合可救——**停，出帕累托，不封版**（不为救判据扭物理，反之亦然）。
- **空问题（必须回答）**：按目标追踪后，storm 是否出现 ok 型破卡碟（某 URL 终被成功重试）？若有——风暴诚实地挣到了它的第一声和弦，写进报告标题。

**④ P1-2 分享带加固（三向量全堵）。**
- redact 模式：errClass → 聚类 id **全替换**（零模板文本）；工具名 → 内建工具白名单保留、其余（含 MCP）哈希；时间戳 → 改为相对 episode 起点的偏移（保节奏，去日历指纹）；`sig`/`targetHash` → 每带随机盐重算（堵字典反演）。
- 默认（本地）蒸馏带的 `normErr` 补刀：`\S*[=:]\S{3,}`、`-p`/`-P` 内联凭据、Windows/相对路径、4–15 位字母数字混合疑似令牌 → `SECRET`。宁可过抹——errClass 只为聚类。
- 文案降级：任何"零明文"措辞改为"经对抗测试的最小化，仍不建议外传未审带"。
- **常设隐私闸门（采纳质疑席 #3）**：`redteamA_privacy.ts` 七类对抗密钥 + B 的工具名/时间戳向量，改写为 `golden/privacy.redteam.test.ts`，**与金测试同跑、永久在册**。安全正典第一，从今有牙。

### F2. P2/P3 快修包（顺手清账）
sigStates 过期驱逐（reap 删除条目 + size 上界金测试）；`Tat` 二分（checkJamMonotone 去 super-linear）；needle 发射侧硬夹 [0,1]；wow 样本 n<4 打折；金测试④更名"ASK/DONE 状态转移正确"；SPEC 顶部横幅（见 F4）。

### F3. 重验与预授权封版
1. 全部金测试（26＋新增）绿；四个审计 repro 作为回归绿。
2. 五带重跑：active 判据全绿（storm.stuckEdges 为 informational）。
3. 重扫 144：存在全绿冠军（参数变更由冠军规则机械决定，无需请示）。
4. 以上三条齐 → **预授权：打 tag `v0.1.0`，封版**，FEEDBACK-FIX 记录封版时的 params/verdict/engine 三哈希。
5. 任一不齐 → 停在闸门，出报告等裁。

### F4. SPEC 修订（架构师授权的原文，追加即可）
- 顶部横幅：`【现行值声明】本文 §6 各数值与 wow 定义已被 M1.5–M1.8 迭代取代；现行唯一事实源 = params.json（参数）与 verdict.json（判据）。本文保留为架构原典。`
- 附注新增：`【优先级正典】安全硬禁 > 协议冻结 > 判据 > 施工令实现细则 > 库偏好。`
- 范围修订：`cli live 与实时舞台自 v0 范围移出，归 v1（v0 = replay 全链＋回放探针）。`——审计发现 6 就此结案。

### F5. 封版后（同终端顺延，不必等新令）
1. **v1-live**：bounded 的 `cli live`（禁累积式采样，审计发现 4 的教训）；补齐"replay≡live 逐字节"整测（审计发现 7）；滴灌机制 live 实测（B-5）。
2. live 交付后进入**声音相**：读白皮书全文，按 §2/§3 实现连续床＋前景改造。里程碑与验收在白皮书 §6。

---

## Track-STAGE · M1.8-S（琥珀通电）

### S0. 输入件
琥珀宪法 v1.1（SPEC 附录 B，含四修正案）＋ 白皮书 §5 音画绑定表 ＋ EAR_REPORT F 条目（**F3 是保护条款：突变引发的警觉是功能，打磨时不得磨掉**）。

### S1. 授权书（品味执照）
宪法即围栏，栏内即自由：组件架构、材质实现路径（CSS/SVG/Canvas/WebGL 任选，倾向轻量）、缓动参数细部（惯性法之内）、布局构图、微交互——**全部自决，不必请示**。发现宪法条文与实现现实冲突时：按宪法执行＋在《舞台手记》起草修正案，**不得先斩**。构建期依赖允许 vendor 进 stage/（运行时零网络照旧）。

### S2. 里程碑
**M-S1 · 第一张脸**：stage 外壳 ＋ 回放流客户端（吃 fixtures 的 curve/moments，20Hz 重放）＋ 三件器件——**VU 针**（吃 needle 字段，禁自加缓动）、**走纸记录仪**（牛血红墨线画 T，纸带缓行）、**琥珀管**（pendingAsk 呼吸）。暗场构图、画外暖光、Univers 血统丝印。**交付 = storm 带回放的 30 秒屏录 ＋ 三张静帧。**无声（声音归 Track-FIX 后续相）。
**M-S2 · 器件补齐与镜头**：带轴（转速=A，抖=wow，角动量起停）＋ 机械计数轮（悬停微距才入画）＋ 镜头法（永不露整机、浅景深、<2px/s 漂移、3% 胶片颗粒 shader、暗角、暗场抖动防色带）＋ 材质打磨（香槟拉丝铝三色、胡桃木端板、烟色玻璃）。交付同上。
**禁令**：不触 engine/adapter；不做导出/分享；不接 live（等 Track-FIX 交付）；数字不上明面（计数轮除外）。

### S3. 《舞台手记》制度
与施工方手记同格：品味发现、宪法修正案草稿、器件与字段绑定中的现实修正。随每里程碑交付。

---

## 交付清单
- [ ] Track-FIX：F1 四修＋F2 快修＋隐私常驻闸门＋重验三条＋（条件齐）v0.1.0 tag＋FEEDBACK-FIX
- [ ] Track-FIX 顺延：v1-live ＋ replay≡live 整测 → 入声音相
- [ ] Track-STAGE：M-S1 屏录＋静帧＋FEEDBACK-STAGE＋舞台手记
- [ ] 空问题回答：修复后的 storm 有没有挣到它的和弦？

（完）
