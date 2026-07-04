// cli replay <tape.tape.jsonl> --out runs/<ts>/ —— 离线跑蒸馏带 → REPORT.md + curve.csv + moments.csv。
// 只消费蒸馏带（§3）。时钟由本文件注入；引擎纯确定性。同带两跑逐字节一致。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename, relative } from 'node:path';
import type { MomentEvent, StatePacket, Weather } from '../protocol/index.ts';
import {
  parseDistilled, healthOf, momentOf, clearSigOf,
  type DistilledMoment, type DistillResult, type HealthCard,
} from '../adapters/claude-jsonl/index.ts';
import {
  createEngine, advanceTo, ingest, addStress, snapshot, reap,
} from '../engine/index.ts';
import { resolveParams, hashParams, type Params } from '../engine/params.ts';

const SNAP_MS = 100;          // curve.csv 采样率 10Hz
const IDLE_CAP_MS = 120_000;  // 单空档最多步进 2min，其余解析跳跃（防多日续跑爆炸）
const ACTIVE_GAP_MS = 600_000; // 占空比分母：相邻采样间隔 <10min 且非 IDLE 相态才计活跃

export type TapeKind = 'smooth' | 'storm' | 'jam' | null;

interface LedgerEntry { t: number; seq: number; label: string; dS: number }

export interface ReplayOutput {
  curveCsv: string;
  momentsCsv: string;
  report: string;
  snaps: StatePacket[];
  emitted: { ev: MomentEvent; emitT: number }[];
  metrics: Metrics;
}

export interface Metrics {
  peakT: number;
  dutyTlt30: number;                 // T<0.30 占活跃时长
  weatherDuty: Record<Weather, number>;
  dutyRainStorm: number;
  stuckEdges: number;
  resolves: number;
  cleared: number;
  jamMonotone: boolean;
}

/** 纯回放：蒸馏带文本 + params → 全部产物（无 fs，供金测试直接调用）。 */
export function replayText(distilledText: string, params: Params, meta: {
  engineSha: string; paramsHash: string; tapeName: string; kind?: TapeKind;
}): ReplayOutput {
  const d = parseDistilled(distilledText);
  const records = d.records; // 已按 (t,seq) 排序，含标点
  const { firstT, lastT } = d.meta.stats;

  const st = createEngine(params);
  const snaps: StatePacket[] = [];
  const emitted: { ev: MomentEvent; emitT: number }[] = [];
  const ledger: LedgerEntry[] = [];

  // 未决 RUN 滴灌区间：[useT+30s, resolveT]，速率 0.02×m /min（m 消费时按原料量算）
  const drips = records
    .filter((r) => (r.verb === 'RUN' || r.verb === 'SAVE') && r.resolveT !== null && !r.special)
    .map((r) => ({
      start: r.useT + params.decay.pendingRunDripAfterSec * 1000,
      end: r.resolveT as number,
      ratePerMs: (params.decay.pendingRunDripPerMin * momentOf(r, params).m) / 60000,
    }))
    .filter((x) => x.end > x.start);
  const dripFor = (a: number, b: number): number => {
    let s = 0;
    for (const x of drips) {
      const lo = Math.max(a, x.start), hi = Math.min(b, x.end);
      if (hi > lo) s += (hi - lo) * x.ratePerMs;
    }
    return s;
  };

  if (firstT === null || lastT === null || records.length === 0) {
    const empty: Metrics = {
      peakT: 0, dutyTlt30: 1, weatherDuty: { CLEAR: 1, OVERCAST: 0, RAIN: 0, STORM: 0 },
      dutyRainStorm: 0, stuckEdges: 0, resolves: 0, cleared: 0, jamMonotone: true,
    };
    return { curveCsv: 'no-events\n', momentsCsv: '', report: '# RUN REPORT\n(空磁带)\n', snaps, emitted, metrics: empty };
  }

  const reapInto = (): void => {
    for (const ev of reap(st, params)) emitted.push({ ev, emitT: ev.t });
  };

  st.now = records[0]!.t;
  snaps.push(snapshot(st, st.now, params));

  const stepGrid = (from: number, to: number): void => {
    let cursor = from;
    let stepped = 0;
    while (cursor < to) {
      if (stepped >= IDLE_CAP_MS && to - cursor > SNAP_MS) {
        advanceTo(st, to, params); reapInto();
        snaps.push(snapshot(st, to, params));
        return;
      }
      const next = Math.min(to, cursor + SNAP_MS);
      const drip = dripFor(cursor, next);
      advanceTo(st, next, params);
      if (drip > 0) addStress(st, drip);
      reapInto();
      snaps.push(snapshot(st, next, params));
      stepped += next - cursor;
      cursor = next;
    }
  };

  let ei = 0;
  let cursor = records[0]!.t;
  while (cursor < lastT || ei < records.length) {
    const nextEvT = ei < records.length ? records[ei]!.t : Infinity;
    const target = Math.min(nextEvT, lastT);
    if (target > cursor) { stepGrid(cursor, target); cursor = target; }
    while (ei < records.length && records[ei]!.t <= cursor) {
      const r = records[ei]!;
      advanceTo(st, r.t, params); reapInto();
      const ev = momentOf(r, params);
      const input = r.special ? ev : Object.assign({}, ev, { clearSig: clearSigOf(r) });
      const before = st.S;
      const derived = ingest(st, input, params);
      ledger.push({ t: r.t, seq: r.seq, label: labelOf(ev), dS: st.S - before });
      emitted.push({ ev, emitT: r.t });
      for (const dv of derived) emitted.push({ ev: dv, emitT: st.now });
      ei++;
    }
    if (cursor >= lastT && ei >= records.length) break;
  }

  const metrics = computeMetrics(snaps, emitted);
  const curveCsv = buildCurveCsv(snaps);
  const momentsCsv = buildMomentsCsv(emitted);
  const report = buildReport({ d, params, snaps, emitted, ledger, metrics, meta });
  return { curveCsv, momentsCsv, report, snaps, emitted, metrics };
}

