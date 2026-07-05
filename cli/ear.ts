// cli ear —— 机器耳朵（SOUND-R1 §3）。OfflineAudioContext 语义离线渲染（sound/offline.ts），
// 在**渲染出的波形**上判定，无人耳、确定性。任何"修好了"的宣称必须先过此处（船长听感协议 §4）。
//
// | 门 | 判据 | 状态 |
// | G1 停止即静默 | 播放→停止，硬闸(+0.3s)后 1s 窗 RMS < −60 dBFS            | active |
// | G2 总闸有效   | trimDb ±12dB 两次渲染，床段 RMS 差 ≥ 10dB                  | active |
// | G3 床响度守设计 | 五带各 30s，bedBus RMS 落 core.bedRmsDb 设计值 ±3dB       | active |
// | G4 床-张力相关 | storm 带，bedBus 1s-RMS 包络 × T 曲线 Pearson r ≥ 0.6     | informational 首轮 |
// | G5 呼唤穿透   | 跳针触发时，其频谱专区(1.2–2.2k)能量高于床同区 ≥ 6dB        | informational 首轮 |
//
// G1–G3 直接编码 EAR-1..4 事故的三症状（僵尸droning / trim 无效 / 床是大噪声），拦路；
// G4/G5 按判据试用期法首轮记分不拦。渲染与 probe 页跑同一份 sound/graph.js——听的即是发的。
// 前史教训（EAR-4）：本命令的前身用 sound/ 纯核**计算**床能量，从不渲染一个采样——账本全零，
// 节点仍在出声。账本式验收自此废止：.value 读数在本文件中不作任何判定依据。

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
import { OfflineCtx, OfflineNode, rmsDb, envelope1sDb, bandRmsDb } from '../sound/offline.ts';

export const EAR_SR = 48000;        // 贴近浏览器现实（hiss 白噪带内能量随采样率变，定标亦 @48k）
export const BAND_RENDER_SEC = 30;  // 每带渲染时长（施工令 §3）
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

export function prepBand(name: TapeName): BandPrep {
  const core = replayCoreOf(name);
  const { track } = buildTrack(core.snaps);
  const durMs = track.length ? track[track.length - 1]![0]! : 0;
  const speed = Math.max(durMs / (BAND_RENDER_SEC * 1000), 1e-6); // 全带压缩进 30s 审听窗
  return { name, track, durMs, speed };
}

function replayCoreOf(name: TapeName): ReturnType<typeof replayCore> {
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const { verdict } = loadVerdict();
  return replayCore(readFileSync(new URL(`../tapes/${name}.tape.jsonl`, import.meta.url), 'utf8'), params, verdict.rain.floor);
}

function freshEngine(sp: SoundParams, prep: BandPrep): { ctx: OfflineCtx; eng: SoundEngine } {
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: `ear:${prep.name}` });
  eng.startTransport(0, prep.speed, prep.track, prep.durMs);
  return { ctx, eng };
}

// ---------- G1 停止即静默（僵尸 droning 的直接编码） ----------
export function g1StopSilence(sp: SoundParams, prep: BandPrep): GateResult {
  const { ctx, eng } = freshEngine(sp, prep);
  eng.scheduleGridUntil(10);          // 调度器照常把床参数预排过停止点（EAR-3 事故形态）
  eng.trigger(0, 6.0, 2, 0.8);        // 停止前已预排到未来的前景（拨弦/呼唤）也必须死
  eng.trigger(8, 6.5, 0, 0.8);
  eng.stop(5);
  const wav = ctx.render(7.5);
  const db = rmsDb(wav, EAR_SR, 5.35, 6.35); // 停止(5s)→0.05tc 快放→+0.3s 硬闸，其后 1s 窗
  return {
    id: 'G1', name: '停止即静默', crit: '停止硬闸后 1s 窗 RMS < −60 dBFS',
    measured: `${db.toFixed(1)} dBFS（storm 带，停于 5s，预排前景×2 同殁）`,
    pass: db < -60, active: true,
  };
}

// ---------- G2 总闸有效（trim 无效症状的直接编码） ----------
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

// ---------- G3 床响度守设计（床是大噪声症状的直接编码） ----------
export interface G3Band { name: TapeName; renderedDb: number; designDb: number; tap: Float32Array; prep: BandPrep }
export function g3Band(sp: SoundParams, prep: BandPrep): G3Band {
  const { ctx, eng } = freshEngine(sp, prep);
  const getTap = ctx.tap(eng.nodes['bedBus'] as unknown as OfflineNode); // graph 是 ctx 无关的，此处收窄回离线节点
  eng.scheduleGridUntil(BAND_RENDER_SEC);
  ctx.render(BAND_RENDER_SEC);
  const tap = getTap();
  const renderedDb = rmsDb(tap, EAR_SR, 1, BAND_RENDER_SEC); // 掐头 1s：起播 slew 就位
  // 设计值：同一时间轴上逐 1/8 网格取 bedRmsDb 的功率均值（与渲染同窗）
  const grid = 60 / sp.bpm / 2;
  let acc = 0, n = 0;
  for (let at = 1; at < BAND_RENDER_SEC; at += grid) {
    const s = sampleAt(prep.track, Math.min(at * 1000 * prep.speed, prep.durMs));
    const lin = Math.pow(10, bedRmsDb(bedTargets(stateOf(s), sp)) / 20);
    acc += lin * lin; n++;
  }
  const designDb = n ? 10 * Math.log10(Math.max(acc / n, 1e-24)) : -120;
  return { name: prep.name, renderedDb, designDb, tap, prep };
}
export function g3Gate(bands: G3Band[]): GateResult {
  const rows = bands.map((b) => `${b.name} ${b.renderedDb.toFixed(1)}/${b.designDb.toFixed(1)}(Δ${(b.renderedDb - b.designDb).toFixed(1)})`);
  const pass = bands.every((b) => Math.abs(b.renderedDb - b.designDb) <= 3);
  return {
    id: 'G3', name: '床响度守设计', crit: '五带各 30s，bedBus RMS 落设计值 ±3dB',
    measured: rows.join('｜'), pass, active: true,
  };
}

