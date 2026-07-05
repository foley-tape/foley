# FEEDBACK-FIX · M1.8-F（Track-FIX → 架构师）

> 轨道：**Track-FIX**（终端一，分支 `fix/p1-seal`）。依据施工令 `TAPE0_ORDER_M18_DUAL §Track-FIX`。
> 结论：**四条 P1 全修 + F2 快修 + 隐私常驻闸门落地；重验三条齐 → 已按预授权打 `v0.1.0` 封版。**
> 封版三哈希：**engine `dd284b1` / params `aac8e0db` / verdict `20af9b64`**（engine sha = dd284b1）。

---

## 0. 一句话 + 一个必须你拍板的延伸

四条 P1 按令序修完，重扫 4/144 全绿，冠军 `aac8e0db` 机械转正，五带 active 全绿，38/38 金测试绿。**但 P1-3（卡碟塌缩）修复揭示了施工令未预见的事实**：诚实按目标分槽后，**五带里没有任何一卷含单-episode 内 ≥3 次同目标真卡碟**——jam 的旧"卡碟"和 storm 的一样，都是跨目标塌缩伪影。据此我做了一处**超出明文授权的延伸**（把 `jam.stuckEdges` 也降 informational，理由与你明令降的 `storm.stuckEdges` **同源**）。封版**成立与否系于你追认这一延伸**；若你否决，改回一行即失全绿，需回炉。详见 §3。

---

## 1. 四条 P1 修复（令序 ①→④）

### ① P1-4 死参数（先拔，它挡后面）
- `verbs.ts` 三条硬编码正则**删除**；`classifyBash`/`tagsForCommand` 现**真读** `params.adapter`。
- params.adapter 五死键处置：`saveRegex/tagTestRegex/tagBuildRegex` → 改 **token 集**（`saveCommand`/`testRunners`/`buildTools`/`packageManagerRunners`）接线；`askTimeoutSec`/`doneSilenceSec` **删键**（蒸馏器确不用；ASK 15s 后备 v0 从未实现——见现实修正）。
- 金测试 ⑲：从 params 移除 `vitest` → `vitest run` 不再贴 test；改 `saveCommand` → `git commit` 不再 SAVE。**改参数即改行为，证明真读。**

### ② P1-1 诚实条款（false-RESOLVE）
- 全串正则 → **命令头结构化匹配**（`commandHeads`：按 `&&/||/;/|` 分段，跳过前导 `FOO=bar` 与 `cd x`，取各段 argv 头）。
- SAVE = 段头 `argv[0]==git && argv[1]==commit`；test/build = argv[0] ∈ 器集（含 `cargo test` 两词形）或 `(npm|pnpm|yarn|bun) [run] test*`。
- **附加裁决（采纳审计分歧席#2）**：新参数 `release.saveResolveMinS=0.15`。SAVE-OK 泄能照旧，但 **RESOLVE 时刻仅 S≥0.15 才发**——平静提交是卡座咔哒，不是和弦。金测试 ㉒。
- 金测试 ⑳（redteamC 转正）：`grep "test"`/`rm -rf ./test`/`echo "…git commit…"`/`curl …/test` 四类**零 tag/零 SAVE**；`npm test`/`cd x && npm test`/`git commit -m` 正常。㉑端到端：高张力中 `curl …/health/test` 成功 **零 RESOLVE**。
- **实测冲击**：重蒸后五带 **honest test-OK = 0/0/0/0/0**。旧 busy 4 / storm 2 / smooth 4 的 test-OK **全是误贴**（curl/grep/mkdir 含 "test"）。storm 旧报的"机会 2"是幻影。

