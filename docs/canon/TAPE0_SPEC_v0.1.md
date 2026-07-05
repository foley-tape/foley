# TAPE-0 施工规范 v0.1

> **【现行值声明】**（M1.8-F 追加）本文 §6 各数值与 wow 定义已被 M1.5–M1.8 迭代取代；现行唯一事实源 = `params.json`（参数）与 `verdict.json`（判据）。本文保留为架构原典。
> **【优先级正典】**（M1.8-F 追加）安全硬禁 > 协议冻结 > 判据 > 施工令实现细则 > 库偏好。
> **【范围修订】**（M1.8-F 追加）`cli live` 与实时舞台自 v0 范围移出，归 v1（v0 = replay 全链＋回放探针）。审计发现 6（live 未实现桩）就此结案。

> 项目代号 TAPE-0（占位，命名轮未开）。本文档是唯一事实源。
> 分工：架构与裁决权在人类侧顾问（下称"架构师"），施工权在 Claude Code（下称"施工方"），验收权在项目所有者（下称"船长"）。
> 施工方对本规范的任何偏离，必须记录在汇报的「现实修正」一节，不得静默改动。

---

## 0. 冻结决议（本轮生效）

1. **采集默认值**：JSONL 尾随为默认路径（只读、零配置）。hooks 精确模式为未来 opt-in，**v0 禁止写入或修改用户任何配置文件（含 `~/.claude/settings.json`）**。
2. **范围梯**：v0 = 无头引擎＋一根针＋三个音（本规范的施工范围）→ v1 = 直播舞台＋预告片导出 → v1.1 = 多轨与回放拖动 → v2 = 托管分享页。**越级施工是缺陷，不是惊喜。**
3. **标准带**：由施工方按 §9 规程扫描提名，船长圈选三卷。校准数据不入 git。
4. 开源策略（MIT 全开、总线以下永远开源）已裁决，v0 阶段无动作项。

---

## 1. 北极星（供施工方理解意图，30 秒读完）

把一场 coding agent 会话翻译成一台"仪器"的实时状态：**背景态可被习惯化，天气态缓慢漂移，呼唤态必达**。核心是叙事引擎——把杂乱日志收束成极简状态词汇，算出一条诚实的张力曲线 T。
**诚实条款（宪法级）**：引擎只计算证据；渲染层可以夸张振幅，**永不捏造方向**。v0 的唯一目标：把 T 的手感调对。美一个像素都不做。

---

## 2. 施工范围与禁令

**v0 交付物**：
- `protocol/`：冻结的消息 schema（§7）
- `engine/`：纯函数叙事引擎（§6），同构（Node + 浏览器均可运行），零运行时依赖
- `adapters/claude-jsonl/`：全系统唯一认识 Claude Code 日志格式的地方（§5）
- `cli/`：`scan` / `replay` / `live` / `probe` 四个命令（§8、§9）
- `stage-debug/`：素面探针页——一根针、一条 T 曲线、一个时刻流、三个音（§8）
- 汇报产物：`runs/<timestamp>/REPORT.md`（§11）

**v0 禁令（发现即回退）**：任何美学样式；三个音之外的任何声音；hooks 写入器；多 agent UI；导出/分享功能；遥测或任何网络请求；触碰用户配置文件。

---

## 3. 仓库骨架与技术约束

```
tape0/
  protocol/     # TS 类型 + schema 文档，冻结后只增不改
  engine/       # 纯 TS，零运行时依赖，不 import Node API，时钟注入
  adapters/
    claude-jsonl/
  cli/
  stage-debug/  # 原生 HTML/JS/Canvas；仅此目录允许引入 Tone.js
  tapes/        # 标准带，gitignore
  runs/         # 汇报产物，gitignore
  golden/       # 手工合成的微型事件夹具 + 快照
```

- TypeScript strict；Node ≥ 20；包管理器自选。
- **engine 确定性**：禁止 `Date.now()`、禁止随机数；时钟与事件一律注入。同一磁带两次回放 → 输出逐字节一致。
- 依赖纪律：engine 零依赖；adapter 允许一个文件尾随库（或自写 fs.watch）；stage-debug 允许 Tone.js；全仓禁网络。
- 隐私：`tapes/`、`runs/` 永不入库；README 首行注明"纯本地、零遥测"。

---

## 4. 事件词汇表（元动作）

原则：**仪器的诚实来自选定变量，信息的品味在于扔。** 六个动词 × 两个结果 × 一个幅度，外加标点。日志中的其余一切，故意丢弃。

