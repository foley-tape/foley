// 共享因果驱动核（M1.9 §1.1）—— replay 与 live 消费同一个 driver，"replay ≡ live" 靠共享代码成立，
// 由金测试（golden/m19.test.ts）证明，而非两份实现的巧合。
//
// 因果纪律（live 不许知道未来，replay 便也不许用未来）：
//  - 滴灌（§6.2 未决 RUN，B-5 结案）：m 不再取"终值幅度"（live 在挂起时不可知），改为
//    m(τ)=amp((τ−useT)/1000, runSecCap) 随挂起时长爬坡——越挂越重，恰合"它是不是挂了？"。
//    积分用闭式（∫ln(1+e)de 有原函数）：滴灌**总量**与采样栅格无关；滴灌-衰减交错仍按栅格
//    离散（10Hz vs 20Hz 存在二阶小量差，金测试以容差断言），同栅格逐字节一致。
//    未决（resolveT=null）滴灌到流结束——真挂起恰是滴灌命名的场景，不再被过滤。
//  - ASK 窗（live 侧 ASK 以显式 AskUserQuestion 为准）：ASK 在 useT 落地（outcome=NA，挂 pendingAsk），
//    resolveT 发 ASK_CLEARED——回答落地才解除 WAITING。修正 v0 缺陷：pendingAsk 从无人清除。
//  - DONE 因果延迟：episode 尾的 DONE 物理上要等 30min 空档才可知；batch 侧同样延迟到
//    检测时刻（下一段 SESSION_START 的动作时刻）摄入，t 仍为段尾原值（引擎有单调时钟护栏）。
//  - bounded（审计发现 4 固化）：driver 只经 sinks 回调发射，自身不积累任何随时长增长的数组。
//    replay 收集数组是 replay 的选择；live 写完即丢。
//
// 同刻动作次序（决定 moments.csv 行序，两管线共用此正典）：
//   DONE(retro)=0 < SESSION_START=1 < askClose=2 < land=3(按 seq) < askOpen=4 < DONE(final)=5 < dripAdd=6

import type { StatePacket } from '../protocol/index.ts';
import type { DistilledMoment, LiveOp } from '../adapters/claude-jsonl/index.ts';
import { momentOf, clearSigOf } from '../adapters/claude-jsonl/index.ts';
import {
  createEngine, advanceTo, ingest, addStress, snapshot, reap,
  type DerivedMoment, type EngineState, type IngestMoment,
} from '../engine/index.ts';
import type { Params } from '../engine/params.ts';

export const ARCHIVE_SNAP_MS = 100; // 存档级 10Hz（replay 默认，sweep/冠军基准所在栅格）
export const LIVE_SNAP_MS = 50;     // 渲染级 20Hz —— live 正典频率（M1.9 §1.1）
export const IDLE_CAP_MS = 120_000; // 单空档最多步进 2min，其余解析跳跃（防多日续跑爆炸）

export interface Emit { ev: DerivedMoment; emitT: number }
export interface LedgerEntry { t: number; seq: number; label: string; dS: number }

export interface DriverSinks {
  snap(s: StatePacket): void;
  moment(e: Emit): void;
  ledger?(l: LedgerEntry): void;
}

interface DripWin { useT: number; end: number } // end=Infinity：未决，滴到流结束

export interface Driver {
  st: EngineState;
  /** 栅格推进到 t（滴灌积分＋reap＋采样）。首次调用即自动起钟（置 now、首采样）。t≤now 空操作。 */
  advanceTo(t: number): void;
  /** live 心跳推进：只推进到 now 之后最后一个完整栅格点（采样时刻不随墙钟抖动）。 */
  tickTo(wallT: number): void;
  /** 常规事件落地（advance→ingest→发射）。 */
  land(rec: DistilledMoment): void;
  /** ASK 开窗：在 rec.useT 落地 outcome=NA 的 ASK（挂 pendingAsk）。 */
  askOpen(rec: DistilledMoment): void;
  /** ASK 关窗：在 t 发 ASK_CLEARED（回答落地）。 */
  askClose(rec: DistilledMoment, t: number): void;
  /** 标点摄入。atT 为动作时刻（DONE 因果延迟时 > rec.t）；引擎时钟单调，不回拨。 */
  punct(rec: DistilledMoment, atT?: number): void;
  /** 注册滴灌窗（RUN/SAVE 的 tool_use 起）。end 未知传 Infinity。 */
  dripAdd(key: string, useT: number, end: number): void;
  /** 结果到达：关滴灌窗。 */
  dripClose(key: string, t: number): void;
  /** 当前开着的滴灌窗数（有界性金测试用）。 */
  dripCount(): number;
  /** 收尾：推进到 t（最终 DONE 由磁带/流自带）。 */
  end(t: number): void;
}

