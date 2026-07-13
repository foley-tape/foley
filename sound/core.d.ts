// core.js 的类型面（SOUND-R1）：实现在 core.js（纯 JS，Node/浏览器逐字同源），类型在此供 tsc 检查。
import type { Phase, Weather, StatePacket } from '../protocol/index.ts';

export interface SoundParams {
  bpm: number;
  gridDiv: number; // 8 = 1/8 网格
  bed: {
    // 新床 v3（声资产批定稿§三·旧织体床退役令）：马达低哼＋带过磁头嘶
    humGain: number;                     // 马达低哼电平（呼吸级地板·三关铁律出生）
    hissGain: number;                    // 过头嘶电平（带走满速基准）
    hissSpeedPow: number;                // 嘶随走带速度幂律
    hissSpeedMax: number;                // 速度增益饱和上限（读头噪声有限增长）
    hissWowDepth: number;                // wow→嘶电平微摆深度
    crackleDbLo: number; crackleDbHi: number; // 唱片磨损介质噪声（随 T·不随织体床退役）
    filterHzHi: number; filterHzLo: number;
    hfShelfDbLo: number; hfShelfDbHi: number;
    slewMsFast: number; slewMsSlow: number;
    doneSilenceSec: number;
    trimDb: number;      // 床总闸（dB）：G2 遍历域沿革
    underRecordDb?: number; // P0-2 混音宪法：唱片在位床整体让位 dB；缺省 0＝旧判据兼容
  };
  foreground: {
    peakGain: number; failGain: number; pageGain: number; bellGain: number;
    saveGain: number; spawnGain: number;
    habituationFactor: number; habituationWindowSec: number; habituationFloorRatio: number;
  };
  call: { gain: number; askBandHzLo: number; askBandHzHi: number; askRepeatSec: number };
  classes: { whisperOverBedDb: number; touchOverBedDb: number; meterWindowMs: number; meterToleranceDb: number };   // 声资产批§二 响度阶级
  loudness: { bedLufs: number; bedSwingDb: number; fgPeakLufs: number; callPeakLufs: number; truePeakDbTp: number };
  scale: { pentatonic: number[]; rootMidiBase: number; rootMidiSpan: number };
  record: {
    // SOUND-R3 唱片总线：恒电平（F5 v2）；T 的表达=处置（磨损/滤波/抖）
    targetLufs: number;                        // 唱片在位总线积分响度目标（G3/G7 v3 口径）
    duckDb: number; duckSlewMs: number;        // ASK：唱片让位半格
    stuckLoopSecLo: number; stuckLoopSecHi: number; // 跳针短循环窗（种子化取值）
    stuckTickGain: number;                     // 跳针针嗒电平（每循环回绕一声——哑跳可辨的物理来源）
    tapeStopSec: number;                       // DONE：降速滑停历时
    filterHzLo: number; filterHzHi: number;    // T 低通下压（S4 参数域平移）
    wowCentsLo: number; wowCentsHi: number; wowTBoost: number; // 音高微醺；T 加深
    wowRateHz: number;                         // 走带不稳频率（≈33⅓rpm 偏心）
    fadeInSec: number; fadeOutSec: number;     // IDLE 淡出／回场淡入
  };
}

export interface BedState {
  T: number; A: number; wow: number;
  phase: Phase; weather: Weather; pendingAsk: boolean;
  recordOn?: boolean; // SOUND-R3：唱片在位——床整体 under（混音宪法）
  moving?: boolean;   // v3 状态表：带走（transport 在场且未暂停）；未传=true（旧调用方近似）
  speed?: number;     // 走带速度（嘶幂律粮）；未传=1
}

export interface RecordTargets {
  gain: number;      // trim×duck×关断（响度定标乘数在 graph 侧：targetLufs−catalog.lufs）
  lpHz: number;      // T 低通下压
  wowCents: number;  // 音高微醺深度（wow 驱动，T 加深）
  fadeSec: number;   // 当前朝向的 slew 时常（淡入/淡出）
  silence: boolean;  // DONE（tape-stop 事件由 graph 调度）
  idle: boolean;     // IDLE：唱片淡出，房间层接管
}

export interface BedTargets {
  hum: number;       // 马达低哼增益（机器上电即在·呼吸级地板·DONE 不熄=听得见的安静）
  hiss: number;      // 过头嘶增益（带走门控·随速度幂律与 wow 微摆·暂停抬带即止）
  crackle: number;   // 唱片磨损介质噪声增益（T 驱动·underRecord 近隐·wearBus 直达输出）
  filterHz: number;  // 主滤波截止 8k→1.8k 随 T 线性下压
  hfShelfDb: number; // 高频搁架 0→−6dB
  hover: boolean;    // WAITING（保留位·作曲床退役后无消费者）
  silence: boolean;  // DONE：唱片滑停/嘶止（哼不随此熄——状态表）
}

/** 轨迹行：[compMs, needle, T, A, wxIdx, phIdx, wow, ask] */
export type TrackRow = [number, number, number, number, number, number, number, number];

export function resolveSoundParams(raw: unknown): SoundParams;
export const clamp01: (x: number) => number;
export const dbToLin: (db: number) => number;
export const linToDb: (lin: number) => number;
export function bedTargets(s: BedState, sp: SoundParams): BedTargets;
export function recordTargets(s: BedState, sp: SoundParams): RecordTargets;
export function bedEnergyDb(bt: BedTargets): number;
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
