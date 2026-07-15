# 重媒体总账（HEAVY_INVENTORY · ARCHIVE-1）

> 盘点口径：git 全历史 blob >5MB（`git rev-list --objects --all`）＋ HEAD 现存 ≥5MB ＋ 未入库大堆。
> 现行法：**仓库存指纹不存重媒体**（§0.5）；>5MB 新增二进制由 `scripts/check-heavy-media.mjs` ＋ `.gitignore` 拦。文本大件（CSV 金 fixture）可留开发树，但 `stage/fixtures/**` 一律不进入 npm 包。

## 一 · HEAD 现存 ≥5MB（处置后仅余活资产）

| 文件 | 大小 | 处置 |
|---|---|---|
| `docs/assets/hero.gif` | 11.5MB | **留仓**——README hero 活资产（M2.5 §B 置件） |
| `stage/fixtures/busy.curve.csv` | 8.2MB | **留仓**——金测试 fixture，文本白名单（mt2 清单既裁） |

## 二 · 文本 CSV 与 npm 包体闸（2026-07-15 · 席一交席三）

### fixture 处置

| 文件 | 原账 | 现账 | 处置 |
|---|---:|---:|---|
| `stage/fixtures/busy.curve.csv` | 8.2MB | 8.2MB | 金 fixture 留开发树；由 `package.json#files` 排除 |
| `stage/fixtures/captain.curve.csv` | 13,312,383B | **152,465B** | 从 46.3h 有签源中取连续 220s、原生 10Hz 代表段并将时间归零；不做跨间隙抽点，曲线与卡拍形态原样保留；由包排除 |
| `stage/fixtures/captain.moments.csv` | 56,018B | **1,301B** | 与上述 220s 窗同裁、时间归零；由包排除 |

船长曲线原件 SHA-256：`7d74a59295d6e71c582121fbaef98c752490e11b40d343a402b59f714814c96a`；现行代表段 SHA-256：`b96a6ce8fe32f4d4172d62203ce1bbb5baefb1d2729022a06b6bc6a3336ef340`。原件仍在 git 历史，现行段的窗口与形态验收写在 `stage/fixtures/curation.json` 和 `golden/seal-law.test.ts`。

### 运行资产处置

| 类别 | 处置 |
|---|---|
| 板前死资产 | 删除 `fascia.png` 4,644,992B、`reel.png` 1,922,518B、`vu_face.png` 2,127,968B、`eye.png` 658,164B；合计 **9,353,642B**，运行时代码零引用 |
| 活卷盘条 | `reel_l.webp` 3,314,752B → **567,588B**；`reel_r.webp` 1,685,260B → **401,830B**；仍为 6144×5130 / 120 帧，运行时路径与帧接口不变 |
| 活走纸纹理 | 新增 `paper.webp` **25,360B** 供运行时；`paper.png` 963,471B 仅留美术源并从 npm 包排除 |

活卷盘可复现编码：`cwebp -mt -m 6 -q 22 -alpha_q 60 -metadata none`；走纸纹理：`cwebp -mt -m 6 -q 82 -metadata none`。卷盘按实际帧尺寸目验，走纸纹理按原尺寸目验。

### 包体交接

`npm pack --dry-run --json` 的同树对账：

| 状态 | packed | unpacked | 条目 | fixture 条目 |
|---|---:|---:|---:|---:|
| 剔件前 | 19,771,212B（18.855MiB） | 33,268,930B | 137 | 有 |
| 现行 | **1,966,462B（1.875MiB）** | 2,627,900B | 126 | **0** |

交席三的闸值按十进制 **≤2,000,000B**，现行余量 33,538B；闸应同时断言包内不存在 `stage/fixtures/`、上述四件死 PNG 及开发源 `stage/assets/paper.png`。

## 三 · 本轮迁出（ARCHIVE-1 → Releases）

| 批 | 件数 | 去处 | 指纹 |
|---|---|---|---|
| m19 性格照 30s ×5（6.4–7.0MB） | 5 | [`media-archive-v1`](https://github.com/foley-tape/foley/releases/tag/media-archive-v1) | `m19/RELEASES-MANIFEST.md` |
| m21 性格照重拍 30s ×5（7.5–7.6MB） | 5 | 同上 | `m21/stage/RELEASES-MANIFEST.md` |
| m22 live 定妆照 30s（7.6MB） | 1 | 同上 | `m22/stage/RELEASES-MANIFEST.md` |
| mt1 撕纸仪式屏录（13.7MB） | 1 | 同上 | `mt1/stage/RELEASES-MANIFEST.md` |
| mt3 live 定妆实录（9.4MB，原存 stage 工作树 runs/，未入过库） | 1 | 同上 | `mt3/stage/RELEASES-MANIFEST.md` |
| M-T2 真接带 ×3（62–63MB，e160e0d 已摘出 HEAD、当时**待挂**） | 3 | [`media-mt2`](https://github.com/foley-tape/foley/releases/tag/media-mt2)（本轮实挂，字节核同） | `mt2/stage/RELEASES-MANIFEST.md` |

迁出即 `git rm`＋`.gitignore` 挡再入；本地盘上原件保留（删除权留船长）。

## 四 · 仅存历史的 >5MB blob（HEAD 已无）

| blob | 来源 |
|---|---|
| 62–66MB ×3 | mt2 三支接带（e160e0d 摘除前的提交） |
| 6.4–14.4MB ×12 | 本轮迁出的 m19/m21/m22/mt1 视频 |
| 7.7MB ×2 | `busy.curve.csv` 旧版本 |
| 11.5MB | `hero.gif`（现版本在 HEAD，历史另有旧版） |

**清史方针（既裁，mt2 清单 L-1/G6）**：私库存全史不改写；发布日开**公开镜像**时以干净历史一并清出。ARCHIVE-1 不执行 force-push 改史——`.git` 现约 392MB，镜像日预期 <40MB。若架构师改裁"私库也清史"，前置条件：全部工作树关停＋分支归档毕（已毕，见 archive/* 标签）＋船长令 force-push。

## 五 · 未入库大堆（本地）

| 堆 | 大小 | 状态 |
|---|---|---|
| `runs/` | ~537MB | .gitignore 挡；跑批产物默认可弃（M2.0 §1.2）；`runs/dubs/` 有 mt2 接带重复件 |
| `dist-records/` | ~23MB | .gitignore 挡；Releases 打包产物，上传后即弃 |
| `sound/records/*.mp3` | — | vendored 播放位；真身在 Releases `records-v1` |
| `audit/b`、`audit/c` | ~0 | NIGHT-1 浸泡残渣（空目录＋被忽略日志），候船长清 |
