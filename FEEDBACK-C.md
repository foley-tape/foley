# FEEDBACK · 轨丙（安全与介质基建）· M2.6 三轨并行

> 施工方：轨丙（丙）｜分支 `track/c-security`（worktree `/Users/shadow/tape0-c-security`）｜锚 main=`8c7a198`
> 日期：2026-07-07｜依据：第三号手令丁-轨丙／乙-②＋第二号手令增补三／增补四＋派生手册§3 轨丙
> 状态：**三件全交付·干净树 128/128 全绿·候审计庭红队复签＋架构师按庚序合入**
> 判据即数据：证据随附，法官先于旋钮。

---

## 一句话

轨丙三件全落：**B4 微 PR**（打包态声桥粮道，最先合入解阻轨甲 rebase）＋**脱敏契约 v1 冻结广播**（解阻轨乙卡片脱敏）＋**audit/repro/ canonical 兵器库**（红队复验遗嘱）。未碰画面/卡片/音频渲染，围栏零越界。

## 二、交付物与证据

### ① B4 修复（主件·微 PR·`c69d53a`）—— 最先合入 main
**雷**（RECON 新雷，乙-②归轨丙，性质=从 $HOME 向浏览器供文件的安全敏感面）：npm 包 files 白名单排除
`sound/records/*.mp3`＋`sound/assets/*.wav`（真身走 Releases）；用户 `foley records fetch` 落
`~/.foley/{records,assets}/factory/`，但 serve 静态根只见 repo → **打包态页面声桥一律 404**
（dev 被 vendored mp3 掩蔽故此前漏网；本机工作树因 mp3 gitignored 天然复现打包态）。

**修**（`stage/serve.mjs` +49/-1）：`/records/**`、`/sound/assets/**` 于 repo 缺件时回退
factory 缓存（解析顺序 repo 真身 → `~/.foley/**/factory/`）。沿用既有 Host/DoS 闸，另叠三闸：
- ① 只读（readFile）；② 路径已 normalize＋decodeURIComponent（穿越序列折叠出前缀）；
- ③ **文件名白名单**（catalog.json/manifest.json 之 file 字段确切扁平名）＋落盘目录 fence 前缀校验。
- 命门＝白名单：factory 目录用户可写，只有清单在册的扁平名才放行——挡任意读/穿越/投毒件。

**证据**（`audit/repro/b4_probe.mjs`，自足起 serve＋HOME 造 factory）：

| 探测 | before（未修） | after（已修） |
|------|--------|--------|
| `/records/saturation.mp3`（白名单唱片·repo 缺 factory 有）| **404** | **200**＋factory 字节 |
| `/records/evil.mp3`（白名单外投毒件·factory 有）| 404 | 404（白名单闸） |
| `/records/../../SECRET.txt`（穿越·HOME 有秘密）| 404 | 404（HOME 秘密不泄）|
| `/sound/records/catalog.json`（元数据入包）| 200 | 200 |

**回归**：`golden/b4.factory.test.ts` ×7（happy＋白名单外拒＋factory 亦缺诚实 404＋三闸穿越＋源码卫兵＋repo 命中不误伤）。
**姊妹核对**（丁-轨丙）：`foley records status` 覆盖床音（assets 三行在场✓）；`npm pack --dry-run` 排除 mp3/wav、纳 catalog/manifest/records.manifest✓。

### ② 脱敏契约 v1 冻结＋广播（首日交付·`39aaed9`）—— 解阻轨乙
增补三.1 接口先行：脱敏是分享安全的单一大脑，轨乙卡片脱敏**调用本契约、不得自造口径**。
中枢 `redactResult(d, salt?)` 早已实现，本交付＝**冻结＋广播**：
- `docs/canon/REDACTION-CONTRACT.md`：签名／三向量堵漏（errClass/工具名/时间戳）／内建工具白名单／
  **轨乙集成指南 §5**／诚实边界（最小化非零明文）／v1 只增不改变更协议。
- `golden/fixtures/redaction-contract.expected.jsonl`：固定盐 `FOLEY-REDACT-CONTRACT-v1` 下
  `raw→distill→redact→serialize` 逐字节冻结带（1914B/7 行；命名避 `*.tape.jsonl` 忽略规则）。
