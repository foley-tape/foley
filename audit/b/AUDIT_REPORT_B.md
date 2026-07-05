# AUDIT_REPORT_B — TAPE-0 NIGHT-1 对抗式审查（施工方 B · 只读红队）

> 审计对象：`/Users/shadow/tape0` @ HEAD `72e171c`（分支 `audit/night1`）。
> 性质：**只读审计**。除 `audit/b/` 与复现脚本外，未改任何源码/参数/判据/磁带。发现 ≠ 修复。
> 基线：`npm test` 26/26 绿、`tsc --noEmit` 干净、`git status` 干净。哈希链核验：params `886928d1`✅ / verdict `22f07f3c`✅（均与文档自称一致）。
> 盲答见 [`audit/b/PREREG_DESIGN.md`](audit/b/PREREG_DESIGN.md)（读仓前所写，D1–D37）。全部复现脚本在 [`audit/b/repro/`](audit/b/repro/)，通宵测试在 [`audit/b/soak/`](audit/b/soak/)。
> **命名**：本报告为 `AUDIT_REPORT_B.md`，与另一审计 agent 的 `AUDIT_REPORT.md` 区分。

---

## 卷首 · 执行摘要

一句话：**没有 P0（v0 不崩、封版磁带判定成立、哈希链闭合），但有一簇 P1 触及"诚实条款"宪法级主张与"零明文分享"主张，应在打 `v0.1.0` 前处置或至少改口。**

最值得连夜看的三条：
1. **分类正则跑在用户可控命令全串上 → 伪造 RESOLVE**（含 `curl …/test`、`echo "…git commit…"`）。这**捏造了"解脱"方向**，直接违反 §1 诚实条款。当前封版带里因触发点 S<0.3 而未发作，但只差一步之遥，且已污染"机会审计"。
2. **`--redact` 全脱敏带并非"零明文"**：MCP 工具名（`mcp__AcmeCorp_ProjectZeus__deployProd`）与**绝对毫秒时间戳**原样穿透。冰箱#4"产零明文分享带"与未来"可分享"主张被证伪。
3. **STUCK 检测跨目标塌缩**：封版 storm 的 9 次卡碟边沿，实为**一个 sig 横跨 29 个不同 URL**（78 读失败 / 61 目标 / 仅 18 签名）——"翻找许多不同地方"被算成"踩死同一把耙子"。这不仅是误报，还**支撑了 resolveOnOpportunity 退役的论证**（详见质疑架构师席）。

### 十大发现（按严重度）

| # | 严重度 | 发现 | 证据 |
|---|---|---|---|
| B-1 | **P1** | 分类正则匹配命令全串 → 误贴 test/误判 SAVE → **伪造 RESOLVE + 泄能**（违 §1 诚实条款） | `C_test_tag_false_resolve.ts`、`verbs.ts:38-40` |
| B-2 | **P1** | `--redact` 残留：MCP 工具名 + 绝对时间戳明文穿透，"零明文分享带"证伪 | `A_redact_residue.ts`、`distill.ts:14-18` |
| B-3 | **P1** | STUCK 充能侧 sig 不含 targetHash → 跨目标塌缩，封版 storm 卡碟边沿被此主导 | `C_normErr_redos.ts`、storm 带实测 |
| B-4 | **P2** | 5 个 adapter 参数为死配置，其中 3 个正则在 `verbs.ts` 硬编码且**与 params.json 不一致**（无 `\b`）；违"唯一事实源"，并挡住 B-1 的显然修法 | grep 实证、`params.json:70-72` vs `verbs.ts:38-40` |
| B-5 | **P2** | 未决 RUN 滴灌（SPEC §6.2）对其点名的场景失效：真挂起的 RUN 被 `resolveT!==null` 过滤；首事件慢 RUN 的窗落在回放起点之前 | `D_drip_ask.ts` |
| B-6 | **P2** | 归一化过度：三个不同文件不存在 → 同 errClass → 同 sig → **误发 STUCK_LOOP**（B-3 的干净单元证据） | `C_normErr_redos.ts` |
| B-7 | **P2** | 确定性仅在**输入有序**下成立；引擎无逆时防护，乱序 ingest 终态不一致；"replay≡live"正典仅测了过期时刻一项 | `B_math_boundaries.ts` §B2 |
| B-8 | **P2** | `sigStates` 会话内无 evict（终身累加器）；`reap` 每 tick 全量扫 → O(n)/tick。当前被激进归一掩盖，但与 B-3 的修法耦合（修 B-3 即揭此） | `soak/SOAK_REPORT.md` §B |
| B-9 | **P3** | 跨平台确定性未证：`Math.exp/log/pow` 非逐位保证；金测试⑤仅同进程双跑。已备跨平台指纹脚本 | `B_determinism.ts` |
| B-10 | **P3** | 针（needle）上界未夹紧：饱和时过冲到 1.089；smooth 针峰 0.5018 越过 0.50（判据测 T 不测 needle，故未拦） | `B_math_boundaries.ts` §B7、真带 curve.csv |

