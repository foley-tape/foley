// stage 服务器 —— 静态件 ＋ live 中继（M-S3）。零依赖，运行时零外网（localhost 即舞台后台）。
//
//   node stage/serve.mjs [port] [--replay-only] [--raw <jsonl>]
//
// live 为默认模式：起动即生 `cli live`（Track-FIX 真 20Hz 广播，stdout NDJSON），
// 经 /live SSE 中继进浏览器。--replay-only 时只当静态服务器（性格照/回放捕捉用）。
// 中继与钟都不依赖标签页可见性——藏页照走（M2.0 §2 验证件二）。
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readdirSync, statSync, readFileSync, openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const root = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = dirname(root.replace(/\/$/, ''));

const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a)) ?? process.env.PORT ?? 4173);
const replayOnly = args.includes('--replay-only');
const rawIdx = args.indexOf('--raw');
const rawPath = rawIdx >= 0 ? args[rawIdx + 1] : null;
// E1 首光·终端静音化（第五号手令 丁-E1）：默认只两行（监听中＋URL）；机器内务（boot/card/dub/live）
// 一律归 --verbose（或 FOLEY_VERBOSE=1）。卡片产出的宣告归舞台（SSE 'card'→台上撕卡），不归终端。
const verbose = args.includes('--verbose') || process.env.FOLEY_VERBOSE === '1';
const vlog = (...a) => { if (verbose) console.log(...a); };

// ── 写盘鉴权（NIGHT-2 §0.6 安全组合拳；原刀=Track-RELEASE 安全批，M2.4 §C 扩展至换声端点）──
// ③ 每次启动随机令牌：同源页面经注入的 <meta name="dub-token"> 取用；跨站 JS 读不到同源 DOM/HTML，
//    故拿不到令牌 → 写盘端点拒。与 ② 绑 127.0.0.1（断局域网面）、① 落盘名白名单三闸叠加。
const DUB_TOKEN = randomBytes(18).toString('base64url');
const ORIGIN_OK = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
// ④ Host 白名单（M2.6 P1-④/乙-F5）：绑定 127.0.0.1 只断局域网，DNS-rebinding 恰好解析回 127.0.0.1——
//    rebind 的**写**面由 Origin 白名单挡，**读**面（GET 全部端点）此前零校验。此闸一处兜全：
//    Host 非 {localhost,127.0.0.1}:port 一律 403（缺省拒），读写皆过此门。
const HOST_OK = new Set([`localhost:${port}`, `127.0.0.1:${port}`]);

// 同源 + 令牌双闸（W-1＋§0.6.③，一律缺省拒）：Origin 若在场必须白名单内；令牌必须逐启动匹配。
function writeAuthed(req) {
  const origin = req.headers['origin'];
  if (origin && !ORIGIN_OK.has(origin)) return false;   // 跨站显式拒
  return req.headers['x-dub-token'] === DUB_TOKEN;       // 令牌缺省拒（跨站取不到 → 空/错皆拒）
}

// 落盘名清洗（§0.6.①④，save 与 save-bin 同一把刀）：只留标识符字符，折叠 ..，不以 . - 起头（防隐藏文件/穿越）。
function safeStem(s, fallback) {
  const c = String(s ?? fallback).replace(/[^\w.-]/g, '_').replace(/\.{2,}/g, '_').replace(/^[.\-]+/, '');
  return c || fallback;
}
const KIND_OK = new Set(['mp4', 'webm', 'gif', 'png', 'poster.png', 'meta.json']); // save-bin 扩展名白名单（meta.json：hero 记账，M2.5）

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// ── B4 factory 缓存回退（M2.6 丙·乙-②：打包态出厂唱片/床音回退位）──
// npm 包 files 白名单排除 sound/records/*.mp3 与 sound/assets/*.wav（真身走 Releases，见 package.json）。
// 用户经 `foley records fetch` 明示同意后落 ~/.foley/{records,assets}/factory/（与 records-fetch.ts 同位）。
// serve 静态根只见 repo；打包态 mp3/wav 缺件 → 页面声桥一律 404（B4：dev 被 vendored 掩蔽故此前漏网）。
// 修：/records/**、/sound/assets/** 于 repo 缺件时回退 factory 缓存——沿用既有 Host/DoS 闸，另加三重闸：
//   ① 只读（readFile）；② 路径已 normalize＋decodeURIComponent（DoS 闸内，穿越序列此前已折叠出前缀）；
//   ③ 文件名**白名单**（catalog/manifest 之 file 字段的确切扁平名）＋落盘目录 fence 前缀校验。
//   白名单是命门：factory 目录用户可写，只有清单在册的扁平文件名才放行——挡任意读、穿越、投毒件。
const RECORDS_FACTORY = join(homedir(), '.foley', 'records', 'factory');
const ASSETS_FACTORY = join(homedir(), '.foley', 'assets', 'factory');
function loadAudioWhitelist() {
  const rec = new Set(), ast = new Set();
  try {
    const c = JSON.parse(readFileSync(join(repoRoot, 'sound', 'records', 'catalog.json'), 'utf8'));
    for (const r of c.records ?? []) if (typeof r.file === 'string') rec.add(r.file);
  } catch { /* 清单缺 → records 白名单空（fail-closed：factory 一件不供） */ }
  try {
    const m = JSON.parse(readFileSync(join(repoRoot, 'sound', 'assets', 'manifest.json'), 'utf8'));
    for (const a of m.assets ?? []) if (typeof a.file === 'string') ast.add(a.file);
  } catch { /* 同上 */ }
  return { rec, ast };
}
const AUDIO_WL = loadAudioWhitelist();
// 打包态回退候选：仅白名单内的扁平文件名，映到对应 factory 目录（其自身即 fence）。非白/穿越/空 → null。
function factoryFallback(p) {
  if (p.startsWith('/records/')) {
    const base = p.slice('/records/'.length);
    if (AUDIO_WL.rec.has(base)) return { file: join(RECORDS_FACTORY, base), fence: RECORDS_FACTORY };
  } else if (p.startsWith('/sound/assets/')) {
    const base = p.slice('/sound/assets/'.length);
    if (AUDIO_WL.ast.has(base)) return { file: join(ASSETS_FACTORY, base), fence: ASSETS_FACTORY };
  }
  return null;
}

