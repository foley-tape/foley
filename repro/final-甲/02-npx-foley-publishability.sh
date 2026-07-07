#!/usr/bin/env bash
# 甲-1【P1】＋甲-3【P1】复现：npx foley 头号命令的可发布性与 Node 门槛。
# 用法：bash repro/final-甲/02-npx-foley-publishability.sh
set -u
cd "$(dirname "$0")/../.." || exit 1

echo "== ① package.json private / bin / engines =="
node -e '
const p=require("./package.json");
console.log("  private        :", p.private, p.private===true?"← npm publish 被硬拒":"");
console.log("  bin.foley      :", p.bin&&p.bin.foley, /\.ts$/.test(p.bin&&p.bin.foley||"")?"← 以 .ts 当入口（须 Node≥23.6 剥类型）":"");
console.log("  engines.node   :", p.engines&&p.engines.node);
console.log("  name           :", p.name, "← npm 上是否己方所有？需人工确认（常见词，抢注风险）");
'

echo "== ② npm pack 干跑：打包本身是否健康（--ignore-scripts 避开 prepublishOnly 跑全测）=="
npm publish --dry-run --ignore-scripts 2>&1 | grep -E "name:|version:|total files:|unpacked size:|\+ foley" | head -6
echo "  → dry-run 成功出 tarball＝打包健康、docs/tapes 已正确排除；"
echo "  → 但注意：dry-run **不强制** private 检查（本机实测 exit 0）。"
echo "  → private:true 的拒绝只在**真实** npm publish 触发（npm 文档行为 EPRIVATE）——本脚本不做真实发布。"

echo "== ③ bin 的 shebang（决定 npx 起子如何解释 .ts）=="
head -1 cli/index.ts

echo "== ④ 本机 Node 是否越过 23.6 门槛（越过=作者机盲区）=="
node -v
node -e 'const v=process.versions.node.split(".").map(Number); const ok=(v[0]>23)||(v[0]===23&&v[1]>=6); console.log("  ≥23.6 ?", ok, ok?"← 本机能跑；Node 20/22 LTS 用户 npx foley 会 SyntaxError":"← 低于门槛");'

echo "== ⑤ CLI 代码路径本身是否通（scan 只读，证阻塞点纯在发布态/门槛）=="
node cli/index.ts scan 2>&1 | head -2

echo "== 结论：代码能跑；npx foley 的两个阻塞点=①private:true 未发布（+名归属）②Node≥23.6 门槛。二者发布前必须显式处置。=="
