// 轨甲长跑仪：live 1× 实时钟长跑（默认 600s）——不漂、不哑、行帐有界的机器证据。
// 音画同源双读数：声桥 stats().packets（声侧收包帐）vs serve /today/curve.csv 行增量（画侧铺纸帐）——
// 两帐同源于一根总线，增量应≈同步（20Hz）。器具形制同 live-rms.mjs。
// 用法：node audit/a-live/repro/long-run.mjs [--sec 600] [--root <repoRoot>] [--out <dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = argOf('--root', join(here, '..', '..', '..'));
const out = argOf('--out', join(here, '..', 'shots-long'));
const SEC = Number(argOf('--sec', '600'));
const THR = 0.005;
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(join(here, '..', '..', '..', 'stage', 'tools', 'noop.js'))('playwright-core');

const exe = process.env.CHROMIUM_EXE
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const port = 44700 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;

const serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port)], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env },
});
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('serve 启动超时')), 10000);
  serve.stdout.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
  serve.on('exit', (c) => reject(new Error(`serve 提前退出 ${c}`)));
});

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto(`${base}/?mode=live`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
const curveLines = async () => page.evaluate(async () => (await (await fetch('/today/curve.csv')).text()).split('\n').length);
const lines0 = await curveLines();
await page.mouse.click(720, 450);
await page.waitForTimeout(1500);
const s0 = await page.evaluate(() => window.__stage?.sound?.stats?.() ?? null);
if (!s0) { console.error('声桥未起'); process.exit(1); }

const samples = [];
const t0 = Date.now();
while ((Date.now() - t0) / 1000 < SEC) {
  await page.waitForTimeout(2000);
  const s = await page.evaluate(() => {
    const sb = window.__stage?.sound;
    return sb ? { rms: sb.rms(), st: sb.stats(), rec: sb.recordInfo?.name ?? null } : null;
  });
  if (s) samples.push({ t: +((Date.now() - t0) / 1000).toFixed(1), rms: +s.rms.toFixed(5), packets: s.st.packets, rows: s.st.rows });
}
const s1 = await page.evaluate(() => window.__stage.sound.stats());
const lines1 = await curveLines();
await page.screenshot({ path: join(out, 'long-end.png') });

const sound = samples.filter((s) => s.rms > THR).length;
const packetsDelta = s1.packets - s0.packets;
const curveDelta = lines1 - lines0;
const verdict = {
  sec: SEC, samples: samples.length,
  soundRatio: +(sound / Math.max(samples.length, 1)).toFixed(4),
  rmsAvg: +(samples.reduce((a, s) => a + s.rms, 0) / Math.max(samples.length, 1)).toFixed(5),
  rowsMax: Math.max(...samples.map((s) => s.rows)),
  packetsDelta, curveDelta,
  avRatio: +(packetsDelta / Math.max(curveDelta, 1)).toFixed(4), // 声/画收包比：同总线两帐，≈1 即同源同钟
  pageErrors: logs.filter((l) => l.startsWith('[PAGEERROR]')).length,
  trail: samples.slice(-5),
};
verdict.pass = verdict.soundRatio > 0.95 && verdict.rowsMax <= 8192 && verdict.pageErrors === 0
  && verdict.avRatio > 0.9 && verdict.avRatio < 1.1;
console.log(JSON.stringify(verdict, null, 2));
writeFileSync(join(out, 'long-verdict.json'), JSON.stringify({ verdict, samples }, null, 2) + '\n');
writeFileSync(join(out, 'console.log.txt'), logs.join('\n'));
await browser.close();
serve.kill('SIGINT');
process.exit(verdict.pass ? 0 : 1);
