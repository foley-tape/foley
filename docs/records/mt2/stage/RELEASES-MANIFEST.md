# 重媒体清单 · Releases 待挂（M2.4 §B.3 / §0.5）

> 原则（§0.5，追认 L-1＋L-2）：**仓库存指纹不存重媒体**——meta＋海报帧留仓，视频迁 GitHub Releases。
> LFS 迁移在多会话并发下否决；历史清史延至发布日公开镜像（G6，私库存全史）。
> 本清单是「移出库」的凭证：视频已从工作树摘除（本地保留、gitignore），仓内只余此指纹＋海报＋meta。

## M-T2 三支真接带（1080p30，9.1× 实时导出）

移出库日：2026-07-06（M2.4 §B.3）。挂载目标：GitHub Release `media-mt2`，asset 名即文件名。校验：`shasum -a 256`。
**已挂**：2026-07-07（ARCHIVE-1 执行上传，三支盘上原件经 sha256 核同后上挂）。

| 文件 | 字节 | SHA-256 | 仓内留存 |
|---|---|---|---|
| `foley-dub-2026-07-05-2026-07-06.mp4` | 66015920 | `a1133da421d5c333948ca179ad691a1648bc376ae7ab09c35893c7eabb3ab36d` | `.poster.png`＋`.png`＋meta |
| `foley-dub-jam-2026-07-06.mp4` | 65160490 | `3d87e24d0dd8a7b0a2d0d5fe459ace68d63be2404f4060551030fce505d6111e` | `.poster.png`＋`.png`＋meta |
| `foley-dub-storm-2026-07-06.mp4` | 65262811 | `6913f57163a66505e64f20c7350cf3b248ad0c221770cec42ebcfc4ce403acb5` | `.poster.png`＋`.png`＋meta；`.gif`（4.6MB，留仓） |

**复挂校验**：下载 Release asset 后 `shasum -a 256 <file>` 比对上表；一致即原件。

## 祖父豁免（L-1 既往不咎，候 G6 清史）

以下历史重媒体本轮**不动**（未过 GitHub 100MB 硬墙，仅 >50MB 建议警告或更小）：
`docs/records/mt1/stage/ritual-tear-storm.mp4`（13.7MB）、`docs/records/m22|m21|m19/**/性格照·live-定妆照 30s mp4`（各 6.4–7.6MB）。
发布日开公开镜像时以干净历史一并清出（私库存全史）。`stage/fixtures/busy.curve.csv`（8.2MB）是金测试 fixture，**留仓不动**。

## 前向闸

`scripts/check-heavy-media.mjs`（>5MB 新增二进制预警）＋`.gitignore` 挡 `docs/records/mt2/stage/*.mp4` 再入。见 [`docs/launch/GATE.md`](../../../launch/GATE.md) G6。
