# NIGHT-3 右耳 · 附录（自足证据册）

## A-1 复现命令全集（逐发现）

前置：仓根检出 main `6766d93`；`ln -s <主仓>/node_modules node_modules`（audit/tools 同法）；node ≥23.6（本席 v26.0.0）。

| 发现 | 复现 |
|---|---|
| D-1 npx 死 | `npm view foley version` → E404 |
| 基线 | `npm test`（本机 174/174）＋ `npm run typecheck`（净） |
| P0-1 活着 | `node audit/p0-1-wiring/repro/latecomer.mjs` → 三案 PASS |
| D-8 假红 | `node audit/p0-2-transport/repro/transport.mjs` → `B_pause.wired:false` 致 PASS:false；同时 `node --test golden/live-sound.test.ts` 全绿＝行为面正确。病根：repro spy 计数 `pauseCalls` 钩 `sound.pause()` 旧名，现行链 `bridge.pause→E.paused`（声批刀二）。定位：`transport.mjs:85` |
| 迟到者 147ms | 起 serve（活跃会话下）→开页→页内埋 `pointerdown` 捕获计时＋100ms 轮询 `__stage.sound.rms()>0.02`→真鼠标点击。数值：toSound 147ms / toDrop 147ms / 稳态 RMS 0.107 |
| D-2 素面首帧 | 新开页勿手势。DOM 证：`#room.pre-gesture`＋`#machine` filter `brightness(0.66) saturate(0.92)`；手势后 filter 只剩 drop-shadow（对照）。纸 canvas 中心 getImageData=rgb(65,50,32)（暗褐非黑——截图黑块系环境失真） |
| D-3 一击三事 | 素面页点**页面下部空白**（本席用截图系 (400,415-420)，视口≈92% 高度）→ towerY 变负＋POST 起；对照：点顶部 (640,60) → towerY 恒 0。两页重现 |
| D-4 DUB | 运行态（live 材料充足，`#dub-key.dub-ready`）→真鼠标点 key → class 加 `latched` → ~13s 后 latched 消失、`__stage.dub.state` 恒 'idle'、零产物（runs/dubs 无新目录）。摇头动画未捕获（一次性短动画） |
| D-5 尸挂 rec-live | 杀 serve 后读 `document.body.className` → 仍含 `rec-live`；`room.dataset.signal='lost'` 同帧并存。替身死 3 分钟版：停喂后 body 仍 rec-live、REC 呼吸层 opacity>0 |
| D-6 回程 | 下摇后（towerY<0）按 Escape → towerY 不变【实证】；滚轮回程在本环境 computer 工具超时（存疑不定罪，候真手）。towerY 漂移案：-457.72（点击后 2s 读）→ -632.45（40 分钟后）——两解释未决，建议值班测试：开页不动 30 分钟逐分钟采 towerY |
| D-7 先开机后开工 | `FOLEY_PROJECTS=<空目录> node cli/index.ts <port> --no-open` → 开页（SIGNAL LOST 现身）→ 向目录铺入生长中的会话 jsonl → 页面不自愈；刷新即愈 |
| 死相三式 | ①停喂（替身法见 A-3）→RMS 0.097→0.007、REC 照红；②页内 `__stage.live.es.close()` → 2.5s 内 `live.status='lost'`、`#pilot` --lit 1→0；③杀 serve PID → `data-signal='lost'`＋SIGNAL LOST 丝印可见＋床 RMS 0.0077 不断气 |
| 六向量 | `node cli/index.ts distill <自会话jsonl> <out>` → 对 out 逐向量 grep（2026-ISO/内建外工具名/路径/邮箱形/密钥形/sourceHash）。本席结果：全过；tool 谱 `{"":2, Bash:1, Write:1, t84aa780b:2}` |
| CPU | `ps -o %cpu -p <servePID>` ×15（2s 间隔）→ 均值 0.4% 峰值 0.6%；renderer（Browser pane 进程）×10 → 均值 3.2% 峰值 3.5%（两 tab 合计：一活跃 live＋一失联静置）。口径：ps 瞬时采样，候 Activity Monitor |
| D-14 doctor | `FOLEY_PROJECTS=<假房> node cli/index.ts doctor` → live 判定/唱片 3/3/系统音量 6% 全对；【serve】只探 4173 |

## A-2 关键数值原表

