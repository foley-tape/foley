// 带声录制器（⑦批·R3"器具入仓"）：真 Chrome（非 headless-shell）＋CDP screencast 取帧
// ＋?audiotap=1 WebAudio 抽头取声 → ffmpeg 合成带声 mp4。前身 gate_record 流浪 scratchpad
// 被清三回，今入 repo。四坑已内建：防节流 flags／大包分片（CDP 走 playwright 自管）／
// 偶数尺寸／换码清 profile（playwright 每跑一次性 temp profile＋serve no-cache）。
//
//   node stage/tools/verify/record.mjs --out /path/证据.mp4 [--url 'http://127.0.0.1:4181/?audiotap=1']
//        [--secs 20] [--pre 2.5] [--click 50,860] [--vp 1280x800]
//
// 手势＝真输入（CDP Input=可信手势→音频解锁）；默认点木质边缘（无 click 处理器·只触 pointerdown 族：
// 房间醒/声桥起/POST）。对时：音频起点=__tapStartEpoch(ms)，视频帧带 CDP epoch 时戳，差值作 offset。
import { existsSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = argOf('--out', null);
if (!OUT) { console.error('--out 必填'); process.exit(2); }
const URL_ = argOf('--url', 'http://127.0.0.1:4181/?audiotap=1');
const SECS = Number(argOf('--secs', '20'));
const PRE = Number(argOf('--pre', '2.5'));
const [CX, CY] = argOf('--click', '50,860').split(',').map(Number);
const [VW, VH] = argOf('--vp', '1280x800').split('x').map(Number);

const require_ = createRequire(join(process.cwd(), 'audit/tools/package.json'));
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
const ffmpeg = (() => {
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) if (existsSync(p)) return p;
  return 'ffmpeg';
})();

const browser = await chromium.launch({
  executablePath: exe, headless: false,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    `--window-size=${VW},${VH + 90}`],
});
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.bringToFront();
await page.waitForTimeout(1200);

const cdp = await page.context().newCDPSession(page);
const frames = [];
cdp.on('Page.screencastFrame', (ev) => {
  frames.push({ b64: ev.data, ts: ev.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: VW, maxHeight: VH, everyNthFrame: 1 });

await page.waitForTimeout(PRE * 1000);
await page.mouse.click(CX, CY);            // 真手势：房间醒→声桥起→POST 开跑
console.log('[record] 手势已落，POST 应起');
// --script 'ms:x,y;ms:x,y'（刀四器具进化）：首击后的补充击（ms=距首击毫秒·绝对排程免漂）
const SCRIPT = argOf('--script', null);
if (SCRIPT) {
  const t1 = Date.now();
  for (const step of SCRIPT.split(';')) {
    const m = step.match(/^(\d+):(-?\d+),(-?\d+)$/);
    if (!m) continue;
    const dueIn = Number(m[1]) - (Date.now() - t1);
    if (dueIn > 0) await page.waitForTimeout(dueIn);
    await page.mouse.click(Number(m[2]), Number(m[3]));
    console.log('[record] 脚本击', m[1] + 'ms', m[2] + ',' + m[3]);
  }
}
await page.waitForTimeout(Math.max(0, SECS * 1000 - PRE * 1000 - (SCRIPT ? SCRIPT.split(';').reduce((a, x) => Math.max(a, Number(x.split(':')[0]) || 0), 0) : 0)));
await cdp.send('Page.stopScreencast');

// 声轨（audiotap 在手势后上位；未上位=页面没起声，照样出无声视频并明说）
let audio = null, tapEpoch = null;
try {
  tapEpoch = await page.evaluate(() => window.__tapStartEpoch ?? null);
  if (tapEpoch) audio = await page.evaluate(() => window.__gateAudioB64());
} catch { /* 无声照走 */ }
await browser.close();

console.log(`[record] 帧 ${frames.length} 张，声轨 ${audio ? '在手' : '缺席'}`);
if (frames.length < 10) { console.error('帧太少，录制失败'); process.exit(3); }

const tmp = mkdtempSync(join(tmpdir(), 'foley-rec-'));
frames.forEach((f, i) => writeFileSync(join(tmp, `f${String(i).padStart(5, '0')}.jpg`), Buffer.from(f.b64, 'base64')));
// concat 清单：逐帧真时长（vfr→30fps 输出）
let list = '';
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? frames[i + 1].ts - frames[i].ts : 1 / 30;
  list += `file '${join(tmp, `f${String(i).padStart(5, '0')}.jpg`)}'\nduration ${Math.max(d, 0.001).toFixed(4)}\n`;
}
writeFileSync(join(tmp, 'list.txt'), list);
const vArgs = ['-y', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
if (audio) {
  writeFileSync(join(tmp, 'audio.webm'), Buffer.from(audio, 'base64'));
  const offset = (tapEpoch / 1000) - frames[0].ts;   // 音频起点相对视频首帧（epoch 同钟）
  console.log(`[record] 音频偏移 ${offset.toFixed(3)}s`);
  vArgs.push('-itsoffset', offset.toFixed(3), '-i', join(tmp, 'audio.webm'));
}
vArgs.push('-vf', `scale=${VW}:-2`, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19');
if (audio) vArgs.push('-c:a', 'aac', '-b:a', '160k');
vArgs.push('-shortest', OUT);
execFileSync(ffmpeg, vArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
// 声在场自证：全片响度（astats 报在 stderr）
if (audio) {
  const r = spawnSync(ffmpeg, ['-i', OUT, '-af', 'astats=measure_overall=RMS_level:measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /RMS level dB:\s*(-?[\d.]+)/.exec(r.stderr || '');
  console.log('[record] 全片 RMS', m ? m[1] + ' dB' : '（未解析·见 ffmpeg 输出）');
}
rmSync(tmp, { recursive: true, force: true });
console.log('[record] 出片', OUT);
