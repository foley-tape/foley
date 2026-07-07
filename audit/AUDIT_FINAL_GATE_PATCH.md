# AUDIT_FINAL → GATE.md 补丁提案（待架构师签核）

> 依据：`audit/AUDIT_FINAL_BOARD.md`（双盲终审交叉比对，锚 149ddea）。
> 性质：**提案·不自行改 GATE 正文**（GATE 拆闸权在架构师/船长）。以下为建议合入的闸门状态变更与新增前置，逐条附证据与一行修方向。

---

## A. 状态变更（现有闸）

### G1 安全 P1 清零：✅ 绿 → 🔴 **重开**
**理由**：双盲乙发现两处 C1/C2/C3/A1 之外的缺口：
1. **乙-F1【P1】未鉴权跨源 DoS**：`stage/serve.mjs:240` `decodeURIComponent` 在 244 行 try **之外**，畸形 `%`-序列（`/%zz`、`/%`）令异步处理器同步抛→未处理 rejection→Node v26 终止进程。跨源 `no-cors` fetch 直达、绕 PNA（rebind/点链接）恒生效。
   - **修**（一行级）：`decodeURIComponent` 包 try/catch 返 400（或把 240–243 并入既有 try，或加进程级 `process.on('unhandledRejection')` 兜底）。
   - **回归**：`golden` 加断言「serve 收畸形 %-路径返 4xx 且进程存活」。
2. **乙-F5【P2】原则②措辞名不副实**：§2 原则② 称 `listen(127.0.0.1)`「断 DNS-rebinding」——绑定只断局域网，rebind 由 Origin 白名单挡**写**，**读**面（`/today/{curve,moments}.csv` 等 GET）**零 Host 校验**（`GET / Host: evil.com`→200）。
   - **修**：加 Host 白名单闸（`Host ∈ {localhost:port,127.0.0.1:port}` 非白 403，一处兜全 GET）；订正 `:255` 与 §2 原则② 注释为「绑定断 LAN／Origin 断跨源写／Host 校验断 rebind 读」。

> G1 重开门槛：F1 修+回归绿、F5 的 Host 闸落地或经架构师裁为「读面已极小化、接受残留」并订正注释。

### G2 发布打包：🟡 就绪·保险栓在 → 🟡 **就绪·两处待补**
**理由**：
1. **甲-2【P1】§6.1「npm test 105/105 全绿」环境依赖**：该绿在**含私有 `tapes/` 的作者树**测得。6 条金测试（⑭/㉛/㊵/㊶/㊷/58）读 gitignore 掉的 `tapes/*.tape.jsonl`；**§6.2 步 3 的公开镜像（`git checkout --orphan`，不含 gitignored tapes/）与任何克隆者 → 6 红**。npm tarball 排除 `golden/` 故装包用户不受累，但公开镜像的 clone+test 会红、打脸「Engine sealed / 95 golden tests」。
   - **修**：5 个夹具以**脱敏合成骨架**入库（先零化 `episodes.startT/endT`＋换合成 `targetHash`——与 §G7 同源）或加 `pretest` 生成；使 clean checkout 绿。
   - **回归**：把「干净检出（无 tapes/）npm test 全绿」纳入发布前离线演练的**独立环境**复核（非仅作者树）。
2. **REHEARSAL-MANIFEST 已过期**：本次实测 tarball = **89 文件 / 914.9 kB**（§6.1 记 85 文件 / 905.5 kB）。delta 良性（新增 `stage/golden/*.cuts.json` ×5 ＋ `stage/fixtures/storm.*`，皆有意随包，实测无 tapes/音频/密钥/docs 泄漏）。
   - **修**：发布前重跑 `npm pack --dry-run` 刷新 `REHEARSAL-MANIFEST.md` 与 SHA，确认 4 文件 delta 仍为白名单内预期件。

> 注：甲-1（`private:true`＋名归属）经确认属 **G2 有意保险栓**，名 `foley` registry E404 可用、§6.2 runbook（publish 前置于镜像）已管住，**不重开 G2**——只需保 runbook 时序执行。

