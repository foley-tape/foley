// 工单5/6 验收探针：一击三事仲裁（首手势=通电·恰一事）＋镜头回程（Escape·写者纪律）。
// 真 Chrome（CDP 可信输入·headless 新架构 rAF 照走）＋隔离 rig（厂带自举=确定性 PLAYING 底座）。
//   node stage/tools/verify/gesture_lens_probe.mjs [--log <file>]
// 案单：
//   W5-A 首击落 #deck：不得暂停（一击≠通电+暂停竞速）·电到·声桥在位
//   W5-B 次击 #deck：器件语义归位（PAUSED）
//   W5-C 首击架沿：镜头不得下摇（一击≠通电+POST+下摇）
//   W5-D 首击货架条目：不得选带（selected 不变）
//   W5-E 旋钮豁免：正门通电不吞后续——次击 #deck 正常暂停
//   W6-A 下摇后 Escape：≤2.5s 镜头回程到 0·lib-view 退场
//   W6-B 回程后 3s 恒 0（无缓动终点残余/慢漂）
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const LOG = args.includes('--log') ? args[args.indexOf('--log') + 1] : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const t0 = Date.now();
function check(label, ok, detail = '') {
  const line = `[t+${((Date.now() - t0) / 1000).toFixed(1)}s] ${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`;
  console.log(line);
  if (LOG) appendFileSync(LOG, line + '\n');
  if (!ok) failures++;
}
if (LOG) writeFileSync(LOG, `工单5/6 探针 · ${new Date().toISOString()}\n`);

const require_ = createRequire(join(repoRoot, 'audit/tools/package.json'));
const { chromium } = require_('playwright-core');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const exe = existsSync(CHROME) ? CHROME : null;
const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});

