// P0-2 · 单一传动律＋暂停语义改判（第五号手令 丙）——接线端到端。
// 金测试（LIVE-7·golden/live-sound.test.ts）已严证引擎 pauseRecord/resumeRecord 的隔离行为；
// 此脚本证 main.js↔replayer↔soundbridge 接线真的经声桥：
//   [A] 单一引擎：多次手势/存在期间只一个引擎实例（identity 稳定·if(sb)return 守门）。
//   [B] 暂停＝唱片随带停：replayer.pause() → onPlayState(false) → sb.pause() → engine.recordPaused=true；床照呼吸。
//   [C] 恢复＝续播不重建：replayer.play() → onPlayState(true) → sb.resume() → recordPaused=false。
//   [D] DUB 示能：回放有带→dub-ready（咬合，非死活不明）。
//
// ⚠ 2026-07-15 席三·回归族修复（夜审右耳 D-8① 假红整改）：
//   原脚本（2026-07-08）两处腐烂——① monkeypatch spy 计 sb.pause 调用次数判「wired」，脆弱依赖对象
//   identity/时序；② 驱动序列（click(720,450)+固定 sleep）在高板重排（渲染批接线刀）后失效——replayer
//   经 deep-link select 的 serve↔SSE 往返在 ~0.6s 才挂，旧序列到 line68 时 __stage.replayer 仍 null 直接崩。
//   右耳诊为「spy 钩旧 sound.pause() 名」——机制诊断不全：现行 sb.pause 仍在（soundbridge.js:230），真病是
//   驱动序列过时 + spy 法本身脆弱。改法＝robust 驱动（轮询等挂载/声起）+ 观测效应断言（recordPaused 翻转＝
//   接线真的把 transport 停走导到引擎），identity 无关、时序无关。行为面本就对（LIVE-7 全绿），此修只让哨兵诚实。
// 收摊纪律：serve 直属子进程 SIGINT 收（禁 pkill·手令甲.3）。
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.REPO_ROOT || join(here, '..', '..', '..');
const require = createRequire(join(root, 'audit', 'tools', 'package.json'));
const { chromium } = require('playwright-core');
const exe = process.env.CHROMIUM_EXE
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const port = 45900 + Math.floor(Math.random() * 300);
const base = `http://127.0.0.1:${port}`;

// 密闭化（夜审 hermetic 令）：空母带房→serve 无 live 会话可自装→无 live 自装 CUEING→storm select 不撞
// 竞态。此 repro 只验回放传动接线，不该依赖真实 ~/.claude 会话在场与否（否则同一命门时红时绿）。
const emptyProjects = mkdtempSync(join(tmpdir(), 'foley-transport-repro-'));
const serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port)], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FOLEY_PROJECTS: emptyProjects },
});
serve.stderr.on('data', () => {});
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('serve 启动超时')), 10000);
  serve.stdout.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
  serve.on('exit', c => reject(new Error(`serve 提前退出 ${c}`)));
});

// headless 虚拟音频：--autoplay-policy 放开，AudioContext 免手势起（LEDGER headless 坑在册）
const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));

// 轮询等条件（robust 替固定 sleep）：驱动过时是原脚本崩的真因
async function waitFor(fn, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await page.evaluate(fn)) return true; await page.waitForTimeout(120); }
  throw new Error(`等待超时(${ms}ms)：${label}`);
}

// 回放模式（有带＝有转台＋唱片）：storm 演示卷经 deep-link select 自挂（serve↔SSE 往返）。
// 空母带房已消 CUEING 竞态之因；重载重试再兜一层（serve 一旦离 CUEING，重投 select 即成）。
await page.goto(`${base}/?tape=storm&speed=4`, { waitUntil: 'load' });
let mounted = false;
for (let attempt = 0; attempt < 5 && !mounted; attempt++) {
  try { await waitFor(() => !!window.__stage?.replayer, 2500, 'storm replayer 挂载'); mounted = true; }
  catch { await page.reload({ waitUntil: 'load' }); }   // 重载＝boot 重投 authed select
}
if (!mounted) throw new Error('storm replayer 多次重载仍未挂载');

// [A] 单一引擎：手势起声→记引擎 identity→再手势→identity 必须不变（if(sb)return 守门）
await page.mouse.click(720, 40);                       // 手势起声（点击可能顺带 toggle 甲板，下方显式重置）
await waitFor(() => !!window.__stage?.sound?.engine, 5000, '声桥引擎起');
const engBefore = await page.evaluate(() => { window.__eng = window.__stage.sound.engine; return !!window.__eng; });
await page.mouse.click(720, 40);
await page.waitForTimeout(500);
const singleEngine = await page.evaluate(() => window.__stage?.sound?.engine === window.__eng && !!window.__eng);

