// 声音相音频图引擎（SOUND-R1 §2 重构执照）。自 cli/probe.ts 生成页析出——probe 从此是薄壳，
// 浏览器（probe 页内嵌本文件真源）与离线机器耳朵（sound/offline.ts + cli ear）跑**同一份图代码**。
// 依赖 core.js（纯映射律）；页内嵌时两文件按行拼接（剥 import/export），Node 侧正常 ESM。
//
// ── 音频图全览（规矩①：拓扑注释即图纸，改图必改此注释）──────────────────────────
//
//  [S1 基底]  o1(tri ROOT) ─ o1g(0.8) ─┐
//             o2(tri ROOT+12 ×1.002) ─ o2g(0.5) ─┴→ padF(LP1200) → s1Norm(定标)
//               → s1Breath(乘法级 bias=1 ±breathDepth ← breathLfo1/2 × bD1/2)   ← 方案 B
//               → s1Level(电平 bt.s1) ─────────────────────────┐
//  [房间感]   room(噪声环) → roomF(LP400) → roomLevel(电平) ────┤
//  [S2 律动]  kick/hat（一次性源，调度器打点）→ s2Level(电平 bt.s2) ─┤
//  [S3 张力]  v1/v2/vHi(tri)+vSaw(saw×0.08) → s3F(LP900) → s3Norm(定标) → s3Level(电平 bt.s3) ─┤
//  [S4 hiss]  hiss(噪声环) → hissHP(2.2k) → hissLP(7.5k) → hissNorm(定标) → hissLevel(电平) ─┤
//                                                                          ├→ bedBus(呼唤 duck 1→0.55)
//  [前景]     拨弦/纸页/铃/卡座/声部/和弦/跳针/ASK（一次性源＋包络）→ fgBus ──┐
//             bedBus → wowDelay(30ms, 调制口 ← wowLfo1/2 × wowD1/2) → lp(LP 8k→1.8k)
//             fgBus ────────────────────────────────────────────────→ lp
//             lp → shelf(高频搁架 0→−6dB) → master(0.9) → destination
//
//  电平参数（规矩② stop/trim 的遍历域）：s1Level / roomLevel / s2Level / s3Level / hissLevel（+bedBus duck）
//    - trim 不是独立旋钮通路：它在 core.bedTargets 内乘进**每一个**电平目标，applyBed 是电平的唯一写者，
//      故"绕过总闸"的支路在结构上不存在（EAR-2 房间噪绕闸一类 bug 的结构性灭绝）。
//  调制口（规矩③ 唯一可接外接信号的参数）：s1Breath.gain（bias 1）、wowDelay.delayTime（bias 30ms）
//    - 一切其它 AudioParam 为禁手——registry.connect 见参数即抛。呼吸在数学上是正身的百分比，
//      不可能反相、不可能压过正身（EAR-4 根因的结构性灭绝）。
//  一次性源（规矩②之三）：前景与 S2 打点全部登记，stopAll 当场枪毙——僵尸从结构上灭绝。
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

