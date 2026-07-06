<!-- 原名：FOLEY_LAUNCH_KIT.md ｜ 船长桌面原件复制入仓（ARCHIVE-1），正文未改；原件删除权留船长 -->
# FOLEY 发布工具箱（架构师执笔 · 发布物料轮）

> 用法：本箱内容可直接取用；`【槽】`处待船长填（唱片艺术家名／曲名／发布日期／demo 页 URL）。
> 总纪律：**每一句公开的话必须在发布时刻为真**；素材诚实条款适用于一切演示物；不辩论、只感谢与修复。

---

## 0. 定位语（全渠道统一口径）

- 英文主标语：**Foley — a lo-fi tape instrument that plays your coding agents.**
- 中文主标语：**给你的 agent 配一位拟音师。**
- 一句话解释（电梯版）：你的 agent 一跑几分钟，你要么盯日志要么走开担心；Foley 是第三个选项——一台琥珀色磁带机，把会话实时演奏出来：针是张力、纸带画心电图、琥珀灯只在它等你时呼吸。隔着房间看一眼，你就知道今天是哪种日子。
- 三个诚实限定（主动说，别等人问）：目前适配 Claude Code（适配器架构，其余在路上）；导出功能 Chrome 系最佳；张力校准基于作者自己的会话库（n=1，开箱自动调音在路线图上）。

## 1. Show HN（主战场）

**标题（≤80 字符，二选一，船长定）**
- A：`Show HN: Foley – A lo-fi tape deck that plays your Claude Code sessions`
- B：`Show HN: Foley – Hear your coding agent work, on a 1970s tape machine`

**首评（发帖后立刻自己贴第一条评论，HN 惯例；以下为全文草稿）**

> Hi HN — I built a small instrument for a new kind of anxiety: my coding agent runs for minutes at a time, and I either stare at scrolling logs or walk away and worry.
>
> Foley is a third option. It's a local web app styled as a 1970s tape deck. It tails your Claude Code session files, distills them into event skeletons (verbs, timings, sizes — never your code or prompts), and runs them through a small physics engine: errors charge tension, fixes release it, repetition of the same failure is detected as a "stuck groove". The instruments are honest: the VU needle is a real spring-damper driven by the engine (the renderer adds no easing — every quiver is data), a strip-chart draws the session's cardiogram in ink, and an amber lamp breathes only when the agent is waiting for *you*.
>
> Sound: it's a turntable, not a composer. We spent eleven painful listening rounds trying to synthesize "warm lo-fi" and failed — the honest fix was admitting a tape machine's job is to *play* records and age them. So real music plays (the factory records are human-made, CC0, credited — 【槽：艺术家/来源一句】), and the session controls the *machine*: tension makes the tape older (hiss, wow, duller highs), a stuck loop makes the needle skip on the melody, and when the session ends the record slows to a stop. There's also a DUB button: the machine proposes highlight cuts as perforations on the paper, you tear along them, and it renders a 45s MP4 "splice reel" locally (WebCodecs, ~9× realtime).
>
> Privacy, because you should ask: everything is local. Raw logs are read once and distilled; transcripts are never stored or shown. Zero telemetry. The only network call it can ever make is an optional, explicit, hash-verified download of the factory records on first run — decline it and it plays room tone.
>
> Honest limits: Claude Code only for now (the adapter layer is thin; more agents planned). Export needs a Chromium browser. Tension constants were calibrated on my own 63 session tapes; yours may feel different — auto-tuning on your own library is on the roadmap.
>
> It's MIT. I'd genuinely love to know: does the needle tell you the truth about your sessions?

**发帖节奏**：美东周二至周四上午 8–10 点窗口；发帖后 3 小时内守评论区（回复弹药见 §5）。

## 2. V2EX（分享创造节点，中文）

**标题**：`Foley：给你的 coding agent 配一台会老化的 lo-fi 磁带机（本地、开源、npx 一条命令）`

**正文草稿**：

> agent 一跑就是几分钟，盯终端浪费自己，走开又心慌。我做了第三个选项：一台浏览器里的七十年代磁带机，把 Claude Code 会话实时"演奏"出来——VU 针是张力（引擎里真实的弹簧阻尼，渲染层不加任何缓动），走纸记录仪用牛血红墨水画会话的心电图，琥珀灯只在 agent 等你批准时呼吸。隔着房间瞟一眼就知道今天顺不顺。
>
> 声音这块走了大弯路：试了十一轮合成"温暖 lo-fi"全部失败，最后承认磁带机的本分是放唱片不是当乐队——现在是真音乐在放（出厂唱片人类制作、CC0、署名【槽】），而会话控制的是"机器"：紧张时磁带变旧变闷、卡死时唱针在旋律上跳针、收工时唱片降速滑停。还有一颗 DUB 键：机器在纸带上打齿孔提议高光段，你顺着撕下来，本地渲染出 45 秒的"接带"MP4（WebCodecs，约 9 倍实时）。
>
> 隐私说清楚：全本地，原始日志只读一次并蒸馏成事件骨架（动词/时长/体量，永不存代码与对话文本），零遥测；唯一可能的联网是首启明示征询的出厂唱片下载（哈希校验，可拒绝）。已知限制也说清楚：目前只适配 Claude Code；导出需 Chromium 系；张力常数按我自己的会话库标定，开箱自动调音在路线图上。
>
> `npx foley` 就能跑，MIT。demo 页（不装也能看一卷真实风暴的回放）：【槽：URL】。被喷和被建议都欢迎，特别想知道：那根针说的是不是真话。

