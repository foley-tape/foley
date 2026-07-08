// 己-5 合龙微单端到端：轨乙 connect 自证 SSE `wired` → 轨甲声桥一声落针。
// 走真实接缝（非页内伪造事件）：hermetic spool 写一条 hello → serve 尾随（≤1.5s 轮询）广播真
// `wired` SSE → 页面 main.js 监听器撤接线签＋调 sound.needleDrop → 引擎 fgBus 出落针。
// 双证：①spy 落针被调用（接线确定性）②analyser 量落针瞬态（声真的响）。
//
// 用法：node audit/a-seam/repro/needle-drop.mjs [--root <repoRoot>] [--out <dir>]
// 收摊纪律：serve/live 为本进程直属子进程，SIGINT 逐个收（禁 pkill 模式串·手令甲.3）。
import { mkdirSync, writeFileSync, mkdtempSync, appendFileSync, rmSync, copyFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = argOf('--root', join(here, '..', '..', '..'));
const out = argOf('--out', join(here, '..', 'shots'));
mkdirSync(out, { recursive: true });
const { chromium } = createRequire(join(here, '..', '..', '..', 'stage', 'tools', 'noop.js'))('playwright-core');

const exe = process.env.CHROMIUM_EXE
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const port = 44300 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${port}`;

// hermetic：FOLEY_HOME=temp（spool 隔离，不碰用户真 ~/.foley/spool）；FOLEY_PROJECTS 放一份真实会话副本
// （/live SSE 要活，wired 才有信道）。~/.foley/records/factory 照旧 homedir 域，唱片正常上桥不碍事。
const home = mkdtempSync(join(tmpdir(), 'seam-home-'));
mkdirSync(join(home, 'spool'), { recursive: true });
const proj = mkdtempSync(join(tmpdir(), 'seam-proj-'));
mkdirSync(join(proj, 'p1'), { recursive: true });
const realDir = join(process.env.HOME, '.claude', 'projects', '-Users-shadow-tape0');
const jsonls = readdirSync(realDir).filter(f => f.endsWith('.jsonl'))
  .map(f => ({ f, m: 0 })); // 取任一真实会话副本作 live 素材
copyFileSync(join(realDir, jsonls[0].f), join(proj, 'p1', 'session.jsonl'));

const serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port)], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, FOLEY_HOME: home, FOLEY_PROJECTS: proj },
});
serve.stderr.on('data', () => {});
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('serve 启动超时')), 10000);
  serve.stdout.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
  serve.on('exit', c => reject(new Error(`serve 提前退出 ${c}`)));
});

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

await page.goto(`${base}/?mode=live`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.mouse.click(720, 450);      // 开机仪式：声桥起
await page.waitForTimeout(1500);

// spy：包住 needleDrop（仍调真身→仍出声），计数落针被调；启高频 RMS 采样器
await page.evaluate(() => {
  const sb = window.__stage?.sound;
  window.__nd = { calls: 0, ctx: sb?.ctx?.state ?? null, hasFn: typeof sb?.needleDrop === 'function' };
  if (sb && typeof sb.needleDrop === 'function') {
    const real = sb.needleDrop.bind(sb);
    sb.needleDrop = () => { window.__nd.calls++; window.__nd.at = performance.now(); return real(); };
  }
  // 独立 analyser 挂 master（与声桥自报 rms 分开的读数层）
  const an = sb.ctx.createAnalyser(); an.fftSize = 2048;
  sb.engine.nodes.master.connect(an);
  window.__an = an; window.__buf = new Float32Array(an.fftSize);
  window.__peak = (winMs) => new Promise(res => {
    const t0 = performance.now(); let pk = 0;
    const tick = () => {
      window.__an.getFloatTimeDomainData(window.__buf);
      let e = 0; for (let i = 0; i < window.__buf.length; i++) e += window.__buf[i] * window.__buf[i];
      pk = Math.max(pk, Math.sqrt(e / window.__buf.length));
      if (performance.now() - t0 < winMs) requestAnimationFrame(tick); else res(+pk.toFixed(5));
    };
    tick();
  });
});

const pre = await page.evaluate(() => window.__nd);
const basePeak = await page.evaluate(() => window.__peak(1000)); // 落针前基线峰（床/唱片本底）

// 触发真实接缝：hermetic spool 写 hello（= foley connect 自证之效）
appendFileSync(join(home, 'spool', 'events.ndjson'), JSON.stringify({ kind: 'hello' }) + '\n');

// serve 轮询 ≤1.5s + 传播；期间连续采峰值（落针瞬态要抓住）
const eventPeak = await page.evaluate(() => window.__peak(3500));
await page.waitForTimeout(200);
const post = await page.evaluate(() => ({ nd: window.__nd, tagGone: !document.getElementById('wire-tag') }));
await page.screenshot({ path: join(out, 'needle-drop-after.png') });

const wiredSeen = logs.some(l => l.includes('wired') || l.includes('接线自证'));
const verdict = {
  soundBridgeUp: pre.ctx === 'running' && pre.hasFn,
  needleDropCalls: post.nd.calls,
  basePeak, eventPeak,
  transient: +(eventPeak - basePeak).toFixed(5),
  wireTagDismissed: post.tagGone,
  pageErrors: logs.filter(l => l.startsWith('[PAGEERROR]')).length,
};
// 判据：声桥在场＋落针被调 ≥1（接线确定性）＋事件窗峰 > 基线（落针瞬态真响）＋零页错
verdict.pass = verdict.soundBridgeUp && verdict.needleDropCalls >= 1
  && verdict.eventPeak > verdict.basePeak && verdict.pageErrors === 0;
console.log(JSON.stringify(verdict, null, 2));
writeFileSync(join(out, 'verdict.json'), JSON.stringify(verdict, null, 2) + '\n');
writeFileSync(join(out, 'console.log.txt'), logs.join('\n'));

await browser.close();
serve.kill('SIGINT');
rmSync(home, { recursive: true, force: true });
rmSync(proj, { recursive: true, force: true });
process.exit(verdict.pass ? 0 : 1);
