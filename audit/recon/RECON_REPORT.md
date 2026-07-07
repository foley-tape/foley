# RECON 勘验报告 · 阶段〇

- **奉令**：《FOLEY 派生手册》阶段〇勘验卡＋《第二号手令》增补二·4（Tone.js 尽调）／增补一（worktree 建制）
- **勘验环境**：worktree `track/recon`（基于 main=`8c7a198`，干净检出）；macOS（Darwin 25.5.0）；Node v26.0.0（过 `engines>=23.6` 门）；npm 11.12.1
- **勘验会话（真实材料申明）**：本勘验自身的 Claude Code 会话（`afec830a…jsonl`，19.7 活跃分钟/69 事件/2.9% 失败率，scan 体检榜首）即勘验用真实会话——**机器全程播放的是它自己被勘验的现场**。storm 演示卷全程未用于任何自证，仅在验证"歇场 302"这一设计行为处出现于断言目标。
- **边界申明**：全程只读源码；唯一写面＝`audit/recon/**`（本报告＋截图＋复现脚本）。运行副产物（runs/、untracked mp3）见 §六。
- **诚实界限**：勘验者是 agent，不长耳朵。凡"出声"结论均以 master 总线旁挂 AnalyserNode 实测 RMS＋AudioContext 状态为证；**真人耳朵的最终验收权仍在船长/审计庭**（验收最高法不因本报告让渡）。

---

## 一、地基复核（《继任交接指南》§1 六项逐项实跑）

| # | 清单项 | 判定 | 关键证据 |
|---|---|---|---|
| 1 | 金测试实跑 | **真** | 干净 worktree `npm ci`＋`npm test`：**116/116 全绿**（21.4s，suites 2）。顺带实证甲-2"干净克隆全绿"（无 tapes/raw、无 mp3 条件下全绿） |
| 2 | v0.1.0 封版可复现 | **部分（封版自身为真，指南表述有误）** | tag 存在（2026-07-05，锚 `dd284b1`）；干净检出跑测 **ENOENT 红**（五带当年系私件不入 git）；补入 `tapes/raw/` 原始五带后 **38/38 绿**——与 tag 自述"38/38 金测试绿"完全一致。⚠️ 指南"曾封版 v0.1.0，约百条金测试全绿"中"约百条"系把后续轮次数字（现 116）错植到封版时点 |
| 3 | 五带校准器可运行 | **真** | `sweep` 144 组×五带实跑完成：**4 组全绿→冠军选定**，产物 `runs/sweep-all-2026-07-07T09-34-31-136Z/`。三重吻合：现行 params hash `aac8e0db` ＝封版冠军 hash ＝今日重扫仍 4/144 全绿；且扫的是**脱敏骨架五带**（甲-2 后形态）照常工作。机器耳 `npm run ear`：active 四门（G1/G2/G3/G7v3）**全绿**，G7 唱片在位 −20.87 LUFS；G4v2/G5/G8 informational 记分与台账一致 |
| 4 | 蒸馏/脱敏双轨真实生效 | **真** | 对**本勘验会话**活体双蒸：默认→`src=redacted`、时间全相对（首事件 t=182855 相对 ms）、六向量泄漏扫描全 0（`@gmail`/用户名/`2026-07`/`shadow`/`tape0`/ISO 时刻——原始 JSONL 中六者俱在）；`--raw`→stderr 强警示＋绝对纪元 ms（1783416305512）＋真 `src=9fda2874`。`scan` 77 卷正常体检 |
| 5 | 画面 live 实屏确认 | **真** | 真浏览器（chromium-1228 headless）开正门：`mode=live` 尾随本会话；两帧间隔 15s 截图（`shots/01,02`）**带轴转动＋纸迹推进**；`/today/curve.csv` 行数 18638→19256（20Hz 快照活着）；控制台零 PAGEERROR |
| 6 | 回放出片全链路实跑 | **真** | ①`replay` 我的真实脱敏带→REPORT.md＋curve＋moments 全出；②`--film busy`（真实会话骨架带）→**1450 帧/48.3s 片长/5.9s 壁钟＝8.22× 实时**，h264+aac 音画 Δ4.3ms（`runs/recon-film/`，71.7MB）；③mp4 元数据扫描：**mvhd/tkhd×2/mdhd×2 五处 creation=modification=0**（TR-1 mp4scrub 在新鲜真实导出上生效）；sidecar meta 键面无 createdAt/无会话时间戳 |

