// graph.js 的类型面（SOUND-R1）：实现在 graph.js（Node/浏览器逐字同源）。
// SoundCtx 是 graph 对上下文的结构化最小要求——浏览器 AudioContext 与 offline.ts 的离线上下文都满足它。
import type { SoundParams, BedTargets, TrackRow } from './core.js';

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
  createBuffer(ch: number, len: number, sr: number): { getChannelData(ch: number): Float32Array };
  createBufferSource(): SoundNodeLike & { buffer: unknown; loop: boolean; start(t?: number): void; stop(t?: number): void };
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

export const CALIB: { s1Norm: number; s3Norm: number; hissNorm: number; roomBase: number; roomWx: number; v1Detune: number };

export function createRegistry(ctx: SoundCtx): Registry;

export interface SoundEngine {
  ctx: SoundCtx;
  SP: SoundParams;
  ROOT: number;
  registry: Registry;
  nodes: Record<string, SoundNodeLike & { gain?: SoundParamLike }>;
  readonly transport: { audio0: number; speed: number; track: TrackRow[]; durMs: number } | null;
  readonly lastGridAt: number;
  readonly doneSilentUntil: number;
  applyBed(bt: BedTargets, at: number, imm: boolean): void;
  startTransport(audio0: number, speed: number, track: TrackRow[], durMs: number): void;
  scheduleGridUntil(untilSec: number): void;
  trigger(cls: number, atSec: number, deg: number, vel: number): void;
  applyBedNow(pm: number): void;
  stop(at: number): void;
  hardMute(): void;
  muteMaster(at: number): void;
  debugGains(): Record<string, number>;
}

export function buildEngine(ctx: SoundCtx, SP: SoundParams, opts: { repoKey: string; seed?: string }): SoundEngine;
