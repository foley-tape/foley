// 声音相金测试（M1.9 §1.4 → SOUND-R1 重制）。
// 律法组（纯核，㉚–㉟ 沿革）：床映射律 / 设计包络×T / 习惯化 / 量化 / 频谱专区 / 治理。
// 机器耳朵组（渲染波形，㊱–㊸ 新增，SOUND-R1 §3）：
// ㊱ 渲染器听得见账本听不见的声（EAR-4 失明机理的解药自证）。
// ㊲ 注册表禁手：直连 AudioParam 即抛（规矩③）。
// ㊳ 方案 B 呼吸有界：床包络 ∈ 正身×(1±breathDepth)——副肺在数学上永远是百分比。
// ㊴ stem 定标锁：四 stem 渲染 RMS 贴设计电平（CALIB 漂移即红）。
// ㊵ G1 停止即静默（含停前有声的阳性对照）。
// ㊶ G2 总闸有效。㊷ G3 五带床响度守设计。㊸ 渲染确定性（同图同种子逐样本相等）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveParams, hashJson } from '../engine/params.ts';
import { replayCore, loadVerdict } from '../cli/replay.ts';
import {
  resolveSoundParams, bedTargets, bedEnergyDb, bedRmsDb, habituationGain, quantizeUpSec,
  degreeOf, rootMidiOf, askMotifHz, pearson, S2_CREST, S2_REF_DENSITY,
  type BedState, type TrackRow, type SoundParams,
} from '../sound/index.ts';
import { buildEngine, createRegistry } from '../sound/graph.js';
import { OfflineCtx, OfflineNode, rmsDb } from '../sound/offline.ts';
import { prepBand, g1StopSilence, g2Trim, g3Band, g3Gate, EAR_SR } from '../cli/ear.ts';

const here = dirname(fileURLToPath(import.meta.url));
const params = resolveParams(JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8')));
const soundRaw = JSON.parse(readFileSync(join(here, '..', 'sound-params.json'), 'utf8'));
const sp = resolveSoundParams(soundRaw);

const st = (o: Partial<BedState>): BedState => ({
  T: 0, A: 0, wow: 0, phase: 'WORKING', weather: 'CLEAR', pendingAsk: false, ...o,
});

// 恒态轨迹（渲染测试用）：给定 T/A 的静止世界
const constTrack = (T: number, A: number, durMs = 60000): TrackRow[] => [
  [0, T, T, A, 0, 1, 0.2, 0], [durMs, T, T, A, 0, 1, 0.2, 0],
];

function bedEngine(spx: SoundParams, track: TrackRow[], durMs: number): { ctx: OfflineCtx; eng: ReturnType<typeof buildEngine> } {
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, spx, { repoKey: 'golden' });
  eng.startTransport(0, 1, track, durMs);
  return { ctx, eng };
}

// ---------- 律法组（纯核） ----------

test('㉚ 床映射律：能量随 T 单调；IDLE 唯余基底；DONE 真静默；WAITING 悬停', () => {
  let prev = -Infinity;
  for (let T = 0; T <= 1.001; T += 0.1) {
    const e = bedEnergyDb(bedTargets(st({ T }), sp));
    assert.ok(e >= prev - 1e-9, `T=${T.toFixed(1)} 能量应单调不减: ${e} < ${prev}`);
    prev = e;
  }
  const idle = bedTargets(st({ phase: 'IDLE', A: 0.9, T: 0 }), sp);
  assert.equal(idle.s2, 0, 'IDLE 无律动');
  // EAR-1 后 targets 含床总闸（trimDb）——验收能量模型与渲染器同一数字
  const trim = Math.pow(10, sp.bed.trimDb / 20);
  assert.ok(Math.abs(idle.s1 - trim * sp.bed.s1IdleGain) < 1e-12, 'IDLE 基底最弱态（含总闸）');
  const done = bedTargets(st({ phase: 'DONE', T: 0.5, A: 0.5 }), sp);
  assert.ok(done.silence && done.s1 === 0 && done.s3 === 0 && done.hissLin === 0, 'DONE 真静默');
  assert.ok(bedTargets(st({ pendingAsk: true }), sp).hover, 'WAITING（pendingAsk）床悬停');
  // 滤波随 T 下压、磨损随 T 上行
  const lo = bedTargets(st({ T: 0.1 }), sp), hi = bedTargets(st({ T: 0.9 }), sp);
  assert.ok(hi.filterHz < lo.filterHz && hi.hissLin > lo.hissLin && hi.hfShelfDb < lo.hfShelfDb, 'T↑ → 暗、糙');
});

