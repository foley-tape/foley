// 性格照管线（M2.1 §1.4）—— 一条命令按 portraits.json 全量重拍。
//
//   node stage/serve.mjs --replay-only          # 另开一枚静态服务器
//   node stage/tools/portraits.mjs [--base http://localhost:4173] [--out runs/portraits-<ts>]
//
// 依赖为拍摄期工具，不入运行时：npm i -D playwright ffmpeg-static && npx playwright install chromium
// 素材诚实条款：只回放 fixtures 真带；机位由 portraits.json 定死，临场挑段无门。
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, '..', 'portraits.json'), 'utf8'));

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf('--base', 'http://localhost:4173');
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const OUT = argOf('--out', join(here, '..', '..', 'runs', `portraits-${ts}`));
mkdirSync(OUT, { recursive: true });

let chromium, ffmpeg;
try {
  ({ chromium } = await import('playwright'));
  ffmpeg = (await import('ffmpeg-static')).default;
} catch {
  console.error('拍摄期依赖未装：npm i -D playwright ffmpeg-static && npx playwright install chromium');
  process.exit(2);
}

const VP = { width: spec.viewport.width, height: spec.viewport.height };
const DSF = spec.viewport.deviceScaleFactor ?? 2;
const browser = await chromium.launch();

async function rollTo(page, targetSec, settleSpeed = 1) {
  await page.evaluate(([t, sp]) => {
    const r = window.__stage.replayer;
    r.speed = 8;
    return new Promise(res => {
      const iv = setInterval(() => {
        if (r.stageT >= t * 1000) { r.speed = sp; clearInterval(iv); res(); }
      }, 40);
    });
  }, [targetSec, settleSpeed]);
}

async function newPage(ctx, tape, seek) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?tape=${tape}&seek=${seek}&speed=8`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stage && window.__stage.replayer.stageT > 0);
  return page;
}

for (const p of spec.portraits) {
  const wall0 = Date.now();
  const ctx = await browser.newContext({
    viewport: VP, deviceScaleFactor: DSF, recordVideo: { dir: OUT, size: VP },
  });
  const page = await newPage(ctx, p.tape, p.prefill);
  await rollTo(page, p.from);
  const cutSec = (Date.now() - wall0) / 1000 + 0.8;
  await page.waitForTimeout((p.seconds + 2) * 1000);
  const video = page.video();
  await page.close();
  const raw = await video.path();
  await ctx.close();
  execFileSync(ffmpeg, ['-y', '-i', raw, '-ss', cutSec.toFixed(2), '-t', String(p.seconds),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', '30',
    join(OUT, `${p.name}.mp4`)], { stdio: 'ignore' });
  rmSync(raw);
  console.log(`${p.name}.mp4 ✓  ${p.note ?? ''}`);
}

for (const s of spec.stills) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: DSF });
  const page = await newPage(ctx, s.tape, s.prefill);
  await rollTo(page, s.at);
  if (s.hoverCounter) { await page.hover('#counter-housing'); await page.waitForTimeout(700); }
  else await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, `${s.name}.png`) });
  await ctx.close();
  console.log(`${s.name}.png ✓`);
}

await browser.close();
console.log('全量重拍完成 →', OUT);
