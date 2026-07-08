// 手写声明（M2.3 §1.6，Track-SOUND 移交件）：与 replay.js 导出面一致。
export const PACKET_MS: number;
export const GAP_CLAMP: number;
export const PHASES: readonly string[];
export const WEATHERS: readonly string[];

export interface Curve {
  n: number;
  t: Float64Array;
  S: Float64Array;
  T: Float64Array;
  A: Float64Array;
  wow: Float64Array;
  needle: Float64Array;
  phase: Uint8Array;
  weather: Uint8Array;
  pendingAsk: Uint8Array;
}

export interface Moment {
  t: number;
  seq: number;
  verb: string;
  outcome: string;
  special: string | null;
  stageT: number;
}

export interface Tape {
  name: string;
  curve: Curve;
  st: Float64Array;      // 舞台时间轴（拼接折叠后，毫秒）
  splices: number[];     // 接带痕的舞台时刻
  moments: Moment[];
  duration: number;      // 舞台毫秒
  curveText?: string;    // loadTape 记账（tapeHash 之源：曲线+时刻两件套）
  momentsText?: string;
}

export interface StatePacket {
  stageT: number;
  S: number;
  T: number;
  A: number;
  wow: number;
  needle: number;
  phase: string;
  weather: string;
  pendingAsk: boolean;
}

export function foldRawT(tape: Tape, rawT: number): number;
export function unfoldStageT(tape: Tape, stageT: number): number;
export function parseCurve(text: string): Curve;
export function parseMoments(text: string): Omit<Moment, 'stageT'>[];
export function buildTape(name: string, curveText: string, momentsText?: string): Tape;
export function loadTape(name: string): Promise<Tape>;
export function sampleAt(tape: Tape, tau: number): StatePacket;

export class Replayer {
  constructor(tape: Tape);
  tape: Tape;
  stageT: number;
  speed: number;
  playing: boolean;
  onPacket: ((pkt: StatePacket, isSeek?: boolean) => void)[];
  onMoment: ((m: Moment) => void)[];
  onPlayState: ((playing: boolean) => void) | null; // 转台开停通知（丙.2 声侧暂停/续播唱片）
  play(): void;
  pause(): void;
  seek(tau: number): void;
}
