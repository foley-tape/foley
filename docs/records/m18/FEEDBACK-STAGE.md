# FEEDBACK-STAGE · M-S1 第一张脸

> 轨道：Track-STAGE（终端二）。分支 `stage/amber`，独占写 `stage/**`，全仓未越栏一笔。
> 输入件：琥珀宪法 v1.1（SPEC 附录 B）＋白皮书 §5 音画绑定表＋EAR_REPORT F 条目。

## 交付对照（施工令 M-S1）

| 要求 | 状态 |
|---|---|
| stage 外壳 | ✔ `stage/index.html` 暗场构图、画外暖光、Univers 血统丝印 |
| 回放流客户端（fixtures curve/moments，20Hz 重放） | ✔ `stage/js/replay.js`；curve 实为 10Hz 采样，客户端重建到 20Hz 网格（见手记·现实修正一） |
| VU 针（吃 needle，禁自加缓动） | ✔ 渲染仅做相邻两包线性重建，恒迟一包 ≈50ms（时间法：宁迟勿早）；零弹簧零补间零 CSS transition |
| 走纸记录仪（牛血红画 T，纸带缓行） | ✔ 纸带即时间轴；13px/舞台秒；DONE 纸停带一口短惯性；拼接带在纸上留接带痕 |
| 琥珀管（pendingAsk 呼吸） | ✔ 呼吸周期 4.2s，钨丝式起落（起 ~130ms / 冷却 ~210ms）；curve.csv 无 pendingAsk 列，以 WAITING⇔pendingAsk 同源推导（见手记·现实修正二） |
| storm 带 30 秒屏录 ＋ 三张静帧 | ✔ 见交接件；另附琥珀呼吸 12s、完工寂静 10s 两段加映 |
| 无声 | ✔ 一行音频代码也无（声音归 Track-FIX 后续相） |

**禁令自查**：未触 engine/adapter；无导出/分享；未接 live；数字不上明面——连型号丝印都写成 `TAPE · ZERO`，那个 0 让位给了字法。fixtures 为五带 curve/moments **副本**（`stage/fixtures/`），tapes/ 原件未动。

## 绑定表落位（白皮书 §5 → 画侧）

- `needle` → VU 针（唯一驱动，无二次缓动）
- `T` → 走纸牛血红墨线 ＋ 笔位
- `phase=WAITING(pendingAsk)` → 琥珀管呼吸；`phase=DONE` → 纸停＋绿宝石亮＋针随数据归零
- `RESOLVE`（moments 流）→ 绿宝石一闪（钨丝冷却 ~320ms）——storm 带零 RESOLVE，此路待 Track-FIX 的空问题回答后才有实景
- `A / wow / weather` → 未接（带轴归 M-S2；天色候 v1 窗）

## 器件与实现

纯静态零运行时依赖：ES modules ＋ SVG（表头）＋ Canvas（走纸）＋ CSS（材质光法）。本地起法：`node stage/serve.mjs` → `http://localhost:4173/?tape=storm`。dev 抽屉 `?hud=1`（调带/倍速/跳带；数字只许活在这里）。

- 回放核心：舞台时间轴 = 累计 dt，单步夹上限 400ms；>2s 的空洞记接带痕，走纸可见——磁带宇宙对拼接的诚实。连续场线性重建、离散场阶跃、moments 直通。
- 广播/渲染分离：20Hz 包广播 ↔ 显示器帧率渲染，渲染端只做两包线性重建（重建≠缓动：无过冲、无滞后动力学）。
- 灯的钨丝热惯性走真实时间（倍速回放不改变灯丝物理）；走纸走舞台时间（它是走带机构）。

## 已知界限

- 静帧/屏录由 Playwright 无头 Chromium 捕捉（构建期工具，未入仓）；屏录起点带 0.8s 掐头容差。
- seek 后墨迹重画（dev 行为，正常回放不受影响）。
- 五带只实测了 storm 全景＋各带加载烟测；其余四带的品味走查归 M-S2 一并。

## 下一步（M-S2 待令）

带轴（A/wow/角动量）、机械计数轮、镜头法（漂移/颗粒 shader/暗角动化）、材质打磨。宪法修正案草稿两条见《舞台手记》。