| 动词 | 源工具（假设，M0 对照现实验证） | Foley 全谱（v1 用） | v0 发声 |
|---|---|---|---|
| READ | Read / Grep / Glob / WebFetch / WebSearch | 翻页 | — |
| WRITE | Edit / Write / MultiEdit / NotebookEdit | 铅笔沙沙＋拨弦音符 | ✅ 拨弦 |
| RUN | Bash | 打字机；完成时回车铃 | — |
| SAVE | Bash 命令匹配 `git commit` | 卡座按键咔哒 | — |
| ASK | 权限/输入等待（见 §5 启发式） | 琥珀半终止动机 | — |
| SPAWN | Task（子 agent） | 新音轨淡入 | — |
| OTHER | 一切未知工具（兜底，禁 crash，计数上报） | — | — |

- **结果** `outcome ∈ {OK, FAIL, NA}`：由 tool_result 的错误标记 / 退出码判定。
- **幅度** `m = min(1, ln(1+x) / ln(1+X_cap))`（对数归一，防大事件淹死小事件）：WRITE 取 diff 行数（cap 500）；RUN 取时长秒（cap 120）；READ 取内容 KB（cap 100）；其余默认 m = 0.3。
- **语义 tag**（挂在 RUN 上，不进核心词汇）：命令匹配 `test|jest|vitest|pytest|cargo test|go test` → `test`；匹配 `build|tsc|webpack|vite build` → `build`。
- **标点**：`SESSION_START` / `DONE`（会话终结）/ 特殊时刻 `STUCK_LOOP`、`RESOLVE`（由引擎判定，§6）。
- **歌词通道**：assistant 的文本独白 → `LyricEvent` 低优先通道，只供未来字幕，**不驱动任何仪器**。

---

## 5. 适配器规范（claude-jsonl）

- 输入源：`~/.claude/projects/**/*.jsonl`。live 模式尾随最近活跃文件；replay 模式读取指定文件。
- **M0 首要任务是"格式考古"**：以下映射是假设，必须对照三卷真实磁带验证并在汇报中给出 as-built 对照表——
  - `type:assistant` 消息里的 `tool_use`（name/input）→ 动词与幅度输入；
  - 对应 `tool_result` 的错误标记（`is_error` 或等价物）→ outcome；`tool_use` 与 `tool_result` 以 id 配对，配对时差 → RUN 时长。
- **ASK 启发式（尾随模式已知局限）**：某 `tool_use` 发出后 >15s 无配对结果、且文件无新写入 → 推定 `ASK`；结果到达即发 `ASK_CLEARED`。误报可接受，v0 校准不依赖 ASK；精确 ASK 属未来 hooks 模式。
- **DONE 启发式**：出现会话终结记录，或文件静默 >10min 且末条为 assistant 文本。
- 解析失败的行：跳过、计数、上报，禁 crash。

---

## 6. 叙事引擎数学

### 6.1 应力与张力
- 内部应力 `S ≥ 0` 无上界；显示张力 `T = 1 − e^(−S/S₀)`，`S₀ = 1.0`。
- **充能**（每次 FAIL）：`S += w[verb] × m × rep`。
- **签名与重复系数**：`sig = hash(verb + tool + normalize(错误首行))`；10 分钟滑窗内同签名第 k+1 次出现 → `rep = min(1.5^k, 4)`。**同签名第 3 次出现（k≥2）→ 发射 `STUCK_LOOP` 时刻**（三个不同的小错是探索，三个相同的错是踩死同一把耙子——这个探测器同时就是卡碟触发器）。
- **泄能用乘法**（如释重负与心头石头成正比）：带 `test` tag 的 RUN 成功且当时 `S > 0.3` → `S ×= 0.6` 并发射 `RESOLVE`；SAVE 成功 → `S ×= 0.5`。
- **时间衰减**：`dS/dt = −S/τ`；活跃期 `τ = 60s`；事件断流 >60s 后 `τ = 180s`（时间不治愈，工作才治愈）；未决 RUN 超 30s 起以 `0.02×m /min` 滴灌微涨（它是不是挂了？）。

### 6.2 天气档（供离散订阅者）
- 上行阈值：CLEAR→OVERCAST 0.25 / →RAIN 0.50 / →STORM 0.75。
- 施密特迟滞：下行需跌破 `阈值 − 0.10`（STORM 出口特殊：跌破 0.60 才出）。禁边界抖动。

### 6.3 伴随量
- 活跃度 `A = 1 − e^(−rate/6)`，rate = 事件数/分钟（EMA）。
- `wow`（不确定度）= 最近 12 个事件 FAIL 指示的 EMA，再过 30s 时间常数平滑。
- `phase ∈ {IDLE, WORKING, WAITING, DONE}`：无会话或静默>120s → IDLE；有未决 ASK → WAITING。

