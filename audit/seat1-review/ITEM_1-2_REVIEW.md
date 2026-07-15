# 席三对审 · 席一「信任与入口」工单 1／2 · 判词 **PASS（候合入）**

- 对审人：席三（门禁与法典）——兼席一审计员（席位令：「以你建的诚约闸复测其每一句真话」）。
- 受审：席一工单 **1 隐私契约修真（P0）**、**2 包体减肥（P0）**。
- 受审态：`seat/trust` 工作树（未提交·基 `6766d93`）。本席只读旁观 + 只读闸复测，未改席一一字（收尾删自加 node_modules 软链·其树 28 改全属席一）。
- 器具：席三诚约闸 `scripts/check-readme-contract.mjs`（PRIV-01~07 对表）、`scripts/check-pack-budget.mjs`（含 fixtures 断言）+ 独立复跑席一码测。
- 日期：2026-07-15。
- **船长批复（2026-07-15）**：对审 PASS **正式入账**；**不因签名旧债重开 item 2**（见下「签名旧债」）。

---

## 工单 1 · 隐私契约修真 — **PASS**

架构师裁决确认执行：**标题法合宪不动**（本地母带持有开场白作带名系立法功能）；违宪者是 README 超额承诺，席一已修真。

| 判据 | 结果 | 证据 |
|---|---|---|
| 诚实版 README 过对表闸 | ✓ PASS | `check-readme-contract --root seat/trust` exit 0（三文件扫描·契约锚在） |
| 旧说谎版被闸咬（防伪证） | ✓ FAIL 6 条 | 旧态命中禁句「never stored」×2＋「永不落盘」＋缺三须句——闸真咬非空过 |
| 首句本地标题行为码测 | ✓ 18/18 | 独立复跑 `golden/rack-title.test.ts`＋`cards.test.ts`（默认/env/config 退出/孤儿卡/热切换/双 serve/坏档 fail-closed/清除失败 500/重启自愈/蒸馏无首句） |
| 全量金测 + 类型 | ✓ 180/180·tsc 绿 | 独立复跑（非采信自报） |

对表机械化：席一 `docs/launch/PRIVACY-CLAIMS-MATRIX.md`（PRIV-01~07）已接入 `check-readme-contract.mjs`——禁句（never stored/永不落盘）绝迹 + 须句（本地标题披露 / 退出开关 `FOLEY_NO_LOCAL_TITLES`·`localTitles` / 出屋默认脱敏）在场。**README 任何隐私句变动须重过此闸**（matrix 交席三事项 #1 落地）。

## 工单 2 · 包体减肥 — **PASS**

| 判据 | 目标 | 实测（seat/trust） | 结果 |
|---|---|---|---|
| pack 总体积 | ≤ 2MB | **1.875MB**（旧 18.85MB·21× 回胖已消） | ✓ |
| fixtures 在包 | 0 | **0**（`!stage/fixtures/**` 全逐出） | ✓ |
| captain.curve.csv | <500KB | **152KB**（旧 13MB·降采样保形） | ✓ |
| 旧渲染死资产 | 剔除 | eye/fascia/reel/vu_face.png 已删 | ✓ |
| HEAVY_INVENTORY 补文本 CSV | 补 | 已补（席一） | ✓ |

本席闸复测：`check-pack-budget.mjs`（cwd=seat/trust）→ ✓ 在预算内·无 fixtures 漏入。

---

## 签名旧债 · captain.curve.csv 当前切片待重新签署

审 item 2 时逮到**签名绑哈希制度的首个活证**：`audit/B8_captain第六带_六向量扫描签署.md` 按「文件名 + 13MB」签 captain 夹具，**未绑任何摘要（SHA-256/commit）**。席一本次将其降采样 13MB→**152KB**——旧签所指对象已不存在。