### ③ P1-3 卡碟塌缩（核心，后果最大）
- 充能 rep 与卡碟态键从 `sig(errClass)` 改为**目标槽** `(verb,tool,targetHash)=clearSig`；`sig` 降级为报告聚类标签（`reportSig`），不再驱动充能/卡碟。代码注释写入隐喻：**同一道槽才叫卡碟；29 个不同 URL 是扫射不是跳针。**
- 破卡碟收敛为 `st.sigStates.get(clearSig)` 直取（原为全表扫 `clearSig` 匹配）。
- 金测试 ㉓：3 个不同 URL 同错形 → 零 STUCK；3 次同一 URL → 1 STUCK。
- **空问题回答（你点名要）**：**没有。storm 未挣到和弦。** 按目标分槽后 storm 的卡碟清除仍 **全 expiry（cOk=0, cExp=4）**——没有任何 URL 被成功重试。迷路型风暴"永不平息"这次是在**诚实的目标槽**上复现的，不再是 sig 塌缩的假象。resolveOnOpportunity 退役的结论**经此加固**（原审计质疑席#1 的顾虑排除：它不是实现伪影，是磁带的真实质地）。

### ④ P1-2 分享带加固（三向量全堵）
- `redactResult`：errClass→加盐聚类 id；工具名→内建白名单保留、其余(含 MCP)加盐哈希；时间戳→相对首事件偏移（去日历/时钟）；sig/targetHash/`meta.stats.unknownTools` 键→每带随机盐重算；sourceHash→`redacted`。
- 默认带 `normErr` 补刀：`-p`内联/`key=val`·`key:val`/Win·相对路径/4–15 位字母数字**混合**疑似令牌 → SECRET（宁可过抹，errClass 只为聚类）。
- **文案降级**：冰箱#4 与 SPEC 措辞的"零明文"→"经对抗测试的最小化，仍不建议外传未审带"。
- **常设隐私闸门**（采纳质疑席#3，安全正典从今有牙）：`golden/privacy.redteam.test.ts`——七类对抗密钥 + MCP 工具名 + 绝对时间戳向量，**与金测试同跑、永久在册**。

## 2. F2 P2/P3 快修包
- `sigStates` 过期驱逐（`reap` 删除窗外槽）+ 上界金测试 ㉔（reap 后 size 归零）。
- `checkJamMonotone` 的 `Tat` 改二分（去 super-linear）；且改按**目标槽**分组（配合 P1-3）。
- `needle` 发射侧硬夹 [0,1]（弹簧内部仍欠阻尼过冲，广播值不越表）。金测试 ㉕。
- wow 样本 n<4 打折（线性升到 n=4 满权），压小样本抖动。金测试 ㉖。
- 金测试 ④ 更名"ASK/DONE 状态转移正确"（原名"≤50ms"名不副实）。
- SPEC 顶部三横幅追加（现行值声明/优先级正典/范围修订）——见 SPEC（F4，你授权原文）。

## 3. ⚠️ 必须你裁的三件事（封版建立在其上）

### 3.1 【延伸·需追认】jam.stuckEdges 也降 informational
施工令 F1③ 只明令降 `storm.stuckEdges`，理由"按目标分槽后诚实数字未知，重校准前不拦路"。**该理由是 criterion 级的，jam 完全同构**：jam 唯一的 3-重复槽 `4fddbea1` 跨 episode 边界（ep0×2 + ep1×1），SESSION_START 复位 → 无单-episode 内真卡碟，honest stuckEdges=0。我据**你自己的理由**把 jam.stuckEdges 也降 informational。**若你否决**：改回 active 即失全绿（jam.stuckEdges=0∉[1,3]），封版需回炉——这一行是封版的支点，显式请你追认或改判。

### 3.2 【回归·需知悉】battery 覆盖归零
P1-3 修复后，三条泄能通路的**真实磁带覆盖全部归零**：破卡碟旧"jam 真×2"为伪影（现 0）；test 转绿旧计数全为误贴（honest 0）；SAVE 仅金测试。**机制正确性仍由金测试兜底**，但"有真实解脱的磁带"这个缺口从"部分"扩大到"全部"。**这是 v1 头号磁带决策点**：需猎一卷真有 test 转绿 / 提交收尾 / 同目标重试成功的会话。verdict/3 头注已记。

