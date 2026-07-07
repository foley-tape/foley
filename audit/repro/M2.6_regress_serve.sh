#!/usr/bin/env bash
# M2.6 回归（乙独立复射）：F1 DoS ＋ F5 Host 越权面。对齐 main(6ab3218) 后打固定 serve。
# 判据：F1 → 畸形 %-路径弹 400 且进程存活；F5 → 非白名单 Host 弹 403（最前端）。
set -u
cd "$(dirname "$0")/../.." || exit 2
PORT=8952
node stage/serve.mjs "$PORT" --replay-only >/tmp/serve-regress.log 2>&1 &
SPID=$!
sleep 1
ps -p "$SPID" >/dev/null 2>&1 || { echo "serve 未起，弃"; exit 2; }
fail=0
code() { curl -s -m 3 "$@" -o /dev/null -w '%{http_code}'; }

echo "── F1 · DoS 防御（畸形 %-序列不再打垮进程）──"
# 默认 Host（127.0.0.1:PORT，白名单内）→ 请求抵达 decodeURIComponent，考的正是 F1 包死
c1=$(code --path-as-is -g -H 'Origin: http://evil.example' "http://127.0.0.1:$PORT/%zz")
c2=$(code --path-as-is -g "http://127.0.0.1:$PORT/%")
echo "  跨源 GET /%zz → $c1   （期望 400）"
echo "  裸    GET /%   → $c2   （期望 400）"
[ "$c1" = "400" ] || { echo "  ✗ F1 未修：/%zz 得 $c1"; fail=1; }
[ "$c2" = "400" ] || { echo "  ✗ F1 未修：/%  得 $c2"; fail=1; }
sleep 0.3
if ps -p "$SPID" >/dev/null 2>&1; then echo "  ✓ 进程存活（未终止）"; else echo "  ✗ 进程已崩！"; fail=1; fi
c3=$(code "http://127.0.0.1:$PORT/")
echo "  后续 GET /   → $c3   （期望 200，证服务仍在）"
[ "$c3" = "200" ] || fail=1

echo "── F5 · Host 越权面（非白名单 Host 最前端 403）──"
h_bad=$(code -H 'Host: evil.attacker.com' "http://127.0.0.1:$PORT/")
h_bad2=$(code -H 'Host: evil.attacker.com' "http://127.0.0.1:$PORT/today/curve.csv")
h_ok=$(code "http://127.0.0.1:$PORT/")   # 默认 Host=127.0.0.1:PORT，白名单内
echo "  GET /            Host:evil        → $h_bad    （期望 403）"
echo "  GET /today/*.csv Host:evil        → $h_bad2   （期望 403，读面同门）"
echo "  GET /            Host:127.0.0.1   → $h_ok     （期望 200，正常放行）"
[ "$h_bad" = "403" ]  || { echo "  ✗ F5 未修：坏 Host 得 $h_bad"; fail=1; }
[ "$h_bad2" = "403" ] || { echo "  ✗ F5 未修：坏 Host 读面得 $h_bad2"; fail=1; }
[ "$h_ok" = "200" ]   || { echo "  ✗ 正常 Host 被误杀 $h_ok"; fail=1; }

kill "$SPID" 2>/dev/null
echo
[ "$fail" = 0 ] && { echo "✅ F1 ＋ F5 回归全过：DoS 存活/400，Host 403 拦截。"; exit 0; } \
                || { echo "❌ 有未修项，见上。"; exit 1; }