附带：`cli live` 为未实现桩（`cli/index.ts:28-31`）——夜班令"`cli live` 挂机"无法照字面执行，通宵测试以引擎公开 API 复刻消费回路（见 SOAK 说明）。ReDoS 面**干净**（正则皆线性，20 万字符 <1ms）；畸形磁带 11 种**全不崩**（`C_robustness.ts`）——鲁棒纪律扎实，值得表扬。

---

## 一、逐条发现详述

### B-1 · P1 · 分类正则跑命令全串 → 伪造 RESOLVE（触宪法）

**是什么**：`tagsForCommand` 与 `classifyBash`（`verbs.ts`）在**整条命令串**上做正则匹配：
- `TAG_TEST_RE = /\b(test|jest|vitest|pytest|cargo test|go test)\b/` 命中任何词界含 `test` 的串；
- `SAVE_RE = /git\s+commit/` 命中任何含"git commit"子串的串。

**失败链**（`C_test_tag_false_resolve.ts` 实测）：造一段峰值 T=0.906 的真风暴，随后一条 `curl -s https://status.internal/health/test` **成功**返回 → 因 tags 含 `test` 且 S>0.3 → **发射 RESOLVE + S×0.6**。一次无关健康检查被当成"测试转绿"。`git commit` 同理：`echo "remember to git commit later"`、`grep -r "git commit" docs/` 均被判 **SAVE → RESOLVE + S×0.5**（更大泄能）。

误贴清单（真实无关命令）：`curl …/api/test`、`git clone …/test-utils`、`mkdir test`、`cat build.log`、`grep -r "test"`、注释 `# populate test db`、`docker build`（真 build 也算，但泄能靠的是 RUN-OK+test，build 不直接泄）。

**后果**：伪造的 RESOLVE = 探针里一声不该响的"如释重负"和弦 + 把真风暴的张力抽掉 → 压低 peakT / rainR / 占空，可翻转 storm 判定；并使"机会审计"计入幻影 test-OK（storm 现报机会 2、busy 4、smooth 4——蒸馏后**无从验证**这些是真测试还是误贴，因命令原文已被蒸掉）。**这违反 §1 宪法级诚实条款"引擎只计算证据……永不捏造方向"。**

**当前是否发作**：封版五带里 test-tagged RUN-OK 存在（busy 4 / storm 2 / smooth 4），但 RESOLVE 实发 0——因为这些成功都落在 S<0.3 处（`testResolveMinS`）。**是运气，不是设计**：抬一点权重或换一卷就发作。故 P1（应修），非 P0（暂未破封版带）。

**为何现有金测试没抓住**：所有 RESOLVE 金测试（engine.test ②、m16 ⑮）都**手工注入 `tags:['test']`**，从不让真实命令串走 `tagsForCommand`→RESOLVE。`tagsForCommand`/`classifyBash` **零直测**（golden 全库 grep 证实）。发现落在"适配器分类"与"引擎消费"之间无人跨越的缝里。

**建议修法**：分类只认命令**头**（`command.trim().split(/\s+/)` 的首 token / 首个非环境赋值 token），或维护"测试运行器"白名单匹配可执行名而非全串子串；且把正则**真的**从 params.json 读进来（见 B-4），让判据可调。

