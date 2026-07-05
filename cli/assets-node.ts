// Node 侧资产装载（SOUND-R2）：manifest + WAV → AssetMap。浏览器侧走 probe 页内嵌（assets.js 同一解析）。
// 逐件校验内容哈希——磁盘腐坏/手改即抛（资产与代码同级：改资产必须过 prep 流程更新清单）。
import { readFileSync } from 'node:fs';
import { parseWavPcm16, fnvBytes, type AssetMap } from '../sound/assets.js';

export interface AssetManifestEntry {
  name: string; file: string; seconds: number; sampleRate: number; rmsDb: number;
  fnv: string; bytes: number; source: string; author: string; title: string; license: string;
}

export function loadAssetsNode(): { assets: AssetMap; manifest: AssetManifestEntry[] } {
  const manifest = (JSON.parse(readFileSync(new URL('../sound/assets/manifest.json', import.meta.url), 'utf8')) as { assets: AssetManifestEntry[] }).assets;
  const assets: AssetMap = {};
  for (const e of manifest) {
    const bytes = readFileSync(new URL(`../sound/assets/${e.file}`, import.meta.url));
    const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const h = fnvBytes(u8);
    if (h !== e.fnv) throw new Error(`资产内容哈希不符：${e.file}（清单 ${e.fnv} ≠ 实际 ${h}）——改资产必须走 prep 流程`);
    const { x, sr } = parseWavPcm16(u8);
    assets[e.name] = { x, sr, rmsDb: e.rmsDb, seconds: e.seconds, fnv: e.fnv };
  }
  return { assets, manifest };
}
