// runs/ 清扫（M2.0 §1.2 规约，M2.1 §3.3 落地）—— 每 kind 保留最近 3 份，其余删除。
//
//   node scripts/prune.mjs [--keep 3] [--dry-run]
//
// kind = 目录名首段（<kind>-<tape>-<ts> 规约；不合规约的目录整体视为一 kind，照样限额）。
// 晋升规则：值得留的产物先进 docs/records/，runs/ 里的一切默认可弃。
import { readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runsDir = join(repoRoot, 'runs');

const args = process.argv.slice(2);
const keepIdx = args.indexOf('--keep');
const KEEP = keepIdx >= 0 ? Math.max(1, Number(args[keepIdx + 1])) : 3;
const DRY = args.includes('--dry-run');

let entries;
try { entries = readdirSync(runsDir); }
catch { console.log('runs/ 不存在，无可清扫'); process.exit(0); }

const DAY_KEEP = 7; // 日带保留 7 日（M2.2 §0.6：预告片高光选段的原料仓）
const isDayRoll = n => /^live-\d{4}-\d{2}-\d{2}$/.test(n);

const groups = new Map();
for (const name of entries) {
  const p = join(runsDir, name);
  let st;
  try { st = statSync(p); } catch { continue; }
  if (!st.isDirectory()) continue;
  const kind = isDayRoll(name) ? 'live-day' : (name.split('-')[0] || name);
  if (!groups.has(kind)) groups.set(kind, []);
  groups.get(kind).push({ name, p, mtime: st.mtimeMs });
}

let kept = 0, dropped = 0;
for (const [kind, list] of groups) {
  const keep = kind === 'live-day' ? DAY_KEEP : KEEP;
  list.sort((a, b) => b.mtime - a.mtime);
  for (let i = 0; i < list.length; i++) {
    if (i < keep) { kept++; continue; }
    dropped++;
    console.log(`${DRY ? '[dry] ' : ''}删 ${kind}: runs/${list[i].name}`);
    if (!DRY) rmSync(list[i].p, { recursive: true, force: true });
  }
}
console.log(`完成：留 ${kept}，${DRY ? '拟' : ''}删 ${dropped}（每 kind 上限 ${KEEP}；日带 ${DAY_KEEP} 日）`);
