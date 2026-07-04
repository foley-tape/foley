// 叙事引擎（§6 + 施工令 M1.5 §4）。纯、确定性：无 Node API、无 Date.now、无随机。
// 时钟与事件一律注入。同一磁带两次回放 → 输出逐字节一致。
//
// 用法（回放/直播共用）：
//   const st = createEngine(params)
//   advanceTo(st, t, params)          // 连续动力学推进到 t（衰减/弹簧/活跃度/wow 平滑）
//   const cleared = reap(st, params)  // 连续：卡碟窗口过期 → STUCK_CLEARED（不改 S）
//   const derived = ingest(st, m, params)  // 离散：充能/泄能/rep/STUCK_LOOP/RESOLVE/CLEARED
//   const packet = snapshot(st, t, params) // 取 StatePacket（20Hz 广播）

import type {
  MomentEvent, StatePacket, Weather, Phase, Verb,
} from '../protocol/index.ts';
import type { Params } from './params.ts';

// 弹簧子步上限（ωn·h≪2 保证半隐式 Euler 稳定）
const SPRING_SUBSTEP_MS = 4;
// 大跨度（空档/多日续跑）阈值：超此视为已稳定，解析跳跃而非逐步积分
const SETTLE_MS = 2000;

/** 每签名卡碟态（施工令 §4.2 边沿触发）。 */
interface SigState {
  hits: number[];   // 窗内 FAIL 时刻（升序）——供 rep 计数
  stuck: boolean;   // 已发 STUCK_LOOP、进入卡碟态（不再重复发射）
  clearSig: string; // verb|tool 身份，供"同 verb+tool 的 OK"退出匹配
  lastHit: number;  // 最近一次击中（供窗口过期判定）
}

/** 引擎离散输入：协议 MomentEvent + 可选 clearSig（driver 侧算，非协议广播字段）。 */
export interface IngestMoment extends MomentEvent {
  clearSig?: string;
}

/** 引擎派生时刻：协议 MomentEvent + 内部注记 clearedBy（ok/expiry）。
 *  clearedBy 非协议字段（schema 冻结）——仅供报告分列 STUCK_CLEARED 与"消散≠解决"纪律。 */
export interface DerivedMoment extends MomentEvent {
  clearedBy?: 'ok' | 'expiry';
}

export interface EngineState {
  now: number;              // 当前仿真时刻(ms)
  S: number;                // 内部应力 ≥0，无上界
  needlePos: number;        // 弹簧位置 = 广播的 needle
  needleVel: number;
  startedT: number | null;
  lastEventT: number | null;
  sigStates: Map<string, SigState>; // sig → 卡碟/rep 态
  actRate: number;          // 事件/分钟（泄漏积分）
  outcomes: number[];       // wow v2：最近 wowWindow 个有结果事件（1=FAIL,0=OK），窗内成败交替率
  wowEvent: number;         // 原始 wow = 近因加权交替率（§2.2）
  wowSmoothed: number;      // 再过 wowSmoothingSec 常数平滑
  pendingAsk: boolean;
  done: boolean;
  weather: Weather;
}

