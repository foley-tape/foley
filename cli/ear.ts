// cli ear —— 机器耳朵 v2（SOUND-R2 §3）。离线渲染（sound/offline.ts），在渲染波形上判定，确定性。
// 任何"修好了"的宣称必须先过此处（听感协议 §4）。
//
// | 门 | 判据 | 状态 |
// | G1 停止即静默 | 播放→停止，硬闸(+0.3s)后 1s 窗 RMS < −60 dBFS               | active |
// | G2 总闸有效   | trimDb ±12dB 两次渲染，床段 RMS 差 ≥ 10dB                     | active |
// | G3 床响度守设计 | 五带各 30s，master(床单渲) RMS 落 core.bedRmsDb 设计值 ±3dB   | active |
// | G6 体验门     | 活跃床段(中张力 1×) 200Hz–8kHz 八分带 ≥5 带 > −55dBFS         | informational 首轮 |
// | G7 响度门     | 床积分响度（BS.1770 K加权门控）中张力 1× 段 = −26±2 LUFS       | **active** |
// | G4 床-张力相关 | storm 60s 渲染包络(1s RMS) × T 曲线 Pearson r ≥ 0.6           | informational（修订：4s 平滑窗） |
// | G5 呼唤穿透   | 跳针触发时，其频谱专区(1.2–2.2k)能量高于床同区 ≥ 6dB           | informational |
//
// 原速法（SOUND-R2 §1）：G6/G7 的测量段即 1× 原速段。双哈希：sound-params + 资产清单。
// 门规（检讨三.7 立法）：**账本（AudioParam.value）可用于接线自检，永不可用于发声证明**——
// 本文件一切判定均出自渲染波形；前身"账本式验收"（EAR-4 失明）永久废止。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { resolveParams, hashParams, hashJson } from '../engine/params.ts';
import { replayCore, loadVerdict } from './replay.ts';
import {
  resolveSoundParams, bedTargets, bedRmsDb, buildTrack, sampleAt, pearson, PHASE_IDX,
  type SoundParams, type TrackRow, type BedState,
} from '../sound/index.ts';
import { buildEngine, type SoundEngine } from '../sound/graph.js';
import { assetsHash, type AssetMap } from '../sound/assets.js';
import { loadAssetsNode } from './assets-node.ts';
import { OfflineCtx, OfflineNode, rmsDb, envelope1sDb, bandRmsDb, measureLufs, octaveBandsDb } from '../sound/offline.ts';

export const EAR_SR = 48000;        // 定标与 K 加权系数皆 @48k 冻结
export const BAND_RENDER_SEC = 30;  // G3 每带渲染时长
export const G4_RENDER_SEC = 60;
export const REALTIME_SEC = 60;     // G6/G7 的 1× 原速段时长
const TAPES = ['silence', 'smooth', 'busy', 'jam', 'storm'] as const;
export type TapeName = (typeof TAPES)[number];

export interface BandPrep { name: TapeName; track: TrackRow[]; durMs: number; speed: number }
export interface GateResult {
  id: string; name: string; crit: string; measured: string;
  pass: boolean; active: boolean;
}

const stateOf = (s: TrackRow): BedState => ({
  T: s[2], A: s[3], wow: s[6],
  phase: (PHASE_IDX[s[5]] ?? 'WORKING') as BedState['phase'],
  weather: 'CLEAR', pendingAsk: s[7] === 1,
});

let ASSETS: AssetMap | null = null;
export function earAssets(): AssetMap {
  if (!ASSETS) ASSETS = loadAssetsNode().assets;
  return ASSETS;
}

export function prepBand(name: TapeName): BandPrep {
  const core = replayCoreOf(name);
  const { track } = buildTrack(core.snaps);
  const durMs = track.length ? track[track.length - 1]![0]! : 0;
  const speed = Math.max(durMs / (BAND_RENDER_SEC * 1000), 1e-6);
  return { name, track, durMs, speed };
}

function replayCoreOf(name: TapeName): ReturnType<typeof replayCore> {
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const { verdict } = loadVerdict();
  return replayCore(readFileSync(new URL(`../tapes/${name}.tape.jsonl`, import.meta.url), 'utf8'), params, verdict.rain.floor);
}

