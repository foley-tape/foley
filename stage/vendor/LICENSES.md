# stage/vendor/ 第三方件登记（M-T2，设计案 §3 授权：构建期 vendor 入库；运行时零外网不变）

| 件 | 版本 | 许可证 | 来源 | 用途 |
|---|---|---|---|---|
| `mp4-muxer.mjs` | 5.2.2 | MIT | npm:mp4-muxer（Vanilagy） | WebCodecs AVC → 标准 MP4 封装（fastStart in-memory） |
| `webm-muxer.mjs` | 5.1.4 | MIT | npm:webm-muxer（Vanilagy） | AVC 不可用时 VP9 → WebM 兜底 |
| `gifenc.mjs` | 1.0.3 | MIT | npm:gifenc（mattdesl） | GIF 次级出口（静态颗粒单帧化法，≤8s） |

许可证原文见 `licenses/`。更新法：`cd stage/tools && npm i`（package.json 声明式，卫生法）→ 拷 dist 覆盖本目录 → 同步改本表版本行。
