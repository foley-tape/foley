# Foley · 中文导航（船长地图）

**给 coding agent 的 lo-fi 磁带仪器。** 首台机器：TAPE·ZERO。英文对外说明见 [README.md](README.md)。

**隐私纪律**：只读本地会话日志并**蒸馏**为事件骨架（动词/时刻/量级/哈希目标）——工具输入、输出正文、对话内容永不落盘；零遥测、全离线。

> 一句话：**这个仓库只有一扇正门——`docs/`。其余全是机器的内脏，不必打开。**

## 最常用的五条路

| 想干什么 | 去哪 |
|---|---|
| 看规矩（琥珀宪法 v1.3 / SPEC / 感官白皮书） | [`docs/canon/`](docs/canon/) |
| 看每轮干成了什么（交接归档） | [`docs/records/README.md`](docs/records/README.md) ← 先看这页索引 |
| 查某道施工令原文 | [`docs/orders/`](docs/orders/) |
| 看三轨现在的状态 | 根目录 [`FEEDBACK-FIX.md`](FEEDBACK-FIX.md) / [`FEEDBACK-SOUND.md`](FEEDBACK-SOUND.md) / [`FEEDBACK-STAGE.md`](FEEDBACK-STAGE.md) |
| 开机看舞台 | `node stage/serve.mjs` → http://localhost:4173/ （live 直播；`?tape=storm` 看回放） |

## 根目录每样东西是什么（一行一件）

| 条目 | 归属 | 说明 |
|---|---|---|
| `docs/` | 全员 | **文书正门**：canon 规矩 ｜ orders 施工令 ｜ records 逐轮归档 ｜ decisions 决议 ｜ assets 插图 |
| `FEEDBACK-FIX / -SOUND / -STAGE .md` | 三轨 | 各轨的活汇报，每轮更新（历史快照在 records 里） |
| `施工方手记.md` / `舞台手记.md` / `舞台复盘.md` | FIX / STAGE | 各轨活手记：品味发现与现实修正 |
| `冰箱登记簿.md` | 全员 | 好主意的冷藏室（勿抢跑清单） |
| `README.md` / `README.zh.md` | 对外 | 英文脸 / 本页 |
| `engine/ adapters/ cli/ protocol/ golden/` | Track-FIX | 引擎内脏：状态机、蒸馏器、命令行、协议、金测试 |
| `params.json / verdict.json / sweep.json` | Track-FIX | 引擎参数与判据（现行唯一事实源，勿手改） |
| `tapes/` | Track-FIX | 五卷标准蒸馏带（storm/smooth/busy/jam/silence 原件） |
| `sound/ sound-params.json` | Track-SOUND | 声音层纯核与声参 |
| `stage/` | Track-STAGE | 舞台：面板、器件、回放/直播客户端、性格照机位（portraits.json） |
| `scripts/` | 总务 | `prune.mjs`（runs/ 清扫：每类留最近 3 份） |
| `runs/` | 机器 | 跑批产物（git 不管，默认可弃，值得留的会晋升进 docs/records/） |
| `package.json` 等 | 工程 | Node 配置，与你无关 |

## 三条家规（放这儿备忘）

1. **桌面不是文件的家**：每轮交付直接进 `docs/records/mXX/`，桌面只剩 `.claude/` 工具配置。
2. **runs/ 里的一切默认可弃**：值得留的必须晋升进 `docs/records/`，否则清扫时不留情面。
3. **历史只有一个住址**：找不到东西先开 [`docs/records/README.md`](docs/records/README.md)，那页没有的就是没归档——冲我来问。
