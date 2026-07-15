// NIGHT-3 左耳：迟到者＋两颗旧 P0 现场复核。
// 固定使用左耳端口 4202；所有临时件与证据只写 audit/night3-L。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const out = join(root, 'audit', 'night3-L', 'evidence');
mkdirSync(out, { recursive: true });
const scratchRoot = join(out, 'scratch');
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(join(scratchRoot, 'ground-'));
const foleyHome = join(scratch, 'foley-home');
const claudeDir = join(scratch, 'claude');
const projects = join(scratch, 'projects');
mkdirSync(foleyHome, { recursive: true });
mkdirSync(claudeDir, { recursive: true });
mkdirSync(join(projects, 'p1'), { recursive: true });

// 只取真实会话的临时副本作 live 材料；finally 中销毁，绝不进入报告资产。
const realDir = join(homedir(), '.claude', 'projects', '-Users-shadow-tape0');
const source = readdirSync(realDir)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => ({ f, m: statSync(join(realDir, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m)[0]?.f;
if (!source) throw new Error('没有可用的真实 Claude 会话');
copyFileSync(join(realDir, source), join(projects, 'p1', 'session.jsonl'));
writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({
  hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: `node ${join(root, 'cli', 'hook.ts')}` }] }] },
}, null, 2));

const PORT = 4202;
const base = `http://127.0.0.1:${PORT}`;
// 复用主检出已有的审计工具依赖；被测源码仍严格来自 detached worktree。
const require = createRequire('/Users/shadow/tape0/audit/tools/package.json');
const { chromium } = require('playwright-core');
const executablePath = process.env.CHROMIUM_EXE
  ?? `${homedir()}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const serve = spawn(process.execPath, [join(root, 'stage', 'serve.mjs'), String(PORT)], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, FOLEY_HOME: foleyHome, CLAUDE_CONFIG_DIR: claudeDir, FOLEY_PROJECTS: projects },
});
let serveErr = '';
serve.stderr.on('data', (d) => { serveErr += String(d); });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`serve 启动超时：${serveErr.slice(-500)}`)), 10000);
  serve.stdout.on('data', (d) => {
    if (String(d).includes('stage @')) { clearTimeout(timer); resolve(); }
  });
  serve.on('exit', (code) => reject(new Error(`serve 提前退出 ${code}`)));
});

let browser;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));

  await page.goto(`${base}/?mode=live`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage?.live?.status === 'live', null, { timeout: 10000 });
  await page.waitForTimeout(900);
  const before = await page.evaluate(() => ({
    mode: window.__stage?.mode ?? null,
    liveStatus: window.__stage?.live?.status ?? null,
    stateCount: window.__stage?.live?.stateCount ?? 0,
    wireTag: !!document.getElementById('wire-tag'),
    signal: document.getElementById('room')?.dataset.signal ?? '',
    soundPresent: !!window.__stage?.sound,
  }));

  // 船长命门：会话已在跑，迟到者新开页后只给一次真实手势。
  await page.mouse.click(720, 450);
  await page.waitForFunction(() => window.__stage?.sound?.ctx?.state === 'running', null, { timeout: 10000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    window.__night3Engine = window.__stage?.sound?.engine;
    window.__night3MotionStart = {
      pen: document.getElementById('pen-head')?.getAttribute('style') ?? '',
      reelL: document.getElementById('reel-l')?.getAttribute('style') ?? '',
      reelR: document.getElementById('reel-r')?.getAttribute('style') ?? '',
    };
  });
  const first = await page.evaluate(async () => {
    const sb = window.__stage?.sound;
    const an = sb.ctx.createAnalyser(); an.fftSize = 2048;
    sb.engine.nodes.master.connect(an);
    const buf = new Float32Array(an.fftSize);
    const t0 = performance.now(); let peak = 0, bridgePeak = 0, sum = 0, n = 0, firstAbove005 = -1;
    while (performance.now() - t0 < 12000) {
      an.getFloatTimeDomainData(buf);
      let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
      const rms = Math.sqrt(e / buf.length);
      const bridgeRms = sb.rms?.() ?? 0;
      peak = Math.max(peak, rms); bridgePeak = Math.max(bridgePeak, bridgeRms); sum += rms; n++;
      if (firstAbove005 < 0 && Math.max(rms, bridgeRms) > 0.005) firstAbove005 = performance.now() - t0;
      await new Promise((r) => requestAnimationFrame(r));
    }
    const c = document.getElementById('chart-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let inkPixels = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) inkPixels++;
    return {
      ctx: sb.ctx.state,
      needleDrops: sb.needleDrops,
      rmsPeak: +peak.toFixed(5),
      bridgeRmsPeak: +bridgePeak.toFixed(5),
      rmsAvg: +(sum / Math.max(1, n)).toFixed(5),
      firstAbove005Sec: firstAbove005 < 0 ? -1 : +(firstAbove005 / 1000).toFixed(2),
      recordInfo: sb.recordInfo ?? null,
      stats: sb.stats?.() ?? null,
      inkPixels,
      chartSize: { width: c.width, height: c.height },
      motionStart: window.__night3MotionStart,
      motionEnd: {
        pen: document.getElementById('pen-head')?.getAttribute('style') ?? '',
        reelL: document.getElementById('reel-l')?.getAttribute('style') ?? '',
        reelR: document.getElementById('reel-r')?.getAttribute('style') ?? '',
      },
      stateCount: window.__stage?.live?.stateCount ?? 0,
      signal: document.getElementById('room')?.dataset.signal ?? '',
      wireTag: !!document.getElementById('wire-tag'),
    };
  });

  // 第二次手势不得生第二套声音图；验证双音重叠旧 P0 未回潮。
  await page.mouse.click(360, 300);
  await page.waitForTimeout(700);
  const second = await page.evaluate(() => ({
    sameEngine: window.__stage?.sound?.engine === window.__night3Engine,
    ctx: window.__stage?.sound?.ctx?.state ?? null,
    needleDrops: window.__stage?.sound?.needleDrops ?? null,
  }));
  await page.screenshot({ path: join(out, 'ground-latecomer.png') });

  const verdict = {
    sampledAt: new Date().toISOString(),
    ownedPids: { serve: serve.pid },
    before,
    afterFirstGesture: first,
    afterSecondGesture: second,
    pageErrors: logs.filter((x) => x.startsWith('[PAGEERROR]')),
  };
  verdict.PASS = before.liveStatus === 'live'
    && first.ctx === 'running'
    && Math.max(first.rmsPeak, first.bridgeRmsPeak) > 0.005
    && (first.inkPixels > 1000 || first.motionStart.pen !== first.motionEnd.pen)
    && first.signal === ''
    && first.wireTag === false
    && first.needleDrops === 1
    && second.sameEngine === true
    && verdict.pageErrors.length === 0;
  writeFileSync(join(out, 'ground-verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  writeFileSync(join(out, 'ground-console.log.txt'), `${logs.join('\n')}\n`);
  console.log(JSON.stringify(verdict, null, 2));
  process.exitCode = verdict.PASS ? 0 : 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (serve.exitCode === null) serve.kill('SIGTERM');
  rmSync(scratch, { recursive: true, force: true });
}
