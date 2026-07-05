// cli replay <tape.tape.jsonl> --out runs/<ts>/ [--hz 10|20] —— 离线跑蒸馏带 → REPORT.md + curve.csv + moments.csv。
// 只消费蒸馏带（§3）。时钟由 driver 注入；引擎纯确定性。同带两跑逐字节一致。
// M1.9：回放主回路移入共享因果 driver（cli/driver.ts）——replay 与 live 同核，逐字节等价靠共享代码。
// --hz：默认 10（100ms 存档级，sweep/冠军基准栅格）；20（50ms 渲染级，live 正典频率，内存翻倍自担）。
// 判定由 verdict.json 驱动（M1.6-A §3.4）；雨量 R、机会审计、clearedBy 分列、金时刻评分（REPORT v3.1）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename, relative } from 'node:path';
import type { MomentEvent, StatePacket, Weather } from '../protocol/index.ts';
import {
  parseDistilled, healthOf,
  type DistillResult, type HealthCard,
} from '../adapters/claude-jsonl/index.ts';
import type { DerivedMoment } from '../engine/index.ts';
import { resolveParams, hashParams, hashJson, type Params } from '../engine/params.ts';
import {
  judgeBand, type Verdict, type MetricsView, type JudgeRow, type Landmark, type LandmarkResult,
} from '../engine/verdict.ts';
import {
  createDriver, actionsOf, runActions, ARCHIVE_SNAP_MS,
  type Emit, type LedgerEntry,
} from './driver.ts';

const ACTIVE_GAP_MS = 600_000; // 占空/雨量分母：相邻采样间隔 <10min 且非 IDLE 相态才计活跃

export type TapeKind = 'silence' | 'smooth' | 'busy' | 'jam' | 'storm' | null;

export type { Emit } from './driver.ts';

export interface ReplayMeta {
  engineSha: string; paramsHash: string; tapeName: string; kind?: TapeKind;
  verdict?: Verdict; verdictHash?: string;
}

export interface ReplayOutput {
  curveCsv: string;
  momentsCsv: string;
  report: string;
  snaps: StatePacket[];
  emitted: Emit[];
  metrics: Metrics;
}

export interface Metrics {
  peakT: number;
  dutyTlt30: number;                 // T<0.30 占活跃时长
  weatherDuty: Record<Weather, number>;
  dutyRainStorm: number;
  rainR: number;                     // 全带雨量 ∫max(0,T−floor)dt，单位 T·min（M1.6-A §2）
  stuckEdges: number;
  resolves: number;
  cleared: number;                   // STUCK_CLEARED 总数
  clearedOk: number;                 // ok 型（同目标 OK 破卡碟）
  clearedExpiry: number;             // expiry 型（窗口过期消散）
  opportunities: number;             // 机会数 = test-OK + SAVE-OK + 破卡碟（§5）
  oppTestOk: number;
  oppSaveOk: number;
  oppJamBreak: number;
  jamMonotone: boolean;
}

/** Metrics → verdict 判定视图。 */
export function toMetricsView(m: Metrics): MetricsView {
  return {
    peakT: m.peakT, dutyTlt30: m.dutyTlt30, dutyRainStorm: m.dutyRainStorm,
    rainR: m.rainR, stuckEdges: m.stuckEdges, resolves: m.resolves,
    opportunities: m.opportunities, jamMonotone: m.jamMonotone,
  };
}

export interface ReplayCore { d: DistillResult; snaps: StatePacket[]; emitted: Emit[]; ledger: LedgerEntry[]; metrics: Metrics }

/** 纯回放引擎核（无 fs、无字符串产物）：蒸馏带 + params + 雨量 floor → 采样/时刻/指标。sweep 走此轻路。
 *  M1.9：主回路 = 共享因果 driver（actionsOf → runActions），replay 与 live 同核。 */
