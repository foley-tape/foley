// 影子指标三条（M2.1 §2 立；M2.2 §0.3 裁：恒迟＝active——恒等式直转，
// "对恒等式做统计观察是对数学的不敬"；针速比/体温 informational 候两轮）
//
//   node stage/tools/shadows.mjs [--base http://localhost:4173]
//
// ① 针尖峰速：渲染端实测 ≤ 包数据峰速 ×1.05（光学不许比物理快）
// ② 恒迟：p50/p95 ≤ 60ms（live 与回放两测）
// ③ 体温：live 常驻 30s 的渲染进程 CPU 占比，目标绿档 <5%（CDP Performance）
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf('--base', 'http://localhost:4173');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('需要 playwright（拍摄期依赖）'); process.exit(2); }

const browser = await chromium.launch();
const pct = (arr, q) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

async function shadowOn(url, warmSec, note) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stage && window.__shadow);
  // 回放页：等 8× 铺纸落回 1× 再清零采样——倍速段的舞台钟/真实钟不同速，
  // 混采即污染（本工具首轮的教训，见 FEEDBACK M-S4）
  await page.waitForFunction(() =>
    !window.__stage.replayer || window.__stage.replayer.speed === 1, { timeout: 60000 });
  await page.evaluate(() => {
    window.__shadow.needlePacketPeak = 0;
    window.__shadow.needleRenderPeak = 0;
    window.__shadow.delays = [];
  });
  await page.waitForTimeout(warmSec * 1000);
  const s = await page.evaluate(() => window.__shadow);
  const d = s.delays;
  const ratio = s.needlePacketPeak > 0.01
    ? (s.needleRenderPeak / s.needlePacketPeak).toFixed(3)
    : 'n/a（针静止，分母是噪声）';
  console.log(`【${note}】针速 包=${s.needlePacketPeak.toFixed(3)}/s 渲=${s.needleRenderPeak.toFixed(3)}/s ` +
    `比=${ratio}（限 1.05）｜` +
    `恒迟 p50=${pct(d, 0.5).toFixed(1)}ms p95=${pct(d, 0.95).toFixed(1)}ms（限 60）｜样本 ${d.length}`);
  await ctx.close();
}

// ① ② 回放（storm 风暴段，针挥杆最猛处）与 live
await shadowOn(`${BASE}/?tape=storm&seek=918&shadow=1`, 40, '回放 storm 918→958');
await shadowOn(`${BASE}/?shadow=1`, 40, 'live 实流');

// ③ 体温：live 页常驻 30s，CDP Performance 量 TaskDuration/墙钟
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__stage);
  await page.waitForTimeout(5000); // 铺纸与首屏抖动让过
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const grab = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    const g = n => metrics.find(m => m.name === n)?.value ?? 0;
    return { task: g('TaskDuration'), wall: g('Timestamp') };
  };
  const a = await grab();
  await page.waitForTimeout(30000);
  const b = await grab();
  const cpu = ((b.task - a.task) / (b.wall - a.wall)) * 100;
  console.log(`【体温】live 常驻 30s：渲染进程 CPU ≈ ${cpu.toFixed(2)}%（绿档 <5%）`);
  await ctx.close();
}

await browser.close();
