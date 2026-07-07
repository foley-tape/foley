# GATE · foley 发布闸门清单（M2.4 §B.4）

> 轨道：**Track-RELEASE**。性质：**只备不拆**——本文件是 `private:true` 拆除、`npm publish` 之前必须逐项变绿的前置清单。
> 谁拆闸：架构师/船长。任何一项红，闸不拆。
> 末次更新：**2026-07-07，M2.6 拆闸前必修**——双盲终审（`audit/AUDIT_FINAL_BOARD.md`＋GATE_PATCH，架构师全部采纳签核）重开 G1、新增 G7/G8；蓝队（RELEASE 轨）四颗 P1 修复已全落地＋金测试，**候红队回归签署**（M2.6 §0 三段闭环：未经原审计会话复跑签「雷已消失」，不得在本表销账）。

---

## 0. 一句话现状

双盲终审曾把记分牌打回「**G1/G7 红·G2 待补·拆闸前须清 3 项 P1**」。M2.6 蓝队修复现已全部落地：**F1（未鉴权 DoS）**包死返 400＋进程兜底、**F5** Host 白名单闸、**TR-1/G7** 分享/导出默认脱敏（distill 默认全脱敏＋`--raw` 警示／dub meta 抹墙钟／mp4 三 box 钉 0）、**甲-2** 五卷脱敏合成骨架入库（clean clone 全绿）。全套金测试 **113/113**（+8 条 M2.6 回归）、typecheck 净、`npm pack` 重跑 **915.6kB／91 文件无泄漏**（[REHEARSAL-MANIFEST](REHEARSAL-MANIFEST.md) 已刷新）。**G1/G7/G2 的绿灯候红队（甲/乙审计会话）复跑 repro 签「雷已消失」后由架构师合入**；G8（零配置第一分钟有声）候船长验收记。`private:true` 保险栓在场，**实发布与公开镜像＝人类扳机**（§6）。

---

## 1. 拆闸前置清单（六闸）

