// live 定妆照（M2.4 §C.3；素材诚实条款）——实录"当下正在跑的 live 会话"，无从摆拍。
//
//   node stage/serve.mjs 4176 --raw <当前会话.jsonl>      # 另起一枚 live 服务器
//   node stage/tools/live-portrait.mjs [--base http://127.0.0.1:4176] [--out runs/live-portrait-<ts>] [--seconds 30]
//
// 产物：live-portrait.mp4（实录）＋ portrait-live.png（正面定妆）＋ portrait-loupe.png
// （凑近计数轮——数字唯一的活处入画）。发布物料轮的 hero 重拍同用本件。
import { mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf('--base', 'http://127.0.0.1:4176');
const SECONDS = Number(argOf('--seconds', '30'));
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const OUT = argOf('--out', join(repoRoot, 'runs', `live-portrait-${ts}`));
mkdirSync(OUT, { recursive: true });

let chromium, ffmpeg;
try {
  ({ chromium } = await import('playwright'));
  ffmpeg = (await import('ffmpeg-static')).default;
} catch {
  console.error('拍摄期依赖未装：cd stage/tools && npm i && npx playwright install chromium');
  process.exit(2);
}

const VP = { width: 1280, height: 800 };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: VP } });
const page = await ctx.newPage();
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); // live 默认模式
await page.waitForFunction(() => window.__stage?.live?.primed, null, { timeout: 30000 });
await page.waitForTimeout(2600); // 今晨的纸铺毕后落速一拍再取景

const facts = await page.evaluate(() => ({
  prefilled: window.__stage.live.prefilledCount,
  states: window.__stage.live.stateCount,
  moments: window.__stage.live.momentCount,
  phase: document.getElementById('room')?.dataset.phase,
  weather: document.getElementById('room')?.dataset.weather,
}));
await page.screenshot({ path: join(OUT, 'portrait-live.png') });
await page.hover('#counter-housing');            // 凑近：微距 loupe 入画（交互法之"凑近"）
await page.waitForTimeout(800);
await page.screenshot({ path: join(OUT, 'portrait-loupe.png') });
await page.mouse.move(40, 40);                   // 退开，回正面
await page.waitForTimeout(SECONDS * 1000);

const video = page.video();
await page.close();
const raw = await video.path();
await ctx.close();
await browser.close();
execFileSync(ffmpeg, ['-y', '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', '30',
  join(OUT, 'live-portrait.mp4')], { stdio: 'ignore' });
rmSync(raw);
console.log(`live 定妆照 → ${OUT}`);
console.log(`  素材诚实账：铺纸 ${facts.prefilled} 包＋实走 ${facts.states - facts.prefilled} 包，moments ${facts.moments}，取景相位 ${facts.phase}/${facts.weather}`);
