# SWEEP_REPORT v2 — verdict/2 重扫（144 组 × 五带）
engine 69e1bdc / verdict 22f07f3c / 组合 144
网格：READ[0.15,0.18,0.21,0.24] × failDefault[0.3,0.4,0.5] × tauActiveSec[120,150,180] × repCap[4,6] × testResolveMinS[0.2,0.3]

## 结论
- 全绿组合数：**16 / 144**
- 闸门：存在全绿 → 按冠军规则 §4.3 选定，**直通 M2**。
- 冠军理由：全绿组中最少改动（归一距离 1.500）→ storm 峰值最低 → τ 最小。

## 架构师预测验证（M1.7 §2，可证伪）
预测：`886928d1`(READ0.21/fD0.4) 在 verdict/2 下全绿并夺冠转正。
- 886928d1 全绿：**✅ 成立**（active 判定）
- 886928d1 即冠军：**✅ 成立**
- 综合：预测完全成立。

## 冠军参数
`READ=0.21 failDefault=0.4 tauActiveSec=120 repCap=4 testResolveMinS=0.3`
params hash `886928d1` ｜ 距现参归一距离 1.500 ｜ 总违规 0.000

## 领奖台（前 3，按冠军规则）
| # | 参数 | 五带 | 全绿 | 归一距离 | 总违规 |
|---|---|---|---|---|---|
| 1 | READ=0.21 failDefault=0.4 tauActiveSec=120 repCap=4 testResolveMinS=0.3 | si✅ sm✅ bu✅ ja✅ st✅ | ✅ | 1.500 | 0.000 |
| 2 | READ=0.18 failDefault=0.5 tauActiveSec=120 repCap=4 testResolveMinS=0.3 | si✅ sm✅ bu✅ ja✅ st✅ | ✅ | 1.667 | 0.000 |
| 3 | READ=0.15 failDefault=0.5 tauActiveSec=150 repCap=4 testResolveMinS=0.3 | si✅ sm✅ bu✅ ja✅ st✅ | ✅ | 1.833 | 0.000 |

## 冠军参数下五带关键指标（双尺全量：占空 + 雨量R）
| 带 | 峰值T | T<0.3占空 | RAIN+STORM占空 | 雨量R | STUCK边沿 | RESOLVE | 机会 | 判定 |
|---|---|---|---|---|---|---|---|---|
| silence | 0.000 | 100.0% | 0.0% | 0.00 | 0 | 0 | 0 | ✅ |
| smooth | 0.405 | 98.9% | 0.0% | 0.00 | 0 | 0 | 4 | ✅ |
| busy | 0.466 | 99.4% | 0.0% | 0.00 | 0 | 0 | 4 | ✅ |
| jam | 0.623 | 96.7% | 1.1% | 0.02 | 2 | 2 | 2 | ✅ |
| storm | 0.903 | 63.5% | 17.9% | 1.88 | 9 | 0 | 2 | ✅ |

## 敏感度表（参数耦合，H/M/L）
| 维度＼指标 | storm.peakT | storm.rainR | storm.dutyRS | smooth.dutyLt30 | busy.peakT | jam.stuck |
|---|---|---|---|---|---|---|
| READ | M | M | M | L | H | L |
| failDefault | M | M | M | L | L | L |
| tauActiveSec | L | L | L | H | L | L |
| repCap | L | L | L | L | L | L |
| testResolveMinS | L | L | L | L | L | L |

_H/M/L = 该维取值对该指标的边际波动幅度（占该指标全局跨度比 ≥50%/≥20%/其余）。数据全在 sweep_results.csv，零额外回放。_

## 冠军 champion.params.json（落盘同目录）
```json
{
  "_source": "TAPE0 M1.6 sweep 冠军。基 params 886928d1 + verdict 22f07f3c。",
  "stress": {
    "S0": 1,
    "verbWeights": {
      "READ": 0.21,
      "WRITE": 0.3,
      "RUN": 0.5,
      "SAVE": 0.6,
      "ASK": 0,
      "SPAWN": 0.3,
      "OTHER": 0.2
    },
    "repWindowMs": 600000,
    "repBase": 1.5,
    "repCap": 4,
    "stuckLoopK": 2
  },
  "amplitude": {
    "writeDiffCap": 500,
    "runSecCap": 120,
    "readKbCap": 100,
    "default": 0.3,
    "failDefault": 0.4
  },
  "release": {
    "testResolveMinS": 0.3,
    "testResolveFactor": 0.6,
    "saveFactor": 0.5,
    "jamBreakFactor": 0.7,
    "jamBreakMinS": 0.25
  },
  "decay": {
    "tauActiveSec": 120,
    "tauIdleSec": 300,
    "idleThresholdSec": 60,
    "pendingRunDripAfterSec": 30,
    "pendingRunDripPerMin": 0.02
  },
  "weather": {
    "up": {
      "OVERCAST": 0.25,
      "RAIN": 0.5,
      "STORM": 0.75
    },
    "hysteresis": 0.1,
    "stormExit": 0.6
  },
  "companions": {
    "activityRateScale": 6,
    "wowWindow": 20,
    "wowSmoothingSec": 30,
    "idlePhaseSec": 120,
    "activityEmaSec": 30
  },
  "spring": {
    "up": {
      "zeta": 0.6,
      "omegaN": 33
    },
    "down": {
      "zeta": 1,
      "omegaN": 8
    }
  },
  "adapter": {
    "askTimeoutSec": 15,
    "doneSilenceSec": 600,
    "episodeGapMin": 30,
    "tagTestRegex": "test|jest|vitest|pytest|cargo test|go test",
    "tagBuildRegex": "build|tsc|webpack|vite build",
    "saveRegex": "git\\s+commit",
    "verbMapExtra": {
      "AskUserQuestion": "ASK",
      "ToolSearch": "READ"
    }
  }
}
```

---
_确定性：同网格两跑 sweep_results.csv 逐字节一致（金测试）。冠军若采纳则覆盖 params.json 并更新 hash。_
