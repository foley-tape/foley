# NIGHT-2 审计锚

- **快照锚**：`ba5e7777d6ea924c9fd308d7f918ec77d1fa3376`（main == origin/main，工作树干净）
- **取锚时刻**：2026-07-06 00:54 +0800
- **审计分支**：`audit/night2` @ worktree `/Users/shadow/tape0-night2`（tape0 本体一指未碰）
- **并发观察（00:54）**：两个 `claude --dangerously-skip-permissions` 会话在跑（PID 24278 @00:47、24502 @00:48）＝令中所报 SOUND-R3 与 M-T2 双轨；彼时 89xx/417x 无监听端口。晨间分诊须对夜间新提交去重。
- **端口纪律**：审计侧避开 8931；通宵值机用 8932+；冷读全程 file://（零端口）。
- **改动纪律申报**：源码零改动。仓内新增仅限 `audit/night2/**`；未跟踪工作副产品 `tapes/coldread-storm.tape.jsonl`、`runs/probe-*`（不入库）；`npm i --no-save playwright`（node_modules only，package.json/lock 未动）。
- **长明灯**：`caffeinate -dims` 挂后台（整夜防熄屏，船长要求）。
