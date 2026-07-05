// cli calibrate —— 定标轮（SOUND-R3 §4.4 立法：定标脚本自 scratchpad 收编）。
// 铁律 7：定标常数不手拍——本命令离线渲染实测四常数，与 CALIB 冻结值对照。
// 只测不改：常数写回 graph.js CALIB 是有意识行为（金测试 ㊴ stem 定标锁盯防漂移）。
// 口径（R2 定标轮沿革）：@48k、l2/s3=正身（Sat 出口）单位 RMS 归一、hiss=带限白噪出口、
// S2_CREST=中张力（density=参考 0.55，即 A=0.5）长程 RMS/电平。
import { readFileSync } from 'node:fs';
import { resolveSoundParams, bedTargets, type TrackRow } from '../sound/index.ts';
import { buildEngine, CALIB } from '../sound/graph.js';
import { OfflineCtx, OfflineNode, rmsDb } from '../sound/offline.ts';
import { earAssets, EAR_SR } from './ear.ts';

export function runCalibrate(argv: string[]): void {
  void argv;
  const soundRaw = JSON.parse(readFileSync(new URL('../sound-params.json', import.meta.url), 'utf8'));
  const sp = resolveSoundParams(soundRaw);
  const lin = (db: number): number => Math.pow(10, db / 20);

  // —— l2Norm / s3Norm / hissNorm：正身出口 20s RMS → 归一系数 = 1/RMS
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: 'calibrate', assets: earAssets() });
  const node = (n: string): OfflineNode => {
    const x = eng.registry.nodes.get(n); // registry 全表（E.nodes 只是常用抽屉）
    if (!x) throw new Error(`定标：注册表无节点 ${n}`);
    return x as unknown as OfflineNode;
  };
  const taps = {
    l2: ctx.tap(node('l2Sat')),
    s3: ctx.tap(node('s3Sat')),
    hiss: ctx.tap(node('hissLP')),
  };
  const track: TrackRow[] = [[0, 0.5, 0.5, 0.5, 0, 1, 0.2, 0], [30000, 0.5, 0.5, 0.5, 0, 1, 0.2, 0]];
  eng.startTransport(0, 1, track, 30000);
  eng.scheduleGridUntil(20);
  ctx.render(20);
  const meas = {
    l2Norm: 1 / lin(rmsDb(taps.l2(), EAR_SR, 2, 20)),
    s3Norm: 1 / lin(rmsDb(taps.s3(), EAR_SR, 2, 20)),
    hissNorm: 1 / lin(rmsDb(taps.hiss(), EAR_SR, 2, 20)),
  };

  // —— S2_CREST：A=0.5（density=0.55=参考密度）60s，tap s2Level 出口，CREST=RMS/电平
  const ctx2 = new OfflineCtx(EAR_SR);
  const eng2 = buildEngine(ctx2, sp, { repoKey: 'calibrate', assets: earAssets() });
  const s2Tap = ctx2.tap(eng2.registry.nodes.get('s2') as unknown as OfflineNode); // level('s2') 的注册名
  const track2: TrackRow[] = [[0, 0.5, 0.5, 0.5, 0, 1, 0.2, 0], [70000, 0.5, 0.5, 0.5, 0, 1, 0.2, 0]];
  eng2.startTransport(0, 1, track2, 70000);
  eng2.scheduleGridUntil(62);
  ctx2.render(62);
  // 电平以 core 真值为准（不手抄公式）
  const bt = bedTargets({ T: 0.5, A: 0.5, wow: 0.2, phase: 'WORKING', weather: 'CLEAR', pendingAsk: false }, sp);
  const crest = lin(rmsDb(s2Tap(), EAR_SR, 2, 62)) / bt.s2;

  const rows: [string, number, number][] = [
    ['l2Norm', CALIB.l2Norm, meas.l2Norm],
    ['s3Norm', CALIB.s3Norm, meas.s3Norm],
    ['hissNorm', CALIB.hissNorm, meas.hissNorm],
    ['S2_CREST', 0.02615, crest],
  ];
  process.stdout.write('# 定标轮（cli calibrate）——实测 vs 冻结（@48k，R2 口径）\n');
  process.stdout.write('| 常数 | 冻结值 | 实测 | 漂移 |\n|---|---|---|---|\n');
  let drifted = false;
  for (const [name, frozen, m] of rows) {
    const dev = Math.abs(20 * Math.log10(m / frozen));
    if (dev > 0.5) drifted = true;
    process.stdout.write(`| ${name} | ${frozen} | ${m.toFixed(name === 'S2_CREST' ? 5 : 4)} | ${dev.toFixed(2)}dB${dev > 0.5 ? ' ⚠' : ''} |\n`);
  }
  process.stdout.write(drifted
    ? '\n⚠ 有常数漂移 >0.5dB——若为有意改图，走定标轮更新 CALIB＋金测试 ㊴ 同步；否则查图。\n'
    : '\n全部常数贴合冻结值（<0.5dB）。\n');
}
