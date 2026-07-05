// 通宵耐力测试 harness（夜班令 §2）。自记录 / 自终止 / 与审计会话解耦。
// `cli live` 现为 stub（cli/index.ts:28），故此处以真实 engine + adapter 搭"live 等价"消费者：
//   合成会话发生器（seeded 可复现）以真实节奏滴写监听文件；同一进程尾随驱动引擎（bounded，不累积）。
// 测：进程 RSS/CPU（每分钟）｜MomentEvent 发射时刻 vs 理论时刻漂移｜过期型 CLEARED 的 tick 对齐随时长是否退化。
// 滚动日志：audit/soak/run/soak-samples.jsonl（每行一条 sample/emit/tick 记录）。
// 终止：跑满 SOAK_HOURS（sim 时）后写 soak-done.json。summarize 脚本随时可跑出 SOAK_REPORT.md。
//
// 环境变量：
//   SOAK_HOURS   sim 目标时长（默认 6）
//   SOAK_SPEED   墙钟压缩比（默认 1=真实节奏；720≈6h→30s 冒烟）
//   SOAK_SEED    PRNG 种子（默认 42）
//   SOAK_DIR     输出目录（默认 本文件同级 /run）
//
// 运行（脱离进程）：nohup node audit/soak/soak.ts >audit/soak/run/soak.out 2>&1 &

import { appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createEngine, advanceTo, ingest, reap, snapshot, type IngestMoment, type EngineState,
} from '../../engine/index.ts';
import { resolveParams, hashParams, type Params } from '../../engine/params.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const params: Params = resolveParams(JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(join(root, 'params.json'), 'utf8'))));

const HOURS = Number(process.env.SOAK_HOURS ?? 6);
const SPEED = Number(process.env.SOAK_SPEED ?? 1);
const SEED = Number(process.env.SOAK_SEED ?? 42);
const DIR = process.env.SOAK_DIR ?? join(here, 'run');
mkdirSync(DIR, { recursive: true });
const SAMPLES = join(DIR, 'soak-samples.jsonl');
const LISTEN = join(DIR, 'listen.raw.jsonl');   // 监听文件（真实 live 可尾随之）
const DONE = join(DIR, 'soak-done.json');

// ---- 可复现 PRNG（mulberry32）----
let s = SEED >>> 0;
function rng(): number { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const pick = <T>(a: T[]): T => a[Math.floor(rng() * a.length)]!;
const between = (lo: number, hi: number): number => lo + rng() * (hi - lo);

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms / SPEED)));

// ---- 合成会话：真实节奏 5–40s/事件，偶发风暴簇（同 sig 连败）----
const TICK_MS = 50;                 // sim 内 20Hz 推进（reap/snapshot 分辨率）
const WIN = params.stress.repWindowMs;
const startSim = Date.UTC(2026, 0, 1, 9, 0, 0);
const endSim = startSim + HOURS * 3600_000;

interface Emit { special: string; theoT: number; emitSim: number; drift: number; clearedBy?: string }
let events = 0, faults = 0, emits = 0, snaps = 0;
const driftLog: number[] = [];      // STUCK_LOOP/RESOLVE 发射漂移（应≈0）
const expiryAlign: { at: number; err: number }[] = []; // expiry CLEARED 对齐误差 vs 已跑时长

function logLine(o: unknown): void { appendFileSync(SAMPLES, JSON.stringify(o) + '\n'); }

const st: EngineState = createEngine(params);
ingest(st, { kind: 'moment', t: startSim, seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'SESSION_START' }, params);

// ---- 有状态发生器：calm ↔ burst 状态机 ----
// burst = 连败同一 sig（触发 STUCK_LOOP），结局二选一：resolve（同目标 OK → ok型CLEARED+RESOLVE）
// 或 abandon（弃坑不清 → repWindow 后 reap 发 expiry型CLEARED）。后者专为验"过期对齐随时长"。
let seq = 1;
let burstLeft = 0, burstId = 0, burstResolve = false, burstAbandon = false;
function nextEvent(t: number): { raw: string[]; im: IngestMoment } {
  let verb: IngestMoment['verb'], fail: boolean, cmdId: string, errClass: string;
  if (burstAbandon) {                    // 弃坑：转做别的，绝不再碰该 sig（留给 reap 过期）
    burstAbandon = false;
  }
  if (burstLeft > 0) {                    // burst 进行中：连败同一命令
    burstLeft--;
    verb = 'RUN'; cmdId = `loop${burstId}`; fail = true; errClass = 'runtimeerror: shape mismatch';
    if (burstLeft === 0 && burstResolve) { fail = false; errClass = ''; } // 最后一击：成功 → ok清除
  } else {
    // calm：偶发起一个新 burst
    if (rng() < 0.10) {
      burstId++; burstLeft = 2 + Math.floor(rng() * 5); // 3–7 连击（含首）
      burstResolve = rng() < 0.5; burstAbandon = !burstResolve; // 一半 resolve、一半 abandon
      verb = 'RUN'; cmdId = `loop${burstId}`; fail = true; errClass = 'runtimeerror: shape mismatch';
    } else {
      verb = pick(['READ', 'WRITE', 'RUN', 'RUN', 'SAVE'] as const);
      fail = rng() < 0.10;
      cmdId = pick(['ls', 'grep x', 'python a.py', 'tsc', 'node b.js']);
      errClass = fail ? pick(['typeerror: undefined', 'assertionerror', 'enoent']) : '';
    }
  }
  const sig = `${verb}|${cmdId}|${errClass}`;
  const clearSig = `${verb}|Bash|${cmdId}`;
  const m = fail ? Math.max(params.amplitude.failDefault, between(0.1, 0.6)) : between(0.1, 0.5);
  const tags = cmdId === 'tsc' ? ['build'] : [];
  const im: IngestMoment = {
    kind: 'moment', t, seq: seq++, agent: 'main', verb,
    outcome: fail ? 'FAIL' : 'OK', m, tags, sig, clearSig,
  };
  const raw = [
    JSON.stringify({ type: 'assistant', timestamp: new Date(t).toISOString(), message: { role: 'assistant', content: [{ type: 'tool_use', id: `s${im.seq}`, name: 'Bash', input: { command: cmdId } }] } }),
    JSON.stringify({ type: 'user', timestamp: new Date(t + 40).toISOString(), toolUseResult: { durationMs: 40, code: fail ? 1 : 0 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `s${im.seq}`, is_error: fail, content: fail ? errClass : 'ok' }] } }),
  ];
  return { raw, im };
}