export function replayCore(distilledText: string, params: Params, rainFloor: number, snapMs: number = ARCHIVE_SNAP_MS): ReplayCore {
  const d = parseDistilled(distilledText);
  const records = d.records; // 已按 (t,seq) 排序，含标点
  const { firstT, lastT } = d.meta.stats;

  const snaps: StatePacket[] = [];
  const emitted: Emit[] = [];
  const ledger: LedgerEntry[] = [];

  if (firstT === null || lastT === null || records.length === 0) {
    const empty: Metrics = {
      peakT: 0, dutyTlt30: 1, weatherDuty: { CLEAR: 1, OVERCAST: 0, RAIN: 0, STORM: 0 },
      dutyRainStorm: 0, rainR: 0, stuckEdges: 0, resolves: 0, cleared: 0, clearedOk: 0, clearedExpiry: 0,
      opportunities: 0, oppTestOk: 0, oppSaveOk: 0, oppJamBreak: 0, jamMonotone: true,
    };
    return { d, snaps, emitted, ledger, metrics: empty };
  }

  // replay 收集数组（报告需要）；live 的 sinks 写完即丢——bounded 是 live 的纪律，不是 driver 的负担
  const driver = createDriver(params, snapMs, {
    snap: (s) => snaps.push(s),
    moment: (e) => emitted.push(e),
    ledger: (l) => ledger.push(l),
  });
  const streamEnd = records[records.length - 1]!.t;
  runActions(driver, actionsOf(records, streamEnd), streamEnd);

  const metrics = computeMetrics(snaps, emitted, rainFloor);
  return { d, snaps, emitted, ledger, metrics };
}

/** 纯回放：蒸馏带文本 + params → 全部产物（CSV/REPORT）。金测试/CLI 用。 */
export function replayText(distilledText: string, params: Params, meta: ReplayMeta, snapMs: number = ARCHIVE_SNAP_MS): ReplayOutput {
  const rainFloor = meta.verdict?.rain.floor ?? 0.5;
  const core = replayCore(distilledText, params, rainFloor, snapMs);
  if (core.snaps.length === 0) {
    return { curveCsv: 'no-events\n', momentsCsv: '', report: '# RUN REPORT\n(空磁带)\n', snaps: core.snaps, emitted: core.emitted, metrics: core.metrics };
  }
  const curveCsv = buildCurveCsv(core.snaps);
  const momentsCsv = buildMomentsCsv(core.emitted);
  const report = buildReport({ d: core.d, snaps: core.snaps, emitted: core.emitted, ledger: core.ledger, metrics: core.metrics, meta });
  return { curveCsv, momentsCsv, report, snaps: core.snaps, emitted: core.emitted, metrics: core.metrics };
}

// ---------- 指标 ----------

/** 雨量积分 ∫max(0,T−floor)dt（T·min），限 [loT,hiT] 且仅活跃采样。 */
function rainROver(snaps: StatePacket[], loT: number, hiT: number, floor: number): number {
  let r = 0;
  for (let i = 1; i < snaps.length; i++) {
    const left = snaps[i - 1]!;
    const gap = snaps[i]!.t - left.t;
    if (gap <= 0 || gap >= ACTIVE_GAP_MS || left.phase === 'IDLE') continue;
    if (left.t < loT || left.t > hiT) continue;
    if (left.T > floor) r += (left.T - floor) * (gap / 60000);
  }
  return r;
}

function computeMetrics(snaps: StatePacket[], emitted: Emit[], rainFloor: number): Metrics {
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
  const src = emitted.filter((e) => !e.ev.special);
  const oppTestOk = src.filter((e) => e.ev.verb === 'RUN' && e.ev.outcome === 'OK' && e.ev.tags.includes('test')).length;
  const oppSaveOk = src.filter((e) => e.ev.verb === 'SAVE' && e.ev.outcome === 'OK').length;
  const clearedOk = emitted.filter((e) => e.ev.special === 'STUCK_CLEARED' && e.ev.clearedBy === 'ok').length;
  const clearedExpiry = emitted.filter((e) => e.ev.special === 'STUCK_CLEARED' && e.ev.clearedBy === 'expiry').length;
  const opportunities = oppTestOk + oppSaveOk + clearedOk;
  return {
    peakT,
    dutyTlt30: activeTotal > 0 ? Tlt30 / norm : 1,
    weatherDuty: {
      CLEAR: weatherDuty.CLEAR / norm, OVERCAST: weatherDuty.OVERCAST / norm,
      RAIN: weatherDuty.RAIN / norm, STORM: weatherDuty.STORM / norm,
    },
    dutyRainStorm: rainStorm / norm,
    rainR: rainROver(snaps, -Infinity, Infinity, rainFloor),
    stuckEdges: emitted.filter((e) => e.ev.special === 'STUCK_LOOP').length,
    resolves: emitted.filter((e) => e.ev.special === 'RESOLVE').length,
    cleared: clearedOk + clearedExpiry,
    clearedOk, clearedExpiry,
    opportunities, oppTestOk, oppSaveOk, oppJamBreak: clearedOk,
    jamMonotone: checkJamMonotone(snaps, emitted),
  };
}