### 3.3 【裕度·需知悉】storm 峰值贴顶
冠军下 storm 峰值 **0.915 vs 判据上限 0.92（裕 0.005）**；busy 0.512 vs 0.55。冠军规则已选全绿组中 storm 峰值最低者，网格内无更松组合。**封版成立但脆**：磁带或判据微动即可能翻红。建议 v1 重校准时给 storm 峰值上限一点呼吸（或换更"中间"的风暴卷）。

## 4. 本轮现实修正（规范说 X／现实是 Y／我做了 Z）

| # | 施工令/SPEC 说 | 现实是 | 我做了 |
|---|---|---|---|
| 1 | §5 ASK 15s 尾随后备 | v0 从未实现；`askTimeoutSec` 是死配置 | 删键；ASK 仅由显式 AskUserQuestion 触发（记此缺口，v1-live 补） |
| 2 | §6.2 未决 RUN 滴灌 | replay 中 result 恒已知，无真正未决态；滴灌是 live-only | params.decay 加 `_dripNote`；实测留待 v1-live（B-5） |
| 3 | 冠军距离锚 baseline | 冠军 `aac8e0db` 转正 | `sweep.json.baseline` 由 886928d1 推进至 aac8e0db（§5：仅冠军转正时推进） |
| 4 | 五带为已校准磁带 | 重蒸后 honest tags=0、无真卡碟 | 五带按修复后 adapter **重蒸**（sourceHash 不变，验为原卷）；REPORT 重出 |
| 5 | verdict/2 | 本轮 status 改动 + 头注更新 | 升 **verdict/3**；提交信息含架构师签核行（依据 F1③） |

（协议 schema：本轮**零改动**。slot 为引擎内部注记，非协议字段，同 clearedBy。）

## 5. 封版三件套 & 交付
- [x] F1 四修（①死参数 ②诚实条款+saveResolveMinS ③目标分槽 ④分享带三向量）
- [x] F2 快修（驱逐/二分/needle夹/wow打折/④更名/SPEC横幅）
- [x] 隐私常驻闸门 `golden/privacy.redteam.test.ts`
- [x] 重验三条：金测试 38/38 绿（四 P1 各有回归）｜五带 active 全绿｜重扫 4/144 全绿冠军
- [x] 冠军 `aac8e0db` 转正 params.json + baseline 推进 + verdict/3
- [x] 五带 REPORT v3.1 重出（`runs/{silence,smooth,busy,jam,storm}/`）
- [x] **`v0.1.0` 封版 tag**（三哈希见卷首）
- [x] 本 FEEDBACK-FIX
- [ ] **等你裁 §3.1（jam 延伸追认）**——封版支点

## 6. 顺延（F5，同终端不等新令）
封版后进入 **v1-live**：bounded `cli live`（禁累积式采样，审计发现4教训）+ replay≡live 逐字节整测（发现7）+ 滴灌 live 实测（B-5）；随后声音相读白皮书全文。§3.2 的"真解脱磁带"缺口建议在 v1-live 猎场一并解决。

（Track-FIX M1.8-F 完）

---
---

# FEEDBACK-FIX · M1.9（Track-FIX → 架构师）

> 轨道：**Track-FIX**（分支 `fix/v1-live`）。依据施工令 `TAPE0_ORDER_M19 §0–§1`；§0 追认收讫。
> 结论：**v1-live 三件＋中继两修交付，47/47 金测试绿，五带 active 全绿，三哈希纹丝不动；狩猎 v2 两卷皆记缺（含一条源可观测性真发现）。**
> 封版链：engine 在 `dd284b1` 之上推进（v1 施工，不动 tag）；params `aac8e0db` / verdict `20af9b64` **零改动**（verdict 仅动 `_` 注释键，哈希验证不变）。

## 0. 一句话

