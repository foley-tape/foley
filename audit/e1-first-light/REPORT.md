# E1 · 首光（第一分钟的价值时刻）· 首轨交付

- **奉令**：《第五号手令》丁-E1（体验期首轨，按序开轨）。本轨交 E1 的可即验部分；diegetic 邀请方案（今晨的纸/演示带自荐）**候设计**，另卡。

## 交付

### E1-a · 终端输出静音化（两行：监听中＋URL，其余入 --verbose）
`stage/serve.mjs`：新增 `verbose`（`--verbose` 或 `FOLEY_VERBOSE=1`）＋`vlog()`；`[boot]/[card]/[dub]/[live]` 机器内务一律改 `vlog`。默认输出恰**两行**：
```
♪ TAPE·ZERO · 监听中
  stage @ http://127.0.0.1:4173/
```
- 卡片产出的宣告**归舞台**（SSE `card`→台上撕卡），不喧哗终端（`[card]` 落 verbose）。
- `stage @` 就绪令牌保留在 URL 行——14 处就绪探测（4 金测试＋工具/复现）零改照跑。
- 证：默认 2 行、`--verbose` 3 行；`g8.bootstrap`＋`cards`＋`night2.security` 40/40 绿。

### E1-b · PLAY 呼吸示能（唯一亮起 → 手势 → 房间醒）
`stage/index.html`＋`stage/css/stage.css`＋`stage/js/main.js`：
- 手势前 `#room.pre-gesture`：机器微暗待机，`#play-cue`（琥珀呼吸微光＋silk「Play」）是**唯一亮起**——diegetic 机器灯语，非现代弹窗按钮。
- 首个 `pointerdown`：撤 `pre-gesture`（机器 1.4s 亮起"醒"）＋ `#play-cue.gone` 退场——**声＋光同醒**。
- `prefers-reduced-motion` 降级不呼吸。
- 证：`shots/{pre,post}-gesture.png`——前（机器暗＋PLAY 琥珀呼吸）／后（机器亮·VU 摆·记录仪落墨·PLAY 退场），零页错。**同时补齐 丙.3 的 PLAY 半**（手势解锁的唯一亮起示能）。

### E4 顺手一寸 · 标签页暖化
`stage/index.html`：`<title>TAPE·ZERO ♪</title>`＋暖琥珀双盘 favicon（SVG data URI，供带盘薄·收带盘厚的机械诚实缩影，深褐底）。标签页也是机器的一寸——退默认网页冷味。证：title/icon 到位、零页错/控错。

## 汇总
金测试 **144/147**（3 例 b4.factory 环境隔离缺口，与本轨无关）＋`tsc` 干净。改动面：`stage/serve.mjs`、`stage/index.html`、`stage/css/stage.css`、`stage/js/main.js`——全加法/静音化，无既有逻辑破坏。

## 候（E1 剩项·另卡）
- **diegetic 首启邀请**（今晨的纸/演示带如何自荐，不许现代弹窗）——**候设计**（决 4 已明列）。
- PLAY cue 位置/呼吸克制度、机器"醒"的缓速手感——**候船长真耳/眼**（船长十分钟）。

（第五号手令 · 丁-E1 首光 · 一人全角色 · 2026-07-08）
