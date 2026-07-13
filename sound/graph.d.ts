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
  humNorm: number; hissNorm: number;
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
  needleDrop(atSec: number): void;
  setMute(name: 'hum' | 'hiss' | 'crackle' | 'fg' | 'record', on: boolean): void;   // 隔离板 v3
  setOnSound(fn: ((e: { name: string; klass: string; at: number }) => void) | null): void;   // 越级检测仪挂钩
  relayClick(at: number): void;        // POST 乐谱：继电器首咔（手感）
  filamentTick(at: number): void;      // 钨丝点火嗒（耳语）
  servoSweep(at: number, durSec?: number): void;   // 伺服吱—嘀嘀（耳语）
  solariClatter(at: number, durMs?: number): void; // Solari 塑片连击（耳语~手感）
  holdBedUntil(bornAt: number): void;  // POST 温柔苏醒：床压黑至诞生点
  assetsUsed: { body: boolean; air: boolean; crackle: boolean };
  stackInfo: { hum: StackInfo };   // 三关自述 v3（马达低哼）
  // 唱片面（SOUND-R3）
  readonly recordInfo: { idx: number; name: string; title: string; seconds: number; count: number; tapeStopped: boolean } | null;
  recordCount: number;
  setRecord(idx: number, at?: number): void;
  recordPosAt(t: number): number;
  pauseRecord(at: number): void;   // 丙.2：暂停＝唱片随带停（房间常在）
  resumeRecord(at: number): void;  // 丙.2：恢复＝续播不重建（从暂停读头续）
  readonly recordPaused: boolean;
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