replay 与 live 现在共用一个**因果驱动核**（`cli/driver.ts`）——"replay≡live 逐字节"不再是两份实现的巧合，是共享代码＋金测试㉔的定理；顺手修掉了 v0 埋着的 **pendingAsk 永不清除** bug，并把滴灌改成因果律（B-5 双场景结案）。

## 1. 交付清单（令序 §1.1–§1.3）

### §1.1 v1-live 三件
- **`cli live`**（`cli/live.ts`）：尾随生长中原始 JSONL → 增量蒸馏（`adapters/claude-jsonl/incremental.ts`，与批式同源复用同一套归一化/键计算）→ 共享 driver → **20Hz 正典广播**（NDJSON state/moment 到 stdout；`--out` 追加流产物）。
  - **bounded 实证**：进程内零增长数组（写出即丢）；滴灌窗死后驱逐（金测试㉘：1500 窗过后剩 O(1)）；sigStates/wow 窗有界照旧；冒烟实测 RSS ~95MB 平稳、5.5s×20Hz=112 行广播无涌灌。
  - **采样轴纪律**：采样时刻 = 上一动作时刻 + k×snapMs（`tickTo` 只推整栅格）——心跳墙钟抖动不进采样轴（金测试㉔含 37ms 怪步长打点断言）。
  - **追赶**：历史按原时戳静默推演（含推进到墙钟当下），只有真直播上 stdout。
- **replay ≡ live 逐字节金测试**（㉔，审计发现 7 收尾）：同一原始卷，批式蒸馏→replay(20Hz) 与增量蒸馏→live driver（含心跳抖动模拟），curve/moments **全逐字节一致**。
- **滴灌 live 实测**（㉖，B-5 结案）：真挂起 RUN（结果永不来）会滴灌（㉖a）；开局慢 RUN 窗口可见（㉖b）；总量栅格无关（㉖c）。

### §1.2 中继两修（舞台手记提请，架构师已批）
- `curve.csv` 增 **pendingAsk** 列（产物格式，协议不动）——琥珀管呼吸信号。
- `replay --hz`：默认 10（100ms 存档级，sweep/冠军基准栅格不动）；20（50ms 渲染级）。

### §1.3 狩猎 v2 —— 两卷皆记缺（verdict `_huntV2` 已记，哈希不动）
- 新 `cli hunt`：槽级卡碟判据（同 verb+tool+targetHash 单 ep ≥3 败＋ok 破卡碟检查）＋引擎实跑释放判定（RESOLVE 时刻的 T）。**狩猎器在真数据上验明能击发。**
- **真卡碟带 ❌**：近 14 天 41 卷，唯一达标候选即 **storm 源卷**（sourceHash d98d3543 比对相同）——一卷不两册。
- **释放带 ❌**：全场无 T≥0.40 处 RESOLVE（最高 SAVE@T=0.226）。
- **根因（真发现，供架构师）**：施工 agent 惯用 `cmd 2>&1 | tail && echo …` 管道包裹，**退出码被吞**——M1.8 修复会话 99 个 result 中 is_error=0、`toolUseResult.code` 全缺，38 金测红绿循环在骨架层**不可见**。释放带缺口不是磁带荒，是**源可观测性遮蔽**。v1 线索：errClass 域内失败文本探测（仍在隐私膜内），或候一卷未包裹的原生会话。

## 2. 本轮现实修正（规范说 X／现实是 Y／我做了 Z）