| # | 闸门 | 状态 | 证据 / 负责轨 |
|---|---|---|---|
| G1 | **安全 P1 清零** | 🟠 **修复落地·候乙签** | 原绿（C1/C2/C3/A1＋22 条回归）被双盲乙 **F1**（`/%zz` 未鉴权跨源单请求崩 serve）重开、**F5** 纠正原则②措辞。M2.6 修复：decodeURIComponent 包死返 400＋进程级 unhandledRejection 兜底；Host 白名单闸一处兜全（读写皆过门）；`night2.security.test.ts` +3 条（25 条）。**候乙复跑 `serve_dos_malformed_percent.sh`＋rebinding 探针签「消失」**。详见 §2/§8。RELEASE 轨。 |
| G2 | **发布打包** | 🟡 **就绪·候甲签** | shebang✓／version 0.1.0✓／LICENSE✓／engines >=23.6✓（HOTFIX `597daa9`）＋`files` 白名单演练验证。双盲甲-2 揭「105/105 仅作者树成立（6 测读 gitignored tapes/）」——M2.6 已补：**五卷脱敏合成骨架入库**，clean checkout 全绿实证（§8）；`npm pack` 重跑 **915.6kB／91 文件**无泄漏（[账差对账](REHEARSAL-MANIFEST.md)）。**候甲复跑 `01-npm-test-on-clone.sh` 独立环境签署**。`private:true` 保险栓在，人类拆闸时摘（§6）。RELEASE 轨。 |
| G3 | **唱片终裁落仓** | ✅ **绿** | 船长终裁名单三曲入厂（HoliznaCC0，人类制造·CC0）＋AI 四盘退厂＋Releases records-v1（§A `b81e0ad`）；血统条款与三方哈希互证通过。血统条款（§0.1）达成。§A Track-SOUND。 |
| G4 | **M-T3 过庭** | ✅ **绿** | M-T3 音画合龙交付＋过庭（§C `be619bb`；AV 同步影子 storm Δ16.8ms／jam Δ0.6ms ≤1 帧；dub.meta 增 audio 段）。§0.8 M-T3 必过庭达成。§C Track-STAGE。 |
| G5 | **README 真话补丁** | ✅ **绿** | README 双份真话批（§B.2）＋M2.5 口径对齐；M2.6 增补 Privacy「默认脱敏＋`--raw` 警示＋mp4 抹墙钟」段（en/zh），测试数脚本注入刷新（103 定义）。冷读 17 条门脸项逐条见 §3、执行见 §5。RELEASE 轨。 |
| G6 | **公开镜像策＋重媒体** | ✅ **绿** | 重媒体（§B.3）：62MB 接带迁 Releases＋指纹＋`check-heavy-media` 再入闸。镜像策 §0.5 已定（clean-slate 斩史）。**M2.6 注**：镜像 orphan-clean 后**必须跑一次干净 `npm test`**（甲-2 的 6 红因 P1-③ 应转绿——§6.2 步 3 已入 runbook）。 |
| G7 | **分享/导出脱敏闸**（新增） | 🟠 **修复落地·候甲乙双签** | 双盲**双队收敛真雷 TR-1**（甲-5 夹具角度＋乙-F2 mp4 角度＋乙-F3 默认带角度）：redact 之外三路径泄绝对时戳/明文标识。M2.6 统一口径（架构师裁定「默认形态即安全形态」）：①distill **默认全脱敏**、`--raw` 显式＋强警示；②dub meta 抹 createdAt/liveEpoch；③mp4 `mvhd/tkhd/mdhd` creation/modification 钉 0（`stage/js/mp4scrub.js`，film.js finalize 后挂钩）；④五夹具同尺入库。金测试 `golden/g7.redaction.test.ts` 5 条。**候乙复跑 F2/F3 探针＋甲复跑 5 号夹具指纹检查双签**。RELEASE 轨统筹。 |
| G8 | **零配置第一分钟有声**（新增） | 🔴 **待验** | M2.6 §4：前置静音雷（本地唱片自举/第一分钟有声）状态未回——发布硬门。**船长完整体验走查（《船长验收协议》）＝拆闸前最后一道人类签章**，与 M2.6 三段闭环并行。SOUND/RELEASE 轨候船长。 |

**拆闸动作现状**：`files` 白名单已定并演练验证✓、`sync:readme`+pack 重跑✓、M2.6 四颗 P1 修复落地✓。**尚欠**：①红队回归签署（乙：F1/F5/F2/F3；甲：甲-2/夹具指纹）→ 架构师合入；②G8 船长验收记；③人类扳机（§6）：`npm login` → 删 `private:true` → `npm publish`；建 clean-slate 公开镜像（**严禁私库直接公开**，镜像后跑干净 `npm test`）；唱片/床音/接带上传 Releases。

---

## 2. G1 安全 P1 清零 · 本会话执行明细

照 M2.4 §0.6 五原则（原则约束凌驾方案标签）：

