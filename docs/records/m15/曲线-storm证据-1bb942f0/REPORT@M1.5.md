# RUN REPORT
engine 46d4c1d / params 58041d07 / tape storm-alt-1bb942f0.tape.jsonl（storm）
蒸馏带 distill/1 / src d98d3543
体检表：活跃80.8min/墙钟15969.4min｜事件132｜FAIL79（59.8%）｜独立签名25｜最大同签名重复8｜episode 3

## 判定表（施工令 §6）
| 指标 | 实测 | 判定 |
|---|---|---|
| 峰值 T ∈ [0.65,0.92] | 0.633 | ❌ FAIL |
| RAIN+STORM 占空 ∈ [15%,45%] | 1.5% | ❌ FAIL |
| RESOLVE 次数 ≥1 | 0 | ❌ FAIL |
| STUCK_LOOP 边沿数 ∈ [3,12] | 9 | ✅ PASS |

**本带判定：❌ 有越界**

## 天气占空比（占活跃时长）
| CLEAR | OVERCAST | RAIN | STORM |
|---|---|---|---|
| 70.0% | 28.6% | 1.5% | 0.0% |

## episode 分表
| # | 活跃min | 事件 | FAIL | 峰值T |
|---|---|---|---|---|
| 0 | 24.7 | 59 | 40 | 0.633 |
| 1 | 51.0 | 65 | 38 | 0.404 |
| 2 | 5.1 | 8 | 1 | 0.101 |

## 解析
覆盖率 100.0%；未知工具: [无]；异常行: 0
配对: 132/132；未决(尾随局限): 0；sidechain 行 0（折叠 main）；AskUserQuestion 2 次（现映射 ASK）

## 曲线
T 全程：`▁▁▁▁▁▁▁▁▁▂▂▃▂▂▃▅▄▁▂▂▂▂▂▁▁▂▂▃▂▂▂▂▂▂▁▁▁▁▁▁▁▂▂▂▁▁▂▂▂▁▁▁▁▁▁▁▁▁▁▁`  (峰值 T=0.633)
STUCK_LOOP×9 ｜ STUCK_CLEARED×9 ｜ RESOLVE×0
curve.csv（t,S,T,A,wow,needle,phase,weather）｜moments.csv（含 emitT 直通道延迟）

## 三大拐点抽检（两两间隔 ≥120s）
**拐点 1** @ 2026-06-10T07:34:07.663Z ｜ΔT=-0.127（T→0.001）
- 前后 ±30s 事件：07:34:07 READ-FAIL；07:34:12 READ-FAIL；07:34:12 READ-FAIL；07:34:16 READ-FAIL；07:34:16 STUCK_LOOP；07:34:16 READ-FAIL；07:34:16 READ-FAIL；07:34:16 READ-FAIL；07:34:32 READ-FAIL；07:34:34 RUN-OK
- 引擎账目：07:34:07 READ-FAIL ΔS=+0.036；07:34:12 READ-FAIL ΔS=+0.036；07:34:12 READ-FAIL ΔS=+0.054；07:34:16 READ-FAIL ΔS=+0.081；07:34:16 READ-FAIL ΔS=+0.036；07:34:16 READ-FAIL ΔS=+0.036；07:34:16 READ-FAIL ΔS=+0.054；07:34:32 READ-FAIL ΔS=+0.121

**拐点 2** @ 2026-06-10T07:55:53.849Z ｜ΔT=-0.249（T→0.094）
- 前后 ±30s 事件：07:55:53 ASK-OK；07:55:54 STUCK_CLEARED；07:56:17 STUCK_CLEARED
- 引擎账目：（纯衰减/弹簧，无离散充能）

**拐点 3** @ 2026-06-10T08:29:16.846Z ｜ΔT=-0.127（T→0.001）
- 前后 ±30s 事件：08:29:16 WRITE-OK；08:29:16 DONE
- 引擎账目：（纯衰减/弹簧，无离散充能）

## 现实修正
逐条见交接件 **FEEDBACK.md**（规范说 X／现实是 Y／我做了 Z）。数字均由 curve/moments CSV 与蒸馏带机器生成，禁手工誊写。
