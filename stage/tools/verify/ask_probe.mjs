// ASK sustain·机器验收器（席二工单 1·D2 修）——合成 live-ASK 三幕走查：
//   幕一 活跃基线（合成会话喂活动对→唱片上桥·RMS 基线）
//   幕二 ASK（AskUserQuestion 行落盘→pendingAsk ≤3s 到灯＋唱片 duck 让位＋CUE 起辉）
//   幕三 清除（tool_result 落盘→pendingAsk 撤＋音量回位＋灯归零程）
// D2 修（必修 #4）：①clean HOME 自足——旧版只设 FOLEY_PROJECTS，serve 泄漏进真 ~/.foley（spool/producer 注册册）；
//   本版 FOLEY_HOME 也指 tmp。②真 sustain——不只看 pendingAsk 标志，断言琥珀灯（tube --lit）真的反复呼吸
//   （≥2 峰·治"灯只闪一下"）＋窗内 recording=true（D2 后琥珀⟹recording，测到琥珀即证在录·非空过）。
//   ③手势点先 elementFromPoint 验真空白。
// 自包含：自建假母带房（tmp）＋自起 serve（458xx 随机高位）＋真 chromium 防节流真声。
// 法源：状态契约 R2（琥珀单义·呼吸整个等待期·v1.3 asking⟹recording）＋核心处置律 recordTargets.duck。
//
//   node stage/tools/verify/ask_probe.mjs [--keep]
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const KEEP = process.argv.includes('--keep');

