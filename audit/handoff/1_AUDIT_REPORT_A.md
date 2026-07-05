# AUDIT_REPORT — TAPE-0 封版前红队（NIGHT-1）

> 审计分支 `audit/night1`（基 `72e171c` / m1.7-verdict2）｜引擎 params `886928d1` / verdict `verdict/2`｜全程无网络｜**只读审计**（除 `audit/` 外零改动源码，`git status` 见证）。
> 方法：先阶段零盲答（`audit/PREREG_DESIGN.md`，未读任何 SPEC/ORDER/代码前写成），再开卷读全仓 ~3000 行 TS + 5 卷蒸馏带 + 26 金测试 + 全套施工令（SPEC v0.1 / M1.5 / M1.6 / M1.6-A / M1.7）+ FEEDBACK/手记/冰箱。
> 每条发现附**可复现脚本**于 `audit/repro/`（导入真实模块跑对抗输入，非纸上谈兵），耐力测试于 `audit/soak/`。
> **基线**：`npm test` = 26/26 绿；sweep 16/144 全绿——审计在此健康基线上找**基线没覆盖的角落**。

---

## 卷首 · 十大发现（按严重度排序）

| # | 严重度 | 队 | 一句话 | 现有金测试为何没抓 |
|---|---|---|---|---|
| 1 | **P1** | A隐私 | `errClass` 净化对**含字母的短密钥**系统性失效（5/7 可恢复存活）；默认带明文、`--redact` 带经保留的 `sig`+32位FNV 可反演 | ⑬只验 redact 后 errClass 成哈希，从不喂"对抗性密钥"验其**是否被净化**，也不测 sig 反演 |
| 2 | **P2** | C磁带 | `\btest\b`/`git\s+commit` 误匹配任意命令 → **误发 RESOLVE + 乘法泄真实张力**（伪造"解脱"，违诚实条款） | 金测试用干净合成命令(`vitest run`)，从不喂"含 test 一词但非测试"的无辜命令 |
| 3 | **P2** | soak | `st.sigStates` 一个 episode 内**只增不逐**（reap 只翻 stuck 标志不删条目）→ 长跑单调增长 + reap 每 tick O(n) | 金测试都是秒级短会话；无长跑/多签名场景，Map 增长看不见 |
| 4 | **P2** | C性能 | replay 内存/CSV **∝ 墙钟跨度**（100ms 网格，非事件数）：27h 带 → **1.46GB 堆 / 70MB CSV / 21s**，卡碟带 super-linear（`checkJamMonotone` O(hits×snaps)） | 金测试磁带都是分钟级；⑭sweep 确定性不测规模 |
| 5 | **P2** | D合规 | `adapter.tagTestRegex/tagBuildRegex/saveRegex/askTimeoutSec/doneSilenceSec` 是**死参数**：唯一事实源里声明、代码从不读，且正则硬编码孪生与之**发散**（params 无 `\b`，代码有）——违 §6.5 | 无"参数确实驱动行为"的测试；改这些参数不会让任何测试变红 |
| 6 | **P2** | D合规 | `cli live` 是 stub（`cli/index.ts:28` 直接 exit 2）、`stage-debug/` 空——SPEC §2/§8 列二者为 **v0 交付物**；本夜班令 §2 soak"cli live 挂机"亦被此阻断 | 无端到端 `cli live` 测试；里程碑门控使其"合理缺席"，但 SPEC 口径未同步 |
| 7 | **P2** | D合规 | M1.6-A §2.6 明令的"**同带 replay 与模拟 live 时刻流逐字节一致**"金测试只落地一半（⑫只验 reap 时刻无关性，无完整 live 流比对） | ⑫断言了正典时刻的 tick 无关性，但没有"跑一遍 live 再逐字节比 replay"——正典的另一半没测 |
| 8 | **P3** | B数学 | `wow` 交替率在 **n=2 且一次跳变**时瞬冲 1.0（单个 OK→FAIL = "最大飘"），冷启动偏激进 | 无 wow 冷启动边界测试；⑤⑥⑦测别的量 |
| 9 | **P3** | D合规 | 金测试④名为"ASK/DONE ≤50ms 直通道"，实际只同步断言状态转移，**从不测 50ms 延迟**——名不副实 | 它测自己（状态转移），50ms 是总线属性，引擎层无从测；名字承诺了测不到的东西 |
| 10 | **P3** | D合规 | SPEC 是声明的"唯一事实源"，但 §6.3(wow=失败率EMA/窗12) 已被 M16 §2.2(交替率/20) **静默取代**；新会话读 SPEC 被误导 | 流程本就"以后文为准"，但唯一事实源文档漂移无测试兜底；我这个"新眼睛"实测被 §6.3 误导过 |