**裁定（船长令 2026-07-15）**：
- **B8 旧签不得沿用到当前 152KB 切片**——旧签绑的是 13MB 原件，152KB 是未签物。
- 当前 152KB 切片**记为「待重新签署」**：须俟席一 item6 将成文的签名绑哈希规则，对新切片重扫六向量、重签、绑 SHA-256＋commit。
- **不倒填哈希伪造旧签**，**不替席一预定格式**——签名闸候席一 item6 规则正文，届时席三逐字机器化。
- 此项**不阻断 item 1／2 对审 PASS**（包体减肥本身达标；签名是独立制度债，归签名绑哈希闸·诚约族仍 3/4）。

## 统一规则（席位令令「统一预算标准、fixtures 断言等规则」）

1. **包体预算 = 严格 2,000,000 bytes**（十进制·席一定数）：席三闸**权威单位改 bytes**（`FOLEY_PACK_BUDGET_BYTES` 可调）——原默认 2048 KiB = 2,097,152 B 与席一定数不符，**已修**。seat/trust pack **1,966,460 B ≤ 2,000,000 B** PASS（余 33,540 B）。
2. **fixtures 断言**：`check-pack-budget.mjs` 增「`stage/fixtures/` 零容忍漏入包」——统一席一 item2「无 fixture 在包」。**只拦漏入包**，绝不误杀树内 dev 金料（`busy.curve.csv` 明确保留）；文本大件库存归 `HEAVY_INVENTORY`（席一）＋ `check-heavy-media`（不动）。
3. **README 对表**：锚 PRIV-01~07 稳定 Claim ID。
4. 三闸（readme-contract / pack-budget / ledger-writeback）皆入 `prepublishOnly`，**不入默认 npm test**（勿破他席开发绿）。

## 接收路由（matrix「交席三事项」→ 归席三后续工单）

席一如实披露、不越界改，交席三接管者，本席**接收**（归后续族，非本次对审阻断项）：

- `docs/launch/GATE.md` 仍把旧「never stored」修复记绿灯、`--raw` 闸未列明文 best-effort errClass；`docs/decisions/priority-canon.md` 仍写「对话永不落盘」——**销旧账 + 补字段** → 归席三**工单 3 治理真话对表**。
- `docs/canon/REDACTION-CONTRACT.md` 要求出屋派生物统一经 `redactResult`，而 DUB meta 独立构造 `tape`/`tapeHash`/`film.files`——**正典—实现缺口** → 归席三**工单 4 正典编纂**。
- 席一 item 6「签名绑哈希」规则**尚未成文**（其 RELEASES-MANIFEST 有 SHA-256 先例可循）——签名闸**候席一规则正文**，届时席三逐字机器化；**诚约族保持 3/4**（船长令 B·不自定格式）。captain 152KB 切片按上「签名旧债」待重签。

## 遗留观察（非本次判据·记档）

- **入口句（席一 item 5·P1）**：诚实版 README 有「From source: git clone」真路径，但 npx 仍列 Quickstart 首位、无显式「pre-release」注脚。item 5 是独立 P1；本次对表闸只锚隐私 P0，入口句留待 item 5 收口后可扩闸。
- **无字句**：README §91「the deck is wordless」与面板实有英文器件铭牌/状态句并存（夜审 R:D-13/L:P3·known-limit 在册）——非席一 item1/2 scope。

## 诚实边界

- 三新闸现**红在 main／seat-gates**（旧 README 说谎 + matrix 未合入）——**这是预期**：席一 item1/2 合入 main 后自动转绿。故未入默认 npm test，只入 release 闸；不阻他席开发绿。
- 本对审基于 seat/trust 未提交态快照；席一提交/合入若微调措辞，`check-readme-contract` 会自动复验（禁句/须句正则不吃具体行号）。

**判词：席一工单 1／2 —— 正式 PASS 入账（船长批 2026-07-15），候操作员合入 `seat/trust`→`main`。合入后 `prepublishOnly` 三闸生效、README对表/包体预算随之转绿。captain 152KB 切片「待重新签署」独立挂账，候席一 item6 签名规则正文，届时按新规重签绑摘要——不倒填、不重开 item 2。**

— 席三 · 2026-07-15