| 原则 | 落点 | 做法 | 回归测试 |
|---|---|---|---|
| ① URL 参数不经校验不入 DOM/路径 | `stage/js/main.js`；`stage/serve.mjs` | tapeName 白名单 `[^\w-]`剥离；save/save-bin 落盘名 `safeStem`（折叠 `..`、不以 `.`/`-` 起头） | `C1/§0.6.①`、`§0.6.① save-bin 穿越` |
| ② serve 只绑 127.0.0.1 | `stage/serve.mjs` | `listen(port,'127.0.0.1')`。**措辞经乙-F5 订正：绑定断 LAN／Origin 白名单断跨源写／Host 校验断 rebind 读**（绑定对 rebinding 无效——rebind 恰解析回 127.0.0.1；M2.6 已加 Host 白名单闸一处兜全） | serve 集成全绿于 127.0.0.1；`F5 · Host 非白名单 → 403` |
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
G1 安全 P1 清零      🟠 修复落地·候乙签 （F1 DoS 包死+兜底、F5 Host 闸 · +3 回归 · 候乙复跑 repro）
G2 发布打包          🟡 就绪·候甲签   （甲-2 已补：五卷脱敏骨架入库·clean checkout 全绿实证 · pack 重跑 915.6kB/91 · private 保险栓有意保留）
G3 唱片终裁落仓      ✅ 绿           （§A b81e0ad 三曲入厂·AI 退厂·三方哈希互证）
G4 M-T3 过庭         ✅ 绿           （§C be619bb 音画合龙·AV≤1帧·过庭）
G5 README 真话补丁   ✅ 绿           （双份真话批 · M2.6 隐私段增补 · 测试数脚本注入 103）
G6 公开镜像策＋重媒体 ✅ 绿           （62MB 迁 Releases＋指纹＋再入闸 · 镜像后跑干净 npm test 入 runbook）
G7 分享/导出脱敏闸   🟠 修复落地·候甲乙双签 （TR-1 真雷 · 默认即脱敏+--raw 警示+meta 抹钟+mp4 钉 0+夹具同尺 · 5 条金测试）
G8 零配置第一分钟有声 🔴 待验          （前置静音雷状态未回 · 船长验收记=拆闸前最后人类签章）
```

**M2.6 蓝队侧已清（四颗 P1 修复＋金测试 113/113＋typecheck 净＋pack 无泄漏）；红队回归签署（甲/乙）与 G8 船长验收记为拆闸前仅余两事。** 未经原审计会话签「雷已消失」，G1/G7/G2 不得转 ✅（M2.6 §0 三段闭环纪律）。`private:true` 保险栓非未竟事项，人类拆闸日亲手摘除（§6）。

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

---

## 6. npm 发布离线演练 ＋ 人类扳机（launch day）

### 6.1 演练结果（`npm pack --dry-run`，只读；M2.6 重跑）

- **tarball：915.6 kB 压缩 / 3.6 MB 解包 / 91 文件**（账差 85→89→91 全为白名单内预期件：cuts 冻结件 ×5＋mp4scrub ×2，详见 [账差对账](REHEARSAL-MANIFEST.md)；初版未配 `files` 曾 24.7MB/106 文件，已收）。
- **`prepublishOnly` 闸绿**：`sync-readme --check`（真话数一致）＋`npm test` **113/113**（M2.6 后全量）。
- **肉身对账（安全扫过）**：✅ 无 `tapes/`（脱敏骨架也不随包——`files` 无此项）、无 `docs/`、无 `golden/`（测试）、无 `audit/`、无 `.env`/密钥、无音频二进制（mp3/wav）；随包 `stage/fixtures/storm.*` 已为**脱敏再生版**（t 相对化）。**全 91 文件账见 [`REHEARSAL-MANIFEST.md`](REHEARSAL-MANIFEST.md)**；SHA `4394b400…`。
- **`files` 白名单**（package.json）：入 = `cli engine adapters protocol sound stage params/verdict/sweep/sound-params.json README(.zh) LICENSE`；负号排除 = `sound/records/*.mp3`、`sound/assets/*.wav`（走 Releases，首启 `cli/records-fetch`＋`cli/assets-node` 征询下载）、`stage/tools`、`stage/fixtures/{busy,jam,smooth,silence}.*`（重演示带）；**保留 `stage/fixtures/storm.*`** 作 README `?tape=storm` hero 演示。

### 6.2 人类扳机（均需人类，本会话止于此）· 时序按裁定 publish 前置

1. **Releases 资产先上传**：唱片 `records-v1`（HoliznaCC0 三曲）＋床音 wav ＋ M-T2/M-T3 接带（指纹见各 MANIFEST）→ GitHub Releases，供首启征询下载与 npx 首体验有料。
2. **npm 发布**：`npm login`（本环境未认证）→ 删 `package.json` `"private": true` → `npm publish`（`prepublishOnly` 会再自动跑真话+全测）。包名 `foley` 现 registry E404＝可用。
3. **公开镜像（§0.5，Clean Slate；裁定：不早于 publish）**：**严禁 `foley-tape/foley` 私库直接转公开**——私库存全史。做法：以当前 HEAD 树为起点 `git checkout --orphan public-main` → 单一初始提交（无历史）→ 推到**新建**公开仓。斩断 62MB 接带/私有原始 tapes 的全部历史血迹。**镜像 README 的 `npx foley` 此刻已为真（publish 在前）。** **M2.6 增补（必做）**：orphan-clean 后在镜像树跑一次**干净 `npm test`**——甲-2 的 6 红应因五卷脱敏骨架入库而全绿；红即停。

> 本会话严守授权边界：只 `npm pack` / `--dry-run`（只读），未 `publish`、未动历史、未建镜像。`private:true` 保险栓已复位；发布态 prep 已提交私库供审。

---

## 7. M2.5 §A 发布物料轮进展（2026-07-06）

- ✅ **README 真话补丁**（`cf0ac5c`）：口径对齐工具箱＋COLD_READER 逐条销账；Records 段（血统条款＋HoliznaCC0 三曲 CC0 事实署名＋淘碟指南链接）＋Privacy「零静默网络」＋Status 实况＋Honest limits；版本号纳入脚本注入（`sync-readme` `<!--version-->`）。hero 位换 §B `docs/assets/hero.gif`。
- ✅ **npx foley 产品修（COLD #2 未解项）**：裸调 `foley`/`foley play` 起播磁带机（`cli/index.ts` → spawn `stage/serve.mjs` 尾随最近会话＋防弹 best-effort 开浏览器）。「finds and plays」口径至此成真；随 §C 共享树入库。
- ✅ **冒烟矩阵（§A.3，可测部分）**：干净解包态 deck 起播 **HTTP 200 零报错**（offline 路径）；`records status` 正确报缓存/缺件；拒绝路径逻辑在 `records-fetch`（拒绝→房间层/合成织体退路）。**真下载路径待 Releases 上线（发布日）验**。
- ✅ **publish 演练**：见 §6（905kB／85 文件，`private` 保险栓在）。

### 7.1 架构师已裁（2026-07-06）

1. **音频开箱声 → 裁定：接受合成织体退路为开箱声。** 音频（唱片 mp3 ＋ 床音 wav）全走 Releases、不入 tarball（§0.3 不改）；干净装无 wav 时走 §C 合成织体退路。README 现文「the deck plays its own ambient bed by default」即照此，无需纳床音入包。tarball 保持 905kB。
2. **D-1／D-0 时序 → 裁定：`npm publish` 与公开镜像推送同时或前置。** 镜像 README 的 `npx foley` 不得先于 publish 公开——runbook §6.2 已按此重排（publish 步在镜像步之前）。

### 7.2 注（非阻塞）

- `docs/assets/hero.gif`（11.5MB）：README 渲染必需，在 `docs/`——**不入 npm tarball**（`files` 白名单挡），清史镜像随初始提交带入；>5MB 属 README 资产、`check-heavy-media` 宜加白名单豁免。
- demo 静态一体页（§B `b870214`）：GitHub Pages 部署＋foleytape.com 绑定＝发布日人类（§A.5）。

---

## 8. M2.6 拆闸前必修 · 蓝队执行明细（2026-07-07，RELEASE 轨统筹）

> 依据：`FOLEY_ORDER_M26_PRELAUNCH_FIX.md`（红蓝分离：审出者不修、修完回原审计会话验签）。锚 `149ddea`。

### P1-①【TR-1/G7】分享/导出默认脱敏（统一口径，禁四路各修各的）

| 路径 | 落点 | 做法 |
|---|---|---|
| 默认 `.tape.jsonl` | `cli/distill.ts`＋`adapters/claude-jsonl/distill.ts` | `writeDistilled` 默认 `redact=true`（时间相对化＋非内建工具加盐哈希＋errClass/sig/targetHash 重盐＋`sourceHash=redacted`）；「不脱敏」翻转为显式 `--raw`（保留 `--redact` 兼容） |
| `--raw` 原始带 | `cli/distill.ts` | stderr 强制警示「含绝对时间＋明文工具名＋精确 sourceHash，可反推工作时段/仓库身份，勿外传」 |
| dub `meta.json` | `stage/js/dub.js`（hero＋`_saveDub` 两处） | `createdAt`/`liveEpoch` 键抹除（在场消费走内存 `this.doc.liveEpoch`，落盘段值本为带内相对 ms） |
| 导出 mp4 | `stage/js/mp4scrub.js`（新，纯函数）＋`film.js` finalize 后挂钩 | `mvhd/tkhd/mdhd` 的 creation_time＋modification_time 原位钉 0（v0/u32 与 v1/u64 两版式；对齐仓库 demo 已抹口径）；webm-muxer 经查不写墙钟 |
| 夹具 | 见 P1-③ | 同一把尺（`redactResult`） |

**金测试**：`golden/g7.redaction.test.ts` 5 条——默认带盘上形态（相对时间/哈希工具/redacted）、CLI 默认+`--raw` 警示（spawn 集成）、mp4scrub 合成盒树钉 0＋邻字节不动＋幂等、坏盒不抛、源码卫兵（film.js 挂钩不许摘＋dub.js 墙钟键不许回潮）。

### P1-②【F1】serve 未鉴权 DoS

`stage/serve.mjs`：`decodeURIComponent` 包死 try/catch 返 400（原在一切 try 之外，`/%zz` 单请求即崩进程）；`new URL` 同包；进程级 `process.on('unhandledRejection')` 纵深兜底。**金测试**：`night2.security.test.ts` +2（`/%zz`→400 且进程存活；裸 `/%` 走原始 socket→4xx 且存活）。

### P1-③【甲-2】干净克隆 6 红

五卷标准带以**脱敏合成骨架**入库（`tapes/*.tape.jsonl`＋`tapes/README.md` 提盐纪律与等价性证词；原始真身 `tapes/raw/` 永不入 git，`.gitignore` 白名单次序敏感已注）。`stage/fixtures/*.{curve,moments}.csv` 以脱敏带再生（同尺）；`stage/golden/*.cuts.json` 经 `cut-golden.mjs --freeze` 重冻。

**等价性证词（脱敏不改机器证词）**：五带 curve.csv 除 t 列外**全列逐字节一致**；moments 结构列一致；cuts 重冻**每带仅 tapeHash 一行变**（全部段边界/速度/角色四档全同）；五带判定表全绿不变（storm 峰值 T=0.915 等）。

### P1-④【F5】GET 面 Host 校验

`HOST_OK ∈ {localhost:port, 127.0.0.1:port}` 缺省拒 403，置于路由最前**一处兜全**（读写皆过门）；`:listen` 注释＋本表 §2 原则②订正为「绑定断 LAN／Origin 断跨源写／Host 校验断 rebind 读」。**金测试**：+1（evil Host 带/不带端口皆 403；白名单两形态 200）。

### 验证汇总

- 金测试 **113/113**（+8：F1×2/F5×1/G7×5）；`tsc --noEmit` 净。
- `npm pack --dry-run` 重跑：**915.6kB／91 文件**，肉身对账无泄漏（§6.1、REHEARSAL-MANIFEST 账差对账）。
- clean checkout（orphan 同构树）`npm test` 全绿——见提交后独立复核记录。

### 候签清单（红队验，架构师合入）

- [ ] **乙**复跑 `serve_dos_malformed_percent.sh` → 签「进程不再终止」（G1）
- [ ] **乙**复跑 rebinding 读面探针 → 签「非白 Host 403」（G1）
- [ ] **乙**复跑 F2（mp4 creation_time）/F3（默认带/meta）探针 → 签「指纹消失」（G7）
- [ ] **甲**复跑 5 号夹具指纹检查 → 签「指纹消失」（G7）
- [ ] **甲**复跑 `01-npm-test-on-clone.sh` 独立环境 → 签「clean clone 全绿」（G2）
- [ ] 船长验收记＋G8 前置静音雷状态回报（G8）
- [ ] 全签后架构师改本表 🟠→✅，记分牌回「全绿·待人类扳机」