export function createDriver(params: Params, snapMs: number, sinks: DriverSinks): Driver {
  const st = createEngine(params);
  const drips = new Map<string, DripWin>();
  const afterMs = params.decay.pendingRunDripAfterSec * 1000;
  const cap = params.amplitude.runSecCap;
  const L = Math.log(1 + cap);
  const perMin = params.decay.pendingRunDripPerMin;

  // F(e) = ∫₀ᵉ m(x)dx，m(x)=min(1, ln(1+x)/L)，e 单位秒。闭式 → 栅格无关。
  const F = (e: number): number => {
    if (e <= 0) return 0;
    if (e <= cap) return ((1 + e) * Math.log(1 + e) - e) / L;
    return ((1 + cap) * Math.log(1 + cap) - cap) / L + (e - cap);
  };

  /** [a,b](ms) 内全部开窗的滴灌增量 ΔS = perMin × ∫m dt(min)。 */
  const dripIntegral = (a: number, b: number): number => {
    if (b <= a || drips.size === 0) return 0;
    let s = 0;
    for (const w of drips.values()) {
      const lo = Math.max(a, w.useT + afterMs);
      const hi = Math.min(b, w.end);
      if (hi > lo) s += F((hi - w.useT) / 1000) - F((lo - w.useT) / 1000);
    }
    return (perMin * s) / 60;
  };

  const reapInto = (): void => {
    for (const ev of reap(st, params)) sinks.moment({ ev, emitT: ev.t });
  };

  // 已积分完的死窗驱逐（bounded：long-run live 不许终身累积；不改积分值，两管线同律）
  const evictDrips = (cursor: number): void => {
    if (drips.size === 0) return;
    for (const [k, w] of drips) if (w.end <= cursor) drips.delete(k);
  };

  const step = (to: number): void => {
    let cursor = st.now;
    let stepped = 0;
    while (cursor < to) {
      if (stepped >= IDLE_CAP_MS && to - cursor > snapMs) {
        // 解析跳跃：滴灌积分闭式覆盖跳跃段（v0 曾静默丢弃跳跃段滴灌）
        const drip = dripIntegral(cursor, to);
        advanceTo(st, to, params);
        if (drip > 0) addStress(st, drip);
        evictDrips(to);
        reapInto();
        sinks.snap(snapshot(st, to, params));
        return;
      }
      const next = Math.min(to, cursor + snapMs);
      const drip = dripIntegral(cursor, next);
      advanceTo(st, next, params);
      if (drip > 0) addStress(st, drip);
      evictDrips(next);
      reapInto();
      sinks.snap(snapshot(st, next, params));
      stepped += next - cursor;
      cursor = next;
    }
  };

  const ingestEmit = (input: IngestMoment, emitted: DerivedMoment, label: string): void => {
    const before = st.S;
    const derived = ingest(st, input, params);
    sinks.ledger?.({ t: input.t, seq: input.seq, label, dS: st.S - before });
    sinks.moment({ ev: emitted, emitT: input.t });
    for (const dv of derived) sinks.moment({ ev: dv, emitT: st.now });
  };

  let begun = false;
  /** 首动作自动起钟：置 now、首采样（batch 与 live 同一入口，无需显式 begin）。 */
  const ensure = (t: number): void => {
    if (begun) return;
    begun = true;
    st.now = t;
    sinks.snap(snapshot(st, t, params));
  };

  return {
    st,
    advanceTo(t) {
      ensure(t);
      if (t > st.now) step(t);
    },
    tickTo(wallT) {
      if (!begun) return; // 无时间基（首行未到）：心跳空转
      // 只推进整栅格：采样时刻 = 上一动作时刻 + k×snapMs，不随心跳抖动
      const whole = st.now + Math.floor((wallT - st.now) / snapMs) * snapMs;
      if (whole > st.now) step(whole);
    },
    land(rec) {
      ensure(rec.t);
      if (rec.t > st.now) step(rec.t);
      reapInto();
      const ev = momentOf(rec, params);
      const clearSig = clearSigOf(rec);
      const input: IngestMoment = Object.assign({}, ev, { clearSig });
      const emitted: DerivedMoment = { ...ev, slot: clearSig }; // M1.8-F③ 目标槽注记
      ingestEmit(input, emitted, `${ev.verb}-${ev.outcome}`);
    },
    askOpen(rec) {
      ensure(rec.useT);
      if (rec.useT > st.now) step(rec.useT);
      reapInto();
      const base = momentOf(rec, params);
      // seq=-1：驱动合成时刻（live 在 useT 时不可知磁带 seq，两管线一致用 -1）
      const ev: DerivedMoment = { ...base, t: rec.useT, seq: -1, outcome: 'NA' };
      ingestEmit(ev, ev, 'ASK-OPEN');
    },
    askClose(rec, t) {
      ensure(t);
      if (t > st.now) step(t);
      reapInto();
      const ev: DerivedMoment = {
        kind: 'moment', t, seq: -1, agent: 'main',
        verb: 'ASK', outcome: 'NA', m: 0, tags: [], special: 'ASK_CLEARED',
      };
      ingestEmit(ev, ev, 'ASK_CLEARED');
    },
    punct(rec, atT) {
      const at = atT ?? rec.t;
      ensure(at);
      if (at > st.now) step(at);
      reapInto();
      const ev = momentOf(rec, params);
      if (ev.special === 'SESSION_START') drips.clear(); // 分段复位：滴灌窗随卡碟/rep 一并清
      ingestEmit(ev, { ...ev }, ev.special ?? 'PUNCT');
    },
    dripAdd(key, useT, end) {
      drips.set(key, { useT, end });
    },
    dripClose(key, t) {
      const w = drips.get(key);
      if (w) w.end = Math.min(w.end, t);
    },
    dripCount() {
      return drips.size;
    },
    end(t) {
      ensure(t);
      if (t > st.now) step(t);
    },
  };
}

