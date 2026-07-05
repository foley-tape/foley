// 声音相金测试（M1.9 §1.4，白皮书 §2/§3/§6/§7）。
// ㉚ 床映射律：能量随 T 单调、IDLE 唯余 S1 最弱态、DONE 真静默、WAITING 悬停。
// ㉛ §6.1 机器验收：storm 带床包络 × T 的 Pearson r ≥ 0.6（必测）。
// ㉜ 习惯化曲线：×0.85^(n−1)、下限沉床、n=1 满量。
// ㉝ 量化"宁迟勿早"：结果 ≥ 输入且在 1/8 网格上；BPM=72 恒定。
// ㉞ 频谱专区：ASK 动机主频 ∈ [2k,4k]；同槽同动机（文件的主题曲）；每仓库一调稳定。
// ㉟ 治理：sound-params 走 hashJson（_ 键不入哈希；改值即改哈希）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resolveParams } from '../engine/params.ts';
import { hashJson } from '../engine/params.ts';
import { replayCore, loadVerdict } from '../cli/replay.ts';
import { envelope1s } from '../cli/ear.ts';
import {
  resolveSoundParams, bedTargets, bedEnergyDb, habituationGain, quantizeUpSec,
  degreeOf, rootMidiOf, askMotifHz, pearson, type BedState,
} from '../sound/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const params = resolveParams(JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8')));
const soundRaw = JSON.parse(readFileSync(join(here, '..', 'sound-params.json'), 'utf8'));
const sp = resolveSoundParams(soundRaw);

const st = (o: Partial<BedState>): BedState => ({
  T: 0, A: 0, wow: 0, phase: 'WORKING', weather: 'CLEAR', pendingAsk: false, ...o,
});

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

test('㉛ §6.1 机器验收：storm 床包络 × T 的 Pearson r ≥ 0.6', () => {
  const { verdict } = loadVerdict();
  const core = replayCore(readFileSync(join(here, '..', 'tapes', 'storm.tape.jsonl'), 'utf8'), params, verdict.rain.floor);
  const { edb, t } = envelope1s(core.snaps, sp);
  const r = pearson(edb, t);
  assert.ok(r !== null && r >= 0.6, `storm r=${r} 应 ≥0.6（F5 可执行化）`);
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