test('㉛ §6.1 设计律：storm 床设计包络（1s 窗）× T 的 Pearson r ≥ 0.6', () => {
  const { verdict } = loadVerdict();
  const core = replayCore(readFileSync(join(here, '..', 'tapes', 'storm.tape.jsonl'), 'utf8'), params, verdict.rain.floor);
  // 设计包络：snaps 实时间轴 1s 窗，bedEnergyDb 口径（判据冻结：EAR-1 起该律以抽象能量口径全绿，
  // 本令不得顺手换尺；bedRmsDb 是 G3 的物理记账模型——同窗 r=0.595，差异及归因见 FEEDBACK-SOUND）
  const bySec = new Map<number, { e2: number; t: number; n: number }>();
  for (const s of core.snaps) {
    const sec = Math.floor(s.t / 1000);
    const lin = Math.pow(10, bedEnergyDb(bedTargets({ T: s.T, A: s.A, wow: s.wow, phase: s.phase, weather: s.weather, pendingAsk: s.pendingAsk }, sp)) / 20);
    const cell = bySec.get(sec) ?? { e2: 0, t: 0, n: 0 };
    cell.e2 += lin * lin; cell.t += s.T; cell.n++;
    bySec.set(sec, cell);
  }
  const secs = [...bySec.keys()].sort((a, b) => a - b);
  const edb = secs.map((s2) => { const c = bySec.get(s2)!; return 10 * Math.log10(Math.max(c.e2 / c.n, 1e-24)); });
  const t = secs.map((s2) => { const c = bySec.get(s2)!; return c.t / c.n; });
  const r = pearson(edb, t);
  assert.ok(r !== null && r >= 0.6, `storm 设计 r=${r} 应 ≥0.6（F5 可执行化——律本身必须成立）`);
});

test('㉜ 习惯化：n=1 满量、×0.85^(n−1) 递减、下限=沉床比、乘子不越 [floor,1]', () => {
  assert.equal(habituationGain(1, sp), 1);
  assert.ok(Math.abs(habituationGain(2, sp) - sp.foreground.habituationFactor) < 1e-12);
  let prev = 1;
  for (let n = 2; n <= 40; n++) {
    const g = habituationGain(n, sp);
    assert.ok(g <= prev + 1e-12 && g >= sp.foreground.habituationFloorRatio - 1e-12, `n=${n} g=${g}`);
    prev = g;
  }
  assert.equal(habituationGain(1000, sp), sp.foreground.habituationFloorRatio, '沉入织体，不消失');
});

test('㉝ 量化宁迟勿早：结果 ≥ 输入且在 1/8 @72BPM 网格上', () => {
  const grid = 60 / sp.bpm / 2;
  for (const x of [0, 0.01, 0.2083, grid, grid * 1.5, 7.77, 100.0001]) {
    const q = quantizeUpSec(x, sp);
    assert.ok(q >= x - 1e-9, `q(${x})=${q} 不得提前`);
    assert.ok(Math.abs(q / grid - Math.round(q / grid)) < 1e-6, `q(${x})=${q} 应在网格上`);
  }
  assert.equal(sp.bpm, 72, '节拍是地基，永不漂');
});

test('㉞ 频谱专区与主题曲：ASK ∈ [2k,4k]；同槽同度；每仓库一调稳定', () => {
  for (const key of ['repoA', '/Users/x/proj', 'd98d3543']) {
    const root = rootMidiOf(key, sp);
    const hz = askMotifHz(root, sp);
    assert.ok(hz >= sp.call.askBandHzLo && hz <= sp.call.askBandHzHi, `ASK 动机 ${hz}Hz 应在频谱专区`);
    assert.equal(rootMidiOf(key, sp), root, '同仓库同调');
  }
  assert.equal(degreeOf('4057685a', sp), degreeOf('4057685a', sp), '同槽同动机');
  const degrees = new Set(['a1', 'b2', 'c3', 'd4', 'e5', 'f6', '0709'].map((s) => degreeOf(s, sp)));
  assert.ok(degrees.size >= 3, '不同槽应散布多个音级');
});