**总评**：**未发现 P0（阻断封版）**。引擎数学、确定性、边界稳健性在被专门攻击后大面积**守住**（见"被攻击但守住"节）——这本身是强信号：封版三件套的引擎地基是硬的。十大发现集中在**隐私、潜伏的手感误报、长跑运维、参数卫生**四类，均不破坏当前 26/26 + 16/144 校准，但 #1/#2 触及宪法级条款（安全/诚实），应在"可分享"主张成立前、在 RESOLVE 被广泛信任前修掉。

---

## 详细发现

### 发现 1 · [P1] errClass 净化对短密钥系统性失效；redact 带亦可反演 —— 红队A

**证据**：`audit/repro/redteamA_privacy.ts`（输出存 `redteamA_privacy.out.txt`）。对 7 类藏在错误首行的密钥跑真实 `distillTape`：
```
[❌ 泄露] 10位口令 hunter2xy  → errClass "...password hunter0xy at db"   （仅数字被抹，8/9字符原样）
[❌ 泄露] -pMyS3cretPw       → "mysql -pmys0cretpw connect refused..."  （9字母存活）
[❌ 泄露] 短API key sk-ab12cd → "...api key sk-ab0cd rejected (0)"
[❌ 泄露] 12位hex deadbeefcafe→ "commit deadbeefcafe not found..."       （无0x、<16、无数字 → 全存活）
[❌ 泄露] Windows路径 ...alice → "cannot open c:\users\alice\secret.pem"  （反斜杠路径 PATH 正则不覆盖）
[✅ 抹净] 8位纯数字 PIN        → "0"                                      （\d+→0 有效）
[✅ 抹净] 40位 token          → "TOKEN"                                   （≥16 有效）
默认蒸馏带：5/7 含字母密钥可恢复存活于明文 errClass。
```
`--redact` 后：errClass 变 `e`+8hex，但金测试⑬自己断言 **sig 保留**；`sig=fnv1a(RUN|Bash|<errClass明文>)`（`parse.ts:341`），脚本用"候选错误模板"字典**秒破** `sig` 还原出含 `hunter0xy` 的模板。且 `t/useT/resolveT` 为绝对 epoch（default+redact 均保留）→ 泄露真实日期/时区/逐事件节奏指纹。

**根因**：`normErr`（`adapters/claude-jsonl/parse.ts:96-106`）净化管线只抹 `[/~]开头路径`、`0x`hex、`≥16位 token`、`\d+→0`。**为"抹长 token/纯数字/绝对路径"设计，恰好漏掉"含字母的短串"**——口令、内联 `-p` 密码、短 key、<16位 hex、反斜杠/相对路径首段。M16 §1修正#4 把"≥16 抹除"追认为"主动加固之范例"——这条加固正是漏洞所在。

**复现**：`node audit/repro/redteamA_privacy.ts`。

**建议修法**（不改协议，改 adapter 内部）：
1. errClass 脱敏与聚类**分离**：`sig` 用**加密哈希（≥SHA-256 截断）** 且 redact 时 sig 也重算/加盐，堵字典反演；聚类稳定性靠归一化模板而非明文哈希。
2. `normErr` 补：抹 `\S*[=:]\S{3,}`（key=value/`-pXXX`）、Windows/相对路径、任何"字母+数字混合且长度 4–15"的疑似令牌整体 →`SECRET`；宁可过度抹（errClass 只为聚类，损失可读性可接受）。
3. redact 带**剥离绝对时间戳**（改相对 `t-firstT`）或量化到分钟；文档明确"redact 带仍非零风险，勿外传未审"。
4. 把"对抗性密钥不得存活于 errClass/sig"做成金测试（喂本脚本的 7 类，断言无残留）。

---

### 发现 2 · [P2] tag/SAVE 正则误匹配 → 误发 RESOLVE + 误泄张力 —— 红队C（触宪法级诚实条款）

