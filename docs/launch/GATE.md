# GATE · foley 发布闸门清单（M2.4 §B.4）

> 轨道：**Track-RELEASE**。性质：**只备不拆**——本文件是 `private:true` 拆除、`npm publish` 之前必须逐项变绿的前置清单。
> 谁拆闸：架构师/船长。任何一项红，闸不拆。
> 末次更新：2026-07-06，M2.4 §B 全轨收口（安全批＋真话批＋重媒体）后。

---

## 0. 一句话现状

**G1 安全 P1 清零**＋**G2 发布打包已修**（唯 `private:true` 候拆）＋**G5 README 真话批与门脸账已补**（绿）＋**G6 重媒体迁 Releases＋公开镜像策已定**（绿）。**当前 4 绿 1 半 1 红**：余 **G2 private 总闸**（候 G3/G4 全绿）、**G3 唱片终裁名单**（候船长，§A 管道已备）、**G4 M-T3 过庭**（§C 已交付候庭）。

---

## 1. 拆闸前置清单（六闸）

| # | 闸门 | 状态 | 证据 / 负责轨 |
|---|---|---|---|
| G1 | **安全 P1 清零** | ✅ **绿** | C1 XSS（X-1）／C3 写盘鉴权（W-1＋令牌＋W-3）／C2 崩溃（长度守卫）／A1 邮箱 PII 全修；`golden/night2.security.test.ts` 22 条回归在册，全套 105/105。详见 §2。RELEASE 轨。 |
| G2 | **发布打包** | 🟡 **半绿** | shebang✓／version 0.1.0✓／LICENSE✓／engines >=23.6✓／bin chmod 100755 入库✓（均 HOTFIX `597daa9`）。**唯余 `private:true` = 本清单总闸**（拆它即等于宣布 G1–G6 全绿）。RELEASE 轨。 |
| G3 | **唱片终裁落仓** | 🟡 **半绿** | 落仓管道（`scripts/pack-records.mjs`）＋PROVENANCE 模板＋淘碟指南已备（§A `e774c89`）。**候船长终裁出厂名单**即落仓（当日）。血统条款（§0.1）：内置唱片必须人类制造。§A Track-SOUND。 |
| G4 | **M-T3 过庭** | 🟡 **半绿** | M-T3 音画合龙**已交付**（§C `be619bb`；AV 同步影子 storm Δ16.8ms／jam Δ0.6ms ≤1 帧绿；dub.meta 增 audio 段）。**候复核庭一场**（§0.8：M-T3 必过庭）。§C Track-STAGE。 |
| G5 | **README 真话补丁** | ✅ **绿** | README 双份真话批（§B.2）：Quickstart 改「从源码跑」＋`npx` 候发布诚实标注；测试数**脚本注入**（`scripts/sync-readme.mjs`＋`<!--test-count-->` 标记＋`prepublishOnly --check` 防漂）；Sound/Status/Privacy/License 全对齐现实。冷读 17 条门脸项逐条见 §3、执行见 §5。RELEASE 轨。 |
| G6 | **公开镜像策＋重媒体** | ✅ **绿** | 重媒体（§B.3）：M-T2 三支 62MB 接带移出树（本地保留＋指纹清单 `RELEASES-MANIFEST.md`）＋`.gitattributes`＋`check-heavy-media` 再入闸（>5MB 拦截实测）。公开镜像策 §0.5 **已定**：发布日以干净历史开公开镜像、私库存全史——**历史清史于建镜像时执行**（含祖父豁免件）。执行见 §5。 |

**拆闸动作（G1–G6 全绿后）**：删 `package.json` `"private": true` → 定 `files` 白名单（挡 `runs/`、私有 `tapes/`、`docs/records/` 重媒体出 tarball）→ `npm run sync:readme && npm publish --dry-run`（`prepublishOnly` 已自动跑真话 `--check`＋全测）→ 建干净历史公开镜像（清史）→ 冷读者复攻 README 每一行。

---

## 2. G1 安全 P1 清零 · 本会话执行明细

照 M2.4 §0.6 五原则（原则约束凌驾方案标签）：

