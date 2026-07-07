#!/usr/bin/env node
// 复现（丙·B4／RECON 新雷·乙-②归轨丙）：打包态 serve 是否供出厂唱片/床音。
// 根因：npm 包 files 白名单排除 sound/records/*.mp3 与 sound/assets/*.wav（真身走 Releases）；
//   用户 `foley records fetch` 落 ~/.foley/{records,assets}/factory/，但（修前）serve 静态根只见 repo →
//   打包态页面声桥一律 404（dev 被 vendored mp3 掩蔽故此前漏网；本机工作树 mp3 gitignored 天然复现打包态）。
// 修（stage/serve.mjs）：/records/**、/sound/assets/** repo 缺件时回退 factory；三闸=只读＋fence 前缀＋文件名白名单。
//
// 自足复现：本脚本自起 serve（--replay-only 静态态），以 HOME=<临时> 造 hermetic factory，逐项探测。零参数、零 sleep。
//   用法： node audit/repro/b4_probe.mjs
//   判据（修后·雷已排）：
//     /records/saturation.mp3      → 200（白名单唱片，repo 缺、factory 有）★核心
//     /records/evil.mp3            → 404（白名单外投毒件，即便在 factory 也拒）
//     /records/../../SECRET.txt    → 403/404（穿越，HOME 秘密不泄）
//     /sound/records/catalog.json  → 200（元数据入包，回退不误伤）
//   修前：/records/saturation.mp3 → 404（雷在）。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); // audit/repro/ → 上两级=仓库根
const serve = join(repoRoot, 'stage', 'serve.mjs');
const port = 45900 + Math.floor(Math.random() * 400);
const home = mkdtempSync(join(tmpdir(), 'b4-repro-home-'));
const recF = join(home, '.foley', 'records', 'factory');
const astF = join(home, '.foley', 'assets', 'factory');
mkdirSync(recF, { recursive: true });
mkdirSync(astF, { recursive: true });
writeFileSync(join(recF, 'saturation.mp3'), Buffer.from('REC-FACTORY-SATURATION'));  // 白名单内（catalog 在册）
writeFileSync(join(recF, 'evil.mp3'), Buffer.from('POISON'));                         // 白名单外
writeFileSync(join(astF, 'l1-roomtone.wav'), Buffer.from('AST-FACTORY-ROOMTONE'));
writeFileSync(join(home, 'SECRET.txt'), Buffer.from('HOME-SECRET-MUST-NOT-LEAK'));

const proc = spawn('node', [serve, String(port), '--replay-only'],
  { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: home } });
const ready = new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('serve 启动超时')), 8000);
  proc.stdout.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); res(); } });
  proc.on('exit', (c) => { clearTimeout(to); rej(new Error(`serve 提前退出 ${c}`)); });
});

const base = `http://127.0.0.1:${port}`;
const cases = [
  ['/records/saturation.mp3', 200, 'REC-FACTORY-SATURATION'],  // ★核心：白名单唱片 factory 回退
  ['/records/evil.mp3', 404, null],                            // 白名单外投毒件拒
  ['/records/still-life.mp3', 404, null],                      // 白名单内但 factory 亦缺 → 诚实 404
  ['/records/../../SECRET.txt', [403, 404], null],             // 穿越
  ['/records/..%2f..%2fSECRET.txt', [403, 404], null],         // 编码穿越
  ['/sound/records/catalog.json', 200, null],                  // 元数据入包
];

let pass = 0, fail = 0;
try {
  await ready;
  for (const [path, want, wantBody] of cases) {
    const r = await fetch(base + path);
    const body = await r.text();
    const okCode = Array.isArray(want) ? want.includes(r.status) : r.status === want;
    const okBody = wantBody == null ? !body.includes('HOME-SECRET') : body.startsWith(wantBody);
    const ok = okCode && okBody;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${String(r.status).padEnd(4)} ${path}  期望 ${JSON.stringify(want)}`);
    ok ? pass++ : fail++;
  }
  console.log(`\n${fail === 0 ? '✓ 雷已排（B4 factory 回退＋白名单三闸全立）' : '✗ 仍有未过项'}  ${pass} pass / ${fail} fail`);
  process.exitCode = fail === 0 ? 0 : 1;
} catch (e) {
  console.error('复现失败:', e.message);
  process.exitCode = 2;
} finally {
  proc.kill('SIGKILL');
}
