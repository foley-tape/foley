#!/usr/bin/env node
// README 测试数注入（M2.4 §B.2 元数据真话批）：数 golden 测试定义，写进 README 的
// <!--test-count-->…<!--/test-count--> 标记之间——真话由脚本维护，不再手写（冷读 #12：README「38」对不上实数）。
//
//   node scripts/sync-readme.mjs          # 就地更新 README.md / README.zh.md
//   node scripts/sync-readme.mjs --check   # 只校验：过期则打印差额并 exit 1（发布闸/CI 用）
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

/** 数 golden/*.test.ts 里的 test()/it() 定义（method 调用 .test( 与 submit/edit 等词不计）。 */
function countGoldenTests() {
  const dir = join(repoRoot, 'golden');
  let n = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith('.test.ts')) continue;
    const src = readFileSync(join(dir, ent.name), 'utf8');
    const m = src.match(/(?<![.\w])(?:test|it)\s*\(/g);
    n += m ? m.length : 0;
  }
  return n;
}

const count = countGoldenTests();
const check = process.argv.includes('--check');
const MARK = /(<!--test-count-->)(.*?)(<!--\/test-count-->)/s;
let stale = false;

for (const f of ['README.md', 'README.zh.md']) {
  const p = join(repoRoot, f);
  let src;
  try { src = readFileSync(p, 'utf8'); } catch { continue; }
  if (!MARK.test(src)) continue;
  const next = src.replace(MARK, `$1${count}$3`);
  if (next === src) continue;
  stale = true;
  if (check) console.error(`${f}: 测试数过期（应为 ${count}）——运行 npm run sync:readme`);
  else { writeFileSync(p, next); console.log(`${f}: 测试数 → ${count}`); }
}

if (check) {
  if (stale) process.exit(1);
  console.log(`README 测试数与实数一致（${count}）`);
} else {
  console.log(`golden 测试定义：${count}`);
}