// ---------- G4 床-张力相关（informational 首轮） ----------
// 口径：storm 带以 60s 独立渲染（30s 窗=133× 时间压缩，统计噪声淹信号；60s 记分更稳仍不拦）。
// 首轮实测 r≈0.45：设计包络同窗 r≈0.69（律本身成立），缺口=渲染物理——呼吸 ±1dB 摆在主导 stem 上
// （归因实验：breathDepth 0→r0.58）+ slew 滞后 + S2 打点抖动，而床的 T 全程设计动态仅 4.2dB。
// 判据修订证据已入 FEEDBACK-SOUND（加宽床 T 动态 or 换包络口径，候架构师裁）。
export const G4_RENDER_SEC = 60;
export function g4Pearson(sp: SoundParams, prep: BandPrep): GateResult {
  const speed = prep.durMs / (G4_RENDER_SEC * 1000);
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: `ear:${prep.name}` });
  const getTap = ctx.tap(eng.nodes['bedBus'] as unknown as OfflineNode);
  eng.startTransport(0, speed, prep.track, prep.durMs);
  eng.scheduleGridUntil(G4_RENDER_SEC);
  ctx.render(G4_RENDER_SEC);
  const edb = envelope1sDb(getTap(), EAR_SR);
  const t: number[] = [];
  const dEnv: number[] = [];
  for (let s = 0; s < edb.length; s++) {
    let acc = 0, dAcc = 0;
    for (let k = 0; k < 20; k++) {
      const row = sampleAt(prep.track, Math.min((s + k / 20) * 1000 * speed, prep.durMs));
      acc += row[2];
      const lin = Math.pow(10, bedRmsDb(bedTargets(stateOf(row), sp)) / 20);
      dAcc += lin * lin;
    }
    t.push(acc / 20);
    dEnv.push(10 * Math.log10(Math.max(dAcc / 20, 1e-24)));
  }
  const r = pearson(edb.slice(1), t.slice(1)); // 掐头 1 窗（slew 就位）
  const rD = pearson(dEnv.slice(1), t.slice(1));
  return {
    id: 'G4', name: '床-张力相关', crit: `storm ${G4_RENDER_SEC}s 渲染包络(1s RMS) × T 曲线 Pearson r ≥ 0.6`,
    measured: `${r === null ? 'NA' : `r=${r.toFixed(3)}`}（设计包络同窗 r=${rD === null ? 'NA' : rD.toFixed(3)}——缺口=呼吸/slew/打点等渲染物理）`,
    pass: r !== null && r >= 0.6, active: false,
  };
}

// ---------- G5 呼唤穿透（informational 首轮） ----------
export function g5Penetration(sp: SoundParams, storm: G3Band): GateResult {
  // 床最响时刻（白皮书 §6.4）：包络峰值秒触发跳针
  const edb = envelope1sDb(storm.tap, EAR_SR);
  let atE = 2, best = -1e9;
  for (let s = 2; s < edb.length - 1; s++) if (edb[s]! > best) { best = edb[s]!; atE = s + 0.5; }
  const { ctx, eng } = freshEngine(sp, storm.prep);
  eng.scheduleGridUntil(atE + 1);
  eng.trigger(7, atE, 0, 1); // 跳针（呼唤级，直通不量化）
  const wav = ctx.render(atE + 0.6);
  const ev = bandRmsDb(wav, EAR_SR, 1200, 2200, atE, atE + 0.12);       // 跳针频谱专区（带通 1.6k）
  const bed = bandRmsDb(wav, EAR_SR, 1200, 2200, atE - 1.0, atE - 0.1); // 触发前同区床能量
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
  const gates = [
    g1StopSilence(sp, storm),
    g2Trim(soundRaw, storm),
    g3Gate(bands),
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
  const t0 = Date.now();
  const { gates, bands, allActiveGreen } = runAllGates(soundRaw);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const mark = (g: GateResult): string => (g.pass ? '✅ PASS' : g.active ? '❌ FAIL' : 'ℹ️ 记分');
  const rows = gates.map((g) => `| ${g.id} ${g.name} | ${g.crit} | ${g.measured} | ${mark(g)}${g.active ? '' : '（informational 首轮）'} |`);
  const bandRows = bands.map((b) => `| ${b.name} | ${b.designDb.toFixed(1)} | ${b.renderedDb.toFixed(1)} | ${(b.renderedDb - b.designDb).toFixed(1)} |`);

  const report = `# EAR_MACHINE —— 机器耳朵（SOUND-R1 §3）
engine ${gitShaSafe()} / params ${hashParams(paramsRaw)} / verdict ${verdictHash} / **sound-params ${hashJson(soundRaw)}**
离线渲染 ${EAR_SR}Hz · 确定性（种子化噪声，无 Math.random）· 判定对象=渲染波形（.value 账本不作依据）· 渲染 ${elapsed}s

| 门 | 判据 | 实测 | 判定 |
|---|---|---|---|
${rows.join('\n')}

**active 门（G1–G3）：${allActiveGreen ? '✅ 全绿' : '❌ 未过——不得申请实听（§4）'}**

## G3 明细（bedBus 口径，30s/带）
| 带 | 设计 dBFS | 渲染 dBFS | Δ |
|---|---|---|---|
${bandRows.join('\n')}
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