// ---------- 指标 ----------

function computeMetrics(
  snaps: StatePacket[],
  emitted: { ev: MomentEvent; emitT: number }[],
): Metrics {
  const peakT = snaps.reduce((mx, s) => Math.max(mx, s.T), 0);
  const weatherDuty: Record<Weather, number> = { CLEAR: 0, OVERCAST: 0, RAIN: 0, STORM: 0 };
  let activeTotal = 0, Tlt30 = 0, rainStorm = 0;
  for (let i = 1; i < snaps.length; i++) {
    const gap = snaps[i]!.t - snaps[i - 1]!.t;
    const left = snaps[i - 1]!;
    if (gap <= 0 || gap >= ACTIVE_GAP_MS || left.phase === 'IDLE') continue;
    activeTotal += gap;
    if (left.T < 0.30) Tlt30 += gap;
    weatherDuty[left.weather] += gap;
    if (left.weather === 'RAIN' || left.weather === 'STORM') rainStorm += gap;
  }
  const norm = activeTotal > 0 ? activeTotal : 1;
  return {
    peakT,
    dutyTlt30: activeTotal > 0 ? Tlt30 / norm : 1,
    weatherDuty: {
      CLEAR: weatherDuty.CLEAR / norm, OVERCAST: weatherDuty.OVERCAST / norm,
      RAIN: weatherDuty.RAIN / norm, STORM: weatherDuty.STORM / norm,
    },
    dutyRainStorm: rainStorm / norm,
    stuckEdges: emitted.filter((e) => e.ev.special === 'STUCK_LOOP').length,
    resolves: emitted.filter((e) => e.ev.special === 'RESOLVE').length,
    cleared: emitted.filter((e) => e.ev.special === 'STUCK_CLEARED').length,
    jamMonotone: checkJamMonotone(snaps, emitted),
  };
}

