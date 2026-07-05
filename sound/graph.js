// 声音相音频图引擎 v2（SOUND-R2 三层床重做；SOUND-R1 注册表机制沿革）。
// 浏览器（probe 页内嵌本文件真源）与离线机器耳朵（sound/offline.ts + cli ear）跑**同一份图代码**。
// 依赖 core.js（纯映射律）；页内嵌时按行拼接（剥 import/export），Node 侧正常 ESM。
//
// ── 音频图全览 v2（规矩①：拓扑注释即图纸，改图必改此注释）────────────────────────
//
//  [L1 织体体]  bodySrc(room tone 采样环｜fb 粉噪) ─ bodyG(定标) ─┐
//               airSrc(film static 采样环｜fb 气噪) ─ airG(定标×比) ─┴→ l1Sum
//                 → l1Breath(乘法级 bias=1 ±breathDepth ← breathLfo1/2 × bD1/2)   ← 方案 B 沿革
//                 → l1Level(电平 bt.l1) ──────────────────────────┐
//  [L2 和声垫]  pitchedStack 三关：5 声部失谐堆叠(±3–10 音分) → l2F(动低通       │
//               ←双互质自由 LFO 调制口) → l2Sat(轻饱和) → l2Norm → l2Level(bt.l2) ─┤
//  [S2 律动]    kick/hat（一次性源，调度器打点）→ s2Level(bt.s2) ─────────────────┤
//  [S3 张力弦]  pitchedStack 三关：5 声部失谐堆叠 → s3F(动低通←双 LFO) → s3Sat     │
//               → s3Norm → s3Level(bt.s3) ────────────────────────┤
//                                                                 ├→ bedBus(duck)
//               bedBus → wowDelay(30ms 调制口 ← wowLfo1/2 × wowD1/2) → lp(8k→1.8k) → shelf ─┐
//  [前景]       拨弦/纸页/铃/…（一次性源＋包络）→ fgBus → lp（同过磁带染色）                  ├→ master → dest
//  [L3 磨损]    crackleSrc(采样环｜fb 脉冲串) → crackleNorm → crackleLevel(bt.crackle) ─┐    │
//               hiss(噪声环) → hissHP(2.2k) → hissLP(7.5k) → hissNorm → hissLevel ──────┴→ wearBus(duck) ─┘
//               （SOUND-R2 §2 L3：hiss/crackle=介质噪声，出 S4 低通直达输出——"磁带变闷"不再滤走"磁带变糙"）
//
//  电平参数（规矩② stop/trim 遍历域）：l1/crackle/l2/s2/s3/hiss 六电平（+bedBus/wearBus duck）
//    - trim 在 core.bedTargets 内乘进每一个电平目标，applyBed 是电平唯一写者——绕闸支路无处出生。
//  调制口（规矩③ 唯一可接外接信号的参数）：l1Breath.gain（bias1）、wowDelay.delayTime（bias30ms）、
//    l2F.frequency / s3F.frequency（动低通，三关之二——双互质慢速自由 LFO，深度有界）。
//    其余 AudioParam 禁手——registry.connect 见参数即抛。
//  三关铁律（SOUND-R2 §2 L2，结构性执法）：有音高声部只能经 pitchedStack() 出生——
//    ①≥3 声部失谐堆叠 ②动低通≥2 互质 LFO ③轻饱和；直连裸振荡器上总线在本图无路径。
//  一次性源（规矩②之三）：前景与 S2 打点登记注册表，stopAll 当场枪毙。
//  资产（SOUND-R2 §2 L1）：CC0 采样见 sound/assets/（LICENSES.md 逐条溯源）；无资产时
//    fallback 合成织体（粉噪+脉冲串 crackle，repo-key 种子变奏）同构顶上——结构不因资产缺席而变。
// ─────────────────────────────────────────────────────────────────────────────

import { bedTargets, dbToLin, midiToHz, sampleAt, habituationGain, degreeHz as coreDegreeHz, askMotifHz, rootMidiOf } from './core.js';

