# GATE · foley 发布闸门清单（M2.4 §B.4）

> 轨道：**Track-RELEASE**。性质：**只备不拆**——本文件是 `private:true` 拆除、`npm publish` 之前必须逐项变绿的前置清单。
> 谁拆闸：架构师/船长。任何一项红，闸不拆。
> 末次更新：2026-07-06，HOTFIX-NIGHT2 → M2.4 §B 安全批收口后。

---

## 0. 一句话现状

**安全 P1 已清零**（C1/C2/C3/A1 四条本会话＋HOTFIX 全修，回归金测试在册）；**发布打包三件套已修**（shebang/version/LICENSE/engines/chmod），只余 `private:true` 作为总闸候拆。**其余闸（唱片落仓／M-T3 过庭／README 真话／公开镜像策／重媒体迁移）仍红**，分属 §A/§C 与 §B 后续单。

---

## 1. 拆闸前置清单（六闸）

| # | 闸门 | 状态 | 证据 / 负责轨 |
|---|---|---|---|
| G1 | **安全 P1 清零** | ✅ **绿** | C1 XSS（X-1）／C3 写盘鉴权（W-1＋令牌＋W-3）／C2 崩溃（长度守卫）／A1 邮箱 PII 全修；`golden/night2.security.test.ts` 22 条回归在册，全套 105/105。详见 §2。RELEASE 轨。 |
| G2 | **发布打包** | 🟡 **半绿** | shebang✓／version 0.1.0✓／LICENSE✓／engines >=23.6✓／bin chmod 100755 入库✓（均 HOTFIX `597daa9`）。**唯余 `private:true` = 本清单总闸**（拆它即等于宣布 G1–G6 全绿）。RELEASE 轨。 |
| G3 | **唱片终裁落仓** | ❌ **红** | 出厂唱片名单候船长终裁；落仓管道＋PROVENANCE 对审（即庭）由 §A 备。血统条款（§0.1）：内置唱片必须人类制造。§A Track-SOUND。 |
| G4 | **M-T3 过庭** | ❌ **红** | 有声接带＋AV 同步影子＋复核庭一场（§0.8：M-T3 必过庭）。§C Track-STAGE。 |
| G5 | **README 真话补丁** | ❌ **红** | 冷读者 17 条里的门脸假账（见 §3）：Quickstart 每行、测试数、三音过时、i18n 断层、"从源码跑"三行。测试数须**脚本注入而非手写**（§B.2）。RELEASE 轨后续单。 |
| G6 | **公开镜像策裁定** | ❌ **红** | 发布日以干净历史开公开镜像、私库存全史（§0.5）；含重媒体 62MB 迁 Releases（§B.3，L-1＋L-2 已追认）。候架构师裁 + RELEASE 执行。 |

**拆闸动作（G1–G6 全绿后）**：删 `package.json` `"private": true` → 定 `files` 白名单（挡 `runs/`、私有 `tapes/`、`docs/records/` 重媒体出 tarball）→ `npm publish --dry-run` 演练 → 冷读者复攻 README 每一行。

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
| 1 | `npx foley` 三重破产 | G2 | shebang/version/private：前二已修，private 候拆 |
| 2 | "finds recent session and plays" 未实现 | G5 | README 改叙述或实现，红 |
| 3 | "No config" 半真（四步手工管线） | G5 | 红 |
| 4 | `replay` 语义失实（吃蒸馏带非 session） | G5 | 红 |
| 5 | engines node>=20 与裸 .ts 矛盾 | G2 | ✅ 已修 >=23.6 |
| 6 | "never stored" | G1 | ✅ A1 邮箱 PII 已修 |
| 7 | `--redact` 藏着＋flag 位置崩 ENOENT | G5＋健壮性 | 红 |
| 8 | 仪表照 8MB 压进仓 | G6 | 重媒体策，红 |
| 9 | 白皮书链接 | — | ✅ 在位 |
| 10 | "MIT" 无 LICENSE 文件 | G2 | ✅ 已入库 |
| 11 | "Engine sealed v0.1.0" vs version 0.0.0 | G2 | ✅ 已对齐 0.1.0 |
| 12 | "38 golden tests" 过时（实数已 100+） | G5 | 红，须脚本注入 |
| 13 | "Three sounds" 过时 | G5 | 红 |
| 14 | 英文 README／全中文 CLI 断层 | G5 | 红，i18n |
| 15 | Status "Live mode wiring" vs help 已有 live | G5 | 红 |
| 16 | scan 教的 `distill … tapes/…` 裸 ENOENT | G5＋健壮性 | 红，distill 不建目录 |
| 17 | clone 即脏（bin chmod） | G2 | ✅ bin 100755 入库，clone 不再脏 |

**门脸账总评（冷读者原话）**：产品里子真、且比 README 说的更多；门脸（Quickstart/许可/版本/主视觉/i18n）几乎全空头支票。G1（里子安全）已补，**G5（门脸真话）是拆闸前最大的一片红**。

---

## 4. 记分牌

```
G1 安全 P1 清零      ✅ 绿   （C1/C2/C3/A1 全修 · 22 条回归 · 105/105）
G2 发布打包          🟡 半绿 （四件套已修 · private:true 候拆＝总闸）
G3 唱片终裁落仓      ❌ 红   （候船长名单 · §A 备管道）
G4 M-T3 过庭         ❌ 红   （§C 有声接带＋庭）
G5 README 真话补丁   ❌ 红   （冷读 17 条门脸账 · §B 后续单）
G6 公开镜像策＋重媒体 ❌ 红   （候裁 · L-1＋L-2 已追认）
```

拆闸条件：G1–G6 全绿。当前 1 绿 1 半 4 红。
