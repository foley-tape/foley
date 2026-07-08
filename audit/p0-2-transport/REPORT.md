# P0-2 · 双音重叠＋暂停语义改判 · 修复与证据

- **奉令**：《第五号手令》丙——单一传动律入宪＋暂停语义改判＋PLAY/DUB 示能。

## 丙.1 · 单一传动律入宪

代码勘验：全页仅一条 live 音频图——`SoundBridge`（一 `AudioContext`＋一 `buildEngine`），`main.js` 手势 `pointerdown` 内 `if (sb) return` 守门单次实例化；demo-boot 另页同守。DUB 走服务端 `/dub/render-audio` 离线渲 WAV 供胶印 mux，**非浏览器第二上下文**。据此把不变量写死在守门处注释：PLAY／暂停／DUB 是**同一引擎**上的档位，永不二次实例化音频图。端到端证 [A]：多次手势后引擎 identity 稳定不变。

## 丙.2 · 暂停＝唱片随带停（本席四号手令"画停声继 v1 维持"当庭撤销）

引擎新增（纯加法，`sound/graph.js`）：
- `pauseRecord(at)`：短促 spin-down 到静默（拨杆的轻微 **wow**＝delight），记住读头位置；**床/底噪/呼吸一概不动**——存在层独立（不变量二）。
- `resumeRecord(at)`：从暂停读头**续播不重建**（非从头）。
- `paused` 与 `tapeStopped` **分道**：后者遇非 DONE 相自动复活（DONE 滑停语义），前者只认 `resumeRecord`——暂停不该被下一包偷偷叫醒。`recOn()`／`applyRecord` 电平闸同步纳入 `paused`（默认 false，既有行为零改）。

接线（`stage/js/{replay,soundbridge,main}.js`）：`Replayer` 开停发 `onPlayState`；`main.js` 据此调 `sound.pause()/resume()`，**DUB 自管音景期间（`eats()`）不插手**避免双动——单一引擎的档位切换一处收口。

金测试 **LIVE-7**（`golden/live-sound.test.ts`，OfflineCtx 确定性）：
- 隔离唱片路：暂停后唱片真静默（<−70dBFS）、恢复复现（>−30dBFS）、单源不叠（Δ<6dB）、`paused` 不被下一包唤醒。
- 房间常在：床不 mute，暂停唱片后整体仍呼吸（>−45dBFS）——存在≠内容。

端到端证 [B]/[C]：回放转台 pause→`sound.pause()`→`recordPaused=true`＋房间 RMS 0.017 照呼吸；play→`resume()`→`recordPaused=false`。

## 丙.3 · DUB 示能（船长"死活不明"案）

`stage/js/dub.js`＋`stage/css/stage.css`：DUB 键随可用性明暗——
- **不可用物理锁死**（`.dub-locked`：暗淡去高光＋cursor default）：live 材料未够（`chart.lastStageT<15s`）。
- **可用机械咬合态**（`.dub-ready`：暖芒微高光）：回放有带／live 材料够。
- 按下不可用即**明确摇头**（`.dub-refuse` 一记）＋无戏可剪/今晨无卷的诚实兜底——不再静默回 idle 让人猜死活。

端到端证 [D]：回放有带→ `dub-ready`。

**PLAY 唯一亮起示能（呼吸微光）** 归 E1 首光（PLAY 件尚未立；见 E1 卡）——丙.3 此半随 E1 交。

## 汇总

金测试 **144/147**（3 例失败＝b4.factory 环境隔离缺口，与本修无关，干净 CI 全绿）＋`tsc` 干净。端到端 `repro/transport.mjs` 四案 **PASS**。改动面：`sound/graph.{js,d.ts}`、`stage/js/{soundbridge,replay,replay.d,main,dub}.js`、`stage/css/stage.css`、`golden/live-sound.test.ts`——既有信号路零改（全加法）。

## 复跑
```
node --test golden/live-sound.test.ts                 # LIVE-1..7
node audit/p0-2-transport/repro/transport.mjs          # 端到端四案（需 audit/tools playwright-core＋chromium）
```

## 候船长真耳（庚/船长十分钟）
- 落针/暂停 wow 的克制度、DUB 咬合芒的分寸——机器代理已证"响且不狂/停得干净"，味道的最后一票在耳朵。

（第五号手令 · 丙 P0-2 · 一人全角色 · 2026-07-08）
