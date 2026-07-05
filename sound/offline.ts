// 离线渲染器（SOUND-R1 §3）——机器耳朵的耳膜。Web Audio 语义子集的纯 TS 实现，零依赖、确定性。
//
// 为什么自研而不是 OfflineAudioContext：Node 无 Web Audio 实现，运行时零依赖已冻结（v0.1.0）。
// 借骨清单（Tone.js 源码研读，时间盒内，借骨不搬库）：
//   ① Tone.Param 自持影子时间线——Tone 从不信任 AudioParam 回读，与本次事故教训同源；
//   ② Tone.Context 统一持有/统一 dispose 全部节点——即本仓 registry 的先例；
//   ③ Tone 自己的验收测试就是 Offline 渲染＋对波形断言——cli ear 的形制。
// 保真的命门（§1 失明机理的解药）：**AudioParam 计算值 = 内在自动化值 + 外接信号之和，
// 而 .value 读数只报内在值**。渲染器必须原样再现这条规范语义，账本才骗不过耳朵——
// 金测试 ㊱ 专门以"LFO 直连增益参数"的事故拓扑验证本渲染器听得见账本听不见的声。
//
// 语义按 Web Audio 规范编码的子集：Gain / Oscillator(sine|triangle|sawtooth) /
// BiquadFilter(lowpass|highpass|bandpass|highshelf，LP/HP 的 Q 单位为 dB) / Delay(线性插值) /
// AudioBuffer+BufferSource(loop) / 目的地。自动化：setValueAtTime / linearRamp / expRamp /
// setTargetAtTime / cancelScheduledValues(移除 ≥t 的事件；已生效的 setTarget 继续，与浏览器一致)。
// 处理模型：128 帧块、拉取式、无环（本图无反馈环；DelayNode 仅作直通调制线）。

const BLOCK = 128;

type EvType = 'set' | 'linear' | 'exp' | 'target';
interface Ev { type: EvType; time: number; value: number; tc: number }

export class OfflineParam {
  private events: Ev[] = [];
  private base: number;
  readonly inputs: OfflineNode[] = []; // 外接信号（ctx 层不设禁手——禁手是 registry 的法，见金测试 ㊱）
  private readonly min: number;
  private readonly max: number;
  private readonly ctx: OfflineCtx;
  // 渲染期游标（时间单调）：idx=当前段事件下标；segV0 为 setTarget 段起点值
  private idx = -1;
  private segV0 = 0;

  constructor(ctx: OfflineCtx, defaultValue: number, min = -3.4e38, max = 3.4e38) {
    this.ctx = ctx; this.base = defaultValue; this.min = min; this.max = max;
  }

  get value(): number { return this.evalIntrinsicFresh(this.ctx.currentTime); } // 账本口径：不含外接信号
  set value(v: number) { this.base = v; this.insert({ type: 'set', time: this.ctx.currentTime, value: v, tc: 0 }); }

  setValueAtTime(v: number, t: number): this { this.insert({ type: 'set', time: t, value: v, tc: 0 }); return this; }
  linearRampToValueAtTime(v: number, t: number): this { this.insert({ type: 'linear', time: t, value: v, tc: 0 }); return this; }
  exponentialRampToValueAtTime(v: number, t: number): this { this.insert({ type: 'exp', time: t, value: v, tc: 0 }); return this; }
  setTargetAtTime(v: number, t: number, tc: number): this { this.insert({ type: 'target', time: t, value: v, tc: Math.max(tc, 1e-6) }); return this; }
  cancelScheduledValues(t: number): this {
    this.events = this.events.filter((e) => e.time < t);
    if (this.idx >= this.events.length) this.idx = this.events.length - 1;
    return this;
  }

  private insert(e: Ev): void {
    // 插入保持按时间稳定排序（同刻按插入序——与浏览器一致）
    let i = this.events.length;
    while (i > 0 && this.events[i - 1]!.time > e.time) i--;
    this.events.splice(i, 0, e);
  }

