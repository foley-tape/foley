// spool 轮转健康检查金测（席三工单二·§3.3·扩编批）：serve.mjs 收工吐卡的 spool 尾随器
// (pollSpool·serve.mjs:279) 的轮转/截断/半行/坏行健康——钩子即发即忘落 events.ndjson，serve 尾随消费，
// spool 被清/轮转须从头重放（出卡幂等·serve.mjs:285），半行等下一拍（:288），坏行跳过不崩（onSpoolLine try）。
//
// 口径：纯 node 驱一枚 hermetic serve（正常模式——replay-only 不背卡片工序 serve.mjs:857；故须正常模式＋
// 隔离 FOLEY_HOME 装 spool＋空 FOLEY_PROJECTS 使 live 子进程空转不产事件），直接改 spool 文件、读 serve
// 持久化的 cursor.json（serve.mjs:294·重启即由此恢复 :300）为观测口。**只测不改 serve.mjs**（尾随器属
// serve 收工吐卡域·测/改分离）。收摊：SIGINT（serve 自杀前 kill live 子进程 serve.mjs:863）。
//
// 诚实边界：cursor.json 只证「读到哪」，不能区分「重启恢复偏移·不重放」与「从头重放又推回同偏移」（二者
// cursor 同值）——重放与否须 side-effect 观测口（wired/card 广播·hermetic 无 SSE 订阅），本测不伪证之，
// 故不含「重启不重放」断言（留待有密闭 side-effect 观测口时补·勿装健康）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const POLL_MS = 1500;                          // serve.mjs startCardDuty 轮询周期
const STABLE_WAIT = POLL_MS + 500;             // 断「稳定不变」须跨足一整轮
const port = 47000 + Math.floor(Math.random() * 200);  // 空档 46300–47600（与 transport-phase 46600–46800 隔 200·避 e4 ≥47700）
const base = `http://127.0.0.1:${port}`;

let serve: ChildProcess;
let HOME_DIR = '', PROJ_DIR = '', SPOOL = '', CURSOR = '';

before(async () => {
  HOME_DIR = mkdtempSync(join(tmpdir(), 'foley-spool-home-'));
  PROJ_DIR = mkdtempSync(join(tmpdir(), 'foley-spool-proj-'));   // 空母带房：live 子进程尾随空目录不产事件
  mkdirSync(join(HOME_DIR, 'spool'), { recursive: true });
  SPOOL = join(HOME_DIR, 'spool', 'events.ndjson');
  CURSOR = join(HOME_DIR, 'spool', 'cursor.json');
  serve = spawn('node', [join(root, 'stage', 'serve.mjs'), String(port)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FOLEY_HOME: HOME_DIR, FOLEY_PROJECTS: PROJ_DIR },
  });
  serve.stderr?.on('data', () => {});
  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('serve 启动超时(10s)')), 10000);
    serve.stdout?.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
    serve.on('exit', c => reject(new Error(`serve 提前退出 ${c}`)));
  });
});

after(() => {
  serve?.kill('SIGINT');
  try { rmSync(HOME_DIR, { recursive: true, force: true }); } catch { /* 收摊 */ }
  try { rmSync(PROJ_DIR, { recursive: true, force: true }); } catch { /* 收摊 */ }
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const size = () => statSync(SPOOL).size;
function cursorOffset(): number | null {
  try { return Number(JSON.parse(readFileSync(CURSOR, 'utf8')).offset); } catch { return null; }
}
// 快等：轮询 cursor 直到达到期望偏移（推进类断言·均值远快于定时 sleep）
async function waitCursor(expected: number, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (cursorOffset() === expected) return; await sleep(100); }
  throw new Error(`cursor 未达 ${expected}（现 ${cursorOffset()}）`);
}
async function serveAlive() {
  return (await fetch(`${base}/rack`)).status === 200;
}
const HELLO = '{"kind":"hello"}\n';           // 接线自证行（onSpoolLine 广播 wired·无副作用落卡）

// 这些子测有序累积（spool 偏移单调推进）——按序读，勿并发。

test('① 无 spool 文件：静候不崩·无 cursor（未接线＝静态服务）', async () => {
  await sleep(STABLE_WAIT);                    // 跨一整轮 poll
  assert.equal(cursorOffset(), null, 'spool 未现时不落 cursor');
  assert.ok(await serveAlive(), 'serve 照常服务 /rack');
});

test('② 追加整行：cursor 推进至文件尾', async () => {
  writeFileSync(SPOOL, HELLO + HELLO);         // 两整行
  await waitCursor(size());
  assert.equal(cursorOffset(), size());
});

test('③ 稳态无重放：文件不动 → cursor 不动（size===offset 即返·不空转推进）', async () => {
  const before = cursorOffset();
  await sleep(STABLE_WAIT);
  assert.equal(cursorOffset(), before, '未变的 spool 不被重复消费');
});

test('④ 半行不吞：末行缺换行 → cursor 不进；补上换行 → 消费推进（:288 只到最后整行）', async () => {
  const before = cursorOffset()!;
  appendFileSync(SPOOL, '{"kind":"hello"}');   // 无尾换行的半行
  await sleep(STABLE_WAIT);
  assert.equal(cursorOffset(), before, '半行等下一拍·不消费');
  appendFileSync(SPOOL, '\n');                  // 补齐 → 成整行
  await waitCursor(size());
  assert.equal(cursorOffset(), size());
});

test('⑤ 轮转/截断重置：文件缩小(size<offset) → 从头重放·cursor 落回新尾（出卡幂等根基·:285）', async () => {
  const bigOffset = cursorOffset()!;
  writeFileSync(SPOOL, HELLO);                  // 换成更小的新文件（轮转）
  const small = size();
  assert.ok(small < bigOffset, '前置：新文件确实更小');
  await waitCursor(small);                      // 若无重置，offset 卡在 bigOffset 永不动
  assert.equal(cursorOffset(), small, '截断即从头重放·offset 归位新尾');
});

test('⑥ 坏行不崩：非 JSON/半 JSON 行被跳过·offset 照进·serve 存活', async () => {
  appendFileSync(SPOOL, 'not json at all\n{bad json\n' + HELLO);
  await waitCursor(size());
  assert.equal(cursorOffset(), size(), '坏行消费但跳过·偏移仍推进');
  assert.ok(await serveAlive(), '坏行不使 serve 崩（onSpoolLine try/catch）');
});
