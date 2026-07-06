# 重媒体总账（HEAVY_INVENTORY · ARCHIVE-1）

> 盘点口径：git 全历史 blob >5MB（`git rev-list --objects --all`）＋ HEAD 现存 ≥5MB ＋ 未入库大堆。
> 现行法：**仓库存指纹不存重媒体**（§0.5）；>5MB 新增二进制由 `scripts/check-heavy-media.mjs` ＋ `.gitignore` 拦。文本大件（CSV 金 fixture）白名单豁免。

## 一 · HEAD 现存 ≥5MB（处置后仅余活资产）

| 文件 | 大小 | 处置 |
|---|---|---|
| `docs/assets/hero.gif` | 11.5MB | **留仓**——README hero 活资产（M2.5 §B 置件） |
| `stage/fixtures/busy.curve.csv` | 8.2MB | **留仓**——金测试 fixture，文本白名单（mt2 清单既裁） |

## 二 · 本轮迁出（ARCHIVE-1 → Releases）

| 批 | 件数 | 去处 | 指纹 |
|---|---|---|---|
| m19 性格照 30s ×5（6.4–7.0MB） | 5 | [`media-archive-v1`](https://github.com/foley-tape/foley/releases/tag/media-archive-v1) | `m19/RELEASES-MANIFEST.md` |
| m21 性格照重拍 30s ×5（7.5–7.6MB） | 5 | 同上 | `m21/stage/RELEASES-MANIFEST.md` |
| m22 live 定妆照 30s（7.6MB） | 1 | 同上 | `m22/stage/RELEASES-MANIFEST.md` |
| mt1 撕纸仪式屏录（13.7MB） | 1 | 同上 | `mt1/stage/RELEASES-MANIFEST.md` |
| mt3 live 定妆实录（9.4MB，原存 stage 工作树 runs/，未入过库） | 1 | 同上 | `mt3/stage/RELEASES-MANIFEST.md` |
| M-T2 真接带 ×3（62–63MB，e160e0d 已摘出 HEAD、当时**待挂**） | 3 | [`media-mt2`](https://github.com/foley-tape/foley/releases/tag/media-mt2)（本轮实挂，字节核同） | `mt2/stage/RELEASES-MANIFEST.md` |

迁出即 `git rm`＋`.gitignore` 挡再入；本地盘上原件保留（删除权留船长）。

## 三 · 仅存历史的 >5MB blob（HEAD 已无）

| blob | 来源 |
|---|---|
| 62–66MB ×3 | mt2 三支接带（e160e0d 摘除前的提交） |
| 6.4–14.4MB ×12 | 本轮迁出的 m19/m21/m22/mt1 视频 |
| 7.7MB ×2 | `busy.curve.csv` 旧版本 |
| 11.5MB | `hero.gif`（现版本在 HEAD，历史另有旧版） |

**清史方针（既裁，mt2 清单 L-1/G6）**：私库存全史不改写；发布日开**公开镜像**时以干净历史一并清出。ARCHIVE-1 不执行 force-push 改史——`.git` 现约 392MB，镜像日预期 <40MB。若架构师改裁"私库也清史"，前置条件：全部工作树关停＋分支归档毕（已毕，见 archive/* 标签）＋船长令 force-push。

## 四 · 未入库大堆（本地）

| 堆 | 大小 | 状态 |
|---|---|---|
| `runs/` | ~537MB | .gitignore 挡；跑批产物默认可弃（M2.0 §1.2）；`runs/dubs/` 有 mt2 接带重复件 |
| `dist-records/` | ~23MB | .gitignore 挡；Releases 打包产物，上传后即弃 |
| `sound/records/*.mp3` | — | vendored 播放位；真身在 Releases `records-v1` |
| `audit/b`、`audit/c` | ~0 | NIGHT-1 浸泡残渣（空目录＋被忽略日志），候船长清 |
