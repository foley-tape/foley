// cli replay <tape.jsonl> --out runs/<ts>/ —— 离线跑带 → REPORT.md + curve.csv + moments.csv（§8/§11）。
// 时钟由本文件注入；引擎纯确定性。同带两跑逐字节一致。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename, relative } from 'node:path';
import type { MomentEvent, StatePacket } from '../protocol/index.ts';
import { parseTape, type TimedMoment } from '../adapters/claude-jsonl/index.ts';
import { healthOf } from '../adapters/claude-jsonl/index.ts';
import {
  createEngine, advanceTo, ingest, addStress, snapshot,
} from '../engine/index.ts';
import { resolveParams, hashParams, type Params } from '../engine/params.ts';

const SNAP_MS = 100;          // curve.csv 采样率 10Hz（总线为 20Hz；此为下采样产物）
const IDLE_CAP_MS = 120_000;  // 单空档最多步进 2min，其余解析跳跃（防多日续跑爆炸）

interface LedgerEntry { t: number; seq: number; label: string; dS: number }

export interface ReplayOutput {
  curveCsv: string;
  momentsCsv: string;
  report: string;
  snaps: StatePacket[];
  emitted: { ev: MomentEvent; emitT: number }[];
}

/** 纯回放：tape 文本 + params → 全部产物（无 fs，供金测试直接调用）。 */
export function replayText(tapeText: string, params: Params, meta: {
  engineSha: string; paramsHash: string; tapeName: string;
}): ReplayOutput {
  const parsed = parseTape(tapeText);
  const events = parsed.timed; // 已按 t,seq 排序
  const { firstT, lastT } = parsed.stats;

  const st = createEngine(params);
  const snaps: StatePacket[] = [];
  const emitted: { ev: MomentEvent; emitT: number }[] = [];
  const ledger: LedgerEntry[] = [];

  // 预计算未决 RUN 滴灌区间：[useT+30s, resolveT]，速率 0.02×m /min
  const drips = events
    .filter((e): e is TimedMoment => (e.verb === 'RUN' || e.verb === 'SAVE') && e.resolveT !== null)
    .map((e) => ({
      start: e.useT + params.decay.pendingRunDripAfterSec * 1000,
      end: e.resolveT as number,
      ratePerMs: (params.decay.pendingRunDripPerMin * e.m) / 60000,
    }))
    .filter((d) => d.end > d.start);

  const dripFor = (a: number, b: number): number => {
    let s = 0;
    for (const d of drips) {
      const lo = Math.max(a, d.start), hi = Math.min(b, d.end);
      if (hi > lo) s += (hi - lo) * d.ratePerMs;
    }
    return s;
  };

  if (firstT === null || lastT === null) {
    return { curveCsv: 'no-events', momentsCsv: '', report: '# RUN REPORT\n(空磁带)\n', snaps, emitted };
  }

  st.now = firstT;
  snaps.push(snapshot(st, firstT, params));

  // 步进一段 [from,to]，带空档压缩；推进 st 并采样 snaps
  const stepGrid = (from: number, to: number): void => {
    let cursor = from;
    let stepped = 0;
    while (cursor < to) {
      if (stepped >= IDLE_CAP_MS && to - cursor > SNAP_MS) {
        // 空档过长：解析跳跃到段末（衰减自然处理，弹簧已稳定）
        advanceTo(st, to, params);
        snaps.push(snapshot(st, to, params));
        return;
      }
      const next = Math.min(to, cursor + SNAP_MS);
      const drip = dripFor(cursor, next);
      advanceTo(st, next, params);
      if (drip > 0) addStress(st, drip);
      snaps.push(snapshot(st, next, params));
      stepped += next - cursor;
      cursor = next;
    }
  };

  let ei = 0;
  let cursor = firstT;
  while (cursor < lastT || ei < events.length) {
    const nextEvT = ei < events.length ? events[ei]!.t : Infinity;
    const target = Math.min(nextEvT, lastT);
    if (target > cursor) { stepGrid(cursor, target); cursor = target; }
    // 摄入 target 处全部事件（直通道：ASK/DONE/ASK_CLEARED 及一切在回放中 emitT=t）
    while (ei < events.length && events[ei]!.t <= cursor) {
      const ev = events[ei]!;
      advanceTo(st, ev.t, params);
      const before = st.S;
      const derived = ingest(st, ev, params);
      ledger.push({ t: ev.t, seq: ev.seq, label: labelOf(ev), dS: st.S - before });
      emitted.push({ ev: stripTimed(ev), emitT: ev.t });
      for (const d of derived) emitted.push({ ev: d, emitT: st.now });
      ei++;
    }
    if (cursor >= lastT && ei >= events.length) break;
  }

  const curveCsv = buildCurveCsv(snaps);
  const momentsCsv = buildMomentsCsv(emitted);
  const report = buildReport({ parsed, params, snaps, emitted, ledger, meta });
  return { curveCsv, momentsCsv, report, snaps, emitted };
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
function stripTimed(ev: TimedMoment): MomentEvent {
  const { useT, resolveT, ...clean } = ev; void useT; void resolveT; return clean;
}

// ---------- REPORT（§11 固定结构） ----------

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

function weatherHint(T: number, params: Params): string {
  const { up } = params.weather;
  const label = T >= up.STORM ? '暴雨' : T >= up.RAIN ? '雨' : T >= up.OVERCAST ? '多云' : '晴';
  return `峰值只到「${label}」`;
}

function buildReport(a: {
  parsed: ReturnType<typeof parseTape>;
  params: Params;
  snaps: StatePacket[];
  emitted: { ev: MomentEvent; emitT: number }[];
  ledger: LedgerEntry[];
  meta: { engineSha: string; paramsHash: string; tapeName: string };
}): string {
  const { parsed, params, snaps, emitted, ledger, meta } = a;
  const h = healthOf(parsed);
  const Tvals = snaps.map((s) => s.T);
  const peakT = Math.max(...Tvals);
  const stuck = emitted.filter((e) => e.ev.special === 'STUCK_LOOP').length;
  const resolves = emitted.filter((e) => e.ev.special === 'RESOLVE').length;

  // 三大拐点：相邻 snap 的 |ΔT| 最大 3 处
  const deltas = snaps.slice(1).map((s, i) => ({ t: s.t, dT: s.T - snaps[i]!.T, T: s.T }));
  const top3 = [...deltas].sort((x, y) => Math.abs(y.dT) - Math.abs(x.dT)).slice(0, 3)
    .sort((x, y) => x.t - y.t);

  const turnBlocks = top3.map((tp, idx) => {
    const lo = tp.t - 30_000, hi = tp.t + 30_000;
    const near = emitted.filter((e) => e.ev.t >= lo && e.ev.t <= hi && (e.ev.special || e.ev.outcome !== 'NA'));
    const account = ledger.filter((l) => l.t >= lo && l.t <= hi && Math.abs(l.dS) > 1e-9)
      .map((l) => `${new Date(l.t).toISOString().slice(11, 19)} ${l.label} ΔS=${l.dS >= 0 ? '+' : ''}${l.dS.toFixed(3)}`);
    const raw = near.slice(0, 12).map((e) =>
      `${new Date(e.ev.t).toISOString().slice(11, 19)} ${labelOf(e.ev)}${e.ev.tags.length ? '[' + e.ev.tags.join(',') + ']' : ''}`);
    return `**拐点 ${idx + 1}** @ ${new Date(tp.t).toISOString()} ｜ΔT=${tp.dT >= 0 ? '+' : ''}${tp.dT.toFixed(3)}（T→${tp.T.toFixed(3)}）\n` +
      `- 前后 ±30s 事件：${raw.length ? raw.join('；') : '（无）'}\n` +
      `- 引擎账目：${account.length ? account.join('；') : '（纯衰减/弹簧，无离散充能）'}`;
  }).join('\n\n');

  const healthLine = `活跃${h.activeMin.toFixed(1)}min/墙钟${h.durationMin.toFixed(1)}min｜事件${h.eventCount}｜FAIL${h.failCount}（${(h.failRate * 100).toFixed(1)}%）｜独立签名${h.distinctSigs}｜最大同签名重复${h.maxSameSigRepeat}`;

  return `# RUN REPORT
engine ${meta.engineSha} / params ${meta.paramsHash} / tape ${meta.tapeName}
体检表：${healthLine}

## 解析
覆盖率 ${(parsed.stats.parseCoverage * 100).toFixed(1)}%；未知工具: [${Object.keys(parsed.stats.unknownTools).join(', ') || '无'}]；异常行: ${parsed.stats.badLines}
配对: ${parsed.stats.pairedCount}/${parsed.stats.toolUseCount}；未决(尾随局限): ${parsed.stats.unpairedToolUse}

## 现实修正
逐条见交接件 **FEEDBACK.md**（规范说 X／现实是 Y／我做了 Z）。本带特有：墙钟 ${h.durationMin.toFixed(0)}min / 活跃 ${h.activeMin.toFixed(0)}min（多日续跑，回放对 >2min 空档做压缩）；AskUserQuestion ${parsed.stats.askToolCount} 次（归 OTHER 计数上报）。

## 曲线
T 全程：\`${sparkline(Tvals)}\`  (峰值 T=${peakT.toFixed(3)})
STUCK_LOOP×${stuck} ｜ RESOLVE×${resolves}
curve.csv（t,S,T,A,wow,needle,phase,weather）｜moments.csv（含 emitT 直通道延迟）

## 三大拐点抽检
${turnBlocks || '（事件过少）'}

## 校准问卷 v2（意图版·凭你想要它成为什么，不需记得那天）
> 每份报告已把峰值/天气打在上面。你只需照直觉判断"该不该是这样"。

Q1 这卷带的强度（本带峰值 T=${peakT.toFixed(2)}、${weatherHint(peakT, params)}），你觉得**该到哪一档**？晴/多云/雨/暴雨。
Q2 失败之后，张力该"**来得快去得快**"还是"**攒着劲慢慢消**"？（决定衰减 τ）
Q3 通过测试/提交那一刻的"如释重负"，要多明显的下坠？（决定泄能系数与 RESOLVE 门槛；本带 RESOLVE×${resolves}）
Q4 卡碟（STUCK_LOOP，本带×${stuck}）触发的**密度**对吗——太吵/太哑/正好？
Q5 一眼看去哪条"算错了"？（例：失败读几乎不涨张力——见 FEEDBACK.md【二】）
`;
}

// ---------- CLI 入口 ----------

export function runReplay(argv: string[]): void {
  const tapePath = argv[0];
  if (!tapePath) { console.error('用法: node cli/index.ts replay <tape.jsonl> [--out runs/<ts>/]'); process.exit(2); return; }
  const outIdx = argv.indexOf('--out');
  const engineSha = gitSha();
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const paramsHash = hashParams(paramsRaw);

  const tapeText = readFileSync(tapePath, 'utf8');
  const out = replayText(tapeText, params, { engineSha, paramsHash, tapeName: basename(tapePath) });

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