**证据**：`audit/repro/redteamC_falsetag.ts`（`.out.txt`）。真实 `verbs.ts` + 全 distill→replay：
```
RUN  tags=[test]  ← grep -rn "test" src/     ⚠️误判（搜"test"这个词）
RUN  tags=[test]  ← rm -rf ./test            ⚠️误判（删目录）
SAVE tags=[]     ← echo "remember to git commit later"  ⚠️误判（提醒文本）
端到端：3连 python 失败(S≈0.59) + 1条无辜 grep-OK → RESOLVE×1，S 0.578→0.344（被 ×0.6 泄掉）
```
一条无辜命令既奏"和弦解决"（v0 三音里最贵的一声），又抹平 40% 真实张力弧——**渲染层"永不捏造方向"的诚实条款（SPEC §1 宪法级）在引擎侧就被破坏**。

**根因**：`verbs.ts:39` `TAG_TEST_RE=/\b(test|...)\b/` 命中任何把 `test` 作独立词的命令；`verbs.ts:38` `SAVE_RE=/git\s+commit/` 命中任何含该子串者（含 echo/注释/alias）。叠加 `engine/index.ts:251-258`："tagged RUN-OK 且 S>0.3 → RESOLVE+×0.6"、"SAVE-OK 恒 → RESOLVE+×0.5"。

**当前暴露面**：verdict `_batteryCoverage` 自认"test转绿/SAVE 仅金测试覆盖"——即**现 5 卷校准带几乎不触发**此路径，故 sweep 未暴露。属**潜伏**缺陷：真实世界命令含 "test"/"git commit" 极常见，一旦 `cli live` 上线即会误报。

**复现**：`node audit/repro/redteamC_falsetag.ts`。

**建议修法**：tag/SAVE 判定收紧到**命令首 token（argv[0]）语义**而非全串子串匹配——`git commit` 要求 `argv[0]==git && argv[1]==commit`；`test` tag 要求测试运行器出现在命令**头部**（`^(npm|pnpm|yarn)?\s*(run\s+)?(test|jest|vitest|pytest|...)\b` 或 `argv[0]` 是测试器）。并加金测试：无辜含词命令**不得**产生 tag/SAVE/RESOLVE。

---

### 发现 3 · [P2] sigStates 一个 episode 内只增不逐 —— soak 实测

**证据**：`audit/soak/`（**已完成 6h 真实节奏跑**，seed 42，wall 21631s）：`sigStates` 单调 0→52(3h)→93(6h)。代码核实：`engine/index.ts:231` 每个新 FAIL sig `set` 进 Map；**仅** `:202` SESSION_START `clear()`；`reap`（`:145-155`）只 `s.stuck=false` 从不 `delete`。故一段连续会话（<30min 空档 = 单 episode）内，Map 条目数 = 见过的**不同错误签名总数**，永不回收；`reap` 每 tick 遍历全 Map（`:148`）→ O(sigStates)/tick 且随时长增长。

**影响**：**原理上无界**。6h 内 93 条目仅 KB 级，RSS 未见涨（见发现4：同跑 RSS 平 80MB，斜率 0.005MB/min）——故这**不是快速泄漏**，而是**多日 live / 错误签名极多**的会话才显形的慢病 + reap CPU 随时长线性涨。soak 逮到的正是这类"6h 看不出、6天要命"的长跑病。

**复现**：`SOAK_HOURS=6 SOAK_SPEED=6000 SOAK_DIR=audit/soak/smoke node audit/soak/soak.ts` 后看 `finalSigStates`。

**建议修法**：`reap` 里对"stuck=false 且 `hits` 全部老于 `now-repWindow` 且非 stuck"的条目 `delete`（LRU 或按 lastHit 过期驱逐）。不影响语义（这些条目已无 rep/卡碟作用）。加金测试：长事件流后 `sigStates.size` 有上界。

---

### 发现 4 · [P2] replay 内存/输出 ∝ 墙钟跨度，长/卡碟带 super-linear —— 红队C性能

**证据**：`audit/repro/redteamC_robust.ts`（`.out.txt`），合成带 distill+replay：
```
N事件   distill  replay   snaps      curveCSV  heapUsed
  500     2ms     10ms      9,981     0.7MB     19.6MB
 5000    16ms    178ms     99,981     7.0MB    159.8MB
50000   148ms  21,064ms  999,981    69.6MB   1459.4MB   ← 27.7h跨度
```
replay 时间 178ms→21s（10×数据→118×时间，super-linear）；堆→1.46GB；CSV→70MB。

