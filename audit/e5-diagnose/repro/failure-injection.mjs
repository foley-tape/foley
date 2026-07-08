// E5 状态可诊·失效注入（第五号手令 丁-E5＋戊.3＋铁问#4 断线重连）：
//   [A] 杀 serve：进程杀掉→SSE 不可达→信号丢失（room[data-signal=lost]＋灯语"Signal Lost"现身，诚实报态不装死）。
//   [B] 断线重连：同端口重起 serve→EventSource 自动重连→自愈回 live（data-signal 撤除）。此即铁问#4。
//   [注一] localhost 应用的"断网"＝serve 不可达，与杀 serve 页侧同效（setOffline 不触及回环，故以杀 serve 代之）。
//   [注二] 杀 claude：serve/20Hz 心跳仍在→机器诚实入睡（IDLE），非信号丢失（此为既有正确行为，不强测——需真 live 会话）。
//   [注三] gone（live 子进程退出→"Source Gone"）已接线，注入难（child 常驻尾随），本测不覆盖。
// 用法：node audit/e5-diagnose/repro/failure-injection.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.REPO_ROOT || join(here, '..', '..', '..');
const require = createRequire(join(root, 'audit', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const exe = process.env.CHROMIUM_EXE ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

// hermetic 会话素材：真实会话副本作 live 喂食（静态→cli live 追平后 20Hz 心跳，status 稳定 live）
const proj = mkdtempSync(join(tmpdir(), 'e5-proj-'));
mkdirSync(join(proj, 'p1'), { recursive: true });
const realDir = join(process.env.HOME, '.claude', 'projects', '-Users-shadow-tape0');
copyFileSync(join(realDir, readdirSync(realDir).filter(f => f.endsWith('.jsonl'))[0]), join(proj, 'p1', 'session.jsonl'));

const PORT = 47900 + Math.floor(Math.random() * 200);
function bootServe() {
  const serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(PORT)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FOLEY_PROJECTS: proj } });
  serve.stderr.on('data', () => {});
  const ready = new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('serve 超时')), 10000); serve.stdout.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); res(); } }); });
  return { serve, ready };
}

const sig = (page) => page.evaluate(() => ({
  signal: document.getElementById('room').dataset.signal ?? '',
  liveStatus: window.__stage?.live?.status ?? null,
  cueOpacity: +getComputedStyle(document.getElementById('signal-cue')).opacity,
  label: getComputedStyle(document.querySelector('#signal-cue .label'), '::after').content,
}));

const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));

let srv = bootServe();
await srv.ready;
await page.goto(`http://127.0.0.1:${PORT}/?mode=live`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.mouse.click(720, 450);
await page.waitForTimeout(1500);
const baseline = await sig(page);                       // 应 live：无 data-signal、cue 隐

// ── [A] 杀 serve → 信号丢失（诚实报态） ──
srv.serve.kill('SIGKILL');
await page.waitForTimeout(2800);                         // 去抖 1.2s + EventSource 报错 + 余量
const lost = await sig(page);
await page.screenshot({ path: join(here, '..', 'shots', 'signal-lost.png') });

// ── [B] 同端口重起 serve → 断线重连自愈（铁问#4） ──
srv = bootServe();
await srv.ready;
await page.waitForTimeout(7000);                         // EventSource 自动重连（~3s）＋新 child 追平出首包
const recovered = await sig(page);

const A = {
  baseline_live: baseline.signal === '' && baseline.cueOpacity < 0.1, baselineStatus: baseline.liveStatus,
  killServe_lost: lost.signal === 'lost' && lost.cueOpacity > 0.5, lostLabel: lost.label,
  pass: baseline.signal === '' && lost.signal === 'lost' && lost.cueOpacity > 0.5,
};
const B = {
  reconnect_recovered: recovered.signal === '' && recovered.cueOpacity < 0.1, recoveredStatus: recovered.liveStatus,
  pass: recovered.signal === '' && recovered.liveStatus === 'live',
};
const verdict = { decree: 'FOLEY_DECREE_005 丁-E5 状态可诊·失效注入', A_kill_serve_lost: A, B_reconnect_recover: B, pageErrors: errs.length,
  PASS: A.pass && B.pass && errs.length === 0 };
console.log(JSON.stringify(verdict, null, 2));
writeFileSync(join(here, '..', 'verdict.json'), JSON.stringify(verdict, null, 2) + '\n');

await browser.close();
srv.serve.kill('SIGKILL');
rmSync(proj, { recursive: true, force: true });
process.exit(verdict.PASS ? 0 : 1);