/** 卡碟段内 T 走势单调不减（在同签名 FAIL 命中点抽样，直至 CLEARED 或段末）。 */
function checkJamMonotone(
  snaps: StatePacket[],
  emitted: { ev: MomentEvent; emitT: number }[],
): boolean {
  const Tat = (t: number): number => {
    // 最近的不晚于 t 的采样
    let best = 0;
    for (const s of snaps) { if (s.t <= t) best = s.T; else break; }
    return best;
  };
  const loops = emitted.filter((e) => e.ev.special === 'STUCK_LOOP');
  for (const loop of loops) {
    const sig = loop.ev.sig;
    const start = loop.ev.t;
    const clr = emitted.find((e) => e.ev.special === 'STUCK_CLEARED' && e.ev.sig === sig && e.ev.t >= start);
    const end = clr ? clr.ev.t : Infinity;
    const hits = emitted
      .filter((e) => !e.ev.special && e.ev.outcome === 'FAIL' && e.ev.sig === sig && e.ev.t >= start && e.ev.t <= end)
      .map((e) => Tat(e.ev.t));
    for (let i = 1; i < hits.length; i++) {
      if (hits[i]! < hits[i - 1]! - 1e-6) return false;
    }
  }
  return true;
}

// ---------- CSV ----------

const f6 = (n: number): string => n.toFixed(6);

function buildCurveCsv(snaps: StatePacket[]): string {
  const head = 't,S,T,A,wow,needle,phase,weather';
  const rows = snaps.map((s) =>
    `${s.t},${f6(s.S)},${f6(s.T)},${f6(s.A)},${f6(s.wow)},${f6(s.needle)},${s.phase},${s.weather}`);
  return head + '\n' + rows.join('\n') + '\n';
}

function buildMomentsCsv(emitted: { ev: MomentEvent; emitT: number }[]): string {
  const head = 't,emitT,seq,verb,outcome,m,tags,special,sig,k';
  const rows = emitted.map(({ ev, emitT }) =>
    `${ev.t},${emitT},${ev.seq},${ev.verb},${ev.outcome},${f6(ev.m)},${ev.tags.join('|')},${ev.special ?? ''},${ev.sig ?? ''},${ev.k ?? ''}`);
  return head + '\n' + rows.join('\n') + '\n';
}

function labelOf(ev: MomentEvent): string {
  if (ev.special) return ev.special;
  return `${ev.verb}-${ev.outcome}`;
}

// ---------- REPORT v3（施工令 §7） ----------

const SPARK = '▁▂▃▄▅▆▇█';
function sparkline(vals: number[], cols = 60): string {
  if (vals.length === 0) return '';
  const out: string[] = [];
  for (let i = 0; i < cols; i++) {
    const v = vals[Math.floor((i / cols) * vals.length)] ?? 0;
    out.push(SPARK[Math.min(7, Math.max(0, Math.floor(v * 8)))]!);
  }
  return out.join('');
}

interface JudgeRow { label: string; value: string; ok: boolean }

function kindOf(meta: { tapeName: string; kind?: TapeKind }): TapeKind {
  if (meta.kind) return meta.kind;
  const n = meta.tapeName.toLowerCase();
  if (n.includes('storm')) return 'storm';
  if (n.includes('jam')) return 'jam';
  if (n.includes('smooth')) return 'smooth';
  return null;
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }

function judge(kind: TapeKind, m: Metrics): JudgeRow[] {
  const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
  if (kind === 'smooth') return [
    { label: 'T<0.30 占空 ≥99%', value: pct(m.dutyTlt30), ok: m.dutyTlt30 >= 0.99 },
    { label: 'STUCK_LOOP 边沿数 =0', value: `${m.stuckEdges}`, ok: m.stuckEdges === 0 },
  ];
  if (kind === 'storm') return [
    { label: '峰值 T ∈ [0.65,0.92]', value: m.peakT.toFixed(3), ok: inRange(m.peakT, 0.65, 0.92) },
    { label: 'RAIN+STORM 占空 ∈ [15%,45%]', value: pct(m.dutyRainStorm), ok: inRange(m.dutyRainStorm, 0.15, 0.45) },
    { label: 'RESOLVE 次数 ≥1', value: `${m.resolves}`, ok: m.resolves >= 1 },
    { label: 'STUCK_LOOP 边沿数 ∈ [3,12]', value: `${m.stuckEdges}`, ok: inRange(m.stuckEdges, 3, 12) },
  ];
  if (kind === 'jam') return [
    { label: '峰值 T ∈ [0.50,0.90]', value: m.peakT.toFixed(3), ok: inRange(m.peakT, 0.50, 0.90) },
    { label: 'STUCK_LOOP 边沿数 ∈ [1,3]', value: `${m.stuckEdges}`, ok: inRange(m.stuckEdges, 1, 3) },
    { label: '卡碟段内 T 单调不减', value: m.jamMonotone ? '是' : '否', ok: m.jamMonotone },
  ];
  return [];
}

