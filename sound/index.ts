// 声音相纯映射核（M1.9 §1.4，白皮书 §2/§3）。纯：无 Node、无 Web Audio、无随机、无 Date。
// 浏览器渲染器（cli/probe.ts 生成页）与离线验收判官（cli/ear.ts、golden/sound.test.ts）**读同一段代码**——
// "床的能量包络必须诚实追随 T"（F5/§1）因此机器可验（§6.1），不是渲染器的巧合。
//
// 值的唯一事实源 = sound-params.json（与 params.json 同级治理：hashJson 上报，_ 键不入哈希）。

import type { Phase, Weather } from '../protocol/index.ts';

export interface SoundParams {
  bpm: number;
  gridDiv: number; // 8 = 1/8 网格
  bed: {
    s1Gain: number; s1IdleGain: number;
    s2Gain: number; s2GateA: number; s2DensityLo: number; s2DensityHi: number;
    s3Gain: number; s3GateT: number;
    filterHzHi: number; filterHzLo: number;
    hissDbLo: number; hissDbHi: number;
    wowCentsLo: number; wowCentsHi: number;
    hfShelfDbLo: number; hfShelfDbHi: number;
    slewMsFast: number; slewMsSlow: number;
    doneSilenceSec: number;
  };
  foreground: {
    peakGain: number; failGain: number; pageGain: number; bellGain: number;
    saveGain: number; spawnGain: number;
    habituationFactor: number; habituationWindowSec: number; habituationFloorRatio: number;
  };
  call: { gain: number; askBandHzLo: number; askBandHzHi: number; askRepeatSec: number };
  loudness: { bedLufs: number; bedSwingDb: number; fgPeakLufs: number; callPeakLufs: number; truePeakDbTp: number };
  scale: { pentatonic: number[]; rootMidiBase: number; rootMidiSpan: number };
}

/** JSON → 强类型（缺段即抛；参数是地基，不容默认漂移——与 engine/params 同纪律）。 */
export function resolveSoundParams(raw: unknown): SoundParams {
  if (!raw || typeof raw !== 'object') throw new Error('sound-params 必须是对象');
  const p = raw as Record<string, unknown>;
  const out = {
    bpm: p['bpm'], gridDiv: p['gridDiv'], bed: p['bed'], foreground: p['foreground'],
    call: p['call'], loudness: p['loudness'], scale: p['scale'],
  } as unknown as SoundParams;
  for (const k of ['bpm', 'gridDiv', 'bed', 'foreground', 'call', 'loudness', 'scale'] as const) {
    if (out[k] === undefined || out[k] === null) throw new Error(`sound-params 缺少 ${k}`);
  }
  return out;
}

// ---------- 床（连续层）映射律 §2.2 ----------

export interface BedState {
  T: number; A: number; wow: number;
  phase: Phase; weather: Weather; pendingAsk: boolean;
}