// ── G8 空盘自举（M2.6 热修·前置静音雷）──
// bare 起播（live 默认）时若最近会话**缺席或已歇场**，机器只能诚实地播「沉睡」：针零、纸平、无声——
// 开箱第一分钟成死机观感。裁：正门（裸 `/`，无 query）302 落厂演示卷 `?tape=storm&speed=8`
// （URL 明示演示带＋倍速，素材诚实；live 视图 `/?mode=live` 照旧可达）。带任何 query 尊重来意。
// FOLEY_PROJECTS 供测试/CI 指别处会话根。
const FRESH_MS = 15 * 60 * 1000;
function newestJsonlMtime(dir) {
  let best = -1, entries;
  try { entries = readdirSync(dir, { recursive: true }); } catch { return -1; }
  for (const e of entries) {
    if (typeof e !== 'string' || !e.endsWith('.jsonl')) continue;
    try { const m = statSync(join(dir, e)).mtimeMs; if (m > best) best = m; } catch { /* 消失即略 */ }
  }
  return best;
}
let demoBoot = false;
if (!replayOnly && !rawPath) {
  const newest = newestJsonlMtime(process.env.FOLEY_PROJECTS ?? join(homedir(), '.claude', 'projects'));
  demoBoot = newest < 0 || Date.now() - newest > FRESH_MS;
  if (demoBoot) vlog(`[boot] 最近会话${newest < 0 ? '缺席' : '已歇场(>15min)'} → 正门上厂演示卷 storm@8×（live 视图 /?mode=live 照旧）`);
}

// ---- live 中继：child stdout NDJSON → SSE 扇出（写出即丢，bounded 纪律同源）----
const clients = new Set();
let lastState = null; // 新客户端接入先喂末态，器件即刻上弦
let liveChild = null;
let liveOutDir = null; // 今晨的纸：live 产物流目录（追赶史＋实时追加）

function broadcast(line) {
  for (const res of clients) res.write(`data: ${line}\n\n`);
}
function broadcastEvent(name, obj) { // 具名 SSE（card/wired 等旁路通告；state/moment 主流照旧走 broadcast）
  for (const res of clients) res.write(`event: ${name}\ndata: ${JSON.stringify(obj)}\n\n`);
}

// ── 收工吐卡（轨乙①，三号手令·丁）：spool 尾随 → 蒸馏（默认脱敏）→ 引擎回放出纸 → 页面撕卡 ──
// 钩子（cli/hook.ts）即发即忘落 spool/events.ndjson；这里尾随消费：resume 不落卡（延续不是终章），
// clear 落卡（清屏即翻章）；每 session_id 去重，后卡替前卡（同工位覆盖写）。
// $HOME 读写面纪律（与 B4 裁定同款）：sid 白名单正则＋文件名白名单，无路径拼接自由度；
// 读面只此两文件（curve/moments.csv），写面只经 /card/save（Origin+令牌同一把刀）。
// FOLEY_HOME 供测试/CI 指别处（缺省 ~/.foley）；多 serve 共读一 spool 的 cursor 竞争记 FEEDBACK 在案。
const FOLEY_HOME = process.env.FOLEY_HOME ?? join(homedir(), '.foley');
const SPOOL_EVENTS = join(FOLEY_HOME, 'spool', 'events.ndjson');
const SPOOL_CURSOR = join(FOLEY_HOME, 'spool', 'cursor.json');
const CARDS_DIR = join(FOLEY_HOME, 'cards');
const CARD_SID = /^[\w-]{4,64}$/;
const cardJobs = new Map(); // sid → { transcript }（后到替前＝去重）
let cardBusy = false;
let spoolOffset = 0;
let spoolPolling = false;

function onSpoolLine(line) {
  let e;
  try { e = JSON.parse(line); } catch { return; }
  if (e.kind === 'hello') {
    vlog('[card] 接线自证 hello 到站——钩子→spool→serve 全线通');
    broadcastEvent('wired', { ok: 1 });
    return;
  }
  if (e.kind !== 'session-end') return;
  if (e.reason === 'resume') return; // 延续不是终章（三号手令·丁-轨乙裁定）
  const sid = String(e.sessionId ?? '').replace(/[^\w-]/g, '').slice(0, 64);
  const transcript = String(e.transcriptPath ?? '');
  if (!CARD_SID.test(sid) || !transcript) return;
  cardJobs.set(sid, { transcript });
}

function runStep(args, timeoutMs) { // 卡片工序子进程（蒸馏/回放）：退码非零即抛，超时格杀
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', d => { err += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve(); else reject(new Error(`退 ${code}：${err.slice(-300)}`));
    });
  });
}

async function makeCard(sid, job) {
  if (!existsSync(job.transcript)) throw new Error('原始件已不在');
  const dir = join(CARDS_DIR, sid);
  await mkdir(dir, { recursive: true });
  const tape = join(dir, 'session.tape.jsonl');
  // 脱敏单一大脑在轨丙：这里只调用 distill 默认口径（P1-①），不自造尺
  await runStep(['cli/index.ts', 'distill', job.transcript, tape], 60000);
  await runStep(['cli/index.ts', 'replay', tape, '--out', dir, '--hz', '20'], 120000);
  await rm(join(dir, 'card.png'), { force: true });       // 后卡替前卡：旧卡作废，工位回到待撕
  await rm(join(dir, 'card.skip.json'), { force: true });
  try { await writeRackMeta(dir, tape, job.transcript); } catch { /* 标签失败不阻出卡 */ }
}

