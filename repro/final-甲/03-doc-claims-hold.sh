#!/usr/bin/env bash
# 已核验为真的 README 承诺 —— 回归护栏（这些成立；若未来漂移，本脚本变红即预警）。
# 附甲-4：DUB "~9×" vs 引擎自设 "≥2×" 的对不上。
# 用法：bash repro/final-甲/03-doc-claims-hold.sh
set -u
cd "$(dirname "$0")/../.." || exit 1
pass(){ echo "  ✓ $1"; }
warn(){ echo "  ⚠ $1"; }

echo "== replay 三件套（REPORT.md + curve.csv + moments.csv）=="
grep -q "join(outDir, 'curve.csv')" cli/replay.ts && grep -q "join(outDir, 'moments.csv')" cli/replay.ts && grep -q "join(outDir, 'REPORT.md')" cli/replay.ts && pass "replay.ts 三件齐出" || warn "replay 产物漂移"

echo "== records 下载 hash-verified（SHA-256 + 体积，不符拒收）=="
grep -q "h !== r.sha256" cli/records-fetch.ts && grep -q "未落盘" cli/records-fetch.ts && pass "records-fetch 验哈希+体积再落盘" || warn "哈希校验漂移"

echo "== 唯一外网调用（CLI 侧仅 records-fetch 一处 fetch）=="
N=$(grep -rnE "fetch\(|https?\.(get|request)" cli/ adapters/ engine/ --include="*.ts" | grep -v "test" | wc -l | tr -d ' ')
[ "$N" = "1" ] && pass "CLI 侧外部 fetch 仅 1 处（records-fetch.ts）" || warn "CLI 侧 fetch 计数=$N（预期 1，请核）"

echo "== --redact 全脱敏模式存在 =="
grep -q "redactResult" adapters/claude-jsonl/distill.ts && grep -q "\-\-redact" cli/distill.ts && pass "--redact 在册" || warn "--redact 缺"

echo "== standing privacy gate 测试在套件 =="
ls golden/privacy.redteam.test.ts golden/night2.security.test.ts >/dev/null 2>&1 && pass "隐私门测试在册（乙将压测强度）" || warn "隐私门测试缺"

echo "== adapters 仅 Claude Code（Honest limits）=="
A=$(ls adapters/ | tr '\n' ' ')
[ "$(ls adapters/ | wc -l | tr -d ' ')" = "1" ] && pass "adapters 仅一家：$A" || warn "adapters 多于一家：$A"

echo "== PROVENANCE 三件套 + 快照文件在盘 =="
ls sound/records/LICENSE-FMA-snapshot-*.txt sound/records/LICENSE-CC0-snapshot-*.txt sound/records/catalog.json sound/records/records.manifest.json >/dev/null 2>&1 && pass "许可证快照+catalog+manifest 齐" || warn "PROVENANCE 配套缺件"

echo "== 甲-4：DUB '~9×' vs 引擎自设目标 =="
grep -q "~9× realtime" README.md && pass "README 写 ~9×" || warn "README 措辞已变"
grep -q "目标 ≥2×" stage/js/film.js && warn "但 film.js:516 自设目标仅 ≥2× —— 9× 无支撑（甲-4/P2）" || echo "  （film.js 目标注释已变，请复核）"

echo "== 结论：以上✓为已核验成立的承诺；⚠为需复核。甲-4 的 9×/2× 落差为 P2。=="
