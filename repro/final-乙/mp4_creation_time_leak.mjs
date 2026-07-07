#!/usr/bin/env node
// 复现（乙·导出物工作时段指纹）：vendored mp4-muxer 把 Math.floor(Date.now()/1e3)+2082844800
// 写进 mvhd/tkhd/mdhd 的 creation_time。任何拿到分享 mp4 的人可读出精确到秒的出片墙钟时间——
// 正是蒸馏管线时间相对化竭力抹掉的「工作时段指纹」。此脚本零依赖解析 mvhd，证在仓库自带的 demo mp4 上。
//
// 用法: node repro/final-乙/mp4_creation_time_leak.mjs [file.mp4 ...]
// 缺省扫 docs/records 下全部 mp4。退出码非0 = 至少一件泄漏绝对墙钟时间。
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const MP4_EPOCH_1904 = 2082844800; // 1904-01-01 → 1970-01-01 秒差（mp4 纪元）

/** 在 buffer 里找第一个 mvhd box，返回 { version, creationTime(unix秒), raw1904 }。 */
function readMvhd(buf) {
  const i = buf.indexOf(Buffer.from('mvhd'));
  if (i < 0) return null;
  // box: [size u32][type 'mvhd'][version u8][flags u24][creation ...]
  const version = buf[i + 4];
  let raw1904;
  if (version === 1) {
    // 64-bit creation_time
    raw1904 = Number(buf.readBigUInt64BE(i + 8));
  } else {
    // 32-bit creation_time
    raw1904 = buf.readUInt32BE(i + 8);
  }
  const unix = raw1904 - MP4_EPOCH_1904;
  return { version, raw1904, unix };
}

function targets(argv) {
  if (argv.length) return argv;
  // 缺省：仓库自带 demo mp4
  try {
    const out = execSync(`find docs/records -type f -name '*.mp4'`, { encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}

let leaked = 0, checked = 0;
for (const f of targets(process.argv.slice(2))) {
  if (!existsSync(f)) { console.log(`skip (缺): ${f}`); continue; }
  const buf = readFileSync(f);
  const m = readMvhd(buf);
  checked++;
  if (!m) { console.log(`无 mvhd: ${f}`); continue; }
  if (m.raw1904 === 0) { console.log(`✓ 零时间（已抹）: ${f}`); continue; }
  const iso = new Date(m.unix * 1000).toISOString();
  console.log(`✗ 泄漏 creation_time = ${iso}  (mvhd v${m.version}, raw1904=${m.raw1904})  ← ${f}`);
  leaked++;
}
console.log(`\n检查 ${checked} 件，泄漏绝对墙钟时间 ${leaked} 件。`);
process.exit(leaked > 0 ? 1 : 0);