**根因**：`cli/replay.ts:118-136` `stepGrid` 以 100ms 网格全程采样并**累积** `snaps[]`——规模正比于**墙钟跨度÷100ms**，非事件数。super-linear 时间来自 `checkJamMonotone`（`:230-250`）内 `Tat(t)` 对每个卡碟 FAIL 命中做 O(snaps) 线性扫 → 卡碟带 O(hits×snaps)。

**影响**：REPORT 生成对多日/长跑带内存/时间失控；且预示 `cli live` 6-8h 若沿累积式采样（20Hz×8h=576k 包）内存单调增。**对照实证**：本审计 soak 的 **bounded** 消费者（不累积 snapshot）6h 真实跑 **RSS 恒 ~80MB、斜率 0.005MB/min**——证明"bounded live 广播"内存可平；replay 的累积式采样才是 1.46GB 的根。→ `cli live` 务必走 bounded 路，别继承 replay 的累积。

**复现**：`node --expose-gc audit/repro/redteamC_robust.ts`。

**建议修法**：(a) `Tat` 改二分/预建索引（snaps 已按 t 升序）→ checkJamMonotone 降到 O(hits·log n)；(b) 长空档段 curve 采样降频或跳采（IDLE 段已有 IDLE_CAP，可进一步稀疏）；(c) `cli live` 明确 bounded 广播、禁累积。

---

### 发现 5 · [P2] 死参数 + 硬编码正则孪生发散 —— 红队D合规（违 §6.5 唯一事实源）

**证据**：`grep` 全仓，`adapter.tagTestRegex / tagBuildRegex / saveRegex / askTimeoutSec / doneSilenceSec` **仅**出现在 `engine/params.ts:37-45`（类型声明），无任何读取点。而 `verbs.ts:38-40` 用**硬编码** `/git\s+commit/`、`/\b(test|...)\b/`、`/\b(build|...)\b/`——且与 params 声明**发散**：params 值无 `\b`（`"test|jest|..."`），代码有 `\b`。`askTimeoutSec/doneSilenceSec` 对应 SPEC §5 的 ASK/DONE 静默启发式，蒸馏器未实现（只按 episode 边界发 SESSION_START/DONE）。

**影响**：SPEC §6.5"全部可调参数集中于 params.json（唯一事实源）"被违反——调这 5 个参数**不产生任何行为变化**，是给未来调参者的陷阱；正则孪生发散意味着"文档说的"与"跑的"不是一回事。

**建议修法**：二选一——(a) 让 `verbs.ts`/adapter **真读** `params.adapter.*Regex`（`new RegExp(params.adapter.tagTestRegex)`），删硬编码，统一到含 `\b` 的正确形态（顺带修发现2）；或 (b) 若确定不参数化，从 params.json 删除这 5 键并在 FEEDBACK 记"现实修正"。推荐 (a)。

---

### 发现 6 · [P2] cli live / stage-debug 是 SPEC v0 交付物却缺席 —— 红队D合规

**证据**：`cli/index.ts:28-31` `case 'live'` 打印"M2 探针就绪后接线"直接 `exit 2`；`stage-debug/` 空目录。但 **SPEC §2** v0 交付物明列 `cli/`: scan/replay/**live**/probe 与 `stage-debug/`；**SPEC §8** 定义 `cli live` 尾随广播。本**夜班令 §2** soak 要求"`cli live` 挂机"——被此缺席阻断（本审计遂自建 live-等价 harness，见发现3/soak）。

**影响**：属里程碑门控（M2 探针 gated on 盲听/校准）下的"合理未建"，但 **SPEC 口径未同步**——封版三件套若被理解为"v0 = SPEC §2 全交付"，则 live/stage-debug 是缺口。需架构师明确：`cli live` 是否在 `v0.1.0` 冻结范围内？若是→未建；若否→SPEC §2 应标注 live/stage-debug 降级到 M2/v1。

**建议**：架构师裁定 v0.1.0 范围；相应更新 SPEC §2 或补建 live。（不改代码，纯裁决项。）

---

### 发现 7 · [P2] "replay≡模拟live 逐字节"金测试只落地一半 —— 红队D合规

