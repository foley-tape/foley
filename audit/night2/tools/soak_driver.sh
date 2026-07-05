#!/bin/bash
# NIGHT-2 §2 总驾驶：与审计会话解耦（nohup 本脚本）。自记录、自终止。
# 用法: soak_driver.sh <worktree> <port> <deadline-epoch-sec>
set -u
WT="$1"; PORT="$2"; DEADLINE="$3"
SOAK="$WT/audit/night2/soak"
mkdir -p "$SOAK"
cd "$WT" || exit 1
echo "$(date '+%F %T') driver up; deadline $(date -r "$DEADLINE" '+%F %T'); port $PORT" > "$SOAK/driver.log"

# 1) 发生器（先建空卷）
node audit/night2/tools/synth_session.mjs --out "$SOAK/synth-raw.jsonl" --seed 20260706 --deadlineEpochMs "$((DEADLINE * 1000))" > "$SOAK/gen.log" 2>&1 &
GEN=$!
sleep 2
[ -f "$SOAK/synth-raw.jsonl" ] || { echo "gen 未建卷，弃" >> "$SOAK/driver.log"; exit 1; }

# 2) stage 服务（自孵 cli live --raw 合成卷）
node stage/serve.mjs "$PORT" --raw "$SOAK/synth-raw.jsonl" > "$SOAK/serve.log" 2>&1 &
SERVE=$!
sleep 3

# 3) 通宵浏览器
node audit/night2/tools/soak_browser.mjs "$SOAK" "http://localhost:$PORT/" > "$SOAK/browser.out" 2>&1 &
BROWSER=$!

echo "SERVE=$SERVE" > "$SOAK/pids.env"
echo "GEN=$GEN" >> "$SOAK/pids.env"
echo "BROWSER=$BROWSER" >> "$SOAK/pids.env"
echo "$(date '+%F %T') pids serve=$SERVE gen=$GEN browser=$BROWSER" >> "$SOAK/driver.log"

# 4) 系统采样器（前台跟随本驾驶）
bash audit/night2/tools/soak_sampler.sh "$SOAK" &
SAMPLER=$!

# 5) 值机到点
while [ "$(date +%s)" -lt "$DEADLINE" ] && [ ! -f "$SOAK/SOAK_STOP" ]; do
  sleep 30
  kill -0 "$SERVE" 2>/dev/null || { echo "$(date '+%F %T') serve 早死" >> "$SOAK/driver.log"; break; }
done

echo "$(date '+%F %T') 收工开始" >> "$SOAK/driver.log"
# 温柔次序：serve(SIGINT→连带 live 出摘要) → gen → 标记 DONE（浏览器/采样器自见标记退场）
kill -INT "$SERVE" 2>/dev/null; sleep 4
kill -TERM "$GEN" 2>/dev/null; sleep 1
date '+%F %T' > "$SOAK/SOAK_DONE"
sleep 75  # 给浏览器最后一采与终屏
kill -TERM "$BROWSER" 2>/dev/null
kill -TERM "$SAMPLER" 2>/dev/null
echo "$(date '+%F %T') driver done" >> "$SOAK/driver.log"