test('㉟ 治理：_ 键不入哈希；改值即改哈希', () => {
  const h0 = hashJson(soundRaw);
  const noted = { ...soundRaw, _extraNote: '注释不入哈希' };
  assert.equal(hashJson(noted), h0);
  const tweaked = JSON.parse(JSON.stringify(soundRaw));
  tweaked.bed.s3Gain = 0.2;
  assert.notEqual(hashJson(tweaked), h0, '改 s3Gain 应改哈希（调音抽屉的治理锚）');
});

// ---------- 机器耳朵组（渲染波形） ----------

test('㊱ 渲染器听得见账本听不见的声（EAR-4 失明机理解药自证）', () => {
  // 复刻事故拓扑：正身 0.035，LFO ±0.15 直连增益参数（ctx 层无禁手——禁手是注册表的法）
  const ctx = new OfflineCtx(EAR_SR);
  const body = ctx.createOscillator(); body.type = 'triangle'; body.frequency.value = 110; body.start();
  const g = ctx.createGain(); g.gain.value = 0.035;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.137; lfo.start();
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.15;
  lfo.connect(lfoG); lfoG.connect(g.gain); // 直连参数——EAR-4 根因原样重演
  body.connect(g); g.connect(ctx.destination);
  const ledgerBefore = g.gain.value;
  const wav = ctx.render(20);
  const renderedDb = rmsDb(wav, EAR_SR, 0, 20);
  const ledgerDb = 20 * Math.log10(0.035 * 0.577); // 账本推算：0.035 × 三角波 RMS
  assert.ok(Math.abs(ledgerBefore - 0.035) < 1e-9, '.value 账本读数不含外接信号（规范语义原样再现）');
  assert.ok(renderedDb > ledgerDb + 6, `渲染 ${renderedDb.toFixed(1)}dB 应比账本 ${ledgerDb.toFixed(1)}dB 响 ≥6dB——耳朵不受账本蒙蔽`);
});

test('㊲ 注册表禁手：直连 AudioParam 即抛（规矩③）', () => {
  const ctx = new OfflineCtx(EAR_SR);
  const R = createRegistry(ctx);
  const lfo = ctx.createOscillator();
  const victim = ctx.createGain();
  assert.throws(() => (R as { connect(a: unknown, b: unknown): void }).connect(lfo, victim.gain), /禁手/, '注册表必须拦下参数直连');
  assert.doesNotThrow(() => (R as { connect(a: unknown, b: unknown): void }).connect(lfo, victim), '节点→节点照常');
});

test('㊳ 方案 B 呼吸有界：床包络 ∈ 正身×(1±breathDepth)；depth=0 即无呼吸', () => {
  // T=0/A=0：床只剩 S1（hiss −64dB、房间 −78dB 不扰界判）。26s 覆盖 7.3/11.9s 双肺拍
  const bt = bedTargets(st({ T: 0, A: 0 }), sp);
  const run = (depth: number): { max: number; min: number } => {
    const raw = JSON.parse(JSON.stringify(soundRaw));
    raw.bed.breathDepth = depth;
    const { ctx, eng } = bedEngine(resolveSoundParams(raw), constTrack(0, 0), 60000);
    const getTap = ctx.tap(eng.nodes['s1Level'] as unknown as OfflineNode);
    eng.scheduleGridUntil(26);
    ctx.render(26);
    const tap = getTap();
    let max = -Infinity, min = Infinity;
    for (let from = 2; from + 0.25 <= 26; from += 0.25) {
      const w = Math.pow(10, rmsDb(tap, EAR_SR, from, from + 0.25) / 20);
      if (w > max) max = w;
      if (w < min) min = w;
    }
    return { max, min };
  };
  const d = sp.bed.breathDepth;
  const withBreath = run(d);
  assert.ok(withBreath.max <= bt.s1 * (1 + d) * 1.05, `包络峰 ${withBreath.max.toFixed(5)} ≤ 正身×(1+${d})——副肺不可能压过正身`);
  assert.ok(withBreath.min >= bt.s1 * (1 - d) * 0.95, `包络谷 ${withBreath.min.toFixed(5)} ≥ 正身×(1−${d})——不可能反相`);
  assert.ok(withBreath.max / withBreath.min > 1 + d * 0.8, '呼吸确实在动（不是死床）');
  const still = run(0);
  assert.ok(still.max / still.min < 1.03, `depth=0 床应静止（实测摆幅 ${(still.max / still.min).toFixed(4)}）`);
});