function drainDerived(derived: ReturnType<typeof ingest>, nowSim: number): void {
  for (const dv of derived) {
    emits++;
    const theoT = dv.t;
    const drift = nowSim - theoT;                 // 发射时刻(sim now) − 理论时刻
    const e: Emit = { special: dv.special!, theoT, emitSim: nowSim, drift, clearedBy: dv.clearedBy };
    if (dv.special === 'STUCK_CLEARED' && dv.clearedBy === 'expiry') {
      expiryAlign.push({ at: nowSim - startSim, err: drift });
    } else {
      driftLog.push(drift);
    }
    logLine({ kind: 'emit', ...e });
  }
}

async function main(): Promise<void> {
  writeFileSync(SAMPLES, '');   // 清空滚动日志
  writeFileSync(LISTEN, '');
  logLine({ kind: 'meta', startedAt: new Date().toISOString(), hours: HOURS, speed: SPEED, seed: SEED, paramsHash: hashParams(JSON.parse(await import('node:fs').then((fs) => fs.readFileSync(join(root, 'params.json'), 'utf8')))) });

  let simNow = startSim;
  let nextSampleWall = Date.now();
  let lastCpu = process.cpuUsage();
  const wall0 = Date.now();

  while (simNow < endSim) {
    // 生成下一个事件，间隔 5–40s（sim）
    const gap = Math.round(between(5000, 40000));
    const evT = simNow + gap;
    // 在到达事件前，以 20Hz sim tick 推进引擎（reap 检查过期），但不真实 sleep（只 sleep 事件间隔）
    for (let t = simNow + TICK_MS; t < evT; t += TICK_MS) {
      advanceTo(st, t, params);
      drainDerived(reap(st, params), t);          // 过期型 CLEARED 在 tick 上被逮
      snaps++;
      // bounded：不累积 snapshot（live 语义）——仅偶尔取一帧证明可取
    }
    advanceTo(st, evT, params);
    drainDerived(reap(st, params), evT);
    const { raw, im } = nextEvent(evT);
    appendFileSync(LISTEN, raw.join('\n') + '\n');   // 真实监听文件滴写
    events++; if (im.outcome === 'FAIL') faults++;
    drainDerived(ingest(st, im, params), evT);
    void snapshot(st, evT, params);                  // 取一帧（不存）

    simNow = evT;

    // 每分钟（墙钟）采一次 RSS/CPU
    if (Date.now() >= nextSampleWall) {
      const mem = process.memoryUsage();
      const cpu = process.cpuUsage(lastCpu); lastCpu = process.cpuUsage();
      logLine({
        kind: 'sample', wallMs: Date.now() - wall0, simElapsedMin: (simNow - startSim) / 60000,
        rssMB: +(mem.rss / 1048576).toFixed(2), heapMB: +(mem.heapUsed / 1048576).toFixed(2),
        cpuUserMs: +(cpu.user / 1000).toFixed(1), events, faults, emits, sigStates: st.sigStates.size, S: +st.S.toFixed(4),
      });
      nextSampleWall = Date.now() + 60_000;
    }

    await sleep(gap);   // 真实节奏（SPEED 压缩）
  }

  // 收尾统计
  const sorted = [...driftLog].sort((a, b) => a - b);
  const q = (p: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : 0;
  const firstHalf = expiryAlign.filter((e) => e.at < HOURS * 1800_000);
  const secondHalf = expiryAlign.filter((e) => e.at >= HOURS * 1800_000);
  const mean = (a: { err: number }[]) => a.length ? a.reduce((x, e) => x + Math.abs(e.err), 0) / a.length : 0;
  const summary = {
    finishedAt: new Date().toISOString(), wallSec: +((Date.now() - wall0) / 1000).toFixed(1),
    simHours: HOURS, speed: SPEED, seed: SEED,
    events, faults, emits, snapsTicked: snaps,
    driftMs: { n: driftLog.length, min: sorted[0] ?? 0, median: q(0.5), p95: q(0.95), max: sorted[sorted.length - 1] ?? 0 },
    expiryAlignMs: { n: expiryAlign.length, meanAbsFirstHalf: +mean(firstHalf).toFixed(3), meanAbsSecondHalf: +mean(secondHalf).toFixed(3) },
    finalRssMB: +(process.memoryUsage().rss / 1048576).toFixed(2),
    finalSigStates: st.sigStates.size, finalS: +st.S.toFixed(4),
  };
  logLine({ kind: 'done', ...summary });
  writeFileSync(DONE, JSON.stringify(summary, null, 2) + '\n');
  process.stdout.write('SOAK done: ' + JSON.stringify(summary) + '\n');
}

main().catch((e) => { logLine({ kind: 'error', message: (e as Error).message, stack: (e as Error).stack }); writeFileSync(DONE, JSON.stringify({ error: (e as Error).message }) + '\n'); process.exit(1); });
