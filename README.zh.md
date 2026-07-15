# Foley · 中文导航（船长地图）

**给 coding agent 的 lo-fi 磁带仪器。** 首台机器：TAPE·ZERO。英文对外说明见 [README.md](README.md)。

**隐私纪律**：对话留在你的机器上。Foley 默认取首条真人发言最多 80 字符，作为本地磁带标题缓存到 `$FOLEY_HOME/cards/<session>/rack.json`（缺省 `~/.foley/cards/...`）；除此标题外，蒸馏带只保留事件骨架（动词/时刻/量级/哈希目标），不复制工具输入或对话文本。默认带只留经 best-effort 归一化后再加盐哈希的错误类；`--raw` 则保留其归一化明文，净化器不认识的文本仍可能存活。可在启动时设 `FOLEY_NO_LOCAL_TITLES=1`，或在 `$FOLEY_HOME/config.json` 写 `{"privacy":{"localTitles":false}}` 退出；环境变量只约束该进程，共用同一 Foley home 的多实例应使用配置档。配置档在货架元数据读写时重验，档案存在却损坏或不可读时会明确告警并按关闭处理。关闭后新卡不再复制首句，旧标题会在成功返回货架前原子清除，界面垫底为仓名＋性格章名。重新开启后，只要原始本地母带仍在，标题可再次自愈。

**默认蒸馏带与 MP4/DUB 导出链执行这些明确的脱敏与最小化**：蒸馏带时间相对化，非内建工具名与错误类加盐哈希，`sourceHash` 改为 `redacted`；导出 MP4 的容器创建/修改时间清零。DUB 边车不写显式 `createdAt`/`liveEpoch`，但本地 DUB 导出文件名仍带导出日期，胶片 DUB 元数据还可能内嵌这些带日期的归档路径；DUB 元数据也保留稳定的不透明带标识（从货架会话卡发起导出时为 `card:<session-id>`）与内容哈希。因此并非绝对匿名，出屋前仍应人工检查。`--raw` 还会保留绝对时间、明文工具名、精确 sourceHash 与 best-effort 归一化后的明文错误类，只供本机调试，不应分享。零遥测；产品唯一外网路径是用户明确确认后的出厂唱片下载。

> 一句话：**这个仓库只有一扇正门——`docs/`。其余全是机器的内脏，不必打开。**

## 最常用的五条路

| 想干什么 | 去哪 |
|---|---|
| 看规矩（琥珀宪法 v1.3 / SPEC / 感官白皮书） | [`docs/canon/`](docs/canon/) |
| 看每轮干成了什么（交接归档） | [`docs/records/README.md`](docs/records/README.md) ← 先看这页索引 |
| 查某道施工令原文 | [`docs/orders/INDEX.md`](docs/orders/INDEX.md) ← 编年索引 |
| 看活轨现在的状态 | 根目录 [`FEEDBACK-SOUND.md`](FEEDBACK-SOUND.md) / [`FEEDBACK-STAGE.md`](FEEDBACK-STAGE.md)（FIX 轨已封版，终账在 [`docs/records/m20/`](docs/records/m20/)） |
| 逛完整建造史（档案馆地图） | [`docs/README.md`](docs/README.md) |
| 开机看舞台 | `npx foley`（起播磁带机，尾随最近会话）→ http://127.0.0.1:4173/ ；音频经 `npx foley records fetch` 明示取回 |

## 根目录每样东西是什么（一行一件）

| 条目 | 归属 | 说明 |
|---|---|---|
| `docs/` | 全员 | **文书正门**：canon 规矩 ｜ orders 施工令（编年） ｜ records 逐轮归档 ｜ decisions 决议 ｜ guide 淘碟指南 ｜ launch 发布 ｜ assets 插图（[地图](docs/README.md)） |
| `audit/` | 审计 | NIGHT-1 / NIGHT-2 审计报告与复现件（[导读](audit/README.md)） |
| `FEEDBACK-SOUND / -STAGE .md` | 双轨 | 各轨的活台账，每轮更新（FIX 轨终账在 records/m20；历史快照在 records 里） |
| `舞台手记.md` | STAGE | 舞台活手记（施工方手记、舞台复盘已按轮入档 records） |
| `冰箱登记簿.md` | 全员 | 好主意的冷藏室（勿抢跑清单） |
| `README.md` / `README.zh.md` | 对外 | 英文脸 / 本页 |
| `engine/ adapters/ cli/ protocol/ golden/` | Track-FIX | 引擎内脏：状态机、蒸馏器、命令行、协议、金测试 |
| `params.json / verdict.json / sweep.json` | Track-FIX | 引擎参数与判据（现行唯一事实源，勿手改） |
| `tapes/` | Track-FIX | 五卷标准蒸馏带（storm/smooth/busy/jam/silence 原件） |
| `sound/ sound-params.json` | Track-SOUND | 声音层纯核与声参 |
| `stage/` | Track-STAGE | 舞台：面板、器件、回放/直播客户端、性格照机位（portraits.json） |
| `scripts/` | 总务 | `prune.mjs`（runs/ 清扫）· `sync-readme.mjs`（README 数字注入）· `check-heavy-media.mjs`（>5MB 重媒体闸）· `pack-records.mjs`（唱片打包） |
| `runs/` | 机器 | 跑批产物（git 不管，默认可弃，值得留的会晋升进 docs/records/） |
| `package.json` 等 | 工程 | Node 配置，与你无关 |

## 三条家规（放这儿备忘）

1. **桌面不是文件的家**：每轮交付直接进 `docs/records/mXX/`，桌面只剩 `.claude/` 工具配置。
2. **runs/ 里的一切默认可弃**：值得留的必须晋升进 `docs/records/`，否则清扫时不留情面。
3. **历史只有一个住址**：找不到东西先开 [`docs/records/README.md`](docs/records/README.md)，那页没有的就是没归档——冲我来问。
