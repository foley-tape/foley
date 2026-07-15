# stage/tools/verify/ · 验收器具箱

**器具入仓律**（复盘 R3·夜审右耳 D-8/复盘乙.8）：会被反复用的验收器具住这里，**不散在 /tmp 与 scratchpad**（scratchpad 会轮转，散落即丢）。每具自带密闭 serve 或明示真机口径；真机验收皆船长机为准（证据分级 L2/L3）。

## 常驻器具

| 器具 | 职能 | 何时跑（D4 档） | 调用 |
|---|---|---|---|
| `still.mjs` | 静帧截取（暗房/带妆态·英雄帧候选） | 发布前·视觉重铸/英雄帧更新后（**非例行**·L2） | `node stage/tools/verify/still.mjs [--url ...]` |
| `post_probe.mjs` | POST 开机自检验收——六件套逐 100ms 采样+时序断言+终态归还（两页 index/demo） | 协议疑变（POST/示能改动）·发布前（**非例行**·须浏览器·L2） | `node stage/tools/verify/post_probe.mjs --profile index\|demo` |
| `record.mjs` | 真 Chrome + CDP screencast + audiotap → 合成带声 mp4（分幕证据） | 船长证据请求·声音改动·发布前（**最贵·永不例行**·L2→L3） | `node stage/tools/verify/record.mjs [--script ...]` |

## 何时跑（D4 触发档·席三工单二.4）

验收分档制（工作法新法3·D4）落到器具：**贵验收器标触发条件，永不入例行回归**；档位由签发人派单盖定，执行者不临场自裁。

- **例行档（每 `npm test`）**：`golden/browser-wiring.test.ts`（拉 `latecomer.mjs`·hermetic·chromium 在则真跑缺则 skip）——唯一入默认回归的浏览器闸；纯 node 金测全数亦例行。
- **发布前档**：`still.mjs`／`post_probe.mjs`／`record.mjs` 三真机器＋三诚约闸（`prepublishOnly`：sync-readme/readme-contract/pack-budget/ledger-writeback）——发布扳机前一次性全跑。
- **协议疑变档**：改动契约面即重跑对应器——POST 时序改→`post_probe`；接线/声桥协议改→browser-wiring＋`record`；状态机相位改→transport 相位金测（工单二·§3.2）。
- **版本升级/真 Claude 档**（最贵·船长派单）：真 Claude producer 探针（ASK 宗教级可靠·night3 privacy/ground/failure repro）＋真耳（LUFS/声资产）——版本升级或双盲复审时触发，不入任何自动流。

**`audit/*/repro/*.mjs` 一律非例行**：各为其审计的一次性证据/复现器（night2/night3/a-live/e-系/p0-系）；重跑触发＝该审计复验或发布前双盲。密闭化转正者（`latecomer`）已升「例行档」入 browser-wiring，余者留审计域按需出具。

## 接线闸（wiring probe 之入仓正身）

夜审点名的 **wire_probe（接线专项）** 已密闭化并转正为默认闸——不再是散落探针：

- `audit/p0-1-wiring/repro/latecomer.mjs` — 迟到者三案（到场即接线／中途 connect 撤签落针／舞台无条件呼吸），**合成夹具** `golden/fixtures/latecomer.session.jsonl`（零真实用户数据）。
- `golden/browser-wiring.test.ts` — 把上者拉进**默认 `npm test`**：chromium/playwright 在则真跑，缺则优雅 skip（不破 pure-node 金测）。`FOLEY_GATE=1` 时不落工件（npm test 幂等不脏树）。

## 真机状态借用律（transport-borrow·复盘乙.3 转正为律）

验证若须动**共享真机**（如 4181 正房·select live/pause）——**借前快照 → 验 → 逐字段还原 → 对表打印**，绝不留改：

1. **快照**：`GET /rack` → `transport`（phase/loaded/selected/paused/cursor/live）。
2. **验**：可 `POST /transport/{select,play,pause,eject}` 借动（**须 `x-dub-token` 头**·令牌注入页面 markup，跨站取不到即 403）。
3. **还原**：`eject` → 复 `select` 原 `loaded` → 原 `paused` 则 `pause`，逐字段回到快照。
4. **对表**：`[restored] audit PAUSED ✔ 原状` 逐字段打印入证据。

> 现状：无 hermetic 生产调用方——回归族① `transport.mjs` 假红修复改走**空 `FOLEY_PROJECTS` 独立 serve**（免借共享机、消 live 自装 CUEING 竞态），故未落 `transport-borrow.mjs` 代码。一旦有验收须动共享 4181（如状态族在真机核 REC），照此律出具。

## 归属他族 / 他席（不在本回归族重建）

- **诚实三查（honesty3·状态诚实 REC 归层）**：REC「录制中」跨态诚实（待机/回放/暂停灭·live∧PLAYING 呼吸）属 **席三工单二·状态族**（模式-灯-指针真值表·**吃席二冻结契约** `docs/状态契约_模式灯语真值表.md`）。接线整改期一次性 4/4 验已入 main（`7e18cca`）；常设真值表金测待状态族落地——**不在此重建**，避与席二「REC 单一事实源」在造之工相撞（席二工单 3）。

## 并发协调

本箱**席二亦入**（`ask_probe.mjs`·ASK sustain 三幕·验收器等待条件律=不赌固定睡眠）。各器具独立文件、命名避撞；改箱前 `git status` 扫并发。