### 6.4 两级滤波（语义串联物理）
- 语义滤波 = 上述 RC 放电（分钟级，管"心情"）。
- 物理滤波 = 弹簧-阻尼（亚秒级，管"身体"）：**针不直接吃 T，吃 T 经弹簧的输出 `needle`**。上行段欠阻尼 `ζ=0.6, ωn=33 rad/s`（自然给出 ~9% 过冲、~120ms 击发）；下行段过阻尼 `ζ=1.0, ωn=8 rad/s`（慢回稳）。快攻慢放，真实表针机械同款。
- 弹簧在引擎内计算并随 StatePacket 广播——所有渲染器共享同一套弹道，同源同钟。

### 6.5 参数唯一事实源
全部可调参数集中于 `params.json`（上述所有数值为起手值）；引擎输出携带 `paramsHash`。调参即回放：改参数 → replay 标准带 → 对比曲线。

---

## 7. 协议 schema v1（冻结，只增不改）

```ts
// protocol v1 — 字段名即十年后的地基。改动需架构师签核，且只许新增。
type Verb = 'READ'|'WRITE'|'RUN'|'SAVE'|'ASK'|'SPAWN'|'OTHER';
type Outcome = 'OK'|'FAIL'|'NA';
type Phase = 'IDLE'|'WORKING'|'WAITING'|'DONE';
type Weather = 'CLEAR'|'OVERCAST'|'RAIN'|'STORM';

interface MomentEvent {
  kind: 'moment'; t: number; seq: number; agent: string;
  verb: Verb; outcome: Outcome; m: number; tags: string[];
  special?: 'SESSION_START'|'DONE'|'STUCK_LOOP'|'RESOLVE'|'ASK_CLEARED';
  sig?: string; k?: number;
}
interface StatePacket {
  kind: 'state'; t: number; agent: string;
  S: number; T: number; A: number; wow: number; needle: number;
  phase: Phase; weather: Weather; pendingAsk: boolean;
}
interface LyricEvent { kind: 'lyric'; t: number; agent: string; text: string; }
```

总线规则：StatePacket 以 20Hz 连续广播；MomentEvent 可被渲染层做节拍量化，**唯 `ASK` 动词与 `DONE`/`ASK_CLEARED` 走直通道不排队**（守时优先于乐感）。渲染器只读、只做字段→参数映射、互不相识；单 agent 时代 `agent = "main"`，字段留位即是多轨的地基。

---

## 8. v0 探针（丑而真）

- `cli replay <tape.jsonl> --out runs/<ts>/`：离线跑带 → 产出 REPORT.md ＋ `curve.csv`（t,S,T,A,wow,needle,phase,weather）＋ `moments.csv`。
- `cli live`：尾随最近会话，向本地 WebSocket 广播协议消息。
- `cli probe`：起本地服务并打开 `stage-debug`——素面页面：一根 Canvas 针（吃 needle）、T 实时折线、时刻流文字滚动、**三个音**（WRITE-OK=拨弦，RESOLVE=和弦解决，STUCK_LOOP=卡碟跳针；Tone.js 简易合成即可）。浏览器音频政策要求一次点击才可出声：页面放一个纯文字 START 按钮（未来它会变成电源钮，现在不许美化）。

---

## 9. 标准带甄选规程（钉一执行细则）

施工方用 M0 适配器扫描 `~/.claude/projects` 全部 JSONL，按下表各提名 **3 卷候选**，产出体检表（时长/事件数/FAIL 数/失败率/独立签名数/最大同签名重复/是否含 SAVE/RESOLVE），交船长圈选各 1 卷，复制入 `tapes/` 并重命名 `smooth.jsonl` / `hell.jsonl` / `loop.jsonl`。

| 磁带 | 数字特征 |
|---|---|
| 顺风带 smooth | 时长 10–40min；事件 ≥40；失败率 <5%；含 ≥1 次 SAVE-OK 或 test-OK；最大同签名重复 ≤1 |
| 地狱带 hell | FAIL ≥8 或失败率 ≥25%；独立签名 ≥3；后段出现 RESOLVE 或 SAVE（张力弧完整：有挣扎有救赎） |
| 死循环带 loop | 存在同签名 10 分钟窗内出现 ≥4 次（含未解决收场者优先） |

注意：磁带可能含密钥等敏感内容——只在本地使用，永不入库、永不外传。

---

## 10. 里程碑与金测试

- **M0 格式考古**：适配器把三卷带解析为事件流；交 PARSE_REPORT（解析覆盖率、as-built 字段对照表、未知工具清单、异常行计数）。金测试：未知工具→OTHER 不 crash。
- **M1 引擎＋回放**：金测试全绿后对三卷带各出一份 REPORT：
  1. 同签名连败 3 次 → T 严格递增且第 3 次发射 STUCK_LOOP；
  2. S=1.0 时 test-OK → S≈0.6（乘法泄能）；
  3. T 在 0.72↔0.77 振荡 → STORM 只进出一次（迟滞防抖）;
  4. ASK/DONE 从摄入到广播 ≤50ms（直通道）；
  5. 同带两跑 → CSV 逐字节一致（确定性）；
  6. 静默 5min → S 按 τ=180s 衰减曲线吻合；
  7. 1000 行 diff 与 10 行 diff 的 m 比值符合对数公式。