---

### B-2 · P1 · `--redact` 并非"零明文分享带"

**是什么**：`redactResult`（`distill.ts:14-18`）只把 `errClass` 换成聚类哈希，**其余字段原样**。实测（`A_redact_residue.ts`）脱敏带仍含：
- **MCP 工具名整串**：`mcp__AcmeCorp_ProjectZeus__deployProd` → `AcmeCorp`/`ProjectZeus`/`deployProd` 全部命中。MCP 工具名由用户自定义，常编码公司名/项目名/敏感动作。
- **绝对毫秒时间戳**：记录 `t`、`meta.episodes[].startT/endT`、`stats.firstT/lastT` 全是 epoch ms → 完整 ISO 墙钟。精确到毫秒的"用户何时在干活"是强指纹。
- `sourceHash`（原文 FNV）——本身是哈希，但可让两份分享带被判定同源。

**后果**：冰箱登记簿 #4 白纸黑字"`distill --redact`……产**零明文**分享带（金测试 ⑬）"，以及夜班令红队A 要证伪的"蒸馏带接近可分享、无原文泄露"——**被证伪**。v0 禁分享，故不阻断封版；但"零明文"是**现在就落纸的错误主张**，任何人据此分享即泄露。

**为何金测试没抓住**：金测试 ⑬ 只断言 `errClass` 匹配 `/^e[0-9a-f]{8}$/` 且 sig 不变，**从不检查 tool/timestamp/sourceHash 无明文**。它的名字（"redact 输出无明文"）比它的断言强得多。

**建议修法**：redact 时把 `tool` 映射到固定 vocabulary（未知→`other`/`mcp`），时间改为**量化相对 delta + 随机会话偏移**，并补一条机械红线金测试（脱敏带不含任一源带长度≥6 子串）。或：把"零明文"字样从冰箱#4 降级为"errClass 脱敏，工具名/时间未脱敏"。

---

### B-3 · P1 · STUCK 充能侧 sig 跨目标塌缩（污染封版 storm）

**是什么**：充能/卡碟触发用 `sig = fnv1a(verb|tool|errClass)`（`parse.ts:341`），**不含 targetHash**。而清除侧 `clearSig = verb|tool|targetHash`（distill/2 §3 收紧）。二者**不对称**。

**实测**（封版 storm.tape.jsonl）：78 条 READ-FAIL，**61 个不同 targetHash（URL）**，却只塌成 **18 个 sig**；其中一个 sig 横跨 **29 个不同 URL**，另一个横跨 13 个。于是"翻找 29 个不同地址、个个 404"被 `k≥2` 判成"同一把耙子"→ 发 STUCK_LOOP。封版 storm 的 9 次卡碟边沿（判据 [3,12] 的达标项）**由此塌缩主导**。

**双重问题**：
1. **语义**：SPEC §6.1 的立论是"三个相同的错是踩死同一把耙子"——但它同时又命令 `normalize(错误首行)`（抹路径/数字），使"相同的错"≠"相同的目标"。归一化亲手拆掉了立论的前提。B-6 是其干净单元证据（三个不同文件不存在 → 一个 sig → 误发 STUCK_LOOP）。
2. **不对称**：卡碟可被 29 个目标**充**，却只能被"最后一个目标"（`SigState.clearSig` 被每次击中覆盖）的 OK **清**。于是 28 个目标永远清不掉 → 全 expiry 型清除 → 破卡碟 RESOLVE 永不触发。**这正是 M1.6 blocker① "storm 结构上无解脱"的机制根源**，见质疑架构师席。

**当前是否发作**：**是**，封版 storm 的卡碟统计即受此塑形。判定仍过（边沿 9∈[3,12]），但这个"9"的含义与文档所述不同。故 P1。

**为何金测试没抓住**：`targetHash` 的金测试（m16 ⑪）只验**清除**侧（bash-A 不被 bash-B 误清），从不验**充能**侧跨目标塌缩。

