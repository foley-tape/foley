// 唱片在位复测：busy 回放 + 手势 → 唱片层是否上桥 + master RMS
import { chromium } from 'playwright-core';
const exe = '/Users/shadow/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
await page.goto('http://127.0.0.1:4173/?tape=busy', { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.mouse.click(720, 450);
await page.waitForTimeout(4000);
const snd = await page.evaluate(async () => {
  const s = window.__stage?.sound;
  if (!s) return { present: false };
  const out = { present: true, ctxState: s.ctx?.state, record: s.record?.title ?? null };
  const an = s.ctx.createAnalyser(); an.fftSize = 2048;
  s.engine.nodes.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  let peak = 0, sum = 0;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100));
    an.getFloatTimeDomainData(buf);
    let rms = 0; for (let j = 0; j < buf.length; j++) rms += buf[j] * buf[j];
    rms = Math.sqrt(rms / buf.length);
    peak = Math.max(peak, rms); sum += rms;
  }
  out.rmsPeak = +peak.toFixed(5); out.rmsAvg = +(sum / 20).toFixed(5);
  return out;
});
console.log(JSON.stringify(snd));
console.log(logs.filter((l) => l.includes('sound') || l.includes('demo') || l.includes('唱片')).join('\n'));
await browser.close();
