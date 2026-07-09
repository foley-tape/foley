// 回放流客户端 —— 吃 fixtures 的 curve/moments 副本，重建 20Hz StatePacket 广播。
//
// 时间法则：
// · curve.csv 采样 10Hz（SNAP_MS=100，cli/replay.ts）；本客户端重建到 20Hz 网格，
//   连续场线性重建、离散场阶跃——重建不是缓动：无过冲、无滞后动力学。
// · 蒸馏带的时间轴有拼接（多集之间数小时的空洞）。接带策略：单步 dt 超过
//   GAP_CLAMP 即折叠为 GAP_CLAMP，超过 SPLICE_MS 的记为一道接带痕（走纸上可见）。
//   磁带宇宙的诚实：空洞不假装播放，也不假装不存在。

export const GAP_CLAMP = 400; // ms，单步舞台时间上限（M-T3 起出口：剖段器要认折叠步）
const SPLICE_MS = 2000;   // ms，超过即算接带
export const PACKET_MS = 50; // 20Hz

export const PHASES = ['IDLE', 'WORKING', 'WAITING', 'DONE'];
export const WEATHERS = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM'];

export function parseCurve(text) {
  const lines = text.split('\n');
  const n = lines.length;
  const t = new Float64Array(n), S = new Float64Array(n), T = new Float64Array(n),
    A = new Float64Array(n), wow = new Float64Array(n), needle = new Float64Array(n);
  const phase = new Uint8Array(n), weather = new Uint8Array(n), pendingAsk = new Uint8Array(n);
  let k = 0;
  for (let i = 1; i < n; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split(',');
    if (c.length < 9 || !Number.isFinite(+c[0])) continue; // 半行（live 边写边读的截断末行）→丢，免 NaN 毒害器件
    t[k] = +c[0]; S[k] = +c[1]; T[k] = +c[2]; A[k] = +c[3];
    wow[k] = +c[4]; needle[k] = +c[5];
    phase[k] = Math.max(0, PHASES.indexOf(c[6]));
    weather[k] = Math.max(0, WEATHERS.indexOf(c[7]));
    pendingAsk[k] = c[8] === '1' ? 1 : 0; // 九列正典（M1.9 §1.2 交付，M2.1 §0.7 清账）
    k++;
  }
  return { n: k, t, S, T, A, wow, needle, phase, weather, pendingAsk };
}

export function parseMoments(text) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line.split(',');
    if (c.length < 12 || !Number.isFinite(+c[0])) continue; // 半行（截断末行）→丢
    // tags/slot（M2.5 demo 声桥要喂前景分类与音阶度）：hex/枚举位，列审计在册
    out.push({ t: +c[0], seq: +c[2], verb: c[3], outcome: c[4], special: c[7] || null, tags: c[6] || '', slot: c[11] || '' });
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

// 原始 t → 折叠轴（M2.3 §1.5 消费侧）：live 直流轴的手动剪凭 liveEpoch 换回原始 t 后走这里对齐
export function foldRawT(tape, rawT) { return stageTimeOf(rawT, tape.curve, tape.st); }

// 折叠轴 → 原始 t（M-T3 音轨消费）：renderCuts 吃原始相对 ms——舞台折叠轴须先反折叠。
// 折叠残段（stage 400ms 桩）内按比例回展到原始跨度；样本点上恒精确。
export function unfoldStageT(tape, stageT) {
  const { curve, st } = tape;
  const n = curve.n;
  if (n === 0) return 0;
  if (stageT <= 0) return curve.t[0];
  if (stageT >= st[n - 1]) return curve.t[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (st[mid] <= stageT) lo = mid; else hi = mid; }
  const span = st[lo + 1] - st[lo];
  const f = span > 0 ? (stageT - st[lo]) / span : 0;
  return curve.t[lo] + f * (curve.t[lo + 1] - curve.t[lo]);
}

// 纯装配（fetch 之外的全部）：Node 侧（金测试/工具）与浏览器共用同一份装配逻辑
export function buildTape(name, curveText, momentsText = 't\n') {
  const curve = parseCurve(curveText);
  const { st, splices } = buildStageAxis(curve);
  const moments = parseMoments(momentsText)
    .map(m => ({ ...m, stageT: stageTimeOf(m.t, curve, st) }))
    .sort((a, b) => a.stageT - b.stageT);
  return { name, curve, st, splices, moments, duration: st[curve.n - 1] };
}

export async function loadTape(name) {
  // 日带（yesterday / YYYY-MM-DD）走 /dayroll 原料仓；其余走 fixtures 副本
  const isDay = /^(yesterday|\d{4}-\d{2}-\d{2})$/.test(name);
  const urlOf = kind => (isDay ? `/dayroll/${name}/${kind}.csv` : `fixtures/${name}.${kind}.csv`);
  const [curveText, momentsText] = await Promise.all([
    fetch(urlOf('curve')).then(r => {
      if (!r.ok) throw new Error(isDay ? `${name} 无卷（该日无 live 产物）` : `找不到带子：${name}`);
      return r.text();
    }),
    fetch(urlOf('moments')).then(r => (r.ok ? r.text() : 't\n')),
  ]);
  const tape = buildTape(name, curveText, momentsText);
  tape.curveText = curveText;     // dub 记账用（tapeHash 之源：曲线+时刻两件套）
  tape.momentsText = momentsText;
  return tape;
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
    pendingAsk: c.pendingAsk[i] === 1, // 真字段直读；WAITING⇔pendingAsk 推导已清账（M2.1 §0.7）
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
    this._timer = null;
    this.onPlayState = null; // (playing:boolean)=>void：转台开停通知（声侧据此暂停/续播唱片，丙.2）
  }

  play() { const was = this.playing; this.playing = true; this._lastReal = null; this._loop(); if (!was) this.onPlayState?.(true); }
  pause() { const was = this.playing; this.playing = false; if (this._timer) { clearInterval(this._timer); this._timer = null; } if (was) this.onPlayState?.(false); }

  seek(tau) {
    this.stageT = Math.max(0, Math.min(tau, this.tape.duration));
    this.nextPacketT = Math.floor(this.stageT / PACKET_MS) * PACKET_MS;
    this.momentIdx = this.tape.moments.findIndex(m => m.stageT >= this.stageT);
    if (this.momentIdx < 0) this.momentIdx = this.tape.moments.length;
    this._emit(sampleAt(this.tape, this.stageT), true);
  }

  _emit(pkt, isSeek = false) { for (const fn of this.onPacket) fn(pkt, isSeek); }

  // 广播走间隔钟而非 rAF：20Hz 是包网格的节拍，且藏起的标签页里 rAF 会整个冻住
  // （渲染归 rAF，看不见时不画是对的；但钟不能跟着睡）
  _loop() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      if (!this.playing) return;
      const now = performance.now();
      if (this._lastReal === null) this._lastReal = now;
      const realDt = Math.min(now - this._lastReal, 500); // 节流醒来不追爆
      this._lastReal = now;
      this.stageT = Math.min(this.stageT + realDt * this.speed, this.tape.duration);

      // 补齐所有已越过的网格点（限流，seek 后不洪泛）
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

      if (this.stageT >= this.tape.duration) this.pause();
    }, PACKET_MS / 2); // 钟比包密一倍：hiccup 时少补发，光学不被迫追赶（影子指标①的教训）
  }
}
