// cli live <raw.jsonl | --latest [projectsDir]> [--out dir] [--hz 20] —— M1.9 §1.1 v1-live。
// 尾随一卷**生长中的**原始会话 JSONL，增量蒸馏（隐私膜同源），共享因果 driver，20Hz 正典广播。
//
// bounded 纪律（审计发现 4 固化，soak 实证 RSS 恒平的路）：
//  - 禁累积式采样：StatePacket/MomentEvent 写出（stdout NDJSON / --out 追加流）即丢，进程内零增长数组。
//  - 增量蒸馏 pending 表有界（≤未决 tool_use 数）；引擎 sigStates 有界（M1.8-F② 过期驱逐）。
//  - 采样时刻 = 上一动作时刻 + k×snapMs（tickTo 只推整栅格）——心跳抖动不进采样轴。
//
// 追赶：启动时文件已有的历史按其原时戳快速推演（不广播、不 sleep），产物流（--out）含全史；
// 追平后进入实时：新行 → 增量蒸馏 → driver；20Hz 心跳推进衰减/滴灌/过期 CLEARED。
//
// live 侧 ASK（§1.1）：显式 AskUserQuestion 为准——tool_use 到达即开窗（琥珀管点亮），
// tool_result 到达 ASK_CLEARED。权限等待（permission prompt）在 JSONL 里**无标记、不可探测**，
// 缺口如实记录（FEEDBACK M1.9），不硬造启发式。
//
// 停机（SIGINT/SIGTERM/文件消失）：增量器 close()（段尾 DONE）→ 摘要到 stderr → exit 0。

import { openSync, readSync, fstatSync, closeSync, readdirSync, statSync, mkdirSync, createWriteStream, readFileSync, type WriteStream } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { StatePacket } from '../protocol/index.ts';
import {
  createIncrementalDistiller, type LiveOp,
} from '../adapters/claude-jsonl/index.ts';
import { createDriver, applyOp, type Driver, type Emit } from './driver.ts';
import { resolveParams, hashParams } from '../engine/params.ts';

const POLL_MS = 250; // 追加轮询（fs.watch 在各平台语义不齐，轮询为主，确定性优先）

function newestJsonl(root: string): string | null {
  let best: string | null = null, bestM = -1;
  let entries: string[];
  try { entries = readdirSync(root, { recursive: true }) as string[]; }
  catch { return null; }
  for (const e of entries) {
    if (typeof e !== 'string' || !e.endsWith('.jsonl')) continue;
    const p = join(root, e);
    try {
      const m = statSync(p).mtimeMs;
      if (m > bestM) { bestM = m; best = p; }
    } catch { /* 消失的文件：跳过 */ }
  }
  return best;
}