/** 卡碟段内 T 走势单调不减（在**同目标槽** FAIL 命中点抽样，直至 CLEARED 或段末）。
 *  M1.8-F③：按 slot（目标槽）分组，非 errClass sig；F2 快修：Tat 二分（去 super-linear）。 */
function checkJamMonotone(snaps: StatePacket[], emitted: Emit[]): boolean {
  const Tat = (t: number): number => {
    // snaps 按 t 升序 → 二分找 ≤t 的最后一个
    let lo = 0, hi = snaps.length - 1, best = -1;
    while (lo <= hi) { const md = (lo + hi) >> 1; if (snaps[md]!.t <= t) { best = md; lo = md + 1; } else hi = md - 1; }
    return best >= 0 ? snaps[best]!.T : 0;
  };
  const slotOf = (e: Emit): string | undefined => (e.ev as DerivedMoment).slot;
  const loops = emitted.filter((e) => e.ev.special === 'STUCK_LOOP');
  for (const loop of loops) {
    const slot = slotOf(loop);
    const start = loop.ev.t;
    const clr = emitted.find((e) => e.ev.special === 'STUCK_CLEARED' && slotOf(e) === slot && e.ev.t >= start);
    const end = clr ? clr.ev.t : Infinity;
    const hits = emitted
      .filter((e) => !e.ev.special && e.ev.outcome === 'FAIL' && slotOf(e) === slot && e.ev.t >= start && e.ev.t <= end)
      .map((e) => Tat(e.ev.t));
    for (let i = 1; i < hits.length; i++) {
      if (hits[i]! < hits[i - 1]! - 1e-6) return false;
    }
  }
  return true;
}

// ---------- 金时刻评分（M1.6-A §4，本轮记分不拦路） ----------

