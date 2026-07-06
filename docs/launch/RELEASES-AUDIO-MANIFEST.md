# 出厂音频清单 · Releases 权威哈希表（M2.5 §C 终包）

> 原则（§0.3/§0.5）：**音频不进 tarball/repo，真身挂 GitHub Releases，仓库存指纹**
> （catalog/records.manifest/PROVENANCE/本表）。取回唯一通道 = `foley records fetch`
> 明示征询（§0.2：URL/体积/SHA-256 直呈，同意才取，验哈希落盘；拒绝照常起播——
> 无唱片走房间层，无床音走 fallback 合成织体，同构退路，结构不因资产缺席而变）。

## Release `records-v1`（私库已挂，2026-07-06 回环互证通过；镜像日重挂见文末）

| 类 | 文件 | 字节 | SHA-256 | fnv（引擎哈希原料） | 指纹留仓处 |
|---|---|---|---|---|---|
| 唱片 | `saturation.mp3` | 6240163 | `340a14dffd98001edbae1e7da16e2b9f8f54e0687cd215fa5dfc0b351f4777c2` | 721006f9 | catalog＋PROVENANCE#saturation |
| 唱片 | `still-life.mp3` | 5395363 | `f33eb15592fac175217781fc976df2f6a4336eb716b57887b57691e5fc572c47` | e3083d17 | catalog＋PROVENANCE#still-life |
| 唱片 | `warm-fuzz.mp3` | 6905485 | `974ffd083b09aecbe60412f3376db07fb241adbbb0abf89698a22229a2de02c6` | 8e2a36e5 | catalog＋PROVENANCE#warm-fuzz |
| 床音 | `l1-roomtone.wav` | 1017644 | `7067f0b7066dae279bfd4b7fa7b551904502de646c15b803487e0b89fb27c59a` | 74926c22 | sound/assets/manifest＋LICENSES |
| 床音 | `l1-filmstatic.wav` | 812844 | `18750e77904d3e7ce9b0302d2bb341ea44acdcc765de55d585f7f7ad6787b5c2` | 09ec2fd2 | sound/assets/manifest＋LICENSES |
| 床音 | `l1-crackle.wav` | 1171244 | `413cd877cf9153412ce51d7b1b76abdf1a906833e73c3ca50df3a03b38606d25` | 10233947 | sound/assets/manifest＋LICENSES |

（附 `SHASUMS256.txt` 同挂 Release。sha256 权威源 = `records.manifest.json`，fnv 权威源 =
catalog.json／sound/assets/manifest.json——清单由 `scripts/pack-records.mjs` 一次生成，不手抄。）

## 回环互证记录（2026-07-06）

`gh release download records-v1` 全量回环：**六件四维全符**（Release 下载字节 ↔ records.manifest
↔ SHASUMS256.txt ↔ 字节数）。互证脚本径：下载→`shasum -a 256`→与本表逐件比对，一致即原件。

## 镜像日重挂（拆闸③ 机械步骤，公开库 `foley-tape/foley`）

1. `node scripts/pack-records.mjs --repo foley-tape/foley --tag records-v1`（重出 dist-records/，哈希应与本表逐字节同）
2. `gh release create records-v1 dist-records/* --repo foley-tape/foley --title "出厂音频 records-v1"`（公开库）
3. 干净环境 `npx foley records fetch` 走一遍征询（同意路径）→ 六件落 `~/.foley/{records,assets}/factory/`，哈希校验由取件器自动执行
4. manifest 内 URL 无需改动（owner/name 同名，挂上即通）

## 首启征询文案（口径依据）

文案实现于 `cli/records-fetch.ts`（§0.2 原文照搬：零静默网络红线声明＋逐件 URL/体积/SHA-256
直呈＋同意/拒绝双路后果）。《FOLEY 发布工具箱》未在仓库案头——**口径以 §0.2＋GATE 现文对齐；
若工具箱文案有出入，一句话即改（上报架构师裁）**。
