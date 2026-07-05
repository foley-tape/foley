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
  resolveSoundParams, bedTargets, recordTargets, bedEnergyDb, bedRmsDb, habituationGain, quantizeUpSec,
  degreeOf, rootMidiOf, askMotifHz, pearson, S2_CREST, S2_REF_DENSITY,
  type BedState, type TrackRow, type SoundParams,
} from '../sound/index.ts';
import { buildEngine, createRegistry } from '../sound/graph.js';
import { OfflineCtx, OfflineNode, rmsDb, bandRmsDb, measureLufs } from '../sound/offline.ts';
import { prepBand, g1StopSilence, g2Trim, g3Band, g3Gate, g6Texture, g7Loudness, earAssets, EAR_SR } from '../cli/ear.ts';

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
  assert.equal(idle.l2, 0, 'IDLE 无和声垫');
  // EAR-1 后 targets 含床总闸（trimDb）——验收能量模型与渲染器同一数字
  const trim = Math.pow(10, sp.bed.trimDb / 20);
  assert.ok(Math.abs(idle.l1 - trim * sp.bed.l1IdleGain) < 1e-12, 'IDLE 唯余 L1 织体最弱态（含总闸）');
  const done = bedTargets(st({ phase: 'DONE', T: 0.5, A: 0.5 }), sp);
  assert.ok(done.silence && done.l1 === 0 && done.l2 === 0 && done.s3 === 0 && done.hissLin === 0 && done.crackle === 0, 'DONE 真静默');
  assert.ok(bedTargets(st({ pendingAsk: true }), sp).hover, 'WAITING（pendingAsk）床悬停');
  // 滤波随 T 下压、磨损（hiss+crackle）随 T 上行
  const lo = bedTargets(st({ T: 0.1 }), sp), hi = bedTargets(st({ T: 0.9 }), sp);
  assert.ok(hi.filterHz < lo.filterHz && hi.hissLin > lo.hissLin && hi.crackle > lo.crackle && hi.hfShelfDb < lo.hfShelfDb, 'T↑ → 暗、糙');
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

test('㊳ 方案 B 呼吸有界：L1 包络 ∈ 正身×(1±breathDepth)；depth=0 无呼吸（fallback 织体口径）', () => {
  // T=0/A=0：L1 独响（l2 在册但 tap 只看 l1Level）。fallback 粉噪统计平稳，界判可行；
  // 真采样有天然起伏，其呼吸由结构（乘法级）保证——此测锁结构，不锁素材。
  const bt = bedTargets(st({ T: 0, A: 0 }), sp);
  const run = (depth: number): { max: number; min: number } => {
    const raw = JSON.parse(JSON.stringify(soundRaw));
    raw.bed.breathDepth = depth;
    const ctx = new OfflineCtx(EAR_SR);
    const eng = buildEngine(ctx, resolveSoundParams(raw), { repoKey: 'golden' }); // 无资产→fallback
    eng.startTransport(0, 1, constTrack(0, 0), 60000);
    const getTap = ctx.tap(eng.nodes['l1Level'] as unknown as OfflineNode);
    eng.scheduleGridUntil(26);
    ctx.render(26);
    const tap = getTap();
    let max = -Infinity, min = Infinity;
    // 1s 窗：把织体统计涨落平均掉（0.25s 窗下粉噪天然 ±0.6dB），呼吸周期 7.3/11.9s 不受影响
    for (let from = 2; from + 1 <= 26; from += 0.5) {
      const w = Math.pow(10, rmsDb(tap, EAR_SR, from, from + 1) / 20);
      if (w > max) max = w;
      if (w < min) min = w;
    }
    return { max, min };
  };
  const d = sp.bed.breathDepth;
  const withBreath = run(d);
  assert.ok(withBreath.max <= bt.l1 * (1 + d) * 1.08, `包络峰 ${withBreath.max.toFixed(5)} ≤ 正身×(1+${d})——副肺不可能压过正身`);
  assert.ok(withBreath.min >= bt.l1 * (1 - d) * 0.92, `包络谷 ${withBreath.min.toFixed(5)} ≥ 正身×(1−${d})——不可能反相`);
  assert.ok(withBreath.max / withBreath.min > 1 + d * 0.7, '呼吸确实在动（不是死床）');
  const still = run(0);
  assert.ok(still.max / still.min < 1.10, `depth=0 床应近静止（织体统计涨落内，实测摆幅 ${(still.max / still.min).toFixed(4)}）`);
});