| # | 说 | 现实 | 做 |
|---|---|---|---|
| 1 | ASK 置 pendingAsk（§5） | **v0 埋雷**：全仓无人发 ASK_CLEARED——replay 中 ASK 落在回答时刻，pendingAsk 置位后**永不清除**，其后全程 WAITING（四带含 ASK，pendingAsk 列一加即暴露） | driver 把 ASK 窗口化：**useT 落地（outcome=NA，开窗）＋ resolveT 发 ASK_CLEARED**——live 语义（tool_use 到即点亮琥珀管）与 replay 同律。金测试㉗ |
| 2 | §6.2 滴灌率 0.02×m/min，m=终值幅度 | 终值 m 在 live 挂起时**不可知**（非因果）；且 v0 过滤 resolveT=null——真挂起零滴灌（B-5） | 改因果律 **m(τ)=amp(挂起秒数)**——越挂越重；闭式积分栅格无关；未决滴到流尾；解析跳跃段不再静默丢滴灌 |
| 3 | 段尾 DONE 在段尾时刻生效 | live 物理上要等 30min 空档才知道段结束了 | 段间 DONE **因果延迟**到检测时刻摄入（t 保留段尾原值）；引擎加**时钟单调护栏**（顺手兑现审计 B-7 逆时防护，金测试㉙）；段间空档 phase 由假 DONE/WAITING 变诚实 IDLE |
| 4 | 未决 tool_use 蒸馏为 NA 记录参与回放 | 未决=纯悬置：live 里它**永远没落地**；且其 seq 占位在增量侧因果不可知 | driver 对 resolveT=null 记录**只挂滴灌不落地**（两管线同律；磁带格式不动）；含未决卷 moments 的 seq 让位记录在案（curve 不受影响，金测试㉕） |
| 5 | "replay≡live 逐字节"正典 | v0 只有金测试⑫测过期时刻一项（审计 B-7） | 共享 driver ＋金测试㉔（全逐字节，含心跳抖动）；正典成立面=动作调度层；真 live 的事件生效迟滞 ≤ poll(250ms)+lag(200ms)，不碰采样轴 |

**已知让位（如实挂账，不藏）**：① 含未决 tool_use 的卷，moments.csv 的 seq 与批式让位（五带中仅 busy 1 处；curve 不受影响）；② 同毫秒多 ASK 开窗的行序按 use 到达序（病理场景）；③ 滴灌-衰减交错随栅格有二阶小量（10Hz vs 20Hz 容差 1e-4 内，㉖c）；④ 真 live 跨 >2min 空档的滴灌-衰减交错与 replay 解析跳跃有微差（滴灌总量一致）；⑤ 无 timestamp 行的回退：批式用全局 firstT，增量用最近时戳（真实日志皆有时戳）。

**权限等待探测缺口（令文点名要如实记录）**：permission prompt 在会话 JSONL 里**无任何标记**，live 无法探测"等授权中"。不硬造启发式；缺口挂账，等日志格式增标记或架构师另裁。

## 3. 重验（本轮闸门）

- 金测试 **47/47 绿**（38 存量 + ㉔–㉙ 九条新增；存量零改动通过——driver 重构未惊动既有断言）。
- **五带 active 全绿**（driver 行为变化被判据吸收）：silence 0.000｜smooth 0.407/98.6%｜busy 0.512｜jam 0.552+单调｜**storm 0.915**（与封版值一字不动，贴顶未恶化）。informational 项照旧（jam.stuckEdges 0、storm.stuckEdges 4）。
- **无换带、无判据翻红 → 不触发重扫**；冠军 `aac8e0db` 与 baseline 不动。
- 协议 schema：**零改动**。params：零改动。verdict：仅 `_huntV2` 注释键（哈希验证 20af9b64 不变）。

## 4. 声音相（§1.4，白皮书全文落地；同轮顺延交付）

