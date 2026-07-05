// NIGHT-2 §2 通宵浏览器：真浏览器引擎（headless Chromium）开一页 stage(live) 全程在场。
// 每分钟采：标签页 JS 堆、SSE 包计数、恒迟（到达墙钟 − 包内 t）统计；每小时截屏。
// 有界纪律：页内聚合器每次拉取即清零，无累积数组。DONE 标记出现即退场。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SOAK = process.argv[2] ?? 'audit/night2/soak';
const URLBASE = process.argv[3] ?? 'http://localhost:8932/';
const CSV = path.join(SOAK, 'browser.csv');
const LOG = path.join(SOAK, 'browser-console.log');
const DONE = path.join(SOAK, 'SOAK_DONE');
fs.mkdirSync(SOAK, { recursive: true });
fs.writeFileSync(CSV, 'wall,stateN,momentN,lagMean,lagMin,lagMax,lagLast,heapUsed,heapTotal,goneSeen\n');
const log = fs.createWriteStream(LOG, { flags: 'w' });
const note = (s) => log.write(`[${new Date().toISOString()}] ${s}\n`);

const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() !== 'log') note(`console.${m.type()}: ${m.text().slice(0, 250)}`); });
page.on('pageerror', (e) => note(`PAGEERROR: ${e.message.slice(0, 400)}`));
const ORIGIN = new URL(URLBASE).origin;
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN)) note(`OFFHOST-REQUEST(!): ${u}`); });

// 恒迟影子测量：包一层 EventSource，state 包到达时记录 (now − pkt.t)。聚合有界、拉取即清。
await page.addInitScript(() => {
  window.__soak = { stateN: 0, momentN: 0, lagSum: 0, lagMin: Infinity, lagMax: -Infinity, lagLast: 0, n: 0, gone: 0 };
  const ES = window.EventSource;
  window.EventSource = class extends ES {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (e) => {
        try {
          const o = JSON.parse(e.data);
          const s = window.__soak;
          if (o.kind === 'state') {
            s.stateN++;
            const lag = Date.now() - o.t;
            s.n++; s.lagSum += lag; s.lagLast = lag;
            if (lag < s.lagMin) s.lagMin = lag;
            if (lag > s.lagMax) s.lagMax = lag;
          } else if (o.kind === 'moment') s.momentN++;
        } catch { /* 非 JSON 心跳 */ }
      });
      this.addEventListener('gone', () => { window.__soak.gone++; });
    }
  };
});

note(`goto ${URLBASE}`);
await page.goto(URLBASE, { waitUntil: 'load', timeout: 60000 });
await page.screenshot({ path: path.join(SOAK, 'shot-h0.png') });

let minute = 0;
const tick = async () => {
  try {
    const s = await page.evaluate(() => {
      const s = window.__soak, out = { ...s };
      s.lagSum = 0; s.lagMin = Infinity; s.lagMax = -Infinity; s.n = 0; // 拉取即清（stateN/momentN 累计留着）
      const m = performance.memory ?? {};
      out.heapUsed = m.usedJSHeapSize ?? 0; out.heapTotal = m.totalJSHeapSize ?? 0;
      return out;
    });
    const mean = s.n ? (s.lagSum / s.n).toFixed(1) : '';
    fs.appendFileSync(CSV, `${Date.now()},${s.stateN},${s.momentN},${mean},${s.n ? s.lagMin : ''},${s.n ? s.lagMax : ''},${s.lagLast},${s.heapUsed},${s.heapTotal},${s.gone}\n`);
  } catch (e) { note(`tick error: ${e.message}`); }
  minute++;
  if (minute % 60 === 0) {
    try { await page.screenshot({ path: path.join(SOAK, `shot-h${minute / 60}.png`) }); note(`hourly shot h${minute / 60}`); } catch (e) { note(`shot error: ${e.message}`); }
  }
};

const loop = setInterval(async () => {
  if (fs.existsSync(DONE)) {
    clearInterval(loop);
    await tick();
    try { await page.screenshot({ path: path.join(SOAK, 'shot-final.png') }); } catch {}
    note('DONE marker seen; closing');
    log.end();
    await browser.close();
    process.exit(0);
  }
  await tick();
}, 60000);
note('soak browser on station');