test('㊴ stem 定标锁 v2：六 stem 渲染 RMS 贴设计电平（CALIB/manifest 定标漂移即红）', () => {
  const bt = bedTargets(st({ T: 0.8, A: 0.5, wow: 0.2 }), sp);
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: 'ear:storm', assets: earAssets() });
  eng.startTransport(0, 1, constTrack(0.8, 0.5), 60000);
  const taps = new Map<string, () => Float32Array>();
  for (const k of ['l1Level', 'crackleLevel', 'l2Level', 's2Level', 's3Level', 'hissLevel'] as const) {
    taps.set(k, ctx.tap(eng.nodes[k] as unknown as OfflineNode));
  }
  eng.scheduleGridUntil(60);
  ctx.render(60);
  const meas = (k: string): number => rmsDb(taps.get(k)!(), EAR_SR, 5, 60);
  const dB = (x: number): number => 20 * Math.log10(x);
  assert.ok(Math.abs(meas('l1Level') - dB(bt.l1)) <= 1, `L1 ${meas('l1Level').toFixed(2)} vs 设计 ${dB(bt.l1).toFixed(2)}（±1dB）`);
  assert.ok(Math.abs(meas('crackleLevel') - dB(bt.crackle)) <= 1, `crackle ${meas('crackleLevel').toFixed(2)} vs ${dB(bt.crackle).toFixed(2)}`);
  assert.ok(Math.abs(meas('l2Level') - dB(bt.l2)) <= 1, `L2 ${meas('l2Level').toFixed(2)} vs ${dB(bt.l2).toFixed(2)}`);
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

test('㊺ 三关铁律（SOUND-R2 §2 L2）：L2/S3 自述过关；l2Gain≥l1Gain 即参数层拦死', () => {
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: 'golden' });
  for (const [name, info] of Object.entries(eng.stackInfo)) {
    assert.ok(info.voices >= 3, `${name} 声部 ${info.voices} ≥ 3（关一：失谐堆叠）`);
    const detuned = info.detunesCents.filter((c) => Math.abs(c) >= 3 && Math.abs(c) <= 10);
    assert.ok(detuned.length >= info.voices - 1, `${name} 失谐 ±3–10 音分（首声部可为 0）：${info.detunesCents}`);
    assert.ok(info.filterLfos >= 2, `${name} 动低通 LFO ${info.filterLfos} ≥ 2（关二）`);
    assert.ok(info.saturation, `${name} 轻饱和在路（关三）`);
  }
  const bad = JSON.parse(JSON.stringify(soundRaw));
  bad.bed.l2Gain = bad.bed.l1Gain;
  assert.throws(() => resolveSoundParams(bad), /铁律/, '和声垫电平不得 ≥ 织体体——resolve 执法');
});

test('㊻ G7 执法仪器自检：997Hz 正弦 −20dBFS → −20±0.5 LUFS（BS.1770 K 加权基准点）', () => {
  const sr = EAR_SR, n = sr * 10;
  const x = new Float32Array(n);
  const amp = Math.pow(10, -20 / 20) * Math.SQRT2; // RMS −20dBFS 的正弦幅度
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin(2 * Math.PI * 997 * i / sr);
  const lufs = measureLufs(x, sr, 0.5, 9.5);
  assert.ok(Math.abs(lufs - (-20)) <= 0.5, `997Hz@−20dBFS 应测得 ≈−20 LUFS（实测 ${lufs.toFixed(2)}）`);
});

test('㊼ G7 响度门（active）：中张力 1× 段 −26±2 LUFS；G6 织体占用度 ≥5/8 带', () => {
  const { gate: g6, wav } = g6Texture(sp);
  const g7 = g7Loudness(wav, sp);
  assert.ok(g7.pass, `G7 ${g7.measured}`);
  assert.ok(g6.pass, `G6 ${g6.measured}`); // informational 门，但首轮实测 8/8——锁住防退化
});

test('㊽ L3 hiss 出低通实证（设计自打架修复）：高 T 下 hiss 带摆幅回归设计', () => {
  // R1 事故：hiss 的 18dB 设计摆被 S4 低通收窗对消至 Δ6.7dB。v2 hiss 直达输出——摆幅应 ≥12dB。
  const run = (T: number): number => {
    const ctx = new OfflineCtx(EAR_SR);
    const eng = buildEngine(ctx, sp, { repoKey: 'ear:storm', assets: earAssets() });
    eng.setMute('crackle', true); // 隔离 crackle 的同带贡献，单问 hiss
    eng.setMute('l1', true); eng.setMute('l2', true); eng.setMute('s2', true); eng.setMute('s3', true);
    eng.startTransport(0, 1, constTrack(T, 0.2, 30000), 30000);
    eng.scheduleGridUntil(20);
    const wav = ctx.render(20);
    return bandRmsDb(wav, EAR_SR, 2200, 7500, 5, 20);
  };
  const lo = run(0.05), hi = run(0.95);
  assert.ok(hi - lo >= 12, `hiss 带摆幅 ${(hi - lo).toFixed(1)}dB 应 ≥12dB（设计 18dB；R1 时被低通对消只剩 6.7dB）`);
});

