#!/usr/bin/env node
// README 数字注入（M2.4 §B.2 ＋ M2.5 §A.1 元数据真话批）：把「测试数」与「版本号」写进 README 标记之间，
// 真话由脚本维护、不再手写（冷读 #12：README「38」对不上实数；§A.1：版本号等一切数字改脚本注入）。
//   <!--test-count-->…<!--/test-count-->   ← golden 的 test()/it() 定义数
//   <!--version-->…<!--/version-->         ← package.json version
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

const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
// 每个注入点：标记名 → 权威值
const INJECT = [
  ['test-count', String(countGoldenTests())],
  ['version', String(version)],
];
const check = process.argv.includes('--check');
let stale = false;

for (const f of ['README.md', 'README.zh.md']) {
  const p = join(repoRoot, f);
  let src;
  try { src = readFileSync(p, 'utf8'); } catch { continue; }
  let next = src;
  for (const [name, val] of INJECT) {
    const re = new RegExp(`(<!--${name}-->)(.*?)(<!--/${name}-->)`, 's');
    if (!re.test(next)) continue;
    const after = next.replace(re, `$1${val}$3`);
    if (after !== next) {
      stale = true;
      if (check) console.error(`${f}: ${name} 过期（应为 ${val}）——运行 npm run sync:readme`);
      next = after;
    }
  }
  if (!check && next !== src) { writeFileSync(p, next); console.log(`${f}: 已同步（${INJECT.map(([k, v]) => `${k}=${v}`).join('、')}）`); }
}

if (check) {
  if (stale) process.exit(1);
  console.log(`README 数字与实数一致（${INJECT.map(([k, v]) => `${k}=${v}`).join('、')}）`);
} else {
  console.log(`注入：${INJECT.map(([k, v]) => `${k}=${v}`).join('、')}`);
}
