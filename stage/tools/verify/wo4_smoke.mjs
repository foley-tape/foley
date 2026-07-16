// 工单4 一次性真机烟测（90s·不入默认回归·验收单「一次性真机烟测」四条）
// ① 裸首页不创建会话：FACTORY 厂带上机·盘在转
// ② 一次通电手势：有声（房间层/厂带声·mp4 RMS 自证）
// ③ 预置 declinedAt 再开页：全程无接线单
// ④ 保持页面不刷新，投一卷会话：牌面自动转 LIVE·无 SIGNAL LOST/SOURCE GONE 残留
// 用法：node wo4_smoke.mjs <证据输出目录>
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, appendFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

import { fileURLToPath } from 'node:url';
const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const OUT_DIR = process.argv[2];
if (!OUT_DIR) { console.error('用法：node wo4_smoke.mjs <证据输出目录>'); process.exit(2); }
mkdirSync(OUT_DIR, { recursive: true });
const LOG = join(OUT_DIR, '烟测断言_逐项.txt');
writeFileSync(LOG, `工单4 真机烟测 · ${new Date().toISOString()}\n`);
const t0 = Date.now();
let failures = 0;
function check(label, ok, detail = '') {
  const line = `[t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`;
  console.log(line); appendFileSync(LOG, line + '\n');
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 隔离 rig：空会话房＋预置 declinedAt（③ 要求「预置再开页」）──
const root = mkdtempSync(join(tmpdir(), 'wo4-smoke-'));
const env = {
  home: join(root, 'foley'), projects: join(root, 'projects'),
  claude: join(root, 'claude'), runs: join(root, 'runs'),
};
for (const d of Object.values(env)) mkdirSync(d, { recursive: true });
writeFileSync(join(env.home, 'onboard.json'), JSON.stringify({ declinedAt: Date.now() - 86400000 }) + '\n');

const port = await new Promise((resolve, reject) => {
  const s = createServer();
  s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const base = `http://127.0.0.1:${port}`;
const serveErr = [];
const serve = spawn(process.execPath, [join(repoRoot, 'stage', 'serve.mjs'), String(port)], {
  cwd: repoRoot, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env, HOME: root, FOLEY_HOME: env.home, CLAUDE_CONFIG_DIR: env.claude,
    FOLEY_PROJECTS: env.projects, FOLEY_RUNS_DIR: env.runs, TMPDIR: root,
  },
});
serve.stderr.on('data', (d) => serveErr.push(String(d)));
const getJson = async (p) => (await fetch(base + p)).json();
{
  const deadline = Date.now() + 10000;
  let t = null;
  while (Date.now() < deadline) {
    try { t = await getJson('/transport'); if (t.phase === 'PLAYING') break; } catch { /* 未起 */ }
    await sleep(150);
  }
  check('serve 起机＝厂带 PLAYING（live:false）', t?.phase === 'PLAYING' && t?.live === false, JSON.stringify(t));
}

// ── 真 Chrome ──
const require_ = createRequire(join(repoRoot, 'audit/tools/package.json'));
const { chromium } = require_('playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const exe = existsSync(CHROME) ? CHROME : (() => {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  for (const d of readdirSync(cache).filter((x) => x.startsWith('chromium-')).sort().reverse()) {
    const p = join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (existsSync(p)) return p;
  }
  return null;
})();
const VW = 1280, VH = 800;
const browser = await chromium.launch({
  executablePath: exe, headless: false,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    `--window-size=${VW},${VH + 90}`],
});
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${base}/?audiotap=1&machine`, { waitUntil: 'domcontentloaded' });
await page.bringToFront();

const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', (ev) => {
  frames.push({ b64: ev.data, ts: ev.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: VW, maxHeight: VH, everyNthFrame: 1 });
await sleep(2500);

// ── ① 裸首页：FACTORY 厂带在机·盘在转 ──
const plate1 = await page.evaluate(() => ({
  tape: document.querySelector('.np-tape')?.textContent ?? null,
  meta: document.querySelector('.np-meta')?.textContent ?? null,
  mode: document.getElementById('now-plate')?.dataset.mode ?? null,
}));
check('① 走带牌＝厂带（印刷名·非 LIVE）', !!plate1.tape && plate1.tape !== 'LIVE' && plate1.mode !== 'live',
  JSON.stringify(plate1));
check('① 档案行标 FACTORY', String(plate1.meta ?? '').includes('FACTORY'), String(plate1.meta));
const deckShot = () => page.locator('#deck').screenshot().catch(() => null);
const d1 = await deckShot(); await sleep(1500); const d2 = await deckShot();
check('① 盘在转（#deck 1.5s 两帧像素不同）', !!d1 && !!d2 && !d1.equals(d2), `${d1?.length}B vs ${d2?.length}B`);
if (d1) writeFileSync(join(OUT_DIR, '静帧_开机厂带_deck.png'), d1);
await page.screenshot({ path: join(OUT_DIR, '静帧_①裸首页厂带.png') });

// ── ③ declined：接线单全程不得出现（首查）──
const wire1 = await page.evaluate(() => !!document.getElementById('wire-tag'));
check('③ 预置 declinedAt→开页无接线单（首查）', !wire1);

// ── ② 一次通电手势 → 有声 ──
await page.mouse.click(50, 860);
let tapUp = null;
for (let i = 0; i < 6 && !tapUp; i++) { await sleep(500); tapUp = await page.evaluate(() => window.__tapStartEpoch ?? null); }
if (!tapUp) {   // 备用手势位（木沿·无命中区）
  await page.mouse.click(640, 792);
  for (let i = 0; i < 6 && !tapUp; i++) { await sleep(500); tapUp = await page.evaluate(() => window.__tapStartEpoch ?? null); }
}
check('② 一次通电手势→声桥上位（audiotap 起录）', !!tapUp);
await sleep(26000);   // 听一段厂带（RMS 终判在出片后·足秒听窗）
await page.screenshot({ path: join(OUT_DIR, '静帧_②通电后厂带在放.png') });

// ── ④ 不刷新投会话 → 自动转 LIVE ──
const sessionDir = join(env.projects, '-Users-wo4-smoke');
mkdirSync(sessionDir, { recursive: true });
writeFileSync(join(sessionDir, 'late-session.jsonl'), readFileSync(join(repoRoot, 'golden/fixtures/unknown-tool.jsonl')));
appendFileSync(LOG, `[t+${((Date.now() - t0) / 1000).toFixed(1)}s] 投带：会话 JSONL 已落 FOLEY_PROJECTS（页面不刷新）\n`);
{
  const deadline = Date.now() + 30000;
  let flipped = false, plate = null;
  while (Date.now() < deadline) {
    plate = await page.evaluate(() => ({
      tape: document.querySelector('.np-tape')?.textContent ?? null,
      mode: document.getElementById('now-plate')?.dataset.mode ?? null,
    }));
    if (plate.tape === 'LIVE' && plate.mode === 'live') { flipped = true; break; }
    await sleep(400);
  }
  check('④ 牌面自动转 LIVE（零刷新）', flipped, JSON.stringify(plate));
}
const t2 = await getJson('/transport');
check('④ transport 已 live PLAYING（同纪元自动换带）', t2.live === true && t2.loaded === 'live' && t2.phase === 'PLAYING', JSON.stringify({ live: t2.live, loaded: t2.loaded, phase: t2.phase }));
await sleep(24000);   // 让链路落稳（ES 重连≤2s 拍·20Hz 包流回魂·足秒稳态窗）
const m = await page.evaluate(() => window.__stage?.machine ?? null);
check('④ 链路回魂（S.link=live·无死相残留）', m?.S?.link === 'live' && (m?.d?.signalCue ?? null) === null,
  JSON.stringify({ link: m?.S?.link, signalCue: m?.d?.signalCue ?? null, sourceKind: m?.S?.sourceKind }));
const residue = await page.evaluate(() => document.querySelector('[data-signal]')?.dataset.signal ?? null);
check('④ 页面无 SIGNAL LOST/SOURCE GONE 蚀刻残留', residue === null, String(residue));
const wire2 = await page.evaluate(() => !!document.getElementById('wire-tag'));
check('③ 全程无接线单（终查）', !wire2);
check('全程零页面错误', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 200));
await page.screenshot({ path: join(OUT_DIR, '静帧_④后至转LIVE.png') });
await sleep(32000);   // 终段稳态（凑足 90s 全程在镜）

// ── 出片（record.mjs 同法：逐帧真时长＋audiotap 对时合成）──
await cdp.send('Page.stopScreencast');
let audio = null, tapEpoch = null;
try {
  tapEpoch = await page.evaluate(() => window.__tapStartEpoch ?? null);
  if (tapEpoch) audio = await page.evaluate(() => window.__gateAudioB64());
} catch { /* 无声照走 */ }
await browser.close();
try { process.kill(-serve.pid, 'SIGTERM'); } catch { serve.kill('SIGTERM'); }
await sleep(600);
try { process.kill(-serve.pid, 'SIGKILL'); } catch { /* 已亡 */ }

const ffmpeg = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find(existsSync) ?? 'ffmpeg';
const tmp = mkdtempSync(join(tmpdir(), 'wo4-rec-'));
frames.forEach((f, i) => writeFileSync(join(tmp, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(f.b64, 'base64')));
let list = '';
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 1 / 30;
  list += `file '${join(tmp, `f${String(i).padStart(5, '0')}.jpg`)}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`;
}
writeFileSync(join(tmp, 'list.txt'), list);
const OUT_MP4 = join(OUT_DIR, '烟测_90秒带声_厂带自举到后至转LIVE.mp4');
const vArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
if (audio) {
  writeFileSync(join(tmp, 'audio.webm'), Buffer.from(audio, 'base64'));
  vArgs.push('-itsoffset', ((tapEpoch / 1000) - frames[0].ts).toFixed(3), '-i', join(tmp, 'audio.webm'));
}
vArgs.push('-vf', `scale=${VW}:-2`, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19');
if (audio) vArgs.push('-c:a', 'aac', '-b:a', '160k');
vArgs.push('-shortest', OUT_MP4);
execFileSync(ffmpeg, vArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
let rms = '（无声轨）';
if (audio) {
  const r = spawnSync(ffmpeg, ['-i', OUT_MP4, '-af', 'astats=measure_overall=RMS_level:measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' });
  rms = /RMS level dB:\s*(-?[\d.]+)/.exec(r.stderr || '')?.[1] ?? '（未解析）';
  check('② 出片带声（全片 RMS dB）', rms !== '（未解析）' && Number(rms) > -60, `${rms} dB`);
}
const errText = serveErr.join('');
check('serve stderr 无 ENOENT/裸堆栈（W4-01 口径全程）', !/ENOENT|\n\s*at\s+\S+/.test(errText), errText.slice(0, 160) || '（空）');
appendFileSync(LOG, `\n帧 ${frames.length} 张 · 声轨 ${audio ? '在手' : '缺席'} · 全片 RMS ${rms} dB\n结论：${failures === 0 ? '全项 PASS' : failures + ' 项 FAIL'}\n`);
rmSync(tmp, { recursive: true, force: true });
rmSync(root, { recursive: true, force: true });
console.log(`[smoke] 出片 ${OUT_MP4}`);
console.log(`[smoke] ${failures === 0 ? '✅ 全项 PASS' : `❌ ${failures} 项 FAIL`}`);
process.exit(failures === 0 ? 0 : 1);
