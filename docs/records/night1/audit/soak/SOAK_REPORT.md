# SOAK_REPORT — 通宵耐力测试（夜班令 §2）

状态：**✅ 完成**　｜　日志：`audit/soak/run/soak-samples.jsonl`　｜　生成于 2026-07-05T00:20:47.748Z

## 配置
- 目标时长 6h（sim）｜墙钟压缩 1×｜种子 42｜paramsHash 886928d1
- 启动 2026-07-04T16:56:23.216Z｜完成 2026-07-04T22:56:54.686Z｜墙钟 21631.5s

## 事件与发射
| 采样点 | 事件 | 失败 | 派生发射 | 最新 sig 态数 | 最新 S |
|---|---|---|---|---|---|
| 295 | 958 | 335 | 257 | 93 | 0.0018 |

## 内存/CPU 稳定性（每分钟采样 ×295）
- RSS：76.09–82.94 MB｜线性斜率 **0.0046 MB/simmin**（≈0 → 无泄漏；>0.5 可疑）
- Heap：7.81–9.26 MB
- 判据：live-等价消费者为 **bounded**（不累积 snapshot）→ 预期 RSS 平。斜率 ✅ 平（无单调增长）

## MomentEvent 发射漂移（STUCK_LOOP/RESOLVE：应≈0，同刻发射）
- n=230｜median 0ms｜p95 0ms｜max|·| 0ms
- 解读：这两类在事件到达同刻发射，漂移应恒 0（非 0 即 driver 排序问题）。

## 过期型 CLEARED 的 tick 对齐（气味线索：随时长是否退化）
- n=27｜tick 分辨率 50ms
- 前半均 |对齐误差| 25.10ms｜后半均 |对齐误差| 26.47ms
- 退化判定：✅ 未见退化（前后半误差相当，sim 钟浮点累加未漂）
- 注：引擎把 expiry 的 moment.t 钉在理论过期点(lastHit+win)，对齐误差应恒 ≤ 一个 tick，与已跑时长无关（M1.6-A §2.6 正典）。本测即验证该不变量在长跑下成立。

## 收尾摘要（soak-done.json）
```json
{
  "kind": "done",
  "finishedAt": "2026-07-04T22:56:54.686Z",
  "wallSec": 21631.5,
  "simHours": 6,
  "speed": 1,
  "seed": 42,
  "events": 959,
  "faults": 335,
  "emits": 257,
  "snapsTicked": 432071,
  "driftMs": {
    "n": 230,
    "min": 0,
    "median": 0,
    "p95": 0,
    "max": 0
  },
  "expiryAlignMs": {
    "n": 27,
    "meanAbsFirstHalf": 25.667,
    "meanAbsSecondHalf": 26.111
  },
  "finalRssMB": 80.13,
  "finalSigStates": 93,
  "finalS": 0.0014
}
```

---
_本报告由 `audit/soak/soak-summarize.ts` 独立生成，不依赖 soak 进程存活。_