test('㊴ stem 定标锁：四 stem 渲染 RMS 贴设计电平（CALIB/S2_CREST 漂移即红）', () => {
  const bt = bedTargets(st({ T: 0.8, A: 0.5, wow: 0.2 }), sp);
  const { ctx, eng } = bedEngine(sp, constTrack(0.8, 0.5), 60000);
  const taps = new Map<string, () => Float32Array>();
  for (const k of ['s1Level', 's2Level', 's3Level', 'hissLevel'] as const) {
    taps.set(k, ctx.tap(eng.nodes[k] as unknown as OfflineNode));
  }
  eng.scheduleGridUntil(60);
  ctx.render(60);
  const meas = (k: string): number => rmsDb(taps.get(k)!(), EAR_SR, 5, 60);
  const dB = (x: number): number => 20 * Math.log10(x);
  assert.ok(Math.abs(meas('s1Level') - dB(bt.s1)) <= 1, `S1 ${meas('s1Level').toFixed(2)} vs 设计 ${dB(bt.s1).toFixed(2)}（±1dB）`);
  assert.ok(Math.abs(meas('s3Level') - dB(bt.s3)) <= 1, `S3 ${meas('s3Level').toFixed(2)} vs ${dB(bt.s3).toFixed(2)}`);
  assert.ok(Math.abs(meas('hissLevel') - dB(bt.hissLin)) <= 1, `hiss ${meas('hissLevel').toFixed(2)} vs ${dB(bt.hissLin).toFixed(2)}`);
  const s2Design = dB(bt.s2 * S2_CREST * Math.sqrt(bt.density / S2_REF_DENSITY));
  assert.ok(Math.abs(meas('s2Level') - s2Design) <= 1.5, `S2 ${meas('s2Level').toFixed(2)} vs ${s2Design.toFixed(2)}（稀疏打点 ±1.5dB）`);
});

test('㊵ G1 停止即静默（含阳性对照：停前有声）', () => {
  const prep = prepBand('storm');
  // 阳性对照：同构渲染不停止，床段确有声（防"从未出声"的假绿）
  const { ctx, eng } = bedEngine(sp, prep.track, prep.durMs);
  eng.startTransport(0, prep.speed, prep.track, prep.durMs);
  eng.scheduleGridUntil(7.5);
  const alive = rmsDb(ctx.render(7.5), EAR_SR, 5.35, 6.35);
  assert.ok(alive > -45, `不停止时同窗应有声（实测 ${alive.toFixed(1)} dBFS）`);
  const g1 = g1StopSilence(sp, prep);
  assert.ok(g1.pass, `G1 ${g1.measured}`);
});

test('㊶ G2 总闸有效：trimDb ±12dB 渲染 RMS 差 ≥ 10dB', () => {
  const g2 = g2Trim(soundRaw, prepBand('storm'));
  assert.ok(g2.pass, `G2 ${g2.measured}`);
});

test('㊷ G3 床响度守设计：五带各 30s，bedBus RMS 落设计值 ±3dB', () => {
  const bands = (['silence', 'smooth', 'busy', 'jam', 'storm'] as const).map((k) => g3Band(sp, prepBand(k)));
  const gate = g3Gate(bands);
  assert.ok(gate.pass, `G3 ${gate.measured}`);
});

test('㊸ 渲染确定性：同图同种子两次渲染逐样本相等', () => {
  const render = (): Float32Array => {
    const { ctx, eng } = bedEngine(sp, constTrack(0.6, 0.6, 10000), 10000);
    eng.scheduleGridUntil(4);
    eng.trigger(0, 1.0, 2, 0.7);
    eng.trigger(7, 2.0, 0, 0.9);
    return ctx.render(4);
  };
  const a = render(), b = render();
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) assert.fail(`样本 ${i} 不等：${a[i]} vs ${b[i]}（确定性破裂）`);
  }
});
