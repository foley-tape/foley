# 协议 schema v1（冻结，只增不改）

来源：`TAPE0_SPEC_v0.1` §7。类型定义见 `protocol/index.ts`（唯一事实源）。

## 冻结纪律

- 字段名即十年后的地基。**任何改动需架构师签核，且只许新增**（§12 明确：协议 schema 的改动是"按现实实现＋汇报记录"原则的唯一例外）。
- 单 agent 时代 `agent = "main"`；字段留位即是多轨的地基。

## 总线规则（§7）

- `StatePacket` 以 **20Hz 连续广播**。
- `MomentEvent` 可被渲染层做节拍量化，**唯 `ASK` 动词与 `DONE` / `ASK_CLEARED` 走直通道不排队**（守时优先于乐感）。
- 渲染器只读、只做字段→参数映射、互不相识。

## 三种包

| kind | 用途 |
|---|---|
| `moment` | 离散元动作（六动词×结果×幅度＋标点） |
| `state` | 连续仪器状态（S/T/A/wow/needle/phase/weather/pendingAsk） |
| `lyric` | assistant 文本独白，低优先，只供未来字幕，**不驱动任何仪器** |

## 字段来源分工

- `verb` / `outcome` / `m` / `tags` / `sig` —— 适配器从日志计算（§4、§5）。
- `special` STUCK_LOOP / RESOLVE —— **引擎判定**（§6），非适配器。
- `special` SESSION_START / DONE / ASK / ASK_CLEARED —— 适配器启发式（§5）。
- `S` / `T` / `A` / `wow` / `needle` / `phase` / `weather` —— **引擎输出**（§6，M1）。