**建议修法**：把 targetHash 并入充能 sig（对称化）。**注意副作用**：distinct sig 会暴涨（storm 从 18→约 61），直接激活 B-8 的 reap O(n) 退化——两者须一并考虑。或：架构师明确"迷路型风暴里跨目标同错即算卡住"为**有意语义**，写进 §6.1，则本条降为文档补强。

---

### B-4 · P2 · 死配置 + 正则漂移（违"唯一事实源"）

`params.json.adapter` 里 **5 个键无任何源码引用**（grep 实证，排除类型定义）：`saveRegex`、`tagTestRegex`、`tagBuildRegex`、`askTimeoutSec`、`doneSilenceSec`。其中三个正则在 `verbs.ts:38-40` **硬编码**，且**与 params.json 不一致**：

| 键 | params.json | verbs.ts 硬编码 |
|---|---|---|
| tagTestRegex | `test\|jest\|…`（无词界） | `/\b(test\|jest\|…)\b/`（有词界） |
| tagBuildRegex | `build\|tsc\|…` | `/\b(build\|…)\b/` |
| saveRegex | `git\\s+commit` | `/git\s+commit/`（同义） |

**后果**：SPEC §6.5"全部可调参数集中于 params.json"被违反。晨间架构师若想调 tagger（正是 B-1 的显然修法——改 `tagTestRegex`）会**静默无效**。更糟：params 版无 `\b`，若哪天真接线，匹配面比现在**更宽**（`latest` 含 `test` 子串会中招）。`askTimeoutSec`=15 摆着像 SPEC §5 的 ASK 后备已接线，实则该后备**根本没实现**（`D_drip_ask.ts` §2 证：20s 无结果的 tool_use 不会推定 ASK）。

**建议**：要么把这 5 键真正接线（读进来用），要么从 params.json 删除并在 FEEDBACK 记"§5 ASK 后备/§这些正则为编译期常量，非运行期可调"。

---

### B-5 · P2 · 未决 RUN 滴灌对其点名场景失效

SPEC §6.2："未决 RUN 超 30s 起以 0.02×m/min 滴灌微涨（**它是不是挂了？**）"。实测（`D_drip_ask.ts`）：
- **真正挂起的 RUN**（永无 result，`resolveT=null`）→ 被 `replay.ts:86` 的 `r.resolveT !== null` 过滤**掉**，**零滴灌**。恰恰是"它挂了吗"最该发作的情形。
- **首事件即慢 RUN**：episode 起点 = 首个**效果**时刻 = resolveT，而滴灌窗 `[useT+30s, resolveT]` 整段落在起点**之前** → 从不被步进 → 零滴灌。
- 慢 RUN 夹在两个事件**之间**时滴灌才生效（实测 ΔS≈0.0026）。

**后果**：一个文档化的动力学机制，对它命名的两类场景（挂起、开局慢命令）基本失效。量级本就微小（0.02/min），影响有限，故 P2；但"规范说 X 现实是反的"应记入现实修正。

---

### B-6 · P2 · 归一化过度 → 误发 STUCK_LOOP

`C_normErr_redos.ts` §1：三次 `cat` 三个**不同**不存在文件（config.yml / settings.json / data.db），错误首行经 `normErr` 抹路径后全变 `cat: PATH: no such file or directory` → 同 errClass → 同 sig `f49c1773` → 第 3 次**发 STUCK_LOOP**。三个不同文件的探索被判成"卡死在同一处"。反向对照（三种不同错误类型 TypeError/SyntaxError/RangeError）**能**正确区分为 3 个 sig ✅——所以归一化本身没坏，坏在"抹掉目标标识后，不同目标的同类错误不可区分"。这是 B-3 的最小可复现证据。

---

### B-7 · P2 · 确定性仅在有序输入下成立 + replay≡live 正典欠测

`B_math_boundaries.ts` §B2：`ingest` 无条件 `st.now = m.t`。当一条时间戳更早的事件到达（时钟回拨/乱序），`advanceTo` 因 dt<0 早退不回退时钟，随后 `ingest` 把 `st.now` 硬拉回过去。构造同两事件的**有序 vs 乱序**到达：终态 S = 0.368878 vs 0.375000 —— **不一致**。

