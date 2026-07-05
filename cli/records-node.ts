// Node 侧唱片装载（SOUND-R3）：sound/records/catalog.json + mp3 → 48k mono PCM（RecordClip）。
// 解码走 afconvert（macOS 平台绑定——ear/prep 同跑船长 mac，与 prep-records.mjs 同路：
// lufs 定标锚即在此解码域实测，执法与定标同尺）。逐件校验 fnv（改唱片必过 prep 重算 catalog）。
// 浏览器侧对应物：probe 页 decodeAudioData（解码器不同→PCM 不逐位一致，如实入档；
// 定标锚一份（catalog.lufs），两端同锚归一——响度一致到解码器差异（mp3 解码一致性 ≪0.1dB 量级）。
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fnvBytes } from '../sound/assets.js';
import type { RecordClip } from '../sound/graph.js';

export interface RecordCatalog {
  records: {
    name: string; file: string; title: string; category: string; bpmMeasured: number;
    seconds: number; bytes: number; fnv: string; lufs: number; source: string; author: string; license: string;
  }[];
}

const EAR_SR = 48000;

/** mp3/ogg/wav → 48k mono Float32Array（afconvert 解码；临时 wav 用后即删）。 */
export function decodePcm48k(path: string): Float32Array {
  const tmp = join(tmpdir(), `foley-rec-${process.pid}-${Math.random().toString(36).slice(2)}.wav`);
  try {
    execFileSync('afconvert', ['-f', 'WAVE', '-d', `LEI16@${EAR_SR}`, '-c', '1', path, tmp]);
    const buf = readFileSync(tmp);
    let off = 12;
    while (off + 8 <= buf.length) {
      const id = buf.toString('ascii', off, off + 4);
      const size = buf.readUInt32LE(off + 4);
      if (id === 'data') {
        const n = Math.floor(size / 2);
        const x = new Float32Array(n);
        for (let i = 0; i < n; i++) x[i] = buf.readInt16LE(off + 8 + i * 2) / 32768;
        return x;
      }
      off += 8 + size + (size % 2);
    }
    throw new Error(`WAV 无 data 块：${path}`);
  } finally {
    if (existsSync(tmp)) rmSync(tmp);
  }
}

let CACHE: { records: RecordClip[]; catalog: RecordCatalog } | null = null;

/** 出厂唱片全装载（fnv 校验+解码+缓存）。无 records 目录 → 空列表（房间层模式照跑）。 */
export function loadRecordsNode(): { records: RecordClip[]; catalog: RecordCatalog } {
  if (CACHE) return CACHE;
  const catUrl = new URL('../sound/records/catalog.json', import.meta.url);
  if (!existsSync(catUrl)) { CACHE = { records: [], catalog: { records: [] } }; return CACHE; }
  const catalog = JSON.parse(readFileSync(catUrl, 'utf8')) as RecordCatalog;
  const records: RecordClip[] = catalog.records.map((r) => {
    const p = new URL(`../sound/records/${r.file}`, import.meta.url);
    const bytes = readFileSync(p);
    const h = fnvBytes(bytes);
    if (h !== r.fnv) throw new Error(`唱片内容哈希不符：${r.file}（catalog ${r.fnv} ≠ 实际 ${h}）——改唱片必须走 prep-records`);
    const x = decodePcm48k(p.pathname);
    return { name: r.name, title: r.title, x, sr: EAR_SR, lufs: r.lufs, seconds: x.length / EAR_SR, bpmMeasured: r.bpmMeasured };
  });
  CACHE = { records, catalog };
  return CACHE;
}

/** 唱片清单哈希（ear 报告第三哈希：records）——与 assetsHash 同法（名字:fnv:lufs 串 FNV）。 */
export function recordsHash(catalog: RecordCatalog): string {
  const s = catalog.records.map((r) => `${r.name}:${r.fnv}:${r.lufs}`).join('|');
  const b = new TextEncoder().encode(s);
  return fnvBytes(b);
}