- `golden/redaction-contract.test.ts` ×5：金夹具冻结（逐字节）＋确定性＋盐真起效＋不变式机器可查＋内建白名单源码卫兵。
- **广播语**：轨乙可即刻按 §5 集成——默认蒸馏带已是脱敏形态，卡片投影默认带字段**无需再脱敏**；
  持未脱敏 `DistillResult` 时调 `redactResult(d)`；卡片含蒸馏带之外字段时**回轨丙扩契约**（勿自造）。

### ③ audit/repro/ canonical 复现兵器库（`596e19f`）—— 红队复验遗嘱
增补四.1：每颗雷复现脚本入库 audit/repro/，原会话若不存新终端跑同一脚本即可复验。
- 四 P1 脚本 consolidated 自 `repro/final-{甲,乙}/`（**扁平放置**——脚本假定 2 级 `../..`＝仓库根，
  audit/repro/ 恰 2 级原样即跑，已实证 distill 脚本从新家跑绿；**原 working 副本保留未动**，不断报告引用）。
- 勘验两脚本（`recon.mjs`/`probe2.mjs`）收编自 `track/recon`（浏览器 E2E，遗嘱式存档，依赖 playwright＋活 serve）。
- B4 新增 `b4_probe.mjs`（自足 6/0 雷已排）。
- `_index.md`：雷→脚本→证什么→修后期望→跑法 的红队复验地图。
- **不重做四 P1**（已 HEAD 复签戊-1），只立 canonical bin。

## 三、验收对账（三轨物理边界）

- 围栏：仅动 `stage/serve.mjs`＋`golden/`＋`docs/canon/`＋`audit/repro/`——**未碰**画面 live／卡片层／音频渲染。
- 干净树 `node --test golden/**`：**128/128**（116 基线＋7 B4＋5 契约），零 fail/skip。
- 分支 diff：19 文件 +1018/-1。

## 四、合入次序（庚·候审计庭签章后由人类执行）

```
# 1) B4 微 PR 最先合入（解阻轨甲 rebase）—— 候乙红队复跑 audit/repro/b4_probe.mjs 签「雷已排」
# 2) 脱敏契约 —— 冻结件，随后合入
# 3) 轨乙、轨甲各自完工 PR（审计庭签章后）
git -C /Users/shadow/tape0 merge --no-ff track/c-security   # 三 commit 一并（B4→契约→repro）
# 或按 commit 粒度分步：c69d53a(B4) → 39aaed9(契约) → 596e19f(repro)
```
**合入 main 哈希**：候合入（未合入 main＝未完成，增补一.4）——合入后回填此处。

## 五、给架构师的观察（卡外·不自救·增补四.2）

1. **`.worktreeinclude` 缺失**：增补一.3 令项目根声明带入 env/本地配置，但 main 无此文件（新 worktree 无 node_modules；本轨零依赖运行时不受阻，但轨甲/乙若需本地配置会踩空）。**卡外，仅上报**。
2. **主检出 untracked 大文件**：`stage/fixtures/captain.{curve,moments}.csv`（13MB）在主检出未提交——B8 素材，终裁在船长（乙-③默认删除）。**非本轨，仅记录**。
3. **repro/final-* 与 audit/repro/ 并存**：为不断审计报告的路径引用，本轨**复制非移动**；若架构师愿 dedup，移除 repro/final-* 为 trivial 后续（audit/repro/ 自足）。
4. **RECON 两脚本非 path-portable**：hardcoded 绝对路径＋playwright 依赖，收编为遗嘱原样存档（_index 已注异地跑需改 SHOTS 路径）。

## 六、提交给架构师的结果（由主理人转呈）

**三件全绿交付于 `track/c-security`（c69d53a/39aaed9/596e19f，锚 8c7a198），干净树 128/128。**
请架构师：(a) 令乙红队复跑 `audit/repro/b4_probe.mjs` 签 B4「雷已排」；(b) 按庚序批 B4 微 PR 最先合入
（解阻轨甲 rebase）；(c) 认脱敏契约 v1 广播（轨乙即可集成）。合入后回填 main 哈希。