/** LiveOp → Driver 的正典映射（live 运行器与金测试共用同一段代码——canon 不掺水）。 */
export function applyOp(d: Driver, op: LiveOp): void {
  d.advanceTo(op.t);
  switch (op.op) {
    case 'punct': d.punct(op.rec!, op.t); break;
    case 'askClose': d.askClose(op.rec!, op.t); break;
    case 'land': d.land(op.rec!); break;
    case 'askOpen': d.askOpen(op.rec!); break;
    case 'dripAdd': d.dripAdd(op.key!, op.useT!, op.end ?? Infinity); break;
    case 'dripClose': d.dripClose(op.key!, op.t); break;
  }
}

/**
 * 批式调度（replay 用）：全量蒸馏记录 → 因果动作表。
 * 与 live 的增量到达同序（金测试断言此事）。返回动作依 (t, rank, seq) 排序。
 */
export interface DriverAction {
  t: number;
  rank: number;
  seq: number;
  apply(d: Driver): void;
}

export function actionsOf(records: DistilledMoment[], streamEnd: number): DriverAction[] {
  const acts: DriverAction[] = [];
  // SESSION_START 动作时刻表（DONE 因果延迟需要知道"下一段几点开"）
  const sessionStarts = records.filter((r) => r.special === 'SESSION_START').map((r) => r.t);
  const lastDoneSeq = records.reduce((mx, r) => (r.special === 'DONE' ? Math.max(mx, r.seq) : mx), -1);

  for (const r of records) {
    if (r.special === 'SESSION_START') {
      acts.push({ t: r.t, rank: 1, seq: r.seq, apply: (d) => d.punct(r) });
    } else if (r.special === 'DONE') {
      if (r.seq === lastDoneSeq) {
        // 流尾 DONE：EOF 即知，按原时刻
        acts.push({ t: r.t, rank: 5, seq: r.seq, apply: (d) => d.punct(r) });
      } else {
        // 段间 DONE：物理上等到下一段首（空档阈值跨越）才可知 → 延迟到下一 SESSION_START 时刻
        const detectT = sessionStarts.find((t) => t > r.t) ?? streamEnd;
        acts.push({ t: detectT, rank: 0, seq: r.seq, apply: (d) => d.punct(r, detectT) });
      }
    } else if (r.special) {
      acts.push({ t: r.t, rank: 3, seq: r.seq, apply: (d) => d.punct(r) });
    } else if (r.verb === 'ASK') {
      acts.push({ t: r.useT, rank: 4, seq: r.seq, apply: (d) => d.askOpen(r) });
      if (r.resolveT !== null) {
        const rt = r.resolveT;
        acts.push({ t: rt, rank: 2, seq: r.seq, apply: (d) => d.askClose(r, rt) });
      }
    } else if (r.resolveT === null) {
      // 未决（尾随局限）：纯悬置——不落地、不出行；RUN/SAVE 滴灌到流尾（B-5 结案）
      if (r.verb === 'RUN' || r.verb === 'SAVE') {
        acts.push({ t: r.useT, rank: 6, seq: r.seq, apply: (d) => d.dripAdd(`r${r.seq}`, r.useT, Infinity) });
      }
    } else {
      acts.push({ t: r.t, rank: 3, seq: r.seq, apply: (d) => d.land(r) });
      if (r.verb === 'RUN' || r.verb === 'SAVE') {
        const rt = r.resolveT;
        acts.push({ t: r.useT, rank: 6, seq: r.seq, apply: (d) => d.dripAdd(`r${r.seq}`, r.useT, rt) });
      }
    }
  }
  acts.sort((a, b) => a.t - b.t || a.rank - b.rank || a.seq - b.seq);
  return acts;
}

/** 跑一遍动作表（replay 主回路）。首动作自动起钟。 */
export function runActions(d: Driver, acts: DriverAction[], streamEnd: number): void {
  if (acts.length === 0) return;
  for (const a of acts) {
    d.advanceTo(a.t);
    a.apply(d);
  }
  d.end(streamEnd);
}
