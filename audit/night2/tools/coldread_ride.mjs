// NIGHT-2 §0 冷读者庭：十分钟真浏览器体验 probe 页
// 只观察不改动；记录 console/pageerror/网络请求；按时刻截屏。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const WT = '/Users/shadow/tape0-night2';
const PROBE = `file://${WT}/runs/probe-coldread/probe.html`;
const SHOTS = path.join(WT, 'audit/night2/shots');
fs.mkdirSync(SHOTS, { recursive: true });
const log = fs.createWriteStream(path.join(SHOTS, 'coldread-console.log'), { flags: 'w' });
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const note = (s) => { log.write(`[${stamp()}] ${s}\n`); };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => note(`console.${m.type()}: ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => note(`PAGEERROR: ${e.message}`));
page.on('request', (r) => { if (!r.url().startsWith('file://')) note(`NETWORK-REQUEST(!): ${r.method()} ${r.url()}`); });
page.on('requestfailed', (r) => { if (!r.url().startsWith('file://')) note(`NETWORK-FAILED: ${r.url()}`); });

const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); note(`shot ${name}`); };

note(`goto ${PROBE}`);
await page.goto(PROBE, { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
await shot('ride-000-load.png');

// 找 ▶ 播放钮（用户手势解锁音频）——按冷用户直觉找可见的播放控件
const candidates = ['text=▶', 'button:has-text("▶")', '[aria-label*="play" i]', 'button'];
let clicked = false;
for (const sel of candidates) {
  try {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 1500 })) {
      const label = (await el.textContent().catch(() => '')) || sel;
      await el.click();
      note(`clicked play candidate: ${sel} (label="${String(label).trim().slice(0, 40)}")`);
      clicked = true;
      break;
    }
  } catch { /* try next */ }
}
if (!clicked) note('NO PLAY BUTTON FOUND VISIBLE — confusion point');
await page.waitForTimeout(2000);
await shot('ride-010-after-play.png');

// 播放中按时刻截屏：30s / 1m / 2m / 3.5m
for (const [ms, name] of [[30000, 'ride-030s.png'], [30000, 'ride-060s.png'], [60000, 'ride-120s.png'], [90000, 'ride-210s.png']]) {
  await page.waitForTimeout(ms);
  await shot(name);
}

// 页面上摸一圈：把可见按钮/控件文本抄下来（冷用户环顾四周）
const controls = await page.evaluate(() => {
  const els = [...document.querySelectorAll('button, [role=button], input, select, a')];
  return els.filter(e => e.offsetParent !== null).map(e => `${e.tagName}:${(e.textContent || e.value || e.getAttribute('aria-label') || '').trim().slice(0, 30)}`).slice(0, 40);
});
note('visible controls: ' + JSON.stringify(controls));

// ~4.5min：开调音抽屉 ?tuner=1（probe 生成器亲口提示的彩蛋）
await page.goto(PROBE + '?tuner=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3000);
for (const sel of ['text=▶', 'button:has-text("▶")']) {
  try { const el = page.locator(sel).first(); if (await el.isVisible({ timeout: 1500 })) { await el.click(); note('tuner: clicked play'); break; } } catch {}
}
await page.waitForTimeout(5000);
await shot('ride-tuner.png');

// 剩余时间让带子继续走完十分钟，最后再看一眼
await page.waitForTimeout(120000);
await shot('ride-tuner-2m.png');
await page.waitForTimeout(120000);
await shot('ride-final.png');

const perf = await page.evaluate(() => (performance.memory ? { usedJSHeap: performance.memory.usedJSHeapSize } : {}));
note('perf: ' + JSON.stringify(perf));
note('ride done');
log.end();
await browser.close();
