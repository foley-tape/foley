// dub 自动化（FOLEY_DESIGN_DUB 序：cli 命令暂缓，先以本件承担；正式 foley dub 候总务轮迁移）
//
//   node stage/serve.mjs 4174 --replay-only     # 另开静态服务器
//   node stage/tools/dub.mjs [--base http://localhost:4174] [--out runs/dubs-mt1-<ts>]
//   node stage/tools/dub.mjs --ritual           # 撕纸仪式屏录（1× 演出＋真鼠标撕）
//
// 素材诚实条款：五带自动选段全走 ?dub=auto 真回放（dubclock=8 只加速演出钟——
// 纸空间法保证墨迹与 1× 逐像素同种）；纸条 PNG 由页面亲手合成、经 /dub/save 落盘，
// 本件只做搬运与采数，无从摆拍。
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf('--base', 'http://localhost:4174');
const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const OUT = argOf('--out', join(repoRoot, 'runs', `dubs-mt1-${ts}`));
const RITUAL = args.includes('--ritual');
mkdirSync(OUT, { recursive: true });

let chromium, ffmpeg;
try {
  ({ chromium } = await import('playwright'));
  ffmpeg = (await import('ffmpeg-static')).default;
} catch {
  console.error('拍摄期依赖未装：cd stage/tools && npm i && npx playwright install chromium');
  process.exit(2);
}

const TAPES = ['storm', 'smooth', 'busy', 'jam', 'silence'];
const VP = { width: 1280, height: 800 };
const browser = await chromium.launch();

if (!RITUAL) {
  // —— 五带自动选段 → 纸条 PNG 各一 ＋ 影子采数 ——
  const rows = [];
  for (const tape of TAPES) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?tape=${tape}&dub=auto&dubclock=8`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__stage?.dub, null, { timeout: 15000 });
    const res = await page.evaluate(() => window.__stage.dub.done); // 演出+撕全程（8× 钟约 7s）
    await page.waitForTimeout(900); // 纸条落台
    await page.screenshot({ path: join(OUT, `${tape}-rest.png`) });
    await ctx.close();
    for (const rel of res.saved?.saved ?? []) {
      copyFileSync(join(repoRoot, rel), join(OUT, rel.split('/').pop()));
    }
    rows.push({ tape, doc: res.doc, analysis: res.analysis, saved: res.saved?.saved ?? [] });
    const a = res.analysis;
    console.log(`${tape.padEnd(8)} ${res.doc.segments.length}段  成片${(a.viewerMs / 1000).toFixed(1)}s  raw覆盖${a.coverage.toFixed(3)}  盈余${a.excessCoverage.toFixed(3)}  效率${a.efficiency.toFixed(3)}  占比${a.durationShare.toFixed(3)}`);
  }
  writeFileSync(join(OUT, 'shadow-mt1.json'), JSON.stringify({
    kind: 'dub-shadow/M-T1 首采（informational）',
    note: 'raw 覆盖率对长带数学不可达（基线×小时数≫45s 任何选段）；盈余口径与选择效率并采候裁',
    createdAt: new Date().toISOString(),
    tapes: rows.map(r => ({ tape: r.tape, tapeHash: r.doc.tapeHash, paramsHash: r.doc.paramsHash, ...r.analysis })),
  }, null, 2) + '\n');
  console.log('五带纸条＋影子采数 →', OUT);
} else {
  // —— 撕纸仪式（storm，1× 演出，真鼠标顺齿孔撕）——
  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 2, recordVideo: { dir: OUT, size: VP } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?tape=storm&seek=920`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stage?.dub && window.__stage.replayer.stageT > 920000, null, { timeout: 15000 });
  await page.waitForTimeout(2600);                    // 先让纸走出几步真墨
  await page.click('#dub-key');                       // ① 按键=机器提议
  await page.waitForFunction(() => window.__stage.dub.state === 'armed', null, { timeout: 90000 }); // ② 演出一遍（约 45s）
  await page.waitForTimeout(1200);                    // 齿孔静候一拍
  const g = await page.evaluate(() => {               // ③ 顺齿孔按住拖动
    const d = window.__stage.dub;
    const r = document.getElementById('dub-overlay').getBoundingClientRect();
    const x0 = Math.max(r.left + 24, r.left + d._xOf(d.stripRange[0]) + 20);
    const x1 = Math.min(r.right - 24, x0 + (r.right - x0) * 0.86);
    return { x0, x1, y: r.top + r.height * 0.46 };
  });
  await page.mouse.move(g.x0, g.y);
  await page.mouse.down();
  for (let i = 1; i <= 22; i++) {
    await page.mouse.move(g.x0 + ((g.x1 - g.x0) * i) / 22, g.y + Math.sin(i * 0.7) * 2);
    await page.waitForTimeout(36);
  }
  await page.mouse.up();                              // ④ 撕开
  await page.waitForFunction(() => window.__stage.dub.state === 'resting', null, { timeout: 15000 });
  await page.waitForTimeout(2800);                    // ⑤ 纸条歇台
  const video = page.video();
  await page.close();
  const raw = await video.path();
  await ctx.close();
  execFileSync(ffmpeg, ['-y', '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-r', '30',
    join(OUT, 'ritual-tear-storm.mp4')], { stdio: 'ignore' });
  rmSync(raw);
  console.log('撕纸仪式屏录 →', join(OUT, 'ritual-tear-storm.mp4'));
}

await browser.close();
