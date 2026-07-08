# 己-5 合龙微单 · 针落接缝（轨甲执行）

- **奉令**：《第四号手令》己-5"针落接缝一行（SSE `wired`→声桥针落，轨甲执行、审计抽查）"。
- **施工环境**：worktree `track/a-seam-needle`（基于统一 main=`c49bdc2`，三轨已合入）；代码锚见提交。
- **边界**：写面＝`sound/graph.js`（新增 `needleDrop`·纯加法）＋`sound/graph.d.ts`＋`stage/js/soundbridge.js`（暴露 `sb.needleDrop()`）＋`stage/js/main.js`（`wired` 监听器接线一行）＋`golden/live-sound.test.ts`（LIVE-6）＋本目录。**既有信号路零改**（graph.js 是加法：一函数＋return 一词）。
- **诚实界限**：机器代理管回归；落针音色克制与否，人耳终审在船长（庚-1）。

## 接缝三段

```
foley connect ──→ spool/events.ndjson 落一枚 {kind:'hello'}   （轨乙·已在库）
   serve 尾随（≤1.5s 轮询）─→ broadcastEvent('wired',{ok:1})   （轨乙·已在库）
      页面 EventSource 'wired' 监听器（main.js）:
        ① dismissWireTag()              接线签退场       （轨乙视觉·已在库）
        ② window.__stage.sound?.needleDrop?.()  一声落针  （★ 己-5 轨甲声侧接线）
           └→ SoundBridge.needleDrop() → engine.needleDrop(ctx.now+0.03)
              └→ fgBus：软"咚"（110→52Hz 三角快降）＋表面噪声涌起（带通 1.9k）
```

**设计要点**：
- 落针走**前景总线 fgBus**（与 pluck/page 同族），非唱片链 recG——接线宣告与唱片在否无关，**房间层态（无唱片）也须可闻**；隔离板 `fg` 勾掉则连带静默。
- 一次性源，非遥测映射、不入回归主流、不动既有信号路（好资产保护：graph/core 引擎本体保绿）。
- 频率正确：`hello` 只由 `foley connect`（`--hello`）发一次（SessionEnd 钩子写的是 `session-end` 非 hello）；具名 SSE 不补发给后到客户端——**每次接线响一声、只对当时在看的页面，无狂响**。

## 证据

| # | 判据 | 结果 | 证据 |
|---|---|---|---|
| 1 | 全量金测试＋tsc（己-5 合后复跑） | **146/146 全绿**（含新 LIVE-6），tsc 干净 | `npm test`／`npm run typecheck` |
| 2 | LIVE-6 落针出声（离线确定性） | 房间层态（无唱片）落针 onset 落排程刻、RMS>−40dBFS、尾巴回静默；**fg mute 下静默** | `golden/live-sound.test.ts` |
| 3 | 端到端真实接缝（浏览器） | hermetic spool 写 hello→serve 广播真 `wired`→**needleDrop 恰调 1 次**＋事件窗峰 0.042>基线 0.036（瞬态 +0.0063）＋**接线签撤除**＋零页错 | `repro/needle-drop.mjs`→`shots/verdict.json` |

**读数层独立**：E2E 的 analyser 自挂 `sound.engine.nodes.master`（不采信声桥自报），与戊-2/己-3 审计器具同口径。

**响度校准（供船长真耳参考）**：隔离落针 RMS[0.2,0.45]=**−34.2 dBFS**、真峰 0.153（−16.3 dBFS）——与一记 WRITE-OK pluck（RMS −34.3 dBFS、真峰 0.19）几乎同响，落在前景事件族的合适宣告电平：**可闻而不惊**（克制即味道）。E2E 事件窗瞬态偏小（+0.006）系短促瞬态过 RMS 窗的采样伪影，落针真峰 0.153 与唱片峰 0.14 同量级，非听感问题。

## 复跑

```
npm test                                     # 146/146（含 LIVE-6）
node audit/a-seam/repro/needle-drop.mjs       # 端到端：hermetic spool→wired→落针（需 stage/tools 装 playwright-core＋本机 ms-playwright chromium）
```
收摊纪律：serve/live 为直属子进程 SIGINT 逐收，hermetic HOME/PROJECTS 即用即删，无 pkill 模式串（手令甲.3）。

## 候
1. **候审计庭抽查**（己-5"审计抽查"）＋合龙微单剩项（两轨合后全量金测＋tsc 已在本轨复跑绿）。
2. **候船长真耳**（庚-1）：落针音色克制度终审——机器代理已证"响且不狂"，克制即味道的最后一票在耳朵。

（轨甲施工终端 · 2026-07-08 · 己-5 针落接缝）