**证据**：M1.6-A §2.6 正典："过期型 STUCK_CLEARED 的 moment.t=理论过期时刻，回放与直播一致；直播侧每 tick 与每事件双重检查过期……**金测试：同带 replay 与模拟 live 的时刻流逐字节一致**。" 现有 ⑫（`golden/m16.test.ts:55-75`）只验"reap 在不同单次调用时刻 → 发射 t 仍=lastHit+win"（时刻无关性），**没有**"完整跑一遍 20Hz live 流、再与 replay 输出逐字节比对"。正典要求的那半缺席。

**旁证/补足**：本审计 soak 恰好补了这半——`audit/soak/` **6h 真实节奏跑**实测 230 个 STUCK_LOOP/RESOLVE 发射 **drift=0ms**（min/median/p95/max 全 0），27 个 expiry-CLEARED 前半 |对齐| 25.7ms / 后半 26.1ms（≈一个 50ms tick，**6h 内不退化**），验证了 live 侧不变量在长跑下成立。但这是审计脚本，非仓库金测试。

**建议修法**：把 soak 的 live-vs-replay 等价断言收敛成一条真金测试入 `golden/`（短带即可）：模拟 live tick 驱动 + replay，比对 moments 流。

---

### 发现 8 · [P3] wow 交替率在 n=2 瞬冲 1.0 —— 红队B数学

**证据**：`audit/repro/redteamB_math.ts` B-2：第 2 个有结果事件若 OK→FAIL 一次跳变 → `alternationRate` 直接 =1.0（`engine/index.ts:176-187`，n=2 时 `pairs=1`、单跳变 → flipW/totW=1）。即"仅一次成败切换 = 最大不确定"。虽有 30s 平滑缓冲，冷启动仍可瞬冲。

**影响**：轻微——wow 是伴随量不驱动张力/天气；但"两个事件就判最飘"语义上偏激进，可能误导未来订阅者。

**建议**：n 小于某阈（如 4）时对 wow 打折或返 0（延续 `n<2 return 0` 的谨慎），或要求最少跳变数。P3，v1 处理。

---

### 发现 9 · [P3] 金测试④名不副实（未测 50ms 延迟）—— 红队D合规

**证据**：`golden/engine.test.ts:75-85` 测试名"ASK/DONE 摄入→广播 ≤50ms"，体内只 `ingest` 后同步 `snapshot` 断言 `pendingAsk/phase`——**从不测时延**。50ms 是 §7 总线直通道属性，引擎层无从验；测试名承诺了它测不到的东西。属"断言过弱/同义反复"类（正是红队D气味线索）。

**建议**：改名为"ASK/DONE 状态转移正确"，或把 50ms 直通道做成总线层的真延迟测试（v1 有 live/总线时）。P3。

---

### 发现 10 · [P3] SPEC 唯一事实源静默漂移 —— 红队D合规

**证据**：SPEC §6.3 定义 wow="最近12个事件 FAIL 指示的 EMA"；实现是 M16 §2.2 的**成败交替率、窗20**（`engine/index.ts:176`、params `wowWindow:20`）。SPEC §6.1/§6.2 的若干数值亦被 M1.5/M1.6 params 取代。流程规定"以后文为准"，但 SPEC 自称"唯一事实源"（§0 首行）——**新会话（如本审计）读 SPEC §6.3 会被误导**，须读完 4 道施工令才知真相。

**影响**：纯文档卫生；但"唯一事实源"名不副实会持续绊倒新施工方/审计者。

**建议**：SPEC 顶部加"本文 §6 数值已被 M1.5–M1.7 params/verdict 取代，现行值以 params.json/verdict.json 为准"横幅，或按 M1.7 §5"优先级正典写入 SPEC 附注"的欠账一并补。P3。

---

## 被攻击但守住（DEFENDED，供架构师知悉攻击面已探过）