// 卡带架标签（丁-E2 → P0-4 诚实版）：仓名（源路径末段）＋开场白截断（母带首条真人发言——
// 母带教义：本地货架读母带，真话合法）＋动作电报（开场白缺席时的回退）＋时长（走带轴）。
async function writeRackMeta(dir, tapeFile, transcript) {
  const enc = dirname(transcript).split(/[\\/]/).filter(Boolean).pop() || '';
  const repo = enc.split('-').filter(Boolean).pop() || 'session';    // -Users-shadow-tape0 → tape0
  const opening = openingLine(transcript) ?? '';
  let summary = '会话录音';
  try {
    const lines = (await readFile(tapeFile, 'utf8')).split('\n').slice(1, 60); // 跳 meta 行
    const verbs = [];
    for (const l of lines) {
      try { const m = JSON.parse(l); const v = m.verb && m.verb !== 'OTHER' ? m.verb : m.special; if (v && !verbs.includes(v)) verbs.push(v); } catch { /* 坏行 */ }
      if (verbs.length >= 3) break;
    }
    if (verbs.length) summary = verbs.join(' · ');   // 如 "READ · EDIT · RUN"（机器语汇·无原文）
  } catch { /* 读不到就用回退 */ }
  await writeFile(join(dir, 'rack.json'), JSON.stringify({ repo, opening, summary, seconds: stageDurationSec(join(dir, 'curve.csv')) }) + '\n');
}

async function drainCardJobs() {
  if (cardBusy) return;
  cardBusy = true;
  try {
    while (cardJobs.size > 0) {
      const [sid, job] = cardJobs.entries().next().value;
      cardJobs.delete(sid);
      try {
        await makeCard(sid, job);
        broadcastEvent('card', { sid });   // 宣告归舞台：台上撕卡（不喧哗终端）
        vlog(`[card] ${sid.slice(0, 8)}… 纸已备好（候台上撕卡）`);
      } catch (err) {
        vlog(`[card] ${sid.slice(0, 8)}… 备纸失败：`, err?.message ?? err);
      }
    }
  } finally { cardBusy = false; }
}

async function pollSpool() {
  if (spoolPolling) return;
  spoolPolling = true;
  try {
    let st;
    try { st = statSync(SPOOL_EVENTS); } catch { return; } // 无 spool＝未接线，静候
    if (st.size < spoolOffset) spoolOffset = 0;            // spool 被清/轮转：从头重放（出卡幂等）
    if (st.size === spoolOffset) return;
    const fresh = (await readFile(SPOOL_EVENTS)).subarray(spoolOffset);
    const cut = fresh.lastIndexOf(0x0a);                   // 只消费到最后一个整行（半行等下一拍）
    if (cut < 0) return;
    for (const line of fresh.subarray(0, cut).toString('utf8').split('\n')) {
      if (line.trim()) onSpoolLine(line);
    }
    spoolOffset += cut + 1;
    writeFile(SPOOL_CURSOR, JSON.stringify({ offset: spoolOffset }) + '\n').catch(() => {});
    drainCardJobs();
  } finally { spoolPolling = false; }
}

function startCardDuty() {
  try { spoolOffset = Number(JSON.parse(readFileSync(SPOOL_CURSOR, 'utf8')).offset) || 0; } catch { spoolOffset = 0; }
  setInterval(pollSpool, 1500);
  pollSpool();
}

// 本地日界的 YYYY-MM-DD（日带轮转命名，M2.2 §0.6 定死）
function localDate(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startLive() {
  liveOutDir = join(repoRoot, 'runs', `live-${localDate()}`);
  // 注：cli live --out 为截断写（'w'）——同日重启 serve 时靠追赶全史重建当日卷；
  // 多会话拼一日的追加/混流语义归 Track-FIX，已在 FEEDBACK 记案候预告片轮。
  const liveArgs = ['cli/index.ts', 'live',
    ...(rawPath ? [rawPath] : ['--latest', ...(process.env.FOLEY_PROJECTS ? [process.env.FOLEY_PROJECTS] : [])]),
    '--out', liveOutDir];
  liveChild = spawn('node', liveArgs, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
  liveChild.stderr.on('data', d => { if (verbose) process.stderr.write(`[live] ${d}`); });
  let buf = '';
  liveChild.stdout.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line) continue;
      if (line.includes('"state"')) {
        lastState = line;
        // rule 4 pendingAsk 保活：live ASK 待机态回填 transport（只在跳变时广播），全客户端灯语读后端字段
        try { transportSetPendingAsk(JSON.parse(line).pendingAsk); } catch { /* 坏行不回填 */ }
      }
      broadcast(line);
    }
  });
  liveChild.on('exit', code => {
    vlog(`[live] 子进程退出（${code}）`);   // 舞台侧收 SSE 'gone'（E5 状态可诊在灯组语汇呈现）
    for (const res of clients) res.write(`event: gone\ndata: {}\n\n`);
    liveChild = null;
  });
}

// ═══ E2 卡带架·transport 状态机（第五号手令 丁-E2）═══════════════════════════════════
// 服务端权威（rule 2/4）：架上选中、上机带、播放/暂停、游标、live 待机——一处收口，SSE 'transport'
// 广播全客户端实时同步；前端不单独维护选中态。进程重启即空载（rule 3）：内存态、无持久化、不继承历史。
// 切带（rule 1）：CUEING 相＝淡出→装带→淡入的服务端节拍窗，此间播放/录音键锁死；客户端音频包络随此态
// （读态非自计时，rule 4），禁止硬切销毁。
const TRANSPORT_PHASES = ['EMPTY', 'CUEING', 'PLAYING', 'PAUSED']; // 完整状态枚举（rule 4）
const CUE_FADE_MS = 460;   // 切带节拍：淡出窗（客户端据此淡出＋锁键）；到点服务端置 loaded+PLAYING→客户端装带淡入
const transport = {
  phase: 'EMPTY',      // ∈ TRANSPORT_PHASES
  selected: null,      // 架上选中 tapeId（rule 2 权威）
  loaded: null,        // 上机 tapeId
  cursor: 0,           // 播放游标 ms（rule 3 重启清零）
  paused: false,       // 暂停标记（rule 3 重启清零）
  pendingAsk: false,   // live 待机保活（rule 4；由 live 状态流回填）
  live: false,         // 上机的是否 live 带
  locked: false,       // 键锁（CUEING 期真，rule 1）
  epoch: Date.now(),   // 本次进程纪元（客户端据此识别 serve 重启＝历史不继承）
  seq: 0,              // 状态版本（单调）
};
let cueTimer = null;
function transportSnapshot() { return { ...transport, phases: TRANSPORT_PHASES }; }
function pushTransport() { transport.locked = transport.phase === 'CUEING'; transport.seq++; broadcastEvent('transport', transportSnapshot()); }

