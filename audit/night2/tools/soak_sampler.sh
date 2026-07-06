#!/bin/bash
# NIGHT-2 §2 系统采样器：每分钟采各进程 RSS/CPU＋loadavg＋热度。DONE 标记退场。
SOAK="$1"; PIDFILE="$SOAK/pids.env"
CSV="$SOAK/system.csv"
echo "wall,role,pid,rss_kb,pcpu" > "$CSV"
echo "wall,load1,therm" > "$SOAK/host.csv"
while [ ! -f "$SOAK/SOAK_DONE" ]; do
  # shellcheck disable=SC1090
  source "$PIDFILE" 2>/dev/null
  NOW=$(date +%s)
  for role in SERVE GEN BROWSER; do
    pid="${!role}"
    [ -n "$pid" ] && ps -o rss=,pcpu= -p "$pid" 2>/dev/null | while read -r rss cpu; do
      echo "$NOW,$role,$pid,$rss,$cpu" >> "$CSV"
    done
  done
  # live 子进程（serve 之子）与 chromium 主进程：按 ppid/名字找
  if [ -n "$SERVE" ]; then
    pgrep -P "$SERVE" 2>/dev/null | while read -r lp; do
      ps -o rss=,pcpu= -p "$lp" 2>/dev/null | while read -r rss cpu; do
        echo "$NOW,LIVE,$lp,$rss,$cpu" >> "$CSV"
      done
    done
  fi
  pgrep -f 'headless_shell.*--headless' 2>/dev/null | head -3 | while read -r cp; do
    ps -o rss=,pcpu= -p "$cp" 2>/dev/null | while read -r rss cpu; do
      echo "$NOW,CHROMIUM,$cp,$rss,$cpu" >> "$CSV"
    done
  done
  LOAD=$(sysctl -n vm.loadavg 2>/dev/null | awk '{print $2}')
  THERM=$(pmset -g therm 2>/dev/null | tr '\n' ' ' | tr ',' ';')
  echo "$NOW,$LOAD,\"$THERM\"" >> "$SOAK/host.csv"
  sleep 60
done
echo "$(date +%s) sampler done" >> "$SOAK/sampler.log"
