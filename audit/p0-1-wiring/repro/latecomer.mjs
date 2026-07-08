// P0-1 · 接线倒置常设回归（第五号手令 乙.3／戊.3）——船长场景原样。
//
// 立三案，一次跑齐：
//   [A] 迟到者/到场即已接线：settings.json 有钩子（先前会话已 connect），本页开机**无新 hello 广播**。
//       期望：到场即自愈入场仪式——一声落针恰 1、无接线签、房间呼吸、有动（chart 落墨）。
//       ——这正是船长命门：会话进行中→新开浏览器页→手势→N 秒内有声有动。
//   [B] 未接线→会话中途 connect：settings.json 无钩子，页面亮接线签；spool 落一枚 hello →
//       serve 广播 wired → 页面撤签＋落针恰 1。（SSE 后续更新通道仍活。）
//   [C] 不变量二·舞台永不被接线扣留：未接线的页面手势之后房间层照样呼吸（RMS>0）——存在≠内容。
//
// 落针免竞态读法：声桥内建 needleDrops 计次（机器代理只读态，soundbridge.js）——入场仪式在 spy
// 安装之前落也数得到。读数层独立：另挂 analyser 于 engine.nodes.master，不采信声桥自报。
//
// 用法：node audit/p0-1-wiring/repro/latecomer.mjs [--root <repoRoot>]
// 收摊纪律：serve 为本进程直属子进程，SIGINT 逐收；hermetic HOME/CFG/PROJECTS 即用即删（禁 pkill·手令甲.3）。
import { mkdirSync, writeFileSync, mkdtempSync, copyFileSync, readdirSync, rmSync, appendFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = argOf('--root', join(here, '..', '..', '..'));
function argOf(k, d) { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; }
const require = createRequire(join(root, 'audit', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const exe = process.env.CHROMIUM_EXE
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const realDir = join(process.env.HOME, '.claude', 'projects', '-Users-shadow-tape0');
const sampleJsonl = readdirSync(realDir).filter(f => f.endsWith('.jsonl'))[0];

// 起一台 hermetic serve；wired = settings.json 是否挂 foley 钩子。
function bootServe({ wired }) {
  const home = mkdtempSync(join(tmpdir(), 'p01-home-'));
  mkdirSync(join(home, 'spool'), { recursive: true });
  const cfg = mkdtempSync(join(tmpdir(), 'p01-cfg-'));
  writeFileSync(join(cfg, 'settings.json'), JSON.stringify(
    wired ? { hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: `node ${join(root, 'cli', 'hook.ts')}` }] }] } } : {},
    null, 2));
  const proj = mkdtempSync(join(tmpdir(), 'p01-proj-'));
  mkdirSync(join(proj, 'p1'), { recursive: true });
  copyFileSync(join(realDir, sampleJsonl), join(proj, 'p1', 'session.jsonl'));
  const port = 45600 + Math.floor(Math.random() * 300);
  const serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FOLEY_HOME: home, CLAUDE_CONFIG_DIR: cfg, FOLEY_PROJECTS: proj },
  });
  serve.stderr.on('data', () => {});
  const ready = new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('serve 启动超时')), 10000);
    serve.stdout.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
    serve.on('exit', c => reject(new Error(`serve 提前退出 ${c}`)));
  });
  const cleanup = () => { serve.kill('SIGINT'); for (const d of [home, cfg, proj]) rmSync(d, { recursive: true, force: true }); };
  return { port, base: `http://127.0.0.1:${port}`, home, ready, cleanup };
}

