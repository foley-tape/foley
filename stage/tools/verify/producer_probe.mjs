// 生产者心跳·浏览器验收器（席二 D2 复审二·issue 2/5）：
//   **完全合成·完全隔离**——不起真 Claude、不碰 ~/.claude/projects（issue 5：与真实 Claude 历史彻底隔离）；
//   victim 进程供真 PID（kill -0 真死），合成 transcript 供活动（引擎产包→link=live→REC 可靠亮），
//   隔离 FOLEY_HOME/FOLEY_PROJECTS 于 tmp。验证**完整轨迹**（issue 2·全程无空过）：
//   订 SSE 记 producer 全序＋rec 全序；杀前断言 REC 真亮（producer=alive∧rec-live），杀后 REC 灭。
//   案 kill：SIGKILL victim → 宽限窗满无 session-end → dead ＋ Source Gone 死相；轨迹 alive→dead。
//   案 ended：写 session-end 行（模拟收工钩子·同 sessionId）→ ended·无死相；轨迹 alive→ended·**全程零 dead**。
//   —— SIGTERM 跑真钩子→ended 的协议正确性由金测 PROD-5/7/8 确定性验；此处验页面 DOM 对 producer 死的响应轨迹。
//   node stage/tools/verify/producer_probe.mjs [--case kill|ended|all]
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, realpathSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const CASE = (() => { const i = process.argv.indexOf('--case'); return i >= 0 ? process.argv[i + 1] : 'all'; })();
const require_ = createRequire(join(root, 'audit/tools/package.json'));
const { chromium } = require_('playwright-core');
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const psCommand = (pid) => { try { return execSync(`ps -o command= -p ${pid}`, { encoding: 'utf8', timeout: 1500 }).trim(); } catch { return 'sleep 300'; } };

// 合成 tool_use 对（新鲜时间戳·避歇场）——引擎尾随即产状态包→link=live→REC 亮
function actLines(sessionId, u) {
  const b = { parentUuid: null, isSidechain: false, userType: 'external', cwd: '/tmp/prodprobe', sessionId, version: '2.1.209' };
  const t = Date.now();
  return [
    JSON.stringify({ ...b, type: 'assistant', timestamp: new Date(t).toISOString(), uuid: `pa${u}`, message: { id: `pm${u}`, type: 'message', role: 'assistant', model: 'probe', content: [{ type: 'tool_use', id: `ptu${u}`, name: 'Bash', input: { command: `echo ${u}` } }] } }),
    JSON.stringify({ ...b, type: 'user', timestamp: new Date(t + 250).toISOString(), uuid: `pu${u}`, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `ptu${u}`, content: [{ type: 'text', text: 'ok' }] }] }, toolUseResult: { stdout: 'ok' } }),
  ].join('\n') + '\n';
}

// 手势点先验真空白（坑册 #2）：避 #deck 等命中区（点它们＝播放/暂停·与 POST 竞速）
async function blankGesture(page) {
  const cand = [[1150, 80], [1180, 60], [1120, 100], [980, 60]];
  const hitIds = ['deck', 'servo-knob', 'song-keys', 'dub-key', 'dub-tags', 'rack', 'selector', 'reel-l', 'reel-r'];
  const g = await page.evaluate(({ cand, hitIds }) => {
    for (const [x, y] of cand) { const el = document.elementFromPoint(x, y); const id = el?.closest?.('[id]')?.id ?? ''; if (!hitIds.includes(id)) return { x, y, closestId: id }; }
    return { x: cand[0][0], y: cand[0][1], closestId: '?' };
  }, { cand, hitIds });
  await page.mouse.click(g.x, g.y);
  return g;
}

