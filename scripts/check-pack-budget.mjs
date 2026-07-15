#!/usr/bin/env node
// 包体预算闸（席三工单二·诚约族·夜审 L#10）：npm pack 总体积 ≤ 预算，超即 exit 1。
//
// 病（L#10）：pack 回胖至 18.85MB（曾 915KB·21×），最重 stage/fixtures/captain.curve.csv 13MB。
// 修：按 `npm pack --dry-run` 的**真装箱字节数**算账——**权威单位＝bytes**（避 KiB/MB 二义）。
// 预算属**席一（README/包体）**——严格 **2,000,000 bytes**（十进制 2MB·席一定数；非 2 MiB=2,097,152）；
// 席一以 FOLEY_PACK_BUDGET_BYTES 或 --budget-bytes 调数。
// fixtures 断言：**stage/fixtures/ 零容忍随包发行**（校准夹具不出货·统一席一 item2「无 fixture 在包」）。
//   注：git 树内的大文本夹具（如 busy.curve.csv 开发金料）**合法保留**——本闸只拦「漏入包」，绝不误杀
//   树内 dev 材料；文本大件的库存归 docs/records/HEAVY_INVENTORY.md（席一）+ check-heavy-media（不动）。
// 用作 prepublish/CI 闸，**不入默认 npm test**（红属席一 包体 之工·勿破他席开发绿）。
//
//   node scripts/check-pack-budget.mjs [--budget-bytes 2000000] [--top 15]
import { execFileSync } from 'node:child_process';

const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const BUDGET_BYTES = Number(process.env.FOLEY_PACK_BUDGET_BYTES ?? argOf('--budget-bytes', 2_000_000)); // 席一定数·严格字节
const TOP = Number(argOf('--top', 15));
const mb = (b) => (b / 1e6).toFixed(3);   // 十进制 MB（与字节预算同尺）
const TEXT_EXT = /\.(csv|json|jsonl|ndjson|txt|md|svg|tsv)$/i;

let raw;
try {
  raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
} catch (e) {
  console.error('包体预算闸：npm pack --dry-run 失败——', (e && e.message) || e);
  process.exit(2);
}
const start = raw.indexOf('[');
const j = JSON.parse(raw.slice(start >= 0 ? start : 0))[0];
const packed = j.size;   // bytes（权威）
const files = [...j.files].sort((a, b) => b.size - a.size);

console.log(`包体预算闸：packed ${packed.toLocaleString('en-US')} B (${mb(packed)} MB) / 预算 ${BUDGET_BYTES.toLocaleString('en-US')} B (${mb(BUDGET_BYTES)} MB) · ${j.entryCount} 件`);
console.log(`最重 ${TOP} 件（文本仅标注·不误杀）：`);
for (const f of files.slice(0, TOP)) {
  console.log(`  ${(f.size / 1024).toFixed(0).padStart(8)}KB  ${f.path}${TEXT_EXT.test(f.path) ? ' ←文本' : ''}`);
}

let bad = false;
// fixtures 断言：stage/fixtures/ 零容忍漏入包（统一席一 item2 验收）
const fixturesInPack = files.filter(f => /(^|\/)stage\/fixtures\//.test(f.path));
if (fixturesInPack.length) {
  console.error(`\n✗ stage/fixtures/ 漏入包 ${fixturesInPack.length} 件（校准夹具不出货·package.json "files" 应含 !stage/fixtures/**）：`);
  for (const f of fixturesInPack.slice(0, 8)) console.error(`    ${(f.size / 1024).toFixed(0)}KB  ${f.path}`);
  bad = true;
}
if (packed > BUDGET_BYTES) {
  console.error(`\n✗ 超预算 ${(packed - BUDGET_BYTES).toLocaleString('en-US')} B。包体归席一（README/包体）：剔非货件`);
  console.error(`  （dev 夹具 stage/fixtures/*、旧渲染资产 fascia/reel_*/vu_face/eye/paper.png——经 "files" 白名单排除或迁 GitHub Releases），或 --budget-bytes 明示调数。`);
  bad = true;
}
if (bad) process.exit(1);
console.log(`\n✓ 包体 ${packed.toLocaleString('en-US')} B 在预算 ${BUDGET_BYTES.toLocaleString('en-US')} B 内·无 fixtures 漏入。`);
