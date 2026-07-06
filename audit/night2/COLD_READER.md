# COLD_READER — NIGHT-2 §0 冷读者庭

> 身份设定：发布日最刻薄的 HN 读者。规则：只读 README.md ＋ 亲手体验探针页十分钟，未读仓内任何内部文档（本报告写作时点，全仓其余文档未开封）。
> 环境：macOS / node v26.0.0 / 快照锚 `ba5e777` / 2026-07-06 00:54–01:15 +0800。
> 体验者物理限制如实申报：自动化 headless 浏览器无声卡，**声音层只能验证其行为与参数，不能过耳**；过耳判断留给声音相评审。

---

## 一、README 逐句核对表（此刻哪些是真的）

| # | README 主张 | 现状 | 证据 |
|---|---|---|---|
| 1 | `npx foley`（Quickstart 第一行） | **✗ 三重破产** | ① npm registry E404，包未发布（`npm view foley` 实测）；② `package.json` 自曝 `"private": true`、version `0.0.0`；③ 仓内运行时 bin 目标 `cli/index.ts` **无 shebang**，shell 把 TS 当 bash 解释，满屏 `import: command not found`（实测复现） |
| 2 | "Foley finds your most recent Claude Code session and starts playing it" | **✗ 未实现** | 裸跑 `node cli/index.ts` 只打印用法并退出（exit 0）；没有任何"自动找最近会话并播放"的默认行为 |
| 3 | "No config. No account. No network." | **半真** | 无账号真；探针页自称零网络（见 §二网络监听实测）；但"No config"掩盖了真实流程是四步手工管线：`scan` → `mkdir tapes`（自己猜）→ `distill` → `probe` → 手动开 html |
| 4 | `npx foley replay <session>` | **✗ 语义失实** | `replay` 吃的是**蒸馏带**不是 session，产出 `REPORT.md + curve.csv + moments.csv`（分析报告），不是"播放"。README 读者期待的是那台机器动起来 |
| 5 | engines `node >=20`（package.json）配 TS 直跑 | **✗ 自相矛盾** | bin/scripts 都是裸 `.ts`，node 20/21 无 type stripping 跑不动；本机 v26 侥幸能跑。README 通篇未提 node 版本 |
| 6 | "reads your local session logs and distills them into event skeletons…never stored" | 表面可信 | `scan` 确实读 `~/.claude/projects`（81 卷），蒸馏带落本地 tapes/；纵深查证移交红队A' |
| 7 | "A `--redact` mode produces a minimized shareable form" | **真，但藏着** | 顶层 help 无一字提及；只有裸跑 `distill` 才吐出 `[--redact] 产全脱敏分享带`。另：flag 位置放错（`replay --redact <带>`）→ 把 `--redact` 当文件名，**裸 ENOENT 堆栈崩溃** |
| 8 | 三张仪表照片 | ✓ 存在 | 但单张 2.7MB、三张 ~8MB 直接压进仓库 |
| 9 | 感官白皮书链接 | ✓ 存在 | `docs/canon/TAPE0_WHITEPAPER_SENSES_v1.md` 在位 |
| 10 | "MIT. The tape is yours." | **✗ 无 LICENSE 文件** | 根目录无 LICENSE*；仅 package.json 一句 `"license": "MIT"`。HN 律师团 5 分钟内到场 |
| 11 | "Engine sealed (`v0.1.0`)" | **✗ 对不上** | package.json version = `0.0.0`。"sealed" 与 0.0.0 各说各话 |
| 12 | "38 golden tests" | **✗ 过时**（利好方向） | fresh clone `npm test` 实测：见 §四 |
| 13 | "Three sounds today: pluck / chord / needle-skip" | **过时**（利好方向） | probe 生成器自报前景家族：拨弦/闷弦/纸页/铃/卡座/和弦/跳针/ASK/DONE——远不止三种。README 在替产品谦虚，但数字对不上就是对不上 |
| 14 | CLI 与 README 语言断层 | **✗ 国际读者劝退** | 英文 README 引来的读者，`--help` 起全中文（含"蒸馏/收束点/卡碟"术语）。要么双语 help，要么 README 说明这是双语项目 |
| 15 | Status 段 "🚧 Live mode wiring" | 与 help 矛盾感 | help 里 `live` 已是正式命令（"尾随生长中的原始 JSONL，20Hz 广播"）；哪个是真话？ |
| 16 | scan 教的下一步命令 | **✗ 新 checkout 直接崩** | scan 尾注亲口教 `distill <原始> tapes/<名>.tape.jsonl`，但 `tapes/` 不存在且 distill 不建目录 → **裸 ENOENT 堆栈**。用户第一次照说明书操作就挨打 |
| 17 | 克隆后第一件事就弄脏仓库 | **✗** | `npm ci` 会给 bin 目标 `cli/index.ts` 自动 chmod +x（因为它被声明为 bin 却没带执行位入库）→ fresh clone 装完依赖 `git status` 即脏（mode 100644→100755）。洁癖读者的第一印象分没了 |

**核对表总评**：产品本体（引擎、蒸馏、探针页）是真的、且比 README 说的更多；**但 Quickstart 的每一行都是假的**。这是最危险的一种 README——里子是真的，门脸是空头支票。发布日撞上的第一批用户全部死在第 14 行（`npx foley`）之前。

---

## 二、十分钟体验实录（时序）

管线：真实本机风暴会话（555 事件/23 败/10 episode）→ `distill` → `probe` → Chromium 实载。网络监听全程在场：**探针页运行期间发出的非 file:// 请求数 = 0**（"Nothing leaves your machine" 在探针页上属实——本次实测范围内）。

