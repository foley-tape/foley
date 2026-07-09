# E2 · 卡带架（会话库＝贴标签的卡带架）· 交付

- **奉令**：《第五号手令》丁-E2＋船长补充四条硬架构规则（严格执行）。
- **布局**：左侧纵向单列磁带货架（实体收纳架质感，弱化网页扁平·非横向平铺），右侧控制面板；机器居右为播放面。**首页默认磁带架**（裸正门直上空载架，取代 G8 302 演示卷）。

## 架构（服务端权威 transport ＋ 持久台面·可换喂食源）
- **服务端 transport 状态机**（`stage/serve.mjs`，内存态·进程重启即空载）：完整枚举 `EMPTY|CUEING|PLAYING|PAUSED`＋`selected/loaded/cursor/paused/pendingAsk/locked/epoch`；SSE `event:transport` 广播全客户端，新客户端连 `/live` 即得快照。路由 `GET /rack`、`POST /transport/{select,play,pause,eject}`（同源令牌闸）。
- **客户端**（`stage/js/main.js` 重构）：持久台面（房间/器件/**声桥**）＋可换喂食源（demo/card 回放·live 实流）。换带在**同一 AudioContext** 上换源，绝不销毁音频图。`?tape=X`/`?mode=live` 降为"上机指令"（POST select，后端广播回来才渲染）。

## 四硬规则·逐条实证（`repro/rack.mjs`，端到端全 PASS）

| 规则 | 落地 | 证据 |
|---|---|---|
| **① 切带淡出→闭锁→装带→淡入·禁硬切** | CUEING 相＝服务端节拍窗（460ms）；客户端据此 `sb.fadeOut()`＋锁 play/record 键；loaded 变→装带→`fadeIn()`。走查增益轨迹 0.9→**0**→0.9 平滑坡（无不连续＝无爆破） | `B_switch_fade` cueGain 0.403→afterGain 0.9；`B_cueing_locks` play＋dub 键锁；`B_engine_persist` 引擎 identity 跨切带不变 |
| **② 选中写 transport 后端·多客户端同步·前端不自持** | 点带只 `POST /transport/select`；选中标记读后端 `selected` 广播 | `C_multiclient_sync`：page2 选 jam→page1 实时反映 |
| **③ 重启清游标/暂停/上次选中·默认空载·不继承历史** | transport 内存态·无持久化 | `A_landing_empty` EMPTY 零选中；`E_restart_empty` 同端口重起后新客户端 EMPTY |
| **④ 完整状态枚举＋live pendingAsk 保活·前端只读后端字段·禁计时器/差值推算** | 枚举四相；引擎 `st.pendingAsk` 本就 ASK→ASK_CLEARED 保活，serve 回填 `transport.pendingAsk`（跳变广播）；按钮/灯/选中一律读 transport 字段 | `D_panel_pause/resume` 键读后端 phase 切 PAUSED/PLAYING |

**视觉**：磁带条目＝双卷轴窗＋仓名＋摘要＋时长（走带轴有效时长，非墙钟；`stageDurationSec` 只读头 4KB 估算）；选中即抽出一截＋琥珀边光。LIVE 红轴常在架首；demo 五盘；会话卡带（新卡 `makeCard` 写 `rack.json`＝仓名〔源路径末段〕＋开头动作族摘要〔脱敏电报，非原文〕＋时长；老卡回退）。控制面板 play/pause/eject＋相灯，切带期录音键锁。

三类带全上机实证（`shots/`）：demo（storm）、card（session·db6db653）、live——皆 PLAYING·有墨·零页错。

## 非回归
金测试 **144/147**（3 例 b4.factory 环境隔离缺口·非本轨）＋`tsc` 干净。四条既有回归（P0-1/P0-2/E4/E5）**全 PASS**——大重构保 `?tape=`/`?mode=live` 深链＋`__stage` 把手。`g8.bootstrap` 更新：首页默认磁带架取代 302 演示卷。修 `sound/core.js sampleAt` 空账返 IDLE 零态（空载磁带架下声桥不崩）。

## 复跑
```
node audit/e2-rack/repro/rack.mjs      # 四硬规则端到端（需 audit/tools playwright-core＋chromium）
npm test && npm run typecheck
```

## 候船长十分钟（真机实测·音效过渡节奏＋视觉细节）
- 切带节拍 `CUE_FADE_MS=460ms`／淡入淡出 0.42s——机器代理证平滑无爆破，节奏克制度候真耳。
- 卡带外观（卷轴窗/边光/抽出量）、控制面板键位与相灯语汇、老卡"session·xxxx"回退标签——候真眼。
- 老卡无 `rack.json`（生成于本轮前）：仓名/摘要走回退；重出卡即带新标签。

（第五号手令 · 丁-E2 卡带架 · 一人全角色 · 2026-07-09）
