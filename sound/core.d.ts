// core.js 的类型面（SOUND-R1）：实现在 core.js（纯 JS，Node/浏览器逐字同源），类型在此供 tsc 检查。
import type { Phase, Weather, StatePacket } from '../protocol/index.ts';

export interface SoundParams {
  bpm: number;
  gridDiv: number; // 8 = 1/8 网格
  bed: {
    l1Gain: number; l1IdleGain: number; l1AirRatio: number; // L1 织体体（SOUND-R2：真采样为体）
    crackleDbLo: number; crackleDbHi: number;               // 磨损织体（T 驱动，直达输出）
    l2Gain: number;                                          // L2 和声垫（铁律：< l1Gain，resolve 执法）
    s2Gain: number; s2GateA: number; s2DensityLo: number; s2DensityHi: number;
    s3Gain: number; s3GateT: number;
    filterHzHi: number; filterHzLo: number;
    hissDbLo: number; hissDbHi: number;
    wowCentsLo: number; wowCentsHi: number;
    hfShelfDbLo: number; hfShelfDbHi: number;
    slewMsFast: number; slewMsSlow: number;
    doneSilenceSec: number;
    trimDb: number;      // 床总闸（dB）：EAR-1 沿革；v2 出厂 0，响度由 G7 执法
    breathDepth: number; // 呼吸深度（相对值 0.05–0.20）：方案 B 乘法级，挂 L1 正身
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

export interface BedState {
  T: number; A: number; wow: number;
  phase: Phase; weather: Weather; pendingAsk: boolean;
}

export interface BedTargets {
  l1: number;        // L1 织体体增益（IDLE 时唯余此层最弱态）
  crackle: number;   // 磨损织体增益（T 驱动；与 hiss 同路直达输出）
  l2: number;        // L2 和声垫增益（铁律：永低于 l1）
  s2: number;        // 律动增益（A 门控）
  s3: number;        // 张力弦增益（T 门控）
  hissLin: number;   // 磁带底噪线性增益（T 驱动；v2 出低通直达输出）
  filterHz: number;  // 主滤波截止 8k→1.8k 随 T 线性下压
  hfShelfDb: number; // 高频搁架 0→−6dB
  wowCents: number;  // 走带不稳深度 3→22 音分（wow 驱动）
  susProb: number;   // 和声悬挂音比例 = T
  density: number;   // 律动触发概率 0.2→0.9 随 A
  hover: boolean;    // WAITING：床转半终止悬停（属和声延音）
  silence: boolean;  // DONE：正格终止 → 真静默 ≥4s
}

/** 轨迹行：[compMs, needle, T, A, wxIdx, phIdx, wow, ask] */
export type TrackRow = [number, number, number, number, number, number, number, number];

export function resolveSoundParams(raw: unknown): SoundParams;
export const clamp01: (x: number) => number;
export const dbToLin: (db: number) => number;
export const linToDb: (lin: number) => number;
export function bedTargets(s: BedState, sp: SoundParams): BedTargets;
export function bedEnergyDb(bt: BedTargets): number;
export const S2_REF_DENSITY: number;
export const S2_CREST: number;
export function bedRmsDb(bt: BedTargets): number;
export function habituationGain(n: number, sp: SoundParams): number;
export function quantizeUpSec(atSec: number, sp: SoundParams): number;
export function degreeOf(slotHex: string | undefined, sp: SoundParams): number;
export function rootMidiOf(repoKey: string, sp: SoundParams): number;
export const midiToHz: (m: number) => number;
export function degreeHz(rootMidi: number, degree: number, octave: number, sp: SoundParams): number;
export function askMotifHz(rootMidi: number, sp: SoundParams): number;
export const WEATHER_IDX: readonly string[];
export const PHASE_IDX: readonly string[];
export function buildTrack(snaps: StatePacket[], gapCapMs?: number, maxPoints?: number):
  { track: TrackRow[]; comp: number[]; t0: number };
export function sampleAt(track: TrackRow[], pm: number): TrackRow;
export function pearson(xs: number[], ys: number[]): number | null;