// ===== SOUND-R3 唱机改造（52–57）：唱片总线映射律／作曲层退场／loop 窗语义／connect 幂等／唱片链渲染 =====

test('52 recordTargets 映射律：恒电平（F5 v2）、T→lpHz 单调下压、duck、DONE/IDLE 关断', () => {
  const rt = (o: Partial<BedState>) => recordTargets(st(o), sp);
  // 恒电平：T 变 gain 不变（机器不泵音量——T 的表达=处置）
  assert.equal(rt({ T: 0.1 }).gain, rt({ T: 0.9 }).gain, 'gain 与 T 无关');
  // T→lpHz 单调下压（磁带变旧变闷）
  assert.ok(rt({ T: 0.2 }).lpHz > rt({ T: 0.8 }).lpHz, 'T 高更闷');
  assert.equal(rt({ T: 0 }).lpHz, sp.record.filterHzHi);
  assert.equal(rt({ T: 1 }).lpHz, sp.record.filterHzLo);
  // wow 加深：T 抬 wowCents（走带更晃）
  assert.ok(rt({ T: 0.9, wow: 0.2 }).wowCents > rt({ T: 0.1, wow: 0.2 }).wowCents, 'T 加深 wow');
  // ASK duck：−7.5dB
  const duckRatio = rt({ pendingAsk: true }).gain / rt({ pendingAsk: false }).gain;
  assert.ok(Math.abs(20 * Math.log10(duckRatio) - sp.record.duckDb) < 0.01, `duck=${sp.record.duckDb}dB`);
  // DONE/IDLE 关断
  assert.equal(rt({ phase: 'DONE' }).gain, 0);
  assert.equal(rt({ phase: 'IDLE' }).gain, 0);
  assert.ok(rt({ phase: 'IDLE' }).idle && rt({ phase: 'DONE' }).silence);
});

test('53 bedTargets recordOn：作曲四层退场、磨损照旧、未传=R2 旧世界（判据冻结）', () => {
  const off = bedTargets(st({ T: 0.5, A: 0.6 }), sp);
  const on = bedTargets({ ...st({ T: 0.5, A: 0.6 }), recordOn: true }, sp);
  assert.equal(on.l1, 0, '唱片在位 L1 退场');
  assert.equal(on.l2, 0, 'L2 退场');
  assert.equal(on.s2, 0, 'S2 退场');
  assert.equal(on.s3, 0, 'S3 退场');
  assert.equal(on.crackle, off.crackle, '磨损 crackle 照旧（机器介质噪声）');
  assert.equal(on.hissLin, off.hissLin, 'hiss 照旧');
  assert.ok(off.l1 > 0 && off.s3 > 0, '未传 recordOn=旧世界原样');
});

test('54 record 节 resolve 执法：缺节即抛、窗倒置即抛', () => {
  const noRec = JSON.parse(JSON.stringify(soundRaw));
  delete noRec.record;
  assert.throws(() => resolveSoundParams(noRec), /record/);
  const bad = JSON.parse(JSON.stringify(soundRaw));
  bad.record.stuckLoopSecHi = bad.record.stuckLoopSecLo - 0.1;
  assert.throws(() => resolveSoundParams(bad), /stuckLoopSec/);
});

test('55 offline BufferSource loop 窗语义：loopStart/loopEnd+offset 起播（STUCK 的结构基础）', () => {
  const ctx = new OfflineCtx(EAR_SR);
  const buf = ctx.createBuffer(1, EAR_SR * 20, EAR_SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / EAR_SR);
  // 令 [11.45,12.0) 窗外静默——回绕越界即测得
  for (let i = 0; i < Math.floor(11.45 * EAR_SR); i++) d[i] = 0;
  for (let i = Math.floor(12.0 * EAR_SR); i < d.length; i++) d[i] = 0;
  const s = ctx.createBufferSource() as unknown as {
    buffer: unknown; loop: boolean; loopStart: number; loopEnd: number;
    start(t?: number, off?: number): void; connect(dst: unknown): unknown;
  };
  s.buffer = buf; s.loop = true; s.loopStart = 11.45; s.loopEnd = 12.0;
  s.connect(ctx.destination);
  s.start(0.5, 11.45);
  const y = ctx.render(3);
  assert.ok(rmsDb(y, EAR_SR, 0, 0.45) < -120, '起播前静默');
  const inLoop = rmsDb(y, EAR_SR, 0.6, 2.8);
  assert.ok(Math.abs(inLoop - (-13.4)) < 1, `循环中恒 0.3 正弦（实测 ${inLoop.toFixed(1)}dBFS）——回绕未越界`);
});