- 迟到者：手势→首声 147ms（首采样 RMS 0.0325）；→落针 147ms；needleDrops 恰 1（重手势不再响——闩锁验证）。
- 死表（victim4，1s 采样节选）：活跃段 RMS 0.0973；停喂后稳定 0.0071–0.0079（≈马达低哼独存）；杀 serve 后 0.0077（床不死）。
- POST 后翻牌：`.fc-top b` 逐格拼接＝"SATURATION  "（12 格右补空）；魔眼 `--act` 稳态 0.225（低张力自洽——审计会话安静段）。
- 蒸馏 stats（37 行快照）：parseCoverage 1.0、badLines 0、行型谱 `{ai-title:3, custom-title:3, queue-operation:4, user:6, attachment:5, last-prompt:3, assistant:12, mode:1}`、assistant 块谱 `{thinking:6, text:2, tool_use:4}`——**每 content-block 一行**，粒度结论的依据。
- serve 起播终端输出恰两行（「♪ TAPE·ZERO · 监听中 / stage @ …」）。

## A-3 方法与验具勘误（给下一个机器审计员）

1. **替身喂料法**：真会话 jsonl 副本→前 N 行做「史」（时间戳回拨 90s 内均布）→余行逐行 `JSON.parse→timestamp=now→append`（陈年戳会被判歇场——首轮替身房因此全程待机，实为正确行为而非 bug）。喂料窗口要长（≥5 min），或改「手动挤牙膏」（本席 stamp-line.mjs：单行单命令，零竞速）。
2. **验具四误（全部当场撞上）**：①选择器视觉是 canvas 换帧，`backgroundPosition` 恒 0% 是无关样式——读错属性差点冤枉快拧全死；②翻牌文字在 `.fc-top b` 逐格，读父容器 textContent 得全空格——差点立案「揭幕缺席」；③`grep "SIGNAL"` 漏 CSS `content:"Signal Lost"`（大小写＋伪元素双坑）——文本检索必 `-i` 且记得查 CSS content；④伪元素文字不进 DOM 文本探针——「SIGNAL LOST 可见性」要读 `room.dataset.signal` 真值源，不能扫 textContent。
3. **本环境已知坑复用**：canvas 层截图失真（黑块假象）——像素结论一律 getImageData；合成 click 不发 pointerdown——手势必走真输入管线。
4. **victim4「复醒失败」错案全程**（保留以儆）：喂新行机器不醒→疑 wake bug→查 SSE（活，recvAgoMs 3ms）→查包（S=0.008 静场）→查源行（恰是 thinking/title 行）→**机器无罪，测试设计有罪**。教训：先验「喂进去的是什么」，再验「机器怎么反应」。

## A-4 外部来源（手令 §一.2 引用义务）

- Claude FM 实况：[explainx.ai — Claude Code /radio & Claude FM Explained (2026)](https://explainx.ai/blog/claude-code-radio-claude-fm-lofi-stream-guide-2026)；[korben.info — Claude FM, the lofi radio hidden inside Claude Code](https://korben.info/en/claude-fm-lofi-radio-hidden-claude-code.html)；[ucstrategies.com — Anthropic Quietly Launched a Lofi Radio Station Inside Claude Code](https://ucstrategies.com/news/anthropic-quietly-launched-a-lofi-radio-station-inside-claude-code-the-music-question-is-more-interesting-than-the-feature/)；[aimusicpreneur.com — Claude FM Explained](https://www.aimusicpreneur.com/ai-music-news/anthropic-claude-fm-explained/)。要点：官方 24/7 lo-fi YouTube 流、2026-05-09 起播、`/radio` 命令、人类音乐人策展、彩蛋式发布。
- 竞品（声音层监听 agent）：[bennycheung.github.io — Hear Your AI Agents Work in Claude Code](https://bennycheung.github.io/hear-your-ai-agents-work)（hooks＋ElevenLabs 语音通知、多 agent 多嗓音）；观测性大盘（非声音）：[augmentcode.com — AI Agent Monitoring 2026](https://www.augmentcode.com/guides/ai-agent-monitoring)、[braintrust.dev — AI observability tools 2026](https://www.braintrust.dev/articles/best-ai-observability-tools-2026)。
- 检索时间：2026-07-15 夜；两发检索，未及 lofi.cafe/poolsuite 级审美产品对照（时间分配复盘已认）。

## A-5 收摊证据

- 收摊后 `lsof -iTCP:4250-4299 -sTCP:LISTEN` → 空（exit 1）。
- 正房 `lsof -iTCP:4181` → PID 33398 完好（全程只读观察）。
- PID 全册见主报告 §6.2；scratchpad 假母带房（fake-projects*/、替身 jsonl、蒸馏产物）留存于会话 scratchpad 供架构师抽验，不入仓。

## A-6 观感证据说明

截图证据（素面首帧×3 房、通电中段暖光帧、SIGNAL LOST 死相帧、带库黑视界帧、card.png）存于本会话记录；本席按诚实界限不以截图单独定观感罪——每处观感主张均在 A-1 附 DOM/像素级复现命令，架构师可用 `stage/tools/verify/still.mjs` 族在任意机器复截。card.png 真身路径（只读）：`~/.foley/cards/<uuid>/card.png`。

（右耳附录完 · 2026-07-15）