---

## B. 新增闸（本次 surfaced，建议入清单）

### G7 分享/导出脱敏闸：🔴 **红**（TR-1 真雷·双队收敛·发布前必处置）
**理由**：隐私正典把「安全形态」= `--redact`（金测试验证干净），但 **redact 之外三条路径全泄工作时段/仓库指纹，边界仅文案**——甲（夹具角度）＋乙（导出角度）双队独立收敛：
- 默认 `.tape.jsonl`：`t/useT/resolveT` 绝对 epoch＋`tool` 明文 MCP 名＋`sourceHash` 文件指纹（乙-F3）。
- dub `meta.json`：`createdAt`（绝对）＋`liveEpoch`（当日开工时刻）（乙-F3）。
- 导出 mp4：`mvhd/tkhd/mdhd.creation_time` = 出片墙钟秒（乙-F2；仓库 demo 已抹为 0，工具活路径不抹）。
- 蒸馏骨架夹具亦留 `startT/endT`＋`targetHash`（甲-5；与 G2 补夹具相互牵制）。

**修（择一，架构师裁）**：①分享/导出**默认脱敏**，「不脱敏」需显式开关；②导出前强制相对化时间＋哈希工具名＋抹 mp4 三 box（creation_time 钉 0，对齐仓库 demo 已抹口径）；③至少产默认带时 stderr 警示「含绝对时间＋明文工具名，分享前 `--redact`」。
**回归**：金测试断言「导出 mp4 creation_time==0」「默认带产出打分享前提示」。
**关联**：G7 的时间戳/哈希脱敏与 G2 的「补脱敏合成夹具」同源——一并解。

---

## C. 记分牌草案（合入后）

```
G1 安全 P1 清零        🔴 红   （乙-F1 未鉴权跨源 DoS；F5 纠正原则②——待 F1 修+回归、Host 闸/裁定）
G2 发布打包            🟡 待补 （甲-2 clean-clone 6 红→补脱敏夹具/pretest；REHEARSAL-MANIFEST 过期重跑 pack）
G3 唱片终裁落仓        ✅ 绿   （不动）
G4 M-T3 过庭           ✅ 绿   （不动）
G5 README 真话补丁     ✅ 绿   （残留 P3：Node≥23.6/errClass ASCII 口径宜进 Honest-limits，甲-3/乙-F6）
G6 公开镜像策＋重媒体  ✅ 绿   （注：镜像=orphan-clean 会触发甲-2 的 6 红，与 G2 同解）
G7 分享/导出脱敏       🔴 红   （TR-1 真雷·发布前必处置·新增）
```

**从「5 绿·0 红·0 阻·待人类扳机」→「G1/G7 红·G2 待补·拆闸前须清 3 项 P1（F1 / 甲-2 / TR-1）」。**
其余（F4/F7 P3 安全、视觉九条 P2/P3、甲-4/甲-6 P2）入 v1.x 或冰箱，不拦 G2。

---

## D. 落地清单（发布前必修 = 拆闸前置）

- [ ] **F1**：`serve.mjs:240` decodeURIComponent 包 try/catch → 400；加进程级 unhandledRejection 兜底；金测试断言。（G1）
- [ ] **TR-1/G7**：分享/导出脱敏（时间相对化＋工具名哈希＋mp4 creation_time 抹 0）；金测试断言。（G7）
- [ ] **甲-2**：脱敏合成夹具入库或 pretest 生成，使 clean checkout npm test 全绿；独立环境复核纳入演练。（G2）
- [ ] **F5**（P2，架构师裁必修/v1.x）：GET 面 Host 白名单闸＋订正注释。（G1）
- [ ] **发布前**：重跑 `npm pack --dry-run` 刷新 REHEARSAL-MANIFEST（89↔85 delta 复核）；按 §6.2 时序 publish 前置于公开镜像。（G2）

（提案完；请架构师逐条签核后合入 `docs/launch/GATE.md`。全文证据见 `AUDIT_FINAL_BOARD.md` 及两队 `audit/final-{甲,乙}/`。）
