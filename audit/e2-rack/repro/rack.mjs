// E2 卡带架·四硬规则回归（第五号手令 丁-E2）：
//   [A] landing 空载磁带架（rule 3）：架渲染·零选中·EMPTY·零页错。
//   [B] 选带上机（rule 1/4）：CUEING 锁播放/录音键→PLAYING；换带走淡出→淡入（master 增益坡·非硬切），
//       同一 AudioContext 引擎（identity 不变·永不销毁音频图）。
//   [C] 多客户端选中同步（rule 2）：page2 选带→page1 选中标记＋上机实时反映（前端不自持选中）。
//   [D] 控制面板 play/pause（rule 4）：键读后端 phase 切 PLAYING/PAUSED。
//   [E] 服务重启即空载（rule 3）：选带后同端口重起 serve→新客户端 EMPTY·无历史继承。
// 用法：node audit/e2-rack/repro/rack.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.REPO_ROOT || join(here, '..', '..', '..');
const require = createRequire(join(root, 'audit', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const exe = process.env.CHROMIUM_EXE ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const proj = mkdtempSync(join(tmpdir(), 'e2-proj-'));
mkdirSync(join(proj, 'p1'), { recursive: true });
copyFileSync(join(process.env.HOME, '.claude', 'projects', '-Users-shadow-tape0', readdirSync(join(process.env.HOME, '.claude', 'projects', '-Users-shadow-tape0')).filter(f => f.endsWith('.jsonl'))[0]), join(proj, 'p1', 's.jsonl'));
const PORT = 48200 + Math.floor(Math.random() * 200);
function bootServe() {
  const s = spawn('node', [join(root, 'stage', 'serve.mjs'), String(PORT)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FOLEY_PROJECTS: proj } });
  s.stderr.on('data', () => {});
  const ready = new Promise((res, rej) => { const to = setTimeout(() => rej(new Error('serve 超时')), 10000); s.stdout.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); res(); } }); });
  return { s, ready };
}
const base = `http://127.0.0.1:${PORT}`;
const sig = (page) => page.evaluate(() => ({
  phase: window.__stage?.transport?.(),
  selected: document.querySelector('#rack .cassette.selected')?.dataset.id ?? null,
  cassettes: document.querySelectorAll('#rack .cassette').length,
  mode: document.getElementById('now-plate')?.dataset.mode,           // empty|live|replay|paused（船长反馈修：显示牌）
  tapeLoaded: document.body.classList.contains('tape-loaded'),
  dubLocked: document.getElementById('dub-key')?.classList.contains('switch-locked'),
  gain: window.__stage?.sound?.engine?.nodes?.master?.gain?.value ?? null,
  song: document.querySelector('#now-plate .np-song')?.textContent ?? '',
  engineId: window.__stage?.sound ? (window.__stage.sound.engine.__id ??= Math.random()) : null,
}));
const clickCassette = (page, id) => page.evaluate((id) => document.querySelector(`#rack .cassette[data-id="${id}"]`)?.click(), id);
const clickDeck = (page) => page.evaluate(() => document.getElementById('deck')?.click());  // 诊断式播放/暂停

const browser = await chromium.launch({ executablePath: exe, headless: true });
let srv = bootServe(); await srv.ready;
const p1 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// net:: 网络层错误（[E] 杀 serve 时 SSE 分块流被截断＝预期，非代码 bug）不计入
const errs = []; p1.on('pageerror', e => errs.push(e.message)); p1.on('console', m => { if (m.type() === 'error' && !m.text().includes('net::')) errs.push('[c]' + m.text()); });
await p1.goto(`${base}/`, { waitUntil: 'load' }); await p1.waitForTimeout(1400);

// [A] landing 空载
const A = await sig(p1);
// 手势起声桥，记引擎 id
await p1.mouse.click(1050, 450); await p1.waitForTimeout(1400);
const eid0 = await p1.evaluate(() => (window.__stage.sound.engine.__id ??= Math.random()));

// [B] 选 storm → 观测 CUEING 锁＋淡出，PLAYING 恢复
await clickCassette(p1, 'storm'); await p1.waitForTimeout(200);
const cueing = await sig(p1);
await p1.waitForTimeout(1800);
const playing = await sig(p1);
// 换带（storm→busy）：真·切带——测淡出坡＋引擎 identity 不变
await clickCassette(p1, 'busy'); await p1.waitForTimeout(230);
const switchCue = await sig(p1);
await p1.waitForTimeout(1900);
const switched = await sig(p1);
const eid1 = await p1.evaluate(() => window.__stage.sound.engine.__id);

