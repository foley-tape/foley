// 轨甲机器代理·浏览器级（DECREE-003 丁-轨甲验收增补）：live 手势后 60s 内 master 实测 RMS 超阈。
// 器具形制沿 RECON recon.mjs（playwright-core＋ms-playwright chromium）；RMS 读数走声桥内建
// analyser（sb.rms()——审计庭 RMS 常设回归仪的同一口径）。机器代理管回归，人耳终审不变。
//
// 用法：node audit/a-live/repro/live-rms.mjs [--root <repoRoot>] [--out <dir>] [--thr 0.005]
// 前提：本机有 ms-playwright chromium（stage/tools/package.json 安装注）；serve 由本脚本自起自收（记 PID 逐个收摊，禁 pkill 模式串——手令三.3）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const root = argOf('--root', join(here, '..', '..', '..'));
const out = argOf('--out', join(here, '..', 'shots'));
// playwright-core 装在 stage/tools（拍摄期工具依赖，运行时零依赖不受染）——锚到**本脚本所在仓**
// 的解析域取用（--root 只管被测 serve 的根：打包形态测试时 root=解包目录，工具依赖仍在本仓）
const { chromium } = createRequire(join(here, '..', '..', '..', 'stage', 'tools', 'noop.js'))('playwright-core');
const THR = Number(argOf('--thr', '0.005')); // 有声阈（≈−46dBFS；IDLE 房间层地板 ~0.02，WORKING ~0.05+）
mkdirSync(out, { recursive: true });

const exe = process.env.CHROMIUM_EXE
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const port = 44200 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${port}`;

// —— serve 自起（live 默认：尾随本机最新真实会话——审计材料律：自备新鲜真实会话）
const serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port)], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env },
});
serve.stderr.on('data', () => {});
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

/** 手势后按 250ms 采样 sb.rms()，直到超阈或超时；回传首声时刻与全程序列摘要。 */
async function sampleUntilSound(maxSec) {
  return page.evaluate(async ({ maxSec, THR }) => {
    const t0 = performance.now();
    const series = [];
    let first = -1, peak = 0, sum = 0, n = 0;
    while (performance.now() - t0 < maxSec * 1000) {
      const sb = window.__stage?.sound;
      const r = sb && sb.rms ? sb.rms() : 0;
      const t = (performance.now() - t0) / 1000;
      series.push([+t.toFixed(2), +r.toFixed(5)]);
      peak = Math.max(peak, r); sum += r; n++;
      if (first < 0 && r > THR) first = t;
      if (first >= 0 && t > Math.max(10, first + 5)) break; // 首声后再录 ≥5s 尾巴即可交差
      await new Promise((res) => setTimeout(res, 250));
    }
    const sb = window.__stage?.sound;
    return {
      firstSoundSec: first, rmsPeak: +peak.toFixed(5), rmsAvg: +(sum / Math.max(n, 1)).toFixed(5),
      samples: n, series: series.filter((_, i) => i % 4 === 0), // 存 1Hz 抽样，全程曲线不失真意
      recordInfo: sb?.recordInfo ?? null, stats: sb?.stats ? sb.stats() : null,
      ctxState: sb?.ctx?.state ?? null,
    };
  }, { maxSec, THR });
}

const verdicts = {};

// —— Part A：live 正门（显式 ?mode=live——歇场 302 与来意尊重都不干扰本证）
await page.goto(`${base}/?mode=live`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
const pre = await page.evaluate(() => ({ mode: window.__stage?.mode, soundPre: typeof window.__stage?.sound }));
await page.screenshot({ path: join(out, '01-live-pre-gesture.png') });
await page.mouse.click(720, 450); // 开机仪式：一次人手
const live = await sampleUntilSound(60);
await page.screenshot({ path: join(out, '02-live-after-sound.png') });
verdicts.live = { ...pre, ...live, pass: live.firstSoundSec >= 0 && live.firstSoundSec <= 60 };

// —— Part B：回放保绿（storm 演示卷同 G8 正门参数；好资产回归门之"回放有声"）
await page.goto(`${base}/?tape=storm&speed=8`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.mouse.click(720, 450);
const rep = await sampleUntilSound(30);
await page.screenshot({ path: join(out, '03-replay-storm.png') });
verdicts.replay = { ...rep, pass: rep.firstSoundSec >= 0 && rep.firstSoundSec <= 30 };

verdicts.consoleErrors = logs.filter((l) => l.startsWith('[PAGEERROR]'));
verdicts.pass = verdicts.live.pass && verdicts.replay.pass && verdicts.consoleErrors.length === 0;

console.log(JSON.stringify(verdicts, null, 2));
writeFileSync(join(out, 'verdicts.json'), JSON.stringify(verdicts, null, 2) + '\n');
writeFileSync(join(out, 'console.log.txt'), logs.join('\n'));
await browser.close();
serve.kill('SIGINT'); // 记 PID 逐个收摊（本进程直属子进程）
process.exit(verdicts.pass ? 0 : 1);