**附：M2.6 四颗 P1 在 main 运行时全部活着**（勘验顺带复核，非代签——红队签署程序照旧走 GATE §8）：
- ① 默认脱敏反转：见上表第 4 项（默认即脱敏＋`--raw` 强警示）
- ② serve 畸形 %-路径 DoS：`curl --path-as-is '/%zz%%%ff'` → **400，进程存活**（下一请求 200）
- ③ 脱敏夹具入库干净全绿：见上表第 1 项
- ④ GET 面 Host 白名单：`Host: evil.com:4173` → **403**；正常 Host → 200

---

## 二、真人勘验（外部新用户全程走查 · 断点与困惑实录）

**走查路径**：世界视角 npx → 正门起播 → 接真实会话 → 第一分钟听声 → 干活看针 → 收工找卡。

### B0 · 世界视角：`npx foley` 今天必死（已知，非新雷）
`npm view foley` → **404**。包未发布（`private:true` 保险栓在，符合拆闸纪律）。**好消息：`foley` 名在 npm 上未被抢注**——发布日可用。在 publish 前，README Quickstart 首行对外是期票（冷读者案已在册）。

### B1 · 裸正门：活 ✓
`npx .`（源码形态）→ serve 起 4173 → 自动尝试开浏览器 → live 尾随最近会话（正是本会话）。G8 热修的正门在裸形态下成立。

### B2 · 【新雷·P2】CLI 参数面断线：带任何参数的正门死
`npx . 4180 --no-open` → **打印 usage、exit 2**。`cli/index.ts:39` 只在 `argv[2]` 为空/`play`/`deck` 时走 deck 分支——端口或旗标一旦作首参即坠入未知命令。矛盾三处：源码注释自称"参数透传（端口/--replay-only/--raw 等）"；usage 文案未教 `play` 子命令；`play 4180 --no-open` 实测通（200）。README 只教裸命令故新手不撞，但任何想换端口/静默启动的用户第一步就撞墙。

### B3 · 【命门·双证确认】live 模式零声——静音的第一分钟在产品条件下依然成立
- **代码证**：`stage/js/main.js:95-130`——live 分支从未挂 SoundBridge；声桥只焊在回放（else）分支，注释自供"live 流式声部件属 Track-SOUND 候界面（G8 范围=零配置开箱回放有声）"。
- **运行时证**：真浏览器开 live 正门，手势点击后 `__stage.sound === undefined`（回放页同法点击即出声）——live 连"可解锁的声音"都不存在。
- **架构根因证**：`soundbridge.js start(tape)` 吃**完整** curve 一次性 `buildTrack`（字面意义的"整带上桥"）；live 无完整带可给，此设计下流式无从谈起。
- **对照**：回放路（busy 真实骨架带、唱片/床音双缺席条件）手势后 ctx=running，**master 实测 RMS avg 0.066/peak 0.091**（合成退路真在响）；唱片在位时 **record="Still Life" 真上桥（RMS peak 0.139）**。
- **结论**：指南 §0 的诊断在 main HEAD 上逐字成立。G8 救活的是"歇场→302→storm 回放"与显式 `?tape=` 回放；**真人接上正在跑的 agent（产品条件本身）依旧死寂**。轨甲靶心确认无误，"整带上桥"残骸位置：`soundbridge.js`（整带 buildTrack）＋`main.js`（分支隔离）。

### B4 · 【新雷·P1 级候审】`foley records` 与 deck 断线：下载成功，页面照旧没唱片
- `foley records` 落盘至 `~/.foley/records/factory/`＋`~/.foley/assets/factory/`（唱片×3＋床音×3，CLI 报"齐备"）。
- serve 的挂载（`serve.mjs:290-291`）`/records/**`、`/sound/**` **只映射 repo 内真身，无 factory 缓存回退** → deck 端 mp3 仍 404 → 永远房间层。
- **npm 包用户双层皆断**：mp3（files 排除）与 wav 床音（files 排除，git 里有）都不在包里；下载后 serve 又不回捞——README"run `npx foley records` to swap in the real factory music"对包用户是死承诺。
- **为何一直没被撞到**：开发机 `sound/records/*.mp3` vendored 在位（船长走查永远有唱片）；机器耳走 `records-node.ts`（**有** factory 回退）故测试全绿——教科书级"验收条件≠产品条件"。
- **旁证**：把 mp3 拷回 repo 位后 deck 立即真放唱片（Still Life）——音频代码本体无恙，断点唯 serve 挂载一处。
- **归属待架构师裁**：性质属分享面/serve 基建（轨丙地盘）但服务命门体验（轨甲验收线"Releases 缺席不死寂"之姊妹条件）。建议：serve `/records/**`、`/sound/assets/**` 增加 factory 缓存回退位（只读、同 fence 纪律）。

