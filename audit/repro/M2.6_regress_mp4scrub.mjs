#!/usr/bin/env node
// M2.6 回归（乙独立复射）· F2：导出 mp4 的墙钟 creation_time 是否强制钉 0。
// 复用乙 F2 原探针驱 vendored muxer 产真 mp4（内嵌 Date.now() 墙钟），再过发行轨的修复函数
// scrubMp4Dates（film.js:509 finalize 后即调此件），核验 mvhd/tkhd/mdhd 时间全归 0。
import { Muxer, ArrayBufferTarget } from '../../stage/vendor/mp4-muxer.mjs';
import { scrubMp4Dates } from '../../stage/js/mp4scrub.js';

const MP4_EPOCH = 2082844800;
const FIXED = Date.parse('2026-07-07T13:45:07.000Z');

const realNow = Date.now; Date.now = () => FIXED;
const target = new ArrayBufferTarget();
const muxer = new Muxer({ target, video: { codec: 'avc', width: 16, height: 16 }, fastStart: 'in-memory' });
Date.now = realNow;
const desc = new Uint8Array([1, 0x42, 0x00, 0x0a, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x42, 0x00, 0x0a, 0x01, 0x00, 0x00]);
muxer.addVideoChunkRaw(new Uint8Array([0, 0, 0, 1, 9, 16]), 'key', 0, Math.round(1e6 / 30), { decoderConfig: { codec: 'avc1.42000a', description: desc } });
muxer.finalize();

const u8 = new Uint8Array(target.buffer);
const buf = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);

// 扫所有 DATED 盒（mvhd/tkhd/mdhd）的 creation_time，返回最大值（>0 = 有墙钟残留）
function maxDatedCreation(b) {
  let max = 0;
  for (const tag of ['mvhd', 'tkhd', 'mdhd']) {
    let from = 0, i;
    while ((i = b.indexOf(Buffer.from(tag), from)) >= 0) {
      const v = b[i + 4];
      const raw1904 = v === 1 ? Number(b.readBigUInt64BE(i + 8)) : b.readUInt32BE(i + 8);
      if (raw1904 > max) max = raw1904;
      from = i + 4;
    }
  }
  return max;
}

const before = maxDatedCreation(buf);
const beforeIso = before ? new Date((before - MP4_EPOCH) * 1000).toISOString() : '(0)';
console.log(`── F2 · 修复前（裸 muxer 输出）──`);
console.log(`  DATED 盒最大 creation_time = ${before}  → ${beforeIso}  ${before ? '（墙钟泄漏，符合原 F2）' : ''}`);

const n = scrubMp4Dates(u8);                       // ← 发行轨修复函数，原位钉 0
const after = maxDatedCreation(buf);
console.log(`── F2 · 过 scrubMp4Dates 后 ──`);
console.log(`  抹掉盒数 = ${n}（单视频轨期望 ≥3：mvhd+tkhd+mdhd）`);
console.log(`  DATED 盒最大 creation_time = ${after}  ${after === 0 ? '→ 全 0（已钉）' : '→ 仍有残留！'}`);

let fail = 0;
if (!(before > 0)) { console.log('  ✗ 前提不成立：裸 muxer 未写墙钟（探针失效）'); fail = 1; }
if (after !== 0) { console.log('  ✗ F2 未修：抹后仍有非 0 墙钟'); fail = 1; }
if (n < 3) { console.log('  ✗ 抹盒数不足'); fail = 1; }
console.log(fail ? '\n❌ F2 有未修项' : '\n✅ F2 回归过：导出 mp4 墙钟 creation/modification 强制钉 0');
process.exit(fail ? 1 : 0);