function transportSelect(tapeId) {
  if (transport.phase === 'CUEING') return false;   // 闭锁期不接新指令（rule 1）
  if (!rackHas(tapeId)) return false;
  clearTimeout(cueTimer);
  transport.selected = tapeId;                       // 选中即刻广播（rule 2 全客户端同步标记）
  transport.phase = 'CUEING';
  transport.paused = false;
  pushTransport();
  cueTimer = setTimeout(() => {                       // 节拍到：装带上机→PLAYING（客户端淡入）
    transport.loaded = tapeId;
    transport.live = tapeId === 'live';
    transport.cursor = 0;
    transport.phase = 'PLAYING';
    pushTransport();
  }, CUE_FADE_MS);
  return true;
}
function transportPlay() { if (transport.phase === 'PAUSED') { transport.phase = 'PLAYING'; transport.paused = false; pushTransport(); } }
function transportPause() { if (transport.phase === 'PLAYING') { transport.phase = 'PAUSED'; transport.paused = true; pushTransport(); } }
function transportEject() {
  clearTimeout(cueTimer);
  Object.assign(transport, { phase: 'EMPTY', selected: null, loaded: null, cursor: 0, paused: false, live: false });
  pushTransport();
}
function transportSetPendingAsk(on) { if (!!on !== transport.pendingAsk) { transport.pendingAsk = !!on; pushTransport(); } }

