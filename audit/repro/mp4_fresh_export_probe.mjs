#!/usr/bin/env node
// 复现（乙）：驱动 vendored mp4-muxer 产一件"新鲜"mp4（绕 WebCodecs，直喂 raw chunk），
// 读回 mvhd.creation_time——证明活导出路径把墙钟时间写进容器。用固定 Date.now 使证据无歧义。
import { Muxer, ArrayBufferTarget } from '../../stage/vendor/mp4-muxer.mjs';

const MP4_EPOCH_1904 = 2082844800;
const FIXED_ISO = '2026-07-07T13:45:07.000Z';
const FIXED = Date.parse(FIXED_ISO);

// 构造器在 new 时捕获 Date.now()——故先钉住再造，之后还原
const realNow = Date.now;
Date.now = () => FIXED;
const target = new ArrayBufferTarget();
const muxer = new Muxer({ target, video: { codec: 'avc', width: 16, height: 16 }, fastStart: 'in-memory' });
Date.now = realNow;

// 最小 avcC 描述 + 一个关键帧（内容无所谓，只为让 finalize 写出 moov/mvhd）
const desc = new Uint8Array([1, 0x42, 0x00, 0x0a, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x42, 0x00, 0x0a, 0x01, 0x00, 0x00]);
muxer.addVideoChunkRaw(new Uint8Array([0, 0, 0, 1, 9, 16]), 'key', 0, Math.round(1e6 / 30),
  { decoderConfig: { codec: 'avc1.42000a', description: desc } });
muxer.finalize();

const buf = Buffer.from(target.buffer);
const i = buf.indexOf(Buffer.from('mvhd'));
if (i < 0) { console.error('无 mvhd——muxer 未写出'); process.exit(2); }
const version = buf[i + 4];
const raw1904 = version === 1 ? Number(buf.readBigUInt64BE(i + 8)) : buf.readUInt32BE(i + 8);
const unix = raw1904 - MP4_EPOCH_1904;
const iso = new Date(unix * 1000).toISOString();

console.log(`stub Date.now  = ${FIXED_ISO}`);
console.log(`mvhd creation  = ${iso}  (v${version}, raw1904=${raw1904})`);
const leaked = raw1904 !== 0 && Math.abs(unix * 1000 - FIXED) < 2000;
console.log(leaked
  ? `✗ 泄漏确认：新鲜 mp4 的 creation_time == 墙钟出片时间（精确到秒的工作时段指纹）`
  : `✓ 未泄漏（creation_time 已抹或不匹配）`);
process.exit(leaked ? 1 : 0);