// ---------- 注册表（规矩①②③的执法机构） ----------
export function createRegistry(ctx) {
  const nodes = new Map();          // name → node（全图节点必经此处出生）
  const levels = [];                // {name, param}：电平参数——stop 遍历域；trim 经 bedTargets 乘入
  const depths = [];                // {name, param, max}：调制深度增益——stop 一并归零
  const modPorts = new Set();       // 获准接收外接信号的 AudioParam（乘法级/调制口）
  const autoParams = [];            // 其它内部自动化参数（stop 时撤单，不归零）
  const ephemerals = [];            // {src, stopAt}：一次性源——stopAll 当场枪毙

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
    /** 乘法级/调制口：唯一可被外接信号驱动的参数。bias 即静息值；深度由 depth 增益给。 */
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
    /** 节点→节点连线。见 AudioParam 即抛：外接调制一律走 modulate()（规矩③）。 */
    connect(a, b) {
      if (!b || typeof b.connect !== 'function') {
        throw new Error('SOUND-R1 规矩③：直连 AudioParam 为禁手——外接调制走 modulate() 乘法级/调制口');
      }
      a.connect(b);
    },
    /** 外接调制的唯一通路：LFO →（深度增益）→ 获准调制口。 */
    modulate(lfo, depthGain, port) {
      if (!depths.some((d) => d.param === depthGain.gain)) throw new Error('modulate：深度增益必须经 depth() 注册');
      if (!modPorts.has(port)) throw new Error('SOUND-R1 规矩③：该参数不是获准调制口');
      lfo.connect(depthGain);
      depthGain.connect(port);
    },
    ephemeral(src, stopAt) {
      ephemerals.push({ src, stopAt });
      // 有界清扫：过期条目顺手驱逐（长会话不积尸）
      if (ephemerals.length > 256) {
        const now = ctx.currentTime;
        for (let i = ephemerals.length - 1; i >= 0; i--) if (ephemerals[i].stopAt < now - 1) ephemerals.splice(i, 1);
      }
      return src;
    },
    /** 深度参数设值（applyBed 用）：夹上限——调制在结构上有界。 */
    setDepth(depthGain, v, at, tc, imm) {
      const d = depths.find((x) => x.param === depthGain.gain);
      const clamped = Math.min(Math.abs(v), d ? d.max : Math.abs(v));
      if (imm) { depthGain.gain.cancelScheduledValues(at); depthGain.gain.setValueAtTime(clamped, at); }
      else depthGain.gain.setTargetAtTime(clamped, at, tc);
    },
    /** 规矩②：停止 = 遍历注册表——电平与深度全体撤单→快速归零→+300ms 自动化硬闸；一次性源当场枪毙。 */
    stopAll(at) {
      for (const { param } of levels.concat(depths)) {
        param.cancelScheduledValues(at);
        param.setTargetAtTime(0, at, 0.05);
        param.setValueAtTime(0, at + 0.3); // EAR-3 硬闸自动化化：离线可渲染、在线不与"钉住"的引擎辩经
      }
      for (const p of autoParams) p.cancelScheduledValues(at);
      for (const e of ephemerals) { try { e.src.stop(at); } catch (_err) { /* 已停或未起：一次性源的正常余生 */ } }
      ephemerals.length = 0;
    },
    /** 浏览器兜底硬闸（probe 壳 300ms 后调；EAR-3 实测个别引擎钉参数）：直接置 .value=0。 */
    hardMute() {
      for (const { param } of levels.concat(depths)) { param.cancelScheduledValues(0); param.value = 0; }
    },
    debugGains() {
      const o = {};
      for (const { name, param } of levels) o[name] = param.value;
      return o; // 账本口径（.value 不含外接信号）——仅 dev 展示，永不作验收依据（EAR-4 教训）
    },
  };
}

// ---------- 定标常数（金测试逐 stem 锁定；由离线渲染器实测冻结，见 FEEDBACK-SOUND） ----------
// 语义：各 stem 正身（电平前）归一到单位 RMS——bedTargets 给的电平数字即渲染 RMS（G3 的地基）。
export const CALIB = {
  s1Norm: 1.8132,   // pad 正身（0.8tri+0.5tri 过 LP1200）→ 1.0 RMS（离线实测冻结 @48k，定标轮 SOUND-R1）
  s3Norm: 2.1649,   // 弦正身（0.6+0.42+0.3 tri + 0.08 saw 过 LP900）→ 1.0 RMS（同上）
  hissNorm: 2.4198, // 白噪过 2.2k–7.5k 带限 → 1.0 RMS（@48k；带内能量随采样率变，见 FEEDBACK）
  roomBase: 0.002, roomWx: 0.0015, // 房间感基值/天气增量（沿革 EAR-2 原值；氛围件，≈−78dB，模型不入账）
  v1Detune: 1.0015, // S3 主声部微失谐（2.6 音分）：o1(S1) 与 v1(S3) 曾完全同频同相——相干叠加破坏
                    // "不相关源"设计假设（bedBus 比功率和热 +2.1dB，且是床"搏动感"的一味）。0.3Hz 慢拍在磁带口味内
};

