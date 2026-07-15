#!/usr/bin/env node
// 包体预算闸（席三工单二·诚约族·夜审 L#10）：npm pack 总体积 ≤ 预算，超即 exit 1。
//
// 病（L#10）：pack 回胖 18.85MB（曾 915KB·21×），最重 stage/fixtures/captain.curve.csv 13MB——
// **文本 CSV**，check-heavy-media 的文本白名单整条放行，包体回归无人报。
// 修：此闸按 `npm pack --dry-run` 的**真装箱体积**算账，重件清单**不豁免文本**（CSV/JSON 同列）。
// 预算数属**席一（README/包体）**——默认 2MB 起手，席一以 FOLEY_PACK_BUDGET_KB 或 --budget-kb 定数。
// 用作 prepublish/CI 闸，**不入默认 npm test**（红属席一 包体 之工·勿破他席开发绿）。
//
//   node scripts/check-pack-budget.mjs [--budget-kb 2048] [--top 15]
import { execFileSync } from 'node:child_process';

const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BUDGET_KB = Number(process.env.FOLEY_PACK_BUDGET_KB ?? argOf('--budget-kb', 2048));  // 席一定数
const TOP = Number(argOf('--top', 15));
const TEXT_EXT = /\.(csv|json|jsonl|ndjson|txt|md|svg|tsv)$/i;   // 记号：不豁免——只为在清单里标注

let raw;
try {
  raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
} catch (e) {
  console.error('包体预算闸：npm pack --dry-run 失败——', (e && e.message) || e);
  process.exit(2);
}
const start = raw.indexOf('[');                                  // 防 npm 前置噪声
const j = JSON.parse(raw.slice(start >= 0 ? start : 0))[0];
const packedKB = j.size / 1024;
const files = [...j.files].sort((a, b) => b.size - a.size);

console.log(`包体预算闸：packed ${(packedKB / 1024).toFixed(2)}MB / 预算 ${(BUDGET_KB / 1024).toFixed(2)}MB · ${j.entryCount} 件 · unpacked ${(j.unpackedSize / 1048576).toFixed(2)}MB`);
console.log(`最重 ${TOP} 件（文本不豁免）：`);
for (const f of files.slice(0, TOP)) {
  const tag = TEXT_EXT.test(f.path) ? ' ←文本' : '';
  console.log(`  ${(f.size / 1024).toFixed(0).padStart(8)}KB  ${f.path}${tag}`);
}

// fixtures 断言（统一席一 item2 规则·验收「无任何 fixture 在包」）：校准夹具不随包发行。
const fixturesInPack = files.filter(f => /(^|\/)fixtures\//.test(f.path));
let bad = false;
if (fixturesInPack.length) {
  console.error(`\n✗ fixtures 漏入包 ${fixturesInPack.length} 件（校准夹具不随包·package.json "files" 应含 !stage/fixtures/**）：`);
  for (const f of fixturesInPack.slice(0, 8)) console.error(`    ${(f.size / 1024).toFixed(0)}KB  ${f.path}`);
  bad = true;
}
if (packedKB > BUDGET_KB) {
  console.error(`\n✗ 超预算 ${(packedKB - BUDGET_KB).toFixed(0)}KB。包体归席一（README/包体）：剔非货件`);
  console.error(`  （dev 夹具如 captain/storm.curve.csv、旧渲染资产如 fascia/reel_*/vu_face/eye/paper.png——`);
  console.error(`   经 package.json "files" 白名单排除或迁 GitHub Releases），或经 --budget-kb 明示调数。`);
  bad = true;
}
if (bad) process.exit(1);
console.log(`\n✓ 包体在预算内·无 fixtures 漏入。`);