  /** 无游标的独立求值（.value 读数用；渲染游标不受扰）。 */
  private evalIntrinsicFresh(t: number): number {
    let idx = -1, segV0 = this.base;
    for (let i = 0; i < this.events.length; i++) {
      if (this.events[i]!.time <= t) { segV0 = this.valueAtEventStart(i, segV0, idx); idx = i; } else break;
    }
    return this.clamp(this.segValue(t, idx, segV0));
  }

  /** 事件 i 生效瞬间的"段起点值"（set/ramp 段=事件值；target 段=生效前一刻的值）。 */
  private valueAtEventStart(i: number, prevSegV0: number, prevIdx: number): number {
    const e = this.events[i]!;
    if (e.type === 'target') return this.segValue(e.time, prevIdx, prevSegV0);
    return e.value;
  }

  /** 当前段在 t 的值。idx=-1 → 首事件前。 */
  private segValue(t: number, idx: number, segV0: number): number {
    const cur = idx >= 0 ? this.events[idx]! : null;
    const nxt = idx + 1 < this.events.length ? this.events[idx + 1]! : null;
    // 逼近型 ramp：从当前段值向下一事件插值（规范：ramp 自上一事件时刻起算）
    if (nxt && (nxt.type === 'linear' || nxt.type === 'exp')) {
      const t0 = cur ? cur.time : 0;
      const v0 = cur && cur.type === 'target'
        ? cur.value + (segV0 - cur.value) * Math.exp(-(t - t0) / cur.tc) // 罕见叠段：取指数趋近的当刻值
        : (cur ? segV0 : this.base);
      if (nxt.time <= t0) return nxt.value;
      const f = Math.min(Math.max((t - t0) / (nxt.time - t0), 0), 1);
      if (nxt.type === 'linear') return v0 + (nxt.value - v0) * f;
      const a = Math.abs(v0) < 1e-12 ? 1e-12 * Math.sign(nxt.value || 1) : v0;
      return a * Math.pow(nxt.value / a, f);
    }
    if (!cur) return this.base;
    if (cur.type === 'target') return cur.value + (segV0 - cur.value) * Math.exp(-(t - cur.time) / cur.tc);
    return segV0; // set / 已完成的 ramp：常值
  }

  private clamp(v: number): number { return v < this.min ? this.min : v > this.max ? this.max : v; }

  /** 渲染路径：内在值逐样本填充（游标单调推进），随后由调用方叠加外接信号块。 */
  fillIntrinsic(out: Float32Array, startFrame: number, n: number, sr: number): void {
    for (let i = 0; i < n; i++) {
      const t = (startFrame + i) / sr;
      while (this.idx + 1 < this.events.length && this.events[this.idx + 1]!.time <= t) {
        this.segV0 = this.valueAtEventStart(this.idx + 1, this.segV0, this.idx);
        this.idx++;
      }
      out[i] = this.clamp(this.segValue(t, this.idx, this.idx >= 0 ? this.segV0 : this.base));
    }
    if (this.idx === -1) this.segV0 = this.base;
  }

  /** 计算值块 = 内在值 + Σ外接输入（规范语义；.value 永远看不见后一项——这就是账本的盲区）。 */
  computeBlock(bi: number, startFrame: number, n: number): Float32Array {
    const sr = this.ctx.sampleRate;
    const out = this.scratch.length >= n ? this.scratch : (this.scratch = new Float32Array(BLOCK));
    this.fillIntrinsic(out, startFrame, n, sr);
    for (const src of this.inputs) {
      const b = src.process(bi);
      for (let i = 0; i < n; i++) out[i] = this.clamp(out[i]! + b[i]!);
    }
    return out;
  }
  private scratch = new Float32Array(BLOCK);
}

export abstract class OfflineNode {
  readonly ctx: OfflineCtx;
  readonly inputs: OfflineNode[] = [];
  protected out = new Float32Array(BLOCK);
  private lastBi = -1;
  // 输入累加块必须每节点自持：拉取会经参数外接链嵌套（LFO→深度→调制口），共享 scratch 会被内层覆写
  private readonly insum = new Float32Array(BLOCK);
  constructor(ctx: OfflineCtx) { this.ctx = ctx; ctx.allNodes.push(this); }