// 页面就绪→手势→装 analyser/spy；返回一个 probe 把手
async function openAndGesture(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));
  await page.goto(`${base}/?mode=live`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  await page.mouse.click(720, 450);        // 开机仪式
  await page.waitForTimeout(1800);          // 待声桥 start() resolve（入场落针在此窗内）
  await page.evaluate(() => {
    const sb = window.__stage?.sound;
    const an = sb.ctx.createAnalyser(); an.fftSize = 2048;
    sb.engine.nodes.master.connect(an);
    window.__peak = (winMs) => new Promise(res => {
      const t0 = performance.now(); let pk = 0; const buf = new Float32Array(an.fftSize);
      const tick = () => {
        an.getFloatTimeDomainData(buf);
        let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
        pk = Math.max(pk, Math.sqrt(e / buf.length));
        if (performance.now() - t0 < winMs) requestAnimationFrame(tick); else res(+pk.toFixed(5));
      };
      tick();
    });
  });
  const snap = async () => page.evaluate(() => ({
    needleDrops: window.__stage?.sound?.needleDrops ?? null,
    ctx: window.__stage?.sound?.ctx?.state ?? null,
    stateCount: window.__stage?.live?.stateCount ?? 0,
    tagPresent: !!document.getElementById('wire-tag'),
    inkPixels: (() => { const c = document.getElementById('chart-canvas'); if (!c) return null;
      try { const g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; } catch { return 'tainted'; } })(),
  }));
  return { page, logs, snap };
}

const browser = await chromium.launch({ executablePath: exe, headless: true });
const results = {};

// ───────────────── [A] 迟到者/到场即已接线 ─────────────────
{
  const srv = bootServe({ wired: true });
  await srv.ready;
  const status = await (await fetch(`${srv.base}/onboard/status`)).json();
  const { page, logs, snap } = await openAndGesture(browser, srv.base);
  await page.waitForTimeout(1500);
  const s = await snap();
  const roomPeak = await page.evaluate(() => window.__peak(1200));
  await page.screenshot({ path: join(here, '..', 'shots', 'A-latecomer.png') });
  results.A_latecomer = {
    serverWired: status.wired, needleCeremony: s.needleDrops, wireTag: s.tagPresent,
    motionInk: s.inkPixels, stateCount: s.stateCount, roomPeak, pageErrors: logs.length,
    pass: status.wired === true && s.needleDrops === 1 && s.tagPresent === false
      && s.inkPixels > 1000 && roomPeak > 0 && logs.length === 0,
  };
  await page.close();
  srv.cleanup();
}

// ───────────────── [B] 未接线→会话中途 connect（hello 广播） ─────────────────
{
  const srv = bootServe({ wired: false });
  await srv.ready;
  const { page, logs, snap } = await openAndGesture(browser, srv.base);
  const before = await snap();                                   // 亮着接线签、未落针
  appendFileSync(join(srv.home, 'spool', 'events.ndjson'), JSON.stringify({ kind: 'hello' }) + '\n');
  await page.waitForTimeout(2500);                                // serve 轮询 ≤1.5s + 传播 + 落针
  const after = await snap();
  results.B_midsession_connect = {
    tagBefore: before.tagPresent, needleBefore: before.needleDrops,
    tagAfter: after.tagPresent, needleAfter: after.needleDrops, pageErrors: logs.length,
    pass: before.tagPresent === true && before.needleDrops === 0
      && after.tagPresent === false && after.needleDrops === 1 && logs.length === 0,
  };
  await page.close();
  srv.cleanup();
}

// ───────────────── [C] 不变量二：未接线舞台照样呼吸 ─────────────────
{
  const srv = bootServe({ wired: false });
  await srv.ready;
  const { page, logs, snap } = await openAndGesture(browser, srv.base);
  const roomPeak = await page.evaluate(() => window.__peak(1500));
  const s = await snap();
  results.C_room_unconditional = {
    serverWired: false, roomPeak, needleDrops: s.needleDrops, motionInk: s.inkPixels, pageErrors: logs.length,
    pass: roomPeak > 0 && s.needleDrops === 0 && s.inkPixels > 1000 && logs.length === 0,
  };
  await page.close();
  srv.cleanup();
}

await browser.close();
const PASS = Object.values(results).every(r => r.pass);
const out = { decree: 'FOLEY_DECREE_005 乙 P0-1 接线倒置', PASS, ...results };
console.log(JSON.stringify(out, null, 2));
writeFileSync(join(here, '..', 'verdict.json'), JSON.stringify(out, null, 2) + '\n');
process.exit(PASS ? 0 : 1);
