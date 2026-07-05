// graph.js 的类型面（SOUND-R2）：实现在 graph.js（Node/浏览器逐字同源）。
// SoundCtx 是 graph 对上下文的结构化最小要求——浏览器 AudioContext 与 offline.ts 的离线上下文都满足它。
import type { SoundParams, BedTargets, TrackRow } from './core.js';
import type { AssetMap } from './assets.js';

export interface SoundParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  setTargetAtTime(v: number, t: number, tc: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues(t: number): unknown;
}
export interface SoundNodeLike {
  connect(dst: unknown): unknown;
}
export interface SoundCtx {
  sampleRate: number;
  currentTime: number;
  destination: SoundNodeLike;
  createGain(): SoundNodeLike & { gain: SoundParamLike };
  createOscillator(): SoundNodeLike & { type: string; frequency: SoundParamLike; start(t?: number): void; stop(t?: number): void };
  createBiquadFilter(): SoundNodeLike & { type: string; frequency: SoundParamLike; Q: SoundParamLike; gain: SoundParamLike };
  createDelay(maxSec: number): SoundNodeLike & { delayTime: SoundParamLike };
  createBuffer(ch: number, len: number, sr: number): { getChannelData(ch: number): Float32Array; copyToChannel(src: Float32Array, ch: number): void };
  createBufferSource(): SoundNodeLike & { buffer: unknown; loop: boolean; loopStart: number; loopEnd: number; playbackRate: SoundParamLike; start(t?: number, offsetSec?: number): void; stop(t?: number): void };
  createWaveShaper(): SoundNodeLike & { curve: Float32Array | null };
}

export function seedOf(str: string): number;
export function mulberry32(seed: number): () => number;

export interface Registry {
  nodes: Map<string, SoundNodeLike>;
  connect(a: SoundNodeLike, b: unknown): void;
  stopAll(at: number): void;
  hardMute(): void;
  debugGains(): Record<string, number>;
}

export const CALIB: {
  l2Norm: number; s3Norm: number; hissNorm: number;
  fbBodyLen: number; fbAirLen: number; fbCrackleLen: number;
};

export function createRegistry(ctx: SoundCtx): Registry;

export interface StackInfo { voices: number; detunesCents: number[]; filterLfos: number; saturation: boolean }

export interface SoundEngine {
  ctx: SoundCtx;
  SP: SoundParams;
  ROOT: number;
  registry: Registry;
  nodes: Record<string, SoundNodeLike & { gain?: SoundParamLike }>;
  readonly transport: { audio0: number; speed: number; track: TrackRow[]; durMs: number; startPm: number } | null;
  readonly lastGridAt: number;
  readonly doneSilentUntil: number;
  applyBed(bt: BedTargets, at: number, imm: boolean): void;
  startTransport(audio0: number, speed: number, track: TrackRow[], durMs: number, startPm?: number): void;
  scheduleGridUntil(untilSec: number): void;
  trigger(cls: number, atSec: number, deg: number, vel: number): void;
  applyBedNow(pm: number): void;
  setMute(name: 'l1' | 'crackle' | 'l2' | 's2' | 's3' | 'hiss' | 'fg' | 'record', on: boolean): void;
  assetsUsed: { body: boolean; air: boolean; crackle: boolean };
  stackInfo: { l2: StackInfo; s3: StackInfo };
  // 唱片面（SOUND-R3）
  readonly recordInfo: { idx: number; name: string; title: string; seconds: number; count: number; tapeStopped: boolean } | null;
  recordCount: number;
  setRecord(idx: number, at?: number): void;
  recordPosAt(t: number): number;
  stop(at: number): void;
  hardMute(): void;
  muteMaster(at: number): void;
  unmuteMaster(at: number): void;
  debugGains(): Record<string, number>;
}

/** 唱片条目（PCM 已解码：页 decodeAudioData／Node afconvert）；lufs=定标锚（catalog.json prep 实测）。 */
export interface RecordClip {
  name: string; title?: string; x: Float32Array; sr: number; lufs: number; seconds: number; bpmMeasured?: number;
}

export function buildEngine(ctx: SoundCtx, SP: SoundParams, opts: { repoKey: string; seed?: string; assets?: AssetMap | null; records?: RecordClip[] | null; recordIndex?: number }): SoundEngine;
