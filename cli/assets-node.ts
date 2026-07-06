// Node 侧资产装载（SOUND-R2 → M2.5 §C 取件双位）：manifest + WAV → AssetMap。浏览器侧走 probe 页内嵌（assets.js 同一解析）。
// 逐件校验内容哈希——磁盘腐坏/手改即抛（资产与代码同级：改资产必须过 prep 流程更新清单）。
// 件位解析：repo vendored 优先 → ~/.foley/assets/factory/（records fetch 征询落盘位）回退 →
// 皆缺则跳过该件并警示（graph fallback 合成织体同构顶上——结构不因资产缺席而变，R2 §2 退路沿革）。
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseWavPcm16, fnvBytes, type AssetMap } from '../sound/assets.js';

export interface AssetManifestEntry {
  name: string; file: string; seconds: number; sampleRate: number; rmsDb: number;
  fnv: string; bytes: number; source: string; author: string; title: string; license: string;
}

export function loadAssetsNode(): { assets: AssetMap; manifest: AssetManifestEntry[] } {
  const manifest = (JSON.parse(readFileSync(new URL('../sound/assets/manifest.json', import.meta.url), 'utf8')) as { assets: AssetManifestEntry[] }).assets;
  const factoryDir = join(homedir(), '.foley', 'assets', 'factory');
  const assets: AssetMap = {};
  for (const e of manifest) {
    const vendored = new URL(`../sound/assets/${e.file}`, import.meta.url).pathname;
    const path = existsSync(vendored) ? vendored : join(factoryDir, e.file);
    if (!existsSync(path)) {
      console.error(`⚠ 床音缺件：${e.file}（vendored 与 factory 缓存皆无）——fallback 合成织体顶上；取回：node cli/index.ts records fetch`);
      continue;
    }
    const bytes = readFileSync(path);
    const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const h = fnvBytes(u8);
    if (h !== e.fnv) throw new Error(`资产内容哈希不符：${e.file}（清单 ${e.fnv} ≠ 实际 ${h}）——改资产必须走 prep 流程`);
    const { x, sr } = parseWavPcm16(u8);
    assets[e.name] = { x, sr, rmsDb: e.rmsDb, seconds: e.seconds, fnv: e.fnv };
  }
  return { assets, manifest };
}
