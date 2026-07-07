#!/usr/bin/env node
// README 数字注入（M2.4 §B.2 ＋ M2.5 §A.1 元数据真话批）：把「测试数」与「版本号」写进 README 标记之间，
// 真话由脚本维护、不再手写（冷读 #12：README「38」对不上实数；§A.1：版本号等一切数字改脚本注入）。
//   <!--test-count-->…<!--/test-count-->   ← golden 的 test()/it() 定义数
//   <!--version-->…<!--/version-->         ← package.json version
//
//   node scripts/sync-readme.mjs          # 就地更新 README.md / README.zh.md
//   node scripts/sync-readme.mjs --check   # 只校验：过期则打印差额并 exit 1（发布闸/CI 用）
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

/** 权威测试数＝实跑数（轨乙尾单，三号手令·丙裁定：说谎的自检闸必须修）。
 *  旧「定义数」口径（grep test()/it()）被 RECON 实证说谎：t.test() 子测试与循环生成的用例
 *  不进正则，注入 106 而实跑 116，--check 却报「一致」。改为跑与 npm test 同一条命令、
 *  取 TAP 总结数——慢（~20s）但闸门只认真话；套件红着拒绝取数（红的数不进 README）。 */
function countGoldenTests() {
  const r = spawnSync('node', ['--test', 'golden/**/*.test.ts'],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64e6 });
  const out = (r.stdout ?? '') + (r.stderr ?? '');
  const tests = Number(out.match(/\btests (\d+)/)?.[1]);
  const fail = Number(out.match(/\bfail (\d+)/)?.[1]);
  if (!Number.isFinite(tests) || !Number.isFinite(fail)) {
    console.error('实跑取数失败：TAP 总结里解析不到 tests/fail——先修套件再谈注入');
    process.exit(1);
  }
  if (fail > 0 || r.status !== 0) {
    console.error(`套件红着（fail ${fail}，退码 ${r.status}）——红的数不进 README`);
    process.exit(1);
  }
  return tests;
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