- **t≈-3min（管线阶段）** 困惑：README 没有任何"从源码跑"的路径；克隆者只能自己翻 package.json scripts 猜。失望：scan 教的命令 ENOENT 裸崩（表 #16）。
- **t=0s** 载入 4.5MB 自包含 probe.html（`ride-000-load.png`）：**惊喜**——页面头部是一排货真价实的指纹（tape/engine `ba5e777`/params/verdict/sound/assets/build 七枚哈希），工程诚意扑面；**困惑**——这不是 README 照片里那台金色机器，是一张黑底中文工程仪表（针盘 T 0.00＋张力曲线＋"隔离板（EAR-7 凶手排查）"复选框组）。英文读者到此一个字都看不懂。
- **t=3.5s** 找到 `▶ 播放` 点下（用户手势解锁音频）——控件语义清楚，无迷路。
- **t=58s** **未捕获 PAGEERROR：`coreDegreeHz is not defined`**——播放途中 JS 引用错误原样上抛（`coldread-console.log` 在案）。对用户静默，但控制台开着的 HN 读者会当场截图发帖。
- **t=122s**（`ride-120s.png`）针活了：T 0.06、绿区亮起、床分层电平实时跳动（L1 0.066/L2 0.032/S3 0.000/磨损 0.0050）；**失望**——进度 `122s / 11753s`：这卷带全长 **3.3 小时**，默认 1×，速度滑杆躲在角落。冷用户不会想到要拖它，会以为"这就是全部了"然后关页。
- **t≈6min** `?tuner=1` 调音抽屉（`ride-tuner.png`）：**惊喜**——一整面 36 杆参数混音台（bed/foreground/call 三族），带**实时参数哈希对表**（`efbb571d (=出厂)`）和"复制 JSON"。工程款诚意最足的一屏。小瑕疵：`foreground.habituatio…` 三条标签截断无提示。标着 `(dev)`，普通用户不会撞见。
- **t≈6.9min** 第二趟播放同点复发 `coreDegreeHz is not defined`（两趟各一次，均在播放 ~55–58s 处）→ **确定性炸点**，非偶发。
- **t=10min** 终帧 `ride-final.png`；console/pageerror 全程：`audit/night2/shots/coldread-console.log`
- **全程网络监听：非 file:// 请求 = 0**（探针页"零网络"主张本次实测成立）。

**附录·证据**：`audit/night2/shots/`（载入/播放/曲线四帧/调音抽屉/deck 尸检各 png ＋ coldread-console.log）；fresh-clone 测试全量日志见会话 scratchpad `npmtest-fresh.log`（68/63/5/exit1）。

**平行支线：双击那台 README 主视觉（stage/index.html，`deck-doubleclick.png`）**
- 香槟金面板、VU 表、ASK 灯窗、计数器暗缝——README 照片里的机器一比一渲染出来了，**静止如尸**：ES module 被 `file://` CORS 政策拦死（仅控制台可见），页面无任何提示。
- 冷读者结论：**产品的"脸"（deck）连一条能开机的路都没写在 README 里**（需要起本地服务，通篇未提）；产品能跑的部分（probe）又不是 README 卖的那张脸。

## 三、预写三条最可能的 HN 恶评（附我方最强诚实回应素材）

**恶评 1：「`npx foley` 都跑不了，README 第一行就是假的。又一个 vaporware。」**
> 回应素材：这条无法反驳，只能抢在发布前修（发布包/shebang/engines 三件套 + README 加"从源码跑"三行）。若已修，回应："快照 <hash> 起 `npx foley@0.1.0` 可复现本 README 每一条主张，欢迎逐句打脸。" ——诚实回应的前提是先把它变成真的。

**恶评 2：「隐私谁信？读我全部 Claude 会话的东西还想让我 `npx` 一把梭？」**
> 回应素材：三件实证——① 全程零网络（可自行断网复跑，探针页 file:// 自包含）；② 蒸馏只留事件骨架（动词/时长/尺寸/哈希目标），工具输入输出与对话文本不落带，`.tape.jsonl` 是明文 JSONL，欢迎肉眼查验每一行；③ `--redact` 再降一档出可分享带。弱点如实认：那句 "adversarially red-teamed" 目前只是自家红队（本审计即其一），无第三方背书。

**恶评 3：「所以这到底比 `tail -f` 加 htop 强在哪？装什么复古文艺。」**
> 回应素材：不跟它吵功能，摆用法差：htop 告诉你 CPU 在忙，foley 告诉你**该不该起身**——琥珀灯只在 agent 等你批准时呼吸（不喊狼来了），绿宝石只说"settled"。它是余光仪器，不是又一个要你盯的面板。最诚实的一句：如果你从不离开终端，你确实不需要它。

## 四、fresh clone `npm test` 实测

**68 tests ｜ 63 pass ｜ 5 fail ｜ exit 1**（duration 11.4s）
- 失败全因缺私有磁带：`tapes/storm.tape.jsonl`、`tapes/silence.tape.jsonl` 等 ENOENT 裸栈（金测试依赖不在仓内的 fixtures，克隆者必见红）。
- README 写 "38 golden tests"——真实数字 68，README 落后近一倍（方向利好，但发布日会被当成"连自己有几个测试都不知道"）。
- 建议素材：要么 fixtures 附最小公开子集，要么测试对缺带 `skip` 并打印一行人话（"private calibration tapes not present; N skipped"）。

## 五、一句话转述种子

一个没听过本项目的人会怎么向朋友转述——

> "给你的 AI 编码 agent 配了台老式磁带机：它干活时你在房间另一头瞟一眼指针和灯，就知道今天是顺风、起风暴，还是它在等你。"

（英文候选："A little tape deck that plays your coding agent's session — glance at the needle from across the room and you know if it needs you."）

---

*本报告与审计正文同级，直供发布物料轮。写毕后审计会话方才开封全仓。*