// ---------- 确定性随机（渲染必须确定性：噪声一律种子化，禁 Math.random） ----------
export function seedOf(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h >>> 0;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 注册表（规矩①②③的执法机构；SOUND-R1 沿革 + shaper） ----------
export function createRegistry(ctx) {
  const nodes = new Map();
  const levels = [];
  const depths = [];
  const modPorts = new Set();
  const autoParams = [];
  const ephemerals = [];

  const reg = (name, node) => {
    if (nodes.has(name)) throw new Error(`注册表重名：${name}`);
    nodes.set(name, node);
    return node;
  };

  return {
    nodes,
    gain(name, value) { const g = reg(name, ctx.createGain()); g.gain.value = value; return g; },
    level(name, initial = 0) {
      const g = reg(name, ctx.createGain()); g.gain.value = initial;
      levels.push({ name, param: g.gain });
      return g;
    },
    modStage(name, node, param, bias) {
      reg(name, node); param.value = bias; modPorts.add(param);
      return node;
    },
    depth(name, max) {
      const g = reg(name, ctx.createGain()); g.gain.value = 0;
      depths.push({ name, param: g.gain, max });
      return g;
    },
    auto(param) { autoParams.push(param); return param; },
    filter(name, type, freq, q) {
      const f = reg(name, ctx.createBiquadFilter());
      f.type = type; f.frequency.value = freq; if (q !== undefined) f.Q.value = q;
      return f;
    },
    /** 轻饱和（三关之三）：tanh 曲线 WaveShaper。 */
    shaper(name, k = 2) {
      const s = reg(name, ctx.createWaveShaper());
      const N = 1024, c = new Float32Array(N);
      const den = Math.tanh(k);
      for (let i = 0; i < N; i++) { const x = (i / (N - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / den; }
      s.curve = c;
      return s;
    },
    delay(name, maxSec, sec) { const d = reg(name, ctx.createDelay(maxSec)); d.delayTime.value = sec; return d; },
    osc(name, type, freq) {
      const o = reg(name, ctx.createOscillator()); o.type = type; o.frequency.value = freq; o.start();
      return o;
    },
    noise(name, lenSec) {
      const rng = mulberry32(seedOf(name));
      const n = Math.ceil(ctx.sampleRate * lenSec);
      const b = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = rng() * 2 - 1;
      const s = reg(name, ctx.createBufferSource()); s.buffer = b; s.loop = true; s.start();
      return s;
    },
    /** 循环织体源（L1）：Float32Array（资产解出或 fallback 生成）→ 循环 BufferSource。 */
    textureLoop(name, data, dataSr, rate = 1) {
      const b = ctx.createBuffer(1, data.length, dataSr);
      b.getChannelData(0).set(data);
      const s = reg(name, ctx.createBufferSource());
      s.buffer = b; s.loop = true;
      if (rate !== 1) s.playbackRate.value = rate;
      s.start();
      return s;
    },
    connect(a, b) {
      if (!b || typeof b.connect !== 'function') {
        throw new Error('SOUND-R1 规矩③：直连 AudioParam 为禁手——外接调制走 modulate() 乘法级/调制口');
      }
      a.connect(b);
    },
    modulate(lfo, depthGain, port) {
      if (!depths.some((d) => d.param === depthGain.gain)) throw new Error('modulate：深度增益必须经 depth() 注册');
      if (!modPorts.has(port)) throw new Error('SOUND-R1 规矩③：该参数不是获准调制口');
      lfo.connect(depthGain);
      depthGain.connect(port);
    },
    ephemeral(src, stopAt) {
      ephemerals.push({ src, stopAt });
      if (ephemerals.length > 256) {
        const now = ctx.currentTime;
        for (let i = ephemerals.length - 1; i >= 0; i--) if (ephemerals[i].stopAt < now - 1) ephemerals.splice(i, 1);
      }
      return src;
    },
    setDepth(depthGain, v, at, tc, imm) {
      const d = depths.find((x) => x.param === depthGain.gain);
      const clamped = Math.min(Math.abs(v), d ? d.max : Math.abs(v));
      if (imm) { depthGain.gain.cancelScheduledValues(at); depthGain.gain.setValueAtTime(clamped, at); }
      else depthGain.gain.setTargetAtTime(clamped, at, tc);
    },
    stopAll(at) {
      for (const { param } of levels.concat(depths)) {
        param.cancelScheduledValues(at);
        param.setTargetAtTime(0, at, 0.05);
        param.setValueAtTime(0, at + 0.3); // EAR-3 硬闸自动化化
      }
      for (const p of autoParams) p.cancelScheduledValues(at);
      for (const e of ephemerals) { try { e.src.stop(at); } catch (_err) { /* 已停/未起 */ } }
      ephemerals.length = 0;
    },
    hardMute() {
      for (const { param } of levels.concat(depths)) { param.cancelScheduledValues(0); param.value = 0; }
    },
    debugGains() {
      const o = {};
      for (const { name, param } of levels) o[name] = param.value;
      return o; // 账本口径——仅接线自检，永不作发声证明（门规）
    },
  };
}

// ---------- 定标常数（金测试锁定；离线渲染实测冻结 @48k） ----------
export const CALIB = {
  l2Norm: 1.5141, // L2 和声垫正身（5 声部三关成品）→ 1.0 RMS（定标轮 R2 实测冻结 @48k）
  s3Norm: 1.6288, // S3 张力弦正身（5 声部三关成品过动低通）→ 1.0 RMS（同上）
  hissNorm: 2.519, // 白噪过 2.2k–7.5k 带限 → 1.0 RMS（R2 复校 @48k）
  fbBodyLen: 11.3, fbAirLen: 8.9, fbCrackleLen: 9.7, // fallback 织体环长（互不通约秒）
};

// ---------- 三关铁律构造器（SOUND-R2 §2 L2：有音高声部唯一的出生通道） ----------
// ①≥3 声部失谐堆叠（±3–10 音分）②动低通（≥2 互质慢速自由 LFO 推截止）③轻饱和。
function pitchedStack(R, ctx, name, spec) {
  if (spec.voices.length < 3) throw new Error(`三关铁律①：${name} 声部数 ${spec.voices.length} < 3`);
  if (spec.filterLfos.length < 2) throw new Error(`三关铁律②：${name} 动低通 LFO 数 < 2`);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.Q.value = spec.filterQ ?? 0.4;
  R.modStage(`${name}F`, filt, filt.frequency, spec.filterBase);
  const oscs = [];
  spec.voices.forEach((v, i) => {
    if (i > 0 && Math.abs(v.cents) < 3) throw new Error(`三关铁律①：${name} 声部${i} 失谐 ${v.cents} 音分 < ±3`);
    const o = R.osc(`${name}o${i}`, spec.type, v.hz * Math.pow(2, v.cents / 1200));
    const g = R.gain(`${name}o${i}g`, v.gain);
    R.connect(o, g); R.connect(g, filt);
    R.auto(o.frequency);
    oscs.push({ osc: o, cents: v.cents });
  });
  spec.filterLfos.forEach((l, i) => {
    const lfo = R.osc(`${name}Lfo${i}`, 'sine', l.rate);
    const d = R.depth(`${name}LfoD${i}`, spec.filterDepthMax ?? 600);
    d.gain.value = l.depth;
    R.modulate(lfo, d, filt.frequency);
  });
  const sat = R.shaper(`${name}Sat`, spec.satK ?? 2);
  R.connect(filt, sat);
  const info = {
    voices: spec.voices.length,
    detunesCents: spec.voices.map((v) => v.cents),
    filterLfos: spec.filterLfos.length,
    saturation: true,
  };
  return { out: sat, oscs, info };
}

// ---------- fallback 合成织体（无资产退路 + repo-key 变奏源） ----------
function pinkBuffer(ctx, name, lenSec, seedStr, hpHz = 0) {
  const rng = mulberry32(seedOf(seedStr));
  const n = Math.ceil(ctx.sampleRate * lenSec);
  const x = new Float32Array(n);
  let b0 = 0, b1 = 0, b2 = 0, hp = 0;
  const hpA = hpHz > 0 ? Math.exp(-2 * Math.PI * hpHz / ctx.sampleRate) : 0;
  for (let i = 0; i < n; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    let v = b0 + b1 + b2 + w * 0.1848;
    if (hpHz > 0) { hp = hpA * hp + (1 - hpA) * v; v -= hp; } // 一阶去低（气感织体）
    x[i] = v;
  }
  let e = 0; for (let i = 0; i < n; i++) e += x[i] * x[i];
  const g = 1 / Math.sqrt(e / n);
  for (let i = 0; i < n; i++) x[i] *= g; // 单位 RMS——与资产 rmsDb 定标同一口径
  return x;
}
function crackleBuffer(ctx, name, lenSec, seedStr, perSec = 32) {
  const rng = mulberry32(seedOf(seedStr));
  const n = Math.ceil(ctx.sampleRate * lenSec);
  const x = new Float32Array(n);
  const events = Math.floor(lenSec * perSec);
  for (let k = 0; k < events; k++) {
    const at = Math.floor(rng() * (n - 64));
    const amp = (rng() < 0.5 ? -1 : 1) * Math.pow(rng(), 1.6);
    const decay = 2 + Math.floor(rng() * 9);
    for (let j = 0; j < decay; j++) x[at + j] += amp * Math.exp(-j / (decay * 0.45));
  }
  // 一阶低通 6k 磨圆棱角（脉冲串不扎耳）
  const a = Math.exp(-2 * Math.PI * 6000 / ctx.sampleRate);
  let z = 0;
  for (let i = 0; i < n; i++) { z = a * z + (1 - a) * x[i]; x[i] = z; }
  let e = 0; for (let i = 0; i < n; i++) e += x[i] * x[i];
  const g = 1 / Math.sqrt(e / n);
  for (let i = 0; i < n; i++) x[i] *= g;
  return x;
}
/** repo-key 变奏：环起点旋转（织体相位人人不同）。 */
function rotated(data, frac) {
  const n = data.length, off = Math.floor(frac * n) % n;
  if (off === 0) return data;
  const out = new Float32Array(n);
  out.set(data.subarray(off)); out.set(data.subarray(0, off), n - off);
  return out;
}

// ---------- 引擎 ----------
export function buildEngine(ctx, SP, opts) {
  const R = createRegistry(ctx);
  const ROOT = rootMidiOf(opts.repoKey, SP);
  const burstRng = mulberry32(seedOf('fg-burst:' + (opts.seed || '')));
  const keyRng = mulberry32(seedOf('repovar:' + opts.repoKey));
  const assets = opts.assets || null;

  // S4 磁带总线（音乐路）：wow(调制延迟) → 低通 → 高频搁架 → master
  const master = R.gain('master', 0.9);
  const shelf = R.filter('shelf', 'highshelf', 4500);
  const lp = R.filter('lp', 'lowpass', SP.bed.filterHzHi, 0.4);
  const wowDelayNode = ctx.createDelay(0.1);
  R.modStage('wowDelay', wowDelayNode, wowDelayNode.delayTime, 0.03);
  const wowLfo1 = R.osc('wowLfo1', 'sine', 0.9);
  const wowLfo2 = R.osc('wowLfo2', 'sine', 1.31);
  const wowD1 = R.depth('wowD1', 0.002);
  const wowD2 = R.depth('wowD2', 0.002);
  R.modulate(wowLfo1, wowD1, wowDelayNode.delayTime);
  R.modulate(wowLfo2, wowD2, wowDelayNode.delayTime);

  const bedBus = R.gain('bedBus', 1); R.auto(bedBus.gain);
  const wearBus = R.gain('wearBus', 1); R.auto(wearBus.gain); // L3 介质噪声路（出低通，直达 master）
  const fgBus = R.gain('fgBus', 1);
  R.connect(bedBus, wowDelayNode); R.connect(wowDelayNode, lp);
  R.connect(fgBus, lp);
  R.connect(lp, shelf); R.connect(shelf, master);
  R.connect(wearBus, master);
  R.connect(master, ctx.destination);

  // ---- L1 织体体：真采样为体，fallback 同构顶上 ----
  const l1Level = R.level('l1');
  const breathG = ctx.createGain();
  const l1Breath = R.modStage('l1Breath', breathG, breathG.gain, 1);
  const breathLfo1 = R.osc('breathLfo1', 'sine', 1 / 7.3);
  const breathLfo2 = R.osc('breathLfo2', 'sine', 1 / 11.9);
  const bD1 = R.depth('bD1', 0.2); const bD2 = R.depth('bD2', 0.2);
  R.modulate(breathLfo1, bD1, breathG.gain);
  R.modulate(breathLfo2, bD2, breathG.gain);
  bD1.gain.value = SP.bed.breathDepth * 0.6;
  bD2.gain.value = SP.bed.breathDepth * 0.4;
  const l1Sum = R.gain('l1Sum', 1);
  const rate = 1 + (keyRng() - 0.5) * 0.02; // repo-key 变奏：±1% 重放率（每仓一间房的色温）
  const bodyClip = assets && assets['l1-roomtone'];
  const airClip = assets && assets['l1-filmstatic'];
  const air = Math.min(Math.max(SP.bed.l1AirRatio, 0), 1);
  // 配比按能量归一（不相关源功率和）：√(1−air)/√air——l1 电平数字=织体总 RMS（G3 记账口径）
  const wBody = Math.sqrt(1 - air), wAir = Math.sqrt(air);
  if (bodyClip) {
    const src = R.textureLoop('l1Body', rotated(bodyClip.x, keyRng()), bodyClip.sr, rate);
    const g = R.gain('l1BodyG', Math.pow(10, -bodyClip.rmsDb / 20) * wBody); // manifest rmsDb 定标→单位 RMS×配比
    R.connect(src, g); R.connect(g, l1Sum);
  } else {
    const src = R.textureLoop('l1Body', pinkBuffer(ctx, 'fbBody', CALIB.fbBodyLen, 'fb-body:' + opts.repoKey), ctx.sampleRate, rate);
    const g = R.gain('l1BodyG', wBody); // fallback 已单位 RMS
    R.connect(src, g); R.connect(g, l1Sum);
  }
  if (airClip) {
    const src = R.textureLoop('l1Air', rotated(airClip.x, keyRng()), airClip.sr, rate * 1.003);
    const g = R.gain('l1AirG', Math.pow(10, -airClip.rmsDb / 20) * wAir);
    R.connect(src, g); R.connect(g, l1Sum);
  } else {
    const src = R.textureLoop('l1Air', pinkBuffer(ctx, 'fbAir', CALIB.fbAirLen, 'fb-air:' + opts.repoKey, 300), ctx.sampleRate, rate * 1.003);
    const g = R.gain('l1AirG', wAir);
    R.connect(src, g); R.connect(g, l1Sum);
  }
  R.connect(l1Sum, breathG); R.connect(breathG, l1Level); R.connect(l1Level, bedBus);

  // ---- L3 磨损：crackle + hiss，出低通直达输出 ----
  const crackleLevel = R.level('crackle');
  const crackleClip = assets && assets['l1-crackle'];
  if (crackleClip) {
    const src = R.textureLoop('crackleSrc', rotated(crackleClip.x, keyRng()), crackleClip.sr, rate);
    const g = R.gain('crackleNorm', Math.pow(10, -crackleClip.rmsDb / 20));
    R.connect(src, g); R.connect(g, crackleLevel);
  } else {
    const src = R.textureLoop('crackleSrc', crackleBuffer(ctx, 'fbCrackle', CALIB.fbCrackleLen, 'fb-crackle:' + opts.repoKey), ctx.sampleRate, rate);
    const g = R.gain('crackleNorm', 1);
    R.connect(src, g); R.connect(g, crackleLevel);
  }
  R.connect(crackleLevel, wearBus);
  const hissLevel = R.level('hiss');
  const hissNorm = R.gain('hissNorm', CALIB.hissNorm);
  const hiss = R.noise('hissNoise', 2);
  const hf = R.filter('hissHP', 'highpass', 2200, 0.5);
  const hlp = R.filter('hissLP', 'lowpass', 7500, 0.4);
  R.connect(hiss, hf); R.connect(hf, hlp); R.connect(hlp, hissNorm); R.connect(hissNorm, hissLevel);
  R.connect(hissLevel, wearBus);

  // ---- L2 和声垫（三关铁律） ----
  const l2Level = R.level('l2');
  const l2Norm = R.gain('l2Norm', CALIB.l2Norm);
  const l2 = pitchedStack(R, ctx, 'l2', {
    type: 'triangle',
    voices: [
      { hz: midiToHz(ROOT), cents: 0, gain: 0.5 },
      { hz: midiToHz(ROOT), cents: +5.5, gain: 0.5 },
      { hz: midiToHz(ROOT + 7), cents: -4, gain: 0.42 },
      { hz: midiToHz(ROOT + 12), cents: +7, gain: 0.28 },
      { hz: midiToHz(ROOT + 12), cents: -3.5, gain: 0.28 },
    ],
    filterBase: 1100, filterQ: 0.4,
    filterLfos: [{ rate: 1 / 59, depth: 320 }, { rate: 1 / 137, depth: 190 }],
    filterDepthMax: 600, satK: 1.8,
  });
  R.connect(l2.out, l2Norm); R.connect(l2Norm, l2Level); R.connect(l2Level, bedBus);

  // ---- S3 张力弦（过三关升级；hover 属和声延音沿革） ----
  const s3Level = R.level('s3');
  const s3NormG = R.gain('s3NormG', CALIB.s3Norm);
  const s3 = pitchedStack(R, ctx, 's3', {
    type: 'triangle',
    voices: [
      { hz: midiToHz(ROOT), cents: +4.5, gain: 0.6 },   // v1（hover→ROOT+7）
      { hz: midiToHz(ROOT + 7), cents: -4, gain: 0.42 }, // v2（hover→ROOT+14；悬挂音选声）
      { hz: midiToHz(ROOT + 12), cents: -6, gain: 0.3 },
      { hz: midiToHz(ROOT), cents: -3.2, gain: 0.2 },
      { hz: midiToHz(ROOT), cents: +9, gain: 0.08 },
    ],
    filterBase: 900, filterQ: 0.3,
    filterLfos: [{ rate: 1 / 53, depth: 180 }, { rate: 1 / 97, depth: 110 }],
    filterDepthMax: 500, satK: 1.6,
  });
  R.connect(s3.out, s3NormG); R.connect(s3NormG, s3Level); R.connect(s3Level, bedBus);
  const v1 = s3.oscs[0].osc, v2 = s3.oscs[1].osc;
  const v1Cents = s3.oscs[0].cents, v2Cents = s3.oscs[1].cents;

  // ---- S2 律动电平（打点由调度器造一次性源） ----
  const s2Level = R.level('s2');
  R.connect(s2Level, bedBus);
  R.auto(lp.frequency); R.auto(shelf.gain);

  // ---- 引擎状态 ----
  const E = {
    ctx, SP, R, ROOT,
    nodes: { master, shelf, lp, wowDelay: wowDelayNode, bedBus, wearBus, fgBus, l1Level, crackleLevel, l2Level, s2Level, s3Level, hissLevel, l1Breath },
    transport: null,
    lastGridAt: 0, lastBarAt: 0, lastAskRepeat: -1e9, doneSilentUntil: -1, wxLatch: 0,
    habLog: new Map(),
    mutes: new Set(), // 隔离板：'l1'|'crackle'|'l2'|'s2'|'s3'|'hiss'|'fg'
  };

  const beat = () => 60 / SP.bpm, grid = () => beat() / 2, bar = () => beat() * 4;

  // ---- 床参数施加（slew；imm=起播首拍立即就位，EAR-2 沿革） ----
  function applyBed(bt, at, imm) {
    const fast = SP.bed.slewMsFast / 1000, slow = SP.bed.slewMsSlow / 1000;
    const set = (param, v, tc) => {
      if (imm) { param.cancelScheduledValues(at); param.setValueAtTime(v, at); }
      else param.setTargetAtTime(v, at, tc);
    };
    const mg = (n) => (E.mutes.has(n) ? 0 : 1);
    set(l1Level.gain, bt.l1 * mg('l1'), slow);
    set(crackleLevel.gain, bt.crackle * mg('crackle'), slow);
    set(l2Level.gain, bt.l2 * mg('l2'), slow);
    set(s2Level.gain, bt.s2 * mg('s2'), fast);
    set(s3Level.gain, bt.s3 * mg('s3'), fast);
    set(hissLevel.gain, bt.hissLin * mg('hiss'), slow);
    set(lp.frequency, bt.filterHz, slow);
    set(shelf.gain, bt.hfShelfDb, slow);
    const wowAmt = 0.03 * (Math.pow(2, bt.wowCents / 1200) - 1);
    R.setDepth(wowD1, wowAmt * 0.7, at, slow, imm);
    R.setDepth(wowD2, wowAmt * 0.4, at, slow, imm);
    R.setDepth(bD1, SP.bed.breathDepth * 0.6, at, slow, imm);
    R.setDepth(bD2, SP.bed.breathDepth * 0.4, at, slow, imm);
    // WAITING 悬停：属方向延音（半终止）；声部失谐随行（三关①不因 hover 失效）
    const f1 = midiToHz(bt.hover ? ROOT + 7 : ROOT) * Math.pow(2, v1Cents / 1200);
    const f2 = midiToHz(bt.hover ? ROOT + 14 : ROOT + 7) * Math.pow(2, v2Cents / 1200);
    set(v1.frequency, f1, fast); set(v2.frequency, f2, fast);
  }

  // ---- 前景合成（SOUND-R1 沿革，未动） ----
  function envG(at, peak, att, dec) {
    const g = ctx.createGain(); g.connect(fgBus);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0012), at + att);
    g.gain.exponentialRampToValueAtTime(0.0001, at + att + dec);
    return g;
  }
  function oneOsc(type, freq, at, stopAt) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    o.start(at); o.stop(stopAt); R.ephemeral(o, stopAt); return o;
  }
  function noiseBurst(at, len) {
    const n = Math.ceil(ctx.sampleRate * len), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (burstRng() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b; s.start(at); R.ephemeral(s, at + len + 0.05); return s;
  }
  function pluck(at, deg, vel, fail, hab) {
    const o = oneOsc('triangle', coreDegreeHz(ROOT, deg, fail ? 0 : 2, SP), at, at + 0.4);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = fail ? 700 : (900 + 3600 * vel);
    const peak = (fail ? SP.foreground.failGain : SP.foreground.peakGain * (0.55 + 0.45 * vel)) * hab;
    o.connect(f); f.connect(envG(at, peak, 0.006, fail ? 0.22 : 0.16));
  }
  function page(at, hab) {
    const n = noiseBurst(at, 0.07);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 0.8;
    n.connect(f); f.connect(envG(at, SP.foreground.pageGain * hab, 0.01, 0.06));
  }
  function bell(at, vel, hab) {
    [1240, 1860].forEach((fr, i) => {
      oneOsc('sine', fr, at, at + 0.4).connect(envG(at, SP.foreground.bellGain * (0.6 + 0.4 * vel) * hab * (i ? 0.5 : 1), 0.004, 0.35));
    });
  }
  function saveClick(at, hab) {
    noiseBurst(at, 0.02).connect(envG(at, SP.foreground.saveGain * hab, 0.002, 0.03));
    oneOsc('sine', midiToHz(ROOT - 12), at, at + 0.35).connect(envG(at, SP.foreground.saveGain * 0.8 * hab, 0.01, 0.3));
  }
  function spawnVoice(at, deg, hab) {
    const o = oneOsc('sine', coreDegreeHz(ROOT, deg, 1, SP), at, at + bar() * 2 + 0.1);
    const g = ctx.createGain(); g.connect(fgBus); g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(SP.foreground.spawnGain * hab, at + bar());
    g.gain.linearRampToValueAtTime(0.0001, at + bar() * 2);
    o.connect(g);
  }
  function duck(at) {
    for (const bus of [bedBus, wearBus]) {
      bus.gain.cancelScheduledValues(at);
      bus.gain.setTargetAtTime(0.55, at - 0.12 < ctx.currentTime ? at : at - 0.12, 0.03);
      bus.gain.setTargetAtTime(1.0, at + 0.25, 0.2);
    }
  }
  function chordResolve(at) {
    duck(at); const g = SP.call.gain;
    [[0, 0], [4, 0.015], [7, 0.03]].forEach(([semi, dt]) => {
      oneOsc('sine', midiToHz(ROOT + semi + 12), at + dt, at + dt + 1).connect(envG(at + dt, g * 0.5, 0.02, 0.9));
    });
    const t5 = Math.max(ctx.currentTime, at - 0.18);
    oneOsc('sine', midiToHz(ROOT + 7), t5, at + 0.2).connect(envG(t5, g * 0.25, 0.01, 0.15));
  }
  function skip(at) {
    duck(at); const n = noiseBurst(at, 0.08);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1600;
    n.connect(f); f.connect(envG(at, SP.call.gain, 0.003, 0.09));
  }
  function askMotif(at) {
    duck(at); const hz = askMotifHz(ROOT, SP);
    [[hz, 0, 0.28], [hz * 9 / 8, 0.22, 0.6]].forEach(([fr, dt, len]) => {
      oneOsc('sine', fr, at + dt, at + dt + len + 0.1).connect(envG(at + dt, SP.call.gain * 0.7, 0.02, len));
    });
  }
  function doneCadence(at) {
    oneOsc('sine', midiToHz(ROOT + 7), at, at + 0.4).connect(envG(at, 0.2, 0.02, 0.3));
    oneOsc('sine', midiToHz(ROOT), at + 0.35, at + 1.3).connect(envG(at + 0.35, 0.24, 0.02, 0.8));
    E.doneSilentUntil = at + 0.35 + SP.bed.doneSilenceSec;
  }

  function habFor(cls, at) {
    if (cls >= 6) return 1;
    const w = SP.foreground.habituationWindowSec;
    const arr = (E.habLog.get(cls) || []).filter((t) => at - t <= w);
    arr.push(at); E.habLog.set(cls, arr);
    return habituationGain(arr.length, SP);
  }

  // ---- transport 与调度（probe 页与机器耳朵共用的唯一调度体；SOUND-R1 沿革） ----
  function startTransport(audio0, speed, track, durMs) {
    E.transport = { audio0, speed, track, durMs };
    E.lastGridAt = audio0; E.lastBarAt = audio0; E.lastAskRepeat = -1e9;
    E.doneSilentUntil = -1; E.wxLatch = 0; E.habLog.clear();
    for (const bus of [bedBus, wearBus]) {
      bus.gain.cancelScheduledValues(ctx.currentTime);
      bus.gain.setValueAtTime(1, ctx.currentTime);
    }
    const s0 = track.length ? sampleAt(track, 0) : [0, 0, 0, 0, 0, 0, 0, 0];
    applyBed(bedTargets(stateOf(s0), SP), ctx.currentTime, true);
  }
  const stateOf = (s) => ({ T: s[2], A: s[3], wow: s[6], phase: ['IDLE', 'WORKING', 'WAITING', 'DONE'][s[5]] || 'WORKING', weather: 'CLEAR', pendingAsk: s[7] === 1 });

  function scheduleGridUntil(untilSec) {
    const { audio0, speed, track, durMs } = E.transport;
    while (E.lastGridAt <= untilSec) {
      const at = E.lastGridAt, gpm = (at - audio0) * 1000 * speed;
      const s = sampleAt(track, Math.min(gpm, durMs));
      const bt = bedTargets(stateOf(s), SP);
      if (at > E.doneSilentUntil) applyBed(bt, at, false);
      if (at >= E.lastBarAt + bar() - 1e-6) {
        E.lastBarAt = at; E.wxLatch = s[4];
        if (!bt.hover) {
          const bi = Math.round((at - audio0) / bar());
          const sus = (Math.abs(Math.sin(bi * 311.7)) % 1) < bt.susProb;
          v2.frequency.setTargetAtTime(midiToHz(ROOT + (sus ? 5 : 7)) * Math.pow(2, v2Cents / 1200), at, SP.bed.slewMsSlow / 1000);
        }
      }
      if (bt.s2 > 0 && at > E.doneSilentUntil) {
        const gi = Math.round((at - audio0) / grid());
        const strong = (gi % 4 === 0), r = Math.abs(Math.sin(gi * 127.1)) % 1;
        if (r < bt.density * (strong ? 0.9 : 0.35)) {
          if (strong) {
            const k = ctx.createOscillator(); k.frequency.setValueAtTime(85, at);
            k.frequency.exponentialRampToValueAtTime(42, at + 0.09);
            const kg = ctx.createGain(); kg.connect(s2Level);
            kg.gain.setValueAtTime(0.7, at); kg.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
            k.connect(kg); k.start(at); k.stop(at + 0.2); R.ephemeral(k, at + 0.2);
          } else {
            const h = noiseBurst(at, 0.03);
            const hf2 = ctx.createBiquadFilter(); hf2.type = 'highpass'; hf2.frequency.value = 6500;
            const hg = ctx.createGain(); hg.connect(s2Level);
            hg.gain.setValueAtTime(0.25, at); hg.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
            h.connect(hf2); hf2.connect(hg);
          }
        }
      }
      if (s[7] === 1 && (at - E.lastAskRepeat) >= SP.call.askRepeatSec) {
        E.lastAskRepeat = at;
        if (at > audio0 + 1 && !E.mutes.has('fg')) askMotif(at);
      }
      E.lastGridAt += grid();
    }
  }

  function trigger(cls, atE, deg, vel) {
    if (E.mutes.has('fg')) return;
    const hab = habFor(cls, atE);
    if (cls === 6) chordResolve(atE);
    else if (cls === 7) skip(atE);
    else if (cls === 8) { E.lastAskRepeat = atE; askMotif(atE); }
    else if (cls === 9) doneCadence(atE);
    else {
      const { audio0 } = E.transport;
      const g = grid();
      const q = audio0 + Math.ceil((atE - audio0) / g - 1e-9) * g;
      if (cls === 0) pluck(q, deg, vel, false, hab);
      else if (cls === 1) pluck(q, deg, vel, true, hab);
      else if (cls === 2) page(q, hab);
      else if (cls === 3) bell(q, vel, hab);
      else if (cls === 4) saveClick(q, hab);
      else if (cls === 5) spawnVoice(q, deg, hab);
    }
  }

  function applyBedNow(pm) {
    const s = sampleAt(E.transport.track, Math.min(pm, E.transport.durMs));
    applyBed(bedTargets(stateOf(s), SP), ctx.currentTime, true);
  }

  return {
    ctx, SP, ROOT, nodes: E.nodes,
    registry: R,
    assetsUsed: { body: !!bodyClip, air: !!airClip, crackle: !!crackleClip },
    stackInfo: { l2: l2.info, s3: s3.info }, // 三关铁律自述（金测试断言口）
    get transport() { return E.transport; },
    get lastGridAt() { return E.lastGridAt; },
    get doneSilentUntil() { return E.doneSilentUntil; },
    applyBed, startTransport, scheduleGridUntil, trigger, applyBedNow,
    setMute(name, on) { if (on) E.mutes.add(name); else E.mutes.delete(name); },
    stop(at) {
      R.stopAll(at);
      bedBus.gain.setTargetAtTime(1, at, 0.05);
      wearBus.gain.setTargetAtTime(1, at, 0.05);
    },
    hardMute() { R.hardMute(); },
    muteMaster(at) { master.gain.setTargetAtTime(0, at, 0.05); },
    unmuteMaster(at) { master.gain.cancelScheduledValues(at); master.gain.setTargetAtTime(0.9, at, 0.05); },
    debugGains() { return R.debugGains(); },
  };
}