function freshEngine(sp: SoundParams, prep: BandPrep, speedOverride?: number): { ctx: OfflineCtx; eng: SoundEngine } {
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: `ear:${prep.name}`, assets: earAssets() });
  eng.startTransport(0, speedOverride ?? prep.speed, prep.track, prep.durMs);
  return { ctx, eng };
}

/** 中张力恒态 1× 段（G6/G7 口径；与定标轮同一世界）。 */
function midTensionPrep(): BandPrep {
  const row = (ms: number): TrackRow => [ms, 0.5, 0.5, 0.5, 0, 1, 0.3, 0];
  return { name: 'storm', track: [row(0), row(REALTIME_SEC * 2000)], durMs: REALTIME_SEC * 2000, speed: 1 };
}

// ---------- G1 停止即静默 ----------
export function g1StopSilence(sp: SoundParams, prep: BandPrep): GateResult {
  const { ctx, eng } = freshEngine(sp, prep);
  eng.scheduleGridUntil(10);
  eng.trigger(0, 6.0, 2, 0.8);
  eng.trigger(8, 6.5, 0, 0.8);
  eng.stop(5);
  const wav = ctx.render(7.5);
  const db = rmsDb(wav, EAR_SR, 5.35, 6.35);
  return {
    id: 'G1', name: '停止即静默', crit: '停止硬闸后 1s 窗 RMS < −60 dBFS',
    measured: `${db.toFixed(1)} dBFS（storm 带，停于 5s，预排前景×2 同殁）`,
    pass: db < -60, active: true,
  };
}

// ---------- G2 总闸有效 ----------
export function g2Trim(soundRaw: unknown, prep: BandPrep): GateResult {
  const render = (delta: number): number => {
    const raw = JSON.parse(JSON.stringify(soundRaw)) as { bed: { trimDb: number } };
    raw.bed.trimDb += delta;
    const sp2 = resolveSoundParams(raw);
    const { ctx, eng } = freshEngine(sp2, prep);
    eng.scheduleGridUntil(10);
    return rmsDb(ctx.render(10), EAR_SR, 3, 10);
  };
  const hi = render(+12), lo = render(-12);
  return {
    id: 'G2', name: '总闸有效', crit: 'trimDb ±12dB 两次渲染，床段 RMS 差 ≥ 10dB',
    measured: `Δ=${(hi - lo).toFixed(1)} dB（+12: ${hi.toFixed(1)} / −12: ${lo.toFixed(1)} dBFS）`,
    pass: hi - lo >= 10, active: true,
  };
}

// ---------- G3 床响度守设计 ----------
export interface G3Band { name: TapeName; renderedDb: number; designDb: number; tap: Float32Array; prep: BandPrep }
export function g3Band(sp: SoundParams, prep: BandPrep): G3Band {
  const { ctx, eng } = freshEngine(sp, prep);
  const getTap = ctx.tap(eng.nodes['master'] as unknown as OfflineNode); // v2 口径：床=音乐路(过S4)+磨损路 之和（床单渲，无前景）
  eng.scheduleGridUntil(BAND_RENDER_SEC);
  ctx.render(BAND_RENDER_SEC);
  const tap = getTap();
  const renderedDb = rmsDb(tap, EAR_SR, 1, BAND_RENDER_SEC);
  const grid = 60 / sp.bpm / 2;
  let acc = 0, n = 0;
  for (let at = 1; at < BAND_RENDER_SEC; at += grid) {
    const s = sampleAt(prep.track, Math.min(at * 1000 * prep.speed, prep.durMs));
    const lin = Math.pow(10, bedRmsDb(bedTargets(stateOf(s), sp)) / 20) * 0.9; // master 0.9 入模型
    acc += lin * lin; n++;
  }
  const designDb = n ? 10 * Math.log10(Math.max(acc / n, 1e-24)) : -120;
  return { name: prep.name, renderedDb, designDb, tap, prep };
}
export function g3Gate(bands: G3Band[]): GateResult {
  const rows = bands.map((b) => `${b.name} ${b.renderedDb.toFixed(1)}/${b.designDb.toFixed(1)}(Δ${(b.renderedDb - b.designDb).toFixed(1)})`);
  const pass = bands.every((b) => Math.abs(b.renderedDb - b.designDb) <= 3);
  return {
    id: 'G3', name: '床响度守设计', crit: '五带各 30s，master RMS 落设计值 ±3dB',
    measured: rows.join('｜'), pass, active: true,
  };
}

