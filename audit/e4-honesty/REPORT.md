# E4 · 器件诚实修缮（违宪子集）· 交付

- **奉令**：《第五号手令》丁-E4（体验期·决 4 明定"E4 不再是装修，是产品"）。本轨先清**明列的违宪项**（法已写、未实施）；craft/delight 项（笔头微距/纸面纤维/丝印蚀刻/供收带盘演进）候船长真眼，另卡。

## 交付（两项违宪修复，均已实证）

### E4-① · 暗区渐变加抖动（时间法既有条文未实施·列违宪）
**根因（实证）**：`#lens` 与 `#grain` 皆 `overlay` 混合。overlay 在暗处 ≈`2·base·grain`——base→0 则抖动跌破 1 LSB，暗区渐变的**色带无从打散**（暗角与 ASK 琥珀外溢的 banding 即此病）。
**修**：新增 `#grain-dark` 层（`stage/index.html`＋`stage/css/stage.css`）——`screen` 混合、feTurbulence 空间噪声、低不透明（0.045）。screen 在暗处才起效、越亮越淡，恰把抖动放到需要处，不雾化中间调。
**证**（`repro/honesty.mjs` [A]）：同一暗块，抖动 OFF→ON，合成像素局部 **std 0.205→1.117**（stdLift +0.91，色带平台阶被打散）；暗底仅轻抬 4.15 LSB（screen 代价，film-black 可接受）。

### E4-② · 计数轮棘爪回位律（停转必落卡位·永不悬半格）
**根因**：末轮此前连续滚（`shown=digitVal`），停转即可悬在半格（读头停在两齿之间）。
**修**（`stage/js/deck.js` Counter.render）：末轮"停转"（计数不再前进）即朝最近卡位缓落（棘爪咬入齿；含 9→10 回卷位），走带中照旧连续滚。
**证**（`repro/honesty.mjs` [B]）：走带中末轮悬半格；暂停→缓落后 **translateY=88=2×WHEEL_H（距卡位 0px）**——落卡位。

## 汇总
金测试 **144/147**（3 例 b4.factory 环境隔离缺口·非本轨）＋`tsc` 干净。改动 `stage/{index.html,css/stage.css,js/deck.js}`——全加法，无既有逻辑破坏。零页错。

## 候（另卡）
- **ASK 琥珀呼吸整个等待期**（违宪）：勘验发现回放态 `pendingAsk` **确有 sustain**（busy 夹具 302/1201 连续 1），Lamps `askEnv*breath` 亦breathes——**"只闪一下"是 live 通路 `pendingAsk` 未持续**（distiller 侧 ASK 窗 open→close 未贯穿）。修在 live 蒸馏路＋需可合成的 live-ASK 复现，另立一轮。
- E4 craft/delight 余项（笔头微距/纸面纤维/丝印蚀刻/供收带盘随时演进）——候船长真眼（船长十分钟）。
- 抖动不透明度、棘爪缓落速率——可调，候船长真眼定味。

（第五号手令 · 丁-E4 违宪子集 · 一人全角色 · 2026-07-08）
