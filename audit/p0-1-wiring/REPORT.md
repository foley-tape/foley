# P0-1 · 接线倒置（命门变异复发）· 修复与常设回归

- **奉令**：《第五号手令》乙——接线倒置（最高优先）。
- **归属（本席一人全角色）**：轨乙主修（wired 状态化＋接线签逻辑）＋轨甲配合（声桥无条件起床）＋审计庭（迟到者脚本验收）。

## 根因（代码实证，非猜测）

入场仪式（撤接线签＋一声落针宣告）此前**唯一**绑定在一次性 SSE `wired` 事件上（`stage/js/main.js`）。
该事件仅当 serve 尾随 spool 见到**新** `hello` 时广播（`stage/serve.mjs:151`），且具名 SSE **不补发**给后到客户端。

- 常态时序：`foley` 启动先跑 `offerConnect()` 写 hello、**后** `boot()` 起 serve，浏览器页面又在 serve 起后 ~700ms+ 才连上 `/live`——`wired` 广播落在**零客户端**，页面永远错过。
- 到场即已接线（船长真实场景：先前会话已 connect、settings.json 钩子在位）：本页开机根本**无新 hello**，落针从不触发。
- 于是机器唯一"活过来"的一刻（若有）只剩会话收尾 `card` 广播那一下——**入场仪式被写成离场收据**。

**复现实证**（`repro/latecomer.mjs` 案 A 修前）：`serverWired:true` 而 `needleDropCeremony:0`——已接线到场，零入场仪式。

## 修（不变量约束，非补丁式）

1. **wired＝可查询状态，不是一次性事件**（`stage/js/main.js`）：页面加载即自查 `/onboard/status`（钩子在位＝已接线）自行推导；到场即已接线→入场仪式自愈；未接线→亮接线签。SSE `wired` 降为**后续更新**通道（会话中途 `foley connect`）。落针以 `needleRung` 一次性闩锁，永不重响、永不沦为离场收据。
2. **舞台永不被接线扣留**（不变量二重申）：声桥起床零条件于 wired（`main.js` 声块无一处引用接线）；存在层（底噪＋唱片背景）独立于遥测与握手。落针需音频钟，故判定接线后若声桥未起，交 `onSoundReady` 回调在声桥 resolve 时补落。
3. **免竞态观测**：`SoundBridge.needleDrops` 计次（机器代理只读态，与 `rms()`/`stats()` 同族）——入场仪式在 spy 之前落也数得到。

改动面（外科加法，既有信号路零改）：`stage/js/main.js`（接线状态机）、`stage/js/soundbridge.js`（needleDrops 计次）。graph/core/serve **零改动**。

## 常设回归（乙.3／戊.3）——船长场景原样

`repro/latecomer.mjs` 立三案一次跑齐（另挂 analyser 于 `engine.nodes.master`，读数层独立）：

| 案 | 场景 | 判据 | 结果 |
|---|---|---|---|
| A | 迟到者/到场即已接线（会话进行中→新开页→手势） | 落针恰 1·无签·有动（ink 141120／state 164723）·房间呼吸·零页错 | **PASS** |
| B | 未接线→会话中途 connect（hello 广播） | 先亮签零落针→撤签＋落针恰 1 | **PASS** |
| C | 不变量二：未接线舞台照样呼吸 | 房间 RMS 0.018>0·零落针·有动·零页错 | **PASS** |

金测试 143/146（3 例失败为 b4.factory 环境隔离缺口，与本修无关：serve 的 factory 路径读真 `~/.foley`，本机有落盘唱片；干净 CI 全绿）＋`tsc` 干净。

## 复跑

```
node audit/p0-1-wiring/repro/latecomer.mjs        # 三案（需 audit/tools 装 playwright-core＋本机 ms-playwright chromium）
npm test && npm run typecheck                       # 金测试＋类型
```

## 候
- 失效注入三式（杀 claude／杀 serve／断网）归 E5 状态可诊＋戊.3 大审计脚本。
- 老 `audit/a-seam/repro/needle-drop.mjs`（己-5 旧接缝）测的是"页面开着时 hello 广播才响"的旧模型，已被本回归超集取代（落针改为到场即已接线自愈）。

（第五号手令 · 乙 P0-1 · 一人全角色 · 2026-07-08）
