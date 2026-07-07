# tapes/ · 五卷标准带（脱敏合成骨架）

这五卷 `.tape.jsonl` 是引擎的**校准夹具**（storm／smooth／busy／jam／silence），
以 **G7 脱敏骨架**形态入库（M2.6 P1-③，甲-2 处置）：

- **时间相对化**：所有 `t/useT/resolveT/episodes.startT/endT` 为相对首事件的毫秒偏移（无日历/时钟指纹）；
- **非内建工具名加盐哈希**（`t` 前缀）、`errClass/sig/targetHash` 每带随机盐重算（等值关系保留，明文不可反演）；
- **`sourceHash=redacted`**（不指纹化源文件）。

与 `cli distill` 的**默认产物同一把尺**（`adapters/claude-jsonl/distill.ts` 的 `redactResult`）。

## 等价性证词（为什么脱敏骨架可以当校准夹具）

脱敏是**等值保持**的（哈希双射式重标签＋时间平移），引擎证词逐字节不变——M2.6 实测：

- 五带 `replay` 的 curve.csv **除 t 列外全列逐字节一致**（S/T/A/wow/needle/phase/weather/pendingAsk）；
- moments.csv 结构列（verb/outcome/m/tags/special）逐字节一致；
- `stage/golden/*.cuts.json` 重冻后**每带仅 tapeHash 一行变动**，全部段边界/速度/角色四档全同；
- 五带判定表全绿不变（storm 峰值 T=0.915 等）。

## 家规

- **原始带（含绝对时间戳＋明文工具名）永不入 git**——作者本机真身在 `tapes/raw/`（已 gitignore）。
- 想自己蒸馏新带：`node cli/index.ts distill <原始.jsonl> tapes/<名>.tape.jsonl`（默认即脱敏）；
  `--raw` 只限本机调试，产出勿放进本目录提交。
- 改带即改校准基准：动这五卷前先读 `docs/canon/` 与 `sweep.json` 的冠军纪律。
