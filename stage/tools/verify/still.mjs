// 定格验收器（⑦批·复盘 R3"器具入仓"落地）——真 chromium 打开被测页，注入可选 JS，
// 全页或元素裁片截图。此前同类脚本流浪 scratchpad 被系统轮转清掉三回，故入 repo。
//
//   node stage/tools/verify/still.mjs --url http://127.0.0.1:4181/ --out /tmp/x.png \
//        [--eval 'document.title'] [--sel '#magic-eye' --pad 40] [--settle 900] [--vp 1440x900] [--dpr 2]
//
// 依赖：借用审计器具箱的 playwright-core（audit/tools/node_modules·第四号手令戊隔离原则不破——
// 本件零新增依赖）；浏览器走 ms-playwright 缓存 chromium（同 rms_probe 探测法）。
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL_ = argOf('--url', null);
const OUT = argOf('--out', null);
if (!URL_ || !OUT) { console.error('用法见文件头（--url/--out 必填）'); process.exit(2); }
const EVAL = argOf('--eval', null);
const SEL = argOf('--sel', null);
const PAD = Number(argOf('--pad', 32));
const SETTLE = Number(argOf('--settle', 900));
const [VW, VH] = argOf('--vp', '1440x900').split('x').map(Number);
const DPR = Number(argOf('--dpr', 2));

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

const require_ = createRequire(join(process.cwd(), 'audit/tools/package.json'));
const { chromium } = require_('playwright-core');
const exe = autodetectChromium();
if (!exe) { console.error('未找到 chromium（ms-playwright 缓存空）'); process.exit(2); }

const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(SETTLE);
if (EVAL) console.log('[eval]', JSON.stringify(await page.evaluate(EVAL)));
const HOVER = argOf('--hover', null);          // 悬停示能取证
const DOWN = argOf('--down', null);            // 按下示能取证（按住不放拍照）
// 坐标直移（不走 hover() 的可动作性检查：空命中区/镜头漂移会被误判 not visible/stable）
const centerOf = async (sel) => {
  const r = await page.evaluate((s) => {
    const el = document.querySelector(s); if (!el) return null;
    const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, sel);
  if (!r) { console.error('选择器无中:', sel); process.exit(3); }
  return r;
};
if (HOVER) { const c = await centerOf(HOVER); await page.mouse.move(c.x, c.y); }
if (DOWN) { const c = await centerOf(DOWN); await page.mouse.move(c.x, c.y); await page.mouse.down(); }
await page.waitForTimeout(180);
let clip;
if (SEL) {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, SEL);
  if (!r) { console.error('选择器无中:', SEL); process.exit(3); }
  clip = { x: Math.max(0, r.x - PAD), y: Math.max(0, r.y - PAD), width: r.w + PAD * 2, height: r.h + PAD * 2 };
  console.log('[sel]', SEL, JSON.stringify(r));
}
await page.screenshot({ path: OUT, ...(clip ? { clip } : {}) });
console.log('[still]', OUT);
await browser.close();
