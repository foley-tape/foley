# 大审计器具箱（常设 · audit/tools/）

> 立于第三号手令 **戊-2**（审计庭即刻开工件）：「采纳勘验的 RMS 器具为常设回归仪，纳入大审计器具箱。」
> 器具箱纪律：**做的作数、运行作数**；机器代理只管回归/守门，**人耳/真人终审权不让渡**（验收最高法）。

## 1. `rms_probe.mjs` — master 总线 RMS 机器代理

**是什么**：浏览器内向音频引擎 master 总线旁挂 `AnalyserNode`，实测 RMS（＋AudioContext 状态），
为一切「出声/静音」结论提供机器证据。判据即数据。

**出身**：提取自 RECON 勘验 `audit/recon/repro/recon.mjs`（§二.B3）＋ `probe2.mjs` 的 AnalyserNode 探针，
审计庭参数化为常设器具（锚 main=8c7a198）。

**主用例**：轨甲 live 声验收线——「live 模式手势后 <window> 秒内 master 总线实测 RMS 超阈」。
`firstCrossMs` 字段即「多少毫秒内首次越阈」，直接对齐 60s 验收语义。

**RECON 标定基线**（锚 8c7a198，供阈值参考，**勿硬编成验收线**——验收线归轨甲/架构师终定）：

| 条件 | rmsAvg | rmsPeak | 备注 |
|---|---|---|---|
| 回放 busy · 唱片&床音双缺席（合成退路） | 0.066 | 0.091 | 织体退路真在响 |
| 回放 busy · 唱片在位（Still Life 上桥） | — | 0.139 | 唱片层真上桥 |
| **live 手势后（B3 命门·未修）** | — | — | `sound===undefined` → `present:false` |

> 默认 `--threshold 0.02`：保守地板，明显高于数字静默、低于 RECON 合成基线 0.066，用于「有信号 vs 死寂」的守门；
> 轨甲交付后由架构师据实测分布终定验收阈。

**依赖**：`playwright-core` ＋ 一个 chromium（自动探测 `~/Library/Caches/ms-playwright/chromium-*`，或 `--exe`）。
**已局部装备**（第四号手令 戊「审计器具依赖限装审计工具局部·不入主包」）：本目录自带隔离 `package.json`＋
`node_modules/playwright-core@1.61.1`（12M，与主包 `/Users/shadow/tape0/package.json` 物理隔离，`node_modules/`
被 .gitignore 挡）；其期望 chromium 修订号 **1228** 与缓存现货 `chromium-1228` **精确匹配**，无需再下浏览器。
点火实证（about:blank）：launch→nav→evaluate→screenshot→close 全通（browser 149.0.7827.55，663ms）。
`node` 从本目录解析 `playwright-core`，故运行 `rms_probe.mjs` 须在本目录内（或 `cd audit/tools`）。

**用法**：
```bash
# 1) 另起被测 serve（回放路，HEAD 源）：
node stage/serve.mjs 4174 --replay-only
# 2) 挂表：
node audit/tools/rms_probe.mjs --url http://127.0.0.1:4174/ --tape busy --window 60 --threshold 0.02
```

**退出码**：`0`=窗口内 rmsPeak 越阈（出声）｜`1`=在场但未越阈/静｜`2`=装置或前置失败
（serve 未起／`present:false`（sound 缺席）／chromium 缺／页错）。
**输出**：单行 JSON（`present/ctxState/record/masterPath/rmsPeak/rmsAvg/firstCrossMs/samples/pass`）。

**总线重构韧性**：`masterPath` 逐一试探 `engine.nodes.master → engine.master → sound.master → engine.bus →
engine.out` 并回报命中路径——轨甲「总线一元论」重构迁移 master 节点后，本器具优雅降级、只需按报错补候选路径。

**功能佐证**：RECON 于同锚 8c7a198 已实跑本探针原型并得上表基线（`audit/recon/RECON_REPORT.md` §二.B3、
`shots/03-replay-busy.png`）。本常设版为其忠实提取，`node --check` 净、缺依赖/缺 chromium 均 exit 2 优雅退。
**`playwright-core` 已局部到位（见上）**；弹药备足，**待 己-1 合丙＋己-2 甲 rebase 后**，即可对 live 路
（轨甲交付后）行 60s 验收挂表（己-3）。

## 2. 现有 P1 复现脚本（审计遗嘱 · 脚本即那双眼睛）

四颗 M2.6 P1 的复现脚本现居 **仓根 `repro/final-{甲,乙}/`**（双盲两队全文报告随 `d0f431d` 并入主树）：

| P1 | 脚本 | 判据 |
|---|---|---|
| ②F1 DoS ＋ ④F5 Host | `repro/final-乙/M2.6_regress_serve.sh` | F1→400 且进程存活；F5→非白 Host 403（rc=0 过） |
| ②F1（原始攻击） | `repro/final-乙/serve_dos_malformed_percent.sh` | **rc=1＝已修**（未复现）；rc=0＝DoS 仍活 |
| ①TR-1/G7 默认脱敏 | `repro/final-乙/M2.6_regress_distill.mjs` | 默认即脱敏、`--raw` 被警示（rc=0 过） |
| ①TR-1/G7 mp4 抹钟 | `repro/final-乙/M2.6_regress_mp4scrub.mjs` | 三盒 creation/modification 钉 0（rc=0 过） |
| ③甲-2 干净克隆 | `repro/final-甲/01-npm-test-on-clone.sh` | 6 红↔补带全绿（示病）；HEAD 干净 worktree `npm test` 全绿（示修） |

> **待整编**（第三号手令 丁-轨丙）：四 P1 复现脚本 ＋ RECON 两脚本应收编入 `audit/repro/`；**未做**，
> 现仍在仓根 `repro/`。审计庭本轮据实使用现居位置。

## 3. 历史审计复现档（只读留痕）

- `audit/night1/**/repro/` — NIGHT-1 红队三向量（隐私/数学/假标签/健壮性）。
- `audit/night2/repro/` — NIGHT-2 冷读（lufs 标定、solver 天花板、xss、normErr、probe coreDegreeHz、畸形 jsonl 语料）。
- `audit/recon/repro/` — RECON 阶段〇（`recon.mjs` 实屏＋声证、`probe2.mjs` 唱片上桥复测）。