export function evalLandmarks(landmarks: Landmark[], kind: TapeKind, snaps: StatePacket[], episodes: DistillResult['meta']['episodes'], emitted: Emit[]): LandmarkResult[] {
  const out: LandmarkResult[] = [];
  const R = (id: string, desc: string, ok: boolean, na: boolean, detail: string): LandmarkResult => ({ id, desc, ok, na, detail });
  for (const l of landmarks.filter((x) => x.tape === kind)) {
    if (l.kind === 'peakInWindow') {
      const lo = Date.parse(l.fromUtc!), hi = Date.parse(l.toUtc!);
      const win = snaps.filter((s) => s.t >= lo && s.t <= hi);
      const peak = win.reduce((mx, s) => Math.max(mx, s.T), 0);
      out.push(R(l.id, l.desc, peak >= (l.minPeakT ?? 0), false, `窗内峰值 T=${peak.toFixed(3)}（阈 ≥${l.minPeakT}）`));
    } else if (l.kind === 'decayAfterClear') {
      // 自定位（M1.7 §1.2）：末次 STUCK_CLEARED 后，首个 ≥windowSec 无充能(无FAIL)区间；前置不满足→N/A
      const clears = emitted.filter((e) => e.ev.special === 'STUCK_CLEARED').map((e) => e.ev.t);
      const winMs = (l.windowSec ?? 120) * 1000;
      const lastSnapT = snaps.length ? snaps[snaps.length - 1]!.t : 0;
      if (clears.length === 0) { out.push(R(l.id, l.desc, false, true, '前置不满足：全带无 STUCK_CLEARED → N/A')); continue; }
      const lastClear = Math.max(...clears);
      const fails = emitted.filter((e) => !e.ev.special && e.ev.outcome === 'FAIL' && e.ev.t >= lastClear).map((e) => e.ev.t);
      let a: number | null = null;
      for (const s of snaps) {
        if (s.t < lastClear) continue;
        if (s.t + winMs > lastSnapT) break; // 窗超出磁带
        if (!fails.some((ft) => ft >= s.t && ft <= s.t + winMs)) { a = s.t; break; }
      }
      if (a === null) { out.push(R(l.id, l.desc, false, true, '末次破卡碟后无 ≥120s 无充能区间 → N/A')); continue; }
      const win = snaps.filter((s) => s.t >= a! && s.t <= a! + winMs);
      const t0 = win[0]!.T, tEnd = win[win.length - 1]!.T;
      let nonInc = true;
      for (let i = 1; i < win.length; i++) if (win[i]!.T > win[i - 1]!.T + 1e-6) { nonInc = false; break; }
      const relDrop = t0 > 1e-9 ? (t0 - tEnd) / t0 : 0;
      out.push(R(l.id, l.desc, nonInc && relDrop >= (l.minRelDrop ?? 0), false, `自定位窗 @${iso(a)}：非增=${nonInc}，降=${(relDrop * 100).toFixed(1)}%（阈 ≥${((l.minRelDrop ?? 0) * 100).toFixed(0)}%）`));
    } else if (l.kind === 'peakEpisode') {
      const gp = snaps.reduce((acc, s) => (s.T > acc.T ? s : acc), snaps[0]!);
      const ep = episodes.find((e) => gp.t >= e.startT && gp.t <= e.endT);
      out.push(R(l.id, l.desc, ep?.i === l.episode, false, `全局峰值 T=${gp.T.toFixed(3)} 落在 episode ${ep?.i ?? '?'}（要求 ${l.episode}）`));
    }
  }
  return out;
}

// ---------- CSV ----------

const f6 = (n: number): string => n.toFixed(6);

export function buildCurveCsv(snaps: StatePacket[]): string {
  // M1.9 §1.2：+pendingAsk 列（产物格式，协议不动）——舞台琥珀管的呼吸信号
  const head = 't,S,T,A,wow,needle,phase,weather,pendingAsk';
  const rows = snaps.map((s) =>
    `${s.t},${f6(s.S)},${f6(s.T)},${f6(s.A)},${f6(s.wow)},${f6(s.needle)},${s.phase},${s.weather},${s.pendingAsk ? 1 : 0}`);
  return head + '\n' + rows.join('\n') + '\n';
}

export function buildMomentsCsv(emitted: Emit[]): string {
  const head = 't,emitT,seq,verb,outcome,m,tags,special,sig,k,clearedBy,slot';
  const rows = emitted.map(({ ev, emitT }) =>
    `${ev.t},${emitT},${ev.seq},${ev.verb},${ev.outcome},${f6(ev.m)},${ev.tags.join('|')},${ev.special ?? ''},${ev.sig ?? ''},${ev.k ?? ''},${ev.clearedBy ?? ''},${(ev as DerivedMoment).slot ?? ''}`);
  return head + '\n' + rows.join('\n') + '\n';
}

function labelOf(ev: MomentEvent): string {
  if (ev.special) return ev.special;
  return `${ev.verb}-${ev.outcome}`;
}

// ---------- REPORT v3.1 ----------

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

function kindOf(meta: ReplayMeta): TapeKind {
  if (meta.kind) return meta.kind;
  const n = meta.tapeName.toLowerCase();
  for (const k of ['silence', 'smooth', 'busy', 'jam', 'storm'] as const) if (n.includes(k)) return k;
  return null;
}

function pct(x: number): string { return `${(x * 100).toFixed(1)}%`; }

/** 供 sweep/报告共用：verdict + kind + metrics → 判定。 */
export function judgeFor(verdict: Verdict | undefined, kind: TapeKind, m: Metrics): { rows: JudgeRow[]; allGreen: boolean } {
  if (!verdict || !kind || !verdict.bands[kind]) return { rows: [], allGreen: false };
  return judgeBand(verdict.bands[kind], toMetricsView(m));
}

