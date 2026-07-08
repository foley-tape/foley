# E5 · 状态可诊（诚实报态）· 交付

- **奉令**：《第五号手令》丁-E5＋戊.3（大审计脚本增补失效注入三式）＋铁问#4（迟到者与**断线重连**过了吗）。

## 根因
喂食断了（serve 亡/网络不可达），页面 EventSource `onerror` 此前**空处理**（只默默自动重连）——机器就那么"死死不动"，一眼读不出当前态：装死。

## 交付

### 检测（`stage/js/live.js`）
`LiveStream` 加连接健康态机 `connecting|live|lost|gone`＋`onStatus` 回调：
- **lost**：SSE `onerror`（serve 亡/不可达），**去抖 1.2s** 未恢复才判（瞬断不闪红）；另有**静默看门狗**（live 有 20Hz 心跳，>2.5s 无包＝喂食断）。
- **gone**：`event: gone`（live 子进程退出，源没了）。
- **live**：有数据即回；断线重连来包即自愈撤态。

### 呈现（`stage/js/main.js`＋`index.html`＋`css/stage.css`）
状态落 `room[data-signal]`（live 撤属性）。**灯组语言·无数字·无浏览器弹窗**：一枚缓跳信标＋丝印字（`lost`→"Signal Lost"，`gone`→"Source Gone"），机器画面随之稍冷（诚实——没进来的东西可画，不装活）。live 时 `#signal-cue` 不在场。

## 失效注入三式（入验收脚本 `repro/failure-injection.mjs`）
| 注入 | 期望 | 结果 |
|---|---|---|
| **杀 serve** | 信号丢失·灯语"Signal Lost"现身·机器不装死 | **PASS**（`data-signal=lost`·cue 现·label 正确） |
| **断线重连**（同端口重起 serve） | EventSource 自动重连→自愈回 live（**铁问#4**） | **PASS**（`data-signal` 撤·status=live） |
| 杀 claude | 见注 | 机器诚实入睡 IDLE（既有正确行为，非信号丢失，不强测） |

- **断网**：localhost 应用的断网＝serve 不可达，与杀 serve 页侧同效（`setOffline` 不触回环，故以杀 serve 代之，已注明）。
- **gone**（"Source Gone"）已接线，注入难（child 常驻尾随），本测未覆盖。

证据：`shots/signal-lost.png`（信标＋丝印"SIGNAL LOST"·机器转冷，diegetic 非弹窗）。金测试 144/147（3 例 b4.factory 环境隔离缺口·非本轨）＋`tsc` 干净。零页错。

## 候船长真眼
信标色/位/跳速、"机器转冷"的分寸、`lost` 与 `gone` 的语汇区分——味道候船长十分钟。

（第五号手令 · 丁-E5 状态可诊 · 一人全角色 · 2026-07-08）
