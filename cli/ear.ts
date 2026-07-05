// cli ear —— 机器耳朵 v3（SOUND-R3 §3：改口径，不换庙）。离线渲染（sound/offline.ts），渲染波形上判定，确定性。
// 任何"修好了"的宣称必须先过此处（听感协议 §4）。
//
// | 门 | 判据 | 状态 |
// | G1 停止即静默 | 播放→停止，硬闸(+0.3s)后 1s 窗 RMS < −60 dBFS——**含唱片路径**   | active |
// | G2 总闸有效   | trimDb ±12dB 两次渲染（唱片在位），总线 RMS 差 ≥ 10dB            | active |
// | G3 房间层守设计 | 五带各 30s（无唱片态），master RMS 落 core.bedRmsDb 设计值 ±3dB | active |
// | G7 响度门 v3  | **唱片在位**总线积分响度（K加权门控）中张力 1× 段 = record.targetLufs(−20)±2 LUFS | **active** |
// | G6 体验门     | 房间层（无唱片态）中张力 1× 段 200Hz–8kHz 八分带 ≥5 带 > −55dBFS | informational |
// | G4 v2 处置-张力 | storm 60s 唱片在位：HF 占比(2–8k/50–8k) × T 负相关 r ≤ −0.5    | informational 首轮 |
// | G5 呼唤穿透   | 跳针触发时，其频谱专区(1.2–2.2k)能量高于床同区 ≥ 6dB             | informational（旧开放项照跑） |
// | G8 跳针可辨   | STUCK 段短循环自相关峰(0.3–0.8s lag) 较正常段显著（Δ≥0.2 且 ≥0.5）| informational 首轮 |
//
// 三哈希：sound-params + assets + records（唱片清单）。F5 v2 语义：唱片恒电平，机器不泵音量——
// T 的表达=处置（低通/wow/磨损），故 G4 v2 测谱不测响度。
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
import { buildEngine, type SoundEngine, type RecordClip } from '../sound/graph.js';
import { assetsHash, type AssetMap } from '../sound/assets.js';
import { loadAssetsNode } from './assets-node.ts';
import { loadRecordsNode, recordsHash } from './records-node.ts';
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

let RECORDS: RecordClip[] | null = null;
export function earRecords(): RecordClip[] {
  if (!RECORDS) RECORDS = loadRecordsNode().records;
  return RECORDS;
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

function freshEngine(sp: SoundParams, prep: BandPrep, speedOverride?: number, withRecord = false): { ctx: OfflineCtx; eng: SoundEngine } {
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, {
    repoKey: `ear:${prep.name}`, assets: earAssets(),
    records: withRecord ? earRecords() : null, // v3：唱片在位口径（G1/G2/G7/G4/G8）；房间层口径（G3/G6）不装盘
  });
  eng.startTransport(0, speedOverride ?? prep.speed, prep.track, prep.durMs);
  return { ctx, eng };
}

/** 中张力恒态 1× 段（G6/G7 口径；与定标轮同一世界）。 */
function midTensionPrep(): BandPrep {
  const row = (ms: number): TrackRow => [ms, 0.5, 0.5, 0.5, 0, 1, 0.3, 0];
  return { name: 'storm', track: [row(0), row(REALTIME_SEC * 2000)], durMs: REALTIME_SEC * 2000, speed: 1 };
}

// ---------- G1 停止即静默（v3：含唱片路径——唱片支路与预排前景同殁） ----------
export function g1StopSilence(sp: SoundParams, prep: BandPrep): GateResult {
  const { ctx, eng } = freshEngine(sp, prep, undefined, true);
  eng.scheduleGridUntil(10);
  eng.trigger(0, 6.0, 2, 0.8);
  eng.trigger(8, 6.5, 0, 0.8);
  eng.stop(5);
  const wav = ctx.render(7.5);
  const db = rmsDb(wav, EAR_SR, 5.35, 6.35);
  return {
    id: 'G1', name: '停止即静默', crit: '停止硬闸后 1s 窗 RMS < −60 dBFS——含唱片路径',
    measured: `${db.toFixed(1)} dBFS（storm 带+唱片在位，停于 5s，预排前景×2 同殁）`,
    pass: db < -60, active: true,
  };
}