| 攻击（红队/预判） | 结论 | 依据 |
|---|---|---|
| 弹簧离散积分大 dt 爆振（我盲答预判#1，红队B气味线索） | **守住** | `SETTLE_MS=2000` 解析跳跃 + 4ms 子步（ωn·h≪2）+ driver 100ms 网格三重防守；3天单步 & 200×1999ms 目标跳变均有界（B-3） |
| 报告 `toISOString` 对极端未来时间戳抛 RangeError（红队C/预判#4变体） | **守住** | 超范围 ISO → `Date.parse`→NaN→被 `Number.isFinite` 挡；最大合法时间戳 toISOString 不抛（C-2） |
| tag/save 正则 ReDoS（我盲答预判#6） | **守住** | 全部正则线性、无嵌套量词；`{16,}`/`\s+`/交替均 O(n)（代码审阅 + C-1 未挂） |
| 迟滞恰在阈值等号（红队B气味线索/预判#4） | **语义守住** | `T>=enter` 升、`T<exit` 降，归属确定（B-4）；残留风险是"命中等号"的浮点可复现性，见下 |
| 同平台确定性（SPEC §3） | **守住** | 五带各两跑 curve+moments **逐字节一致**（B-1，印证金测试⑤扩到真带） |
| 恶意磁带崩/慢（红队C：截断/孤儿/同毫秒千事件/负时间戳/嵌套） | **守住** | distill+replay 未崩，坏行计数跳过、孤儿 result 忽略、无 result 记 NA（C-1） |
| 过期型 CLEARED tick 对齐随时长退化（红队/预判#7） | **守住** | **6h 真实节奏 soak**：前半 25.7ms / 后半 26.1ms，≈一个 50ms tick，不随 6h 漂（M1.6-A §2.6 正典不变量成立） |
| driver advance/ingest/reap 排序错致漏衰减 | **守住** | `replay.ts:144-155` 每事件先 `advanceTo`→`reap`→`ingest`；STUCK_LOOP/RESOLVE 发射 drift 恒 0（6h soak 230 个全 0） |

**跨平台确定性（未主张、未验证）**：SPEC §3 只主张"同一磁带两次回放逐字节一致"（同平台同进程），此成立。`Math.exp/pow/tanh` 与浮点累加是 libm 相关，**跨 Node 版本/平台一致性 SPEC 未主张亦本审计无法证**（无第二平台）。红队B气味线索"确定性跨 Node/平台是否真成立"——答：**当前只保证同平台**；建议 SPEC 明写此边界，避免未来"分享带/多端复算"时踩空。

---

## 分歧席（阶段零盲答 vs 现设计；不评对错，供架构师读）

盲答全文见 `audit/PREREG_DESIGN.md`。**大面积趋同**（独立到达同一设计，是现设计稳健的旁证）：S/T 饱和、乘法泄能、errClass 签名聚类、施密特迟滞、注入时钟确定性、RESOLVE-vs-过期两种"解脱"之分、弹簧只作用于针（T/天气走诚实 RC）、被动消散设计性沉默。以下为**分歧**：

1. **张力该由"挣扎行为"还是"错误标签"驱动？** 我盲答主张 `tension=f(挣扎模式)`——一条错误被立刻绕过 vs 被反复纠缠是两类事件（用 agent 的**反应**给错误定权）。现设计纯由 FAIL 事件充能 + rep 复现系数，"行为"只经"同签名复现"进入。后果：一串**良性一次性错误**（探索式 grep 循环）在现设计里仍逐条充能（虽小、虽衰减），我的设计会因"被立刻绕过"而几乎不充。→ 现设计对"良性错误簇"更敏感，这是发现2误报的同源根。**架构师可考虑**：给"错误后 agent 是否纠缠"一个权重闸。

2. **SAVE/test 该不该无条件奏解脱？** 我盲答主张解脱**必须正比于被释放的张力**、且平静时的提交不奏和弦（"没有张力可解脱")。现设计 SAVE-OK 恒发 RESOLVE+×0.5（M16 §2.1.2 签核），平静提交也奏和弦。→ 分歧点，且与发现2叠加放大误报。

3. **errClass 一механизм двойного назначения**：我盲答明确预判"errClass 同时被指望做聚类键与脱敏器，两目标冲突"（预判#2）。现设计正是一个 `normErr` 兼两职——发现1即此冲突的兑现。**这条盲答→实锤的命中，是分歧席里最该看的一条。**

4. **针在上行要不要过冲？** 我盲答倾向上行不振铃以免"假松弛下探"；现设计上行欠阻尼 ζ=0.6（~9% 过冲）——但因过冲只在**针**、T/天气走诚实曲线，且下行过阻尼不振铃，我判**其选择可辩护**（针的机械生命感 vs 诚实分层）。记录分歧，不主张改。

