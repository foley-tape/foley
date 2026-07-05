// assets.js 的类型面（SOUND-R2）。
export interface AssetClip {
  x: Float32Array;
  sr: number;
  rmsDb: number;
  seconds: number;
  fnv: string;
}
export type AssetMap = Record<string, AssetClip>;

export function parseWavPcm16(bytes: Uint8Array | ArrayBuffer): { x: Float32Array; sr: number };
export function fnvBytes(u8: Uint8Array): string;
export function assetsHash(assets: AssetMap): string;
export function assetsFromEmbedded(entries: { name: string; rmsDb: number; seconds: number; fnv: string; b64: string }[]): AssetMap;
