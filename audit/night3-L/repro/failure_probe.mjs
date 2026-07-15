// NIGHT-3 左耳：三式失效（live 源、serve、浏览器断网）与恢复。
// 只用左耳端口 4203；只杀本脚本 spawn 并记录的 PID。
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const out = join(root, 'audit', 'night3-L', 'evidence');
const scratchRoot = join(out, 'scratch');
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(join(scratchRoot, 'fail-'));
const projects = join(scratch, 'projects');
mkdirSync(join(projects, 'p1'), { recursive: true });
const realDir = join(homedir(), '.claude', 'projects', '-Users-shadow-tape0');
const source = readdirSync(realDir)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => ({ f, m: statSync(join(realDir, f)).mtimeMs }))
  .sort((a, b) => b.m - a.m)[0]?.f;
if (!source) throw new Error('没有可用的真实 Claude 会话');
copyFileSync(join(realDir, source), join(projects, 'p1', 'session.jsonl'));

const PORT = 4203;
const base = `http://127.0.0.1:${PORT}`;
// 复用主检出已有的审计工具依赖；被测源码仍严格来自 detached worktree。
const require = createRequire('/Users/shadow/tape0/audit/tools/package.json');
const { chromium } = require('playwright-core');
const executablePath = process.env.CHROMIUM_EXE
  ?? `${homedir()}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const owned = [];

function liveChildOf(servePid) {
  try {
    const s = execFileSync('pgrep', ['-P', String(servePid)], { encoding: 'utf8' }).trim().split(/\s+/)[0];
    return Number(s) || null;
  } catch { return null; }
}

function bootServe() {
  const serve = spawn(process.execPath, [join(root, 'stage', 'serve.mjs'), String(PORT)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FOLEY_PROJECTS: projects, FOLEY_HOME: join(scratch, 'foley-home') },
  });
  let err = '';
  serve.stderr.on('data', (d) => { err += String(d); });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve 启动超时：${err.slice(-500)}`)), 10000);
    serve.stdout.on('data', (d) => {
      if (String(d).includes('stage @')) { clearTimeout(timer); resolve(); }
    });
    serve.on('exit', (code) => { if (code && code !== 0) reject(new Error(`serve 提前退出 ${code}`)); });
  });
  owned.push({ kind: 'serve', pid: serve.pid });
  return { serve, ready };
}

async function snap(page) {
  return page.evaluate(() => ({
    signal: document.getElementById('room')?.dataset.signal ?? '',
    liveStatus: window.__stage?.live?.status ?? null,
    cueOpacity: +getComputedStyle(document.getElementById('signal-cue')).opacity,
    label: getComputedStyle(document.querySelector('#signal-cue .label'), '::after').content,
  }));
}

let browser;
let currentServe;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const result = { sampledAt: new Date().toISOString(), ownedPids: owned, errors };

  // A. live/Claude 尾随子进程死亡：应显示 Source Gone。
  currentServe = bootServe(); await currentServe.ready;
  await page.goto(`${base}/?mode=live`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage?.live?.status === 'live', null, { timeout: 10000 });
  // 让 /rack transport 完成装带；否则极早故障会早于 liveActive=true，被 UI 监听器有意忽略。
  await page.waitForFunction(() => document.body.classList.contains('tape-loaded'), null, { timeout: 5000 });
  await page.waitForTimeout(1500);
  const sourceBaseline = await snap(page);
  const livePid = liveChildOf(currentServe.serve.pid);
  if (!livePid) throw new Error('未找到本 serve 的 live 子进程');
  owned.push({ kind: 'live', pid: livePid, parent: currentServe.serve.pid });
  process.kill(livePid, 'SIGTERM');
  await page.waitForFunction(() => document.getElementById('room')?.dataset.signal === 'gone', null, { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(900); // CSS 灯语淡入 0.8s，取稳态而非刚写 dataset 的瞬间。
  const sourceGone = await snap(page);
  await page.screenshot({ path: join(out, 'failure-source-gone.png') });
  result.killLiveSource = { baseline: sourceBaseline, after: sourceGone, pass: sourceGone.signal === 'gone' && /Source Gone/.test(sourceGone.label) };
  currentServe.serve.kill('SIGTERM');
  await new Promise((resolve) => currentServe.serve.once('exit', resolve));
  await page.close();

  // B. serve 死亡与同端口恢复：独立新页，避免 gone 粘滞污染。
  currentServe = bootServe(); await currentServe.ready;
  const page2 = await context.newPage();
  page2.on('pageerror', (e) => errors.push(e.message));
  await page2.goto(`${base}/?mode=live`, { waitUntil: 'load' });
  await page2.waitForFunction(() => window.__stage?.live?.status === 'live', null, { timeout: 10000 });
  await page2.waitForFunction(() => document.body.classList.contains('tape-loaded'), null, { timeout: 5000 });
  await page2.waitForTimeout(1500);
  const serveBaseline = await snap(page2);
  const killedServePid = currentServe.serve.pid;
  currentServe.serve.kill('SIGTERM');
  await new Promise((resolve) => currentServe.serve.once('exit', resolve));
  await page2.waitForFunction(() => document.getElementById('room')?.dataset.signal === 'lost', null, { timeout: 8000 }).catch(() => {});
  await page2.waitForTimeout(900);
  const serveLost = await snap(page2);
  await page2.screenshot({ path: join(out, 'failure-serve-lost.png') });
  currentServe = bootServe(); await currentServe.ready;
  await page2.waitForFunction(() => window.__stage?.live?.status === 'live' && !document.getElementById('room')?.dataset.signal, null, { timeout: 12000 }).catch(() => {});
  await page2.waitForTimeout(1500);
  const serveRecovered = await snap(page2);
  await page2.screenshot({ path: join(out, 'failure-serve-recovered.png') });
  result.killServe = {
    killedPid: killedServePid,
    baseline: serveBaseline,
    lost: serveLost,
    recovered: serveRecovered,
    passLost: serveLost.signal === 'lost' && /Signal Lost/.test(serveLost.label),
    passRecovered: serveRecovered.signal === '' && serveRecovered.liveStatus === 'live',
  };

  // C. 浏览器网络离线：只切本测试 context，不动用户系统网络。
  await context.setOffline(true);
  await page2.waitForFunction(() => document.getElementById('room')?.dataset.signal === 'lost', null, { timeout: 8000 }).catch(() => {});
  const offline = await snap(page2);
  await page2.screenshot({ path: join(out, 'failure-browser-offline.png') });
  await context.setOffline(false);
  await page2.waitForFunction(() => window.__stage?.live?.status === 'live' && !document.getElementById('room')?.dataset.signal, null, { timeout: 12000 }).catch(() => {});
  const onlineAgain = await snap(page2);
  result.disconnectNetwork = {
    offline,
    onlineAgain,
    passLost: offline.signal === 'lost',
    passRecovered: onlineAgain.signal === '' && onlineAgain.liveStatus === 'live',
  };
  await page2.close();

  writeFileSync(join(out, 'failure-verdict.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (currentServe?.serve?.exitCode === null) currentServe.serve.kill('SIGTERM');
  if (browser) await browser.close().catch(() => {});
  rmSync(scratch, { recursive: true, force: true });
}