---

## 质疑架构师席（对判据/教义/优先级正典本身的质疑，显式欢迎，单列不修）

1. **n=5 卷 + 1 人耳朵，够冻结"感知常量"吗？** 全库零出血型风暴、五带皆一人历史；smooth 的 `peakT<0.50`="平静之日永不见雨" 是**真正的感知主张**，却校准在单人语料上。封版把 `weather.up`(0.25/0.5/0.75) 奉为"尺子/感知常量不可动"（M16 §2.3），但它们的**标定**来自 n=5。质疑：感知常量的**普适性**是被论证的，还是被这卷语料**过拟合**的？（不反对冻结，反对把"这个用户的风暴长这样"误当"风暴就长这样"——手记二.1 已自省，值得升格为封版前的显式风险条目。）

2. **把 storm 的解脱表达退成"沉默/衰减"，是否恰恰放弃了仪器的存在理由？** `resolveOnOpportunity` 退役的理由"现实中雨停无人奏和弦"很美，但后果是：**情绪弧最完整的那卷带（storm），其"解脱"在 v0 完全无声**。这台仪器的北极星是"把 T 的手感调对"、终点是那一下松弛——却对最需要松弛的场景选择不表达。质疑：这是"诚实"（消散≠解决）还是"回避了最难的建模"（迷路型风暴的平息本就难编码）？手记二.2/三决策点#2 已把球踢给架构师，建议封版前**显式定音**，别让它默认躺成 v0 永久缺声。

3. **优先级正典把"安全硬禁"列第一，但安全没有对应的红队闸门。** 判据(verdict)有 sweep 批量证伪、协议有冻结签核，唯独"安全硬禁"（含隐私最小化）**只有禁令清单、没有可执行的验伪机制**。发现1（短密钥穿透被追认为"加固"的净化）说明：**没有对抗性隐私测试，"加固"是自我感觉**。质疑：既然安全是正典第一，是否该给它一个与 sweep 同级的"隐私红队金测试"常设闸门（本审计 `redteamA_privacy.ts` 可作种子），而不是靠夜班令一次性突击？

---

## 附录 · 复现与耐力测试索引

**repro（`audit/repro/`，均 `node <file>` 直跑，导入真实模块）**：
- `redteamA_privacy.ts` (+`.out.txt`) — 短密钥穿透 + redact 反演 + 时间戳指纹
- `redteamB_math.ts` (+`.out.txt`) — 双跑确定性(五带)、wow(n=2)、弹簧大dt、迟滞等号
- `redteamC_falsetag.ts` (+`.out.txt`) — tag/SAVE 误匹配 → 误 RESOLVE 端到端
- `redteamC_robust.ts` (+`.out.txt`) — 酷刑磁带禁崩、极端时间戳、性能拐点(N=500/5k/50k)

**soak（`audit/soak/`，自记录/自终止/会话解耦）**：
- `soak.ts` — 合成会话发生器(seeded, calm↔burst 状态机) + live-等价消费者(bounded)；测 RSS/CPU、发射漂移、expiry tick 对齐。环境变量 `SOAK_HOURS/SOAK_SPEED/SOAK_SEED/SOAK_DIR`。
- `soak-summarize.ts` — **独立**摘要器；`node audit/soak/soak-summarize.ts [samplesPath]` 随时出 `SOAK_REPORT.md`（中期/最终皆可）。
- **本轮已完成**：真实节奏 **6h 跑跑满自终止**（speed=1，seed=42，wall 21631s，`run/soak-done.json` 见证）。结果：959 事件/335 失败/257 发射；**RSS 恒 ~80MB（斜率 0.005MB/min，无泄漏）**；发射 drift 全 0；expiry 对齐 25.7→26.1ms（不退化）；sigStates 0→93（发现3）。终报见 `audit/soak/SOAK_REPORT.md`。
- **可复跑**（晨间/任何时刻，一条命令即刷新报告，不依赖 soak 进程存活）：
  ```
  node audit/soak/soak-summarize.ts audit/soak/run/soak-samples.jsonl
  ```

**晨间流程建议**：架构师裁 #1/#2（P1/P2 中触宪法两条）→ 修复令 → 修完重跑 26 金测试 + sweep + 本 repro 四脚本 + 收 soak 终报 → 与盲听结论合流 → v0 封版三件套照旧。

