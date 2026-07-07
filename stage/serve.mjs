// stage 服务器 —— 静态件 ＋ live 中继（M-S3）。零依赖，运行时零外网（localhost 即舞台后台）。
//
//   node stage/serve.mjs [port] [--replay-only] [--raw <jsonl>]
//
// live 为默认模式：起动即生 `cli live`（Track-FIX 真 20Hz 广播，stdout NDJSON），
// 经 /live SSE 中继进浏览器。--replay-only 时只当静态服务器（性格照/回放捕捉用）。
// 中继与钟都不依赖标签页可见性——藏页照走（M2.0 §2 验证件二）。
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
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
  if (demoBoot) console.log(`[boot] 最近会话${newest < 0 ? '缺席' : '已歇场(>15min)'} → 正门上厂演示卷 storm@8×（live 视图 /?mode=live 照旧）`);
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
    console.log('[card] 接线自证 hello 到站——钩子→spool→serve 全线通');
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
        broadcastEvent('card', { sid });
        console.log(`[card] ${sid.slice(0, 8)}… 纸已备好（候台上撕卡）`);
      } catch (err) {
        console.error(`[card] ${sid.slice(0, 8)}… 备纸失败：`, err?.message ?? err);
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
  liveChild.stderr.on('data', d => process.stderr.write(`[live] ${d}`));
  let buf = '';
  liveChild.stdout.on('data', chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      if (!line) continue;
      if (line.includes('"state"')) lastState = line;
      broadcast(line);
    }
  });
  liveChild.on('exit', code => {
    console.error(`[live] 子进程退出（${code}）`);
    for (const res of clients) res.write(`event: gone\ndata: {}\n\n`);
    liveChild = null;
  });
}

createServer(async (req, res) => {
  // Host 白名单闸（P1-④）：先于一切路由（含静态读面与 F1 崩点），非白即 403。
  if (!HOST_OK.has(String(req.headers.host ?? ''))) { res.writeHead(403); res.end('forbidden host'); return; }
  let url;
  try { url = new URL(req.url, 'http://localhost'); }
  catch { res.writeHead(400); res.end('bad url'); return; }
  // G8 空盘自举：只拦「裸正门」（无 query）；?tape/?mode=live 等来意一律尊重
  if (demoBoot && url.pathname === '/' && !url.search) {
    res.writeHead(302, { location: '/?tape=storm&speed=8' }); res.end(); return;
  }
  // 今晨的纸：当前 live 产物流快照（curve 含追赶全史；页面铺纸后按 t 去重接 SSE）
  if (url.pathname === '/today/curve.csv' || url.pathname === '/today/moments.csv') {
    if (!liveOutDir) { res.writeHead(404); res.end(); return; }
    try {
      const body = await readFile(join(liveOutDir, url.pathname.slice(7)));
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
        console.log(`[dub] 落盘 runs/dubs/${nm}.png`);
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
            console.log(`[dub] 音轨 ${tape}：${(wav.length / 1e6).toFixed(1)}MB WAV`);
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
        console.log(`[dub] 落盘 runs/dubs/${nm}（${(size / 1e6).toFixed(1)}MB）`);
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
          console.log(`[card] ${sid.slice(0, 8)}… 无戏可剪，销账`);
          return;
        }
        await writeFile(join(CARDS_DIR, sid, 'card.png'), Buffer.from(String(png), 'base64'));
        await writeFile(join(CARDS_DIR, sid, 'card.meta.json'), JSON.stringify(meta ?? {}, null, 2) + '\n');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ saved: [`cards/${sid}/card.png`, `cards/${sid}/card.meta.json`] }));
        console.log(`[card] 收工卡落盘 ${join(CARDS_DIR, sid, 'card.png')}`);
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
  if (url.pathname === '/live') {
    if (replayOnly || !liveChild) { res.writeHead(503); res.end('live 未开'); return; }
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
    });
    res.write(':stage live\n\n');
    if (lastState) res.write(`data: ${lastState}\n\n`);
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
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, '127.0.0.1', () => { // §0.6.② 三闸各司其职（乙-F5 订正措辞）：绑定断 LAN／Origin 断跨源写／Host 校验断 rebind 读
  console.log(`stage @ http://127.0.0.1:${port}/${replayOnly ? '?tape=storm（replay-only）' : '（live 默认；?tape=storm 走 replay）'}`);
});

if (!replayOnly) startLive();
if (!replayOnly) startCardDuty(); // 收工吐卡值守（轨乙①）：replay-only 是静态服务器，不背卡片工序
// P1-② 纵深兜底：任何漏网的未捕获 rejection 只记日志不崩进程（防 F1 同类"异步处理器内同步抛"再打断 live 广播/在制 dub）。
process.on('unhandledRejection', (err) => { console.error('[serve] 未处理 rejection（兜底不崩）：', err); });
process.on('SIGINT', () => { liveChild?.kill('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { liveChild?.kill('SIGTERM'); process.exit(0); });
