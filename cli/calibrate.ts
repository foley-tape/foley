// cli calibrate —— 定标轮（SOUND-R3 §4.4 立法：定标脚本自 scratchpad 收编）。
// 铁律 7：定标常数不手拍——本命令离线渲染实测常数，与 CALIB 冻结值对照。
// 只测不改：常数写回 graph.js CALIB 是有意识行为（金测试 stem 定标锁盯防漂移）。
// v3（床改判·声资产批）：旧 l2/s3/S2 定标随织体床退役令出殡——现测 humNorm（马达低哼
// 三关成品 Sat 出口单位 RMS 归一）＋hissNorm（带限白噪出口·R2 口径原样）。
import { readFileSync } from 'node:fs';
import { resolveSoundParams, type TrackRow } from '../sound/index.ts';
import { buildEngine, CALIB } from '../sound/graph.js';
import { OfflineCtx, OfflineNode, rmsDb } from '../sound/offline.ts';
import { earAssets, EAR_SR } from './ear.ts';

export function runCalibrate(argv: string[]): void {
  void argv;
  const soundRaw = JSON.parse(readFileSync(new URL('../sound-params.json', import.meta.url), 'utf8'));
  const sp = resolveSoundParams(soundRaw);
  const lin = (db: number): number => Math.pow(10, db / 20);

  // —— humNorm / hissNorm：正身出口 20s RMS → 归一系数 = 1/RMS
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: 'calibrate', assets: earAssets() });
  const node = (n: string): OfflineNode => {
    const x = eng.registry.nodes.get(n); // registry 全表（E.nodes 只是常用抽屉）
    if (!x) throw new Error(`定标：注册表无节点 ${n}`);
    return x as unknown as OfflineNode;
  };
  const taps = {
    hum: ctx.tap(node('humSat')),
    hiss: ctx.tap(node('hissLP')),
  };
  const track: TrackRow[] = [[0, 0.5, 0.5, 0.5, 0, 1, 0.2, 0], [30000, 0.5, 0.5, 0.5, 0, 1, 0.2, 0]];
  eng.startTransport(0, 1, track, 30000);
  eng.scheduleGridUntil(20);
  ctx.render(20);
  const meas = {
    humNorm: 1 / lin(rmsDb(taps.hum(), EAR_SR, 2, 20)),
    hissNorm: 1 / lin(rmsDb(taps.hiss(), EAR_SR, 2, 20)),
  };

  const rows: [string, number, number][] = [
    ['humNorm', CALIB.humNorm, meas.humNorm],
    ['hissNorm', CALIB.hissNorm, meas.hissNorm],
  ];
  process.stdout.write('# 定标轮（cli calibrate·床改判 v3）——实测 vs 冻结（@48k）\n');
  process.stdout.write('| 常数 | 冻结值 | 实测 | 漂移 |\n|---|---|---|---|\n');
  let drifted = false;
  for (const [name, frozen, m] of rows) {
    const dev = Math.abs(20 * Math.log10(m / frozen));
    if (dev > 0.5) drifted = true;
    process.stdout.write(`| ${name} | ${frozen} | ${m.toFixed(4)} | ${dev.toFixed(2)}dB${dev > 0.5 ? ' ⚠' : ''} |\n`);
  }
  process.stdout.write(drifted
    ? '\n⚠ 有常数漂移 >0.5dB——若为有意改图，走定标轮更新 CALIB＋金测试同步；否则查图。\n'
    : '\n全部常数贴合冻结值（<0.5dB）。\n');
}
