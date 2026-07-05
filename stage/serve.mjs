// stage 服务器 —— 静态件 ＋ live 中继（M-S3）。零依赖，运行时零外网（localhost 即舞台后台）。
//
//   node stage/serve.mjs [port] [--replay-only] [--raw <jsonl>]
//
// live 为默认模式：起动即生 `cli live`（Track-FIX 真 20Hz 广播，stdout NDJSON），
// 经 /live SSE 中继进浏览器。--replay-only 时只当静态服务器（性格照/回放捕捉用）。
// 中继与钟都不依赖标签页可见性——藏页照走（M2.0 §2 验证件二）。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = dirname(root.replace(/\/$/, ''));

const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a)) ?? process.env.PORT ?? 4173);
const replayOnly = args.includes('--replay-only');
const rawIdx = args.indexOf('--raw');
const rawPath = rawIdx >= 0 ? args[rawIdx + 1] : null;

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
  const url = new URL(req.url, 'http://localhost');
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
  let path = normalize(decodeURIComponent(url.pathname));
  if (path === '/' || path === '\\') path = '/index.html';
  const file = join(root, path);
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}).listen(port, () => {
  console.log(`stage @ http://localhost:${port}/${replayOnly ? '?tape=storm（replay-only）' : '（live 默认；?tape=storm 走 replay）'}`);
});

if (!replayOnly) startLive();
process.on('SIGINT', () => { liveChild?.kill('SIGINT'); process.exit(0); });
process.on('SIGTERM', () => { liveChild?.kill('SIGTERM'); process.exit(0); });
