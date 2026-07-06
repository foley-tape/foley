# EAR_MACHINE v3 —— 机器耳朵（SOUND-R3 §3：唱机改造——改口径，不换庙）
engine e160e0d / params aac8e0db / verdict 20af9b64 / **sound-params 8ac2c5c6** / **assets 6cc0c971** / **records cce9b3fe**
离线渲染 48000Hz · 确定性 · 判定对象=渲染波形（门规：账本只作接线自检，永不作发声证明）· 含 1× 原速段 60s · 渲染 20.4s
总纲（R3）：音乐由唱片供给，信息由机器供给。F5 v2：唱片恒电平，T 的表达=处置（低通/wow/磨损）。
唱片解码：ear=afconvert / 页=decodeAudioData（PCM 不逐位一致，定标锚同源 catalog.lufs——响度一致到解码器差异）。

| 门 | 判据 | 实测 | 判定 |
|---|---|---|---|
| G1 停止即静默 | 停止硬闸后 1s 窗 RMS < −60 dBFS——含唱片路径 | -180.0 dBFS（storm 带+唱片在位，停于 5s，预排前景×2 同殁） | ✅ PASS |
| G2 总闸有效 | trimDb ±12dB 两次渲染（唱片在位），总线 RMS 差 ≥ 10dB | Δ=22.7 dB（+12: -8.4 / −12: -31.2 dBFS） | ✅ PASS |
| G3 床响度守设计 | 五带各 30s，master RMS 落设计值 ±3dB | silence -23.8/-23.6(Δ-0.2)｜smooth -23.8/-23.8(Δ-0.0)｜busy -23.8/-23.7(Δ-0.1)｜jam -23.6/-23.6(Δ-0.0)｜storm -23.6/-23.5(Δ-0.1) | ✅ PASS |
| G7 响度门 v3 | 唱片在位总线积分响度（K加权门控，中张力 1× 段）= -20±2 LUFS | -20.87 LUFS（盘：saturation） | ✅ PASS |
| G6 体验门·织体占用度 | 房间层（无唱片态）中张力 1× 段 200Hz–8kHz 八分带 ≥5 带 > −55dBFS | 8/8 带过线（200-317:-34 317-503:-38 503-798:-38 798-1265:-36 1265-2006:-37 2006-3181:-42 3181-5045:-49 5045-8000:-54） | ✅ PASS（informational） |
| G4v2 处置-张力（谱） | storm 60s 唱片在位（recG 单渲，低通冻结对照消融）：HF 占比差分(8s 窗) × T 负相关 r ≤ −0.5 | r=0.037（13 窗） | ℹ️ 记分（informational） |
| G5 呼唤穿透 | 跳针触发时，其频谱专区能量高于床 ≥ 6dB | Δ=-4.4 dB（事件 -38.8 / 床 -34.4 dBFS @16.5s 床峰） | ℹ️ 记分（informational） |
| G8 跳针可辨 | STUCK 段八分带谱距离（对前后段均值）≥ 6dB 且 ≥ 2× 前后互距基线 | 卡碟谱距 3.2dB / 基线 4.2dB | ℹ️ 记分（informational） |

**active 门（G1/G2/G3+G7v3）：✅ 全绿**

## G3 明细（房间层口径=无唱片态，master 床单渲，30s/带）
| 带 | 设计 dBFS | 渲染 dBFS | Δ |
|---|---|---|---|
| silence | -23.6 | -23.8 | -0.2 |
| smooth | -23.8 | -23.8 | -0.0 |
| busy | -23.7 | -23.8 | -0.1 |
| jam | -23.6 | -23.6 | -0.0 |
| storm | -23.5 | -23.6 | -0.1 |

## 资产清单（L1 织体体；CC0 逐条溯源见 sound/assets/LICENSES.md）
| 文件 | 时长 | 内容哈希 | 授权 | 作者 |
|---|---|---|---|---|
| l1-roomtone.wav | 15.9s | 74926c22 | CC0-1.0 | leonelmail |
| l1-filmstatic.wav | 12.7s | 09ec2fd2 | CC0-1.0 | joedeshon |
| l1-crackle.wav | 18.3s | 10233947 | CC0-1.0 | 3bagbrew |

## 唱片清单（出厂唱片；CC0 逐条溯源＋家谱三件套见 sound/records/{LICENSES,PROVENANCE}.md——血统条款 §0.1）
| 文件 | 时长 | BPM | LUFS 锚 | 内容哈希 | 授权 | 作者 |
|---|---|---|---|---|---|---|
| saturation.mp3 | 156s | 60 | -13.38 | 721006f9 | CC0-1.0 | HoliznaCC0 |
| still-life.mp3 | 134.9s | 77 | -14.73 | e3083d17 | CC0-1.0 | HoliznaCC0 |
| warm-fuzz.mp3 | 172.6s | 63 | -17.67 | 8e2a36e5 | CC0-1.0 | HoliznaCC0 |