async function runCase(mode) {   // 'kill' | 'ended'
  const home = mkdtempSync(join(tmpdir(), 'prodprobe-home-'));
  const projects = mkdtempSync(join(tmpdir(), 'prodprobe-proj-'));
  const pdir = join(projects, '-prodprobe'); mkdirSync(pdir, { recursive: true });
  const sessionId = 'prodprobe-' + Math.random().toString(36).slice(2, 8);
  const tape = join(pdir, 'probe.jsonl');
  let uid = 0;
  writeFileSync(tape, actLines(sessionId, ++uid) + actLines(sessionId, ++uid) + actLines(sessionId, ++uid));   // 3 对活动史（新鲜·未歇场）
  const tapeKey = realpathSync(tape);
  const victim = spawn('sleep', ['300'], { stdio: 'ignore' });
  // 手写 session-start（victim PID + 合成 transcript）到隔离 spool——不经真钩子（issue 5：无真 Claude）
  const spoolDir = join(home, 'spool'); mkdirSync(spoolDir, { recursive: true });
  const spoolFile = join(spoolDir, 'events.ndjson');
  appendFileSync(spoolFile, JSON.stringify({ v: 1, at: Date.now(), kind: 'session-start', sessionId, transcriptPath: tapeKey, source: 'startup', pid: victim.pid, pidCommand: psCommand(victim.pid) }) + '\n');
  // serve --raw 合成 transcript（隔离 FOLEY_HOME/PROJECTS 于 tmp·不扫真母带房）
  const port = 45880 + Math.floor(Math.random() * 19);
  const serveLog = [];
  const serve = spawn(process.execPath, [join(root, 'stage', 'serve.mjs'), String(port), '--raw', tapeKey],
    { env: { ...process.env, FOLEY_HOME: home, FOLEY_PROJECTS: projects, FOLEY_VERBOSE: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  serve.stdout.on('data', (d) => serveLog.push(String(d)));
  serve.stderr.on('data', (d) => serveLog.push(String(d)));
  const bse = `http://127.0.0.1:${port}`;
  const transportOf = async () => { try { return await (await fetch(bse + '/transport')).json(); } catch { return null; } };
  for (let i = 0; i < 40; i++) { await sleep(250); const t = await transportOf(); if (t?.phase === 'PLAYING') break; }
  // 活动注入器：合成 tool_use 对 → 合成 transcript（引擎产包·link live·REC 亮）·producer 死后仍流（REC 仍随 producer 熄=更强）
  const actTimer = setInterval(() => { try { appendFileSync(tapeKey, actLines(sessionId, ++uid)); } catch { /* 暂锁下拍再来 */ } }, 700);

  const browser = await chromium.launch({ executablePath: autodetectChromium(), headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(bse + '/?machine', { waitUntil: 'domcontentloaded' });
  await sleep(1200);
  const gesture = await blankGesture(page);
  await sleep(5200);   // POST 让位
  const domState = () => page.evaluate(() => ({ rec: document.body.classList.contains('rec-live'), signal: document.getElementById('room')?.dataset.signal ?? null, machine: window.__stage?.machine ?? null }));

  // 全轨迹监听（issue 2）：订 SSE 记 producer 全序＋rec 全序——从上机到死，无采样缝隙
  await page.evaluate(() => {
    window.__seq = []; window.__recSeq = [];
    const es = window.__stage?.live?.es;
    if (es) es.addEventListener('transport', (e) => { try { window.__seq.push(JSON.parse(e.data).producer); } catch { /* 坏包 */ } });
    window.__recTimer = setInterval(() => { window.__recSeq.push(document.body.classList.contains('rec-live')); }, 120);   // rec-live 全程快采（steady 亮态也采到·非只在跳变时）
  });

  // 等 REC 真亮（等待条件律·不赌固定睡眠）：合成活动可靠点亮
  let before = { transport: await transportOf(), dom: await domState() };
  { const tw = Date.now(); while (Date.now() - tw < 25000 && !(before.dom.rec === true && before.transport?.producer === 'alive')) { await sleep(400); before = { transport: await transportOf(), dom: await domState() }; } }
  const recLitBefore = before.dom.rec === true && before.transport?.producer === 'alive';

  const want = mode === 'kill' ? 'dead' : 'ended';
  if (mode === 'ended') appendFileSync(spoolFile, JSON.stringify({ v: 1, at: Date.now(), kind: 'session-end', sessionId, transcriptPath: tapeKey, reason: 'other' }) + '\n');   // 模拟收工钩子（同 sessionId）
  victim.kill('SIGKILL');
  const t0 = Date.now(); let hitAt = null;
  while (Date.now() - t0 < 9000) { const t = await transportOf(); if (t?.producer === want) { hitAt = Date.now() - t0; break; } await sleep(200); }
  await sleep(1200);   // SSE→DOM 一拍＋确认不回跳
  const after = await domState();
  const producerSeq = await page.evaluate(() => window.__seq || []);
  const recSeq = await page.evaluate(() => window.__recSeq || []);
  const deadFlash = producerSeq.includes('dead');
  const recWasLit = recSeq.includes(true), recEndedOff = after.rec === false;
  const noFlashOk = mode === 'kill' ? true : !deadFlash;   // ended：全程零 dead 才算无竞态

  const verdict = { mode, sessionId, gesture,
    before: { producer: before.transport?.producer, rec: before.dom.rec, power: before.dom.machine?.S?.power, link: before.dom.machine?.S?.link },
    recLitBefore, producerSeq, recWasLit, producerBecameMs: hitAt, want, recAfter: after.rec, signalAfter: after.signal, deadFlash };
  verdict.PASS = recLitBefore && recWasLit && recEndedOff && hitAt !== null && hitAt <= 5000 && noFlashOk &&
    (mode === 'kill' ? after.signal === 'dead' : after.signal !== 'dead');
  if (!recLitBefore) verdict.vacuous = '杀前 REC 未亮（producer≠alive 或 rec-live=false）——本案空过，判 FAIL';
  if (mode === 'ended' && deadFlash) verdict.raceFlash = 'ended 轨迹含 dead——竞态/代际未消，判 FAIL';

  clearInterval(actTimer);
  await browser.close();
  try { victim.kill('SIGKILL'); } catch { /* 已亡 */ }
  try { serve.kill('SIGTERM'); } catch { /* 已亡 */ }
  rmSync(home, { recursive: true, force: true });
  rmSync(projects, { recursive: true, force: true });
  verdict.serveLogTail = serveLog.join('').split('\n').filter(Boolean).slice(-6);
  return verdict;
}

const out = { probe: 'producer_probe（席二 D2 复审二·完全合成隔离·完整轨迹）' };
if (CASE === 'kill' || CASE === 'all') out.kill = await runCase('kill');
if (CASE === 'ended' || CASE === 'all') out.ended = await runCase('ended');
out.PASS = [out.kill, out.ended].every((c) => !c || c.PASS);
console.log(JSON.stringify(out, null, 2));
process.exit(out.PASS ? 0 : 1);