---

## 附录 · 与平行审计 B 的交叉核对（事后添加，不改动上文独立发现）

审计收尾时发现存在**第二份独立审计** `audit/b/`（施工方 B，其盲答 PREREG 时间戳早于本报告，确为独立平行红队，非本人所作、未改动）。平行红队的价值即在于独立性下的交叉验证，故在此逐条核对。**本节为事后交叉核对，上文所有发现均为我未看 B 之前独立得出。**

**双方独立趋同（强佐证——两组新眼睛各自撞到同一处）**：
- 我发现2 ≡ B-1（tag/SAVE 正则误匹配 → 伪造 RESOLVE，违 §1 诚实条款）。**B 定 P1，我定 P2**——B 的论证更锋利（"当前不发作是运气不是设计；且污染机会审计成幻影 test-OK，蒸馏后无从复核"），**我接受上修为 P1**：它触宪法级条款，两审独立命中，置信度高。
- 我发现1 ≡ B-2（`--redact` 非零明文）——但**攻击向量互补**：我打 `errClass`（短密钥 5/7 存活 + `sig` 的 FNV 反演），B 打 `tool` 字段（**MCP 工具名 `mcp__Acme__deployProd` 原样穿透**）+ 绝对时间戳。**我漏了 tool 名向量**（`parse.ts` 明文存 `tool:name`）——B 补上，合并后此 P1 更完整。
- 我发现5 ≡ B-4（死参数 + 正则硬编码发散）｜我发现3 ≡ B-8（sigStates 无 evict）｜我发现7 ≡ B-7（确定性仅限有序输入 + replay≡live 半测）｜我发现6 ≡ B 附注（cli live 桩）｜我"跨平台确定性未证" ≡ B-9｜我 DEFENDED(ReDoS 干净/畸形磁带不崩) ≡ B 附注。**七处趋同。**

**B 独立捕获、本报告漏掉（我已亲手复核确认，非转述）**：
- **B-3〔P1〕STUCK 充能侧 sig 跨目标塌缩**：我实测 storm 带 78 读失败横跨 **61 个不同 targetHash 却仅 18 个 sig**，最大一个 sig **塌缩 29 个不同 URL**。因 `sig=fnv1a(verb|tool|errClass)` 而 errClass 把 URL 归一成 PATH，"翻找 29 个不同地方失败"被充能侧当成"踩死同一把耙子"→ **封版 storm 的"9 卡碟边沿"这条 active 判据实为过度归一的产物**，且**反噬 resolveOnOpportunity 退役的"迷路型"论证**。这是比我多条 P2 更深的发现，我漏了——targetHash 只用于**清除**侧（`clearSigOf`），**充能/sig 侧不含它**（`parse.ts:341`），我查隐私时碰到 errChar 归一却没连到 STUCK 误组。**确认成立，应升 P1。**
- **B-10〔P3〕针无上夹**：我核 `engine/index.ts:120` 仅 `needlePos<0→0` 下夹，**无上夹**→ 饱和过冲可越 1.0（B 报 1.089；smooth 针峰 0.5018 越 0.50，判据测 T 不测 needle 故漏）。确认成立。
- **B-5〔P2〕未决 RUN 滴灌对其点名场景失效**（真挂起 RUN 被 `resolveT!==null` 过滤）——我未查 drip 逻辑，B 补上（我信其证据链，未复跑）。

**本报告独有、B 未覆盖（互补）**：短密钥 5/7 可恢复存活的量化 + `sig` FNV 字典反演演示（`redteamA_privacy.ts`）｜**完整 6h 真实节奏 soak**（RSS 恒 80MB/斜率 0.005、drift 全 0、expiry 26ms 不退化——B 的 soak 未见等长真实跑）｜五真带双跑逐字节确定性。

**交叉核对结论**：两份独立审计在**四条 P1 级主张**（false-RESOLVE 违诚实、redact 非零明文、STUCK 跨目标塌缩、死参数挡修法）上收敛，是强封版前信号。**架构师应读两份之并集**；本报告与 `audit/b/AUDIT_REPORT_B.md` 无冲突、互补。合并后 P1 清单：①诚实条款(false-RESOLVE) ②可分享主张(redact，errClass+tool名+时间戳三向量) ③storm 卡碟判据可信度(sig 跨目标塌缩)。
