# 淘碟指南（M2.4 §A.5 首版）——给想给机器换唱片的人

> **血统条款（M2.4 §0.1 入宪，原文置顶）**：内置唱片必须人类制造；每首 vendored 曲目配
> PROVENANCE 三件套（来源链接／许可证快照／作者身份）。AI 生成目录（open-lofi 等）不入厂机，
> 入淘碟指南页并诚实标注"AI 生成（Suno v5）·CC0"。用户唱片架（`~/.foley/records/`）内容属用户自治。

机器吃什么盘：**72–85 BPM、无人声、器乐温暖、可长循环**（R3 §1 选曲标准；BPM 出窗会让
量化网格与唱片相位打架）。上架即播：文件放 `~/.foley/records/`，probe 页 `?record=名字` 选盘，
HUD ⏭ 换盘。用户架三不：只读、不复制、不上传（磁带机吃磁带，授权归零）。

## 人类 CC0 区（可入厂机；入厂前逐曲三问：来源页在哪？许可证原文？作者是谁？）

| 源 | 说明 | 授权 |
|---|---|---|
| [HoliznaCC0](https://holiznacc0.bandcamp.com/) | 人类音乐人 Holizna 的 CC0 专辑群（lo-fi/环境向都有）——R3 起在案备选 | CC0-1.0 |
| [FreePD](https://freepd.com/) | 多位人类作曲者捐入公共领域的曲库，按风格分类——R3 起在案备选 | CC0/PD |
| [Musopen](https://musopen.org/) | 公共领域古典录音（录音与曲谱授权分开核，逐曲确认 recording license = PD/CC0） | PD/CC0（逐曲核） |

**入厂流程**（落仓管道，`sound/records/records.manifest.json` 头注全文）：曲目暂存 `sound/records/`
→ 逐曲填 PROVENANCE 三件套（`PROVENANCE.template.md`）→ `prep-records.mjs` 实测 bpm/lufs/fnv
→ `scripts/pack-records.mjs` 出 Releases 资产＋SHA-256 清单 → 清单粘回 manifest → mp3 移出 repo
（§0.3 唱片不进 tarball）。取回端 `node cli/index.ts records fetch`：明示征询（URL/体积/SHA-256
直呈，同意才取，验哈希落盘；拒绝走房间层）——零静默网络红线的唯一例外通道。

## AI 明示区（不入厂机；用户自治上架自便，来源如实标注）

| 源 | 说明 | 标注 |
|---|---|---|
| [open-lofi](https://github.com/btahir/open-lofi) | 150+ 首 lo-fi，全部 **AI 生成（Suno v5）**，作者 btahir 以 premium 会员身份声明所有权后捐入 CC0；类目含 activities/chillhop/seasonal-weather（天气选曲 27 首在案） | AI 生成（Suno v5）·CC0 |

**沿革诚实注记**：R3 出厂四盘（2-am-debug-loop 等）即出自 open-lofi——当时授权判读与快照留痕
见 `sound/records/LICENSES.md`（复核庭核明物证链闭合）。M2.4 血统条款入宪后按新法退厂：
不再作内置唱片，候船长终裁名单换人类制造盘（委托首版唱片见 §0.4，另路并行）。
判读一句话：授权（CC0 可自由使用）与血统（厂机身份叙事）是两回事——前者过庭，后者入宪从严。
