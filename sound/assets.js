// L1 资产装载（SOUND-R2 §2）。纯 JS：Node（cli ear/golden 从 fs 读）与浏览器（probe 页内嵌 base64）
// 逐字同源——机器耳朵听的字节与船长页放的字节必须同一来源解出（同源纪律照旧）。
// 资产纪律：CC0-only，出处/授权/内容哈希见 sound/assets/LICENSES.md 与 manifest.json；运行时零网络不破。

/** PCM16 mono WAV → {x: Float32Array, sr}。只认本仓 prep 产物的最小子集（fmt PCM16 单声道 + data）。 */
export function parseWavPcm16(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const tag = (off) => String.fromCharCode(u8[off], u8[off + 1], u8[off + 2], u8[off + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('assets：非 WAV');
  let off = 12, sr = 0, bits = 0, ch = 0, data = null;
  while (off + 8 <= u8.length) {
    const id = tag(off), sz = dv.getUint32(off + 4, true);
    if (id === 'fmt ') { ch = dv.getUint16(off + 10, true); sr = dv.getUint32(off + 12, true); bits = dv.getUint16(off + 22, true); }
    else if (id === 'data') data = { start: off + 8, len: sz };
    off += 8 + sz + (sz & 1);
  }
  if (!data || bits !== 16 || ch !== 1) throw new Error(`assets：需 PCM16 mono（实际 ${bits}bit ${ch}ch）`);
  const n = data.len >> 1;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = dv.getInt16(data.start + i * 2, true) / 32768;
  return { x, sr };
}

/** 内容哈希（FNV-1a，与 manifest.fnv 同法）：ear 双哈希之资产哈希原料。 */
export function fnvBytes(u8) {
  let h = 0x811c9dc5;
  for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** 资产集哈希：清单条目（名/内容哈希/秒长/RMS）稳定串接再 FNV——改任何一件资产即改哈希。 */
export function assetsHash(assets) {
  const names = Object.keys(assets).sort();
  const s = names.map((n) => `${n}:${assets[n].fnv}:${assets[n].seconds}:${assets[n].rmsDb}`).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** 浏览器侧：页内嵌条目 [{name,rmsDb,seconds,fnv,b64}] → assets 映射（校验内容哈希，嵌入即防腐）。 */
export function assetsFromEmbedded(entries) {
  const out = {};
  for (const e of entries) {
    const bin = atob(e.b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (fnvBytes(u8) !== e.fnv) throw new Error(`assets：${e.name} 内容哈希不符（页内嵌损坏）`);
    const { x, sr } = parseWavPcm16(u8);
    out[e.name] = { x, sr, rmsDb: e.rmsDb, seconds: e.seconds, fnv: e.fnv };
  }
  return out;
}
