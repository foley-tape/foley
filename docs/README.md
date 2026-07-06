# 档案馆 · 一张地图

**Foley 的完整建造史住在这里。** 活代码在仓库根（engine/ stage/ sound/ cli/ …），历史的重量全部沉在 `docs/` 与 `/audit/`——每一道命令、每一轮交付、每一次审计，原文可查。
*(EN: the full build history of Foley — every order, round archive, and audit. Start here.)*

## 你想看什么

| 想看 | 去哪 |
|---|---|
| 这台机器凭什么这样设计（正典） | [`canon/`](canon/)：琥珀宪法（视觉）· 感官白皮书（声音，文件内 v2）· TAPE0 SPEC v0.1（协议，冻结） |
| 建造顺序——四天里发生了什么（7-04 M0 → 7-07 发布前夜） | [`orders/INDEX.md`](orders/INDEX.md)：19 道施工令按时间轴编号，缺档处如实注明 |
| 某一轮到底交付了什么 | [`records/README.md`](records/README.md)：逐轮索引；每夹一份 `_index.md`（做了什么/关键裁决/令指向） |
| 谁裁的、为什么这么裁 | [`decisions/`](decisions/)：命名、优先级、唱片血统档案＋各次入宪裁决索引 |
| 有没有人往死里测过它 | [`/audit/`](../audit/)：NIGHT-1 封版前红队、NIGHT-2 发布前四队审计（含冷读者庭与浸泡报告） |
| 怎么给机器换唱片 | [`guide/records-guide.md`](guide/records-guide.md)：淘碟指南（人类 CC0 区置顶，AI 生成区诚实标注） |
| 发布闸门现在什么状态 | [`launch/GATE.md`](launch/GATE.md)：权威记分牌＋发布工具箱＋船长验收协议 |

## 读史三步法

1. **先读令**：[`orders/INDEX.md`](orders/INDEX.md) 从 01（M1.5 校准）读到 19（本次归档令）——架构师的每一步意图。
2. **再看账**：每道令对应 [`records/`](records/) 一夹，`_index.md` 三行讲完本轮；FEEDBACK 快照是施工方的如实汇报。
3. **最后过审**：[`/audit/`](../audit/) 里是不留情面的对抗审查——发现、复现脚本、修复去向（TRIAGE）一应俱全。

## 重媒体政策（为什么仓库这么轻）

**仓库存指纹不存重媒体**：>5MB 的视频/音频真身挂 GitHub Releases，库内只留海报帧＋meta＋SHA-256。
总账：[`records/HEAVY_INVENTORY.md`](records/HEAVY_INVENTORY.md)。货架：[`records-v1`](https://github.com/foley-tape/foley/releases/tag/records-v1)（出厂唱片）· [`media-mt2`](https://github.com/foley-tape/foley/releases/tag/media-mt2)（接带屏录）· [`media-archive-v1`](https://github.com/foley-tape/foley/releases/tag/media-archive-v1)（历代性格照/定妆照）。

## 命名法速查

- 归档件一律带 `@轮次` 后缀（`舞台手记@M2.1.md`）；根目录同名不带后缀者是**活版**。
- 轮次代号：`mNN`＝主里程碑 · `mt1–3`＝舞台 M-T 轮 · `sound-r1–4`＝声音轮 · `night1/2`＝审计夜。
- 本馆由 ARCHIVE-1 令（[`orders/19-archive1-repo-archive.md`](orders/19-archive1-repo-archive.md)）成形：只动组织、不改内容，全部移动映射在各批提交信息里。