export interface BedTargets {
  s1: number;        // 基底增益（IDLE 时唯余此层最弱态）
  s2: number;        // 律动增益（A 门控）
  s3: number;        // 张力弦增益（T 门控）
  hissLin: number;   // 磁带底噪线性增益（T 驱动 −60→−38dB）
  filterHz: number;  // 主滤波截止 8k→1.8k 随 T 线性下压
  hfShelfDb: number; // 高频搁架 0→−6dB
  wowCents: number;  // 走带不稳深度 3→22 音分（wow 驱动）
  susProb: number;   // 和声悬挂音比例 = T
  density: number;   // 律动触发概率 0.2→0.9 随 A
  hover: boolean;    // WAITING：床转半终止悬停（属和声延音）
  silence: boolean;  // DONE：正格终止 → 真静默 ≥4s
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const dbToLin = (db: number): number => Math.pow(10, db / 20);

export function bedTargets(s: BedState, sp: SoundParams): BedTargets {
  const b = sp.bed;
  const T = clamp01(s.T), A = clamp01(s.A), wow = clamp01(s.wow);
  const idle = s.phase === 'IDLE';
  const silence = s.phase === 'DONE';
  const s1 = silence ? 0 : idle ? b.s1IdleGain : b.s1Gain;
  const s2gate = clamp01((A - b.s2GateA) / (1 - b.s2GateA));
  const s2 = silence || idle ? 0 : b.s2Gain * s2gate;
  const s3gate = clamp01((T - b.s3GateT) / (1 - b.s3GateT));
  const s3 = silence ? 0 : b.s3Gain * s3gate;
  const hissLin = silence ? 0 : dbToLin(b.hissDbLo + (b.hissDbHi - b.hissDbLo) * T);
  return {
    s1, s2, s3, hissLin,
    filterHz: b.filterHzHi + (b.filterHzLo - b.filterHzHi) * T,
    hfShelfDb: b.hfShelfDbLo + (b.hfShelfDbHi - b.hfShelfDbLo) * T,
    wowCents: b.wowCentsLo + (b.wowCentsHi - b.wowCentsLo) * wow,
    susProb: T,
    density: b.s2DensityLo + (b.s2DensityHi - b.s2DensityLo) * A,
    hover: s.pendingAsk,
    silence,
  };
}

/** 床能量（dB）：不相关源的 RMS 合成。§6.1 机器验收在此包络上算 Pearson r（1s 窗）。 */
export function bedEnergyDb(bt: BedTargets): number {
  const e = Math.sqrt(bt.s1 * bt.s1 + bt.s2 * bt.s2 + bt.s3 * bt.s3 + bt.hissLin * bt.hissLin);
  return e <= 1e-9 ? -120 : 20 * Math.log10(e);
}

// ---------- 前景（离散层）律 §3 ----------

/** 习惯化（§3.2 F4 机械化）：滚动 60s 窗内同类第 n 次 → ×factor^(n−1)，下限=沉床比。呼唤级豁免（调用方不问）。 */
export function habituationGain(n: number, sp: SoundParams): number {
  if (n <= 1) return 1;
  const g = Math.pow(sp.foreground.habituationFactor, n - 1);
  return Math.max(sp.foreground.habituationFloorRatio, g);
}

/** 乐音级量化：对齐到**下一**1/gridDiv 拍网格线（宁迟勿早）。呼唤级永不过此函数。 */
export function quantizeUpSec(atSec: number, sp: SoundParams): number {
  const grid = 60 / sp.bpm / (sp.gridDiv / 4); // 1/8 @72BPM ≈ 0.4167s
  return Math.ceil(atSec / grid - 1e-9) * grid;
}

/** targetHash/slot（hex 串）→ 五声音阶级数：同一目标反复出现同一动机（文件的主题曲）。 */
export function degreeOf(slotHex: string | undefined, sp: SoundParams): number {
  if (!slotHex) return 0;
  let h = 0;
  for (let i = 0; i < slotHex.length; i++) h = ((h << 5) - h + slotHex.charCodeAt(i)) | 0;
  return Math.abs(h) % sp.scale.pentatonic.length;
}

/** repoKey（live=项目路径；replay=磁带 sourceHash，见现实修正）→ 主音 MIDI。每仓库一调。 */
export function rootMidiOf(repoKey: string, sp: SoundParams): number {
  let h = 0;
  for (let i = 0; i < repoKey.length; i++) h = ((h << 5) - h + repoKey.charCodeAt(i)) | 0;
  return sp.scale.rootMidiBase + (Math.abs(h) % sp.scale.rootMidiSpan);
}

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** 级数 → 频率。octave 为相对八度（成功高、失败低的音区分裂由调用方给 octave）。 */
export function degreeHz(rootMidi: number, degree: number, octave: number, sp: SoundParams): number {
  return midiToHz(rootMidi + sp.scale.pentatonic[degree % sp.scale.pentatonic.length]! + 12 * octave);
}

/** ASK 动机主频：夹进频谱专区 [2k,4k]（呼唤级穿透窗，§3.1/§6.4）。 */
export function askMotifHz(rootMidi: number, sp: SoundParams): number {
  let hz = degreeHz(rootMidi, 4, 3, sp); // 属方向高位
  while (hz < sp.call.askBandHzLo) hz *= 2;
  while (hz > sp.call.askBandHzHi) hz /= 2;
  // 半八度死区：夹不进就贴边（带宽刚好一个八度，理论不至此；护栏而已）
  if (hz < sp.call.askBandHzLo) hz = sp.call.askBandHzLo;
  return hz;
}

// ---------- 验收工具 §6.1 ----------

/** Pearson 相关系数。方差趋零（如 silence 带的 T）→ null（NA，不算不及格）。 */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]!; sy += ys[i]!; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx, dy = ys[i]! - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  if (sxx < 1e-12 || syy < 1e-12) return null;
  return sxy / Math.sqrt(sxx * syy);
}