replay 因蒸馏时 `pre.sort((a,b)=>a.t-b.t)` 而安全（有序）；但：(1) 引擎自身无逆时防护/钳制；(2) M1.6-A §1.二.6 正典"同带 replay 与模拟 live 逐字节一致"**只被金测试⑫测了过期 CLEARED 时刻一项**，未测乱序到达。live（M1，现为桩）一旦上线，尾随乱序即偏离 replay。P2（live 未发货），但触及一条被反复援引的不变量。

---

### B-8 · P2 · sigStates 终身累加器 + reap O(n)/tick

`EngineState.sigStates` 仅在 `SESSION_START` 清空，**会话内从不 evict**；`reap` 每 tick `for (const [sig,s] of st.sigStates)` 全量扫（`index.ts:148`）。压力测试（`soak/SOAK_REPORT.md` §B）：单次 reap 从 2000 sig 的 ~31µs 线性升到 20000 sig 的 ~58µs。

**现状**：realistic 8h 会话（1920 事件）sigStates 峰值仅 **11**（激进归一塌缩），故当前无痛。**但**：(1) 违反"无终身累加器"稳健原则（我的盲答 D13）；(2) 单个不跨 30min 空档的超长会话会累积；(3) **与 B-3 修法耦合**：一旦把 targetHash 并入 sig 消除塌缩，distinct sig 暴涨（storm 18→61），此退化立即转为真问题。outcomes 数组 ✅ 恒 ≤ wowWindow(20)，无泄漏。

---

### B-9 · P3 · 跨平台确定性未证

`B_determinism.ts`：本机（Node v26 / darwin / arm64）五带双跑**逐字节一致**✅，指纹已打印。但引擎依赖 `Math.exp`（tension/decay/activity/wow）、`Math.log`（幅度归一）、`Math.pow`（rep）——IEEE754 未强制这些超越函数逐位一致（libm 各家实现有别）。金测试⑤只同进程双跑，**从不跨版本/平台**。SPEC §3"同一磁带两次回放逐字节一致"在跨平台维度**未被覆盖**。CSV 量化到 6 位小数（f6）提供了一层缓冲，但边界值仍会翻位。已备脚本供晨间在第二台机器对比指纹。

---

### B-10 · P3 · 针上界未夹紧

`integrateSpring`（`index.ts:120`）只夹下界 `if (needlePos<0) needlePos=0`，**无上界**。B7 实测：目标 T=1 饱和时 needle 过冲到 **1.089**（满量程外）。真带里因峰值短暂未破 1.0，但 **smooth 针峰 0.5018**（curve.csv 实测）——越过了 smooth 判据"peakT<0.50"守的那条 0.50 线；判据测的是 `s.T`(0.405) 不是 needle，故没拦，但用户**看的是针**。SPEC §6.4 明说欠阻尼"~9% 过冲"是有意的，故过冲本身合宪；但过冲到量程外（>1）在饱和时会让探针指针戳出表盘。建议 needle 夹到 [0,1]（或 [0, 1+ε] 保留过冲观感但不越表）。

---

## 二、通宵耐力测试（SOAK）

harness 已就位、**已脱离本会话后台启动**（`--wall 7`，pid 记于 `soak_wall.log`），滚动写 `soak_wall.csv`，每分钟一采样。**晨间任何人跑一条命令即出报告**：

```sh
node audit/b/soak/soak-summarize.ts   # 读滚动 CSV → 更新 audit/b/soak/SOAK_REPORT.md
```

- `generate.ts`：可复现种子（mulberry32）合成会话，5–40s/事件 + 8% 概率风暴簇（迷路型：不同 URL 同错形）。
- `soak-run.ts --virtual 8`：秒级跑完 8h 模拟，已得结论（见 B-8）：outcomes 有界、sigStates realistic 峰值 11、reap O(n) 退化曲线。
- `soak-run.ts --wall 7`：真实墙钟长跑，采 RSS/heap/CPU/处理延迟；自记录、自终止。
- **关于 `cli live`**：它是未实现桩（打印后 `exit 2`）。故 soak 以引擎公开 API（`advanceTo/ingest/reap/snapshot`）复刻 live 消费回路——真 live 会走同一批调用。这也是一条发现（夜班令的"`cli live` 挂机"当前不可照字面执行）。

