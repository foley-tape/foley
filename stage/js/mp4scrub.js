// mp4 墙钟抹除（M2.6 P1-①/乙-F2 · G7 脱敏闸）——纯函数，浏览器/Node 通用。
//
// vendored mp4-muxer 会把出片时刻写进 mvhd/tkhd/mdhd 的 creation_time/modification_time
// （秒级墙钟＝工时指纹）。仓库随发的 demo mp4 早已抹 0——「有人知道该抹，但抹不在工具里」。
// 此件把抹的动作放进工具：film.js finalize 后原位钉 0，对齐 demo 已抹口径。
// 金测试（golden/g7.redaction.test.ts）直接吃这个纯函数＋源码卫兵盯 film.js 挂钩不脱。

/** 需要抹时间的 full box（version+flags 后紧跟 creation/modification）。 */
const DATED = new Set(['mvhd', 'tkhd', 'mdhd']);
/** 抵达 DATED 所需的容器盒。 */
const CONTAINERS = new Set(['moov', 'trak', 'mdia']);

/**
 * 原位把 mp4 buffer 里 mvhd/tkhd/mdhd 的 creation_time 与 modification_time 全部钉 0。
 * @param {Uint8Array} u8 完整 mp4 字节
 * @returns {number} 抹掉时间的盒数（常规单轨有声片 = 5：mvhd + 2×(tkhd+mdhd)）
 */
export function scrubMp4Dates(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return walk(0, u8.byteLength);

  function walk(start, end) {
    let scrubbed = 0;
    let o = start;
    while (o + 8 <= end) {
      let size = dv.getUint32(o);
      const type = String.fromCharCode(u8[o + 4], u8[o + 5], u8[o + 6], u8[o + 7]);
      let hdr = 8;
      if (size === 1) { // 64-bit largesize
        if (o + 16 > end) break;
        const big = dv.getBigUint64(o + 8);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) break;
        size = Number(big);
        hdr = 16;
      } else if (size === 0) { // 到文件尾
        size = end - o;
      }
      if (size < hdr || o + size > end) break; // 坏盒：就地停走，不越界
      if (DATED.has(type) && o + hdr + 4 <= end) {
        const p = o + hdr;          // version(1)+flags(3)
        const n = u8[p] === 1 ? 8 : 4; // v1=u64、v0=u32
        if (p + 4 + 2 * n <= end) {
          u8.fill(0, p + 4, p + 4 + 2 * n); // creation_time + modification_time → 0
          scrubbed++;
        }
      } else if (CONTAINERS.has(type)) {
        scrubbed += walk(o + hdr, o + size);
      }
      o += size;
    }
    return scrubbed;
  }
}