### B5 · 歇场自举：设计行为实证 ✓
空会话根（`FOLEY_PROJECTS=空目录`）裸正门 → **302 `/?tape=storm&speed=8`** → 200。G8"永恒 IDLE 死机观感"的修复活着。

### B6 · 收工吐卡：未接（已知断点，轨乙靶区确认）
hooks 在库使用数 **0**（adapters/cli/serve 全网无 SessionEnd/PostToolUse 字样）——现行采集 100% 靠尾随 transcript 文件。卡片只在手动 DUB。会话结束无任何自动落卡。与指南 §1"没接通"清单一致。

### B7 · 新手困惑清单（走查实录，供轨乙引导文案取材）
1. 面板无字系宪法（器件法），但**零向导**：不知按钮为何物、不知如何接自己会话（指南已列，实感确认）。
2. CLI 全中文 vs README 全英文——外部用户语言断层（README"Honest limits"已自曝，维持在案）。
3. `replay` 报告把脱敏带相对时间渲染成 `1970-01-01T00:07:03` 纪元日期——功能无损，观感诡异（P3，蒸馏默认化的新副作用）。
4. README 测试数注入值 106 vs 实跑 116：`sync-readme --check` 自检**通过**（"一致（106）"）——脚本"定义数"口径已与运行时漂移 10 条，`prepublishOnly` 闸形同虚设（P3）。
5. 出片文件名嵌出片日期（`foley-dub-busy-2026-07-07.mp4`）且写进 sidecar 的 video/poster 路径——泄的是**导出动作**日期而非会话日期，观察级，请架构师定夺是否并入 TR-1 口径。

### B8 · 素材遗留请示
主检出 `stage/fixtures/captain.{curve,moments}.csv`（untracked，今日 12:58 落盘，13MB+56KB）疑为船长 G8 走查遗物。勘验未动分毫，请船长/架构师定处置（入库脱敏？删除？）。

---

## 三、事件面对照表（hooks 面核对 · 当日官方 reference，2026-07-07 实取）

来源：`code.claude.com/docs/en/hooks`（docs.claude.com 域当日被本机网络策略拦，经官方新域取得）。**事件总面 30+ 且持续变动**（手令判断确认）。我方六事件**今日全部存在**：

| 事件 | 存在 | 触发时机 | 关键载荷字段 | matcher | 版本门槛 |
|---|---|---|---|---|---|
| PostToolUse | ✓ | 工具调用成功后 | `tool_name`,`tool_input`,`tool_output`；可回改输出（`updatedToolOutput`） | 工具名（正则/精确，如 `Edit\|Write`、`mcp__.*`） | 无 |
| PostToolUseFailure | ✓ | 工具调用失败后 | `tool_name`,`tool_input`,`error` | 工具名同上 | 无 |
| Notification | ✓ | CC 发通知时 | `message`＋通用字段 | **`permission_prompt`** ✓（另有 `idle_prompt`/`agent_needs_input`/`agent_completed` 等） | `terminalSequence` 需 v2.1.141+ |
| SubagentStart | ✓ | 子代理起动 | `agent_type`＋通用字段 | agent 类型名 | stderr 通告样式 v2.1.199 起 |
| Stop | ✓ | Claude 每回合收笔 | 通用字段；可 block | 无 matcher，恒触发 | 无 |
| SessionEnd | ✓ | 会话终止 | **`reason`**（`clear`/`resume`/`logout`/`prompt_input_exit`/`bypass_permissions_disabled`/`other`） | 按 reason 值 | 无 |

**通用载荷**（各事件皆有）：`session_id`、`transcript_path`、`cwd`、`permission_mode`、`hook_event_name`；`prompt_id` 需 v2.1.196+；子代理语境另有 `agent_id`/`agent_type`。
**输入机制**：command hook＝stdin JSON＋退码语义（0 成功/2 阻断）；**另有 HTTP hook 形态**（事件 JSON POST 到指定端点）——对轨乙是新选项：钩子可直接 POST 给 serve，免中间落盘（是否采用归轨乙/架构师，勘验只报存在）。
**给轨乙的两条事实**（非裁决）：①SessionEnd 的 `reason` 含 `clear`——"清屏"也算会话终止，吐卡语义须裁"哪些 reason 落卡"；②Stop 是"每回合收笔"非"会话结束"，手令"勿用 Stop"判断与今日文档相符。
**旁系事件今日在册**：`SubagentStop`、`PermissionRequest`/`PermissionDenied`、`PreCompact`/`PostCompact` 等——若轨乙需要更细粒度，面上有货。

