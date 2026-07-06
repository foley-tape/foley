#!/usr/bin/env node
// 出厂唱片 prep（SOUND-R3 §1）：实测 fnv/bytes/seconds/lufs → catalog.json。
// 资产纪律与 sound/assets 同律：改唱片必重跑本脚本；fnv 与 manifest.fnv 同法（assets.js fnvBytes）。
// lufs 为响度定标锚（graph 数据驱动归一到 record.targetLufs）——与 G3/G7 执法同一把尺
// （offline.ts measureLufs，BS.1770 K 加权门控积分），否则定标与执法自打架。
// 解码：afconvert 48k/mono/PCM16（macOS 平台绑定——ear 同样跑在船长 mac，如实注记）。
// 用法：node sound/records/prep-records.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fnvBytes } from '../assets.js';
import { measureLufs } from '../offline.ts';

const DIR = new URL('.', import.meta.url).pathname;

/** mp3 → 48k mono PCM（Float32Array）。afconvert 解码（与 ear 渲染同路），临时 wav 用后即删。 */
function decodePcm48k(path) {
  const tmp = join(tmpdir(), `foley-prep-${process.pid}.wav`);
  execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', '-c', '1', path, tmp]);
  const buf = readFileSync(tmp);
  execFileSync('rm', [tmp]);
  // WAV 解析：找 data 块（LEI16）
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
}

// 元数据表（vendor 时人工核定；bpmMeasured=谱通量自相关实测主峰，歧义者次峰括注——
// SOUND-R4 落仓起船长实听为选曲终裁，BPM 窗降为参考代理；来源逐曲直链，PROVENANCE.md 三件套对应）
const META = {
  'saturation.mp3': {
    title: 'Saturation', category: 'public-domain-lofi', bpmMeasured: 60,
    bpmNote: '主峰 59.6/次峰 88.6（3:2 交叉节奏，真值歧义如实记）',
    source: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/saturation-lofi-calm-relaxed/',
  },
  'still-life.mp3': {
    title: 'Still Life', category: 'public-domain-lofi', bpmMeasured: 77,
    bpmNote: '主峰 76.6/次峰 79.7 聚拢（窗内干净）',
    source: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/still-life-lofi-chill-nostalgic/',
  },
  'warm-fuzz.mp3': {
    title: 'Warm Fuzz', category: 'public-domain-lofi', bpmMeasured: 63,
    bpmNote: '主峰 62.9/次峰 83.4（4:3 歧义如实记）',
    source: 'https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/warm-fuzz-lofi-retro/',
  },
};
const AUTHOR = 'HoliznaCC0';
const PROVENANCE = '人类制造（血统条款 §0.1；FMA 平台字段 AI generated?=No 三曲快照在案）——PROVENANCE.md 三件套逐曲对应';

function durationSec(path) {
  const out = execFileSync('afinfo', [path], { encoding: 'utf8' });
  const m = out.match(/estimated duration:\s*([\d.]+)/);
  if (!m) throw new Error(`afinfo 无时长：${path}`);
  return Math.round(parseFloat(m[1]) * 10) / 10;
}

const records = [];
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.mp3')).sort()) {
  const meta = META[file];
  if (!meta) throw new Error(`唱片未登记元数据表：${file}（先补 META 再 prep）`);
  const bytes = readFileSync(DIR + file);
  const pcm = decodePcm48k(DIR + file);
  records.push({
    name: file.replace(/\.mp3$/, ''),
    file,
    title: meta.title,
    category: meta.category,
    bpmMeasured: meta.bpmMeasured,
    bpmNote: meta.bpmNote,
    seconds: durationSec(DIR + file),
    bytes: bytes.length,
    fnv: fnvBytes(bytes),
    lufs: Math.round(measureLufs(pcm, 48000) * 100) / 100, // 定标锚（K 加权门控积分，G3/G7 同尺）
    source: meta.source,
    author: AUTHOR,
    license: 'CC0-1.0',
  });
}

const catalog = {
  _source:
    'SOUND-R4 落仓出厂唱片清单（HoliznaCC0《Public Domain Lofi》FMA vendor，船长实听终裁名单 2026-07-06）。' +
    'fnv 内容哈希与 sound/assets manifest 同法（ear 三哈希原料）；' +
    'bpmMeasured 为谱通量自相关实测主峰（歧义者 bpmNote 记次峰，船长耳裁压过 BPM 窗代理）；' +
    'lufs 为响度定标锚（measureLufs 同尺，48k afconvert 解码）；播放语义 v1=顺播＋无缝循环。' +
    `来源属性：${PROVENANCE}。`,
  records,
};
writeFileSync(DIR + 'catalog.json', JSON.stringify(catalog, null, 2) + '\n');
console.log(`catalog.json：${records.length} 首，共 ${(records.reduce((s, r) => s + r.bytes, 0) / 1e6).toFixed(1)}MB`);
for (const r of records) console.log(`  ${r.fnv}  ${String(r.seconds).padStart(6)}s  ${r.bpmMeasured}bpm  ${r.file}`);