// [C] 多客户端同步（rule 2）：page2 选 jam → page1 反映
const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p2.goto(`${base}/`, { waitUntil: 'load' }); await p2.waitForTimeout(1200);
await clickCassette(p2, 'jam'); await p1.waitForTimeout(1900);
const p1AfterP2 = await sig(p1);

// [D] 诊断式 play/pause（点走带甲板·船长反馈修·rule 4）
await clickDeck(p1); await p1.waitForTimeout(500);
const paused = await sig(p1);
await clickDeck(p1); await p1.waitForTimeout(500);
const resumed = await sig(p1);

// [F] 背景音乐上下曲（船长反馈：一直那首歌·选了三首）
const song0 = (await sig(p1)).song;
await p1.evaluate(() => document.querySelector('#now-plate .np-next')?.click());
await p1.waitForTimeout(800);
const song1 = (await sig(p1)).song;

// [H] LIVE 模式清晰区分（船长反馈：双模式混淆）
await clickCassette(p1, 'live'); await p1.waitForTimeout(1900);
const liveMode = await sig(p1);
await p1.screenshot({ path: join(here, '..', 'shots', 'rack-live.png') });

// [G] 退带＝点已上机带（船长反馈：Eject 生硬不直观）——回空载
await clickCassette(p1, 'live'); await p1.waitForTimeout(1200);
const ejected = await sig(p1);

// [E] 服务重启即空载（rule 3）
srv.s.kill('SIGKILL'); await p1.waitForTimeout(500);
srv = bootServe(); await srv.ready;
const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p3.goto(`${base}/`, { waitUntil: 'load' }); await p3.waitForTimeout(1400);
const afterRestart = await sig(p3);

const V = {
  A_landing_empty: { pass: A.phase === 'EMPTY' && A.selected === null && A.cassettes > 3 && A.tapeLoaded === false, ...A },
  B_cueing_locks: { pass: cueing.phase === 'CUEING' && cueing.dubLocked === true, phase: cueing.phase, dubLocked: cueing.dubLocked },
  B_playing: { pass: playing.phase === 'PLAYING' && playing.selected === 'storm' && playing.mode === 'replay', selected: playing.selected, mode: playing.mode },
  B_switch_fade: { pass: switchCue.gain != null && switchCue.gain < 0.6 && switched.gain > 0.7, cueGain: +(switchCue.gain ?? -1).toFixed(3), afterGain: +(switched.gain ?? -1).toFixed(3) },  // 淡出坡（<0.6）→淡入（>0.7）
  B_engine_persist: { pass: eid0 === eid1 && eid0 != null, note: '同一 AudioContext 引擎跨切带不销毁（rule 1）' },
  B_switched_to_busy: { pass: switched.phase === 'PLAYING' && switched.selected === 'busy', selected: switched.selected },
  C_multiclient_sync: { pass: p1AfterP2.selected === 'jam', p1sees: p1AfterP2.selected, note: 'page2 选带 page1 实时反映（rule 2 后端权威）' },
  D_deck_pause: { pass: paused.phase === 'PAUSED' && paused.mode === 'paused', phase: paused.phase, mode: paused.mode },
  D_deck_resume: { pass: resumed.phase === 'PLAYING', phase: resumed.phase },
  F_record_switch: { pass: !!song1 && song1 !== song0, from: song0, to: song1, note: '背景音乐上下曲（三首）' },
  H_live_mode: { pass: liveMode.mode === 'live' && liveMode.selected === 'live', mode: liveMode.mode, note: '清晰区分 LIVE/回放' },
  G_eject: { pass: ejected.phase === 'EMPTY' && ejected.tapeLoaded === false, phase: ejected.phase, note: '点已上机带退带·平滑回空载' },
  E_restart_empty: { pass: afterRestart.phase === 'EMPTY' && afterRestart.selected === null, phase: afterRestart.phase },
  pageErrors: errs.length,
};
V.PASS = Object.values(V).every(v => (v && typeof v === 'object' && 'pass' in v) ? v.pass : true) && errs.length === 0;
if (errs.length) V.errSample = [...new Set(errs)].slice(0, 4);
console.log(JSON.stringify({ decree: 'FOLEY_DECREE_005 丁-E2 卡带架', ...V }, null, 2));
writeFileSync(join(here, '..', 'verdict.json'), JSON.stringify({ decree: 'FOLEY_DECREE_005 丁-E2', ...V }, null, 2) + '\n');

await browser.close(); srv.s.kill('SIGKILL'); rmSync(proj, { recursive: true, force: true });
process.exit(V.PASS ? 0 : 1);
