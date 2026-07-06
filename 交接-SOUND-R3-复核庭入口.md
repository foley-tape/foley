# 交接 · SOUND-R3 复核庭入口（铁律 9：重大交付另开会话过庭，置件必正名）

> 写给：复核会话。你不是施工方——你的任务是**验收 R3 唱机改造**（合并 97f558a），庭后船长实听才许衔接。
> 你没有历史记忆：本文＋台账 R3 段（FEEDBACK-SOUND.md 文首）＋施工令（船长处 FOLEY_ORDER_SOUND_R3.md）即全部上下文。

## 复核范围（围栏）

审 `sound/**`＋`cli/{ear,probe,records-node,rendercuts,calibrate}.ts`＋`golden/{sound,contract}.test.ts`＋`sound/records/**`＋白皮书 v2（docs/canon/TAPE0_WHITEPAPER_SENSES_v1.md）。**勿触** engine/**、stage/**、别轨台账。复核=读＋跑＋核，改动仅限记录你的复核发现（台账续段或另立复核记录）。

## 快速核验序（约 15 分钟机时）

```bash
cd /Users/shadow/tape0
npm test                        # 期望 79/79（52–58=R3 新物理；contract×4=立法①）
node cli/index.ts ear           # 期望四 active 全绿；三哈希 e15ea093/6cc0c971/da388f63
node scripts/verify-probe.mjs   # 期望 10/10（先 node cli/index.ts probe tapes/storm.tape.jsonl --kind storm）
node cli/index.ts calibrate     # 期望四常数 <0.5dB
```

## 必核清单（按台账 R3 段现实修正表逐条过）

1. **R3-1（请认可级）**：出厂唱片=Suno v5 AI 生成——`sound/records/LICENSES.md` 直呈段的法律判读是否成立、快照是否在案、备选路径是否可行。这是本轮**最重的裁项**。
2. **R3-3（请认可级）**：针嗒机制（stuckTickGain）超出主单字面——判"完成意图"还是"越界加戏"。听证物：金测试 57＋`runs/rendercuts-*/cuts-audio.wav`（含 STUCK 段）。
3. **G7 v3 定标链**：catalog.lufs（prep 实测）→ graph calibLin → ear 实测 −20.79 LUFS。核 prep 与 ear 是否真同尺（measureLufs 同函数）。
4. **全排程纪律**：graph.js recordStuck/recordTapeStop 无 live 属性改动、无回调——离线/浏览器同构的根。
5. **双端不逐位注记**（R3-7）：是否如实、是否影响任何"逐位"级既有承诺（R2 双引擎逐位承诺在**床**链，唱片链未作此承诺——核白皮书 §6 措辞）。
6. **置件正名**：本轮无外来置件；契约测试③④、金测试 52–58、verify-probe ③e 皆施工方自产——若你添件，照 M-T1 复核例正名。

## 庭后动作

- 通过 → 台账记"复核庭 @R3 通过"＋放行实听申请（台账文末，预言+判读表+盲选包 `runs/aesthetic-pack/` 已备；若包不在，`node scripts/aesthetic-pack.mjs` 重出）。
- 有疑 → 停笔请示架构师（并发协议：不赛跑、不代裁）。

（入口完。施工方注：G5 三案、未执法红字×4、hiss 采样率漂——旧开放项原样移交，不在本庭范围。）