  connect(dst: OfflineNode | OfflineParam): OfflineNode | OfflineParam {
    dst.inputs.push(this);
    return dst;
  }

  process(bi: number): Float32Array {
    if (this.lastBi === bi) return this.out;
    this.lastBi = bi;
    const n = BLOCK;
    const startFrame = bi * BLOCK;
    const insum = this.insum;
    insum.fill(0, 0, n);
    for (const src of this.inputs) {
      const b = src.process(bi);
      for (let i = 0; i < n; i++) insum[i] = insum[i]! + b[i]!;
    }
    this.render(bi, startFrame, n, insum);
    return this.out;
  }
  protected abstract render(bi: number, startFrame: number, n: number, insum: Float32Array): void;
}

class DestinationNode extends OfflineNode {
  protected render(_bi: number, _sf: number, n: number, insum: Float32Array): void {
    this.out.set(insum.subarray(0, n));
  }
}

class GainNode extends OfflineNode {
  readonly gain: OfflineParam;
  constructor(ctx: OfflineCtx) { super(ctx); this.gain = new OfflineParam(ctx, 1); }
  protected render(bi: number, sf: number, n: number, insum: Float32Array): void {
    const g = this.gain.computeBlock(bi, sf, n);
    for (let i = 0; i < n; i++) this.out[i] = insum[i]! * g[i]!;
  }
}

class OscillatorNode extends OfflineNode {
  type = 'sine';
  readonly frequency: OfflineParam;
  private phase = 0;
  private startAt = Infinity;
  private stopAt = Infinity;
  constructor(ctx: OfflineCtx) { super(ctx); this.frequency = new OfflineParam(ctx, 440, -ctx.sampleRate / 2, ctx.sampleRate / 2); }
  start(t?: number): void { this.startAt = t ?? this.ctx.currentTime; }
  stop(t?: number): void { this.stopAt = t ?? this.ctx.currentTime; }
  protected render(bi: number, sf: number, n: number): void {
    const sr = this.ctx.sampleRate;
    const f = this.frequency.computeBlock(bi, sf, n);
    for (let i = 0; i < n; i++) {
      const t = (sf + i) / sr;
      if (t < this.startAt || t >= this.stopAt) { this.out[i] = 0; continue; }
      this.phase += f[i]! / sr;
      const p = this.phase - Math.floor(this.phase);
      if (this.type === 'sine') this.out[i] = Math.sin(2 * Math.PI * p);
      else if (this.type === 'triangle') this.out[i] = p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4;
      else if (this.type === 'sawtooth') this.out[i] = p < 0.5 ? 2 * p : 2 * p - 2;
      else this.out[i] = Math.sin(2 * Math.PI * p);
    }
  }
}