- **M2 探针**：M1 首轮校准往返完成后开工。针＋曲线＋三音＋live 尾随。
- **闸门**：未经船长转达架构师的校准签核，不得越过 M1 向美学或功能扩张。

---

## 11. 汇报规范（船长转达用，格式即接口）

每次 replay 产出 `runs/<ts>/REPORT.md`，结构固定：

```
# RUN REPORT
engine <git-sha> / params <hash> / tape <name+体检表行>
## 解析
覆盖率 __%；未知工具: [...]；异常行: __
## 现实修正
（实现与规范不符处，逐条：规范说 X，现实是 Y，我做了 Z）
## 曲线
ASCII sparkline（T 全程）＋ curve.csv / moments.csv 路径
## 三大拐点抽检
对 |ΔT| 最大的 3 处：时间戳、ΔT、前后 ±30s 原始事件摘录、
引擎账目（哪几笔充能/泄能/衰减构成此拐点）
## 校准问卷（船长填写后随报告回传）
Q1 地狱带峰值时刻，比你记忆中的绝望时刻偏早/偏晚/正好？
Q2 RESOLVE 后的下坠，如释重负感成比例吗？
Q3 顺风带全程 T 是否安分（<0.3）？活跃度像那天的手感吗？
Q4 卡碟触发时刻，与你实际意识到"它卡了"差多少？
Q5 列出任何"这笔账算错了"的时间点。
```

架构师依据报告与问卷回传 `params.json` 修订。**调参台就是回放本身。**

---

## 12. 施工纪律

小步提交，里程碑打 tag；每个假设被现实推翻时，选择"按现实实现＋汇报记录"，**协议 schema 的任何改动除外**（需架构师签核）。不确定且无法自证时，在报告中提问，不要臆测扩张。禁止一切"顺手优化"进入 v0 禁令清单领域。

---

## 附录 B：琥珀宪法 v1.1（冻结资产，v1 施工时启用，v0 勿建）

**光法**：全宇宙一种光——暖的、低角度、来自画外的一盏灯，加仪器体内光（表头背光、琥珀管、绿宝石）。黑暗是画布，面板从黑暗中浮出。禁一切冷白与蓝光：七十年代没有蓝色 LED，历史的诚实是品味的下限。
**材质法**：香槟拉丝铝主体（基 #C7B48E / 高光 #EBDFC2 / 阴影 #7E6E4F，发丝纹永远水平）；胡桃木端板（#58351F 底、#3A2212 纹）；烟色玻璃罩表头；奶油瓷 #F2E6CC 只给表盘与丝印；走纸墨水牛血红 #8C2F1B；信号双宝石：琥珀 #FFB000 与暖绿 #4F8C4A。
**字法**：Univers 血统小号大写字距丝印，如蚀刻在铝上；数字永不见于面板明处，只活在机械计数轮，镜头凑近才入画。
**动法**：一切服从惯性。指针走 §6.4 弹簧-阻尼（禁补间、禁 linear）；带轴带角动量起停；指示灯钨丝式衰减（~200ms 冷却）而非数字熄灭。
**镜头法**：永不露整机——机器延伸出画外即尺度暗示；浅景深；每秒 <2px 慢漂移；3% 胶片颗粒（shader 实现，禁逐帧撒点）＋一圈暗角；暗场渐变必须抖动防色带。
**时间法**（修正案）：声画同步宁迟勿早——声音早到 45ms 即起疑，晚到近百毫秒无感；节拍量化天然使声音略迟，顺势。
**器件法**（修正案）：每件器件最多呈现一个变量的"值"与其"方差"，两义封顶。带轴：转速=活跃度，转速稳定度=确定性（wow）。
**灯位法**（修正案）：琥珀终身只说一句话——"需要你"。待机粒改用压暗暖绿或钨丝奶油。
**编舞**：带轴是心跳；VU 针吃 needle；琥珀管只为 ASK 呼吸；走纸记录仪以牛血红实时画 T 心电图——**纸带即时间轴**。待机整机睡在暗处只留一粒暗灯；张力积累则墨线爬升发抖、针幅变大、带轴现肉眼可见 wow；完工是针归零、带轴惯性滑停、绿宝石亮、纸停——洗碗机式寂静；死循环是带轴卡在同一拍反复——跳针的视觉孪生。
**宪法第一条**：机器永恒，介质易朽——面板永远崭新如出厂，磨损与泛黄只属于磁带和纸。老化是信号，不是装饰。

（完）
