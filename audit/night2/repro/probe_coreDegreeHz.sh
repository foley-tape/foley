#!/bin/bash
# 红队B'/冷读 — 证明 probe 页内联把 `degreeHz as coreDegreeHz` 别名剥掉，留下未定义引用。
# 从零生成一张 probe.html，静态断言：coreDegreeHz 有调用、无定义。
set -e
WT="${1:-/Users/shadow/tape0-night2}"
cd "$WT"
OUT="audit/night2/repro/_probe_check"
node cli/index.ts distill "/Users/shadow/.claude/projects/-Users-shadow-tape0/8d2bf051-270a-4bb2-9cf0-8a8b56d8bb68.jsonl" audit/night2/repro/_chk.tape.jsonl >/dev/null 2>&1 || true
node cli/index.ts probe audit/night2/repro/_chk.tape.jsonl --out "$OUT/" >/dev/null 2>&1
H="$OUT/probe.html"
CALLS=$(grep -c 'coreDegreeHz(' "$H" || true)
DEFS=$(grep -cE 'function coreDegreeHz|coreDegreeHz *=|as coreDegreeHz' "$H" || true)
echo "probe.html: coreDegreeHz 调用 $CALLS 处，定义 $DEFS 处"
grep -n 'coreDegreeHz(' "$H" | head
if [ "$CALLS" -gt 0 ] && [ "$DEFS" -eq 0 ]; then
  echo "结论：CONFIRMED — $CALLS 处调用未定义符号 coreDegreeHz（和弦/ASK 前景合成运行即 ReferenceError）"
  echo "运行时旁证：audit/night2/shots/coldread-console.log 两条 'coreDegreeHz is not defined'"
  exit 1
fi
echo "未复现（可能已修）"