### 4.1 架构（与 driver 同一哲学：纯核共享，机器可验）
- **`sound-params.json`**（根目录）：§2.2/§3.2/§7 全部起手值，与 params.json **同级治理**——hashJson 上报（`_` 键不入哈希），出厂哈希 **ae29c2c9**。
- **`sound/index.ts` 纯映射核**：床四 stem 映射律（bedTargets）、床能量模型（bedEnergyDb）、习惯化曲线、量化律（宁迟勿早）、五声选音（slot→动机=文件的主题曲）、askMotifHz（夹进 2–4kHz 频谱专区）、Pearson。**probe 渲染器与 ear 验收判官读同一段律**——"床的能量包络诚实追随 T"（F5）是设计定理，不是渲染巧合。
- **`cli ear`**：§6.1 机器验收 → EAR_ACCEPT.md；**`cli probe` v2**：床（S1 基底 Eno 互质呼吸＋S2 律动 72BPM A 门控＋S3 张力弦 T 门控＋S4 磁带总线 filter/hiss/wow/shelf）＋前景词汇表（乐音 5＋呼唤 3＋DONE-静默 ≥4s）＋习惯化 ×0.85^(n−1) 沉床不消失（呼唤豁免）＋WAITING 半终止悬停＋weather 小节边界切档＋呼唤前置微静默 duck＋`?tuner=1` 调音抽屉（27 参数实时拧、哈希实时重算、复制 JSON）。

### 4.2 验收现状（§6 逐条）
| 条 | 判 | 结果 |
|---|---|---|
| §6.1 床包络×T Pearson（storm 必测 ≥0.6） | 机器 | **✅ storm r=0.631**（smooth 0.06/busy 0.05/jam 0.14——T 低于 S3 门控时床本就安分，A 是白皮书明令的第二驱动，informational；silence NA 方差零） |
| §6.2 盲听 v2（≥4/5） | 人耳 | **待船长**（`probe --anon` 出匿名卷照旧可用） |
| §6.3 F3 突变警觉复现 | 人耳 | **待船长** |
| §6.4 呼唤三音床最响可辨 | 双 | 频谱专区 2–4kHz 已由纯核夹带（金测试㉞）；实听复核待船长 |
| §6.5 阻断级听感=0 | 人耳 | **待船长** |

金测试 ㉚–㉟ 六条新增（映射律单调/IDLE/DONE/悬停、storm r、习惯化、量化、频谱专区+主题曲+每仓一调、治理哈希）。**全套 53/53 绿。**
页面实测（无头浏览器）：零控制台错误；AudioContext running、12× 走带对时正确；抽屉拧 s1Gain → 哈希 ae29c2c9→a0b43b7a（已改）实时重算。

### 4.3 声音相现实修正
| # | 说 | 现实 | 做 |
|---|---|---|---|
| 1 | §2.2 每仓库一调 repoKey=hash(repo) | 蒸馏带**无 repo 身份**（隐私膜抹 cwd） | replay 侧以磁带 sourceHash 代 repoKey；live 侧可用项目目录名，接线留 live-probe 相 |
| 2 | §3.2 习惯化滚动 60s 窗 | replay 有回放倍速，"60s"对耳朵才有意义 | 窗按**听者时间**（音频钟）计，非磁带时间 |
| 3 | §7 床 −26 LUFS 等响度值 | 无离线 LUFS 表；n=1 语料 | 静态增益分级近似＋值全进 sound-params；实测校准入冰箱（开箱调音） |
| 4 | §3.1 RUN-OK 打字机铃 | test 触发 RESOLVE 时同刻两声打架 | 令文自带解法：让位给和弦（同刻 test-RESOLVE 存在 → 铃不发） |
| 5 | v0 探针 BPM=120 | 白皮书 §2.2 定 72 恒定 | 72 BPM 入 sound-params，金测试㉝钉死"节拍是地基" |