export function createEngine(_params: Params): EngineState {
  return {
    now: 0, S: 0, needlePos: 0, needleVel: 0,
    startedT: null, lastEventT: null,
    sigStates: new Map(), actRate: 0, outcomes: [], wowEvent: 0, wowSmoothed: 0,
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
  const emaSec = params.companions.activityEmaSec;
  const dts = dtMs / 1000;
  st.actRate *= Math.exp(-dts / emaSec);
  st.wowSmoothed += (st.wowEvent - st.wowSmoothed) * (1 - Math.exp(-dts / params.companions.wowSmoothingSec));
  integrateSpring(st, dtMs, params);
  st.now += dtMs;
  updateWeather(st, params);
}

/** dS/dt = −S/τ；活跃 τ=tauActiveSec，断流 >idleThreshold 后 τ=tauIdleSec。跨阈值分两段精确积分。 */
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
  if (dtMs > SETTLE_MS) { st.needlePos = target; st.needleVel = 0; return; }
  let remaining = dtMs / 1000;
  const sub = SPRING_SUBSTEP_MS / 1000;
  while (remaining > 1e-9) {
    const h = Math.min(sub, remaining);
    const rising = target > st.needlePos;
    const law = rising ? params.spring.up : params.spring.down;
    const accel = -2 * law.zeta * law.omegaN * st.needleVel - law.omegaN * law.omegaN * (st.needlePos - target);
    st.needleVel += accel * h;
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
  const bounds = [
    { enter: up.OVERCAST, exit: up.OVERCAST - hysteresis },
    { enter: up.RAIN, exit: up.RAIN - hysteresis },
    { enter: up.STORM, exit: stormExit },
  ];
  let level = WEATHER_ORDER.indexOf(st.weather);
  while (level < 3 && T >= bounds[level]!.enter) level++;
  while (level > 0 && T < bounds[level - 1]!.exit) level--;
  st.weather = WEATHER_ORDER[level]!;
}

// ---------- 连续：卡碟窗口过期 → STUCK_CLEARED ----------

/** 卡碟态在 repWindow 内无新击中 → 解除，发 expiry 型 STUCK_CLEARED（§2.1 纪律：消散≠解决，不改 S、不 RESOLVE）。
 *  过期时刻取理论过期点 lastHit+win（M1.6-A §1.二.6 正典：回放与直播一致）。driver 在推进时钟后调用。 */
export function reap(st: EngineState, params: Params): DerivedMoment[] {
  const out: DerivedMoment[] = [];
  const win = params.stress.repWindowMs;
  for (const [sig, s] of st.sigStates) {
    if (s.stuck && st.now - s.lastHit > win) {
      s.stuck = false;
      out.push(clearedEvent(sig, s.lastHit + win, 'expiry'));
    }
  }
  return out;
}

function clearedEvent(sig: string, t: number, clearedBy: 'ok' | 'expiry'): DerivedMoment {
  return {
    kind: 'moment', t, seq: -1, agent: 'main',
    verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'STUCK_CLEARED', sig, clearedBy,
  };
}

/** RESOLVE 时刻（§2.1）：测试转绿 / 提交 / 破卡碟三形态共用。 */
function resolveEvent(m: IngestMoment): DerivedMoment {
  return {
    kind: 'moment', t: m.t, seq: -1, agent: m.agent,
    verb: m.verb, outcome: 'OK', m: m.m, tags: m.tags, special: 'RESOLVE',
  };
}

/**
 * wow v2（§2.2，Nagios 借骨）：窗内成败交替率。相邻跳变(OK↔FAIL)按近因线性加权
 * （最旧对 0.5 → 最新对 1.5），加权跳变和 / 最大可能加权和 ∈ [0,1]。稳定地烂→低，反复横跳→高。
 */
function alternationRate(outcomes: number[]): number {
  const n = outcomes.length;
  if (n < 2) return 0;
  const pairs = n - 1; // 相邻对数
  let flipW = 0, totW = 0;
  for (let j = 1; j < n; j++) {
    const w = pairs === 1 ? 1.0 : 0.5 + (1.0 * (j - 1)) / (pairs - 1); // 0.5→1.5 线性
    totW += w;
    if (outcomes[j] !== outcomes[j - 1]) flipW += w;
  }
  return totW > 0 ? flipW / totW : 0;
}

// ---------- 离散事件 ----------

/** 摄入一个 MomentEvent（离散效果）。返回引擎派生时刻（STUCK_LOOP/RESOLVE/STUCK_CLEARED）。 */
export function ingest(st: EngineState, m: IngestMoment, params: Params): DerivedMoment[] {
  st.now = m.t;
  const derived: DerivedMoment[] = [];

  // 标点
  switch (m.special) {
    case 'SESSION_START':
      // §4.1 分段复位：S / rep / 卡碟 / 活跃度 / wow / 天气 / 针 全部归零
      st.startedT = m.t; st.lastEventT = m.t; st.done = false;
      st.S = 0; st.needlePos = 0; st.needleVel = 0;
      st.sigStates.clear();
      st.actRate = 0; st.outcomes = []; st.wowEvent = 0; st.wowSmoothed = 0;
      st.pendingAsk = false; st.weather = 'CLEAR';
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

  // 任何真实活动：清 done、记时、喂活跃度/wow
  st.done = false;
  st.lastEventT = m.t;
  st.actRate += 60 / params.companions.activityEmaSec; // 冲量，稳态 ≈ 事件/分钟
  if (m.outcome === 'OK' || m.outcome === 'FAIL') {
    st.outcomes.push(m.outcome === 'FAIL' ? 1 : 0);
    if (st.outcomes.length > params.companions.wowWindow) st.outcomes.shift();
    st.wowEvent = alternationRate(st.outcomes); // wow v2：成败交替率，非失败率
  }

  if (m.outcome === 'FAIL') {
    // 充能 + 卡碟边沿触发
    const sig = m.sig ?? `${m.verb}|?`;
    let s = st.sigStates.get(sig);
    if (!s) { s = { hits: [], stuck: false, clearSig: m.clearSig ?? '', lastHit: m.t }; st.sigStates.set(sig, s); }
    const cutoff = m.t - params.stress.repWindowMs;
    s.hits = s.hits.filter((ts) => ts >= cutoff);
    const k = s.hits.length; // 窗内已有 → 本次是第 k+1 次
    const rep = Math.min(Math.pow(params.stress.repBase, k), params.stress.repCap);
    const w = params.stress.verbWeights[m.verb] ?? params.stress.verbWeights.OTHER;
    st.S += w * m.m * rep;
    s.hits.push(m.t);
    s.lastHit = m.t;
    if (m.clearSig) s.clearSig = m.clearSig;
    if (!s.stuck && k >= params.stress.stuckLoopK) {
      s.stuck = true; // 边沿：只此一次发射，态内继续充能不再发
      derived.push({
        kind: 'moment', t: m.t, seq: -1, agent: m.agent,
        verb: m.verb, outcome: 'FAIL', m: m.m, tags: m.tags, special: 'STUCK_LOOP', sig, k,
      });
    }
  } else if (m.outcome === 'OK') {
    // RESOLVE 多态化（§2.1）。形态 1/2：测试转绿 / 提交——各自泄能并发 RESOLVE。
    let resolved = false;
    if (m.verb === 'RUN' && m.tags.includes('test') && st.S > params.release.testResolveMinS) {
      st.S *= params.release.testResolveFactor;
      derived.push(resolveEvent(m));
      resolved = true;
    } else if (m.verb === 'SAVE') {
      st.S *= params.release.saveFactor;
      derived.push(resolveEvent(m)); // §2.1.2：提交现在也发 RESOLVE 时刻（原先只泄能）
      resolved = true;
    }
    // 形态 3（卡碟打破）：仅同 verb+tool+target 的 OK 清对应卡碟（distill/2 §3 收紧；ok 型）。
    // test/save 不再强清无关卡碟——清除权收敛到"同目标 OK"与"窗口过期"两条，合 §3 本旨。
    if (m.clearSig) {
      let broke = false;
      for (const [sig, s] of st.sigStates) {
        if (s.stuck && s.clearSig === m.clearSig) { s.stuck = false; derived.push(clearedEvent(sig, m.t, 'ok')); broke = true; }
      }
      if (broke && !resolved && st.S > params.release.jamBreakMinS) {
        st.S *= params.release.jamBreakFactor; // §2.1.3：破卡碟泄能
        derived.push(resolveEvent(m));
      }
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
