# 轨甲交付报告 · 主水管（live 流式出声）

- **奉令**：《派生手册》§3 轨甲卡＋《第三号手令》丁-轨甲修订（总线一元论拆除；好资产保护清单；机器代理验收增补）＋《第二号手令》增补一（worktree 建制）/增补三（接口先行）。
- **施工环境**：worktree `track/a-live`（基于 main=`8c7a198`）；代码锚 `e7e28d7`。
- **真实材料申明**：浏览器验收的 live 模式尾随**本机最新真实会话**（即本施工会话自身，serve `--latest` 默认解析）；打包形态用其副本（临时目录，即用即删）。storm 仅出现在"回放保绿"回归项（G8 正门参数原样）。
- **边界申明**：写面=`sound/`（livebridge 新增、offline 耳膜修真）＋`stage/js/`（soundbridge 重铸、main 接线、demo-boot 适配）＋`golden/live-sound.test.ts`＋本目录。**graph.js/core.js 一行未动；serve.mjs 零改动**（避让轨丙 B4 手术台）；协议契约 v1 零增改。
- **诚实界限**：本报告一切"出声"结论以 master 总线旁挂 AnalyserNode 实测 RMS 为证（机器代理管回归）；**人耳终审权在船长/审计庭**（验收最高法，需真人录音）。

---

## 一、架构落地（总线一元论）

**病灶（RECON B3 双证）**：`soundbridge.js start(tape)` 吃完整 curve 一次性 `buildTrack`（整带上桥）；`main.js` 声桥只焊回放分支。live 无完整带可给——静音是结构性的。

**拆法**：
```
                     ┌────────────── stage/js/soundbridge.js（浏览器薄壳）
                     │  手势开机 · fetch 资产(3s帽) · buildEngine · analyser 机器代理 · 唱片异步热装
  live: SSE ──┐      │
              ├→ feedRaw ─→ instruments[] ∋ SoundBridge ──→ sound/livebridge.js（流式大脑，纯逻辑）
  replay: 磁带┘   （画声同吃一路包流）                        │  包→行帐(音频钟轴)→引擎网格窗(1s 前瞻)
                                                             │  时刻→分类→trigger（乐音级量化/呼唤级直通）
                                                             └→ sound/graph.js 引擎（零改动，好资产）
```
- **渲染器=总线普通订阅者**：`SoundBridge` 实现器件鸭型（onPacket/onMoment/render），被 push 进 `instruments`——与画面**平级**，字面意义。
- **对模式全盲**：大脑只认"到达的包"；时间轴=音频钟（行 pm=到达刻−audio0）。不吃 stageT、不认折叠轴、不问倍速。回放=磁带喂同一根总线（Replayer 的 20Hz 重建流）；live=实流喂同一根总线。demo 橱窗页同路。
- **StatePacket→连续参数**：行帐进引擎既有 `scheduleGridUntil` 网格窗（前瞻 1s，短窗保状态新鲜）；`sampleAt` 取"≤pm 最近行"的语义天然就是流式的"以最新已知状态为预测"。
- **MomentEvent→前景**：乐音级（WRITE/READ/RUN/SAVE/SPAWN）走引擎 `trigger` 内建量化（宁迟勿早）；**RESOLVE/STUCK/ASK/DONE 呼唤级直通**（引擎既有法，cls≥6 不过量化）。test 型 RUN-OK 设 250ms 押后窗让位同刻 RESOLVE（和弦让位律，双到达序皆正确）。
- **第一分钟出声零外网**：起引擎即有房间层（资产缺席→合成织体同构退路）；唱片是增强不是前提——异步取、到即热装（`setRecord` 装盘律原样），`foley records` 落盘后 ≤90s 自动上桥免刷新。
- **DONE→复活**：滑停后非 DONE 相到达=新一章开工，唱片重新落针。
- **时钟可注入**：大脑无 DOM/fetch/定时器——金测试用模拟钟喂"到达流"、OfflineCtx 一次性渲染断言波形，live 通路首次获得与回放同级的确定性判据。

## 二、证据表

| # | 判据 | 结果 | 证据 |
|---|---|---|---|
| 1 | 金测试全量（好资产回归门） | **121/121 全绿**（116 在库＋5 新 LIVE 门），tsc 干净 | `npm test`（21.5s）；在库 55/57/59 唱片机芯全过=引擎零殃及 |
| 2 | LIVE-1 命门机器代理 | 流式 60s 两窗 RMS>−40dBFS（合成退路条件） | `golden/live-sound.test.ts`（离线确定性，回归门常设） |
| 3 | LIVE-2 双通道 | pluck onset 落网格线 ±20ms 且不早于到达；ASK onset 20.32s 直通（网格线 20.54 之前） | 同上（波形 onset 断言） |
| 4 | 浏览器 live 出声（dev 形态） | **手势后 0.25s 首声**，RMS avg 0.059/peak 0.085，PAGEERROR=0；pre-gesture `sound=undefined`→post 在场 | `repro/live-rms.mjs` → `shots/verdicts.json` |
| 5 | 回放保绿（好资产） | storm@8× 首声 0.25s，avg 0.059（RECON 基线 0.066 同量级） | 同上 Part B |
| 6 | 唱片层＋热装 | live/replay 双路 recordInfo=Still Life 真上桥，console「唱片上桥」×2，peak 0.142（RECON 旁证 0.139 同量级）；唱片在位作曲四层退场（avg 回落） | `shots-record/`（vendored 位形态，mp3 即放即删） |
| 7 | 打包形态（产品条件） | wav/mp3 全缺席＋真实会话副本：live 首声 0.25s，avg 0.056（纯合成房间层） | `shots-pack/`；npm pack→解包→FOLEY_PROJECTS 实跑 |
| 8 | 1× 长跑（机器侧） | **600s/300 采样 soundRatio=1.0（零死寂）**；rowsMax 8162≤8192 行帐有界；pageErrors=0 | `repro/long-run.mjs` → `shots-long/long-verdict.json` |
| 9 | 音画同源 | 结构性：画声同吃一路 feedRaw（同一根总线）；运行时：声侧收包 12018 vs 画侧铺纸 12050，**avRatio=0.9973**（差 0.27%=读数时间窗误差量级） | 代码 `main.js`＋长跑证据 |

