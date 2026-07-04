// 叙事引擎（§6）。纯、确定性：无 Node API、无 Date.now、无随机。
// 时钟与事件一律注入。同一磁带两次回放 → 输出逐字节一致。
//
// 用法（回放/直播共用）：
//   const st = createEngine(params)
//   advanceTo(st, t, params)          // 连续动力学推进到 t（衰减/弹簧/活跃度/wow 平滑）
//   const derived = ingest(st, moment, params)  // 离散：充能/泄能/rep/STUCK_LOOP/RESOLVE
//   const packet = snapshot(st, t, params)      // 取 StatePacket（20Hz 广播）

import type {
  MomentEvent, StatePacket, Weather, Phase, Verb,
} from '../protocol/index.ts';
import type { Params } from './params.ts';

// 活跃度 EMA 窗（§6.3 未给数值，取 30s；见 REPORT 现实修正）
const ACT_WINDOW_SEC = 30;
// 弹簧子步上限（ωn·h≪2 保证半隐式 Euler 稳定）
const SPRING_SUBSTEP_MS = 4;
// 大跨度（空档/多日续跑）阈值：超此视为已稳定，解析跳跃而非逐步积分
const SETTLE_MS = 2000;

export interface EngineState {
  now: number;              // 当前仿真时刻(ms)
  S: number;                // 内部应力 ≥0，无上界
  needlePos: number;        // 弹簧位置 = 广播的 needle
  needleVel: number;
  startedT: number | null;
  lastEventT: number | null;
  failsBySig: Map<string, number[]>; // sig → 窗内 FAIL 时刻(升序)
  actRate: number;          // 事件/分钟（泄漏积分）
  wowEvent: number;         // 最近~12事件 FAIL 指示 EMA
  wowSmoothed: number;      // 再过 30s 常数平滑
  pendingAsk: boolean;
  done: boolean;
  weather: Weather;
}

export function createEngine(_params: Params): EngineState {
  return {
    now: 0, S: 0, needlePos: 0, needleVel: 0,
    startedT: null, lastEventT: null,
    failsBySig: new Map(), actRate: 0, wowEvent: 0, wowSmoothed: 0,
    pendingAsk: false, done: false, weather: 'CLEAR',
  };
}

/** T = 1 − e^(−S/S₀)。 */
export function tension(S: number, params: Params): number {
  return 1 - Math.exp(-S / params.stress.S0);
}

// ---------- 连续动力学 ----------

export function advanceTo(st: EngineState, t: number, params: Params): void {
  advance(st, t - st.now, params);
}

export function advance(st: EngineState, dtMs: number, params: Params): void {
  if (dtMs <= 0) return;
  decayStress(st, dtMs, params);
  // 活跃度泄漏 + wow 时间平滑（一次到位，指数精确）
  const dts = dtMs / 1000;
  st.actRate *= Math.exp(-dts / ACT_WINDOW_SEC);
  st.wowSmoothed += (st.wowEvent - st.wowSmoothed) * (1 - Math.exp(-dts / params.companions.wowSmoothingSec));
  integrateSpring(st, dtMs, params);
  st.now += dtMs;
  updateWeather(st, params);
}

/** dS/dt = −S/τ；活跃 τ=60s，事件断流 >60s 后 τ=180s。跨阈值分两段精确积分。 */
function decayStress(st: EngineState, dtMs: number, params: Params): void {
  if (st.lastEventT === null || st.S === 0) return;
  const { tauActiveSec, tauIdleSec, idleThresholdSec } = params.decay;
  const thr = st.lastEventT + idleThresholdSec * 1000;
  let a = st.now;
  const end = st.now + dtMs;
  while (a < end) {
    const inActive = a < thr;
    const segEnd = inActive ? Math.min(end, thr) : end;
    const tau = inActive ? tauActiveSec : tauIdleSec;
    st.S *= Math.exp(-((segEnd - a) / 1000) / tau);
    a = segEnd;
  }
}

/** 弹簧-阻尼：needle 吃 T。上行欠阻尼(快攻)，下行过阻尼(慢放)。子步半隐式 Euler。 */
function integrateSpring(st: EngineState, dtMs: number, params: Params): void {
  const target = tension(st.S, params);
  if (dtMs > SETTLE_MS) { // 大跨度：已稳定
    st.needlePos = target; st.needleVel = 0; return;
  }
  let remaining = dtMs / 1000;
  const sub = SPRING_SUBSTEP_MS / 1000;
  while (remaining > 1e-9) {
    const h = Math.min(sub, remaining);
    const rising = target > st.needlePos;
    const law = rising ? params.spring.up : params.spring.down;
    const accel = -2 * law.zeta * law.omegaN * st.needleVel - law.omegaN * law.omegaN * (st.needlePos - target);
    st.needleVel += accel * h;   // 半隐式：先更新速度
    st.needlePos += st.needleVel * h;
    remaining -= h;
  }
  if (st.needlePos < 0) st.needlePos = 0;
}