// ---------- 引擎 ----------
export function buildEngine(ctx, SP, opts) {
  const R = createRegistry(ctx);
  const ROOT = rootMidiOf(opts.repoKey, SP);
  const burstRng = mulberry32(seedOf('fg-burst:' + (opts.seed || ''))); // 前景噪声爆（确定性流）

  // S4 磁带总线：wow(调制延迟) → 低通 → 高频搁架 → 总闸 → 出
  const master = R.gain('master', 0.9);
  const shelf = R.filter('shelf', 'highshelf', 4500);
  const lp = R.filter('lp', 'lowpass', SP.bed.filterHzHi, 0.4);
  const wowDelayNode = ctx.createDelay(0.1);
  R.modStage('wowDelay', wowDelayNode, wowDelayNode.delayTime, 0.03);
  const wowLfo1 = R.osc('wowLfo1', 'sine', 0.9);   // 互质双 LFO：走带不稳不精确重复
  const wowLfo2 = R.osc('wowLfo2', 'sine', 1.31);
  const wowD1 = R.depth('wowD1', 0.002);           // EAR-2 教训固化：深度从 0 起、有硬上限
  const wowD2 = R.depth('wowD2', 0.002);
  R.modulate(wowLfo1, wowD1, wowDelayNode.delayTime);
  R.modulate(wowLfo2, wowD2, wowDelayNode.delayTime);

  const bedBus = R.gain('bedBus', 1); R.auto(bedBus.gain); // duck 自动化（内部）
  const fgBus = R.gain('fgBus', 1);
  R.connect(bedBus, wowDelayNode); R.connect(wowDelayNode, lp);
  R.connect(fgBus, lp);            // 前景同过磁带总线（同一台机器出的声）
  R.connect(lp, shelf); R.connect(shelf, master); R.connect(master, ctx.destination);

  // S1 基底：暖 pad（EAR-3 移调：主能量 ROOT/ROOT+12 ≈ 110–420Hz，笔记本可闻域）
  const s1Level = R.level('s1');
  const s1Norm = R.gain('s1Norm', CALIB.s1Norm);
  // 方案 B 呼吸乘法级：正身 × (1 ± breathDepth)。LFO 只碰这一级的 bias=1 参数，永不碰电平。
  const breathG = ctx.createGain();
  const s1Breath = R.modStage('s1Breath', breathG, breathG.gain, 1);
  const breathLfo1 = R.osc('breathLfo1', 'sine', 1 / 7.3);   // Eno 互质保留
  const breathLfo2 = R.osc('breathLfo2', 'sine', 1 / 11.9);
  const bD1 = R.depth('bD1', 0.2); const bD2 = R.depth('bD2', 0.2); // 上限=可调域顶 0.20
  R.modulate(breathLfo1, bD1, breathG.gain);
  R.modulate(breathLfo2, bD2, breathG.gain);
  bD1.gain.value = SP.bed.breathDepth * 0.6; // 双肺分深，和 ≤ breathDepth
  bD2.gain.value = SP.bed.breathDepth * 0.4;
  const padF = R.filter('padF', 'lowpass', 1200);
  const o1 = R.osc('s1o1', 'triangle', midiToHz(ROOT));
  const o2 = R.osc('s1o2', 'triangle', midiToHz(ROOT + 12) * 1.002);
  const o1g = R.gain('s1o1g', 0.8), o2g = R.gain('s1o2g', 0.5);
  R.connect(o1, o1g); R.connect(o1g, padF);
  R.connect(o2, o2g); R.connect(o2g, padF);
  R.connect(padF, s1Norm); R.connect(s1Norm, breathG); R.connect(breathG, s1Level); R.connect(s1Level, bedBus);

  // 房间感（EAR-2 归队：电平走 applyBed 统一路径——吃 trim、吃 DONE 静默）
  const roomLevel = R.level('room');
  const room = R.noise('roomNoise', 2);
  const roomF = R.filter('roomF', 'lowpass', 400);
  R.connect(room, roomF); R.connect(roomF, roomLevel); R.connect(roomLevel, bedBus);

  // S3 张力弦（EAR-1 triangle 主体压蜂鸣；EAR-3 高声部上笔记本可闻域）
  const s3Level = R.level('s3');
  const s3Norm = R.gain('s3Norm', CALIB.s3Norm);
  const s3F = R.filter('s3F', 'lowpass', 900, 0.3);
  const v1 = R.osc('s3v1', 'triangle', midiToHz(ROOT) * CALIB.v1Detune);
  const v2 = R.osc('s3v2', 'triangle', midiToHz(ROOT + 7));
  const vHi = R.osc('s3vHi', 'triangle', midiToHz(ROOT + 12) * 0.999);
  const vSaw = R.osc('s3vSaw', 'sawtooth', midiToHz(ROOT) * 0.999);
  const v1g = R.gain('s3v1g', 0.6), v2g = R.gain('s3v2g', 0.42), vHiG = R.gain('s3vHiG', 0.3), vSawG = R.gain('s3vSawG', 0.08);
  R.auto(v1.frequency); R.auto(v2.frequency); // 悬停/悬挂音自动化（内部）
  R.connect(v1, v1g); R.connect(v1g, s3F); R.connect(v2, v2g); R.connect(v2g, s3F);
  R.connect(vHi, vHiG); R.connect(vHiG, s3F); R.connect(vSaw, vSawG); R.connect(vSawG, s3F);
  R.connect(s3F, s3Norm); R.connect(s3Norm, s3Level); R.connect(s3Level, bedBus);

  // S4 hiss（EAR-1：带限 2.2k–7.5k 柔滚降的磁带底噪）
  const hissLevel = R.level('hiss');
  const hissNorm = R.gain('hissNorm', CALIB.hissNorm);
  const hiss = R.noise('hissNoise', 2);
  const hf = R.filter('hissHP', 'highpass', 2200, 0.5);
  const hlp = R.filter('hissLP', 'lowpass', 7500, 0.4);
  R.connect(hiss, hf); R.connect(hf, hlp); R.connect(hlp, hissNorm); R.connect(hissNorm, hissLevel); R.connect(hissLevel, bedBus);

  // S2 律动电平（打点由调度器造一次性源）
  const s2Level = R.level('s2');
  R.connect(s2Level, bedBus);
  R.auto(lp.frequency); R.auto(shelf.gain);

  // ---- 引擎状态 ----
  const E = {
    ctx, SP, R, ROOT,
    nodes: { master, shelf, lp, wowDelay: wowDelayNode, bedBus, fgBus, s1Level, s2Level, s3Level, hissLevel, roomLevel, s1Breath, v1, v2 },
    transport: null, // {audio0, speed, track, durMs}
    lastGridAt: 0, lastBarAt: 0, lastAskRepeat: -1e9, doneSilentUntil: -1, wxLatch: 0,
    habLog: new Map(),
    mutes: new Set(), // 隔离板（EAR-7 诊断）：'s1'|'s2'|'s3'|'hiss'|'room'|'fg'——凶手排查用，电平级归零
  };

  const beat = () => 60 / SP.bpm, grid = () => beat() / 2, bar = () => beat() * 4;

  // ---- 床参数施加（slew：setTargetAtTime；调用对齐 1/8 网格；imm=起播首拍立即就位，EAR-2） ----
  function applyBed(bt, at, imm) {
    const fast = SP.bed.slewMsFast / 1000, slow = SP.bed.slewMsSlow / 1000;
    const set = (param, v, tc) => {
      if (imm) { param.cancelScheduledValues(at); param.setValueAtTime(v, at); }
      else param.setTargetAtTime(v, at, tc);
    };
    const mg = (n) => (E.mutes.has(n) ? 0 : 1); // 隔离板（EAR-7）：被点名的层电平归零，其余律照旧
    set(s1Level.gain, bt.s1 * mg('s1'), slow);
    set(s2Level.gain, bt.s2 * mg('s2'), fast);
    set(s3Level.gain, bt.s3 * mg('s3'), fast);
    set(hissLevel.gain, bt.hissLin * mg('hiss'), slow);
    // 房间噪与 stem 同纪律（EAR-2）：吃 trim、吃 DONE 静默、随天气档微调
    const roomV = (CALIB.roomBase + CALIB.roomWx * E.wxLatch) * dbToLin(SP.bed.trimDb) * (bt.silence ? 0 : 1);
    set(roomLevel.gain, roomV * mg('room'), slow);
    set(lp.frequency, bt.filterHz, slow);
    set(shelf.gain, bt.hfShelfDb, slow);
    const wowAmt = 0.03 * (Math.pow(2, bt.wowCents / 1200) - 1);
    R.setDepth(wowD1, wowAmt * 0.7, at, slow, imm);
    R.setDepth(wowD2, wowAmt * 0.4, at, slow, imm);
    // 呼吸深度可被调音抽屉拧动：跟随 SP（乘法级结构不变，只动百分比）
    R.setDepth(bD1, SP.bed.breathDepth * 0.6, at, slow, imm);
    R.setDepth(bD2, SP.bed.breathDepth * 0.4, at, slow, imm);
    // WAITING 悬停：属方向延音（半终止；整张床替琥珀管呼吸）。v1 微失谐随行（stem 去相干）
    const f1 = (bt.hover ? midiToHz(ROOT + 7) : midiToHz(ROOT)) * CALIB.v1Detune,
      f2 = bt.hover ? midiToHz(ROOT + 14) : midiToHz(ROOT + 7);
    set(v1.frequency, f1, fast); set(v2.frequency, f2, fast);
  }

  // ---- 前景合成（力度/亮度 ∝ vel=当刻 T，F1；一次性源全部登记注册表） ----
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
  // 呼唤级（豁免习惯化；前置微静默 duck 床）
  function duck(at) {
    bedBus.gain.cancelScheduledValues(at);
    bedBus.gain.setTargetAtTime(0.55, at - 0.12 < ctx.currentTime ? at : at - 0.12, 0.03);
    bedBus.gain.setTargetAtTime(1.0, at + 0.25, 0.2);
  }
  function chordResolve(at) {
    duck(at); const g = SP.call.gain;
    [[0, 0], [4, 0.015], [7, 0.03]].forEach(([semi, dt]) => {
      oneOsc('sine', midiToHz(ROOT + semi + 12), at + dt, at + dt + 1).connect(envG(at + dt, g * 0.5, 0.02, 0.9));
    });
    const t5 = Math.max(ctx.currentTime, at - 0.18); // 正格：属→主的属残响
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
  function doneCadence(at) { // 正格终止 → 真静默 ≥4s（洗碗机时刻）
    oneOsc('sine', midiToHz(ROOT + 7), at, at + 0.4).connect(envG(at, 0.2, 0.02, 0.3));
    oneOsc('sine', midiToHz(ROOT), at + 0.35, at + 1.3).connect(envG(at + 0.35, 0.24, 0.02, 0.8));
    E.doneSilentUntil = at + 0.35 + SP.bed.doneSilenceSec;
  }

  // ---- 习惯化（滚动 60s 听者时间窗；呼唤/DONE 豁免） ----
  function habFor(cls, at) {
    if (cls >= 6) return 1;
    const w = SP.foreground.habituationWindowSec;
    const arr = (E.habLog.get(cls) || []).filter((t) => at - t <= w);
    arr.push(at); E.habLog.set(cls, arr);
    return habituationGain(arr.length, SP);
  }

  // ---- transport 与调度（probe 页与机器耳朵共用的唯一调度体） ----
  function startTransport(audio0, speed, track, durMs) {
    E.transport = { audio0, speed, track, durMs };
    E.lastGridAt = audio0; E.lastBarAt = audio0; E.lastAskRepeat = -1e9;
    E.doneSilentUntil = -1; E.wxLatch = 0; E.habLog.clear();
    bedBus.gain.cancelScheduledValues(ctx.currentTime);
    bedBus.gain.setValueAtTime(1, ctx.currentTime);
    // 起播首拍：床参数按 t=0 状态立即就位（EAR-2：不从残留/默认态滑过来）
    const s0 = track.length ? sampleAt(track, 0) : [0, 0, 0, 0, 0, 0, 0, 0];
    applyBed(bedTargets(stateOf(s0), SP), ctx.currentTime, true);
  }
  const stateOf = (s) => ({ T: s[2], A: s[3], wow: s[6], phase: ['IDLE', 'WORKING', 'WAITING', 'DONE'][s[5]] || 'WORKING', weather: 'CLEAR', pendingAsk: s[7] === 1 });

  /** 1/8 网格推进到 untilSec：床参数更新 + 小节边界(天气档/悬挂音) + S2 打点 + ASK 礼貌重复。 */
  function scheduleGridUntil(untilSec) {
    const { audio0, speed, track, durMs } = E.transport;
    while (E.lastGridAt <= untilSec) {
      const at = E.lastGridAt, gpm = (at - audio0) * 1000 * speed;
      const s = sampleAt(track, Math.min(gpm, durMs));
      const bt = bedTargets(stateOf(s), SP);
      if (at > E.doneSilentUntil) applyBed(bt, at, false); // DONE 静默期不复活
      // 小节边界：weather 档位切换（既有教义）+ 悬挂音选声（比例 ∝ T，确定性伪随机可复听）
      if (at >= E.lastBarAt + bar() - 1e-6) {
        E.lastBarAt = at; E.wxLatch = s[4];
        if (!bt.hover) {
          const bi = Math.round((at - audio0) / bar());
          const sus = (Math.abs(Math.sin(bi * 311.7)) % 1) < bt.susProb;
          v2.frequency.setTargetAtTime(midiToHz(ROOT + (sus ? 5 : 7)), at, SP.bed.slewMsSlow / 1000);
        }
      }
      // S2 boom-bap：概率 ∝ density，力度轻（一次性源→s2Level，登记注册表）
      if (bt.s2 > 0 && at > E.doneSilentUntil) {
        const gi = Math.round((at - audio0) / grid());
        const strong = (gi % 4 === 0), r = Math.abs(Math.sin(gi * 127.1)) % 1; // 确定性伪随机（可复听）
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
      // ASK 礼貌性重复（askRepeatSec 一次，音量不升级）；隔离板 fg 禁声一体生效
      if (s[7] === 1 && (at - E.lastAskRepeat) >= SP.call.askRepeatSec) {
        E.lastAskRepeat = at;
        if (at > audio0 + 1 && !E.mutes.has('fg')) askMotif(at);
      }
      E.lastGridAt += grid();
    }
  }

  /** 前景触发（cls 编码同 probe：0拨弦/1闷弦/2纸页/3铃/4卡座/5声部/6和弦/7跳针/8ASK/9DONE）。 */
  function trigger(cls, atE, deg, vel) {
    if (E.mutes.has('fg')) return; // 隔离板：前景（含呼唤）整层禁声
    const hab = habFor(cls, atE);
    if (cls === 6) chordResolve(atE);
    else if (cls === 7) skip(atE);
    else if (cls === 8) { E.lastAskRepeat = atE; askMotif(atE); }
    else if (cls === 9) doneCadence(atE);
    else {
      const { audio0 } = E.transport;
      const g = grid();
      const q = audio0 + Math.ceil((atE - audio0) / g - 1e-9) * g; // 量化宁迟勿早
      if (cls === 0) pluck(q, deg, vel, false, hab);
      else if (cls === 1) pluck(q, deg, vel, true, hab);
      else if (cls === 2) page(q, hab);
      else if (cls === 3) bell(q, vel, hab);
      else if (cls === 4) saveClick(q, hab);
      else if (cls === 5) spawnVoice(q, deg, hab);
    }
  }

  /** 立即按当前播放位重施床参数（调音抽屉拖动即时生效，EAR-3）。 */
  function applyBedNow(pm) {
    const s = sampleAt(E.transport.track, Math.min(pm, E.transport.durMs));
    applyBed(bedTargets(stateOf(s), SP), ctx.currentTime, true);
  }

  return {
    ctx, SP, ROOT, nodes: E.nodes,
    registry: R,
    // 活状态走 getter（禁展开快照：transport/lastGridAt 是会变的，快照会把薄壳读数冻在 build 时刻）
    get transport() { return E.transport; },
    get lastGridAt() { return E.lastGridAt; },
    get doneSilentUntil() { return E.doneSilentUntil; },
    applyBed, startTransport, scheduleGridUntil, trigger, applyBedNow,
    /** 隔离板（EAR-7 诊断）：层禁声。播放中由调用方随后 applyBedNow 立即生效。 */
    setMute(name, on) { if (on) E.mutes.add(name); else E.mutes.delete(name); },
    stop(at) { R.stopAll(at); bedBus.gain.setTargetAtTime(1, at, 0.05); },
    hardMute() { R.hardMute(); },
    muteMaster(at) { master.gain.setTargetAtTime(0, at, 0.05); },
    unmuteMaster(at) { master.gain.cancelScheduledValues(at); master.gain.setTargetAtTime(0.9, at, 0.05); },
    debugGains() { return R.debugGains(); },
  };
}
