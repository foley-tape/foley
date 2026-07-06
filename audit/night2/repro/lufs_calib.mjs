// 红队B' — LUFS 量具自查（影子的影子）：喂已知校准信号，看读数是否物理正确。
// ITU-R BS.1770：1 kHz 正弦 @ −23 dBFS RMS ≈ −23 LUFS（K 加权在 1kHz 近单位增益）。
import { measureLufs, rmsDb } from '../../../sound/offline.ts';

const SR = 48000, DUR = 10;
function sine(freqHz, dbfsRms) {
  const amp = Math.pow(10, dbfsRms / 20) * Math.SQRT2; // 峰值 = RMS×√2
  const x = new Float32Array(SR * DUR);
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * freqHz * i / SR);
  return x;
}
function noise(dbfsRms, seed = 1) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1; };
  const x = new Float32Array(SR * DUR);
  let acc = 0; for (let i = 0; i < x.length; i++) { x[i] = rnd(); acc += x[i] * x[i]; }
  const curRms = Math.sqrt(acc / x.length);
  const g = Math.pow(10, dbfsRms / 20) / curRms;
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

console.log('# LUFS 量具自查\n');
console.log('| 信号 | 期望 LUFS | 实测 LUFS | 偏差 | 判语 |');
console.log('|---|---|---|---|---|');
const rows = [
  ['1kHz 正弦 −23dBFS', sine(1000, -23), -23, 1.5],
  ['1kHz 正弦 −33dBFS', sine(1000, -33), -33, 1.5],
  ['1kHz 正弦 −43dBFS', sine(1000, -43), -43, 1.5],
  ['997Hz 正弦 −23dBFS', sine(997, -23), -23, 1.5],
  ['100Hz 正弦 −23dBFS(RLB高通应压)', sine(100, -23), -23, 6], // 高通在低频衰减，读数应低于 −23
  ['白噪 −23dBFS(宽带K加权抬高)', noise(-23), -23, 6],
];
let fails = 0;
for (const [label, sig, exp, tol] of rows) {
  const lufs = measureLufs(sig, SR, 1, DUR);
  const dev = lufs - exp;
  const ok = Math.abs(dev) <= tol;
  if (!ok) fails++;
  console.log(`| ${label} | ${exp} | ${lufs.toFixed(2)} | ${dev >= 0 ? '+' : ''}${dev.toFixed(2)} | ${ok ? 'ok' : '**偏**'} |`);
}
// 线性度：级间应严格 10dB 台阶
const l23 = measureLufs(sine(1000, -23), SR, 1, DUR);
const l33 = measureLufs(sine(1000, -33), SR, 1, DUR);
console.log(`\n线性度 −23→−33 台阶：${(l23 - l33).toFixed(2)} dB（应≈10.0）`);
console.log(`G7 门设计目标 sp.loudness.bedLufs（见 sound-params）；量具在 1kHz 基准的绝对偏移 = ${(l23 - (-23)).toFixed(2)} dB`);
process.exit(fails > 2 ? 1 : 0);