// ---------- G2 总闸有效（v3：唱片在位——trim 经 recordTargets 同乘唱片电平） ----------
export function g2Trim(soundRaw: unknown, prep: BandPrep): GateResult {
  const render = (delta: number): number => {
    const raw = JSON.parse(JSON.stringify(soundRaw)) as { bed: { trimDb: number } };
    raw.bed.trimDb += delta;
    const sp2 = resolveSoundParams(raw);
    const { ctx, eng } = freshEngine(sp2, prep, undefined, true);
    eng.scheduleGridUntil(10);
    return rmsDb(ctx.render(10), EAR_SR, 3, 10);
  };
  const hi = render(+12), lo = render(-12);
  return {
    id: 'G2', name: '总闸有效', crit: 'trimDb ±12dB 两次渲染（唱片在位），总线 RMS 差 ≥ 10dB',
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

// ---------- G6 体验门（v3 改口径：房间层=无唱片态；informational） ----------
export function g6Texture(sp: SoundParams): { gate: GateResult; wav: Float32Array } {
  const prep = midTensionPrep();
  const { ctx, eng } = freshEngine(sp, prep, 1); // 不装盘：房间层口径
  eng.scheduleGridUntil(REALTIME_SEC);
  const wav = ctx.render(REALTIME_SEC);
  const bands = octaveBandsDb(wav, EAR_SR, 5, REALTIME_SEC);
  const over = bands.filter((b) => b.db > -55);
  return {
    gate: {
      id: 'G6', name: '体验门·织体占用度', crit: '房间层（无唱片态）中张力 1× 段 200Hz–8kHz 八分带 ≥5 带 > −55dBFS',
      measured: `${over.length}/8 带过线（${bands.map((b) => `${b.lo}-${b.hi}:${b.db.toFixed(0)}`).join(' ')}）`,
      pass: over.length >= 5, active: false,
    },
    wav,
  };
}

// ---------- G7 旧口径（SOUND-R2 沿革保留：房间层积分响度 −26——金测试 ㊼ 的判据锚，判据冻结不换尺） ----------
export function g7Loudness(wav1x: Float32Array, sp: SoundParams): GateResult {
  const lufs = measureLufs(wav1x, EAR_SR, 5, REALTIME_SEC);
  const target = sp.loudness.bedLufs, tol = 2;
  return {
    id: 'G7', name: '响度门（房间层）', crit: `床积分响度（K加权门控，中张力 1× 段）= ${target}±${tol} LUFS`,
    measured: `${lufs.toFixed(2)} LUFS`,
    pass: Math.abs(lufs - target) <= tol, active: true,
  };
}

// ---------- G7 响度门 v3（SOUND-R3 改口径：唱片在位总线；active） ----------
export function g7LoudnessV3(sp: SoundParams): { gate: GateResult; wav: Float32Array } {
  const prep = midTensionPrep();
  const { ctx, eng } = freshEngine(sp, prep, 1, true); // 唱片在位（默认盘 catalog[0]）
  eng.scheduleGridUntil(REALTIME_SEC);
  const wav = ctx.render(REALTIME_SEC);
  const lufs = measureLufs(wav, EAR_SR, 5, REALTIME_SEC);
  const target = sp.record.targetLufs, tol = 2;
  return {
    gate: {
      id: 'G7', name: '响度门 v3', crit: `唱片在位总线积分响度（K加权门控，中张力 1× 段）= ${target}±${tol} LUFS`,
      measured: `${lufs.toFixed(2)} LUFS（盘：${earRecords()[0]?.name ?? '（无盘——退室内层口径）'}）`,
      pass: Math.abs(lufs - target) <= tol, active: true,
    },
    wav,
  };
}

// ---------- G4 v2 处置-张力（SOUND-R3 改测：F5 v2 恒电平语义下测谱不测响度；informational 首轮） ----------
// 消融对照法（首轮学费：素材编曲演进的 HF 趋势 +17dB/60s 碾压处置效应 ±5dB）：
// 同素材同相位渲染两次——处置版 vs 低通冻结版，HF 占比差分=纯处置效应，与 T 相关。
export function g4DispositionV2(sp: SoundParams, prep: BandPrep): GateResult {
  const speed = prep.durMs / (G4_RENDER_SEC * 1000);
  const renderHf = (spx: SoundParams): number[] => {
    const ctx = new OfflineCtx(EAR_SR);
    const eng = buildEngine(ctx, spx, { repoKey: `ear:${prep.name}`, assets: earAssets(), records: earRecords() });
    // tap recG（唱片支路单渲口径）：磨损 hiss（T 高→糙→HF 升）与 ASK 动机在 master 会反向拉扯
    const getTap = ctx.tap(eng.nodes['recG'] as unknown as OfflineNode);
    eng.startTransport(0, speed, prep.track, prep.durMs);
    eng.scheduleGridUntil(G4_RENDER_SEC);
    ctx.render(G4_RENDER_SEC);
    const tap = getTap();
    const hf: number[] = [];
    for (let s = 2; s + 8 <= G4_RENDER_SEC; s += 4) {
      const hi = bandRmsDb(tap, EAR_SR, 3000, 8000, s, s + 8); // 3–8k：recLP 8k→1.8k 扫程的敏感端
      const all = bandRmsDb(tap, EAR_SR, 50, 8000, s, s + 8);
      hf.push(hi <= -170 || all <= -170 ? NaN : hi - all);
    }
    return hf;
  };
  const frozen = JSON.parse(JSON.stringify(sp)) as SoundParams; // 对照：低通冻结全开（处置唯一消融项）
  frozen.record.filterHzLo = frozen.record.filterHzHi;
  const hfA = renderHf(sp), hfB = renderHf(frozen);
  const d: number[] = [], t: number[] = [];
  for (let i = 0; i < hfA.length; i++) {
    if (Number.isNaN(hfA[i]!) || Number.isNaN(hfB[i]!)) continue;
    d.push(hfA[i]! - hfB[i]!);
    const s = 2 + i * 4;
    let ta = 0;
    for (let k = 0; k < 160; k++) ta += sampleAt(prep.track, Math.min((s + (k / 160) * 8) * 1000 * speed, prep.durMs))[2];
    t.push(ta / 160);
  }
  const r = pearson(d, t);
  return {
    id: 'G4v2', name: '处置-张力（谱）', crit: `storm ${G4_RENDER_SEC}s 唱片在位（recG 单渲，低通冻结对照消融）：HF 占比差分(8s 窗) × T 负相关 r ≤ −0.5`,
    measured: r === null ? 'NA（方差趋零）' : `r=${r.toFixed(3)}（${d.length} 窗）`,
    pass: r !== null && r <= -0.5, active: false,
  };
}

// ---------- G8 跳针可辨（SOUND-R3 新生；informational 首轮） ----------
// proxy：STUCK 段=短循环重复＋每回绕一声针嗒 → **包络**自相关在 lag∈[0.3,0.8]s 现周期峰。
// 包络法（而非波形降采样法——波形 8k 抽取会抹掉 1.8kHz+ 的针嗒能量，首轮学费）：
// |x| → 4ms 均值抽取（250Hz 包络）→ 去均值归一自相关。嗒串包络周期性极强；音乐段同域弱。
function loopAutocorrPeak(x: Float32Array, sr: number, fromSec: number, toSec: number): number {
  const hop = Math.floor(0.004 * sr), esr = sr / hop; // 250Hz 包络采样
  const a = Math.floor(fromSec * sr), b = Math.min(x.length, Math.floor(toSec * sr));
  const n = Math.floor((b - a) / hop);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < hop; k++) acc += Math.abs(x[a + i * hop + k]!);
    y[i] = acc / hop;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += y[i]!;
  mean /= n;
  let e = 0;
  for (let i = 0; i < n; i++) { y[i]! -= mean; e += y[i]! * y[i]!; }
  if (e < 1e-12) return 0;
  let best = 0;
  const lo = Math.floor(0.3 * esr), hi = Math.min(Math.floor(0.8 * esr), n - 1);
  for (let lag = lo; lag <= hi; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += y[i]! * y[i + lag]!;
    const r = acc / (e * (1 - lag / n)); // 无偏化归一
    if (r > best) best = r;
  }
  return best;
}
export function g8StuckAudible(sp: SoundParams): GateResult {
  const prep = midTensionPrep();
  const { ctx, eng } = freshEngine(sp, prep, 1, true); // 唱片在位
  eng.scheduleGridUntil(22);
  eng.trigger(7, 12, 0, 3); // 跳针 @12s，卡碟 3s（12–15s 短循环）
  const wav = ctx.render(22);
  // 谱差异 proxy（主单原文口径；自相关两法折戟入档：波形法被 wow 相位漂移摧毁、
  // 包络法被音乐拍底混淆——嗒串周期与 80BPM 拍长同域）：八分带谱向量的 RMS 距离（dB）。
  // 卡碟段谱（短循环素材+针嗒 1.8k+）vs 前后正常段谱；前后互距=正常演进的自差异基线。
  const spec = (a: number, b: number): number[] => octaveBandsDb(wav, EAR_SR, a, b).map((x) => x.db);
  const dist = (u: number[], v: number[]): number => {
    let acc = 0;
    for (let i = 0; i < u.length; i++) acc += (u[i]! - v[i]!) ** 2;
    return Math.sqrt(acc / u.length);
  };
  const sStuck = spec(12.3, 14.8), sBefore = spec(9.2, 11.7), sAfter = spec(15.5, 18.0);
  const dStuck = (dist(sStuck, sBefore) + dist(sStuck, sAfter)) / 2;
  const dBase = dist(sBefore, sAfter);
  return {
    id: 'G8', name: '跳针可辨', crit: 'STUCK 段八分带谱距离（对前后段均值）≥ 6dB 且 ≥ 2× 前后互距基线',
    measured: `卡碟谱距 ${dStuck.toFixed(1)}dB / 基线 ${dBase.toFixed(1)}dB`,
    pass: dStuck >= 6 && dStuck >= 2 * dBase, active: false,
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
  const bands = preps.map((p) => g3Band(sp, p)); // G3：房间层口径（无唱片态），judge 冻结沿用
  const stormBand = bands.find((b) => b.name === 'storm')!;
  const g6 = g6Texture(sp);
  const g7 = g7LoudnessV3(sp);
  const gates = [
    g1StopSilence(sp, storm),
    g2Trim(soundRaw, storm),
    g3Gate(bands),
    g7.gate,
    g6.gate,
    g4DispositionV2(sp, storm),
    g5Penetration(sp, stormBand),
    g8StuckAudible(sp),
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
  const { catalog } = loadRecordsNode();
  const t0 = Date.now();
  const { gates, bands, allActiveGreen } = runAllGates(soundRaw);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const aHash = assetsHash(earAssets());
  const rHash = recordsHash(catalog);

  const mark = (g: GateResult): string => (g.pass ? '✅ PASS' : g.active ? '❌ FAIL' : 'ℹ️ 记分');
  const rows = gates.map((g) => `| ${g.id} ${g.name} | ${g.crit} | ${g.measured} | ${mark(g)}${g.active ? '' : '（informational）'} |`);
  const bandRows = bands.map((b) => `| ${b.name} | ${b.designDb.toFixed(1)} | ${b.renderedDb.toFixed(1)} | ${(b.renderedDb - b.designDb).toFixed(1)} |`);
  const assetRows = manifest.map((m) => `| ${m.file} | ${m.seconds}s | ${m.fnv} | ${m.license} | ${m.author} |`);
  const recordRows = catalog.records.map((r) => `| ${r.file} | ${r.seconds}s | ${r.bpmMeasured} | ${r.lufs} | ${r.fnv} | ${r.license} | ${r.author}（Suno v5 生成，捐入公共领域） |`);

  const report = `# EAR_MACHINE v3 —— 机器耳朵（SOUND-R3 §3：唱机改造——改口径，不换庙）
engine ${gitShaSafe()} / params ${hashParams(paramsRaw)} / verdict ${verdictHash} / **sound-params ${hashJson(soundRaw)}** / **assets ${aHash}** / **records ${rHash}**
离线渲染 ${EAR_SR}Hz · 确定性 · 判定对象=渲染波形（门规：账本只作接线自检，永不作发声证明）· 含 1× 原速段 ${REALTIME_SEC}s · 渲染 ${elapsed}s
总纲（R3）：音乐由唱片供给，信息由机器供给。F5 v2：唱片恒电平，T 的表达=处置（低通/wow/磨损）。
唱片解码：ear=afconvert / 页=decodeAudioData（PCM 不逐位一致，定标锚同源 catalog.lufs——响度一致到解码器差异）。

| 门 | 判据 | 实测 | 判定 |
|---|---|---|---|
${rows.join('\n')}

**active 门（G1/G2/G3+G7v3）：${allActiveGreen ? '✅ 全绿' : '❌ 未过——不得申请实听（§4）'}**

## G3 明细（房间层口径=无唱片态，master 床单渲，30s/带）
| 带 | 设计 dBFS | 渲染 dBFS | Δ |
|---|---|---|---|
${bandRows.join('\n')}

## 资产清单（L1 织体体；CC0 逐条溯源见 sound/assets/LICENSES.md）
| 文件 | 时长 | 内容哈希 | 授权 | 作者 |
|---|---|---|---|---|
${assetRows.join('\n')}

## 唱片清单（出厂唱片；CC0 逐条溯源＋AI 生成来源属性见 sound/records/LICENSES.md）
| 文件 | 时长 | BPM | LUFS 锚 | 内容哈希 | 授权 | 作者 |
|---|---|---|---|---|---|---|
${recordRows.join('\n')}
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