export function judgementFor(kind: TapeKind, m: Metrics): { rows: JudgeRow[]; allGreen: boolean } {
  const rows = judge(kind, m);
  return { rows, allGreen: rows.length > 0 && rows.every((r) => r.ok) };
}

function buildReport(a: {
  d: DistillResult;
  params: Params;
  snaps: StatePacket[];
  emitted: { ev: MomentEvent; emitT: number }[];
  ledger: LedgerEntry[];
  metrics: Metrics;
  meta: { engineSha: string; paramsHash: string; tapeName: string; kind?: TapeKind };
}): string {
  const { d, snaps, emitted, ledger, metrics, meta } = a;
  const h: HealthCard = healthOf(d);
  const kind = kindOf(meta);
  const Tvals = snaps.map((s) => s.T);

  // 判定表
  const { rows, allGreen } = judgementFor(kind, metrics);
  const judgeTable = rows.length === 0
    ? '_（未指定标准带类型，跳过判定）_'
    : `| 指标 | 实测 | 判定 |\n|---|---|---|\n` +
      rows.map((r) => `| ${r.label} | ${r.value} | ${r.ok ? '✅ PASS' : '❌ FAIL'} |`).join('\n') +
      `\n\n**本带判定：${allGreen ? '✅ 全绿' : '❌ 有越界'}**`;

  // 天气占空比表
  const wd = metrics.weatherDuty;
  const weatherTable = `| CLEAR | OVERCAST | RAIN | STORM |\n|---|---|---|---|\n| ${pct(wd.CLEAR)} | ${pct(wd.OVERCAST)} | ${pct(wd.RAIN)} | ${pct(wd.STORM)} |`;

  // episode 分表
  const epRows = d.meta.episodes.map((ep) => {
    const evs = d.records.filter((r) => r.episode === ep.i && !r.special);
    const fails = evs.filter((r) => r.outcome === 'FAIL').length;
    const ts = evs.map((r) => r.t).sort((x, y) => x - y);
    let active = 0;
    for (let i = 1; i < ts.length; i++) { const g = ts[i]! - ts[i - 1]!; if (g > 0 && g < ACTIVE_GAP_MS) active += g; }
    const inEp = snaps.filter((s) => s.t >= ep.startT && s.t <= ep.endT);
    const peak = inEp.reduce((mx, s) => Math.max(mx, s.T), 0);
    return `| ${ep.i} | ${(active / 60000).toFixed(1)} | ${ep.events} | ${fails} | ${peak.toFixed(3)} |`;
  }).join('\n');

  // 三大拐点：|ΔT| 最大，两两间隔 ≥120s（同簇取最大者）
  const deltas = snaps.slice(1).map((s, i) => ({ t: s.t, dT: s.T - snaps[i]!.T, T: s.T }));
  const sortedByMag = [...deltas].sort((x, y) => Math.abs(y.dT) - Math.abs(x.dT));
  const picked: typeof sortedByMag = [];
  for (const cand of sortedByMag) {
    if (picked.length >= 3) break;
    if (picked.every((p) => Math.abs(p.t - cand.t) >= 120_000)) picked.push(cand);
  }
  picked.sort((x, y) => x.t - y.t);
  const turnBlocks = picked.map((tp, idx) => {
    const lo = tp.t - 30_000, hi = tp.t + 30_000;
    const near = emitted.filter((e) => e.ev.t >= lo && e.ev.t <= hi && (e.ev.special || e.ev.outcome !== 'NA'));
    const account = ledger.filter((l) => l.t >= lo && l.t <= hi && Math.abs(l.dS) > 1e-9)
      .map((l) => `${iso(l.t)} ${l.label} ΔS=${l.dS >= 0 ? '+' : ''}${l.dS.toFixed(3)}`);
    const raw = near.slice(0, 12).map((e) =>
      `${iso(e.ev.t)} ${labelOf(e.ev)}${e.ev.tags.length ? '[' + e.ev.tags.join(',') + ']' : ''}`);
    return `**拐点 ${idx + 1}** @ ${new Date(tp.t).toISOString()} ｜ΔT=${tp.dT >= 0 ? '+' : ''}${tp.dT.toFixed(3)}（T→${tp.T.toFixed(3)}）\n` +
      `- 前后 ±30s 事件：${raw.length ? raw.join('；') : '（无）'}\n` +
      `- 引擎账目：${account.length ? account.join('；') : '（纯衰减/弹簧，无离散充能）'}`;
  }).join('\n\n');

  const healthLine = `活跃${h.activeMin.toFixed(1)}min/墙钟${h.durationMin.toFixed(1)}min｜事件${h.eventCount}｜FAIL${h.failCount}（${(h.failRate * 100).toFixed(1)}%）｜独立签名${h.distinctSigs}｜最大同签名重复${h.maxSameSigRepeat}｜episode ${h.episodeCount}`;

  return `# RUN REPORT
engine ${meta.engineSha} / params ${meta.paramsHash} / tape ${meta.tapeName}${kind ? `（${kind}）` : ''}
蒸馏带 ${d.meta.distiller} / src ${d.meta.sourceHash}
体检表：${healthLine}

## 判定表（施工令 §6）
${judgeTable}

## 天气占空比（占活跃时长）
${weatherTable}

## episode 分表
| # | 活跃min | 事件 | FAIL | 峰值T |
|---|---|---|---|---|
${epRows || '| 0 | — | — | — | — |'}

## 解析
覆盖率 ${(d.meta.stats.parseCoverage * 100).toFixed(1)}%；未知工具: [${Object.keys(d.meta.stats.unknownTools).join(', ') || '无'}]；异常行: ${d.meta.stats.badLines}
配对: ${d.meta.stats.pairedCount}/${d.meta.stats.toolUseCount}；未决(尾随局限): ${d.meta.stats.unpairedToolUse}；sidechain 行 ${d.meta.stats.sidechainLines}（折叠 main）；AskUserQuestion ${d.meta.stats.askToolCount} 次（现映射 ASK）

## 曲线
T 全程：\`${sparkline(Tvals)}\`  (峰值 T=${metrics.peakT.toFixed(3)})
STUCK_LOOP×${metrics.stuckEdges} ｜ STUCK_CLEARED×${metrics.cleared} ｜ RESOLVE×${metrics.resolves}
curve.csv（t,S,T,A,wow,needle,phase,weather）｜moments.csv（含 emitT 直通道延迟）

## 三大拐点抽检（两两间隔 ≥120s）
${turnBlocks || '（事件过少）'}

## 现实修正
逐条见交接件 **FEEDBACK.md**（规范说 X／现实是 Y／我做了 Z）。数字均由 curve/moments CSV 与蒸馏带机器生成，禁手工誊写。
`;
}

