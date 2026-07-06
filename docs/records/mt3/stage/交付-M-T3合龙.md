# M-T3 音画合龙 · 交付件（Track-STAGE，M2.4 §C）

> 输入件：FOLEY_ORDER_M24 §C。分支 `stage/amber`。**本件候复核庭（M-T3 必过庭，§0.8）。**
> 重媒体归档策（§0.5）首执行：**本夹只存指纹不存重媒体**——meta＋海报帧＋SHA-256＋影子入库；
> 三支视频留 `runs/dubs-mt3/`（本地）＋标记 **GitHub Releases 待挂**（挂载归 Track-RELEASE §B.3）。

## 一、交付对照（§C.1）

| 项 | 状态 |
|---|---|
| 消费 `renderCuts(cuts, tape) → PCM` | ✔ serve 中继 `POST /dub/render-audio`（五带白名单→临时 cuts→spawn `cli render-cuts`→WAV+meta 头）；浏览器解 PCM16→Float32 喂编码器。dub 授权卫生沿声侧默认：**无唱片**，音源=machine+foley，接带音 PCM 内含 |
| AAC 优先 | ✔ `AudioEncoder isConfigSupported('mp4a.40.2')` 探测 → mp4 内封（mp4-muxer audio 轨）。实测 storm/jam 皆走 AAC LC 48k mono 128k |
| Opus/webm 兜底 | ✔ AAC 缺席→Opus＋整链降 VP9/webm；VP9 亦缺→mp4 无声＋注明；webm 不封 AAC 同样如实注明（矩阵全分支在码） |
| 编码器缺席无声注明 | ✔ 三层 note 落 `meta.audio`（缺 WebCodecs／缺编码器／无生带）——日带 2026-07-05 实测走此路（`404 该带无生带`→无声出片+注明），诚实分支有真章 |
| AV 同步影子 ≤1 帧 | ✔ **storm Δ16.8ms／jam Δ0.6ms**（帧预算 33.3ms，informational 首轮绿）。构造保证：音画同轴零起点、视频延至音尾；容器复测 47.19s 双流一致 |
| dub.meta `audio:` 段 | ✔ {codec/sampleRate/bitrate/durationSec/source=machine+foley/withRecord=false/records=[]}＋sync 数字；无声时 {codec:'none', note} |

## 二、轴常数发现与剖段（本轮工程主发现，候追认为变体⑤）

**两轨折叠常数不齐**：舞台折叠帽 `GAP_CLAMP=400ms`（stage/js/replay.js），声侧压缩帽 `1500ms`（sound/core.js buildTrack）——段内含折叠步时音画时长必然分家（storm 第三桥含 1092s 大接带，若直递将漂 ~69ms≈2 帧，且波及全部后续段）。

**剖段解法（消费侧，不越栏、不动金件）**：`DubSchedule` 在每个 raw dt>400ms 的样本步剖开子段，折叠桩退场——**桩不是内容，是折叠残段；剖点即接带**：纸上落痕（markSeam）、声里落"噗"（renderCuts 段间 splice burst）、齿孔不打（齿孔=剪的提议记号，折叠痕=素材自己的接带）。剖后每子段内两轴逐 ms 恒等，同步靠构造成立。低于声侧最小渲染颗粒（520ms 成片）的观感残段整段弃。cuts 正典（doc.segments/金件）不动；**预览与胶印同吃剖后表——同源不裂**。另设 `unfoldStageT`（foldRawT 的逆，样本点恒精确）供 renderCuts 的原始相对 ms 域。

记案提请（不阻塞）：两轨折叠常数是否归一（400 vs 1500），归 FIX/SOUND 轴主裁量。

## 三、实测（回看律三查＋听感信号代理）

| 查 | 实证 |
|---|---|
| 流参数 | storm 47.19s：h264 Main 1080p30 11.7Mbps ＋ **aac LC 48kHz mono 120kbps** 双流 ✓ |
| 信号非空 | 活跃段（10–40s）RMS −22.1dB、峰 −0.05dB（无削波报告；峰=接带噗/强触发瞬态） |
| 尾静默 | 末 1.5s RMS/峰 **−inf**——正格终止＋≥2s 静默的"停止即静默"在成片末端字面成立；尾段视频=机器歇场帧（纸停针垂，见 `storm-歇场尾帧.jpg`） |
| 渲染速度影子 | storm 8.26×／jam 8.29×／日带 9.1× 实时（目标 ≥2×；音轨渲染在壁钟外的 serve 中继侧，约 +3s/带） |

## 四、指纹（重媒体新策：仓存指纹，视频在 `runs/dubs-mt3/`，Releases 待挂）

```
621cc6063d39ba5f9397d75bd3728d04578d88e137aafc561ea24723a9e9da41  foley-dub-storm-2026-07-06.mp4   （47.2s 有声 AAC）
1f876a792c14a6189762d52a055883b1f8585c46d8027d2675df2f4a41428019  foley-dub-jam-2026-07-06.mp4     （48.2s 有声 AAC）
dacc5c6b3070e3cf32062331cc6edc898be2e102e6d3151a31a4e678fedf8c31  foley-dub-2026-07-05-2026-07-06.mp4（45.0s 无声注明·日带无生带）
```

## 五、候点

- **过庭**：本件为庭审对象（§0.8 M-T3 必过庭）；复核入口=本夹＋`runs/dubs-mt3/` 三支实体＋`stage/js/{dub,film}.js` M-T3 增量。
- **妈妈测试·接带版真人一测（§C.2）**：有声 storm 已出片，候船长择一位不了解项目者试映、一句转述入档。
- **live 定妆照（§C.3）**：条件未熟如实候——依赖图上它吃 §A.4 唱片落仓（带唱片的 live 实录才是 hero 素材）；唱片名单一落即拍。
- 日带音轨适配（renderCuts 吃生带 JSONL，日卷是 CSV 产物流）——候轴主裁量后补，本轮如实无声注明。