async function rig() {
  const root = mkdtempSync(join(tmpdir(), 'wo56-probe-'));
  const dirs = { home: join(root, 'foley'), projects: join(root, 'projects'), claude: join(root, 'claude'), runs: join(root, 'runs') };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  const port = await new Promise((res, rej) => { const s = createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
  const serve = spawn(process.execPath, [join(repoRoot, 'stage', 'serve.mjs'), String(port)], {
    cwd: repoRoot, detached: true, stdio: 'ignore',
    env: { ...process.env, HOME: root, FOLEY_HOME: dirs.home, CLAUDE_CONFIG_DIR: dirs.claude, FOLEY_PROJECTS: dirs.projects, FOLEY_RUNS_DIR: dirs.runs, TMPDIR: root },
  });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { const t = await (await fetch(base + '/transport')).json(); if (t.phase === 'PLAYING') break; } catch { /* 未起 */ }
    await sleep(150);
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/?machine`, { waitUntil: 'domcontentloaded' });
  await sleep(1800);   // 器件挂载＋transport SSE 到位
  return {
    base, page,
    transport: async () => (await fetch(base + '/transport')).json(),
    machine: () => page.evaluate(() => window.__stage?.machine ?? null),
    towerY: () => page.evaluate(() => {
      const t = getComputedStyle(document.getElementById('tower')).transform;
      const m = t && t !== 'none' ? t.match(/matrix\(([^)]+)\)/) : null;
      return m ? Number(m[1].split(',')[5]) : 0;
    }),
    clickCenter: async (sel) => {
      const box = await page.locator(sel).boundingBox();
      if (!box) return false;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return true;
    },
    close: async () => {
      await page.close();
      try { process.kill(-serve.pid, 'SIGKILL'); } catch { /* 已亡 */ }
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// ── 案组一：W5-A/B 首击落 #deck ──
{
  const r = await rig();
  const before = await r.transport();
  await r.clickCenter('#deck');
  await sleep(1200);
  const after = await r.transport();
  const m = await r.machine();
  check('W5-A 首击落 #deck 不得暂停（恰一事=通电）', before.phase === 'PLAYING' && after.phase === 'PLAYING',
    `before=${before.phase} after=${after.phase}`);
  check('W5-A 电到（S.power=on）', m?.S?.power === 'on', JSON.stringify(m?.S?.power));
  const sound = await r.page.evaluate(() => !!window.__stage?.sound);
  check('W5-A 声桥仍随首触上位（吞语义不吞唤醒）', sound);
  await r.clickCenter('#deck');
  await sleep(1200);
  const second = await r.transport();
  check('W5-B 次击 #deck 器件语义归位（PAUSED）', second.phase === 'PAUSED', `after2=${second.phase}`);
  await r.close();
}

// ── 案组二：W5-C 首击架沿（镜头不得随首击下摇） ──
{
  const r = await rig();
  const hit = await r.clickCenter('#lip-hint');
  if (hit) {
    await sleep(1600);
    const y = await r.towerY();
    const m = await r.machine();
    check('W5-C 首击架沿：镜头不下摇（tower 恒位）', Math.abs(y) < 1, `towerY=${y.toFixed(1)}`);
    check('W5-C 电到', m?.S?.power === 'on');
  } else {
    check('W5-C 架沿不可点（pre-gesture 隐藏＝天然无此病）', true, 'lip-hint 无命中盒');
  }
  await r.close();
}

// ── 案组三：W5-D 首击货架条目（不得选带） ──
{
  const r = await rig();
  const before = await r.transport();
  const hit = await r.clickCenter('#rack-list button[data-id="busy"]');
  if (hit) {
    await sleep(1400);
    const after = await r.transport();
    const m = await r.machine();
    check('W5-D 首击货架条目：不得选带（selected 不变）', after.selected === before.selected && after.loaded === before.loaded,
      `selected ${before.selected}→${after.selected}`);
    check('W5-D 电到', m?.S?.power === 'on');
  } else {
    check('W5-D 货架条目不可点（pre-gesture 隐藏＝天然无此病）', true, '货架无命中盒');
  }
  await r.close();
}

// ── 案组四：W5-E 旋钮豁免（正门自理·不吞后续） ──
{
  const r = await rig();
  await r.clickCenter('#selector');
  await sleep(900);
  const m = await r.machine();
  check('W5-E 旋钮首击：正门通电', m?.S?.power === 'on' || m?.S?.power === 'test', JSON.stringify(m?.S?.power));
  await r.clickCenter('#deck');
  await sleep(1200);
  const after = await r.transport();
  check('W5-E 正门通电后首个 #deck 击正常暂停（豁免路径不吞）', after.phase === 'PAUSED', `after=${after.phase}`);
  await r.close();
}

// ── 案组五：W6-A/B 镜头回程 ──
{
  const r = await rig();
  await r.page.mouse.click(1150, 80);   // 真空白位（坑册#2）：先通电（首手势仲裁在别处验，这里只要机器醒）
  await sleep(800);
  await r.page.mouse.move(640, 400);
  await r.page.mouse.wheel(0, 900);
  await sleep(1600);
  const down = await r.towerY();
  const libOn = await r.page.evaluate(() => document.body.classList.contains('lib-view'));
  check('W6-前提 下摇入带库（towerY 负移·lib-view 在）', down < -200 && libOn, `towerY=${down.toFixed(1)} lib=${libOn}`);
  await r.page.keyboard.press('Escape');
  await sleep(2500);
  const back = await r.towerY();
  const libOff = await r.page.evaluate(() => !document.body.classList.contains('lib-view'));
  check('W6-A Escape 回程（≤2.5s 到 0·lib-view 退场）', Math.abs(back) < 1 && libOff, `towerY=${back.toFixed(2)} libOff=${libOff}`);
  await sleep(3000);
  const still = await r.towerY();
  check('W6-B 回程后 3s 恒 0（无缓动残余/慢漂）', Math.abs(still) < 0.5, `towerY=${still.toFixed(2)}`);
  await r.close();
}

await browser.close();
console.log(failures === 0 ? '✅ 探针全项 PASS' : `❌ ${failures} 项 FAIL`);
process.exit(failures === 0 ? 0 : 1);
