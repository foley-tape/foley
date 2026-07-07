// stage 服务器 —— 静态件 ＋ live 中继（M-S3）。零依赖，运行时零外网（localhost 即舞台后台）。
//
//   node stage/serve.mjs [port] [--replay-only] [--raw <jsonl>]
//
// live 为默认模式：起动即生 `cli live`（Track-FIX 真 20Hz 广播，stdout NDJSON），
// 经 /live SSE 中继进浏览器。--replay-only 时只当静态服务器（性格照/回放捕捉用）。
// 中继与钟都不依赖标签页可见性——藏页照走（M2.0 §2 验证件二）。
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
};

// ---- live 中继：child stdout NDJSON → SSE 扇出（写出即丢，bounded 纪律同源）----
const clients = new Set();
let lastState = null; // 新客户端接入先喂末态，器件即刻上弦
let liveChild = null;
let liveOutDir = null; // 今晨的纸：live 产物流目录（追赶史＋实时追加）

function broadcast(line) {
  for (const res of clients) res.write(`data: ${line}\n\n`);
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
  const liveArgs = ['cli/index.ts', 'live', ...(rawPath ? [rawPath] : ['--latest']), '--out', liveOutDir];
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
  const file = join(root, path);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
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
// P1-② 纵深兜底：任何漏网的未捕获 rejection 只记日志不崩进程（防 F1 同类"异步处理器内同步抛"再打断 live 广播/在制 dub）。
process.on('unhandledRejection', (err) => { console.error('[serve] 未处理 rejection（兜底不崩）：', err); });
process.on('SIGINT', () => { liveChild?.kill('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { liveChild?.kill('SIGTERM'); process.exit(0); });
