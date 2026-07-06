# M-T2 复制机 · 交付件（Track-STAGE，M2.3 施工令）

> 输入件：FOLEY_ORDER_M23（M-T1 追认＋四修＋M-T2 主体）。分支 `stage/amber`。
> 本夹：真接带 mp4 三支（storm／jam／2026-07-05 日带）＋PEAK 海报帧各一＋纸条与 meta＋GIF 次级出口首证＋渲染速度影子 JSON＋落台静帧。

## 一、M-T1 四修与裁决执行（M2.3 §1.1–1.6）

| 修 | 实证 |
|---|---|
| ① 60/90 欠交 | 桥段生长帽随目标缩放 `cap = stageMaxS·target/defaultS`（45→96 **恒等**，60→128，90→192）＋grow guard 64→256。**45s 金件五带逐字节不动**（`cut-golden.mjs` 复验 ✓，paramsHash 未变=`7607d8a357e4f99c`，cut-params.json 一字未动）。四档实测：storm 30.0/44.5/57.5/69.5，smooth 30.2/44.7/59.7/71.7，busy 31.5/45.0/54.0/66.0，jam 30.9/44.4/49.5/57.5，silence 29.5/35.5/39.5/47.5——全带严格单调，90≠60。90 档到不了满 90 是文法弧线（锚段上限=设计的弧）＋素材结构的诚实天花板，allowUnderrun 如实放行。**金测试 52 上岗**：四档文法不变量＋严格单调（欠交回归哨）＋富矿三带 0.6×下限＋30s 档 8% 骨骼容差（收缩到锚段文法下限即停，不砍进骨头） |
| ② resting 死区 | 纸条歇台时纸上按下＝清台（条与 mp4 卡同收）＋直入拖选。实测 ✓ |
| ③ 键出画 | `#dub-group` 锚改 `right: calc(9vw + 26px)`（面板右缘 109vw−9vw≡视口右缘）——**操作件永不出画**。极窄 527px 视口实测键右缘 504 在画内 ✓ |
| ④ 转录姿态 | 卡碟态不进演出：DubSchedule 事件表滤 STUCK_LOOP/STUCK_CLEARED＋入场清卡、收场按快照还原。storm 演出全程 `deck.stuck` 恒 false 实测 ✓（其 PEAK 恰含 944s 卡碟窗，此前会纸走轴僵） |
| ⑤ live 双轴 | meta 增 `axis`（tape-stage 折叠轴｜live-stage 直流轴）＋live 手动剪附 `liveEpoch`；消费侧（胶印）凭 liveEpoch 换回原始 t 再走 `foldRawT` 对齐折叠轴（replay.js 新出口）。live 实测候日带轮（无活 live 会话，代码路径审读＋replay 侧同式验证） |
| ⑥ 移交件 | `stage/js/cut.d.ts`＋`replay.d.ts` 手写声明——TS7016 绝迹（tsc 过滤验证）；launch.json `stage-dub` 指向改 `tape0/stage/serve.mjs`（挂点不再悬于工作台） |
| 影子改判落地 | 报表侧执行（`cut-golden.mjs`/`dub.mjs`）：选择效率=正式影子（阈值候两轮）；raw=记述；盈余=体检。**cut-params.json 未动**——paramsHash 不变，金件与既有 meta 全链免疫 |

## 二、M-T2 主体：离线逐帧渲染 → WebCodecs AVC → MP4

**同源纪律（铁律③的机器形）**：
- `DubSchedule`（dub.js 抽取）——台上齿孔演出与胶印**同吃一份时刻表**，调度只有一份。
- 件台（`#film-rig`，隐藏但有布局）跑的是**与台上完全相同的器件类**：ChartRecorder（纸位图逐帧 drawImage 直取）、ReelDeck（theta/wow 物理直读）、Lamps（钨丝包络经 `--lit` 读回）、PacketPair（恒迟一包重建，`_clock` 实例级虚拟钟——收包钟换成 dub 钟，law 不变、钟源可换，帧网格上的插值就此确定）。
- 静态机身一次性制版（foreignObject 矢量栅格 → k 尺位图），动态件逐帧执笔；针在玻璃下的三明治分层与 DOM 同序。

**编码链（设计案 §3）**：`isConfigSupported` 探测 → `avc1.4d0034`（Main）优先 → mp4-muxer 封装（fastStart in-memory）；AVC 缺席 → VP9+webm-muxer；WebCodecs 缺席 → 诚实拒印、纸条照旧。三件封装器 vendor 入 `stage/vendor/`（MIT，登记 `LICENSES.md`＋许可证原文），运行时零外网不变。1080p30 ≈ 11.5Mbps 实测（预设 12M，动态颗粒吃码率宁高勿糊）；720p 预设减半可选（`?preset=720p30`）。

**交互（§2.4/2.5 补全）**：撕开→进入渲染——台上转录戏（双轴 8× 快穿、计数轮飞转、纸位标 traverse，机器手势非内容回放），无进度条无数字；印毕 mp4 卡（**PEAK 海报帧作卡面**）落在纸条旁的胡桃木上，点卡落盘、点条落纸。

**渲染速度影子（informational，目标 ≥2× 实时）**：

| 带 | 编码 | 帧数 | 片长 | 壁钟 | 实时倍率 |
|---|---|---|---|---|---|
| storm | avc1.4d0034/mp4 | 1335 | 44.5s | 4.9s | **9.14×** |
| jam | avc1.4d0034/mp4 | 1333 | 44.4s | 4.8s | **9.17×** |
| 2026-07-05（日带） | avc1.4d0034/mp4 | 1350 | 45.0s | 4.9s | **9.15×** |

**GIF 次级出口首证**：storm PEAK 居中 7.68s／640×360／12fps，**静态颗粒单帧化法**（整支同一张粒，调色板不被逐帧噪声吃光；gifenc vendor）。面板无 GIF 交互——出口留给发布物料轮驱动。

**妈妈测试·接带版首证（自证＋候真人）**：storm 45 秒弧线——快进的平静开场→纸带飞驰的桥→阶梯爬升→高原（原速，针压红区，卡碟窗在内）→断崖→衰减→DONE 落针纸停。段界皆有接带痕，无解说、无文字。真人一测候船长择人（mp4/GIF 皆可用作测试材料）。

## 三、素材诚实与确定性

- 三支皆真带回放：storm/jam=fixtures 副本；日带=`runs/live-2026-07-05`（自 tape0 主检出搬入工作台 runs/ 作胶印素材，tapeHash 记两件套）。dub.meta.json 记录选段窗口/哈希/预设/film 统计与落盘名。
- cuts 与逐帧调度严格确定（虚拟钟）；**像素不保证跨机逐字节**（GPU/字体栅格差异）——如实标注于 meta 与代码注。
- 隐私：帧内只有器件读数与墨迹；meta 无会话文本。

## 四、已知界限

- 画布复描件（烟玻璃两层、琥珀辉光、双宝石）为 CSS 同数近似，与 DOM 栅格有 ≤一档的材质微差；VU 表芯为矢量三明治，无差。
- 镜头漂移不入胶印（离线相机自有脚架）；颗粒/暗角照常。
- 胶印依赖视口几何：窗口折叠（0×0）时诚实拒印（"视口不可用"）。
- 声轨缺席如实注明 `audio: none`——M-T3 候声音过耳合龙（renderCuts 钩子预提请已在 FEEDBACK）。
- 200MB 视频交付物直接入库（records 完备性优先）；发布物料轮宜裁一份"重媒体归档策"（LFS 或轮转）。
