// transport 相位穷举转移金测（席三工单二·§3.2·扩编批·夜审 D-8 同族）：serve.mjs 服务端 transport
// 状态机 (EMPTY/CUEING/PLAYING/PAUSED × select/play/pause/eject) 全格黑盒转移表钉死。
//
// 口径：纯 node 驱一枚 hermetic serve——`--replay-only`（无 live 子进程、无启动自装带 → 静息 EMPTY、
// 消 live 自装 CUEING 竞态·勘误录#15），fetch 走同源 HTTP。**只测不改 serve.mjs**（服务端相位机属席二
// 状态机域·测/实分离），故不提纯为 -law 模块（提纯须改 serve，越界）；黑盒驱动是本族的正身。
//
// ⚠ CUEING 期 select 被拒（400·不排队）＝复盘§二.2 记录之产品级脆弱（deep-link mount 侥幸不发）。本测
//   钉「现行＝拒」。若席二/架构师改判「排队而非拒」（产品处方），此断言会红——**这正是回归闸的用途**：
//   让状态语义的改动显形并被自觉复核，而非默默漂移。改行为即改此断言，二者同刀。
//
// chromium 无关（纯 node·CI 任意跑）。收摊：serve 直属子进程 SIGINT 收（禁 pkill·手令甲.3）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CUE_FADE_MS = 460;                       // serve.mjs 同源常量（切带节拍窗）
const SETTLE = CUE_FADE_MS + 220;              // 等节拍落定的余量
const port = 46600 + Math.floor(Math.random() * 200);  // 空档 46300–47600（避 cards/p0-2 repro ≤46200·spool 47000+）
const base = `http://127.0.0.1:${port}`;

let serve: ChildProcess;
let token = '';
let TAPE = '';                                  // 一张确实在架的 demo 带（黑盒选取·不硬编码具体名）

before(async () => {
  serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port), '--replay-only'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  });
  serve.stderr?.on('data', () => {});
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('serve 启动超时(10s)')), 10000);
    serve.stdout?.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
    serve.on('exit', c => reject(new Error(`serve 提前退出 ${c}`)));
  });
  const html = await (await fetch(`${base}/`)).text();               // 令牌只经同源 HTML meta 暴露
  token = (html.match(/name="dub-token" content="([^"]+)"/) ?? [])[1] ?? '';
  assert.ok(token, '本次启动 dub-token 应注入 /index.html <head>');
  const r = await rack();
  TAPE = r.rack.find((i: { kind: string }) => i.kind === 'demo')?.id ?? '';
  assert.ok(TAPE, '至少一张 demo 带在架（fixtures 齐）');
});

after(() => { serve?.kill('SIGINT'); });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rack = async () => (await (await fetch(`${base}/rack`)).json());
const snap = async () => (await rack()).transport;
const phase = async () => (await snap()).phase;

