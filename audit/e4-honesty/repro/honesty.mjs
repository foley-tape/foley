// E4 器件诚实·违宪修复验证（第五号手令 丁-E4）：
//   [A] 暗区渐变加抖动：暗块 screen 抖动层 ON vs OFF，量合成像素局部 std——色带（低方差）被打散（方差抬升）。
//   [B] 棘爪回位律：计数停转后末轮落卡位（translateY 为 WHEEL_H 整数倍），永不悬半格。
// 用法：node audit/e4-honesty/repro/honesty.mjs
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.REPO_ROOT || join(here, '..', '..', '..');
const require = createRequire(join(root, 'audit', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const exe = process.env.CHROMIUM_EXE ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const port = 47700 + Math.floor(Math.random() * 200);
const serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } });
serve.stderr.on('data', () => {});
await new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('serve 超时')), 10000); serve.stdout.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); res(); } }); });
const b = await chromium.launch({ executablePath: exe, headless: true });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(`http://127.0.0.1:${port}/?tape=storm&speed=6&sound=0`, { waitUntil: 'load' });
await p.waitForTimeout(700);
await p.mouse.click(720, 450);
await p.waitForTimeout(2500);

// ── [A] 暗区抖动 ──
const clip = { x: 1330, y: 810, width: 96, height: 80 };
const decoder = await b.newPage();
async function stdOf(pngBuf) {
  return decoder.evaluate(async (b64) => {
    const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += v; s2 += v * v; n++; }
    const mean = s / n; return { std: +Math.sqrt(s2 / n - mean * mean).toFixed(3), mean: +mean.toFixed(2) };
  }, pngBuf.toString('base64'));
}
const on = await stdOf(await p.screenshot({ clip }));
await p.evaluate(() => { document.getElementById('grain-dark').style.opacity = '0'; });
await p.waitForTimeout(150);
const off = await stdOf(await p.screenshot({ clip }));
await p.evaluate(() => { document.getElementById('grain-dark').style.opacity = ''; });
await p.screenshot({ path: join(here, '..', 'shots', 'dark-dither-on.png'), clip });

// ── [B] 棘爪回位 ──
const WHEEL_H = 44;
const offDetent = (ty) => { const r = ((ty % WHEEL_H) + WHEEL_H) % WHEEL_H; return Math.min(r, WHEEL_H - r); };
const readUnits = () => p.evaluate(() => { const w = window.__stage.counter.wheels[3]; const m = /translateY\(([-\d.]+)px\)/.exec(w.style.transform || ''); return m ? Math.abs(parseFloat(m[1])) : null; });
await p.evaluate(() => window.__stage.counter.loupe.classList.add('on'));
await p.waitForTimeout(120);
const movingTy = await readUnits();
await p.evaluate(() => window.__stage.replayer.pause());
await p.waitForTimeout(1000);
const settledTy = await readUnits();

const A = { off_bandingStd: off.std, on_ditheredStd: on.std, stdLift: +(on.std - off.std).toFixed(3), meanLiftLSB: +(on.mean - off.mean).toFixed(2),
  pass: off.std < 1.5 && on.std > off.std + 0.6 && (on.mean - off.mean) < 6 };
const B = { movingOffDetent: movingTy != null ? +offDetent(movingTy).toFixed(2) : null, settledTy, settledOffDetent: settledTy != null ? +offDetent(settledTy).toFixed(2) : null,
  pass: settledTy != null && offDetent(settledTy) < 0.6 };
const verdict = { decree: 'FOLEY_DECREE_005 丁-E4 器件诚实（违宪子集）', A_darkDither: A, B_pawlReturn: B, pageErrors: errs.length,
  PASS: A.pass && B.pass && errs.length === 0 };
console.log(JSON.stringify(verdict, null, 2));
writeFileSync(join(here, '..', 'verdict.json'), JSON.stringify(verdict, null, 2) + '\n');
await b.close(); serve.kill('SIGINT');
process.exit(verdict.PASS ? 0 : 1);