// ── 合成会话行工厂（真实行格式·新鲜时间戳；与 night3-R 复现同宗） ──
const house = mkdtempSync(join(tmpdir(), 'ask-probe-'));
const askHome = mkdtempSync(join(tmpdir(), 'ask-home-'));   // D2：clean HOME（隔离 spool/producer·不泄漏真 ~/.foley）
const proj = join(house, '-askprobe');
mkdirSync(proj, { recursive: true });
const tape = join(proj, 'session.jsonl');
const base = { parentUuid: null, isSidechain: false, userType: 'external', cwd: '/tmp/askprobe', sessionId: 'ask-probe-0001', version: '2.1.209' };
const L = (o) => JSON.stringify({ ...base, ...o });
const iso = (ms) => new Date(ms).toISOString();
let uid = 0;
const actPair = (t) => [
  L({ type: 'assistant', timestamp: iso(t), uuid: `aa${++uid}`, message: { id: `m${uid}`, type: 'message', role: 'assistant', model: 'probe', content: [{ type: 'tool_use', id: `tu${uid}`, name: 'Bash', input: { command: `echo ${uid}` } }] } }),
  L({ type: 'user', timestamp: iso(t + 800), uuid: `au${uid}`, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `tu${uid}`, content: [{ type: 'text', text: 'ok' }] }] }, toolUseResult: { stdout: 'ok' } }),
];
const askLine = () => L({ type: 'assistant', timestamp: iso(Date.now()), uuid: 'ask-a', message: { id: 'ask-m', type: 'message', role: 'assistant', model: 'probe', content: [{ type: 'tool_use', id: 'ask-1', name: 'AskUserQuestion', input: { questions: [{ question: '甲或乙？', header: '取舍', options: [{ label: '甲', description: 'A' }, { label: '乙', description: 'B' }], multiSelect: false }] } }] } });
const clearLine = () => L({ type: 'user', timestamp: iso(Date.now()), uuid: 'ask-u', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ask-1', content: [{ type: 'text', text: '{"answers":{"取舍":"甲"}}' }] }] }, toolUseResult: { answers: { 取舍: '甲' } } });

// 史：20s 前起 3 对活动（新鲜到"未歇场"）
const t0 = Date.now() - 20000;
writeFileSync(tape, [...actPair(t0), ...actPair(t0 + 5000), ...actPair(t0 + 10000)].join('\n') + '\n');

// ── 自起 serve（隔离房·clean HOME） ──
const port = 45800 + Math.floor(Math.random() * 90);
const serve = spawn(process.execPath, [join(root, 'stage', 'serve.mjs'), String(port)], {
  env: { ...process.env, FOLEY_HOME: askHome, FOLEY_PROJECTS: house }, stdio: 'ignore',
});
const cleanup = (code) => {
  try { serve.kill(); } catch { /* 已亡 */ }
  if (!KEEP) { try { rmSync(house, { recursive: true, force: true }); } catch { /* 尽力 */ } try { rmSync(askHome, { recursive: true, force: true }); } catch { /* 尽力 */ } }
  process.exit(code);
};
process.on('SIGINT', () => cleanup(130));
await new Promise((r) => setTimeout(r, 1200));

// ── 真 chromium（防节流＋免手势声策——record.mjs 勘定姿势） ──
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
const require_ = createRequire(join(root, 'audit/tools/package.json'));
const { chromium } = require_('playwright-core');
const browser = await chromium.launch({
  executablePath: autodetectChromium(), headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/?machine`, { waitUntil: 'domcontentloaded' });   // ?machine：暴露 window.__stage.machine 供读 recording（非空过）
await page.waitForTimeout(1500);
// 真手势·先验真空白（必修 #4·坑册 #2）：避 #deck/#selector 等命中区
const gesture = await page.evaluate(() => {
  const cand = [[1300, 80], [1330, 60], [1260, 100], [1100, 60]];
  const hitIds = ['deck', 'servo-knob', 'song-keys', 'dub-key', 'dub-tags', 'rack', 'selector', 'reel-l', 'reel-r'];
  for (const [x, y] of cand) {
    const el = document.elementFromPoint(x, y);
    const id = el?.closest?.('[id]')?.id ?? '';
    if (!hitIds.includes(id)) return { x, y, closestId: id };
  }
  return { x: cand[0][0], y: cand[0][1], closestId: '?' };
});
await page.mouse.click(gesture.x, gesture.y);   // 声桥起＋快拧 POST（page.mouse 真输入管线·发 pointerdown）
await page.waitForTimeout(7000);            // POST 5.0s＋余量

// 采样器：500ms 一拍（rms=机器代理·lit=CUE 光字·ask=导出 asking·rec=recording 导出态）
await page.evaluate(() => {
  window.__probe = [];
  window.__t0 = performance.now();
  setInterval(() => {
    const tube = document.getElementById('amber-tube');
    const L2 = window.__stage?.lamps;
    const m = window.__stage?.machine;
    window.__probe.push({
      t: Math.round(performance.now() - window.__t0),
      rms: +(window.__stage?.sound?.rms?.() || 0).toFixed(4),
      lit: tube ? +(tube.style.getPropertyValue('--lit') || 0) : 0,
      ask: !!(L2 && L2.pendingAsk),
      rec: !!(m && m.d && m.d.recording),   // D2：导出 recording（琥珀⟹recording·测到琥珀即在录）
      link: m?.S?.link, power: m?.S?.power,
    });
  }, 500);
});

const meanRms = (arr) => arr.reduce((s, x) => s + x.rms, 0) / Math.max(arr.length, 1);
const grab = () => page.evaluate(() => window.__probe.splice(0));

// 幕一：活跃基线——自适应喂养（喂活动对直到唱片上桥 RMS>0.03，最多 10 轮；固定睡眠赌不起引擎时序）
let act1 = [];
let baseline = 0;
for (let round = 0; round < 10; round++) {
  appendFileSync(tape, actPair(Date.now()).join('\n') + '\n');
  await page.waitForTimeout(3000);
  act1 = act1.concat(await grab());
  const tail = act1.slice(-5);
  baseline = meanRms(tail);
  if (baseline > 0.03) break;
}
const askBefore = act1.some((s) => s.ask);

// 幕二：ASK 落盘（agent 停手）——采 12s
appendFileSync(tape, askLine() + '\n');
await page.waitForTimeout(12000);
const act2 = await grab();
const firstAsk = act2.find((s) => s.ask);
const askLatencyMs = firstAsk ? (act2[0] ? firstAsk.t - act2[0].t + 500 : firstAsk.t) : null;
const duckWindow = act2.slice(-10);
const ducked = meanRms(duckWindow);
const askSustained = duckWindow.every((s) => s.ask);
// D2 真 sustain：琥珀灯真的反复呼吸（≥2 个亮峰·治"灯只闪一下"），非仅标志位
// D2 真呼吸（席一复审 #5）：litPeaks＝呼吸「周期」数＝升沿计数（暗<0.05 跨到亮>0.15），非亮样本数——
// 一次长亮只算 1 峰；≥2 升沿才证反复呼吸（治船长"灯只闪一下"）。CUE 周期 3.48s·12s 窗约 3 升沿。
let litPeaks = 0; for (let i = 1; i < act2.length; i++) { if (act2[i - 1].lit < 0.05 && act2[i].lit > 0.15) litPeaks++; }
const litDuringAsk = Math.max(...act2.map((s) => s.lit));
// D2 非空过：琥珀⟹recording——窗内 recording 必须真（测到琥珀即证在录制中）
const recDuringAsk = duckWindow.length > 0 && duckWindow.every((s) => s.rec === true);

// 幕三：清除（回答落地）——采 10s
appendFileSync(tape, clearLine() + '\n');
await page.waitForTimeout(10000);
const act3 = await grab();
const askAfterClear = act3.slice(-8).some((s) => s.ask);
const recovered = meanRms(act3.slice(-8));

const duckDb = 20 * Math.log10(Math.max(ducked, 1e-6) / Math.max(baseline, 1e-6));
const recoverDb = 20 * Math.log10(Math.max(recovered, 1e-6) / Math.max(baseline, 1e-6));

const verdict = {
  probe: 'ask_probe（席二工单1·D2·clean HOME·三幕）',
  gesture,
  baseline: { rms: +baseline.toFixed(4), askBefore },
  ask: {
    latencyToLampMs: askLatencyMs, sustainedFlag: askSustained, litPeaks, recDuringAsk,
    duckedRms: +ducked.toFixed(4), duckDb: +duckDb.toFixed(1), cueLitPeak: +litDuringAsk.toFixed(3),
  },
  clear: { askCleared: !askAfterClear, recoveredRms: +recovered.toFixed(4), recoverDb: +recoverDb.toFixed(1) },
  pageErrors: errs,
  PASS: false,
};
verdict.PASS =
  baseline > 0.03 &&              // 幕一：唱片真上桥（活跃基线成立，非歇场假象）
  !askBefore &&                   // 误报=0 的前半：ASK 前灯不说谎
  !!firstAsk && (askLatencyMs ?? 9e9) <= 3000 &&   // 上升沿 ≤3s 到灯
  askSustained &&                 // 呼吸整个等待期（窗内 asking 恒真）
  recDuringAsk &&                 // D2 非空过：窗内 recording 真（琥珀⟹recording）
  litPeaks >= 2 &&                // D2 真 sustain：琥珀灯反复呼吸（非一闪·船长"只闪一下"病）
  duckDb <= -4 &&                 // 唱片让位一耳可辨（≥4dB）
  litDuringAsk > 0.05 &&          // CUE 光字真亮过（rAF 防节流下）
  !askAfterClear &&               // 误报=0 的后半：回答落地即撤
  recoverDb >= -2 &&              // 音量回位（±2dB 内）
  errs.length === 0;

console.log(JSON.stringify(verdict, null, 2));
await browser.close();
cleanup(verdict.PASS ? 0 : 1);