test('56 connect 幂等（规范语义）：同对重复 connect 只算一条——双端一致性（R3 修）', () => {
  const ctx = new OfflineCtx(EAR_SR);
  const g1 = ctx.createGain(), g2 = ctx.createGain();
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, EAR_SR, EAR_SR);
  buf.getChannelData(0).fill(0.1);
  src.buffer = buf as never; (src as unknown as { loop: boolean }).loop = true;
  (src as unknown as { start(): void }).start();
  (src as unknown as { connect(d: unknown): unknown }).connect(g1);
  (src as unknown as { connect(d: unknown): unknown }).connect(g1); // 重复
  (g1 as unknown as { connect(d: unknown): unknown }).connect(g2);
  (g2 as unknown as { connect(d: unknown): unknown }).connect(ctx.destination);
  const y = ctx.render(1);
  const db = rmsDb(y, EAR_SR, 0.2, 0.9);
  assert.ok(Math.abs(db - 20 * Math.log10(0.1)) < 0.5, `重复 connect 不叠加（实测 ${db.toFixed(1)}dBFS，期望 −20）`);
});

test('57 唱片链渲染：合成唱片 STUCK 换源＋tape-stop 滑停至静默（全排程纪律的渲染实证）', () => {
  const spx = sp;
  const SRC = EAR_SR, DUR = 10;
  const x = new Float32Array(SRC * DUR);
  for (let i = 0; i < x.length; i++) x[i] = 0.25 * Math.sin(2 * Math.PI * (200 + 150 * (i / x.length) * DUR) * i / SRC);
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, spx, {
    repoKey: 'golden-rec', records: [{ name: 't', x, sr: SRC, lufs: -20, seconds: DUR }],
  });
  const track: TrackRow[] = [[0, 0.5, 0.5, 0.5, 0, 1, 0.2, 0], [11000, 0.5, 0.5, 0.5, 0, 3, 0.2, 0]];
  eng.startTransport(0.05, 1, track, 14000, 0);
  eng.scheduleGridUntil(14);
  eng.trigger(7, 4, 0, 2);   // STUCK @4s 卡 2s
  eng.trigger(9, 11, 0, 0);  // DONE tape-stop @11s
  const y = ctx.render(14);
  assert.ok(rmsDb(y, EAR_SR, 2, 3.5) > -30, '唱片在响');
  assert.ok(rmsDb(y, EAR_SR, 4.2, 5.8) > -40, '卡碟期在响（短循环+针嗒）');
  assert.ok(rmsDb(y, EAR_SR, 7, 9) > -30, '复走后在响');
  assert.ok(rmsDb(y, EAR_SR, 13.2, 14) < -60, 'tape-stop 后真静默');
});

test('58 renderCuts 钩子（M-T3 预提）：段拼接时长、尾静默 ≥2s、dub 授权卫生 meta', async () => {
  const { renderCuts } = await import('../cli/rendercuts.ts');
  const tapeText = readFileSync(join(here, '..', 'tapes', 'smooth.tape.jsonl'), 'utf8');
  const segs = [
    { role: 'OPEN', t0: 0, t1: 16000, speed: 8 },
    { role: 'CLOSE', t0: 30000, t1: 34000, speed: 1 },
  ];
  const def = renderCuts(segs, tapeText); // 默认：不含唱片（授权卫生）
  assert.equal(def.meta.withRecord, false);
  assert.deepEqual(def.meta.records, [], '默认音轨不含唱片——meta 如实');
  assert.ok(def.meta.durationSec > 4 && def.meta.durationSec < 60, `时长合理（${def.meta.durationSec.toFixed(1)}s）`);
  // 尾静默 ≥2s（正格终止后）：末 1.2s 窗
  const tail = rmsDb(def.pcm, def.sr, def.meta.durationSec - 1.4, def.meta.durationSec - 0.2);
  assert.ok(tail < -60, `尾静默（实测 ${tail.toFixed(1)}dBFS）`);
  // 体内有声（非全静默渲染物）
  let peak = -180;
  for (let s = 0.5; s + 1 < def.meta.durationSec - 3; s += 0.5) peak = Math.max(peak, rmsDb(def.pcm, def.sr, s, s + 1));
  assert.ok(peak > -45, `段体有声（峰窗 ${peak.toFixed(1)}dBFS）`);
  // --with-record：meta 必记唱片来源（名字/fnv/许可/出处四件齐）
  const wr = renderCuts(segs, tapeText, { withRecord: true });
  assert.equal(wr.meta.withRecord, true);
  assert.ok(wr.meta.records.length === 1 && wr.meta.records[0]!.license === 'CC0-1.0'
    && wr.meta.records[0]!.fnv && wr.meta.records[0]!.source, 'meta 记录唱片来源四件');
});