// ---------- 天气（施密特迟滞，§6.2） ----------

const WEATHER_ORDER: Weather[] = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM'];

function updateWeather(st: EngineState, params: Params): void {
  const T = tension(st.S, params);
  const { up, hysteresis, stormExit } = params.weather;
  // 每个边界的进入/退出阈值（STORM 退出特殊 = stormExit）
  const bounds = [
    { enter: up.OVERCAST, exit: up.OVERCAST - hysteresis },
    { enter: up.RAIN, exit: up.RAIN - hysteresis },
    { enter: up.STORM, exit: stormExit },
  ];
  let level = WEATHER_ORDER.indexOf(st.weather);
  while (level < 3 && T >= bounds[level]!.enter) level++;      // 上行
  while (level > 0 && T < bounds[level - 1]!.exit) level--;    // 下行需跌破退出阈
  st.weather = WEATHER_ORDER[level]!;
}

// ---------- 离散事件 ----------

/** 摄入一个 MomentEvent（离散效果）。返回引擎派生的时刻（STUCK_LOOP / RESOLVE）。 */
export function ingest(st: EngineState, m: MomentEvent, params: Params): MomentEvent[] {
  st.now = m.t;
  const derived: MomentEvent[] = [];

  // 标点
  switch (m.special) {
    case 'SESSION_START':
      st.startedT = m.t; st.lastEventT = m.t; st.done = false;
      return derived;
    case 'DONE':
      st.done = true; st.lastEventT = m.t;
      return derived;
    case 'ASK_CLEARED':
      st.pendingAsk = false; st.lastEventT = m.t;
      return derived;
    default:
      break;
  }
  if (m.verb === 'ASK') { st.pendingAsk = true; }

  // 任何真实活动：清 done，记时，喂活跃度/wow
  st.done = false;
  st.lastEventT = m.t;
  st.actRate += 60 / ACT_WINDOW_SEC; // 冲量，稳态 ≈ 事件/分钟
  if (m.outcome === 'OK' || m.outcome === 'FAIL') {
    const alpha = 2 / (params.companions.wowWindow + 1);
    st.wowEvent += alpha * ((m.outcome === 'FAIL' ? 1 : 0) - st.wowEvent);
  }

  // 充能（FAIL）
  if (m.outcome === 'FAIL') {
    const sig = m.sig ?? `${m.verb}|?`;
    const hist = st.failsBySig.get(sig) ?? [];
    const cutoff = m.t - params.stress.repWindowMs;
    const pruned = hist.filter((ts) => ts >= cutoff);
    const k = pruned.length; // 窗内已有次数 → 本次是第 k+1 次
    const rep = Math.min(Math.pow(params.stress.repBase, k), params.stress.repCap);
    const w = params.stress.verbWeights[m.verb] ?? params.stress.verbWeights.OTHER;
    st.S += w * m.m * rep;
    pruned.push(m.t);
    st.failsBySig.set(sig, pruned);
    if (k >= params.stress.stuckLoopK) {
      derived.push({
        kind: 'moment', t: m.t, seq: -1, agent: m.agent,
        verb: m.verb, outcome: 'FAIL', m: m.m, tags: m.tags,
        special: 'STUCK_LOOP', sig, k,
      });
    }
  } else if (m.outcome === 'OK') {
    // 泄能用乘法
    if (m.verb === 'RUN' && m.tags.includes('test') && st.S > params.release.testResolveMinS) {
      st.S *= params.release.testResolveFactor;
      derived.push({
        kind: 'moment', t: m.t, seq: -1, agent: m.agent,
        verb: m.verb, outcome: 'OK', m: m.m, tags: m.tags, special: 'RESOLVE',
      });
    } else if (m.verb === 'SAVE') {
      st.S *= params.release.saveFactor;
    }
  }

  updateWeather(st, params);
  return derived;
}

/** 未决 RUN 滴灌（§6.2）：由 driver 计算增量后调用。 */
export function addStress(st: EngineState, delta: number): void {
  if (delta > 0) st.S += delta;
}

// ---------- 快照 ----------

export function snapshot(st: EngineState, t: number, params: Params): StatePacket {
  const T = tension(st.S, params);
  const A = 1 - Math.exp(-st.actRate / params.companions.activityRateScale);
  return {
    kind: 'state', t, agent: 'main',
    S: st.S, T, A, wow: st.wowSmoothed, needle: st.needlePos,
    phase: phaseOf(st, t, params), weather: st.weather,
    pendingAsk: st.pendingAsk,
  };
}

function phaseOf(st: EngineState, t: number, params: Params): Phase {
  if (st.done) return 'DONE';
  if (st.pendingAsk) return 'WAITING';
  if (st.startedT === null) return 'IDLE';
  if (st.lastEventT !== null && (t - st.lastEventT) / 1000 > params.companions.idlePhaseSec) return 'IDLE';
  return 'WORKING';
}

export type { Verb };