// ---------- G6 体验门（SOUND-R2 新生；informational 首轮） ----------
export function g6Texture(sp: SoundParams): { gate: GateResult; wav: Float32Array } {
  const prep = midTensionPrep();
  const { ctx, eng } = freshEngine(sp, prep, 1);
  eng.scheduleGridUntil(REALTIME_SEC);
  const wav = ctx.render(REALTIME_SEC);
  const bands = octaveBandsDb(wav, EAR_SR, 5, REALTIME_SEC);
  const over = bands.filter((b) => b.db > -55);
  return {
    gate: {
      id: 'G6', name: '体验门·织体占用度', crit: '中张力 1× 段 200Hz–8kHz 八分带 ≥5 带 > −55dBFS',
      measured: `${over.length}/8 带过线（${bands.map((b) => `${b.lo}-${b.hi}:${b.db.toFixed(0)}`).join(' ')}）`,
      pass: over.length >= 5, active: false,
    },
    wav,
  };
}

// ---------- G7 响度门（SOUND-R2 新生；active） ----------
export function g7Loudness(wav1x: Float32Array, sp: SoundParams): GateResult {
  const lufs = measureLufs(wav1x, EAR_SR, 5, REALTIME_SEC);
  const target = sp.loudness.bedLufs, tol = 2;
  return {
    id: 'G7', name: '响度门', crit: `床积分响度（K加权门控，中张力 1× 段）= ${target}±${tol} LUFS`,
    measured: `${lufs.toFixed(2)} LUFS`,
    pass: Math.abs(lufs - target) <= tol, active: true,
  };
}

// ---------- G4 床-张力相关（修订：4s 平滑窗压织体/呼吸统计噪声；informational） ----------
export function g4Pearson(sp: SoundParams, prep: BandPrep): GateResult {
  const speed = prep.durMs / (G4_RENDER_SEC * 1000);
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: `ear:${prep.name}`, assets: earAssets() });
  const getTap = ctx.tap(eng.nodes['master'] as unknown as OfflineNode);
  eng.startTransport(0, speed, prep.track, prep.durMs);
  eng.scheduleGridUntil(G4_RENDER_SEC);
  ctx.render(G4_RENDER_SEC);
  const tap = getTap();
  const e1 = envelope1sDb(tap, EAR_SR);
  // 修订（EAR-5 待裁项落地）：1s 窗 → 4s 滑动平均（织体环/呼吸/打点的统计噪声压掉，问律不问噪）
  const edb: number[] = [], t: number[] = [];
  for (let s = 2; s + 4 <= e1.length; s++) {
    let acc = 0;
    for (let k = 0; k < 4; k++) acc += Math.pow(10, e1[s + k]! / 10);
    edb.push(10 * Math.log10(acc / 4));
    let ta = 0;
    for (let k = 0; k < 80; k++) ta += sampleAt(prep.track, Math.min((s + 2 + (k / 80) * 4 - 2) * 1000 * speed, prep.durMs))[2];
    t.push(ta / 80);
  }
  const r = pearson(edb, t);
  return {
    id: 'G4', name: '床-张力相关', crit: `storm ${G4_RENDER_SEC}s 渲染包络(4s 平滑窗) × T 曲线 Pearson r ≥ 0.6`,
    measured: r === null ? 'NA（方差趋零）' : `r=${r.toFixed(3)}`,
    pass: r !== null && r >= 0.6, active: false,
  };
}

// ---------- G5 呼唤穿透（informational） ----------
export function g5Penetration(sp: SoundParams, storm: G3Band): GateResult {
  const edb = envelope1sDb(storm.tap, EAR_SR);
  let atE = 2, best = -1e9;
  for (let s = 2; s < edb.length - 1; s++) if (edb[s]! > best) { best = edb[s]!; atE = s + 0.5; }
  const { ctx, eng } = freshEngine(sp, storm.prep);
  eng.scheduleGridUntil(atE + 1);
  eng.trigger(7, atE, 0, 1);
  const wav = ctx.render(atE + 0.6);
  const ev = bandRmsDb(wav, EAR_SR, 1200, 2200, atE, atE + 0.12);
  const bed = bandRmsDb(wav, EAR_SR, 1200, 2200, atE - 1.0, atE - 0.1);
  return {
    id: 'G5', name: '呼唤穿透', crit: '跳针触发时，其频谱专区能量高于床 ≥ 6dB',
    measured: `Δ=${(ev - bed).toFixed(1)} dB（事件 ${ev.toFixed(1)} / 床 ${bed.toFixed(1)} dBFS @${atE.toFixed(1)}s 床峰）`,
    pass: ev - bed >= 6, active: false,
  };
}