// ── 卡带架枚举（rule 4 标签＝仓名＋摘要＋时长）──
const DEMO_TAPES = [
  // 审计校验带（船长令 2026-07-11）：168s 十一幕全状态巡礼——全部声音族+全器件动效，快速聆听校验专用。
  // 段落表（策展元数据）住 stage/tools/make-audit-tape.mjs，重生成即重演。
  { id: 'audit',   name: 'AUDIT',   summary: '审计校验·十一幕全状态巡礼' },
  { id: 'storm',   name: 'STORM',   summary: '暴风工作流·满负荷' },
  { id: 'busy',    name: 'BUSY',    summary: '密集读写·多线程' },
  // RACK_SPEC 二.3 术语撞车：校准带 "JAM"（卡死工况）与性格章 "JAM"（即兴）同名反义——
  // 展示名改 STUCK（与时刻语汇 STUCK_LOOP 同宗）；内部工程名 id:'jam'（fixtures 文件名）不动。
  { id: 'jam',     name: 'STUCK',   summary: '卡带·反复重试' },
  { id: 'smooth',  name: 'SMOOTH',  summary: '顺流·一气呵成' },
  { id: 'silence', name: 'SILENCE', summary: '静场·几无动作' },
];
// 卡带时长（秒）＝有效录制时长（走带轴），非墙钟跨度：curve 行为舞台栅格采样（如 100ms/行），
// 空转已折叠出账（raw t 跳变但不采行）。故 时长 ≈ 行数×行距。只读头 4KB＋文件大小估算（避免整读 MB）。
function stageDurationSec(file) {
  let fd;
  try {
    fd = openSync(file, 'r');
    const size = fstatSync(fd).size;
    if (!size) return 0;
    const head = Buffer.alloc(Math.min(4096, size));
    readSync(fd, head, 0, head.length, 0);
    const lines = head.toString('utf8').split('\n');
    const t0 = Number(lines[1]?.split(',')[0]), t1 = Number(lines[2]?.split(',')[0]);
    const interval = (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) ? (t1 - t0) : 50; // 行距 ms
    const complete = lines.slice(1, -1);                    // 去表头与末半行
    const avgLen = complete.length ? (complete.reduce((s, l) => s + l.length + 1, 0)) / complete.length : 71;
    const rowCount = Math.max(0, size / avgLen - 1);        // 估数据行数（减表头）
    return rowCount * interval / 1000;
  } catch { return 0; } finally { if (fd !== undefined) { try { closeSync(fd); } catch { /* 已关 */ } } }
}
// ── P0-4 侧栏最小诚实版（LEDGER）：条目＝仓名＋开场白截断＋相对时间——出现哈希即 bug ──
// 母带教义：脱敏只属出屋的 Dub；本地货架读母带，故显示真名真话。老卡无 rack.json 时
// 凭 sid 回母带房（~/.claude/projects/*/<sid>.jsonl）找回仓名与开场白，写回 rack.json 自愈（一次性）。
const PROJECTS_DIR = process.env.FOLEY_PROJECTS || join(homedir(), '.claude', 'projects');
function findMaster(sid) {
  try {
    for (const e of readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const p = join(PROJECTS_DIR, e.name, `${sid}.jsonl`);
      if (existsSync(p)) return { path: p, repo: e.name.split('-').filter(Boolean).pop() || 'session' };
    }
  } catch { /* 无母带房（他机搬来的卡/清过史）：留给 rack.json 或无名兜底 */ }
  return null;
}
// 开场白＝母带首条真人发言（跳过 '<' 开头的命令包装/系统提醒与 Caveat 行）。只读头 256KB——
// 母带可达百 MB，开场白定居头部；截半的末行 JSON.parse 失败自然跳过。
function openingLine(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const buf = Buffer.alloc(Math.min(262144, fstatSync(fd).size));
    readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.toString('utf8').split('\n')) {
      let obj; try { obj = JSON.parse(line); } catch { continue; }
      if (obj?.type !== 'user' || obj.isSidechain || !obj.message) continue;
      const c = obj.message.content;
      const texts = typeof c === 'string' ? [c] : Array.isArray(c) ? c.filter(b => b?.type === 'text').map(b => b.text) : [];
      for (let t of texts) {
        t = String(t).trim();
        if (!t || t.startsWith('<') || t.startsWith('Caveat:')) continue;
        t = t.replace(/\s+/g, ' ');
        return t.length > 80 ? t.slice(0, 79) + '…' : t;
      }
    }
  } catch { /* 母带读不动＝无开场白，不算错 */ } finally { if (fd !== undefined) { try { closeSync(fd); } catch { /* 已关 */ } } }
  return null;
}
function ensureCardMeta(dir, sid) {
  let rj = {};
  try { rj = JSON.parse(readFileSync(join(dir, 'rack.json'), 'utf8')); } catch { /* 老卡无标签 */ }
  if (rj.repo && rj.opening !== undefined) return rj;
  const m = findMaster(sid);
  if (m) {
    if (!rj.repo) rj.repo = m.repo;
    if (rj.opening === undefined) rj.opening = openingLine(m.path) ?? '';
    if (rj.seconds === undefined) rj.seconds = stageDurationSec(join(dir, 'curve.csv'));
    writeFile(join(dir, 'rack.json'), JSON.stringify(rj) + '\n').catch(() => { /* 下次再愈 */ });
  }
  return rj;
}
// 架序（P0-4 → RACK_SPEC 一段）：真会话新在前（mtime 供前端算相对时间）→ 厂盘垫底。
// LIVE 仍入枚举（rackHas/退带后再上架都要它）但 replay-only 不列（无 live 子进程＝无带可录）；
// "LIVE 不上架"的日常形态由前端执行：在机之带从架上隐去、名归走带牌（货架只列不在机上的带）。
function buildRack() {
  const items = replayOnly ? [] : [{ id: 'live', kind: 'live', name: 'LIVE', summary: '今晨·实时会话', seconds: null }];
  const cards = [];
  try {
    for (const e of readdirSync(CARDS_DIR, { withFileTypes: true })) {
      if (!e.isDirectory() || !CARD_SID.test(e.name)) continue;
      const cv = join(CARDS_DIR, e.name, 'curve.csv');
      if (!existsSync(cv)) continue;
      const rj = ensureCardMeta(join(CARDS_DIR, e.name), e.name);
      cards.push({
        id: `card:${e.name}`, kind: 'card',
        name: rj.repo || '无名带',
        summary: rj.opening || rj.summary || '会话录音',
        seconds: rj.seconds ?? stageDurationSec(cv),
        mtime: statSync(cv).mtimeMs,
      });
    }
  } catch { /* 无卡房 */ }
  cards.sort((a, b) => b.mtime - a.mtime);
  items.push(...cards);
  for (const d of DEMO_TAPES) {
    const cv = join(root, 'fixtures', `${d.id}.curve.csv`);
    if (existsSync(cv)) items.push({ id: d.id, kind: 'demo', name: d.name, summary: d.summary, seconds: stageDurationSec(cv) });
  }
  return items;
}
function rackHas(id) {
  if (id === 'live') return true;
  if (DEMO_TAPES.some(d => d.id === id)) return existsSync(join(root, 'fixtures', `${id}.curve.csv`));
  if (typeof id === 'string' && id.startsWith('card:')) { const sid = id.slice(5); return CARD_SID.test(sid) && existsSync(join(CARDS_DIR, sid, 'curve.csv')); }
  return false;
}

