// cli runs —— runs/ 清扫规约（M2.0 §1.2）。
// 命名规约：runs/<kind>-<tape>-<ts>/，kind ∈ replay/sweep/probe/ear/soak。
// `runs prune --keep 3`：每 kind 保留最近 3 份（按目录 mtime），其余删除。
// 纪律：只动认识的 kind 前缀；旧式命名（纯时间戳、五带常驻目录 silence/…）一概不碰。
// 晋升规则提醒：值得留的产物（定妆照、封版 REPORT、盲听包）晋升入 docs/records/——runs/ 里的一切默认可弃。

import { readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const KINDS = ['replay', 'sweep', 'probe', 'ear', 'soak'] as const;

export function runRuns(argv: string[]): void {
  const sub = argv[0];
  if (sub !== 'prune') {
    console.error('用法: node cli/index.ts runs prune [--keep 3] [--dry]');
    console.error('  每 kind（replay/sweep/probe/ear/soak）保留最近 N 份产物目录，其余删除。');
    console.error('  --dry 只报告不删。旧式命名与五带常驻目录不碰；值得留的先晋升 docs/records/。');
    process.exit(sub ? 2 : 1);
    return;
  }
  const keepIdx = argv.indexOf('--keep');
  const keep = keepIdx >= 0 ? Number(argv[keepIdx + 1]) : 3;
  if (!Number.isInteger(keep) || keep < 1) {
    console.error(`--keep 非法: ${argv[keepIdx + 1]}（需正整数）`);
    process.exit(2);
    return;
  }
  const dry = argv.includes('--dry');
  const runsDir = join(process.cwd(), 'runs');

  let entries: string[];
  try { entries = readdirSync(runsDir); }
  catch { console.error(`runs/ 不存在（${runsDir}）——无可清扫`); return; }

  const byKind = new Map<string, { name: string; mtime: number }[]>();
  for (const name of entries) {
    const kind = KINDS.find((k) => name.startsWith(k + '-'));
    if (!kind) continue; // 不认识的一概不碰
    const full = join(runsDir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (!st.isDirectory()) continue;
    const arr = byKind.get(kind) ?? [];
    arr.push({ name, mtime: st.mtimeMs });
    byKind.set(kind, arr);
  }

  let removed = 0, kept = 0;
  for (const kind of KINDS) {
    const arr = (byKind.get(kind) ?? []).sort((a, b) => b.mtime - a.mtime);
    const keepList = arr.slice(0, keep);
    const dropList = arr.slice(keep);
    kept += keepList.length;
    for (const d of dropList) {
      if (dry) process.stdout.write(`[dry] 将删除 runs/${d.name}\n`);
      else { rmSync(join(runsDir, d.name), { recursive: true, force: true }); process.stdout.write(`已删除 runs/${d.name}\n`); }
      removed++;
    }
    if (arr.length > 0) process.stdout.write(`${kind}: 留 ${keepList.length} / 删 ${dropList.length}\n`);
  }
  process.stdout.write(`${dry ? '（dry run）' : ''}合计：保留 ${kept}，${dry ? '待删' : '删除'} ${removed}。规约外目录未触碰。\n`);
}