**过期 CLEARED tick 对齐**：发射时刻取理论过期点 `lastHit+repWindow`（与 tick 无关，金测试⑫已证）→ **时刻精度不随时长漂移**；随时长退化的是 reap 的**算力**（扫全 map，B-8），非时刻。

当前 `SOAK_REPORT.md` 已含虚拟段与压力段；墙钟段随 7h 长跑自动补全。

---

## 三、分歧席（阶段零盲答 D1–D37 vs 现设计；不评对错，供架构师读）

| 盲答 | 现设计 | 分歧 |
|---|---|---|
| D5/D8 工具**归桶**（read/search/exec…）+ **预期内失败降权**（grep exit1=0.1，search miss≠危机） | 按**动词**分权，`failDefault` 一刀切；**无**"预期内失败降权" | storm 是 READ-fail 主导，一次 grep 未命中与一次编译崩塌同权充能。降权面缺失，可能是 storm 难调的深层原因之一 |
| D10 "焦虑来得快散得慢"放在**张力 T** 层（τ_rise≪τ_fall） | 快攻慢放只在**弹簧/needle** 层；S 的 τ 按**空档长短**（120/300）而非**方向**分段 | 情绪的不对称性只体现在针的机械，不体现在张力本身。散得慢靠的是加长 τ，不是方向性 |
| D17/D18 离散触发要 **dwell 驻留** + **≥2 独立特征佐证** | STUCK 无 dwell（第 3 次即发）、单 sig 即触；RESOLVE 无 dwell | 现设计更灵敏也更易误报（B-1/B-6 即其果） |
| D19 **声音预算/cooldown/令牌桶**（宁静默不误鸣） | 边沿触发（每卡碟一次）但**无全局限速** | 一场爆发簇可连发多跳针；"宁静默"靠边沿化而非预算 |
| D20/D29/D32 **白名单 schema、零自由文本、错误只存加盐哈希** | 默认保留 `errClass` 归一后**明文**（唯一文本字段）；redact 才哈希 | 正中 B-2。我的盲答默认不信任何自由文本，现设计默认信任本地 |
| D24/D25 **挣来的解脱 ≠ 淡出的解脱**，两者听得出区别 | **完全一致**：RESOLVE(和弦) vs expiry(设计性沉默)，"消散≠解决"入纪律 | **趋同**（非分歧）——架构师独立到达同一区分，值得记一笔一致 |
| D31 绝对时间戳可指纹 → 去除/量化 | 蒸馏带保留绝对 ms | 正中 B-2 |
| D2/D4 live 与 replay 共用一引擎、tick 量化到栅格 | replay 已实现、live 是桩；tick 有 SNAP_MS 栅格 | live 未落地，replay≡live 正典欠测（B-7） |
| D16 episode **软复位**（留余温） | **硬复位**（有意，冰箱#1） | 已知分歧，架构师有意选硬复位 |

---

## 四、质疑架构师席（对判据/教义/正典本身的质疑，单列不修）

1. **resolveOnOpportunity 的退役，可能部分是在为一个实现假象背书。** M1.7 把它退役，理由是"迷路型风暴的解脱不是离散事件"。但 B-3 显示：storm"永不解脱"至少部分**源于 sig/clearSig 不对称**——卡碟能被 29 个目标充能，却只能被最后一个目标的 OK 清除，于是破卡碟 RESOLVE 结构上触发不了。**这是实现造成的不可达，不纯是磁带的内在属性。** 若充能侧也用 targetHash，storm 的卡碟/解脱画像会变。请架构师裁：退役的依据是"迷路风暴本质无解脱"（磁带属性），还是被"清除侧要求同目标、充能侧不要求"（引擎属性）污染了？二者结论可能不同。