// 装 analyser 测房间层（床），并把 replayer 显式置回 PLAYING（中和手势对甲板的顺带 toggle）
await page.evaluate(() => {
  const sb = window.__stage.sound;
  const an = sb.ctx.createAnalyser(); an.fftSize = 2048;
  sb.engine.nodes.master.connect(an);
  window.__peak = (ms) => new Promise(res => { const t0 = performance.now(); let pk = 0; const buf = new Float32Array(an.fftSize);
    const tick = () => { an.getFloatTimeDomainData(buf); let e = 0; for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
      pk = Math.max(pk, Math.sqrt(e / buf.length)); performance.now() - t0 < ms ? requestAnimationFrame(tick) : res(+pk.toFixed(5)); }; tick(); });
  if (!window.__stage.replayer.playing) window.__stage.replayer.play();   // 已知 PLAYING 基线
});
await page.waitForTimeout(500);
const recPresent = await page.evaluate(() => !!(window.__stage.sound.engine.recordInfo ?? window.__stage.sound.engine.recordPaused !== undefined));
const rmsPlaying = await page.evaluate(() => window.__peak(700));
const basePlaying = await page.evaluate(() => ({ playing: window.__stage.replayer.playing, recordPaused: window.__stage.sound.engine.recordPaused }));

// [B] 暂停：转台 pause → onPlayState(false) → 声桥 pause → 唱片随带停（引擎 recordPaused 翻真＝接线证据）
await page.evaluate(() => window.__stage.replayer.pause());
await page.waitForTimeout(500);
const roomDuringPause = await page.evaluate(() => window.__peak(1000));   // 房间层（床）照呼吸
const afterPause = await page.evaluate(() => ({ recordPaused: window.__stage.sound.engine.recordPaused, playing: window.__stage.replayer.playing }));

// [C] 恢复：转台 play → onPlayState(true) → 声桥 resume → 续播
await page.evaluate(() => window.__stage.replayer.play());
await page.waitForTimeout(500);
const afterResume = await page.evaluate(() => ({ recordPaused: window.__stage.sound.engine.recordPaused, playing: window.__stage.replayer.playing }));

// [D] DUB 示能：回放有带→ dub-ready
const dubClass = await page.evaluate(() => { const k = document.getElementById('dub-key'); return { ready: k.classList.contains('dub-ready'), locked: k.classList.contains('dub-locked') }; });
await page.screenshot({ path: join(here, '..', 'shots', 'transport.png') });

const verdict = {
  decree: 'FOLEY_DECREE_005 丙 P0-2 单一传动＋暂停改判（席三回归族修复 2026-07-15）',
  A_singleEngine: singleEngine,
  base_playing: basePlaying,                            // 基线：PLAYING 且 recordPaused=false
  B_pause: {
    wired: afterPause.recordPaused === true,            // ← 修：观测效应（接线导到引擎），非 spy 计数
    recordPaused: afterPause.recordPaused,
    replayerPaused: afterPause.playing === false,
    recordPresent: recPresent,
    roomBreathesDuringPause: roomDuringPause,           // 床照呼吸（存在≠内容）
    recordSilenced: rmsPlaying > roomDuringPause,       // 唱片声量随暂停退场（软证）
    rmsPlaying,
  },
  C_resume: { wired: afterResume.recordPaused === false, recordPaused: afterResume.recordPaused, replayerPlaying: afterResume.playing === true },
  D_dubReady: dubClass.ready && !dubClass.locked,
  pageErrors: logs.length,
  pageErrorMsgs: logs,
};
verdict.PASS = verdict.A_singleEngine
  && verdict.base_playing.recordPaused === false
  && verdict.B_pause.wired && verdict.B_pause.recordPaused === true && verdict.B_pause.roomBreathesDuringPause > 0.0005
  && verdict.C_resume.wired && verdict.C_resume.recordPaused === false
  && verdict.D_dubReady && verdict.pageErrors === 0;
console.log(JSON.stringify(verdict, null, 2));
writeFileSync(join(here, '..', 'verdict.json'), JSON.stringify(verdict, null, 2) + '\n');

await browser.close();
serve.kill('SIGINT');
try { rmSync(emptyProjects, { recursive: true, force: true }); } catch { /* 空母带房收摊 */ }
process.exit(verdict.PASS ? 0 : 1);