// POST /transport/{action}（默认带令牌）；返 {status, body}
async function act(action: string, bodyObj?: object, withToken = true) {
  const res = await fetch(`${base}/transport/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(withToken ? { 'x-dub-token': token } : {}) },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined,
  });
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, body };
}
// eject 任何相→EMPTY（幂等复位）
async function toEmpty() { await act('eject'); assert.equal(await phase(), 'EMPTY'); }
// 驱到 PLAYING：select→CUEING→(等节拍)→PLAYING
async function toPlaying() {
  await toEmpty();
  const r = await act('select', { tape: TAPE });
  assert.equal(r.status, 200);
  assert.equal(r.body.phase, 'CUEING');
  await sleep(SETTLE);
  assert.equal(await phase(), 'PLAYING');
}
// 驱到 PAUSED：PLAYING→pause
async function toPaused() { await toPlaying(); await act('pause'); assert.equal(await phase(), 'PAUSED'); }

// ── 常量护栏：相位枚举与 serve 同源 ──
test('相位枚举 phases 四态齐（serve 单调枚举·rule 4）', async () => {
  assert.deepEqual((await snap()).phases, ['EMPTY', 'CUEING', 'PLAYING', 'PAUSED']);
});

// ── 从 EMPTY 出发 ──
test('EMPTY×select(有效)：→CUEING(locked·selected 即刻)→节拍→PLAYING(loaded/live/cursor 归位)', async () => {
  await toEmpty();
  const r = await act('select', { tape: TAPE });
  assert.equal(r.status, 200);
  assert.equal(r.body.phase, 'CUEING');
  assert.equal(r.body.locked, true, 'CUEING 期键锁真（rule 1）');
  assert.equal(r.body.selected, TAPE, '选中即刻广播（rule 2）');
  assert.equal(r.body.loaded, null, 'CUEING 尚未装带');
  assert.equal(r.body.paused, false);
  await sleep(SETTLE);
  const p = await snap();
  assert.equal(p.phase, 'PLAYING');
  assert.equal(p.loaded, TAPE, '节拍到＝装带上机');
  assert.equal(p.live, false, 'demo 带非 live');
  assert.equal(p.cursor, 0, '上机游标归零');
  assert.equal(p.locked, false, '离 CUEING 解锁');
  assert.equal(p.paused, false);
});
test('EMPTY×select(不在架)：400·态不动', async () => {
  await toEmpty();
  const r = await act('select', { tape: '__不存在的带__' });
  assert.equal(r.status, 400);
  assert.equal(await phase(), 'EMPTY');
});
test('EMPTY×play：no-op·态不动·seq 不动（真 no-op 不空播）', async () => {
  await toEmpty();
  const s0 = (await snap()).seq;
  const r = await act('play');
  assert.equal(r.status, 200);
  assert.equal(await phase(), 'EMPTY');
  assert.equal((await snap()).seq, s0, 'play 于非 PAUSED 不推态');
});
test('EMPTY×pause：no-op·态不动·seq 不动', async () => {
  await toEmpty();
  const s0 = (await snap()).seq;
  await act('pause');
  assert.equal(await phase(), 'EMPTY');
  assert.equal((await snap()).seq, s0, 'pause 于非 PLAYING 不推态');
});

// ── 从 CUEING 出发（闭锁期语义·§3.2 重点面）──
test('CUEING×select(有效)：400 被拒——闭锁不接新指令（复盘§二.2 记录之现行脆弱·改判即改此断言）', async () => {
  await toEmpty();
  await act('select', { tape: TAPE });               // → CUEING
  assert.equal(await phase(), 'CUEING');
  const r = await act('select', { tape: TAPE });     // 460ms 内再投（本地 fetch ~ms·远早于节拍）
  assert.equal(r.status, 400, 'CUEING 期 select 现行＝拒（非排队）');
  await act('eject');                                 // 收摊·不等残余节拍
});
test('CUEING×play/pause：no-op·仍 CUEING（键锁·rule 1）', async () => {
  await toEmpty();
  await act('select', { tape: TAPE });
  await act('play');  assert.equal(await phase(), 'CUEING');
  await act('pause'); assert.equal(await phase(), 'CUEING');
  await act('eject');
});
test('CUEING×eject：→EMPTY·且撤销节拍器（460ms 后仍 EMPTY＝残余 timer 未偷跳 PLAYING）', async () => {
  await toEmpty();
  await act('select', { tape: TAPE });
  assert.equal(await phase(), 'CUEING');
  await act('eject');
  assert.equal(await phase(), 'EMPTY');
  await sleep(SETTLE);                                // 若 eject 未 clearTimeout，残余节拍会把相位偷跳 PLAYING
  assert.equal(await phase(), 'EMPTY', 'eject 须撤销 cueTimer·不留悬空跳相');
});

// ── 从 PLAYING 出发 ──
test('PLAYING×select(有效)：重新入带 →CUEING→PLAYING', async () => {
  await toPlaying();
  const r = await act('select', { tape: TAPE });
  assert.equal(r.status, 200);
  assert.equal(r.body.phase, 'CUEING');
  await sleep(SETTLE);
  assert.equal(await phase(), 'PLAYING');
});
test('PLAYING×play：no-op·仍 PLAYING·seq 不动', async () => {
  await toPlaying();
  const s0 = (await snap()).seq;
  await act('play');
  assert.equal(await phase(), 'PLAYING');
  assert.equal((await snap()).seq, s0);
});
test('PLAYING×pause：→PAUSED(paused=true)·seq 进', async () => {
  await toPlaying();
  const s0 = (await snap()).seq;
  const r = await act('pause');
  assert.equal(r.status, 200);
  const p = await snap();
  assert.equal(p.phase, 'PAUSED');
  assert.equal(p.paused, true);
  assert.ok(p.seq > s0, '真转移推态·seq 单调进');
});
test('PLAYING×eject：→EMPTY·字段全清（selected/loaded/cursor/paused/live 归零）', async () => {
  await toPlaying();
  await act('eject');
  const p = await snap();
  assert.equal(p.phase, 'EMPTY');
  assert.equal(p.selected, null);
  assert.equal(p.loaded, null);
  assert.equal(p.cursor, 0);
  assert.equal(p.paused, false);
  assert.equal(p.live, false);
});

// ── 从 PAUSED 出发 ──
test('PAUSED×play：→PLAYING(paused=false)·续播', async () => {
  await toPaused();
  const r = await act('play');
  assert.equal(r.status, 200);
  const p = await snap();
  assert.equal(p.phase, 'PLAYING');
  assert.equal(p.paused, false);
});
test('PAUSED×pause：no-op·仍 PAUSED·seq 不动', async () => {
  await toPaused();
  const s0 = (await snap()).seq;
  await act('pause');
  assert.equal(await phase(), 'PAUSED');
  assert.equal((await snap()).seq, s0);
});
test('PAUSED×select(有效)：→CUEING→PLAYING(清暂停)', async () => {
  await toPaused();
  await act('select', { tape: TAPE });
  await sleep(SETTLE);
  const p = await snap();
  assert.equal(p.phase, 'PLAYING');
  assert.equal(p.paused, false);
});
test('PAUSED×eject：→EMPTY', async () => {
  await toPaused();
  await act('eject');
  assert.equal(await phase(), 'EMPTY');
});

// ── HTTP 契约面（同源令牌闸·非法动作）──
test('无令牌：任何 transport POST → 403（同源写闸·跨站取不到令牌）', async () => {
  const r = await act('eject', undefined, /* withToken */ false);
  assert.equal(r.status, 403);
});
test('未知动作：→400（select/play/pause/eject 之外）', async () => {
  const r = await act('frobnicate');
  assert.equal(r.status, 400);
});