function buildReport(a: {
  d: DistillResult;
  snaps: StatePacket[];
  emitted: Emit[];
  ledger: LedgerEntry[];
  metrics: Metrics;
  meta: ReplayMeta;
}): string {
  const { d, snaps, emitted, ledger, metrics, meta } = a;
  const h: HealthCard = healthOf(d);
  const kind = kindOf(meta);
  const Tvals = snaps.map((s) => s.T);
  const floor = meta.verdict?.rain.floor ?? 0.5;

  // 判定表（verdict 驱动，status 三态）
  const { rows, allGreen } = judgeFor(meta.verdict, kind, metrics);
  const mark = (r: JudgeRow): string =>
    r.status === 'retired' ? '⊘ 退役·不计分'
      : r.status === 'informational' ? (r.ok ? 'ℹ 记分·达' : 'ℹ 记分·未达')
        : (r.ok ? '✅ PASS' : '❌ FAIL');
  const judgeTable = rows.length === 0
    ? '_（未指定标准带类型或缺 verdict，跳过判定）_'
    : `| 指标 | 实测 | 判定(status) |\n|---|---|---|\n` +
      rows.map((r) => `| ${r.label} | ${r.value} | ${mark(r)} |`).join('\n') +
      `\n\n**本带判定：${allGreen ? '✅ 全绿（active 全过）' : '❌ 有 active 越界'}**`;

  // 机会审计（§5）
  const oppTable = `| test-OK | SAVE-OK | 破卡碟(ok型) | 机会合计 | RESOLVE 实发 |\n|---|---|---|---|---|\n` +
    `| ${metrics.oppTestOk} | ${metrics.oppSaveOk} | ${metrics.oppJamBreak} | ${metrics.opportunities} | ${metrics.resolves} |`;

  // 天气占空 + 雨量
  const wd = metrics.weatherDuty;
  const weatherTable = `| CLEAR | OVERCAST | RAIN | STORM | 雨量R(全带) |\n|---|---|---|---|---|\n| ${pct(wd.CLEAR)} | ${pct(wd.OVERCAST)} | ${pct(wd.RAIN)} | ${pct(wd.STORM)} | ${metrics.rainR.toFixed(2)} T·min |`;

  // episode 分表（含每段雨量）
  const epRows = d.meta.episodes.map((ep) => {
    const evs = d.records.filter((r) => r.episode === ep.i && !r.special);
    const fails = evs.filter((r) => r.outcome === 'FAIL').length;
    const ts = evs.map((r) => r.t).sort((x, y) => x - y);
    let active = 0;
    for (let i = 1; i < ts.length; i++) { const g = ts[i]! - ts[i - 1]!; if (g > 0 && g < ACTIVE_GAP_MS) active += g; }
    const inEp = snaps.filter((s) => s.t >= ep.startT && s.t <= ep.endT);
    const peak = inEp.reduce((mx, s) => Math.max(mx, s.T), 0);
    const rE = rainROver(snaps, ep.startT, ep.endT, floor);
    return `| ${ep.i} | ${(active / 60000).toFixed(1)} | ${ep.events} | ${fails} | ${peak.toFixed(3)} | ${rE.toFixed(2)} |`;
  }).join('\n');

  // 金时刻评分（informational，记分不拦路；N/A≠FAIL）
  const lms = meta.verdict ? evalLandmarks(meta.verdict.landmarks, kind, snaps, d.meta.episodes, emitted) : [];
  const lmTable = lms.length === 0 ? '_（本带无金时刻）_'
    : `| 金时刻 | 断言 | 结果 | 明细 |\n|---|---|---|---|\n` +
      lms.map((l) => `| ${l.id} | ${l.desc} | ${l.na ? 'N/A' : l.ok ? '✅' : '❌'} | ${l.detail} |`).join('\n') +
      `\n\n_金时刻本轮 informational（记分不拦路）；N/A=前置不满足，不算 FAIL（M1.7 §1.2）。_`;

  // 三大拐点：|ΔT| 最大，两两间隔 ≥120s
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

  return `# RUN REPORT v3.1
engine ${meta.engineSha} / params ${meta.paramsHash} / verdict ${meta.verdictHash ?? '—'} / tape ${meta.tapeName}${kind ? `（${kind}）` : ''}
蒸馏带 ${d.meta.distiller} / src ${d.meta.sourceHash}
体检表：${healthLine}

## 判定表（verdict.json 驱动）
${judgeTable}

## 机会审计（§5：机会数=test-OK+SAVE-OK+破卡碟）
${oppTable}

## 天气占空比（占活跃时长）+ 雨量 R（换尺 M1.6-A §2）
${weatherTable}

## episode 分表（含每段雨量 R）
| # | 活跃min | 事件 | FAIL | 峰值T | 雨量R |
|---|---|---|---|---|---|
${epRows || '| 0 | — | — | — | — | — |'}

## 金时刻评分（M1.6-A §4）
${lmTable}

## 卡碟解除分列（clearedBy）
STUCK_LOOP×${metrics.stuckEdges} ｜ STUCK_CLEARED×${metrics.cleared}（ok型 ${metrics.clearedOk} / expiry型 ${metrics.clearedExpiry}）｜ RESOLVE×${metrics.resolves}
_纪律：expiry 型消散不泄能、不 RESOLVE（§2.1）。_

## 解析
覆盖率 ${(d.meta.stats.parseCoverage * 100).toFixed(1)}%；未知工具: [${Object.keys(d.meta.stats.unknownTools).join(', ') || '无'}]；异常行: ${d.meta.stats.badLines}
配对: ${d.meta.stats.pairedCount}/${d.meta.stats.toolUseCount}；未决(尾随局限): ${d.meta.stats.unpairedToolUse}；sidechain 行 ${d.meta.stats.sidechainLines}（折叠 main）

## 曲线
T 全程：\`${sparkline(Tvals)}\`  (峰值 T=${metrics.peakT.toFixed(3)})
curve.csv（t,S,T,A,wow,needle,phase,weather,pendingAsk）｜moments.csv（+clearedBy 列）

## 三大拐点抽检（两两间隔 ≥120s）
${turnBlocks || '（事件过少）'}

## 现实修正
逐条见交接件 **FEEDBACK.md**（规范说 X／现实是 Y／我做了 Z）。数字均由 curve/moments CSV 与蒸馏带机器生成，禁手工誊写。
`;
}

