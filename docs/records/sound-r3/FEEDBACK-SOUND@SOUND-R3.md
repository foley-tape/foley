# FEEDBACK-SOUND —— 声音相台账（Track-SOUND：SOUND-R1 重启 → EAR-5~11 战役 → SOUND-R2 床的重做 → SOUND-R3 唱机改造）

## SOUND-R3 交付（2026-07-06，97f558a）

**结论一句话**：唱机上位、作曲机退役——出厂唱片 4 张（open-lofi CC0，12.9MB，BPM 76–83 全窗内）＋唱片总线全处置（T=低通/磨损/wow 加深、wow=音高微醺 playbackRate 真身、STUCK=跳针啃唱片+每回绕一声针嗒、ASK=duck、DONE=tape-stop 滑停、IDLE=房间层接管——全排程纪律，离线/浏览器同一份代码）；机器耳 v3 四 active 门全绿（**G7 v3 唱片在位 −20.79 LUFS 一次定标即中**，catalog.lufs 锚数据驱动归一），G4v2 消融对照 **r=−0.878**、G8 谱距离 **22.1dB/基线 3.9dB** informational 双过；金测试 **79/79**（新增 52–58＋契约测试 4）；立法四件全落（契约测试/verify-probe.mjs/launch 自持/cli calibrate）；renderCuts 钩子交付（dub 授权卫生 --with-record + meta 四件）；美学对照包一键出（锚+A/B/C+判读表）；白皮书 v2 落 docs/canon/。**候复核庭过庭 → 按预言请一次耳朵（申请见文末）。**

**三哈希**：sound-params `e15ea093` / assets `6cc0c971` / **records `da388f63`**（新第三哈希：唱片清单）。

**交付清单（R3 §6）**：
- [x] 唱片层：sound/records/ 4 张 CC0（catalog.json 机读+lufs 定标锚+BPM 实测；LICENSES.md 逐条+授权页快照+**AI 生成来源属性直呈段**；prep-records.mjs 可重跑）
- [x] 播放语义 v1：无缝循环+HUD 换盘 ⏭+?record= 参数+唱片相位=带位置映射；~/.foley/records/ 用户架（--user-records 显式旗标）
- [x] 机器总线：recSrc→recLP→recG→master；playbackRate 调制口修法（规矩③增补 modPort）；STUCK/复走三源全排程；tape-stop 自动化 ramp；唱片在位作曲四层退场（bedTargets recordOn，磨损照旧）
- [x] 机器耳 v3：G1/G2 含唱片路径、G3/G6 房间层口径、G7 v3 唱片在位 −20±2、G4 v2 消融对照、G8 新生；报告三哈希+唱片清单表
- [x] 立法四件：golden/contract.test.ts（含 import 别名禁令）；scripts/verify-probe.mjs（显式帧法+真实鼠标+零异常收集，10/10）；launch.json sound-probe 命名空间化（8931→probe-latest）；cli calibrate（四常数全贴冻结 <0.5dB）
- [x] renderCuts(cuts, tape)→PCM＋cli render-cuts＋encodeWav；默认不含唱片，--with-record 记 meta 四件（金测试 58）
- [x] 美学包：scripts/aesthetic-pack.mjs → runs/aesthetic-pack/（锚+A/B/C+盲选协议 README+判读表）
- [x] 白皮书 v2（§1 总纲改写/§2 三层重写/§6 v3 验收/§7 唱片资产路线+美学轮方法）；本台账续写

