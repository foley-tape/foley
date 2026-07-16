# 工单 4 呈审报告 · 零会话首分钟

呈审：席二继任 → 席一 · 2026-07-16
法源：`audit/seat1-wo4-atf/ZERO_SESSION_FIRST_MINUTE_ATF.md`（需求正文·零改动）＋NEGATIVE_CONTROL.md
工地：`seat/state-wo4` 基 `52d28cd`（D2 签章后 main）＋ATF 提交 `23c602d`，其上一枚实现提交

## 〇、结论行

- **RED**（实现前·23c602d）：`test:wo4-atf` 4/4 红——与席一负控逐项一致（`WO4_ATF_RED_原始输出.txt`）。
- **GREEN**：`npm run typecheck` 净 · `npm run test:wo4-atf` **4/4** · `npm test` **221/221**（零 skip/todo）。
- **90 秒真机烟测**：真 Chrome 带声一镜到底 **90.6s**，逐项 **14/14 PASS**（厂带 STORM 上机盘转／一次手势有声 RMS −34.7dB／declinedAt 全程无接线单／投带后牌面 24s 内自动转 LIVE·link 回魂·零死相残留·serve stderr 零 ENOENT/裸堆栈）。证据＝`~/Desktop/至架构师/09_2026-07-16_席二_工单4零会话首分钟烟测/`（mp4＋三静帧＋逐项断言，断言副本 `WO4_烟测断言_逐项.txt`）；烟测器入仓 `stage/tools/verify/wo4_smoke.mjs`（器具入仓律·不入默认回归）。

## 一、三项 P0 实现

1. **厂带自举（W4-01）**——`stage/serve.mjs` bootMachine：起机时会话房无一卷 `.jsonl`（且非 `--raw`）→ 不再 startLive/装 live，改 `transportSelect('storm')`（G8 演示卷成例·缺件按架序兜底）；cli live 不在空目录上运行＝ENOENT/裸堆栈从源头不发生。旧 demoBoot 残段（E2 后只剩 vlog）随案清葬。房里有会话（含歇场旧带·待机法归待机法）与 `--raw` 仍走原路。
2. **declined 穿透（W4-02/02B）**——`/onboard/status` 读 `$FOLEY_HOME/onboard.json`，`declinedAt` 为正数即回 `declined:true`（状态 API 首日冻结字段）；`stage/js/main.js` 接线状态机在 `mountWireTag` 前消费 `st?.declined`——谢绝过＝尊重，不再递接线单。与 connect `offerConnect` 同账本同判读。
3. **会话后至自动转 live（W4-03）**——serve 侧：厂带自举后 `watchForFirstSession` 值守（2s 轮询会话房），首卷落地→`startLive()`（/live 即可订阅）→`autoSwitchToLive`（仅当机器仍停在自举厂带时替用户换带——用户已动过 transport 即不夺权；CUEING 锁窗 300ms 重试）；同一 `transport.epoch`。页面侧（兼治「初始 gone 粘滞」）：`stage/js/live.js` —— ①EventSource 对非 200（空房期 /live=503）是**致命关闭不自动重试**，而 transport 推送与包流同乘此线＝页面失聪；现 CLOSED 即 2s 定时重开新 ES（serve 连上即喂 transport 快照，零漏拍）；②具名监听（transport/card/wired）收编 `addEsListener` 登记口，重连换实例自动复挂（main.js 三处直挂改登记）；③`gone` 不再粘滞——数据在流即回 `live`（源复活灯语跟着回魂）。

## 二、诚实余量

1. **歇场旧带（>15min）起机策略未动**：仍上 live（待机法）——本单只锁「空会话房」；stale 场景的取舍留 P1 议。
2. **值守员轮询 2s（递归 readdir）**：只在空房厂带自举分支运行、命中即停；空房目录极小，成本可忽略。多个新会话同时落地的仲裁归 P1（验收单 §合并门原文）。
3. **ES 重连 2s 定步**：replay-only 静态 serve 下 /live 恒 503 → 页面每 2s 一次重试常驻——localhost 单请求级噪声，接受；如需再省，退避窗归 P1。
4. **后至 live 的今晨纸补灌**：走既有 `mountSource('live')`→`live.prime()`（livePrimed 门·tailSec 尾窗），后至场景实测正常；`?mode=live` 深链在空房期显示厂带（transport 权威），后至同样自愈。
5. **烟测中 REC 不亮属正确**：烟测环境无 hook 接线→无 producer 身份行→producer 恒 null（UNKNOWN）→derive 不点 REC——与 D2 状态机口径一致，非缺陷。

## 三、复跑口

```bash
cd /Users/shadow/tape0-seat-d2
npm run typecheck && npm run test:wo4-atf && npm test
node stage/tools/verify/wo4_smoke.mjs <证据目录>   # 一次性真机烟测（弹真 Chrome ~100s·不入默认回归）
```