class BiquadFilterNode extends OfflineNode {
  type = 'lowpass';
  readonly frequency: OfflineParam;
  readonly Q: OfflineParam;
  readonly gain: OfflineParam;
  private z1 = 0; private z2 = 0;
  constructor(ctx: OfflineCtx) {
    super(ctx);
    this.frequency = new OfflineParam(ctx, 350, 0, ctx.sampleRate / 2);
    this.Q = new OfflineParam(ctx, 1);
    this.gain = new OfflineParam(ctx, 0);
  }
  protected render(bi: number, sf: number, n: number, insum: Float32Array): void {
    // 系数按块更新（k-rate 近似；slew 时常 ≥250ms ≫ 块长 5.3ms）
    const sr = this.ctx.sampleRate;
    const f0 = Math.min(Math.max(this.frequency.computeBlock(bi, sf, 1)[0]!, 1), sr / 2 - 1);
    const q = this.Q.computeBlock(bi, sf, 1)[0]!;
    const gDb = this.gain.computeBlock(bi, sf, 1)[0]!;
    const w0 = 2 * Math.PI * f0 / sr, cw = Math.cos(w0), sw = Math.sin(w0);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (this.type === 'lowpass' || this.type === 'highpass') {
      const alpha = sw / 2 * Math.pow(10, -q / 20); // 规范：LP/HP 的 Q 单位为 dB
      if (this.type === 'lowpass') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
      else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
      a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    } else if (this.type === 'bandpass') {
      const alpha = sw / (2 * Math.max(q, 1e-4));
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha;
    } else if (this.type === 'highshelf') {
      const A = Math.pow(10, gDb / 40);
      const alpha = sw / 2 * Math.sqrt((A + 1 / A) * (1 / 1 - 1) + 2); // S=1
      const two = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + two);
      b1 = -2 * A * ((A - 1) + (A + 1) * cw);
      b2 = A * ((A + 1) + (A - 1) * cw - two);
      a0 = (A + 1) - (A - 1) * cw + two;
      a1 = 2 * ((A - 1) - (A + 1) * cw);
      a2 = (A + 1) - (A - 1) * cw - two;
    }
    const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0, na1 = a1 / a0, na2 = a2 / a0;
    let z1 = this.z1, z2 = this.z2;
    for (let i = 0; i < n; i++) {
      const x = insum[i]!;
      const y = nb0 * x + z1;
      z1 = nb1 * x - na1 * y + z2;
      z2 = nb2 * x - na2 * y;
      this.out[i] = y;
    }
    this.z1 = z1; this.z2 = z2;
  }
}

class DelayNode extends OfflineNode {
  readonly delayTime: OfflineParam;
  private readonly buf: Float32Array;
  private w = 0;
  constructor(ctx: OfflineCtx, maxSec: number) {
    super(ctx);
    this.delayTime = new OfflineParam(ctx, 0, 0, maxSec);
    this.buf = new Float32Array(Math.ceil(maxSec * ctx.sampleRate) + BLOCK + 4);
  }
  protected render(bi: number, sf: number, n: number, insum: Float32Array): void {
    const sr = this.ctx.sampleRate;
    const d = this.delayTime.computeBlock(bi, sf, n);
    const L = this.buf.length;
    for (let i = 0; i < n; i++) {
      this.buf[this.w] = insum[i]!;
      const delaySamples = d[i]! * sr;
      let r = this.w - delaySamples;
      while (r < 0) r += L;
      const r0 = Math.floor(r), fr = r - r0;
      const s0 = this.buf[r0 % L]!, s1 = this.buf[(r0 + 1) % L]!;
      this.out[i] = s0 + (s1 - s0) * fr;
      this.w = (this.w + 1) % L;
    }
  }
}

class OfflineBuffer {
  readonly data: Float32Array;
  constructor(len: number) { this.data = new Float32Array(len); }
  getChannelData(_ch: number): Float32Array { return this.data; }
}

class BufferSourceNode extends OfflineNode {
  buffer: OfflineBuffer | null = null;
  loop = false;
  private startAt = Infinity;
  private stopAt = Infinity;
  start(t?: number): void { this.startAt = t ?? this.ctx.currentTime; }
  stop(t?: number): void { this.stopAt = t ?? this.ctx.currentTime; }
  protected render(_bi: number, sf: number, n: number): void {
    const sr = this.ctx.sampleRate;
    const d = this.buffer ? this.buffer.data : null;
    for (let i = 0; i < n; i++) {
      const t = (sf + i) / sr;
      if (!d || d.length === 0 || t < this.startAt || t >= this.stopAt) { this.out[i] = 0; continue; }
      let k = Math.floor((t - this.startAt) * sr);
      if (this.loop) k %= d.length;
      this.out[i] = k < d.length ? d[k]! : 0;
    }
  }
}

export class OfflineCtx {
  readonly sampleRate: number;
  currentTime = 0;
  readonly destination: DestinationNode;
  readonly allNodes: OfflineNode[] = [];
  private taps: { node: OfflineNode; chunks: Float32Array[] }[] = [];

