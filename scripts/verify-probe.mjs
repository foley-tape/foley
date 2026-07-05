// 探针页浏览器验证（SOUND-R3 §4.2 立法：EAR-11 学费法制度化）。
// 清单：①显式跑一帧断言不抛 ②真实鼠标事件（点击/拖动跳转） ③播放中数据钟递增＋黄线像素前进
//       ④每次交互后读 console——全程零异常零 error 才绿。
// 为什么显式帧：无头/后台标签 rAF 被掐——EAR-11 黄线冻死 bug 正是 rAF 首帧抛异常，
// 无头预览测不出（测量盲区收档）；显式调 frame() 让绘制路径的异常无处藏身。
// 为什么大窗口：无头默认 756×469，画布出画→鼠标事件打空（本轮首跑三红的学费）。
// 用法：node scripts/verify-probe.mjs [probe.html 路径，默认 runs/probe-latest/probe.html]
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const PAGE = process.argv[2] || `${process.cwd()}/runs/probe-latest/probe.html`;
const PAGE_URL = PAGE.startsWith('file://') ? PAGE : `file://${PAGE}`;
const PROFILE = `/tmp/foley-verify-chrome-${process.pid}`;

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1440,1000',
  'about:blank',
], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill(); } catch { /* 已退 */ } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let up = false;
for (let i = 0; i < 60 && !up; i++) {
  try { up = (await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok; } catch { /* 未起 */ }
  if (!up) await sleep(250);
}
if (!up) { console.error('FAIL: Chrome 调试端口未起'); process.exit(1); }

const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0; const pending = new Map();
const events = [];
let loadFired = false;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
  if (m.method === 'Page.loadEventFired') loadFired = true;
  if (m.method === 'Runtime.exceptionThrown') events.push({ kind: 'exception', text: m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text });
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
    events.push({ kind: `console.${m.params.type}`, text: m.params.args.map((a) => a.value ?? a.description).join(' ') });
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') events.push({ kind: 'log.error', text: m.params.entry.text });
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
async function evl(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('页内异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await send('Page.navigate', { url: PAGE_URL });
for (let i = 0; i < 40 && !loadFired; i++) await sleep(250);
if (!loadFired) { console.error('FAIL: 页面 load 未触发'); process.exit(1); }
await sleep(500);

const results = [];
const ok = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`); };

// 黄线像素定位（#e0b050 竖线所在列）
const GOLD_X = `(()=>{ const w=cc.width,h=cc.height,d=ccx.getImageData(0,0,w,h).data;
  let best=-1,bestN=0; for(let x=0;x<w;x++){ let n=0; for(let y=0;y<h;y+=3){ const i=(y*w+x)*4;
    if(Math.abs(d[i]-224)<40&&Math.abs(d[i+1]-176)<40&&Math.abs(d[i+2]-80)<40) n++; }
    if(n>bestN){bestN=n;best=x;} } return {x:best,n:bestN}; })()`;

// ① 显式一帧
try { await evl('(()=>{ frame(); return 1; })()'); ok('① 显式 frame() 一帧不抛', true); }
catch (e) { ok('① 显式 frame() 一帧不抛', false, e.message); }

const dur = await evl('dur');
const rect = await evl('(()=>{ const r=cc.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; })()');
const vp = await evl('({vw:innerWidth,vh:innerHeight})');
if (rect.y + rect.h / 2 > vp.vh || rect.x + rect.w > vp.vw) { console.error(`FAIL: 画布出画（rect=${JSON.stringify(rect)} 视口=${JSON.stringify(vp)}）——加大 --window-size`); process.exit(1); }

// ② 点击跳转（停播态）＋黄线落位
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x + rect.w * 0.6, y: rect.y + rect.h / 2, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x + rect.w * 0.6, y: rect.y + rect.h / 2, button: 'left', clickCount: 1 });
await sleep(200);
{
  const prog = await evl(`document.getElementById('prog').textContent`);
  ok('② 画布点击跳转（60%）', Math.abs(parseInt(prog) - Math.round(dur * 0.6 / 1000)) <= Math.ceil(dur / 50000), `prog="${prog}"`);
  const g = await evl(GOLD_X);
  ok('②b 黄线像素落位', Math.abs(g.x - rect.w * 0.6) <= rect.w * 0.03, `x=${g.x}/${Math.round(rect.w * 0.6)}`);
}
// ②c 拖动跳转
{
  const y = rect.y + rect.h / 2, x1 = rect.x + rect.w * 0.30, x2 = rect.x + rect.w * 0.25;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 5; i++) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + (x2 - x1) * i / 5, y, button: 'left' });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y, button: 'left', clickCount: 1 });
  await sleep(200);
  const prog = await evl(`document.getElementById('prog').textContent`);
  ok('②c 画布拖动跳转（→25%）', Math.abs(parseInt(prog) - Math.round(dur * 0.25 / 1000)) <= Math.ceil(dur / 50000), `prog="${prog}"`);
}

// ③ 播放（await 解码）＋数据钟递增＋黄线前进＋唱片装盘
await evl('(async()=>{ speed=60; await start(); return 1; })()');
await sleep(400);
const pm1 = await evl('window.__probe.playMs()');
await sleep(900);
const pm2 = await evl('window.__probe.playMs()');
ok('③ 播放中 playMs 递增', pm2 > pm1 && pm2 - pm1 > 20000, `ac=${await evl('window.__probe.acState()')} pm ${Math.round(pm1)}→${Math.round(pm2)}`);
{
  let moved = false, detail = '';
  try {
    await evl('(()=>{ frame(); return 1; })()');
    const g1 = await evl(GOLD_X);
    await sleep(700);
    await evl('(()=>{ frame(); return 1; })()');
    const g2 = await evl(GOLD_X);
    moved = g2.x > g1.x; detail = `x ${g1.x}→${g2.x}`;
  } catch (e) { detail = e.message; }
  ok('③b 黄线像素随播放前进（显式帧法）', moved, detail);
}
ok('③c 唱片装盘', JSON.stringify(await evl('window.__probe.record()')) !== 'null', JSON.stringify(await evl('window.__probe.record()')));
// ③e 显式触发前景（闷弦→pluck 路径）：60× 窗口可能恰无事件——调度路径的异常不许有处可藏
// （NIGHT-2 coreDegreeHz 案：别名剥失=首个拨弦 ReferenceError、调度链断，本断言即其回归测试）
try { await evl('(()=>{ engine.trigger(1, ac.currentTime + 0.05, 2, 0.7); engine.trigger(0, ac.currentTime + 0.1, 1, 0.5); return 1; })()'); ok('③e 显式前景触发不抛（pluck 双型）', true); }
catch (e) { ok('③e 显式前景触发不抛（pluck 双型）', false, e.message); }
await sleep(300);
await evl('(()=>{ stopPlay(); return 1; })()');
await sleep(400);
ok('③d 停止后 isPlaying=false', (await evl('window.__probe.isPlaying()')) === false);

// ④ 全程零异常
if (events.length) events.forEach((e) => console.log(`  ⚠ [${e.kind}] ${e.text}`));
ok('④ 全程零异常零 console 错误', events.length === 0, `收集 ${events.length} 条`);

const failed = results.filter((r) => !r.pass);
console.log(`\n== 探针页浏览器验证：${results.length - failed.length}/${results.length} 绿${failed.length ? '，红：' + failed.map((f) => f.name).join('、') : ''} ==`);
try { await send('Browser.close'); } catch { /* 已关 */ }
process.exit(failed.length ? 1 : 0);
