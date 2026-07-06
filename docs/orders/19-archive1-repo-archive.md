<!-- 原名：FOLEY_ORDER_ARCHIVE1.md ｜ 船长桌面原件复制入仓（ARCHIVE-1），正文未改；原件删除权留船长 -->
# FOLEY 施工令 · ARCHIVE-1 仓库归档与结构化（专职新终端）

> 阅读对象：**专职新会话**（勿用现役任何施工轨——本轮大范围移动/删除路径，与冲刺三轨必然踩踏）。
> 性质：结构重整＋历史留存。**只动组织,不改内容**:一切源码、参数、判据、资产的**内容**一字不改,只搬位置、建索引、清冷存。开工先 `git rev-parse HEAD` 存锚、切 `chore/archive` 分支;每一批移动单独提交、提交信息列清移动映射(交付即合并法)。

---

## 0. 一条原则

**活的东西整洁可导航,历史的重量沉进带地图的档案馆。** 逛进仓库的人,先看到一部清晰的建造史,而非一地施工垃圾——这部档案本身是发布第二波传播的素材(过程故事长文的引用来源)。

## 1. 目标结构

```
foley/
  README.md  README.zh.md  LICENSE  package.json
  engine/ adapter/ protocol/ cli/ sound/ stage/    # 活代码,原位
  docs/
    canon/        # 宪法(琥珀)、白皮书(感官)、协议规范——正典,单列
    orders/       # 全部施工令,编年命名 NN-<slug>.md(见 §2)
    decisions/    # 命名决议、优先级正典、血统条款、各次"入宪"裁决,单列成篇
    records/       # 按里程碑归档,每里程碑一目录(见 §3)
    guide/        # 面向用户:淘碟指南、（未来）使用文档
    launch/       # GATE.md、发布工具箱、runbook
  audit/          # 历次审计报告归档(night1/night2/final/…),源码零改
```

## 2. 施工令编年

现存施工令命名散乱(TAPE0_ORDER_M15…、FOLEY_ORDER_…、SOUND_R*、NIGHT*、DESIGN_DUB…)。统一迁入 `docs/orders/`,前缀两位序号按时间轴排,原名保留在文件内首行注释(可追溯):
`01-spec.md, 02-order-m15.md … NN-order-m25.md`;设计案(DUB)、夜审令、声音令各就其位、序号连续。产出一张 `docs/orders/INDEX.md`:序号→原名→一句话主旨→里程碑归属。

## 3. records 里程碑归档

每个里程碑(M15…M25、各 SOUND-R、各 M-S/M-T、NIGHT)一个子目录,内含当轮的**交接/FEEDBACK/手记/复盘/REPORT/复核庭**快照。散落在船长桌面与仓库各处的历史文档按此归位。每目录一个 `_index.md`:本轮做了什么、关键裁决、指向的正典变更。**桌面原件删除权留船长**——本轮只做"复制入仓并组织",不删船长本地原件。

## 4. 冷存(重媒体与死分支)

- **重媒体**(过程屏录、性格照原片、接带 mp4、盲选 WAV 等,累计数百 MB):移出 git 历史,进 GitHub Releases 或指定冷存;库内 `docs/records/**` 只留**海报帧/缩略图＋meta＋指纹＋Releases 链接**。与发布轮"仓库存指纹不存重媒体"同策,复用其 `.gitattributes`/预警钩。
- **死分支/废弃实验**:列清单,确认无引用后归档标签(archive/*)或删除,主干只留活分支。
- 大文件扫描:`git rev-list --objects --all` 找 >5MB blob,列 `docs/records/HEAVY_INVENTORY.md`,逐条标处置(留指纹/迁 Releases/删)。

## 5. 交付
- [ ] 目标结构落地,每批移动独立提交＋映射
- [ ] orders/INDEX.md ＋ records 各 _index.md ＋ HEAVY_INVENTORY.md
- [ ] 冷存执行(重媒体迁出＋死分支处置)＋防再入钩
- [ ] 一页 `docs/README.md`:档案馆导览(给逛 GitHub 的人的地图)
- [ ] FEEDBACK-ARCHIVE:移动总账＋未决项＋建议船长删本地原件清单

（完）
