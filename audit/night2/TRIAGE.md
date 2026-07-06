# NIGHT-2 晨间分诊 · 去重（审锚 ba5e777 → 现 main 4fdd585）

> 2026-07-06 08:1x。`AUDIT_REPORT.md` 审的是快照 `ba5e777`；夜里 SOUND-R3 与 M-T2/M2.3 已推进 main 至 `4fdd585`（`97f558a`→`4fdd585`）。本表把每条发现对现 main 复验，避免架构师追已修的鱼。复验方法：直接对 `/Users/shadow/tape0`（main）源跑同一批 repro。

## 夜间 M-T1「四修」已解（三条，无需再修）

| 发现 | 状态 | 复验证据 |
|---|---|---|
| **B1 求解器天花板/90≡60** | ✅ **已解** | main 抬了桥段上限：smooth 45→44.7 / 60→59.7 / 90→71.7 / 120→83.7s，storm 60→57.5 / 90→69.5，**90≠60 五带皆然**。`cut.js`/`cut-params.json` 已改。 |
| **B2 probe coreDegreeHz** | ✅ **已解** | `sound/graph.js:46` 注释亲标「import 禁用 as 别名（NIGHT-2 审计 probe-coreDegreeHz 案）」，别名撤销；main 源现生 probe.html **零 coreDegreeHz 调用/零未定义引用**。 |
| **D1 金测试覆盖盲区** | ✅ **已解** | `golden/dub.test.ts` 新增「52 预设四档：文法不变量全档成立＋成片严格单调」——遍历全 `targetsS`，断言成片随目标**严格递增**（90==60 即欠交复发哨）。金测试 68→**80，全绿**。恰是 B1 建议的回归哨。 |

## 仍开（未触及的文件，发现原样成立）

| 发现 | 严重度 | 现 main 复验 |
|---|---|---|
| **C1 `?tape=` DOM-XSS** | **P1/近 P0** | `stage/js/main.js:131` 未动，仍 `insertAdjacentHTML(${err})`。**原样可复现**。 |
| **A1 邮箱漏进默认蒸馏带** | **P1** | `adapters/claude-jsonl/parse.ts` `normErr`/`sanitizeToken` 未动，仍无邮箱规则。**原样成立**。 |
| **C2 10MB 行崩蒸馏** | **P2** | `sanitizeToken` 正则无长度守，未动。**原样成立**（live 同路径）。 |
| **C3 `/dub/save` 无鉴权写盘** | **P2→升 P2+** | 未加鉴权；且 **M-T2 新增 `POST /dub/save-bin`（mp4/webm/poster/gif 二进制落盘）——同款无鉴权跨站写，第二个写盘 sink**。面扩大。 |
| **冷读 npx 三重破产** | **P1（发布门）** | `package.json` 仍 `private:true`／`version 0.0.0`；`cli/index.ts` 仍无 shebang；仍无 `LICENSE` 文件。均属发布打包，夜间 M-T2/R3 未碰。**原样成立**。 |
| **冷读 版本/测试数打架** | P2 | version 0.0.0 vs「sealed」；测试真实数已从 68 升 **80**（README 仍写 38，差距更大了）。 |

## 新面（M-T2 复制机带来，供下一轮红队）

- **`/dub/save-bin`**：二进制媒体写盘端点（mp4/webm/poster/gif）。须核：`?kind=` 与 `?tape=` 参数清洗、扩展名白名单、文件名穿越、体积帽、与 C1 XSS 联动的外带面。本轮未深入（审锚无此端点），列冰箱候下轮。
- M-T2 mp4 导出的内联路径是否复用了已修好的「禁 as 别名」纪律？B2 修复须确认覆盖到 M-T2 导出器（质疑架构师 Q1 的落点）。

## 分诊结论

夜间把**能内部闭环的三条**（求解器/probe 别名/金测试）解了，且金测试新增回归哨——健康的响应。**剩下的四类（XSS／邮箱 PII／崩溃鲁棒性／写盘鉴权）都在 M-T2/R3 未触及的文件里，须显式排期**；其中 C1 XSS 与 A1 邮箱是发布前应修的 P1，C3 因 M-T2 新端点而扩大。发布打包三件套（npx/LICENSE/version）是另一条独立工作线。