---

## 四、Tone.js 尽调（增补二·4）

`npm view tone`：**v15.1.22，最后发版 2026-07-04（勘验前三天）**——活跃维护，无停维护级硬伤。**备胎条款（原生 Web Audio＋前瞻调度器）不触发**，轨甲可按增补二兵器令径直采用。边界纪律照旧：Tone 只进音频渲染器内部，总线契约零 Tone 依赖。

---

## 五、勘验总结（给架构师的裁决面）

**地基总评**：六项 5 真 1 部分——引擎/校准/蒸馏/画面/出片确如指南所言极硬且可复跑；唯一口径偏差是"约百条"应为封版 38 条（现 116 条）。M2.6 四 P1 修复在运行时全部活着（候红队签章程序照走）。

**三轨靶区经实跑确认/修正**：
- **轨甲**：靶心分毫不差。残骸坐标已钉：`soundbridge.js`（整带 buildTrack）＋`main.js` live/replay 分支隔离。回放侧音频引擎（graph/core）与出片链路是**好资产**（RMS/LUFS/8.22× 实测），重构总线接线时勿殃及。Tone.js 放行。
- **轨乙**：SessionEnd 今日在档且带 reason matcher（`clear` 语义需裁）；hooks 现库使用为 0，从零接线无历史包袱；HTTP hook 形态可作直喂 serve 的备选。
- **轨丙**：手册四件在 main 已物理落地并经勘验运行时复核——**建议架构师核对轨丙卡是否改为"红队签章收尾＋新雷 B4"**，避免施工终端重做已完之事（脱敏契约首日交付照旧有效，轨乙等着它）。

**新雷两颗候分诊**：B4（records/床音与 deck 断线，P1 级候审，归属轨甲/丙待裁）；B2（CLI 参数面断线，P2）。P3 三件：1970 纪元观感、README 计数口径漂移、出片文件名日期。

---

## 六、遗留物与复跑手册

**入库物**（本分支 `track/recon`，仅 `audit/recon/**`）：本报告；`shots/01-live-boot.png`、`shots/02-live-after-15s.png`（live 两帧对照）、`shots/03-replay-busy.png`、`shots/console.log.txt`；`repro/recon.mjs`（live 静音＋回放声证）、`repro/probe2.mjs`（唱片在位声证）。

**未入库运行副产物**（gitignored/untracked，留轨甲施工参考，可随时删）：
- worktree `runs/`：`sweep-all-…`（144 组台账）、`replay-my.redacted-…`、`recon-film/`（71.7MB mp4＋poster＋meta）、`ear-machine-…`、`live-2026-07-07/`
- worktree `sound/records/*.mp3`×3（自 factory 缓存拷回，untracked，B4 旁证所用）
- scratchpad（会话隔离区，自灭）：我的会话蒸馏带两卷（raw 卷未离本机）、v0.1.0 封版 worktree

**复跑要点**：①金测试/扫参/耳/蒸馏均为一行命令（见各节）；②浏览器证据须本机有 chromium（脚本内写死 ms-playwright 缓存路径，换机自调）；③v0.1.0 复现需 `tapes/raw/` 五带（私件，仅主检出有）；④B4 复现：干净 worktree 起 serve → `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:4173/records/still-life.mp3` → 404，跑 `foley records` 后重试仍 404。

**流程自首**：勘验用 `pkill -f 'stage/serve.mjs'` 收摊试验进程——模式串按本 worktree 服务面写成，若当时场上有其他检出的 serve 在跑会被误伤。本次经查场上无他人（并发检查见开工记录），未造成实害；后续勘验应改按记录之 PID 逐个收摊。

---

**回传架构师**：本报告全文＋`track/recon` 分支（锚 main=`8c7a198`）。按手册 §0 派生纪律，**三轨在架构师对本报告作出裁决前不开工**。待裁三问：①轨丙卡是否改写（四件已落地）；②B4 归属；③B8 船长素材处置。

（勘验终端 · 2026-07-07）
