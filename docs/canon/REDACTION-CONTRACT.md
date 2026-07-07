# 脱敏契约 v1 · REDACTION CONTRACT

> 签发：轨丙（安全与介质基建）· 2026-07-07
> 依据：《派生手册》§3 轨丙（分享安全的单一大脑）＋《第二号手令》增补三（接口先行令）＋《第三号手令》丁-轨丙（首日交付：脱敏契约冻结）。
> 状态：**v1 冻结·已广播**。轨乙的卡片脱敏一律调用本契约编码，**不得自造口径**。

---

## 0. 一句话

全系统「可分享形态」只有一个来源：`redactResult`。凡要把会话派生物（磁带、卡片、导出）交到本机之外，
先过这把尺；谁都不许另写一套哈希/相对化/白名单。

## 1. 中枢签名（唯一入口）

```ts
// adapters/claude-jsonl/distill.ts
export function redactResult(d: DistillResult, salt?: string): DistillResult
```

- **输入** `d`：一条蒸馏带（`DistillResult`＝`{ records: DistilledMoment[], meta: DistillMeta }`，见 `adapters/claude-jsonl/parse.ts`）。
- **`salt?`**：可注入盐。**缺省＝每带随机**（堵「已知明文→哈希」字典反演）；金测试/契约冻结用固定盐。
- **输出**：同结构的**已脱敏**带（纯函数，不改入参，不碰 fs/网络）。

上层便捷入口（fs 侧，默认即脱敏）：

```ts
export function writeDistilled(rawPath, outPath, params, redact = true): DistillResult  // 默认 redact=true
// CLI：node cli/index.ts distill <raw.jsonl> <out.tape.jsonl>      → 默认脱敏
//      node cli/index.ts distill <raw.jsonl> <out.tape.jsonl> --raw → 原始带（stderr 强制隐私警示）
```

**默认形态即安全形态**（M2.6 G7/TR-1，架构师裁定）：产带默认脱敏，「不脱敏」翻转为显式 `--raw`。

## 2. 三向量·堵漏清单（契约条款）

脱敏对经对抗测试确认的三条泄漏向量各下一刀：

| # | 向量 | 明文形态 | 脱敏后 | 变换 |
|---|------|----------|--------|------|
| ① | **errClass** | 错误首行归一化文本（默认带唯一文本输出字段） | `e` + 加盐 FNV | `errClass ? 'e'+h(errClass) : null` |
| ② | **工具名** | 明文工具名（含 MCP 自定义名，暴露仓库/工作流身份） | 内建**保留**；其余 `t` + 加盐 FNV | 见 §3 白名单 |
| ③ | **时间戳** | 绝对 epoch（反推日历/时钟/工作时段） | 相对首事件偏移 | `t - firstT`；`firstT→0`；`sourceHash→'redacted'` |

连带加盐重算：`sig`（`s`+h）、`targetHash`（h）、`meta.stats.unknownTools` 的**键**、`episodes.startT/endT`、`lastT`。
`meta.distiller` 署名追加 `+redact`（下游可辨形态）。

**盐语义**：`h(x) = fnv1a(salt + '|' + x)`。同带一盐；换盐则所有加盐字段全变（契约测试 case 3 执法）。

## 3. 内建工具白名单（②的保留名单·契约稳定面）

以下工具名**无隐私**，脱敏时**保留明文**（可读性留给自己人）；**其余一切**（含 MCP 自定义工具）加盐哈希：

```
Read Grep Glob WebFetch WebSearch NotebookRead
Edit Write MultiEdit NotebookEdit Task Agent Bash
AskUserQuestion ToolSearch  （及空串 ''）
```

改这份名单＝改契约 → 须过架构师（源码卫兵测试盯防私自增删）。

## 4. 金夹具（冻结凭据）

- **输入**：`golden/fixtures/unknown-tool.jsonl`（内建工具＋自定义 `FrobnicateWidget`＋绝对 2026 时戳＋一处 `is_error`）。
- **固定盐**：`FOLEY-REDACT-CONTRACT-v1`。
- **期望带**：`golden/fixtures/redaction-contract.expected.jsonl`（逐字节冻结；命名避开 `*.tape.jsonl` 忽略规则——它是合成·已脱敏的金夹具，非会话真带）。
- **执法**：`golden/redaction-contract.test.ts` —— 固定盐下 `raw→distill→redact→serialize` 必逐字节等于期望带。
  redaction 逻辑任何漂移即打破本测，强制走架构师复核。

## 5. 轨乙集成指南（卡片脱敏怎么调）

1. 卡片数据一律**从蒸馏带派生**（架构：下游只吃蒸馏带）。默认蒸馏带**已是脱敏形态**——
   若卡片直接投影默认带的字段，**无需再脱敏**（已在册）。
2. 若卡片持有**未脱敏**的 `DistillResult`（如从 `--raw` 或内存态构造），分享前调 `redactResult(d)`（缺省随机盐）。
3. 卡片若含蒸馏带**之外**的字段（新结构），**不要自己写哈希/相对化**——回轨丙扩契约（增补三.1／卡壳协议）。
4. `--raw` 是「仅限本机调试」逃生阀；卡片默认路径**永不**走 `--raw`。

## 6. 诚实边界（契约不吹的牛）

这是**最小化**，**不是「零明文保证」**（见 SPEC 附注／代码注释）：
- `errClass` 归一化尽力抹凭据/路径/邮箱/token/数字，但**中文业务词等不在 ASCII 正则边界内**，可能残留（非 P1 健壮性单，NIGHT-2 在案）。
- FNV 非密码学强度——够挡字典反查，非防定向爆破。
- 故：**仍不建议外传未经人工过目的带**。契约兜的是「默认不裸奔」，不是「绝对无痕」。

## 7. 版本与变更协议

- **v1 冻结**：签名与三向量口径**只增不改**（增补二.2 精神）。
- 破坏性变更（改算法/改白名单/改字段）：**停工上报架构师**，版本升 v2，同步更新期望带＋本文档，不得先斩后奏。
- 契约测试（金夹具冻结＋不变式＋源码卫兵）是变更的机械闸：绿灯才算没动口径。

---

*本契约与代码同真：签名/逻辑以 `adapters/claude-jsonl/distill.ts` 为准，本文档记「为什么与怎么用」。冲突处以代码＋契约测试为准，并即刻回修本文档。*