// ---------- 汇总 ----------
export function runAllGates(soundRaw: unknown): { gates: GateResult[]; bands: G3Band[]; allActiveGreen: boolean } {
  const sp = resolveSoundParams(soundRaw);
  const preps = TAPES.map((k) => prepBand(k));
  const storm = preps.find((p) => p.name === 'storm')!;
  const bands = preps.map((p) => g3Band(sp, p));
  const stormBand = bands.find((b) => b.name === 'storm')!;
  const g6 = g6Texture(sp);
  const gates = [
    g1StopSilence(sp, storm),
    g2Trim(soundRaw, storm),
    g3Gate(bands),
    g7Loudness(g6.wav, sp),
    g6.gate,
    g4Pearson(sp, storm),
    g5Penetration(sp, stormBand),
  ];
  const allActiveGreen = gates.filter((g) => g.active).every((g) => g.pass);
  return { gates, bands, allActiveGreen };
}

export function runEar(argv: string[]): void {
  void argv;
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const soundRaw = JSON.parse(readFileSync(new URL('../sound-params.json', import.meta.url), 'utf8'));
  const { hash: verdictHash } = loadVerdict();
  const { manifest } = loadAssetsNode();
  const t0 = Date.now();
  const { gates, bands, allActiveGreen } = runAllGates(soundRaw);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const aHash = assetsHash(earAssets());

  const mark = (g: GateResult): string => (g.pass ? '✅ PASS' : g.active ? '❌ FAIL' : 'ℹ️ 记分');
  const rows = gates.map((g) => `| ${g.id} ${g.name} | ${g.crit} | ${g.measured} | ${mark(g)}${g.active ? '' : '（informational）'} |`);
  const bandRows = bands.map((b) => `| ${b.name} | ${b.designDb.toFixed(1)} | ${b.renderedDb.toFixed(1)} | ${(b.renderedDb - b.designDb).toFixed(1)} |`);
  const assetRows = manifest.map((m) => `| ${m.file} | ${m.seconds}s | ${m.fnv} | ${m.license} | ${m.author} |`);

  const report = `# EAR_MACHINE v2 —— 机器耳朵（SOUND-R2 §3）
engine ${gitShaSafe()} / params ${hashParams(paramsRaw)} / verdict ${verdictHash} / **sound-params ${hashJson(soundRaw)}** / **assets ${aHash}**
离线渲染 ${EAR_SR}Hz · 确定性 · 判定对象=渲染波形（门规：账本只作接线自检，永不作发声证明）· 含 1× 原速段 ${REALTIME_SEC}s · 渲染 ${elapsed}s

| 门 | 判据 | 实测 | 判定 |
|---|---|---|---|
${rows.join('\n')}

**active 门（G1–G3+G7）：${allActiveGreen ? '✅ 全绿' : '❌ 未过——不得申请实听（§4）'}**

## G3 明细（master 床单渲口径，30s/带）
| 带 | 设计 dBFS | 渲染 dBFS | Δ |
|---|---|---|---|
${bandRows.join('\n')}

## 资产清单（L1 织体体；CC0 逐条溯源见 sound/assets/LICENSES.md）
| 文件 | 时长 | 内容哈希 | 授权 | 作者 |
|---|---|---|---|---|
${assetRows.join('\n')}
`;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(process.cwd(), 'runs', `ear-machine-${ts}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'EAR_MACHINE.md'), report, 'utf8');
  process.stdout.write(report);
  process.stdout.write(`\n产出：${relative(process.cwd(), join(outDir, 'EAR_MACHINE.md'))}\n`);
  if (!allActiveGreen) process.exit(1);
}

function gitShaSafe(): string {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); }
  catch { return 'nogit'; }
}
