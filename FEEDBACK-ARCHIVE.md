# FEEDBACK-ARCHIVE · 归档轨总账（ARCHIVE-1，一次性轨）

> 令：[`docs/orders/19-archive1-repo-archive.md`](docs/orders/19-archive1-repo-archive.md)。锚：`772ca79`。分支 `chore/archive`，交付即合并。
> 纪律恪守：只动组织不改内容——唯一的正文触碰是每份迁移令首行加"原名"注释（令 §2 明令）与两处清单状态落真（mt2"待挂"→"已挂"）。全部移动映射在各批提交信息里，此处摘要。

## 一 · 移动总账（六批）

| 批 | 提交 | 干了什么 |
|---|---|---|
| 批1 | `ee56230` | 施工令编年：11 令库内改名＋8 令自桌面入仓＝19 令（`01-m15`…`19-archive1`）＋INDEX.md；血统档案→decisions/、发布工具箱与船长验收协议→launch/ |
| 批2 | `46d76c7` | 根部散件 17 件纯搬移：SOUND 交接×5→sound-r2/r3、舞台复盘→m21、施工方手记→m17、FEEDBACK-FIX→m20、HOTFIX-NIGHT2 包→records/night2＋audit/night2 |
| 批2b | `3bd4050` | 18 夹各落 `_index.md`；records/README 补 night2/sound-r2 行；命名法补 @轮次 后缀；两件与既有 @档重复的裸本删除 |
| 批3 | `2964b35` | 审计馆成形：night1 全套（30+件）自 records 上移 `/audit/night1`；night2 附件（repro/shots/soak）自未并分支 51494db 取回；audit/README.md |
| 批4 | `e7e9d13` | 重媒体冷存（见下）＋分支冷存：archive/* 标签×8、删已并分支×6 |
| 批5 | `1945c99` | docs/README.md 档案馆地图＋decisions/README.md 裁决索引；淘碟指南→guide/；白皮书正名；两 README 导航修真 |

## 二 · 重媒体（批4 细账）

- **实挂 Releases 并逐字节核同**：`media-mt2`（三支 62MB 接带——清单原写"待挂"实未挂，悬账兑现）；`media-archive-v1`（13 支：m19×5＋m21×5＋m22×1＋mt1 撕纸仪式＋**mt3 live 定妆实录**——后者原先只有指纹在案、真身躺在 stage 工作树 runs/，一次清扫就会消失，今永久化）。
- `git rm --cached`×12（盘上保留）；`.gitignore` 四条挡再入；五夹新增 RELEASES-MANIFEST.md。
- HEAD 现存 ≥5MB 仅余两件活资产：hero.gif（README hero）＋busy.curve.csv（金 fixture）。总账：[`docs/records/HEAVY_INVENTORY.md`](docs/records/HEAVY_INVENTORY.md)。
- **历史不改写**（既裁 G6：发布日公开镜像走干净历史，私库存全史）；若改裁，前置条件已备妥（分支全归档、清单在案），只欠船长令。

## 三 · 令外自主裁量（船长授权"确定即改"）

1. media-mt2 悬账兑现＋mt3 孤本抢救（见上——这是本轮最值钱的两笔）。
2. M2.5 令点名的输入件 `audit/night2/COLD_READER.md` 此前不在 main（在未并分支上）——批3取回后，该悬空引用自愈。
3. 白皮书正名：`TAPE0_WHITEPAPER_SENSES_v1.md`→`TAPE0_WHITEPAPER_SENSES.md`（内文已长成 v2，版本归文件内管；SPEC v0.1 系冻结版本号不动）。
4. README.zh 船长地图修真：FEEDBACK-FIX/施工方手记/舞台复盘三处断链改指入档处；补 audit/ 行、档案馆行、scripts 四脚本；orders 行改指 INDEX。
5. README.md（英文脸）Why Foley 尾加一行档案馆入口——过程故事第二波传播的正门。
6. `stage-debug/` 空目录清除；sound/records 血统三件的 guide 路径同步。

## 四 · 未决项（候船长/架构师）

| # | 事项 | 建议 |
|---|---|---|
| 1 | 两工作树关停：`tape0-stage`（stage/amber 已并入+已 tag）、`tape0-night2`（内容已取回+已 tag） | 船长确认会话已关后：`git worktree remove ../tape0-stage ../tape0-night2 && git branch -d stage/amber && git branch -D audit/night2`（末梢均有 archive/* 标签兜底） |
| 2 | 根部活账收摄（FEEDBACK-SOUND/-STAGE、舞台手记、冰箱登记簿） | SOUND 轨 M26 无席位但台账尾在 M2.5§C——留 M26 §D CURATOR 收摄，本轮不动 |
| 3 | 历史清史 | 按 G6 镜像日执行；HEAVY_INVENTORY §三 即执行清单 |
| 4 | 编年缺档（M2.3、SOUND-R3/R4、NIGHT-2 令） | 架构师若有原文可补入 orders/（INDEX 已留缺档注） |
| 5 | `runs/` ~537MB | `runs/dubs/` 两支 62MB 系 media-mt2 重复件可清；余按 prune.mjs 政策 |
| 6 | check:media 未挂强制钩 | 现为 npm script＋prepublish 自觉；要强制需 core.hooksPath，候裁 |

## 五 · 建议船长删除的本地原件（内容均已入仓/入 Releases，删除权在你）

**~/Downloads/**（19 件）：
FOLEY_ORDER_{SOUND_R2, M24_DUAL, M24, M24_1(重复件), M25, M26, AUDIT_FINAL, ARCHIVE1}.md、FOLEY_DESIGN_DUB.md、FOLEY_RECORDS_DOSSIER_v1.md、FOLEY_LAUNCH_KIT.md、FOLEY_CAPTAIN_ACCEPTANCE.md、TAPE0_ORDER_{M18_DUAL, M19}.md（与库内逐字节核同）、TAPE0_WHITEPAPER_SENSES_v1.md（旧 v1 草稿；库内已 v2，v1 原文在 git 历史）、foley-dub-storm.mp4＋foley-dub-storm (1).mp4（已挂 media-mt2 且核同）、foley-dub-storm.png（海报帧仓内在档）、FOLEY_ORDER_{M21, M22, SOUND_R1}.md（此前已入仓）。

**仓库本地**：`audit/b`、`audit/c`（NIGHT-1 浸泡残渣：空目录＋被忽略日志）。

—— ARCHIVE-1 毕。逛馆入口：[`docs/README.md`](docs/README.md)。