| 原则 | 落点 | 做法 | 回归测试 |
|---|---|---|---|
| ① URL 参数不经校验不入 DOM/路径 | `stage/js/main.js`；`stage/serve.mjs` | tapeName 白名单 `[^\w-]`剥离；save/save-bin 落盘名 `safeStem`（折叠 `..`、不以 `.`/`-` 起头） | `C1/§0.6.①`、`§0.6.① save-bin 穿越` |
| ② serve 只绑 127.0.0.1 | `stage/serve.mjs` | `listen(port,'127.0.0.1')`，断局域网/DNS-rebinding 直写面 | serve 集成全绿于 127.0.0.1 |
| ③ 写盘端点每次启动随机令牌 | `stage/serve.mjs`＋`stage/js/dub.js` | 启动 `randomBytes` 令牌注入 `<head>`；三处写盘 POST 回带 `X-Dub-Token`；缺/错令牌 403 | `③ 令牌注入`、`W-1 无令牌→403` |
| ④ save-bin 与 save 同刀清洗 | `stage/serve.mjs` | `kind` 扩展名白名单（非白→`bin`）；`tape` 同 `safeStem` | `§0.6.④ kind 非白→.bin` |
| ⑤ 攻击脚本转回归金测试 | `golden/night2.security.test.ts` | XSS 源守卫＋C2 巨型行＋A1 11 类 PII＋C3 鉴权/清洗，22 条 | 全绿 |

**额外（X-1 核心）**：`main.js` boot 错误从 `insertAdjacentHTML(${err})` 改 `textContent` —— `?tape=` 注入的 `<img onerror>` 只作文本，XSS sink 根治。
**C2**：`adapters/claude-jsonl/parse.ts` `normErr`（首行截 8KB 再入正则）＋`sanitizeToken`（>256 直判 TOKEN）——10MB 单行从 99%CPU 挂死变 1ms 秒回，`incremental.ts`（live tail）同守卫覆盖。
**自述复攻**：serve 集成测试真起服务器验证——无令牌 403、跨站 Origin 403、越权 kind 落 `.bin` 不穿越、授权写盘落 `runs/dubs/`。

**残留（非 P1，未拦闸）**：normErr 对**纯中文业务词**（如「财务系统」）不抹——ASCII 正则设计边界，非凭据/PII，记 GATE 备注候产品定性；`--redact` flag 位置错放致 ENOENT 裸栈（冷读 #7）归健壮性单。

---

## 3. 冷读者 17 条 → 闸门映射（audit/night2/COLD_READER.md）

| 冷读 # | 主张 | 归闸 | 现状 |
|---|---|---|---|
| 1 | `npx foley` 三重破产 | G2/G5 | ✅ shebang/version 已修；README 诚实标注「未发布，从源码跑」；private 候拆（G2） |
| 2 | "finds recent session and plays" 未实现 | G5 | ✅ Quickstart 改指 `node stage/serve.mjs`（deck live 于最近会话，真话） |
| 3 | "No config" 半真（四步手工管线） | G5 | ✅ 改「no account/telemetry, offline」，删 no-config 过度承诺 |
| 4 | `replay` 语义失实（吃蒸馏带非 session） | G5 | ✅ 标「replay `<tape>` → REPORT（an analysis, not playback）」 |
| 5 | engines node>=20 与裸 .ts 矛盾 | G2 | ✅ 已修 >=23.6（README Quickstart 亦注） |
| 6 | "never stored" | G1/G5 | ✅ A1 PII 修＋README 改「redacted error class」诚实口径 |
| 7 | `--redact` 藏着＋flag 位置崩 ENOENT | 健壮性 | README 已提 privacy gate；flag 错位 ENOENT 仍开→健壮性单 |
| 8 | 仪表照 8MB 压进仓 | G6 | 仪表照各 <5MB（祖父豁免）；62MB 接带已迁，前向闸挡再入 |
| 9 | 白皮书链接 | — | ✅ 在位 |
| 10 | "MIT" 无 LICENSE 文件 | G2 | ✅ 已入库（README 加 LICENSE＋CC0 音频指针） |
| 11 | "Engine sealed v0.1.0" vs version 0.0.0 | G2 | ✅ 已对齐 0.1.0 |
| 12 | "38 golden tests" 过时 | G5 | ✅ 脚本注入实数（`sync-readme.mjs`，prepublishOnly 防漂） |
| 13 | "Three sounds" 过时 | G5 | ✅ 改「foreground cues＋aging lo-fi bed（records in）」 |
| 14 | 英文 README／全中文 CLI 断层 | G5 | ✅ Quickstart 注明「CLI output currently Chinese；deck wordless」 |
| 15 | Status "Live mode wiring" vs help 已有 live | G5 | ✅ Status 改「deck live or replay」＋trailer export✓；🚧 仅余 multi-track/hosted/npx |
| 16 | scan 教的 `distill … tapes/…` 裸 ENOENT | 健壮性 | README 不再教该崩命令；distill 不建目录的底层 bug 仍开→健壮性单 |
| 17 | clone 即脏（bin chmod） | G2 | ✅ bin 100755 入库，clone 不再脏 |

