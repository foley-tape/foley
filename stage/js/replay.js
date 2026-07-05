// 回放流客户端 —— 吃 fixtures 的 curve/moments 副本，重建 20Hz StatePacket 广播。
//
// 时间法则：
// · curve.csv 采样 10Hz（SNAP_MS=100，cli/replay.ts）；本客户端重建到 20Hz 网格，
//   连续场线性重建、离散场阶跃——重建不是缓动：无过冲、无滞后动力学。
// · 蒸馏带的时间轴有拼接（多集之间数小时的空洞）。接带策略：单步 dt 超过
//   GAP_CLAMP 即折叠为 GAP_CLAMP，超过 SPLICE_MS 的记为一道接带痕（走纸上可见）。
//   磁带宇宙的诚实：空洞不假装播放，也不假装不存在。

const GAP_CLAMP = 400;    // ms，单步舞台时间上限
const SPLICE_MS = 2000;   // ms，超过即算接带
export const PACKET_MS = 50; // 20Hz

export const PHASES = ['IDLE', 'WORKING', 'WAITING', 'DONE'];
export const WEATHERS = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM'];

function parseCurve(text) {
  const lines = text.split('\n');
  const n = lines.length;
  const t = new Float64Array(n), S = new Float64Array(n), T = new Float64Array(n),
    A = new Float64Array(n), wow = new Float64Array(n), needle = new Float64Array(n);
  const phase = new Uint8Array(n), weather = new Uint8Array(n);
  let k = 0;
  for (let i = 1; i < n; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split(',');
    t[k] = +c[0]; S[k] = +c[1]; T[k] = +c[2]; A[k] = +c[3];
    wow[k] = +c[4]; needle[k] = +c[5];
    phase[k] = Math.max(0, PHASES.indexOf(c[6]));
    weather[k] = Math.max(0, WEATHERS.indexOf(c[7]));
    k++;
  }
  return { n: k, t, S, T, A, wow, needle, phase, weather };
}

function parseMoments(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split(',');
    out.push({ t: +c[0], seq: +c[2], verb: c[3], outcome: c[4], special: c[7] || null });
  }
  return out;
}

// 舞台时间轴：st[i] = 累计的、折叠过空洞的毫秒。
function buildStageAxis(curve) {
  const st = new Float64Array(curve.n);
  const splices = []; // 舞台时间处有一道接带
  for (let i = 1; i < curve.n; i++) {
    const dt = curve.t[i] - curve.t[i - 1];
    st[i] = st[i - 1] + Math.min(dt, GAP_CLAMP);
    if (dt > SPLICE_MS) splices.push(st[i]);
  }
  return { st, splices };
}

// 原始 tape 时刻 → 舞台时刻（moments 用）
function stageTimeOf(rawT, curve, st) {
  let lo = 0, hi = curve.n - 1;
  if (rawT <= curve.t[0]) return 0;
  if (rawT >= curve.t[hi]) return st[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve.t[mid] <= rawT) lo = mid; else hi = mid;
  }
  return st[lo] + Math.min(rawT - curve.t[lo], GAP_CLAMP);
}

export async function loadTape(name) {
  const [curveText, momentsText] = await Promise.all([
    fetch(`fixtures/${name}.curve.csv`).then(r => { if (!r.ok) throw new Error(name); return r.text(); }),
    fetch(`fixtures/${name}.moments.csv`).then(r => (r.ok ? r.text() : 't\n')),
  ]);
  const curve = parseCurve(curveText);
  const { st, splices } = buildStageAxis(curve);
  const moments = parseMoments(momentsText)
    .map(m => ({ ...m, stageT: stageTimeOf(m.t, curve, st) }))
    .sort((a, b) => a.stageT - b.stageT);
  return { name, curve, st, splices, moments, duration: st[curve.n - 1] };
}

function lerp(a, b, f) { return a + (b - a) * f; }

// 在舞台时刻 τ 采样一只 StatePacket。
export function sampleAt(tape, tau) {
  const { curve, st } = tape;
  const n = curve.n;
  if (tau <= 0) return packetAt(tape, 0, 0, 0);
  if (tau >= st[n - 1]) return packetAt(tape, n - 2, 1, st[n - 1]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (st[mid] <= tau) lo = mid; else hi = mid;
  }
  const span = st[lo + 1] - st[lo];
  const f = span > 0 ? (tau - st[lo]) / span : 0;
  return packetAt(tape, lo, f, tau);
}

function packetAt(tape, i, f, tau) {
  const c = tape.curve;
  const j = Math.min(i + 1, c.n - 1);
  return {
    stageT: tau,
    S: lerp(c.S[i], c.S[j], f),
    T: lerp(c.T[i], c.T[j], f),
    A: lerp(c.A[i], c.A[j], f),
    wow: lerp(c.wow[i], c.wow[j], f),
    needle: lerp(c.needle[i], c.needle[j], f),
    phase: PHASES[c.phase[i]],       // 离散场阶跃，取左值
    weather: WEATHERS[c.weather[i]],
    // curve.csv 无 pendingAsk 列；engine/index.ts phaseOf 证明 WAITING ⇔ pendingAsk。
    // 同源同钟：这仍是读同一字段的推导，非二次发明。已记入舞台手记提请补列。
    pendingAsk: c.phase[i] === 2,
  };
}

// 播放器：rAF 驱动，向订阅者按 50ms 舞台网格逐包广播。
export class Replayer {
  constructor(tape) {
    this.tape = tape;
    this.stageT = 0;
    this.speed = 1;
    this.playing = false;
    this.nextPacketT = 0;
    this.momentIdx = 0;
    this.onPacket = [];   // (packet) => void
    this.onMoment = [];   // (moment) => void
    this._lastReal = null;
    this._raf = null;
  }

  play() { this.playing = true; this._lastReal = null; this._loop(); }
  pause() { this.playing = false; }

  seek(tau) {
    this.stageT = Math.max(0, Math.min(tau, this.tape.duration));
    this.nextPacketT = Math.floor(this.stageT / PACKET_MS) * PACKET_MS;
    this.momentIdx = this.tape.moments.findIndex(m => m.stageT >= this.stageT);
    if (this.momentIdx < 0) this.momentIdx = this.tape.moments.length;
    this._emit(sampleAt(this.tape, this.stageT), true);
  }

  _emit(pkt, isSeek = false) { for (const fn of this.onPacket) fn(pkt, isSeek); }

  _loop() {
    if (this._raf) return;
    const step = (now) => {
      this._raf = null;
      if (!this.playing) return;
      if (this._lastReal === null) this._lastReal = now;
      const realDt = Math.min(now - this._lastReal, 200); // 掉帧不追爆
      this._lastReal = now;
      this.stageT = Math.min(this.stageT + realDt * this.speed, this.tape.duration);

      // 20Hz 广播：补齐所有已越过的网格点（限流，seek 后不洪泛）
      let emitted = 0;
      while (this.nextPacketT <= this.stageT && emitted < 64) {
        this._emit(sampleAt(this.tape, this.nextPacketT));
        this.nextPacketT += PACKET_MS;
        emitted++;
      }
      if (emitted >= 64) this.nextPacketT = Math.floor(this.stageT / PACKET_MS) * PACKET_MS;

      // moments 事件流
      const ms = this.tape.moments;
      while (this.momentIdx < ms.length && ms[this.momentIdx].stageT <= this.stageT) {
        for (const fn of this.onMoment) fn(ms[this.momentIdx]);
        this.momentIdx++;
      }

      if (this.stageT >= this.tape.duration) this.playing = false;
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
}
