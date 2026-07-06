// 手写声明（M2.3 §1.6，Track-SOUND 移交件）：与 cut.js 导出面一致。
// cut.js 本体是纯 JS 单一事实源（浏览器/Node 双端直跑）；此件只为 typecheck 消费者服务。
import type { Tape } from './replay.js';

export const CUTS_VERSION: number;

export type CutRole = 'OPEN' | 'RAMP' | 'PEAK' | 'TURN' | 'CLOSE' | 'BRIDGE' | 'MANUAL';

export interface CutSegment {
  role: CutRole;
  t0: number; // 舞台毫秒（整数）
  t1: number;
  speed: number; // 整倍速；段内恒速，换速只在接带处
}

export interface CutAnalysis {
  bins: number;
  activeMs: number;
  viewerMs: number;
  selectedStageMs: number;
  coverage: number;        // raw 覆盖率（记述值，M2.3 §0.2）
  excessCoverage: number;  // 盈余覆盖率（体检表描述子）
  efficiency: number;      // 选择效率（正式影子，阈值候两轮）
  durationShare: number;
}

export interface CutParams {
  version: number;
  density: { a: number; b: number; c: number };
  bonus: { stuckEdge: number; resolve: number; askEdge: number; weatherUp: number; done: number };
  grammar: Record<string, Record<string, number | number[]>>;
  solver: { targetsS: number[]; defaultS: number; allowUnderrun: boolean };
  shadow: { coverageMin: number; durationShareMax: number };
}

export interface CutsDocument {
  version: number;
  tape: string;
  tapeHash: string;
  paramsHash: string;
  targetS: number;
  segments: CutSegment[];
}

export function analyzeTape(tape: Tape, params: CutParams): {
  B: number;
  d: Float64Array;
  P: Float64Array;
  Tmean: Float64Array;
  active: Uint8Array;
  activeCount: number;
  dActiveMean: number;
  mCount: Int32Array;
};

export function proposeCuts(tape: Tape, params: CutParams, targetS?: number): {
  segments: CutSegment[];
  analysis: CutAnalysis;
};

export function cutsDocument(args: {
  tapeName: string;
  tapeHash: string;
  paramsHash: string;
  targetS: number;
  segments: CutSegment[];
}): CutsDocument;

export function serializeCuts(doc: CutsDocument): string;
