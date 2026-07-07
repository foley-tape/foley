// RECON 实屏勘验：live 正门（真实会话）＋回放路声证（真实带 busy）
// 证据：截图 → audit/recon/shots/；结论 JSON → stdout；控制台流水 → shots/console.log.txt
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const SHOTS = '/Users/shadow/tape0-recon/audit/recon/shots';
mkdirSync(SHOTS, { recursive: true });
const exe = '/Users/shadow/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));

// —— Part 1：live 正门（尾随我正在生长的真实会话）
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
await page.waitForTimeout(4000);
const live1 = await page.evaluate(() => ({
  mode: window.__stage?.mode,
  soundBeforeGesture: typeof window.__stage?.sound,
}));
await page.screenshot({ path: SHOTS + '/01-live-boot.png' });
await page.mouse.click(720, 450); // 真人手势
await page.waitForTimeout(2500);
const live2 = await page.evaluate(() => ({
  soundAfterGesture: typeof window.__stage?.sound, // live 支路预期 undefined（静音雷）
}));
await page.waitForTimeout(11000);
await page.screenshot({ path: SHOTS + '/02-live-after-15s.png' });

// —— Part 2：回放路 + 声证（busy = 真实会话骨架带，非 storm 演示卷）
await page.goto('http://127.0.0.1:4173/?tape=busy', { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.mouse.click(720, 450);
await page.waitForTimeout(3000);
const snd = await page.evaluate(async () => {
  const s = window.__stage?.sound;
  if (!s) return { present: false };
  const out = { present: true, ctxState: s.ctx?.state, hasEngine: !!s.engine, record: s.record?.title ?? null };
  try {
    const an = s.ctx.createAnalyser();
    an.fftSize = 2048;
    s.engine.nodes.master.connect(an); // 主输出旁挂分析器：量真实信号
    const buf = new Float32Array(an.fftSize);
    let peak = 0, sum = 0, n = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 100));
      an.getFloatTimeDomainData(buf);
      let rms = 0;
      for (let j = 0; j < buf.length; j++) rms += buf[j] * buf[j];
      rms = Math.sqrt(rms / buf.length);
      peak = Math.max(peak, rms);
      sum += rms; n++;
    }
    out.rmsPeak = +peak.toFixed(5);
    out.rmsAvg = +(sum / n).toFixed(5);
  } catch (e) { out.tapErr = String(e); }
  return out;
});
await page.screenshot({ path: SHOTS + '/03-replay-busy.png' });

console.log(JSON.stringify({ live1, live2, snd }, null, 2));
writeFileSync(SHOTS + '/console.log.txt', logs.join('\n'));
await browser.close();