## 3. 即刻（短、有画面）

> 给我的 coding agent 配了一位拟音师：一台会老化的 lo-fi 磁带机，agent 干活它放歌——顺利时岁月静好，报错堆积磁带就变旧发闷，卡死时唱针在旋律上跳针，收工那刻唱片缓缓滑停，房间安静下来。零上传全本地，npx 一条命令。它叫 Foley，因为拟音师 Jack Foley 一辈子没作过曲——他只是让画面里的世界发出它该有的声音。【配 12s hero 视频】

## 4. Reddit（r/ClaudeAI 主发；r/SideProject 次日）

**标题**：`I built a lo-fi tape deck that plays my Claude Code sessions (local, open source)`
**正文要点**（口语化重写自 §1，两段即止）：问题一句话＋GIF 前置＋隐私一句＋"needle honesty"一句＋npx 一条命令＋"calibrated on my own tapes, curious how yours feel"。

## 5. 评论区弹药库（预写诚实回应，禁辩论姿态）

| 预判攻击 | 回应要点 |
|---|---|
| "玩具/花哨 gimmick" | 同意它首先是件乐器；但呼唤态是真功能：琥珀灯=等批准、跳针=同一目标连败三次、静默=收工——这三件事让我离开屏幕也不焦虑。剩下的美，是免费的。 |
| "隐私？你在读我的会话" | 蒸馏架构一段（只读一次→事件骨架→原文永不落盘）；零遥测；唯一网络=明示唱片下载可拒绝；蒸馏器过了两轮对抗性红队，攻击脚本就在仓库的回归测试里，欢迎审计。 |
| "看终端不就行了" | 终端要求注视，Foley 供给余光与耳朵。核心是校准过的三种"值得回头"的信号，其余时间它替你安静地盯着。 |
| "又是 AI slop？" | 引擎是确定性的手写物理（同一磁带两次回放逐字节一致）；出厂唱片**人类制造**、署名、CC0（AI 生成目录只出现在淘碟指南里且明示标注）；这个工具本身是我和 Claude Code 用一套"施工令/判据/红队/复核庭"流程建的，全套档案在仓库 docs/ 里——有据可查。 |
| "Cursor/Codex 支持？" | 适配器层很薄（唯一认识日志格式的地方），Claude Code 先行，欢迎 PR/需求。 |
| "Safari？" | 观看没问题；导出音视频依赖 WebCodecs 音频编码器，Chromium 系最佳，页面会诚实降级。 |
| "n=1 校准" | 承认。判据与参数全部是版本化数据（verdict/params），开箱对你自己的库自动扫参在路线图上。 |

## 6. Hero 素材剪辑指导（交舞台轨实拍，素材诚实）

- **主片（12–18s，MP4 有声＋GIF 无声双版本）**，一镜到底的弧：熟睡的机器（暗场一粒待机灯）→ agent 开工、针醒、墨线起步 → 风暴段（针压红区、带轴可见 wow、磁带声变旧）→ 一记跳针 → 和弦＋绿宝石一闪 → DONE：唱片滑停、针落、纸停、静默两拍。真带实录（storm 或当日带），标注卷号入 meta。
- **次片（8s）**：DUB 仪式——按键→齿孔浮现→顺孔一撕→纸条落在胡桃木上。
- 静帧：deck-storm 为海报；loupe 微距为"细节图"。
- 规格：1080p 源；GIF 遵静态颗粒法、≤8s、<15MB；MP4 保动态颗粒 ~12Mbps。README hero 位换新主片 GIF。

## 7. 发布日执行清单（Runbook）

**D-1（前一日）**：公开镜像推送（干净历史）→ `npm publish` 演练至 dry-run 全绿 → 干净机器 `npx foley` 冒烟（含拒绝下载唱片的房间层路径）→ demo 页上线并全链点击 → README 内每个链接与数字人工过一遍 → GATE.md 全绿截图存档。
**D-0 时序**：上午（美东）拆闸 publish → 冒烟复验 → Show HN 发帖＋首评 → 三小时守评（我与船长同守，回应先过 §5 口径）→ 傍晚（北京）V2EX＋即刻 → 记录首日指标（star/克隆/npx 次数/评论主题聚类）。
**D+1**：Reddit 双发；根据评论主题给 README 打第一轮补丁（真话优先）。
**D+3~7**：过程故事长文（"我们如何用一套施工令、红队和复核庭，让几个 AI 会话造出这台机器"——档案都在 docs/，这篇是第二波传播）。
**值守纪律**：热修由发行轨待命，P1 当日修；一切负评先谢后修，不辩论；每个真问题进 issue 并回链。

（工具箱完。填完【槽】即可上膛。）
