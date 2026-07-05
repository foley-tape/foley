# TAPE-0 施工令 · M1.5 校准修订 ＋ M2 条件放行

本文件是架构师对 M0–M1 反馈的**全部裁决与下一步指令**；与旧文冲突处，以本文件为准。协议 schema 仍然冻结，唯一例外是本文件 §4 明列的增项（架构师已签核）。
> 术语更新（立即全库生效）：`hell → storm（风暴带）`、`loop → jam（卡碟带）`、smooth（顺风带）不变。旧称弃用。

---

## 1. 六项裁决（对应上轮 FEEDBACK 的待签项）

| # | 议题 | 裁决 |
|---|---|---|
| 1 | 失败操作的幅度 m | **选 A 增强版**：`outcome=FAIL` 时 `m = max(amplitude.failDefault, 实测值)`，failDefault=0.3。长跑后失败（如 90s 的测试挂掉）按实测更重，符合直觉。 |
| 2 | 衰减 τ | **攒着劲慢慢消**：tauActiveSec 60→**120**，tauIdleSec 180→**300**。高失败率会话应保有阴郁底色，簇间不再漏光。 |
| 3 | RESOLVE 门槛 | **维持 S>0.3 不动**。充能修复后 S 整体抬升，门槛会自然被踩到；如复算后 storm 带仍 RESOLVE=0，在报告中标注，勿自行降门槛。 |
| 4 | AskUserQuestion→ASK | **准**。显式工具优先，15s 启发式降为无显式信号时的后备。另：`ToolSearch→READ`。 |
| 5 | 换 storm 首卷 | **准**。启用 `4a0286c7`（308 事件/活跃 224min），更名 `storm.jsonl`；原多日文件退役归档。 |
| 6 | 报告与问卷修订 | **追认**你的两处改动（现实修正收敛一行、问卷改意图版），并再升级：问卷整体**废止**，由 §6 校准验收带自动判定接管；船长仅在 M2 探针阶段用耳朵行使否决权。 |

上轮"现实修正"#3（durationMs 优先）、#4（moment.t=结果到达时）、#5（EMA 窗口 30s）、#6（isSidechain 折叠 main 并计数）：**全部追认**。

---

## 2. 新 params.json（唯一事实源，全文替换）

```json
{
  "_source": "TAPE0 施工令 M1.5。较 v0.1 变更：verbWeights 重定、amplitude.failDefault 新增、decay 加倍、stuck 边沿化、adapter 增蒸馏与分段。",
  "stress": {
    "S0": 1.0,
    "verbWeights": { "READ": 0.12, "WRITE": 0.30, "RUN": 0.50, "SAVE": 0.60, "ASK": 0.0, "SPAWN": 0.30, "OTHER": 0.20 },
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
    "failDefault": 0.3
  },
  "release": {
    "testResolveMinS": 0.3,
    "testResolveFactor": 0.6,
    "saveFactor": 0.5
  },
  "decay": {
    "tauActiveSec": 120,
    "tauIdleSec": 300,
    "idleThresholdSec": 60,
    "pendingRunDripAfterSec": 30,
    "pendingRunDripPerMin": 0.02
  },
  "weather": {
    "up": { "OVERCAST": 0.25, "RAIN": 0.5, "STORM": 0.75 },
    "hysteresis": 0.1,
    "stormExit": 0.6
  },
  "companions": {
    "activityRateScale": 6,
    "wowWindow": 12,
    "wowSmoothingSec": 30,
    "idlePhaseSec": 120,
    "activityEmaSec": 30
  },
  "spring": {
    "up": { "zeta": 0.6, "omegaN": 33 },
    "down": { "zeta": 1.0, "omegaN": 8 }
  },
  "adapter": {
    "askTimeoutSec": 15,
    "doneSilenceSec": 600,
    "episodeGapMin": 30,
    "tagTestRegex": "test|jest|vitest|pytest|cargo test|go test",
    "tagBuildRegex": "build|tsc|webpack|vite build",
    "saveRegex": "git\\s+commit",
    "verbMapExtra": { "AskUserQuestion": "ASK", "ToolSearch": "READ" }
  }
}
```

架构师侧仿真备案：以上参数重放卡碟带样本，峰值 T=0.865（旧值 0.081），STUCK 边沿 1 次（旧逻辑 7 次）——量级与意图相符。

---

## 3. 新指令 · 蒸馏工序（本轮最重要的架构增项）

**动机**：原始 JSONL 含任意历史内容（密钥、片段、不可预知的敏感文本），既是隐私负担，也是引擎不需要的重量。引擎只需要事件骨架。

**指令**：adapter 新增 `distill` 工序——
1. 原始 JSONL **只在蒸馏时被读取一次**，产出 `*.tape.jsonl`（蒸馏带）：每行仅含 `t, verb, tool, outcome, m 的原料量(行数/秒/KB), durationMs, sig, errClass, episode, isSidechain 计数`。
2. `errClass` = 错误首行做归一化（抹路径/数字/hex）后的模板串，截断 60 字符——蒸馏带中**唯一**允许的文本字段；工具输入、输出正文、对话内容一律不落盘。
3. `scan` / `replay` / `live` 及一切下游（引擎、报告、探针、未来分享）**只消费蒸馏带**。`tapes/` 目录今后只存蒸馏带（仍在 .gitignore，谨慎为上）。
4. 蒸馏带自带 `meta` 首行：源文件哈希、蒸馏器版本、episode 切分表。