export function runLive(argv: string[]): void {
  // ---- 参数 ----
  let rawPath: string | null = null;
  let outDir: string | null = null;
  let hz = 20; // 真 20Hz 为正典频率（M1.9 §1.1）
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--latest') {
      const root = argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : join(homedir(), '.claude', 'projects');
      rawPath = newestJsonl(root);
      if (!rawPath) { console.error(`--latest：${root} 下没有 JSONL`); process.exit(2); }
      process.stderr.write(`latest → ${rawPath}\n`);
    } else if (a === '--out') { outDir = argv[++i] ?? null; }
    else if (a === '--hz') {
      hz = Number(argv[++i]);
      if (!Number.isFinite(hz) || hz < 1 || hz > 100) { console.error(`--hz 非法（1–100；正典 20）`); process.exit(2); }
    } else if (!a.startsWith('--') && !rawPath) rawPath = a;
  }
  if (!rawPath) {
    console.error('用法: node cli/index.ts live <raw.jsonl | --latest [projectsDir]> [--out runs/live-<ts>/] [--hz 20]');
    process.exit(2); return;
  }
  const snapMs = Math.round(1000 / hz);

  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const paramsHash = hashParams(paramsRaw);

  // ---- 产物流（追加即丢，bounded）----
  let curveWs: WriteStream | null = null, momWs: WriteStream | null = null;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    curveWs = createWriteStream(join(outDir, 'curve.csv'), { flags: 'w' });
    momWs = createWriteStream(join(outDir, 'moments.csv'), { flags: 'w' });
    curveWs.write('t,S,T,A,wow,needle,phase,weather,pendingAsk\n');
    momWs.write('t,emitT,seq,verb,outcome,m,tags,special,sig,k,clearedBy,slot\n');
  }
  const f6 = (n: number): string => n.toFixed(6);

  // ---- 广播 sinks（写出即丢；追赶期只入产物流不上 stdout）----
  let caughtUp = false;
  let snapCount = 0, momentCount = 0;
  let lastPkt: StatePacket | null = null;
  const sinks = {
    snap(s: StatePacket): void {
      snapCount++; lastPkt = s;
      curveWs?.write(`${s.t},${f6(s.S)},${f6(s.T)},${f6(s.A)},${f6(s.wow)},${f6(s.needle)},${s.phase},${s.weather},${s.pendingAsk ? 1 : 0}\n`);
      if (caughtUp) process.stdout.write(JSON.stringify(s) + '\n');
    },
    moment(e: Emit): void {
      momentCount++;
      const ev = e.ev;
      momWs?.write(`${ev.t},${e.emitT},${ev.seq},${ev.verb},${ev.outcome},${f6(ev.m)},${ev.tags.join('|')},${ev.special ?? ''},${ev.sig ?? ''},${ev.k ?? ''},${ev.clearedBy ?? ''},${ev.slot ?? ''}\n`);
      if (caughtUp) process.stdout.write(JSON.stringify(ev) + '\n');
    },
  };

  const driver: Driver = createDriver(params, snapMs, sinks);
  const inc = createIncrementalDistiller(params);

  const apply = (ops: LiveOp[]): void => {
    for (const op of ops) applyOp(driver, op); // 正典映射与金测试同一段代码（driver.ts）
  };

  // ---- 尾随回路 ----
  let fd: number;
  try { fd = openSync(rawPath, 'r'); }
  catch (err) { console.error(`打不开 ${rawPath}: ${(err as Error).message}`); process.exit(2); return; }
  let offset = 0;
  let tail = ''; // 半行缓冲（只在行边界喂增量器）

  const readAppended = (): void => {
    let size: number;
    try { size = fstatSync(fd).size; }
    catch { shutdown('文件不可读'); return; }
    if (size < offset) { // truncate/轮转：如实报告并停（不猜续读语义）
      shutdown(`文件缩短（${offset}→${size}），疑似轮转`); return;
    }
    while (offset < size) {
      const want = Math.min(1 << 20, size - offset); // 1MB 块，bounded
      const b = Buffer.alloc(want);
      const got = readSync(fd, b, 0, want, offset);
      if (got <= 0) break;
      offset += got;
      tail += b.toString('utf8', 0, got);
      let nl: number;
      while ((nl = tail.indexOf('\n')) >= 0) {
        const line = tail.slice(0, nl);
        tail = tail.slice(nl + 1);
        apply(inc.feedLine(line));
      }
    }
  };

  // 追赶：现有历史一次性推演（按历史时戳，advanceTo 内解析跳跃防爆炸），
  // 并静默推进到墙钟当下——历史末尾到现在的空档补样属追赶，不冒充直播。
  readAppended();
  apply(inc.flushDue(Infinity, 0)); // 历史里同刻等待没有意义：先冲干净
  driver.tickTo(Date.now());
  caughtUp = true;
  const s0 = inc.stats();
  process.stderr.write(
    `TAPE0 live ｜ ${rawPath}\n` +
    `params ${paramsHash} ｜ ${hz}Hz（snap ${snapMs}ms）｜ 追赶完成：行 ${s0.parsedLines}/${s0.totalLines}，落地事件 ${s0.eventCount}，episode ${s0.episodeCount}，采样 ${snapCount}\n` +
    (outDir ? `产物流 → ${outDir}/{curve.csv,moments.csv}\n` : '') +
    `广播 NDJSON → stdout（state/moment）。Ctrl-C 停机出摘要。\n`,
  );

  // 实时：20Hz 心跳推进 + 轮询追加
  const tick = setInterval(() => {
    apply(inc.flushDue(Date.now()));
    driver.tickTo(Date.now()); // 首行未到时内部空转
  }, snapMs);
  const poll = setInterval(readAppended, POLL_MS);

  let down = false;
  const shutdown = (why: string): void => {
    if (down) return; down = true;
    clearInterval(tick); clearInterval(poll);
    readAppended();
    apply(inc.close());
    const s = inc.stats();
    const pkt = lastPkt as StatePacket | null;
    process.stderr.write(
      `\nlive 停机（${why}）\n` +
      `行 ${s.parsedLines}/${s.totalLines}（坏行 ${s.badLines}）｜tool_use ${s.toolUseCount}｜配对 ${s.pairedCount}｜仍未决 ${s.unpairedOpen}｜ASK ${s.askToolCount}\n` +
      `落地事件 ${s.eventCount}｜episode ${s.episodeCount}｜采样 ${snapCount}｜时刻 ${momentCount}\n` +
      (pkt ? `末态 S=${pkt.S.toFixed(4)} T=${pkt.T.toFixed(4)} phase=${pkt.phase} weather=${pkt.weather}\n` : '') +
      `RSS ${(process.memoryUsage().rss / 1048576).toFixed(1)}MB\n`,
    );
    curveWs?.end(); momWs?.end();
    try { closeSync(fd); } catch { /* 已关 */ }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
