#!/usr/bin/env node
// 大审计器具箱 · master 总线 RMS 机器代理（常设回归仪）
// ─────────────────────────────────────────────────────────────────────────────
// 出身：RECON `audit/recon/repro/recon.mjs`（§二.B3）的 AnalyserNode 探针，审计庭（第三号手令 戊-2）
//       提取为参数化常设器具；第四号手令 己-3 机器面挂表就地升为**自足测压仪**（自起 serve／
//       hermetic 离线／sustained soundRatio）。锚 track/a-live d30c1de（吸收轨丙）。
//
// 独立性：本器具旁挂**自备** AnalyserNode 于 `sound.engine.nodes.master`，实测 RMS——
//       **不采信声桥自报的 `sb.rms()`**（红蓝分离落到读数层）。与轨甲 live-rms 同物理信号、独立读数。
//
// 诚实界限（验收最高法·不让渡）：机器代理只管回归/守门（挡"死寂回潮"）；**人耳终审在船长/审计庭**。
//       RMS 越阈 ≠ 好听，只证"有信号在响、且不中断"。
//
// 退出码：0=越阈且 sustained（soundRatio≥min）｜1=在场但未越阈/中断｜2=装置/前置失败（sound 缺席等）。
// 输出：单行 JSON 判据 → stdout。
//
// 用法（己-3 三跑）：
//   # [A] live 命门 60s（真会话，实 HOME）
//   node audit/tools/rms_probe.mjs --serve-root /Users/shadow/tape0-a-live --live --window 60
//   # [B] 离线确定性测压 60s（storm 定带 + hermetic 空 HOME → 无唱片=合成退路=离线）
//   node audit/tools/rms_probe.mjs --serve-root /Users/shadow/tape0-a-live --tape storm --speed 8 --hermetic --window 60
//   # [C] 长跑抽查（同 [B] 条件，加长窗口）
//   node audit/tools/rms_probe.mjs --serve-root /Users/shadow/tape0-a-live --tape storm --speed 8 --hermetic --window 180
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function parseArgs(argv) {
  const a = {
    url: 'http://127.0.0.1:4173/', serveRoot: null, port: 45000 + Math.floor(Math.random() * 500),
    live: false, tape: null, speed: null, hermetic: false,
    window: 60, sample: 100, threshold: 0.005, minRatio: 0.95, series: false,
    gesture: '720,450', settle: 250, exe: null, shots: null, headed: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--url') a.url = v(); else if (k === '--serve-root') a.serveRoot = v();
    else if (k === '--port') a.port = +v(); else if (k === '--live') a.live = true;
    else if (k === '--tape') a.tape = v(); else if (k === '--speed') a.speed = +v();
    else if (k === '--hermetic') a.hermetic = true;
    else if (k === '--window') a.window = +v(); else if (k === '--sample') a.sample = +v();
    else if (k === '--threshold') a.threshold = +v(); else if (k === '--min-ratio') a.minRatio = +v();
    else if (k === '--series') a.series = true;
    else if (k === '--gesture') a.gesture = v(); else if (k === '--settle') a.settle = +v();
    else if (k === '--exe') a.exe = v(); else if (k === '--shots') a.shots = v();
    else if (k === '--headed') a.headed = true;
    else if (k === '-h' || k === '--help') { console.log('见文件头用法'); process.exit(0); }
  }
  return a;
}
function autodetectChromium() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return null;
  for (const d of readdirSync(cache).filter((x) => x.startsWith('chromium-')).sort().reverse())
    for (const rel of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
      const p = join(cache, d, rel); if (existsSync(p)) return p;
    }
  return null;
}

const args = parseArgs(process.argv);
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('[rms_probe] 缺 playwright-core：`npm i --prefix audit/tools playwright-core`'); process.exit(2); }
const exe = args.exe || autodetectChromium();
if (!exe || !existsSync(exe)) { console.error('[rms_probe] 未找到 chromium；--exe 指定或 npx playwright install chromium'); process.exit(2); }

// —— 可选：自起被测 serve（记 PID 逐个收摊，禁 pkill 模式串——003 令甲.3）——
let serveProc = null, hermeticHome = null, base;
if (args.serveRoot) {
  const env = { ...process.env };
  if (args.hermetic) { hermeticHome = mkdtempSync(join(tmpdir(), 'rms-hermetic-home-')); env.HOME = hermeticHome; } // 空 HOME→无 ~/.foley 唱片→合成退路=离线
  const serveArgs = [join(args.serveRoot, 'stage', 'serve.mjs'), String(args.port)];
  if (!args.live) serveArgs.push('--replay-only'); // 回放/定带走静态态；live 需 SSE 故不加
  serveProc = spawn('node', serveArgs, { cwd: args.serveRoot, stdio: ['ignore', 'pipe', 'pipe'], env });
  serveProc.stderr.on('data', () => {});
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('serve 启动超时')), 10000);
    serveProc.stdout.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); res(); } });
    serveProc.on('exit', (c) => rej(new Error(`serve 提前退出 ${c}`)));
  });
  base = `http://127.0.0.1:${args.port}`;
} else { base = args.url.replace(/\/$/, ''); }