createServer(async (req, res) => {
  // Host 白名单闸（P1-④）：先于一切路由（含静态读面与 F1 崩点），非白即 403。
  if (!HOST_OK.has(String(req.headers.host ?? ''))) { res.writeHead(403); res.end('forbidden host'); return; }
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400); res.end('bad url'); return; }
  // 第五号手令 丁-E2：首页默认磁带架（rule 4）——裸正门直上 index.html 的空载卡带架（rule 3），
  // 不再 302 落厂演示卷（G8 空盘"死机观感"由卡带架本身化解：架上有带可选，天然非死）。
  // 今晨的纸：当前 live 产物流快照（curve 含追赶全史；页面铺纸后按 t 去重接 SSE）
  if (url.pathname === '/today/curve.csv' || url.pathname === '/today/moments.csv') {
    if (!liveOutDir) { res.writeHead(404); res.end(); return; }
    try {
      let body = await readFile(join(liveOutDir, url.pathname.slice(7)));
      // P0-3 根修（LEDGER·迟到者无界回灌）：整日 curve 可长到几十 MB（20Hz×小时），全量下发＋全史回灌
      // 会把打开 live 的主线程噎死几十秒＝"该动的全不动"。?tailSec=N 只发「表头＋最后 N 秒行」——
      // 纸本就只能显示 ~57s 历史，尾窗即全部所需。缺参=全量（dayroll/dub 等旧消费者原样）。
      const tailSec = Number(url.searchParams.get('tailSec') || 0);
      if (tailSec > 0) {
        const text = String(body);
        const nl0 = text.indexOf('\n');
        if (nl0 > 0) {
          const header = text.slice(0, nl0 + 1);
          // 从尾部按行回扫：首列 t 为毫秒时间戳，收集 t >= tEnd−tailSec*1000 的行（无需整文件解析）
          let rows = [], end = text.length, guard = 0, tEnd = NaN;
          while (end > nl0 && guard++ < 4_000_000) {
            const nl = text.lastIndexOf('\n', end - 2);
            const line = text.slice(nl + 1, end).trimEnd();
            end = nl + 1;
            if (!line) continue;
            const t = Number(line.slice(0, line.indexOf(',')));
            if (!Number.isFinite(t)) continue;
            if (!Number.isFinite(tEnd)) tEnd = t;
            if (t < tEnd - tailSec * 1000) break;
            rows.push(line);
          }
          body = Buffer.from(header + rows.reverse().join('\n') + '\n');
        }
      }
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
    return;
  }
  // 昨日的卷（M2.2 §0.6）：/dayroll/<yesterday|YYYY-MM-DD>/{curve,moments}.csv
  {
    const m = url.pathname.match(/^\/dayroll\/(yesterday|\d{4}-\d{2}-\d{2})\/(curve|moments)\.csv$/);
    if (m) {
      const date = m[1] === 'yesterday' ? localDate(Date.now() - 86400000) : m[1];
      try {
        const body = await readFile(join(repoRoot, 'runs', `live-${date}`, `${m[2]}.csv`));
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' });
        res.end(body);
      } catch { res.writeHead(404); res.end(`${date} 无卷`); }
      return;
    }
  }
  // dub 落盘（M-T1）：撕下的纸条自动归档 runs/dubs/（runs 即弃即建，正片提拔走 records）
  if (req.method === 'POST' && url.pathname === '/dub/save') {
    if (!writeAuthed(req)) { res.writeHead(403); res.end('forbidden'); return; }
    let body = '', size = 0, tooBig = false;
    req.on('data', d => {
      size += d.length;
      if (size > 32e6) { tooBig = true; req.destroy(); return; }
      body += d;
    });
    req.on('end', async () => {
      if (tooBig) return;
      try {
        const { tape, png, meta } = JSON.parse(body);
        const dir = join(repoRoot, 'runs', 'dubs');
        await mkdir(dir, { recursive: true });
        const stem = `foley-dub-${safeStem(tape, 'tape')}-${localDate()}`;
        let n = 1;
        while (existsSync(join(dir, `${stem}${n > 1 ? '-' + n : ''}.png`))) n++;
        const nm = `${stem}${n > 1 ? '-' + n : ''}`;
        await writeFile(join(dir, `${nm}.png`), Buffer.from(png, 'base64'));
        await writeFile(join(dir, `${nm}.meta.json`), JSON.stringify(meta, null, 2) + '\n');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ saved: [`runs/dubs/${nm}.png`, `runs/dubs/${nm}.meta.json`] }));
        vlog(`[dub] 落盘 runs/dubs/${nm}.png`);
      } catch (e) {
        res.writeHead(400); res.end(String(e));
      }
    });
    return;
  }
  // M-T3 音轨中继：POST /dub/render-audio {tape, segments[原始相对 ms]} → WAV（meta 在响应头）。
  // 消费 sound/ 的 renderCuts（cli render-cuts 子命令）；dub 授权卫生=默认无唱片。
  // 红线①：tape 走白名单（五带生带），segments 逐字段验数；日带/live 无生带诚实报缺。
  if (req.method === 'POST' && url.pathname === '/dub/render-audio') {
    if (!writeAuthed(req)) { res.writeHead(403); res.end('forbidden'); return; } // 同刀扩展：换声=spawn+写盘同级
    const AUDIO_TAPES = new Set(['storm', 'smooth', 'busy', 'jam', 'silence']);
    let body = '', size = 0;
    req.on('data', d => { size += d.length; if (size > 1e6) req.destroy(); else body += d; });
    req.on('end', async () => {
      try {
        const { tape, segments, withRecord, recordIndex } = JSON.parse(body);
        if (!AUDIO_TAPES.has(tape)) { res.writeHead(404); res.end('该带无生带（日带/live 音轨候适配）'); return; }
        if (!Array.isArray(segments) || segments.length === 0 || segments.length > 64
          || !segments.every(s => Number.isFinite(s.t0) && Number.isFinite(s.t1) && Number.isFinite(s.speed) && s.t1 > s.t0 && s.speed >= 1)) {
          res.writeHead(400); res.end('segments 不像样'); return;
        }
        const tmp = await mkdtemp(join(repoRoot, 'runs', 'rendercuts-'));
        const clean = segments.map(s => ({
          role: String(s.role ?? 'SEG').replace(/[^\w-]/g, '').slice(0, 12),
          t0: Math.round(s.t0), t1: Math.round(s.t1), speed: Math.round(s.speed),
        }));
        await writeFile(join(tmp, 'cuts.json'), JSON.stringify({ segments: clean }));
        // withRecord（M2.5 hero）：出厂 CC0 唱片入轨（授权卫生 (a) 款，renderCuts meta 记来源）
        const extra = withRecord ? ['--with-record', '--record-index', String(Math.max(0, Math.min(15, Math.round(Number(recordIndex) || 0))))] : [];
        const child = spawn('node', ['cli/index.ts', 'render-cuts',
          join(repoRoot, 'tapes', `${tape}.tape.jsonl`), join(tmp, 'cuts.json'), '--out', tmp, ...extra],
          { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
        let errBuf = '';
        child.stderr.on('data', d => { errBuf += d; });
        const timer = setTimeout(() => child.kill('SIGKILL'), 180000);
        child.on('exit', async code => {
          clearTimeout(timer);
          try {
            if (code !== 0) { res.writeHead(500); res.end(`render-cuts 退 ${code}：${errBuf.slice(0, 400)}`); return; }
            const wav = await readFile(join(tmp, 'cuts-audio.wav'));
            const meta = await readFile(join(tmp, 'cuts-audio.meta.json'), 'utf8');
            res.writeHead(200, { 'content-type': 'audio/wav', 'x-dub-audio-meta': encodeURIComponent(meta) });
            res.end(wav);
            vlog(`[dub] 音轨 ${tape}：${(wav.length / 1e6).toFixed(1)}MB WAV`);
          } catch (e) { res.writeHead(500); res.end(String(e)); }
          finally { rm(tmp, { recursive: true, force: true }).catch(() => {}); }
        });
      } catch (e) { res.writeHead(400); res.end(String(e)); }
    });
    return;
  }
  // 胶片/海报/GIF 二进制落盘（M-T2）：POST /dub/save-bin?tape=<名>&kind=<mp4|webm|poster.png|gif>
  if (req.method === 'POST' && url.pathname === '/dub/save-bin') {
    if (!writeAuthed(req)) { res.writeHead(403); res.end('forbidden'); return; }
    const tape = safeStem(url.searchParams.get('tape'), 'tape');
    const rawKind = String(url.searchParams.get('kind') ?? 'bin');
    const kind = KIND_OK.has(rawKind) ? rawKind : 'bin';  // 扩展名白名单，非白即 bin（§0.6.④）
    const chunks = [];
    let size = 0, tooBig = false;
    req.on('data', d => {
      size += d.length;
      if (size > 512e6) { tooBig = true; req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', async () => {
      if (tooBig) return;
      try {
        const dir = join(repoRoot, 'runs', 'dubs');
        await mkdir(dir, { recursive: true });
        const stem = `foley-dub-${tape}-${localDate()}`;
        let n = 1;
        while (existsSync(join(dir, `${stem}${n > 1 ? '-' + n : ''}.${kind}`))) n++;
        const nm = `${stem}${n > 1 ? '-' + n : ''}.${kind}`;
        await writeFile(join(dir, nm), Buffer.concat(chunks));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ saved: `runs/dubs/${nm}` }));
        vlog(`[dub] 落盘 runs/dubs/${nm}（${(size / 1e6).toFixed(1)}MB）`);
      } catch (e) { res.writeHead(400); res.end(String(e)); }
    });
    return;
  }
  // 收工吐卡读面（轨乙①）：待撕工单 ＋ 卡片原纸。$HOME 读面纪律（B4 同款）：
  // sid 白名单正则＋文件名白名单，无路径拼接自由度；只读；Host 闸在最前已兜。
  if (url.pathname === '/cards/pending') {
    const pending = [];
    try {
      for (const d of readdirSync(CARDS_DIR, { withFileTypes: true })) {
        if (!d.isDirectory() || !CARD_SID.test(d.name)) continue;
        const base = join(CARDS_DIR, d.name);
        if (!existsSync(join(base, 'curve.csv'))) continue;
        if (existsSync(join(base, 'card.png')) || existsSync(join(base, 'card.skip.json'))) continue;
        pending.push({ sid: d.name, m: statSync(join(base, 'curve.csv')).mtimeMs });
      }
    } catch { /* 无卡房＝无欠账 */ }
    pending.sort((a, b) => a.m - b.m);
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ pending: pending.slice(-12).map(p => p.sid) }));
    return;
  }
  {
    const cm = url.pathname.match(/^\/cards\/([\w-]{4,64})\/(curve\.csv|moments\.csv)$/);
    if (cm) {
      try {
        const body = await readFile(join(CARDS_DIR, cm[1], cm[2]));
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store' });
        res.end(body);
      } catch { res.writeHead(404); res.end(); }
      return;
    }
  }
  // 撕好的卡落盘（轨乙①）：同一把写盘鉴权刀（Origin+令牌）；覆盖写＝后卡替前卡。
  // skip 形态：台上无戏可剪（会话太短/全歇）也要销账，否则工单永远待撕。
  if (req.method === 'POST' && url.pathname === '/card/save') {
    if (!writeAuthed(req)) { res.writeHead(403); res.end('forbidden'); return; }
    let body = '', size = 0, tooBig = false;
    req.on('data', d => {
      size += d.length;
      if (size > 32e6) { tooBig = true; req.destroy(); return; }
      body += d;
    });
    req.on('end', async () => {
      if (tooBig) return;
      try {
        const { sid: rawSid, png, meta, skip } = JSON.parse(body);
        const sid = String(rawSid ?? '');
        if (!CARD_SID.test(sid) || !existsSync(join(CARDS_DIR, sid))) { res.writeHead(400); res.end('sid 不像样'); return; }
        if (skip) {
          await writeFile(join(CARDS_DIR, sid, 'card.skip.json'), JSON.stringify({ note: String(skip).slice(0, 120) }) + '\n');
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ skipped: true }));
          vlog(`[card] ${sid.slice(0, 8)}… 无戏可剪，销账`);
          return;
        }
        await writeFile(join(CARDS_DIR, sid, 'card.png'), Buffer.from(String(png), 'base64'));
        await writeFile(join(CARDS_DIR, sid, 'card.meta.json'), JSON.stringify(meta ?? {}, null, 2) + '\n');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ saved: [`cards/${sid}/card.png`, `cards/${sid}/card.meta.json`] }));
        vlog(`[card] 收工卡落盘 ${join(CARDS_DIR, sid, 'card.png')}`);
      } catch (e) { res.writeHead(400); res.end(String(e)); }
    });
    return;
  }
  // 接线状态（轨乙②③）：页面借此决定要不要在空转时亮「接线单」
  if (url.pathname === '/onboard/status') {
    let wired = false;
    try {
      const s = JSON.parse(await readFile(join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json'), 'utf8'));
      const groups = s?.hooks?.SessionEnd;
      const mine = (c) => /cli[\\/]hook\.ts/.test(c) || (/\shook(\s|$)/.test(c) && /cli[\\/]index\.ts|foley/.test(c));
      wired = Array.isArray(groups) && groups.some(g => Array.isArray(g?.hooks) && g.hooks.some(h => mine(String(h?.command ?? ''))));
    } catch { /* 无档＝未接 */ }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ wired, spool: existsSync(SPOOL_EVENTS) }));
    return;
  }
  // ── E2 卡带架路由（第五号手令 丁-E2）──
  // GET /rack：架上磁带（仓名/摘要/时长）＋当前 transport 快照。POST /transport/{select,play,pause,eject}：
  // 服务端权威改态（rule 2/4），同源令牌闸（与写盘同刀）。
  if (url.pathname === '/rack') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ rack: buildRack(), transport: transportSnapshot() }));
    return;
  }
  if (req.method === 'POST' && url.pathname.startsWith('/transport/')) {
    if (!writeAuthed(req)) { res.writeHead(403); res.end('forbidden'); return; }
    const action = url.pathname.slice('/transport/'.length);
    let body = '', size = 0, tooBig = false;
    req.on('data', d => { size += d.length; if (size > 4096) { tooBig = true; req.destroy(); return; } body += d; });
    req.on('end', () => {
      if (tooBig) return;
      let ok = true;
      try {
        if (action === 'select') { const { tape } = JSON.parse(body || '{}'); ok = transportSelect(String(tape ?? '')); }
        else if (action === 'play') transportPlay();
        else if (action === 'pause') transportPause();
        else if (action === 'eject') transportEject();
        else ok = false;
      } catch { ok = false; }
      res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify(ok ? transportSnapshot() : { error: 'bad transport request' }));
    });
    return;
  }
  if (url.pathname === '/live') {
    if (replayOnly || !liveChild) { res.writeHead(503); res.end('live 未开'); return; }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    });
    res.write(':stage live\n\n');
    if (lastState) res.write(`data: ${lastState}\n\n`);
    res.write(`event: transport\ndata: ${JSON.stringify(transportSnapshot())}\n\n`); // 新客户端即得当前 transport 态（rule 2 同步）
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  // P1-②/乙-F1：decodeURIComponent 遇畸形 %-序列（/%zz、裸 /%）同步抛 URIError——
  // 曾在一切 try 之外，异步处理器内抛 = unhandled rejection = 进程终止（单请求 DoS）。包死返 400。
  let path;
  try { path = normalize(decodeURIComponent(url.pathname)); }
  catch { res.writeHead(400); res.end('bad path'); return; }
  if (path === '/' || path === '\\') path = '/index.html';
  // G8 声资产挂载（M2.6 热修）：页面以「../sound/**、../records/**、../sound-params.json」相对路径讨声
  // （与 Pages/demo 站同一路径形状），serve 静态根却在 stage/——此前一律 404，正页声桥被物理断粮。
  // 这里把三条路映到仓库真身：只读、扩展名走 MIME 表、normalize 后仍以 startsWith 闸防穿越。
  let file, fenceRoot;
  if (path === '/sound-params.json') { file = join(repoRoot, 'sound-params.json'); fenceRoot = repoRoot; }
  else if (path.startsWith('/sound/')) { file = join(repoRoot, path); fenceRoot = join(repoRoot, 'sound'); }
  else if (path.startsWith('/records/')) { file = join(repoRoot, 'sound', path); fenceRoot = join(repoRoot, 'sound', 'records'); }
  else { file = join(root, path); fenceRoot = root; }
  const fence = fenceRoot.endsWith('/') ? fenceRoot : fenceRoot + '/';
  if (!file.startsWith(fence)) { res.writeHead(403); res.end(); return; }
  try {
    let body = await readFile(file);
    if (extname(file) === '.html') {
      // 本次启动令牌注入 <head>，供 dub.js 写盘回带（同源可读、跨站取不到）。仅 HTML，且只此一处替换。
      body = Buffer.from(String(body).replace(/<head>/i, `<head><meta name="dub-token" content="${DUB_TOKEN}">`));
    }
    // P0-3 加固（LEDGER·013 重建遗祸类）：无缓存头时浏览器启发式缓存会喂"半旧半新"的 JS 模块——
    // 重建/热修期正是"器件全不动、只剩底噪"一类哑病的温床。localhost 上 no-cache（须再验证）零成本。
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    // B4 打包态回退：repo 缺件时，白名单内的出厂唱片/床音改从 ~/.foley factory 缓存供出（只读＋fence 前缀闸）。
    const fb = factoryFallback(path);
    if (fb) {
      const ffence = fb.fence.endsWith('/') ? fb.fence : fb.fence + '/';
      if (fb.file.startsWith(ffence)) {
        try {
          const body = await readFile(fb.file);
          res.writeHead(200, { 'content-type': MIME[extname(fb.file)] ?? 'application/octet-stream' });
          res.end(body);
          return;
        } catch { /* factory 亦缺 → 落 404 */ }
      }
    }
    res.writeHead(404); res.end('not found');
  }
}).listen(port, '127.0.0.1', () => { // §0.6.② 三闸各司其职（乙-F5 订正措辞）：绑定断 LAN／Origin 断跨源写／Host 校验断 rebind 读
  // 首光·两行（丁-E1）：监听中＋URL。其余机器内务走 --verbose；卡片宣告归舞台。
  console.log(`♪ TAPE·ZERO · 监听中${replayOnly ? '（replay-only）' : ''}`);
  console.log(`  stage @ http://127.0.0.1:${port}/`);
  vlog(replayOnly ? '  ?tape=storm 走 replay' : '  live 默认；?tape=storm 走 replay；?mode=live 强制实流；--verbose 看机器内务');
});

if (!replayOnly) startLive();
if (!replayOnly) startCardDuty(); // 收工吐卡值守（轨乙①）：replay-only 是静态服务器，不背卡片工序
// RACK_SPEC 一.3（第一段）：有 LIVE，醒来即"带已在机上转"——起动自装 live 带（LIVE 不上架，
// 归走带牌）。声音仍候浏览器手势法，不违静默律；replay-only 无 live，醒在带架（EMPTY）。
if (!replayOnly) transportSelect('live');
// P1-② 纵深兜底：任何漏网的未捕获 rejection 只记日志不崩进程（防 F1 同类"异步处理器内同步抛"再打断 live 广播/在制 dub）。
process.on('unhandledRejection', (err) => { console.error('[serve] 未处理 rejection（兜底不崩）：', err); });
process.on('SIGINT', () => { liveChild?.kill('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { liveChild?.kill('SIGTERM'); process.exit(0); });
