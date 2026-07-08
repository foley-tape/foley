// P0-2 · 单一传动律＋暂停语义改判（第五号手令 丙）——接线端到端。
// 金测试（LIVE-7）已严证引擎 pauseRecord/resumeRecord；此脚本证 main.js↔replayer↔soundbridge 接线
// 与 DUB 可用性示能：
//   [A] 单一引擎：多次手势/存在期间只一个引擎实例（identity 稳定）。
//   [B] 暂停＝唱片随带停：转台 pause → sb.pause → engine.recordPaused=true；房间层（床）照呼吸。
//   [C] 恢复＝续播不重建：转台 play → sb.resume → recordPaused=false。
//   [D] DUB 示能：回放有带→dub-ready（咬合，非死活不明）。
// 收摊纪律：serve 直属子进程 SIGINT 收（禁 pkill·手令甲.3）。
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.REPO_ROOT || join(here, '..', '..', '..');
const require = createRequire(join(root, 'audit', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const exe = process.env.CHROMIUM_EXE
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const port = 45900 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;

const serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port)], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env },
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
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

// 回放模式（有带＝有转台＋唱片）：storm 演示卷
await page.goto(`${base}/?tape=storm&speed=4`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.mouse.click(720, 450);              // 开机仪式：声桥起
await page.waitForTimeout(2500);                // 待唱片热装上桥

// [A] 单一引擎：记引擎 identity，再点一次，identity 必须不变（if(sb)return 守门）
const engBefore = await page.evaluate(() => { window.__eng = window.__stage?.sound?.engine; return !!window.__eng; });
await page.mouse.click(300, 300);
await page.waitForTimeout(600);
const singleEngine = await page.evaluate(() => window.__stage?.sound?.engine === window.__eng && !!window.__eng);

// 装 pause/resume spy（证接线真的经声桥）＋ analyser 测房间
await page.evaluate(() => {
  const sb = window.__stage.sound;
  window.__spy = { pause: 0, resume: 0 };
  const rp = sb.pause.bind(sb), rr = sb.resume.bind(sb);
  sb.pause = () => { window.__spy.pause++; return rp(); };
  sb.resume = () => { window.__spy.resume++; return rr(); };
  const an = sb.ctx.createAnalyser(); an.fftSize = 2048;
  sb.engine.nodes.master.connect(an);
  window.__peak = (ms) => new Promise(res => { const t0 = performance.now(); let pk = 0; const buf = new Float32Array(an.fftSize);
    const tick = () => { an.getFloatTimeDomainData(buf); let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
      pk = Math.max(pk, Math.sqrt(e / buf.length)); performance.now() - t0 < ms ? requestAnimationFrame(tick) : res(+pk.toFixed(5)); }; tick(); });
});

const recPresent = await page.evaluate(() => !!window.__stage.sound.engine.recordInfo);

// [B] 暂停：转台 pause → 声桥 pause → 唱片随带停
await page.evaluate(() => window.__stage.replayer.pause());
await page.waitForTimeout(500);
const roomDuringPause = await page.evaluate(() => window.__peak(1000));  // 房间层（床）照呼吸
const afterPause = await page.evaluate(() => ({ pauseCalls: window.__spy.pause, recordPaused: window.__stage.sound.engine.recordPaused }));

// [C] 恢复：转台 play → 声桥 resume → 续播
await page.evaluate(() => window.__stage.replayer.play());
await page.waitForTimeout(500);
const afterResume = await page.evaluate(() => ({ resumeCalls: window.__spy.resume, recordPaused: window.__stage.sound.engine.recordPaused }));

// [D] DUB 示能：回放有带→ dub-ready
const dubClass = await page.evaluate(() => { const k = document.getElementById('dub-key'); return { ready: k.classList.contains('dub-ready'), locked: k.classList.contains('dub-locked') }; });
await page.screenshot({ path: join(here, '..', 'shots', 'transport.png') });

const verdict = {
  decree: 'FOLEY_DECREE_005 丙 P0-2 单一传动＋暂停改判',
  A_singleEngine: singleEngine,
  B_pause: { wired: afterPause.pauseCalls >= 1, recordPaused: afterPause.recordPaused, recordPresent: recPresent, roomBreathesDuringPause: roomDuringPause },
  C_resume: { wired: afterResume.resumeCalls >= 1, recordPaused: afterResume.recordPaused },
  D_dubReady: dubClass.ready && !dubClass.locked,
  pageErrors: logs.length,
};
verdict.PASS = verdict.A_singleEngine
  && verdict.B_pause.wired && verdict.B_pause.recordPaused === true && verdict.B_pause.roomBreathesDuringPause > 0
  && verdict.C_resume.wired && verdict.C_resume.recordPaused === false
  && verdict.D_dubReady && verdict.pageErrors === 0;
console.log(JSON.stringify(verdict, null, 2));
writeFileSync(join(here, '..', 'verdict.json'), JSON.stringify(verdict, null, 2) + '\n');

await browser.close();
serve.kill('SIGINT');
process.exit(verdict.PASS ? 0 : 1);
