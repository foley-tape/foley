# SOAK_REPORT — TAPE-0 通宵耐力测试（审计方 B）

> 由 `audit/b/soak/soak-summarize.ts` 生成，读滚动 CSV。与审计会话解耦。

## A) 虚拟时钟（8h 模拟会话，秒级完成）
- 采样点：44（每模拟 10 分钟一采样）
- RSS：90.1→94.3 MB（min 90.1 / max 94.3）——✅ 有界
- sigStates 会话内峰值：11（realistic 会话很小：errClass 归一塌缩）
- outcomes 数组长度：恒 20（≤ wowWindow → ✅ 无泄漏）

## B) reap O(n) 退化压力（单会话累积 distinct sig）
| distinctSigs | reap µs |
|---|---|
| 2000 | 30.9 |
| 4000 | 15.9 |
| 6000 | 21.5 |
| 8000 | 42.9 |
| 10000 | 31.9 |
| 12000 | 39.3 |
| 14000 | 42.5 |
| 16000 | 49.4 |
| 18000 | 57.1 |
| 20000 | 57.7 |

结论：单次 reap 30.9µs → 57.7µs（2000→20000 sig）。reap 每 tick 全量扫 sigStates，会话内无 evict → **tick 成本随累计 distinct sig 线性上升**。realistic 归一下 sig 少故当前无痛；若把 targetHash 并入 sig（修红队C 塌缩），distinct sig 暴涨，此退化转为真问题。

## C) 墙钟长跑（真实 0.1h）
- 采样点：8（每分钟）
- 事件累计：20
- RSS：87.8→88.6 MB（min 87.8 / max 88.6）——✅ 有界（无缓慢泄漏）
- heapUsed：8.4→8.9 MB
- CPU user：0.1s 累计（0.0002 s/s 占用）
- 处理延迟（发射漂移代理）每分钟峰值：min 0.19 / max 0.95 ms

RSS 轨迹：`▁▅▆▇████`

## 判读
- **无终身累加器？** outcomes ✅ 有界；sigStates ❌ 会话内不 evict（realistic 归一下峰值小，但违反"无终身累加器"原则，且 reap O(n)/tick）。
- **过期 CLEARED tick 对齐随时长退化？** 发射时刻取理论过期点 lastHit+win（与 tick 无关，金测试⑫已证）→ 时刻本身不漂移；退化的是 reap **算力**（扫全 map），非时刻精度。
- **RSS/CPU 有界？** 见 A/C 实测。