## 三、兵器申报（Tone.js 偏离，候架构师复裁）

增补二裁"音频地基采用 Tone.js"；003 令丁-轨甲改口"放行确认（备胎条款不触发）"并同令钉入**好资产保护清单**（graph/core 引擎本体保绿）。实施发现两令在物理上不可同时满足：

1. 增补二列举的三条理由（Transport=音频主钟／量化一行 API／前瞻调度），**在库引擎已原生具备**（`startTransport` 音频钟锚＋`trigger` 内建量化宁迟勿早＋`scheduleGridUntil` 前瞻窗——正是增补二·4 所述"原生 Web Audio＋手写前瞻调度器"形态，且它不是备胎，是 116 条金测试＋LUFS 定标在身的好资产）。
2. 若引 Tone 重写渲染层：live/replay 同路律使浏览器回放一并换芯→已定标乐器（三关铁律/params 治理/G7 响度）在浏览器侧变死代码→实质殃及好资产＋重开美学定标轮（手册冰箱明令冻结）。若 Tone 只做钟：双钟并存（Tone.Transport vs 引擎网格锚），新增失步面无收益。
3. 故按 003"放行"之许可语义**未启用** Tone；一元论/音频主钟/量化/直通四目标全数由在库引擎达成（证据表 §二）。**接线面已收窄至单一渲染器文件**（livebridge）——架构师若复裁必须 Tone，换芯不动总线（增补二·2 的边界纪律反向同样成立）。

## 四、已知限制（如实记案）

1. **回放暂停不停机**：包流停但房间层/唱片照转（网格窗由泵续排）。物理隐喻上"停带"是否应滑停，候裁（观感无碍：画停声继，如真唱机）。
2. **回放倍速**：前景密度随包流倍增（磁带快进机器快响，诚实）；STUCK 啃唱片时长按 2.5s 墙钟（demo 桥沿革——流式下 CLEARED 不可先知）。
3. **repoKey live 恒 `live:default`**："每仓库一调"需 serve 暴露项目身份——美学轮/冰箱项，暂不加端点（避让 serve 并发施工）。
4. **replay 页 seed 由 'demo' 改为 mode 值**：fallback 织体相位/卡碟窗种子变化；定标常数与 params 未动，音色身份不变。
5. **S2 网格采样 vs producer 钟 ppm 级偏斜**：行帐锚到达刻，长程无累积（长跑仪 avRatio 兜底盯防）。
6. **唱片热装→作曲四层退场**存在 ≤1s（前瞻窗）+slew 的过渡窗，fade 平滑覆盖。

## 五、复跑手册

```
npm ci && npm test                                    # 121/121（含 LIVE-1..5）
node audit/a-live/repro/live-rms.mjs                  # dev 形态：live+replay 双证（需 stage/tools 装 playwright-core＋本机 ms-playwright chromium）
cp ~/.foley/records/factory/still-life.mp3 sound/records/ && node audit/a-live/repro/live-rms.mjs --out audit/a-live/shots-record && rm sound/records/still-life.mp3   # 唱片层
npm pack → 解包 → node audit/a-live/repro/live-rms.mjs --root <解包 package 目录>            # 打包形态
node audit/a-live/repro/long-run.mjs --sec 600        # 1× 长跑仪
```
收摊纪律：脚本自起自收 serve（直属子进程 SIGINT），全程无 pkill 模式串（003 令甲.3）。

## 六、候项

1. **候轨丙 B4 合入后 rebase**：姊妹条款"`foley records` 下载完成后 deck 必须真放出厂唱片（干净 worktree＋打包形态双验）"——record 路径与热装已双证（证据 6：vendored 位形态），差 serve factory 回退一环；B4 落地即复跑 `live-rms.mjs` 两形态补签。
2. **候审计庭**：本 worktree 内真实验收＋真人录音（验收最高法）；RMS 器具（`sb.rms()`）已内建，与戊-2 常设回归仪同口径。
3. **报请架构师**：§三兵器申报复裁；增补一.3 `.worktreeinclude` 全场尚无人落地（卡外，仅报请）。

（轨甲施工终端 · 2026-07-07）
