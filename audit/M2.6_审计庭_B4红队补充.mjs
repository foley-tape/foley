#!/usr/bin/env node
// 审计庭独立红队补充（己-0）：B4 factory 回退是安全敏感的路径穿越面（003 令乙-②）。
// 丙自带 b4_probe 已过；本件是审计庭**自备的对抗向量**——不信 happy-path，专打穿越/白名单/泄漏。
// 被测：track/c-security 的 stage/serve.mjs。零参数自足；HOME=临时 factory，多深度埋密。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WT = '/Users/shadow/tape0-c-security';
const serve = join(WT, 'stage', 'serve.mjs');
const port = 46400 + Math.floor(Math.random() * 300);
const home = mkdtempSync(join(tmpdir(), 'b4-redteam-home-'));
const recF = join(home, '.foley', 'records', 'factory');
const astF = join(home, '.foley', 'assets', 'factory');
mkdirSync(recF, { recursive: true });
mkdirSync(astF, { recursive: true });
// 白名单内（catalog 在册）：saturation / warm-fuzz / still-life
writeFileSync(join(recF, 'saturation.mp3'), Buffer.from('REC-FACTORY-SATURATION'));
writeFileSync(join(recF, 'warm-fuzz.mp3'), Buffer.from('REC-FACTORY-WARMFUZZ'));
writeFileSync(join(recF, 'evil.mp3'), Buffer.from('POISON-EVIL'));          // 白名单外，factory 中有
writeFileSync(join(astF, 'l1-roomtone.wav'), Buffer.from('AST-FACTORY-ROOMTONE'));
writeFileSync(join(astF, 'evil.wav'), Buffer.from('POISON-WAV'));           // 白名单外资产
// 多深度埋密：factory 之上逐级放诱饵——无 fence 的 naive join 任一层都会漏
writeFileSync(join(home, '.foley', 'records', 'SECRET_1UP.txt'), Buffer.from('LEAK-1UP-MUST-NOT-SHOW'));
writeFileSync(join(home, '.foley', 'SECRET_2UP.txt'), Buffer.from('LEAK-2UP-MUST-NOT-SHOW'));
writeFileSync(join(home, 'SECRET_3UP.txt'), Buffer.from('LEAK-3UP-MUST-NOT-SHOW'));

const proc = spawn('node', [serve, String(port), '--replay-only'],
  { cwd: WT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: home } });
const ready = new Promise((res, rej) => {
  const to = setTimeout(() => rej(new Error('serve 启动超时')), 8000);
  proc.stdout.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); res(); } });
  proc.on('exit', (c) => { clearTimeout(to); rej(new Error(`serve 提前退出 ${c}`)); });
});
const base = `http://127.0.0.1:${port}`;

// 每条：期状态码集合 + 禁止出现在响应体的泄漏标记（全体密都不许露 + evil 内容不许被穿越取到）
const LEAKS = ['LEAK-1UP', 'LEAK-2UP', 'LEAK-3UP', 'POISON-EVIL', 'POISON-WAV'];
const attacks = [
  // — 编码穿越（多套编码/深度）——期非 2xx 且不泄
  ['/records/%2e%2e%2f%2e%2e%2f%2e%2e%2fSECRET_3UP.txt', [400,403,404]],
  ['/records/..%2f..%2fSECRET_2UP.txt',                  [400,403,404]],
  ['/records/..%252f..%252fSECRET_2UP.txt',              [400,403,404]], // 双重编码
  ['/records/....//....//SECRET_2UP.txt',                [400,403,404]], // 点点滑动
  ['/records/..%5c..%5cSECRET_2UP.txt',                  [400,403,404]], // 反斜杠编码
  ['/records/%2e%2e/SECRET_1UP.txt',                     [400,403,404]],
  ['/records/saturation.mp3%00.txt',                     [400,403,404]], // 空字节截断
  ['/sound/assets/..%2f..%2f..%2fSECRET_3UP.txt',        [400,403,404]], // 资产面同打
  ['/sound/assets/../records/factory/evil.mp3',          [400,403,404]], // 跨面拐取 evil
  ['/records/saturation.mp3/../evil.mp3',                [400,403,404]], // 段拼接拐 evil
  // — 白名单绕过 —— evil 必 404，query/大小写/加尾不得放行
  ['/records/evil.mp3',                                  [404]],
  ['/records/evil.mp3?x=saturation.mp3',                 [404]],
  ['/records/EVIL.MP3',                                  [404]],
  ['/records/evil.mp3.',                                 [400,403,404]],
  ['/sound/assets/evil.wav',                             [404]],
  // — 正向控制（回退真在工作）——
  ['/records/saturation.mp3',                            [200], 'REC-FACTORY-SATURATION'],
  ['/records/warm-fuzz.mp3',                             [200], 'REC-FACTORY-WARMFUZZ'],
  ['/sound/assets/l1-roomtone.wav',                      [200], 'RIFF'], // repo 真身在树→precedence 命中 repo（非 factory），得真 wav（RIFF）
];

let pass = 0, fail = 0, leaks = 0;
try {
  await ready;
  for (const [path, want, wantBody] of attacks) {
    let status = 0, body = '';
    try { const r = await fetch(base + path); status = r.status; body = await r.text(); }
    catch (e) { status = -1; body = 'FETCH_ERR:' + e.message; }
    const okCode = want.includes(status);
    const leaked = LEAKS.some((m) => body.includes(m));
    const okBody = wantBody ? body.startsWith(wantBody) : !leaked;
    const ok = okCode && okBody && !leaked;
    if (leaked) leaks++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${String(status).padEnd(4)} ${path}  期 ${JSON.stringify(want)}${leaked ? '  ⚠泄漏!' : ''}`);
    ok ? pass++ : fail++;
  }
  console.log(`\n${fail === 0 && leaks === 0 ? '✓ 红队补充全过：穿越/白名单/泄漏三面无破' : '✗ 有破口'}  ${pass} pass / ${fail} fail / ${leaks} 泄漏`);
  process.exitCode = (fail === 0 && leaks === 0) ? 0 : 1;
} catch (e) {
  console.error('装置失败:', e.message); process.exitCode = 2;
} finally {
  proc.kill('SIGKILL');
}