  // 默认 48k：贴近浏览器现实（白噪源的带内能量随采样率变——见 FEEDBACK 现实修正）
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.destination = new DestinationNode(this);
  }

  createGain(): GainNode { return new GainNode(this); }
  createOscillator(): OscillatorNode { return new OscillatorNode(this); }
  createBiquadFilter(): BiquadFilterNode { return new BiquadFilterNode(this); }
  createDelay(maxSec: number): DelayNode { return new DelayNode(this, maxSec); }
  createBuffer(_ch: number, len: number, _sr: number): OfflineBuffer { return new OfflineBuffer(len); }
  createBufferSource(): BufferSourceNode { return new BufferSourceNode(this); }

  /** 登记录音点（如 bedBus）：render 后经返回句柄取整段波形。 */
  tap(node: OfflineNode): () => Float32Array {
    const t = { node, chunks: [] as Float32Array[] };
    this.taps.push(t);
    return () => concat(t.chunks);
  }

  /** 定长渲染（确定性）：一切调度须在此前完成。返回 destination 波形。 */
  render(totalSec: number): Float32Array {
    const frames = Math.ceil(totalSec * this.sampleRate);
    const blocks = Math.ceil(frames / BLOCK);
    const dst = new Float32Array(blocks * BLOCK);
    for (let bi = 0; bi < blocks; bi++) {
      const b = this.destination.process(bi);
      dst.set(b, bi * BLOCK);
      for (const t of this.taps) t.chunks.push(new Float32Array(t.node.process(bi)));
      this.currentTime = ((bi + 1) * BLOCK) / this.sampleRate;
    }
    return dst.subarray(0, frames);
  }
}

function concat(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.length * BLOCK);
  for (let i = 0; i < chunks.length; i++) out.set(chunks[i]!, i * BLOCK);
  return out;
}

// ---------- 量具（ear 与金测试共用） ----------

export function rmsDb(x: Float32Array, sr: number, fromSec: number, toSec: number): number {
  const a = Math.max(0, Math.floor(fromSec * sr)), b = Math.min(x.length, Math.floor(toSec * sr));
  if (b <= a) return -180;
  let e = 0;
  for (let i = a; i < b; i++) e += x[i]! * x[i]!;
  const r = Math.sqrt(e / (b - a));
  return r <= 1e-9 ? -180 : 20 * Math.log10(r);
}

/** 1s 窗 RMS 包络（dB）。 */
export function envelope1sDb(x: Float32Array, sr: number): number[] {
  const out: number[] = [];
  for (let s = 0; s + sr <= x.length; s += sr) out.push(rmsDb(x, sr, s / sr, s / sr + 1));
  return out;
}

/** 频带 RMS（dB）：双二阶带通两级级联后测 RMS（呼唤穿透 G5 的量具）。 */
export function bandRmsDb(x: Float32Array, sr: number, loHz: number, hiHz: number, fromSec: number, toSec: number): number {
  const fc = Math.sqrt(loHz * hiHz), q = fc / (hiHz - loHz);
  const w0 = 2 * Math.PI * fc / sr, cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = -2 * cw / a0, a2 = (1 - alpha) / a0;
  const a = Math.max(0, Math.floor(fromSec * sr)), b = Math.min(x.length, Math.floor(toSec * sr));
  if (b <= a) return -180;
  let e = 0, cnt = 0;
  let z11 = 0, z12 = 0, z21 = 0, z22 = 0;
  // 从测量窗前 0.05s 起走滤波器暖机，能量只计窗内
  const warm = Math.max(0, a - Math.floor(0.05 * sr));
  for (let i = warm; i < b; i++) {
    const x0 = x[i]!;
    let y = b0 * x0 + z11; z11 = -a1 * y + z12 + 0; z12 = b2 * x0 - a2 * y;
    const y2v = b0 * y + z21; z21 = -a1 * y2v + z22; z22 = b2 * y - a2 * y2v;
    if (i >= a) { e += y2v * y2v; cnt++; }
  }
  const r = cnt ? Math.sqrt(e / cnt) : 0;
  return r <= 1e-9 ? -180 : 20 * Math.log10(r);
}