function iso(t: number): string { return new Date(t).toISOString().slice(11, 19); }

// ---------- CLI 入口 ----------

export function runReplay(argv: string[]): void {
  const tapePath = argv[0];
  if (!tapePath) { console.error('用法: node cli/index.ts replay <tape.tape.jsonl> [--out runs/<ts>/] [--kind smooth|storm|jam]'); process.exit(2); return; }
  const outIdx = argv.indexOf('--out');
  const kindIdx = argv.indexOf('--kind');
  const kind = (kindIdx >= 0 ? argv[kindIdx + 1] : undefined) as TapeKind | undefined;
  const engineSha = gitSha();
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const paramsHash = hashParams(paramsRaw);

  const tapeText = readFileSync(tapePath, 'utf8');
  const out = replayText(tapeText, params, { engineSha, paramsHash, tapeName: basename(tapePath), kind: kind ?? null });

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const outDir = outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1]! : join(process.cwd(), 'runs', ts);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'curve.csv'), out.curveCsv, 'utf8');
  writeFileSync(join(outDir, 'moments.csv'), out.momentsCsv, 'utf8');
  writeFileSync(join(outDir, 'REPORT.md'), out.report, 'utf8');

  process.stdout.write(out.report);
  process.stdout.write(`\n产出：${relative(process.cwd(), outDir)}/{REPORT.md,curve.csv,moments.csv}\n`);
}

function gitSha(): string {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); }
  catch { return 'nogit'; }
}
