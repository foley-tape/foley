// hero 发布素材出片（M2.5 §B.2，工具箱 §6）：主片 MP4 有声＋GIF 无声＋次片 DUB 仪式 8s。
//
//   node stage/serve.mjs 4175 --replay-only     # 先起服务器（render-audio 需 cli 与生带在位）
//   node stage/tools/hero.mjs [--base http://127.0.0.1:4175] [--out runs/hero-m25]
//
// 素材诚实：段表=stage/hero-cuts.json（工具箱 beats 的版本化执行形），真带回放，指纹随件。
import { mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf('--base', 'http://127.0.0.1:4175');
const OUT = argOf('--out', join(repoRoot, 'runs', 'hero-m25'));
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
// AVC/AAC 编码器住在正牌 Chrome 里
const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());

async function heroPass(kind) {
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') console.log(`  [页面·${kind}]`, m.text()); });
  await page.goto(`${BASE}/?tape=storm&hero=${kind}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stage?.dub, null, { timeout: 20000 });
  const res = await page.evaluate(() => window.__stage.dub.done);
  await ctx.close();
  if (res?.error) { console.error(`✗ hero-${kind}：${res.error}`); process.exit(1); }
  const files = Object.values(res.saved ?? {}).filter(Boolean);
  for (const rel of files) copyFileSync(join(repoRoot, rel), join(OUT, rel.split('/').pop()));
  console.log(`hero-${kind} ✓`, res.stats ? `${res.stats.codec}/${res.stats.container} ${(res.stats.filmMs / 1000).toFixed(1)}s ${res.stats.realtimeX}×实时 声${res.stats.audio?.codec} Δ${res.stats.sync?.deltaMs}ms` : '', files.join(' '));
  return res;
}

await heroPass('main');
await heroPass('gif');

// —— 次片：DUB 仪式 8s（按键→齿孔→撕→落台；dubclock=16 快绕演出即真行为） ——
{
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: VP } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}/?tape=storm&seek=930&dubclock=16&film=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stage?.dub && window.__stage.replayer.stageT > 930000, null, { timeout: 20000 });
  await page.waitForTimeout(900);
  const tPress = (Date.now() - t0) / 1000;
  await page.click('#dub-key');
  await page.waitForFunction(() => window.__stage.dub.state === 'armed', null, { timeout: 30000 });
  await page.waitForTimeout(900);
  const g = await page.evaluate(() => {
    const d = window.__stage.dub;
    const r = document.getElementById('dub-overlay').getBoundingClientRect();
    const x0 = Math.max(r.left + 24, r.left + d._xOf(d.stripRange[0]) + 20);
    const x1 = Math.min(r.right - 24, x0 + (r.right - x0) * 0.86);
    return { x0, x1, y: r.top + r.height * 0.46 };
  });
  await page.mouse.move(g.x0, g.y);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) { await page.mouse.move(g.x0 + ((g.x1 - g.x0) * i) / 16, g.y + Math.sin(i * 0.7) * 2); await page.waitForTimeout(34); }
  await page.mouse.up();
  await page.waitForFunction(() => window.__stage.dub.state === 'resting', null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const video = page.video();
  await page.close();
  const raw = await video.path();
  await ctx.close();
  execFileSync(ffmpeg, ['-y', '-ss', Math.max(0, tPress - 0.4).toFixed(2), '-t', '8', '-i', raw,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', '30',
    join(OUT, 'hero-dub-ritual-8s.mp4')], { stdio: 'ignore' });
  rmSync(raw);
  console.log('次片 hero-dub-ritual-8s.mp4 ✓');
}

await browser.close();
execFileSync('shasum', ['-a', '256', ...readdirSync(OUT).filter(f => /\.(mp4|gif|png)$/.test(f))], { cwd: OUT, stdio: ['ignore', process.stdout, 'inherit'] });
console.log('hero 全套 →', OUT);
