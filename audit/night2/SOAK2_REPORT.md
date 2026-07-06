# SOAK2_REPORT — NIGHT-2 §2 整机通宵值机

> 首夜全栈过夜：合成会话（种子 20260706，计划 1457 行）→ cli live（serve 自孵，20Hz）→ SSE → 真浏览器引擎全程在场。
> soak 目录：`audit/night2/soak/`；live 产物流：`runs/live-2026-07-06`。

## 0. 时窗

- 采样起止：01:19:44 → 08:10:06（6.84 小时）
- driver 日志：
```
2026-07-06 01:19:39 driver up; deadline 2026-07-06 08:10:39; port 8932
2026-07-06 01:19:44 pids serve=31694 gen=31684 browser=31707
2026-07-06 08:10:53 收工开始
```

## 1. 常驻内存（RSS）——bounded 纪律实测

| 角色 | 首采 | 末采 | 峰值 | 斜率/小时 | 判语 |
|---|---|---|---|---|---|
| SERVE | 57.5MB | 48.1MB | 62.0MB | -0.7MB | 恒平 ✅ |
| GEN | 52.7MB | 44.7MB | 53.7MB | -0.2MB | 恒平 ✅ |
| BROWSER | 11.3MB | 97.9MB | 142.8MB | +2.5MB | **增长 ⚠️ +2.5MB/h** |
| LIVE | 90.7MB | 64.5MB | 90.7MB | -0.4MB | 恒平 ✅ |
| CHROMIUM | 84.9MB | 41.2MB | 172.3MB | -0.5MB | 恒平 ✅ |

浏览器标签页 JS 堆：首 1.7MB → 末 2.3MB（峰 2.3MB，斜率 0.00MB/h）

## 2. CPU 与体温法

| 角色 | CPU 均值% | CPU 峰值% |
|---|---|---|
| SERVE | 0.1 | 0.3 |
| GEN | 0.0 | 0.0 |
| BROWSER | 0.0 | 0.3 |
| LIVE | 0.1 | 0.6 |
| CHROMIUM | 33.4 | 113.8 |

- 主机 load1：均 2.18，峰 4.71
- 热度：pmset -g therm 本机不可用/无输出（如实申报，改以 CPU% 与 load 为体温代理）

## 3. 恒迟影子（浏览器实测：到达墙钟 − 包内 t）

- 分均值：全程中位 25.7ms ｜ 首时段均 25.7ms → 末时段均 25.6ms
- 漂移斜率：-0.0 ms/h （恒迟成立 ✅）
- 分钟窗内峰值的峰值：97ms
- SSE 断线（gone 事件）：0 次

## 4. 发射时刻 vs 理论时刻

- 发生器写出迟到（计划→实写）：p50 248ms ｜ p95 480ms ｜ max 501ms（500ms 轮询节拍内为正常）
- live 时刻发射（emitT − t，含追赶期负载）：p50 0ms ｜ p95 0ms ｜ max 514ms
- ASK/ASK_CLEARED 直通道：10 发，emit 滞后 max 0ms（协议：不排队）

## 5. 深睡台阶与相位（curve.csv）

- 采样 493462 行；相位切换 98 次
  - 01:19:40 IDLE→WORKING
  - 01:25:07 WORKING→IDLE
  - 01:25:29 IDLE→WORKING
  - 01:28:18 WORKING→IDLE
  - 01:28:58 IDLE→WORKING
  - 01:39:04 WORKING→IDLE
  - 01:39:20 IDLE→WORKING
  - 01:42:06 WORKING→WAITING
  - 01:42:33 WAITING→WORKING
  - 01:57:40 WORKING→IDLE
  - 01:57:52 IDLE→WORKING
  - 02:14:34 WORKING→IDLE
  - 02:14:42 IDLE→WORKING
  - 02:18:05 WORKING→IDLE
  - 02:18:49 IDLE→WORKING
  - 02:22:17 WORKING→IDLE
  - 02:22:36 IDLE→WORKING
  - 02:25:04 WORKING→IDLE
  - 02:25:59 IDLE→WORKING
  - 02:28:57 WORKING→IDLE
  …
  - 07:18:56 IDLE→WORKING
  - 07:23:42 WORKING→IDLE
  - 07:24:03 IDLE→WORKING
  - 07:32:22 WORKING→IDLE
  - 07:32:48 IDLE→WORKING
  - 07:42:29 WORKING→IDLE
  - 07:43:28 IDLE→WORKING
  - 07:46:00 WORKING→IDLE
  - 07:46:28 IDLE→WORKING
  - 07:50:55 WORKING→IDLE
  - 07:51:22 IDLE→WORKING
  - 07:53:58 WORKING→IDLE
  - 07:54:10 IDLE→WORKING
  - 07:57:14 WORKING→IDLE
  - 07:57:40 IDLE→WORKING
  - 08:00:31 WORKING→IDLE
  - 08:00:49 IDLE→WORKING
  - 08:02:49 WORKING→IDLE
  - 08:03:02 IDLE→WORKING
  - 08:05:24 WORKING→IDLE