一举三得：隐私最小化；文件缩到千分之一量级、回放更快；蒸馏带天然接近"可分享形态"，为 v2 铺路。

---

## 4. 引擎逻辑修订（含签核的 schema 增项）

1. **会话分段**：同文件内空档 > `episodeGapMin`(30min) 切为独立 episode；每段发 `SESSION_START`/`DONE`；S、rep 窗口、卡碟状态跨段**复位**；scan 与报告按 episode 统计（"一卷带 = 一次连续坐下干活"）。
2. **卡碟改边沿触发**：每个 sig 维护卡碟态。同签名第 3 次出现（k≥2）→ 发 `STUCK_LOOP` 一次并进入卡碟态；卡碟态内同签名继续充能（rep 封顶照旧）但**不再重复发射**。退出条件：同 verb+tool 的 OK，或该 sig 在 repWindow 内无新击中 → 发 `STUCK_CLEARED`。带 test 标签的 RUN-OK 触发 RESOLVE 时，**清空全部卡碟态**（逐一发 CLEARED）。
3. **schema 增项（已签核，只增不改）**：`special` 联合类型新增 `'STUCK_CLEARED'`。除此以外协议一字不动。

---

## 5. 磁带名册操作

| 带 | 操作 |
|---|---|
| storm.jsonl | 启用 `4a0286c7`，先蒸馏后入册；附体检表（按 episode） |
| jam.jsonl | **重新扫描提名**：判据在原有"同签名 10min 窗内 ≥4 次"之上，追加 `活跃时长 ≥5min 且事件 ≥30`（现役样本仅 36 秒，太薄，仅够验探测器不够验叙事）。提名 3 卷附体检表，若上一轮候选中已有达标者可直接自选启用，报告注明即可 |
| smooth.jsonl | 不换卷，但**必须**在新参数下复跑并过验收带 |

一致性纪律：REPORT 中一切数字必须由 CSV/蒸馏带机器生成，禁止手工誊写（上轮 jam 带报告 FAIL=9 与 moments.csv 中 READ-FAIL=16 存在出入，本轮起杜绝此类漂移；若数字确实分属不同对象，须在报告中并列注明口径）。

---

## 6. 校准验收带（自动判定；全过 = 架构师签核生效，直接进 M2）

按**活跃时长**统计占空比；全部指标进 REPORT 的判定表。

| 带 | 指标 | 合格区间 |
|---|---|---|
| smooth | T<0.30 的时间占比 | ≥ 99% |
| smooth | STUCK_LOOP 边沿数 | 0 |
| storm | 峰值 T | [0.65, 0.92] |
| storm | RAIN+STORM 合计占空 | [15%, 45%] |
| storm | RESOLVE 次数 | ≥ 1 |
| storm | STUCK_LOOP 边沿数 | [3, 12] |
| jam | 峰值 T | [0.50, 0.90] |
| jam | STUCK_LOOP 边沿数 | [1, 3] |
| jam | 卡碟段内 T 走势 | 单调不减，直至 CLEARED 或段末 |

- **全绿** → 视为签核，直接执行 §8（M2），无需等待回传。
- **任一越界** → 停在 M1.5，出三带 REPORT ＋ 越界项清单 ＋ 你的归因猜想，等参数回传。禁止为凑指标自行改参数或改判据。

---

## 7. REPORT 格式 v3（在施工方 v2 基础上加四项）

1. **判定表**：§6 各指标实测值 + PASS/FAIL。
2. **天气占空比表**：CLEAR/OVERCAST/RAIN/STORM 各占活跃时长百分比。
3. **episode 分表**：多段文件逐段一行（活跃时长/事件/FAIL/峰值 T）。
4. **拐点抽检间距**：三大拐点两两间隔 ≥120s（同簇只取最大者）。
5. 保留：引擎账目抽检、paramsHash、蒸馏带 meta 哈希。问卷段落删除。

---

## 8. M2 令（探针，验收带全绿后执行）

按 SPEC §8 原样施工，补充三点：
1. 针吃 `StatePacket.needle`（引擎内弹簧输出），不得自行再加缓动。
2. 三音映射不变：WRITE-OK=拨弦、RESOLVE=和弦解决、STUCK_LOOP=跳针；跳针音**每个边沿一响**，收到该 sig 的 STUCK_CLEARED 前不得重复。
3. `live` 尾随按 episode 语义工作（长静默进 IDLE，新活动开新段）。
仍然禁止：一切美学样式、三音之外的声音、导出/分享功能、触碰用户配置文件、网络请求。

## 9. 交付清单（本轮结束时应存在）

- [ ] 蒸馏器 + 三卷蒸馏带（storm 新卷 / jam 新卷 / smooth）
- [ ] 新 params.json 生效，paramsHash 更新
- [ ] 卡碟边沿化 + STUCK_CLEARED + episode 分段的金测试各一条
- [ ] 三份 REPORT v3（含判定表）
- [ ] 判定全绿时：M2 探针可运行（`cli probe` 打开素面页）+ 一段文字描述实跑观感
- [ ] 更新后的 FEEDBACK.md（如有新的现实修正，照旧"规范说 X/现实是 Y/我做了 Z"）

（完）