function iso(t: number): string { return new Date(t).toISOString().slice(11, 19); }

// ---------- CLI 入口 ----------

export function loadVerdict(): { verdict: Verdict; hash: string } {
  const raw = JSON.parse(readFileSync(new URL('../verdict.json', import.meta.url), 'utf8'));
  return { verdict: raw as Verdict, hash: hashJson(raw) };
}

export function runReplay(argv: string[]): void {
  const tapePath = argv[0];
  if (!tapePath) { console.error('用法: node cli/index.ts replay <tape.tape.jsonl> [--out runs/<ts>/] [--kind silence|smooth|busy|jam|storm] [--hz 10|20]'); process.exit(2); return; }
  const outIdx = argv.indexOf('--out');
  const kindIdx = argv.indexOf('--kind');
  const kind = (kindIdx >= 0 ? argv[kindIdx + 1] : undefined) as TapeKind | undefined;
  // M1.9 §1.2：--hz 旗标。默认 10（100ms 存档级）；20（50ms 渲染级，live 正典频率，内存翻倍自担）。
  const hzIdx = argv.indexOf('--hz');
  const hz = hzIdx >= 0 ? Number(argv[hzIdx + 1]) : 10;
  if (!Number.isFinite(hz) || hz < 1 || hz > 100) { console.error(`--hz 非法: ${argv[hzIdx + 1]}（允许 1–100，正典 10 存档 / 20 渲染）`); process.exit(2); return; }
  const snapMs = Math.round(1000 / hz);
  const engineSha = gitSha();
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const paramsHash = hashParams(paramsRaw);
  const { verdict, hash: verdictHash } = loadVerdict();

  const tapeText = readFileSync(tapePath, 'utf8');
  const out = replayText(tapeText, params, { engineSha, paramsHash, tapeName: basename(tapePath), kind: kind ?? null, verdict, verdictHash }, snapMs);

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