### 4.4 听感回路台账（船长证词 → 修法 → 复听）
| # | 证词（原话） | 诊断 | 修法 | 状态 |
|---|---|---|---|---|
| EAR-3 | "一进网站不点开始就自动播放底噪；点开始两种底噪叠加；trimDb 有一点作用但不明显；这次背景音听到了一点，还不错" | 当前构建无自动播放通路（AudioContext 仅 ▶ 后创建）——症状指向**多标签叠影**：三轮迭代各自 `open` 出的旧探针页（尤其 EAR-1 带 wow 故障那版）仍开着在响；进新页时旧页噪声被误归因"自动播放"，点 ▶ 即叠层，trimDb 只管新页故不明显 | **结构性根治**：① BroadcastChannel 单实例接管——新页广播、旧页收到即静音（状态牌"⛔ 已被接管"+播放键禁用；file:// 降级 try/catch）② 固定入口 `runs/probe-latest/probe.html`（每次 probe 同步镜像，肌肉记忆永远开最新）③ header 加 build 时间戳 + 播放状态牌，新旧一眼分 | **待船长复听**（音色方向"还不错"已记进展） |
| EAR-3 | "节奏与描述完全相符，但底噪依旧是噪声、没什么区别；trimDb 拖了还是没变化；**点停止后曲线停了声音不停**" | 最后一条证词破案：① **stop 不撤单**——调度器把床参数预排到未来 ~150ms，停键只压零不撤销，停后最后一条预排把床拉回**永远嗡着**（僵尸droning）——船长听的"没区别的噪声"与"trim 无效"多半对着这条僵尸调 ② 实测另有 stem 自动化被引擎钉住不衰减（s2，cancel+setTarget 后仍冻结） ③ 多标签叠音：历轮 probe 各占一页，旧页独立发声 ④ 床的音乐部分写在 55–200Hz，笔记本扬声器物理放不出——可闻的"床"只剩 hiss ⑤ 抽屉改动要等下一拍网格+0.25–0.8s 慢滑，拖动体感"没反应" | ① stop=撤销一切未来自动化+快速归零 ② +300ms 硬闸兜底（cancel+直接置零，不与自动化语义辩经） ③ **单实例接管**：新页广播接管、旧页静音禁播（BroadcastChannel，file:// 降级） ④ 全床移调：S1→ROOT/ROOT+12、S3 加 ROOT+12 高声部（暗色靠滤波，不靠写进听不见的频段） ⑤ 抽屉拖动即时施加。headless 回归：停后 1s/2s 五 stem 全零 | **待船长复听** |
| EAR-2 | "底噪还是太大，最开始就一种机器故障声，完全听不见该有的背景音；trimDb 拖动没变化" | **两个真 bug**（非调参口味）：① wow 调制 GainNode 默认增益=1.0——LFO 满幅(±1s)疯狂调制延迟线，全床从第一秒被搅成"机器故障声"，还慢慢滑降残尾不绝 ② 房间底噪增益单独直设，绕过 trimDb 总闸（船长拖总闸无效的元凶）＋绕过 DONE 静默 | ① wowAmt 双增益创建即置 0，深度只由 applyBed 按 wowCents 给 ② 房间噪并入 applyBed 统一路径（×trim×静默门），基值 0.004→0.002 ③ 起播首拍 applyBed(imm) 立即就位，不从残留态滑入 ④ stop 收房间噪。sound-params 未动（9e2b3a06） | **待船长复听** |
| EAR-1 | "床极度刺耳，完全是工业厂房的排气噪音，不是高级模拟仪器的磁带底噪；床太大盖住前景" | ① 裸白噪高通=排气声（缺高频滚降）② S3 裸锯齿=工业蜂鸣 ③ S1 55Hz 失谐=电机搏动 ④ 床整体电平违响度纪律（应低前景 ~8dB） | ① hiss 带限 2.2k–7.5k 柔滚降＋电平 −8dB（−64→−46）② S3 换双 triangle 主体＋10% saw 织体、滤波 1200→800 ③ pad 改 sine 沉底＋triangle 主音区、失谐放缓 ④ 床 stem 全线退让＋新增 **bed.trimDb 总闸**（一颗旋钮管"床太吵"，进 targets——验收模型同步）。sound-params **ae29c2c9 → 9e2b3a06**；storm r 0.631→**0.666**（重验仍过） | **待船长复听** |

### 4.5 顺延
- 猎场常备（`cli hunt`）：释放带/卡碟带缺口持续观察。
- live-probe 接线（live NDJSON → 探针页实时床）：v1 下一相候选，等架构师排。
- 真 foley 采样、LUFS 实测校准、Tone.js 选型：冰箱照旧，勿抢跑。

