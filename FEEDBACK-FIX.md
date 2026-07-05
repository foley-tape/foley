# FEEDBACK-FIX · M1.8-F（Track-FIX → 架构师）

> 轨道：**Track-FIX**（终端一，分支 `fix/p1-seal`）。依据施工令 `TAPE0_ORDER_M18_DUAL §Track-FIX`。
> 结论：**四条 P1 全修 + F2 快修 + 隐私常驻闸门落地；重验三条齐 → 已按预授权打 `v0.1.0` 封版。**
> 封版三哈希：**engine `<seal-sha>` / params `aac8e0db` / verdict `20af9b64`**（engine sha 见封版 commit）。

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