// 目标 URL：live 显式 ?mode=live（避 302）；否则 ?tape=…&speed=…（离线确定性回放）
const target = args.live ? `${base}/?mode=live`
  : args.tape ? `${base}/?tape=${encodeURIComponent(args.tape)}${args.speed ? `&speed=${args.speed}` : ''}`
  : (args.serveRoot ? `${base}/` : args.url);
const [gx, gy] = args.gesture.split(',').map(Number);

const browser = await chromium.launch({ executablePath: exe, headless: !args.headed });
let verdict = { present: false, note: 'unset' };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
  await page.goto(target, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.mouse.click(gx, gy);                 // 开机仪式（Tone/AudioContext 手势解锁）
  await page.waitForTimeout(args.settle);

  verdict = await page.evaluate(async ({ windowS, sampleMs, threshold, wantSeries }) => {
    const s = window.__stage?.sound;
    if (!s) return { present: false, ctxState: null, note: 'window.__stage.sound===undefined（live 静音雷/未接声桥）' };
    const eng = s.engine ?? s;
    const cand = [['engine.nodes.master', eng?.nodes?.master], ['engine.master', eng?.master],
      ['sound.master', s.master], ['engine.bus', eng?.bus], ['engine.out', eng?.out]];
    const hit = cand.find(([, n]) => n && typeof n.connect === 'function');
    if (!hit) return { present: true, ctxState: s.ctx?.state ?? null, note: '声在但未寻得可挂 master 节点——更新候选路径' };
    const [masterPath, master] = hit;
    const an = s.ctx.createAnalyser(); an.fftSize = 2048;
    master.connect(an);                            // 自备旁挂，不改音频图输出（独立于 sb.rms()）
    const buf = new Float32Array(an.fftSize);
    const t0 = performance.now(); const deadline = t0 + windowS * 1000;
    let peak = 0, sum = 0, n = 0, firstCrossMs = null, above = 0, minAfter = Infinity, dips = 0;
    const series = []; let lastSeriesS = -1;
    while (performance.now() < deadline) {
      await new Promise((r) => setTimeout(r, sampleMs));
      an.getFloatTimeDomainData(buf);
      let rms = 0; for (let j = 0; j < buf.length; j++) rms += buf[j] * buf[j];
      rms = Math.sqrt(rms / buf.length);
      const on = rms >= threshold;
      if (on && firstCrossMs === null) firstCrossMs = +(performance.now() - t0).toFixed(0);
      if (firstCrossMs !== null) { if (!on) dips++; minAfter = Math.min(minAfter, rms); } // 首声后的死寂凹陷计数
      if (on) above++;
      peak = Math.max(peak, rms); sum += rms; n++;
      const ts = (performance.now() - t0) / 1000;                 // ~1Hz 时间轴序列，供长跑形态诊断
      if (wantSeries && Math.floor(ts) > lastSeriesS) { lastSeriesS = Math.floor(ts); series.push([+ts.toFixed(1), +rms.toFixed(4)]); }
    }
    return { present: true, ctxState: s.ctx?.state ?? null, record: s.recordInfo?.name ?? s.record?.title ?? null,
      masterPath, firstCrossMs, rmsPeak: +peak.toFixed(5), rmsAvg: +(sum / Math.max(n, 1)).toFixed(5),
      rmsMin: minAfter === Infinity ? null : +minAfter.toFixed(5), soundRatio: +(above / Math.max(n, 1)).toFixed(4),
      postOnsetDips: dips, samples: n, series: wantSeries ? series : undefined };
  }, { windowS: args.window, sampleMs: args.sample, threshold: args.threshold, wantSeries: args.series });

  if (args.shots) { mkdirSync(args.shots, { recursive: true }); await page.screenshot({ path: join(args.shots, 'rms_probe.png') }); }
  verdict._target = target; verdict._threshold = args.threshold; verdict._windowS = args.window; verdict._minRatio = args.minRatio;
  verdict._hermetic = args.hermetic; verdict._pageErrors = logs.filter((l) => l.startsWith('[PAGEERROR]')).length;
} finally {
  await browser.close();
  if (serveProc) serveProc.kill('SIGINT');        // 直属子进程逐个收摊
}

// pass：声在场 且 窗内越阈 且 sustained（soundRatio≥min）且 零页错
const pass = !!(verdict.present && verdict.firstCrossMs !== null && verdict.firstCrossMs <= args.window * 1000
  && verdict.soundRatio >= args.minRatio && (verdict._pageErrors ?? 0) === 0);
verdict.pass = pass;
console.log(JSON.stringify(verdict));
process.exit(verdict.present ? (pass ? 0 : 1) : 2);