**门脸账总评**：冷读 17 条里 **13 条 README 层已补真**（#1–6,8,10–15,17）；余 2 条属**健壮性**（#7 `--redact` flag 错位崩、#16 distill 不建目录）——非 README 谎言而是代码兜底，转健壮性单，不拦 G5。#9 本就在位。

---

## 4. 记分牌

```
G1 安全 P1 清零      ✅ 绿   （C1/C2/C3/A1 全修 · 22 条回归 · 全套绿）
G2 发布打包          🟡 半绿 （四件套已修 · private:true 候拆＝总闸，候 G3/G4）
G3 唱片终裁落仓      🟡 半绿 （管道＋指南＋PROVENANCE 已备 · 候船长名单）
G4 M-T3 过庭         🟡 半绿 （§C 音画合龙已交付 AV≤1帧 · 候复核庭）
G5 README 真话补丁   ✅ 绿   （双份真话批 · 测试数脚本注入 · 冷读 13/17 补真）
G6 公开镜像策＋重媒体 ✅ 绿   （62MB 迁 Releases＋指纹＋再入闸 · 镜像策 §0.5 已定）
```

拆闸条件：G1–G6 全绿。当前 **4 绿 · 3 半（G2/G3/G4）· 0 红**。
G2 是总闸，机械上待 G3（船长唱片名单）＋G4（M-T3 过庭）落定即可拆。

---

## 5. G5 / G6 执行明细（M2.4 §B.2 ＋ §B.3）

**G5 · README 真话批**（`README.md` / `README.zh.md`）：
- Quickstart：`npx foley` → 「未发布，从源码跑」三行（`git clone`＋`npm install` Node>=23.6＋`node stage/serve.mjs`）；replay 标注「分析非播放」。
- 测试数：`<!--test-count-->` 标记 ＋ `scripts/sync-readme.mjs`（数 golden 的 test/it 定义，就地注入）；`npm run sync:readme` 手动、`prepublishOnly` 跑 `--check` 防漂。**不入 `npm test`**（免跨轨误伤：他轨加测试不因此变红）。
- Sound/Status/Privacy/License：三音过时→「foreground cues＋aging bed」；Status live/trailer 转✓、🚧 仅余 multi-track/hosted/npx；Privacy 改「redacted error class」诚实口径；License 加 LICENSE＋CC0 音频指针。

**G6 · 重媒体迁 Releases**（§0.5，追认 L-1＋L-2）：
- M-T2 三支 62MB 接带 `git rm --cached`（本地保留、`.gitignore` 挡再入），指纹＋挂载目标入 `docs/records/mt2/stage/RELEASES-MANIFEST.md`（SHA-256 校验）。
- `.gitattributes`（媒体标 binary）＋`scripts/check-heavy-media.mjs`（暂存区 >5MB 二进制拦截，`npm run check:media`；6MB 正向拦截实测通过）。
- 祖父豁免（L-1）：m19/m21/m22/mt1 历史 30s 性格照等 <14MB 件本轮不动；`busy.curve.csv`（8.2MB 金测试 fixture）留仓。**历史清史于发布日建干净镜像时一并执行**。

**跨栏一刀（授权）**：`golden/sound.test.ts:435/474` 两处 `setMute` 循环加 `as const`（§A `e774c89` 带入的联合类型收窄错），全局 `tsc` 复净。属 §A 声音围栏，经船长授权跨栏收掉。
