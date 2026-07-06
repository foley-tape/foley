#!/bin/bash
# NIGHT-2 晨间唤醒守望（Monitor 持久用）。只在可行动事件发一行；健康时静默。
# 覆盖终态：DONE / driver 早死 / 浏览器采样长停（各只报一次）。
S=/Users/shadow/tape0-night2/audit/night2/soak
DRIVER=31679
stall_warned=0
while true; do
  if [ -f "$S/SOAK_DONE" ]; then
    echo "SOAK-DONE $(cat "$S/SOAK_DONE" 2>/dev/null | tr -d '\n') — 收值机可生成 SOAK2_REPORT.md"
    exit 0
  fi
  if ! kill -0 "$DRIVER" 2>/dev/null; then
    echo "SOAK-DRIVER-DEAD driver $DRIVER 已不在（$(date '+%H:%M:%S')）— 值机可能中断，需查 driver.log"
    exit 1
  fi
  last=$(tail -1 "$S/browser.csv" 2>/dev/null | cut -d, -f1)
  if [ -n "$last" ]; then
    now=$(( $(date +%s) * 1000 ))
    delta=$(( (now - last) / 1000 ))
    if [ "$delta" -gt 300 ] && [ "$stall_warned" -eq 0 ]; then
      echo "SOAK-STALL 浏览器采样停了 ${delta}s（$(date '+%H:%M:%S')）— 浏览器/SSE 可能挂，值机数据存疑"
      stall_warned=1
    fi
  fi
  sleep 120
done