2. **"全绿"在最难的判据被退役/降informational 后还剩多少含金量？** verdict/2 的 storm 只剩 3 条 active，resolveOnOpportunity 退役、三枚金时刻全 informational。冠军是在"卸掉最难项"后的网格里选出的。这有"法官给自己出的卷子打分"的味道。不是说退役错（B-3 恰恰支持"这条判据问错了问题"），而是：**当一轮里同时"改判据"和"按新判据选冠军"，冠军的说服力被稀释**。建议把"判据变更"与"参数遴选"在时间上分离，或对退役项保留一个显式的"曾要求、现豁免"审计栏。

3. **smooth 的 peakT<0.50 判据测错了变量？** 判据测 `s.T`（峰 0.405 过关），但用户看的针 `needle` 峰到 0.5018，越过了这条判据想守的 0.50 线。"平静之日永不见雨"若是**感知**主张，也许该测 needle（所见）而非 T（所算）。至少两者都报一下。

4. **"无终身累加器"未被立为纪律。** 引擎确定性、零依赖、时钟注入都入了宪，但 sigStates 的会话内无界增长 + reap O(n)/tick（B-8）说明"长跑有界"没被当成一等约束。单个不跨 30min 空档的超长会话（真实存在——有人一坐一整天）是否受支持？若是，建议把"状态量有界、无终身累加器"补入 §3 技术约束。

5. **优先级正典"安全硬禁 > 协议冻结"与实际用力方向倒挂。** 协议冻结被逐字节严守（每轮"schema 零改动"郑重声明），但**安全**面的 redact 明文残留（B-2）无人守、无金测试拦。若"安全硬禁"真在正典顶端，redact 的隐私红线该比 schema 洁癖得到更多机械保护。

---

## 五、已验证为稳健（免得只报坏消息）

- **禁 crash 纪律扎实**：截断行/孤儿 result/未决 use/深嵌套/未来·畸形时间戳/同毫秒×1000/空文件/块数组 content/字符串 content —— 11 种畸形输入**全不崩**（`C_robustness.ts`）。
- **ReDoS 面干净**：所有正则皆线性量词，无嵌套回溯；20 万字符对抗串 <1ms。
- **哈希链闭合**：params `886928d1`、verdict `22f07f3c` 均与自称一致；五带 REPORT 头引用一致；tape sourceHash 可追溯（storm `d98d3543` 对得上）。
- **同进程确定性**：五带双跑逐字节一致。
- **outcomes 窗口有界**：wow 的 outcomes 数组恒 ≤ wowWindow，无泄漏。
- **边界处理显式**：天气 enter 用 `>=`、exit 用 `<`，迟滞语义正确（B4 的"恰好等号"表现只是"decay 先于 weather、T 已微降"的自然结果，非 bug）；repWindow 充能侧 `>=` 与 reap 侧 `>` 语义自洽（both 视"恰好 win"为仍在窗内）。

---

## 六、晨间可跑清单（复现全部发现，一条条）

```sh
cd /Users/shadow/tape0
node audit/b/repro/A_privacy_probe.ts        # B-2 前身：什么穿过隐私膜
node audit/b/repro/A_redact_residue.ts       # B-2：MCP名+时间戳穿透 --redact
node audit/b/repro/C_test_tag_false_resolve.ts # B-1：伪造 RESOLVE
node audit/b/repro/C_normErr_redos.ts         # B-6：过度归一误 STUCK；ReDoS 清白
node audit/b/repro/B_math_boundaries.ts       # B-7/B-10：乱序非确定 / 针过冲
node audit/b/repro/B_determinism.ts           # B-9：跨平台指纹（拿去第二台机器对比）
node audit/b/repro/C_robustness.ts            # 稳健性：11 种畸形不崩
node audit/b/repro/D_drip_ask.ts              # B-5：滴灌失效 / ASK 后备缺席
node audit/b/soak/soak-summarize.ts           # 通宵报告（墙钟段随 7h 长跑补全）
```

晨间流程建议：架构师裁 B-1/B-2/B-3（P1）→ 出修复令 → 修完重跑五带 + 盲听 → 若 B-3 采纳"充能并入 targetHash"，务必同时处置 B-8（reap 退化）。B-4 是 B-1 的前置（不接线正则就没法调 tagger）。

（审计完 · 施工方 B · 只读，未动一行源码/参数/判据/磁带）