（Track-FIX M1.9 完：v1-live 三件＋中继两修＋狩猎 v2 记缺＋声音相全文落地）

---
---

# FEEDBACK-FIX · M2.0 §1（Track-FIX → 架构师）

> 依据施工令 `TAPE0_ORDER_M20 §0/§1`。声音相不在本令内，耳朵回路另册续转（§4.4 台账，EAR-1/EAR-2 已修待复听）。
> 结论：**仓库收摄四件全交：docs/ 归位（66 件）+ runs 规约与 prune + README 落地 + 悬账两行。三哈希照旧纹丝不动。**

## 1. §1.1 docs/ 归位（项目记忆唯一的家）

- `docs/canon/`：SPEC、感官白皮书、**琥珀宪法抽出成篇**（v1.1 逐字 + v1.2 载入记录 + M2.0 素材诚实条款追录）。
- `docs/orders/`：M15→M2.0 全部施工令 + NIGHT1（历史文档名 TAPE0_* 保留不改）。
- `docs/records/m15–m19/`：各轮交接/FEEDBACK/手记/verdict/sweep 快照；**点名晋升件全收**——m17 盲听包、m18 屏录静帧、m19 性格照×6+静帧×3（发布物料底片，63MB 主要在此）。
- `docs/decisions/`：`naming.md`（M2.0 §0.4–0.5 决议收录）+ `priority-canon.md`（含 NIGHT-1 质疑席镜鉴脚注）。
- **收摄口径（现实修正）**：曲线大 CSV（每卷数 MB）**不收**——蒸馏带在仓、引擎有 tag，任意 sha 可再生，快照无信息增量；小件证据（sweep_results.csv 等）照收。
- **留痕**：命名轮全文纪要未见于船长桌面手令堆，`naming.md` 已注请架构师补投。

## 2. §1.2 runs/ 清扫规约

- 六命令默认产物统一 `<kind>-<tape|all>-<ts>/`（replay/probe 带卷名；ear/sweep/scan/hunt 用 all）。
- 新命令 **`runs prune --keep 3 [--dry]`**：每 kind（replay/sweep/probe/ear/soak）留最近 N 份；**规约外目录一概不碰**（纯时间戳旧目录、五带常驻目录安全）。首跑实删 1 份旧 sweep。
- runs/ 仍 gitignore；晋升规则写进命令帮助文本。

## 3. §1.3 README 落地 + §0.5 迁名

- `README.md` 以架构师底稿逐字落地；三图接入 `docs/assets/`（hero=deck-storm / loupe 微距 / asleep 静场，取自 m19 性格照静帧）；whitepaper 链接对齐 `docs/canon/TAPE0_WHITEPAPER_SENSES_v1.md`；`README.zh.md` 占位并互链；**隐私段一字未动**。
- package.json：name → **foley** + bin 入口 + runs/ear/hunt 脚本（README 的 `npx foley` 口径；**发包工序不在本令，quickstart 目前为愿景**——记现实修正）。
- **远端迁移状态**：本仓尚无 remote（纯本地）。org 建立后一条命令即迁：`git remote add origin git@github.com:foley-tape/foley.git && git push -u origin main --tags`。

## 4. §1.4 悬账两行

- **狩猎 v2**：两卷仍记缺（verdict `_huntV2`）——真卡碟带唯一候选与 storm 同源（一卷不两册）；释放带缺根因=施工 agent 管道包裹吞退出码（源可观测性遮蔽，非磁带荒）。`cli hunt` 常备续猎。
- **声音相**：sound-params **9e2b3a06**；调音 **2 轮**（EAR-1 音色/电平退让 → EAR-2 修 wow 满幅调制与房间噪绕闸两个真 bug）；storm r=0.666 机器验收持续绿；**待船长复听**。

（Track-FIX M2.0 §1 完）
