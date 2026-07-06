#!/usr/bin/env node
// 重媒体再入闸（M2.4 §B.3 / §0.5）：拦**新增**的 >5MB 二进制，逼其走 GitHub Releases 而非入库。
// 既往重媒体祖父豁免（L-1）——只看本次新增，不翻旧账。用作 pre-commit 钩子或 CI 步骤。
//
//   node scripts/check-heavy-media.mjs           # 查暂存区新增（--diff-filter=A），超限 exit 1
//   node scripts/check-heavy-media.mjs --tree     # 查整棵工作树已跟踪件（审计用，informational）
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT = 5 * 1024 * 1024; // 5MB
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim();
const tree = process.argv.includes('--tree');

const listed = tree
  ? execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot })
  : execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=AM'], { cwd: repoRoot });
const files = listed.toString('utf8').split('\0').filter(Boolean);

// 文本扩展白名单：CSV/JSON/MD 等大文件（如金测试 fixture busy.curve.csv）不算重媒体
const TEXT_EXT = /\.(csv|json|jsonl|md|txt|svg|tsv|ndjson)$/i;
const offenders = [];
for (const f of files) {
  if (TEXT_EXT.test(f)) continue;
  let size;
  try { size = statSync(join(repoRoot, f)).size; } catch { continue; } // 已删除/不存在
  if (size > LIMIT) offenders.push([f, size]);
}

if (offenders.length === 0) {
  console.log(tree ? '工作树无 >5MB 二进制新账（祖父件不计）' : '暂存区无 >5MB 二进制新增');
  process.exit(0);
}

console.error(`✖ 重媒体再入闸：${offenders.length} 个 >5MB 二进制${tree ? '（工作树，含祖父件）' : '新增'}：`);
for (const [f, s] of offenders.sort((a, b) => b[1] - a[1])) {
  console.error(`  ${(s / 1048576).toFixed(1)}MB  ${f}`);
}
console.error('\n重媒体应挂 GitHub Releases，仓内只留指纹＋海报帧（见 docs/launch/GATE.md G6、mt2 RELEASES-MANIFEST.md）。');
console.error('确需入库：git 侧手动豁免，并在清单登记。');
process.exit(tree ? 0 : 1); // --tree 只审计不拦