## 6. 时刻账（moments.csv）

- 动词分布：OTHER×25  READ×262  RUN×214  WRITE×201  SPAWN×25  ASK×10  SAVE×12
- 标点/特判：SESSION_START×2  ASK_CLEARED×5  STUCK_LOOP×4  RESOLVE×4  STUCK_CLEARED×4  DONE×2
- 卡碟 STUCK_LOOP：4 次（k=2,2,2,2）；RESOLVE：4 次（计划：风暴簇 4，其中 3 修复 1 烂尾）
- 事件量：749 行（FAIL 38）
- 发生器计划种类账：`{"misc":1,"use:read":261,"res:read":261,"use:run":175,"res:run":175,"use:write":198,"res:write":198,"use:spawn":25,"res:spawn":25,"use:other":17,"res:other":17,"use:ask":5,"res:ask":5,"use:save":10,"res:save":10,"use:storm-fail":28,"res:storm-fail":28,"use:storm-fix":3,"res:storm-fix":3,"use:storm-resolve":3,"res:storm-resolve":3,"use:final-save":1,"res:final-save":1,"use:final-test":1,"res:final-test":1,"use:coda":1,"res:coda":1}`

## 7. live 自述（追赶与停机摘要）

```
[live] TAPE0 live ｜ /Users/shadow/tape0-night2/audit/night2/soak/synth-raw.jsonl
```

## 8. 浏览器台账

- SSE 收包：state 493221 ｜ moment 746
- PAGEERROR：0 条
- 出站请求（非 localhost:8932）：0 条（零网络成立 ✅）
- 截屏：shot-h*.png（逐小时）＋ shot-final.png

## 9. 诚实申报

- 浏览器为 headless Chromium（真引擎、无声卡）：SSE/渲染循环/内存台账有效；音频通路与屏上光学不在本测范围。
- 本报告由 soak_report.mjs 机器汇算生成，禁手工誊写数字。

## 10. 判读（对 §1 唯一 ⚠️ 的定性——不改机器数字，只作解释）

- **§1 BROWSER +2.5MB/h ⚠️ 是测量脚手架、非产品**：该行是跑 playwright 的 **node 驱动进程**（soak_browser.mjs 客户端），非 foley。真正承载 foley 的两处都恒平——**页内 JS 堆 0.00MB/h 死平**（1.7→2.3MB，峰 2.3MB），**CHROMIUM 渲染进程 −0.5MB/h**。故 **foley 的 bounded 纪律实测成立**；漂移在 playwright 客户端侧，与被测物无关。
- **产品级结论（6.84h）**：SERVE/LIVE/引擎 RSS 恒平；恒迟 25.7ms、漂移 −0.0ms/h、SSE 断线 0；ASK 直通道 emit 滞后 0ms；**PAGEERROR 0、出站请求 0（零网络成立）**；深睡/相位 98 次切换、卡碟 STUCK_LOOP×4 与 RESOLVE×4/STUCK_CLEARED×4 如实计分（含 1 记烂尾无仪式，符合家规④）。整机通宵三大主张——**内存有界、恒迟不漂、零网络——实测全立**。
- 注：§7 live 自述只截到启动行（driver SIGINT 后 live 停机摘要走 stderr，本次未落 serve.log 尾）——量纲不影响，记为采集小疏。