**R3 现实修正（规范说 X／现实是 Y／我做了 Z）**：
| # | 施工令说 | 现实是 | 我做了 | 要你认？ |
|---|---|---|---|---|
| R3-1 | 出厂唱片首选 open-lofi（150+ CC0） | README 明示**全部曲目为 Suno v5 AI 生成**，作者以 premium 会员身份声明所有权后捐入 CC0 | 法律判读入 LICENSES.md 直呈段（两条路径皆通可自由使用；残余理论风险如实入档）；备选 HoliznaCC0/FreePD 在案，换盘只动 records/ | **请认可** |
| R3-2 | 参考锚=lo-fi 房间实录 | 实录需另 vendor+授权工序；唱片直通=同素材消融锚，可比性更强（差异全来自机器处置） | 锚=唱片直通页；偏差在盲选 README 如实注记 | **候裁** |
| R3-3 | STUCK=短循环重复当前乐句 | 实测跳针恰逢素材乐句休止（2-am-debug-loop 12s 处 −52.6dBFS）=**哑跳不可辨**——"最可识别"意图未达 | 补针嗒机制：每回绕一声轻嗒（stuckTickGain 新参，种子化、ephemeral 受停止管辖、过唱片链受 duck/滑停连带） | **请认可** |
| R3-4 | G4 v2"谱质心（或 HF 占比）×T 负相关" | 直测 r=+0.19：素材编曲演进 HF 趋势（+17dB/60s）碾压处置效应；磨损 hiss/ASK 动机在 master 反向拉扯 | recG 单渲+**低通冻结消融对照**（同素材同相位差分）→ r=−0.878；proxy 记入 ear 头注 | 仅告知 |
| R3-5 | G8"谱差异显著（自定 proxy）" | 自相关两法折戟：波形法被 wow 相位漂移摧毁（每循环 1.6ms）、包络法被音乐拍底混淆（拍长与嗒周期同域） | 回到主单原文=八分带谱距离（卡碟 22.1dB vs 基线 3.9dB）；两法折戟入档防重修 | 仅告知 |
| R3-6 | STUCK"CLEARED 即复走" | 轨迹无 stuck 位；蒸馏侧可见 STUCK_LOOP→STUCK_CLEARED 事件对 | 卡碟期时长=压缩轴实测入 cls7 vel（graph 侧÷speed 换算音频钟）；复走点=卡点（账本冻结） | 仅告知 |
| R3-7 | —（实现事实） | 唱片解码双端不同（ear=afconvert / 页=decodeAudioData）→ PCM 不逐位一致 | 定标锚同源 catalog.lufs（prep 与 G7 同尺 measureLufs）；响度一致到解码器差异（≪0.1dB 量级）；入 ear 报告头注 | 仅告知 |
| R3-8 | —（渲染器扩展） | offline BufferSource 无 loop 窗/offset；connect 不幂等（浏览器规范幂等——唱片多源 modulate 同一 LFO 对将三倍深度） | 按规范补 loopStart/loopEnd/start(t,offset)（金测试 55）；connect 幂等化（金测试 56）；float 索引 NaN 案修于当轮 | 仅告知 |
| R3-9 | —（NIGHT-2 审计分诊） | probe coreDegreeHz 案在我围栏：graph.js import as 别名被页壳剥 import 拼接剥失→**播放中首个拨弦 ReferenceError、schedule setTimeout 链断（针走声死）**，rAF 冒烟测不出 | 去别名根修+契约测试③静态盯防+verify-probe ③e 显式前景触发回归断言 | 仅告知（审计案结） |
| R3-10 | weather 处置档位小节边界切换（既有教义） | v2 wxLatch 小节锁存机制在位但床/唱片均无档位差异化处置 | 沿革锁存；档位差异化候美学轮（白皮书 §2.0b 标"未执法"） | 仅告知 |

**旧开放项处置（v1 §6）**：G5 判据三案未动（informational 照跑 Δ−4.4dB，三案候裁沿革）；未执法红字×4 未收（前景响度/真峰/DONE 渲染静默/场景档——候补仪器轮）；hiss 采样率漂未触碰。原样移交下轮。

**复核庭入口（R3 §6/铁律 9）**：本轮属重大交付，候另开复核会话过庭（置件必正名）。复核起点：本段+白皮书 v2+`node cli/index.ts ear`（三哈希对表）+`npm test`（79）+`node scripts/verify-probe.mjs`（10/10）+runs/aesthetic-pack/。庭后方与船长实听衔接。

---

## 实听申请（SOUND-R3，候复核庭后发出；听感协议 v2 四件齐）

- **一次一请**：本轮只请这一次耳朵。
- **操作路径**：`node cli/index.ts probe tapes/storm.tape.jsonl --kind storm` → 开 `runs/probe-latest/probe.html` → 点 ▶（首次"…解码唱片"1–2s）→ 画布点 1/3 处起听 ≥90s（1× 原速）；试 ⏭ 换盘；另开 `runs/aesthetic-pack/` 四页盲选排序（协议在包内 README）。
- **设备栏**：蓝牙耳机（=产品条件）；电脑外放旁证。
- **可证伪预言**："你该听到**一首真正的歌**在一台会老化的机器里播放——紧张上升时磁带变旧变闷、走带发醺；卡碟时跳针啃着旋律（若恰逢乐句间隙，是'嗒…嗒…'的针跳声），一听即懂；完工时唱片降速滑停，然后是真正的安静。"
- **判读表**：
  | 若你听到 | 说明 | 下一步 |
  |---|---|---|
  | 如预言 | R3 身份终裁成立 | 盲选排序定美学参数，交付收官 |
  | 歌在但"处置感"无感 | 处置深度不足（非结构问题） | 盲选 B（处置浓）应显著异于锚——若仍无感，处置域整体加深一档 |
  | 卡碟/滑停听不出 | G8/tape-stop 的听感阈与机器判据错位 | 记录时刻戳，回 ear 对渲染窗重标 |
  | 又出现"滋啦"类噪音 | 与唱片解码/实时链相关的新变量 | 隔离板勾掉"唱片"层对照（板上新增此层）；欠载记录仪读数一并报 |

（R3 段完）

（快照 @SOUND-R3，合并 97f558a；活版=仓根 FEEDBACK-SOUND.md）
