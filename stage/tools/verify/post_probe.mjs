// POST 开机自检·机器验收器（⑦批）：真 chromium 开页→合成首手势→逐 100ms 采样器件状态，
// 打印时间轴并断言六件套都活过、终态归还（静止零写）。
//
//   node stage/tools/verify/post_probe.mjs --profile index|demo [--secs 4.6]
//   （--profile＝一键选房·整固批：demo 自动带 POWER 手势与 URL；显式 --url/--click 可覆写）
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PROFILE = argOf('--profile', null);
const PRESET = {
  index: { url: 'http://127.0.0.1:4181/?sound=0', click: null },
  demo: { url: 'http://127.0.0.1:4181/demo.html?sound=0', click: '#power' },
}[PROFILE];
if (PROFILE && !PRESET) { console.error(`未知 profile：${PROFILE}（可选 index|demo）`); process.exit(2); }
const URL_ = argOf('--url', PRESET?.url ?? 'http://127.0.0.1:4181/?sound=0');
const SECS = Number(argOf('--secs', '6.8'));   // 5.0s 紧凑三阶段＋收尾余量（船长二修令后）
const CLICK = argOf('--click', PRESET?.click ?? null);   // demo 页：POST 挂在 POWER（--profile demo 自动）

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

const browser = await chromium.launch({ executablePath: autodetectChromium(), headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
if (CLICK) await page.evaluate((s) => { window.__probeClick = s; }, CLICK);

// 基线：手势前采 1.2s 盘速（醒来带已在机上转=法条；nudge 断言须刨去本底转速）
const base = await page.evaluate(async () => {
  const st = () => window.__stage || window.__demo || {};
  const th0 = st().deck?.reels[0].theta ?? 0;
  await new Promise((r) => setTimeout(r, 1200));
  return { rate: ((st().deck?.reels[0].theta ?? 0) - th0) / 1.2 };
});
console.log('[baseline] reel rate', base.rate.toFixed(3), 'rad/s');

// 采样器挂载＋合成首手势（pointerdown 即 POST；?sound=0 下无声桥不碍机械）
await page.evaluate(() => {
  const g = (id) => document.getElementById(id);
  window.__probe = [];
  window.__probeT0 = performance.now();
  window.__probeTimer = setInterval(() => {
    const s = window.__stage || window.__demo || {};
    window.__probe.push({
      t: Math.round(performance.now() - window.__probeT0),
      reel: s.deck ? +s.deck.reels[0].theta.toFixed(3) : null,
      pen: g('pen-head')?.style.transform || '',
      vu: (document.querySelector('.vu-needle')?.style.transform || '').replace(/rotate\(|deg\)/g, ''),
      cue: g('amber-tube')?.style.getPropertyValue('--lit') || '0',
      wrap: g('emerald')?.style.getPropertyValue('--lit') || '0',
      ember: g('emerald')?.style.getPropertyValue('--ember') || '0',
      line: g('pilot')?.style.getPropertyValue('--lit') || '',
      act: g('magic-eye')?.style.getPropertyValue('--act') || '0',
      flapLit: g('flap-cells')?.classList.contains('lit') ?? false,
      flapAnim: g('flap-cells') ? g('flap-cells').getAnimations({ subtree: true }).length : 0,
    });
  }, 100);
  window.__probeClick ? document.querySelector(window.__probeClick)?.click()
    : document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await page.waitForTimeout(SECS * 1000);
const rows = await page.evaluate(() => { clearInterval(window.__probeTimer); return window.__probe; });
// 归还=所有权回归（跑动的机器上笔随活包、act 随真活动——终态不是零而是"物归原主"）
const owned = await page.evaluate(() => ({
  penOwned: !!(window.__stage || window.__demo || {}).chart?.penHead,
  vuSourceBack: window.__stage?.sound ? true : (window.__stage ? true : false),
}));
await browser.close();

for (const r of rows) {
  console.log(`t=${String(r.t).padStart(4)}  reel=${String(r.reel).padStart(7)}  vu=${String(r.vu).padStart(7)}  pen=${r.pen.padEnd(22)} cue=${r.cue} wrap=${r.wrap} ember=${r.ember} line=${r.line} act=${r.act} flap=${r.flapLit ? 'LIT' : 'off'}/${r.flapAnim}`);
}
// —— 断言（5.0s 两乐章制·设计三§六.2：TEST 电气自检[马达不转]→ON 尾章电机降生·快拧压缩版） ——
const num = (v) => Number(v) || 0;
const penTys = rows.map((r) => num((r.pen.match(/-?[\d.]+/) || [0])[0]));
const vuMax = Math.max(...rows.map((r) => num(r.vu)));
const cueMax = Math.max(...rows.map((r) => num(r.cue)));
const wrapMax = Math.max(...rows.map((r) => num(r.wrap)));
const emberMax = Math.max(...rows.map((r) => num(r.ember)));
const lineMax = Math.max(...rows.filter((r) => r.t < 4800).map((r) => num(r.line)));
const flapAnimMax = Math.max(...rows.map((r) => r.flapAnim));
const last = rows.at(-1);
// 取窗纪律（demo=带妆待命：storm 定妆包让待机针位非零/魔眼先热——POST 断言一律限窗，免被日常态抢镜）
const kick = rows.filter((r) => r.t < 600);
const vuKick = Math.max(...kick.map((r) => num(r.vu)));
const tVu = kick.reduce((b, r) => (num(r.vu) > num(b.vu) ? r : b), rows[0]).t;
const tWrap = rows.reduce((b, r) => (num(r.wrap) > num(b.wrap) ? r : b), rows[0]).t;
// 魔眼：预热=先压冷（0.4–0.8s 窗见暗谷·demo 带妆余温在此下坡）再对焦（0.8s 后首越 0.8）
const eyeDip = Math.min(...rows.filter((r) => r.t >= 400 && r.t <= 800).map((r) => num(r.act)));
const tEye = (rows.find((r) => r.t >= 800 && num(r.act) >= 0.8) || { t: Infinity }).t;
const tCue = (rows.find((r) => num(r.cue) >= 0.8) || { t: Infinity }).t;
const tFlap = (rows.find((r) => r.flapAnim > 0) || { t: Infinity }).t;
// 涌流回弹：0.6–1.1s 窗内针须已退出红区回到左半盘（demo 事件针位≈−29 亦为"零位"之诚实形态）
const vuBack = Math.min(...rows.filter((r) => r.t >= 600 && r.t <= 1100).map((r) => num(r.vu)));
const cueLate = Math.max(...rows.filter((r) => r.t >= 4500 && r.t < 5000).map((r) => num(r.cue)));
const earlyFlap = Math.max(...rows.filter((r) => r.t < 2000).map((r) => r.flapAnim));
// nudge 刨本底：ON 尾章马达槽 [3300,5200]（reelAt 3.4s+惯性 1.5s；demo 的 POWER 并发起转叠加→下界断言）
const w = rows.filter((r) => r.t >= 3300 && r.t <= 5200 && r.reel != null);
const nudged = w.length >= 2 ? (w.at(-1).reel - w[0].reel) - base.rate * (w.at(-1).t - w[0].t) / 1000 : NaN;
// TEST 乐章马达不转（两乐章铁序·index 纯净可测）：[500,3200] 窗刨本底近零转动。
// demo 免测此条——POWER 并发 transport 起转在案（带妆待命勘误家族），盘转是日常粮非 POST nudge。
const tw = rows.filter((r) => r.t >= 500 && r.t <= 3200 && r.reel != null);
const testDrift = tw.length >= 2 ? (tw.at(-1).reel - tw[0].reel) - base.rate * (tw.at(-1).t - tw[0].t) / 1000 : NaN;
// 涌流口径分房（nudge 下界断言同族）：index=满甩撞钉；demo=POWER 并发装带忙帧→VU 弹簧 dt 钳
// 保护吃掉撞钉幅度（159ms 卡帧不炸簧的代价）——下界=针冲进红区（红区界 13.16°+余量）
const vuKickFloor = PROFILE === 'demo' ? 15 : 40;
const checks = [
  [`【TEST·电】VU 涌流打满（0.6s 窗内峰 ${vuKick}°>${vuKickFloor} @${tVu}ms=入红区）`, vuKick > vuKickFloor],
  [`【TEST·电】VU 半秒回弹（0.6–1.1s 内 ${vuBack}°<−10=退出红区回左半盘）`, vuBack < -10],
  ['【TEST·电】LINE 立亮微弱底光（0.26 在场）', Math.abs(lineMax - 0.26) < 0.01],
  [`【TEST·热】魔眼预热（0.4–0.8s 暗谷 act=${eyeDip}≤0.45·其后 ${tEye}ms≤1900 对焦 act≥0.8）`, eyeDip <= 0.45 && tEye <= 1900],
  ['【TEST·热】WRAP 对焦触发爆亮（峰 >0.9·随后热衰减）', wrapMax > 0.9],
  ['【TEST·热】WRAP 余温红（--ember 出现）', emberMax > 0.1],
  [`【TEST·热】CUE 闪亮后常亮（4.5–5.0s 仍 ${cueLate}≥0.8）`, cueMax >= 0.8 && cueLate >= 0.8],
  ['【TEST·机电】探针全幅扫摆（电气拍加速版·ty 两向越 ±20px）', Math.min(...penTys) < -20 && Math.max(...penTys) > 20],
  ['【TEST·机电】翻牌与探针重叠（动画在场）', flapAnimMax >= 6],
  ...(PROFILE === 'demo' ? [] : [
    [`【TEST 铁序】全乐章马达不转（0.5–3.2s 刨本底漂移 ${testDrift.toFixed(3)} rad<0.3）`, Math.abs(testDrift) < 0.3],
  ]),
  [`【ON 尾章】电机降生：双盘沉重¼转（3.3s 后·刨本底 Δθ=${nudged.toFixed(3)}≥π/2−0.35）`, nudged > Math.PI / 2 - 0.35],
  [`【时序】两乐章单调（VU ${tVu}→魔眼 ${tEye}→WRAP ${tWrap}→CUE ${tCue}→翻牌 ${tFlap}ms·电气拍全在 reelAt 3.4s 前）`,
    tVu < tEye && tEye <= tWrap + 100 && tWrap < tCue && tCue < tFlap && tFlap < 3400],
  ['【时序】翻牌纪律（2.0s 前零动画=揭幕闸在班·flapAt 2.2s）', earlyFlap === 0],
  ['终态归还（笔把手归 chart·CUE 熄·LINE 回 0.12·牌动画尽）',
    owned.penOwned && num(last.cue) < 0.02 && last.line === '0.12' && last.flapAnim === 0],
];
let fail = 0;
for (const [name, ok] of checks) { console.log(`${ok ? '✔' : '✘'} ${name}`); if (!ok) fail++; }
process.exit(fail ? 1 : 0);
