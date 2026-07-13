// 声音相音频图引擎 v2（SOUND-R2 三层床重做；SOUND-R1 注册表机制沿革）。
// 浏览器（probe 页内嵌本文件真源）与离线机器耳朵（sound/offline.ts + cli ear）跑**同一份图代码**。
// 依赖 core.js（纯映射律）；页内嵌时按行拼接（剥 import/export），Node 侧正常 ESM。
//
// ── 音频图全览 v3（声资产批·床改判：旧织体床退役令——L1织体/L2和声垫/S2律动/S3张力弦/呼吸LFO 全族出殡）──
//
//  [床·哼]   motorHum＝pitchedStack 三关成品（低频暖嗡·四声部失谐+动低通+轻饱和）
//              → humNorm(定标) → humLevel(bt.hum) → wearBus ——机身直达·上电即在·不过 wow（马达是速度基准）
//  [床·嘶]   hiss(噪声环) → hissHP(2.2k) → hissLP(7.5k) → hissNorm → hissLevel(bt.hiss) → wearBus
//              ——带走门控·电平随速度幂律与 wow 微摆（噪声吃 pitch-wow 无意义·旧 L3"变闷不滤变糙"法理原样）
//  [L3 磨损] crackleSrc(采样环｜fb 脉冲串) → crackleNorm → crackleLevel(bt.crackle) → wearBus(duck) → master
//              （身份归唱片系统：随 T·underRecord 近隐——不随织体床退役）
//  [前景]     拨弦/纸页/铃/…（一次性源＋包络）→ fgBus → lp(8k→1.8k·T 染色) → shelf → master → dest
//  [唱片层]   recSrc → recLP → recG → master（SOUND-R3 原样：STUCK 换源/tape-stop/暂停续播）
//  （bedBus/wowDelay 调制链随织体床出殡——床三 stem 皆 wearBus 直达；wow 唯归唱片 playbackRate）
//
//  状态表（定稿§三·bedTargets 执法）：待机（手势前）＝全静（ctx 未生）｜POST 后无带走＝哼独存｜
//  带走＝哼＋嘶｜暂停抬带＝嘶止哼存。唱片在位床整体 under（混音宪法 P0-2 不动）。
//
// ─────────────────────────────────────────────────────────────────────────────

// import 禁用 as 别名（NIGHT-2 审计 probe-coreDegreeHz 案）：页壳内嵌=剥 import 行的逐字拼接，
// 别名在页内无定义——播放中 pluck 首触发即 ReferenceError，schedule setTimeout 链断（针走声死）。
// 契约测试（R3 §4.1）静态盯防 sound/*.js 的 import 别名。
import { bedTargets, recordTargets, dbToLin, midiToHz, sampleAt, habituationGain, degreeHz, askMotifHz, rootMidiOf } from './core.js';

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
    /** 匿名调制口（SOUND-R3 规矩③增补）：唱片源短命换代，其 playbackRate 逐个获准；不占名字表。 */
    modPort(param, bias) {
      if (bias !== undefined) param.value = bias;
      modPorts.add(param);
      return param;
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
  humNorm: 1.5156, // 马达低哼正身（三关成品）→ 1.0 RMS（床改判定标轮实测冻结 @48k·2026-07-13）
  hissNorm: 2.519, // 白噪过 2.2k–7.5k 带限 → 1.0 RMS（R2 复校 @48k）
  fbCrackleLen: 9.7, // fallback crackle 环长（旧织体环 body/air 已随退役令出殡）
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

// ---------- fallback 合成织体（crackle 无资产退路；旧 body/air 粉噪环已随织体床退役） ----------
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
  const wearBus = R.gain('wearBus', 1); R.auto(wearBus.gain); // 床三 stem 直达路（duck 让位口）
  const fgBus = R.gain('fgBus', 1);
  R.connect(fgBus, lp);
  R.connect(lp, shelf); R.connect(shelf, master);
  R.connect(wearBus, master);
  R.connect(master, ctx.destination);

  // ---- 床·哼：马达低哼（三关铁律出生·呼吸级地板·不过 wow——马达是基准不是介质） ----
  const humLevel = R.level('hum');
  const humNormG = R.gain('humNormG', CALIB.humNorm);
  const humRoot = 55 * Math.pow(2, (keyRng() - 0.5) * 0.06);   // 每仓一台电机（±3% 转速色温·种子化）
  const hum = pitchedStack(R, ctx, 'hum', {
    type: 'sine',
    voices: [
      { hz: humRoot, cents: 0, gain: 0.62 },          // 基频：电机极对转
      { hz: humRoot * 2, cents: +6, gain: 0.34 },     // 二次：铁芯磁致
      { hz: humRoot * 3, cents: -7, gain: 0.16 },     // 三次：机箱板共振
      { hz: humRoot * 4.02, cents: +4, gain: 0.07 },  // 高次残响（微失谐=真机不谐和）
    ],
    filterBase: 260, filterQ: 0.5,
    filterLfos: [{ rate: 1 / 8.7, depth: 40 }, { rate: 1 / 13.1, depth: 26 }],   // 负载微摆（互质慢速）
    filterDepthMax: 90, satK: 1.6,
  });
  R.connect(hum.out, humNormG); R.connect(humNormG, humLevel); R.connect(humLevel, wearBus);

  // ---- L3 磨损：crackle + hiss ----
  const rate = 1 + (keyRng() - 0.5) * 0.02; // repo-key 变奏：±1% 重放率（每仓一间房的色温·自 L1 块迁存）
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
  // 带内归一（M2.4 §A.2）：白噪总功率恒定而谱密度 ∝ 1/sr → 2.2–7.5k 带内 RMS ∝ 1/√sr，
  // 44.1k 比 48k 定标尺热 +0.37dB。×√(sr/48000) 归一到定标尺；48k 恒等 1（金测试/哈希零扰）。
  const hissNorm = R.gain('hissNorm', CALIB.hissNorm * Math.sqrt(ctx.sampleRate / 48000));
  const hiss = R.noise('hissNoise', 2);
  const hf = R.filter('hissHP', 'highpass', 2200, 0.5);
  const hlp = R.filter('hissLP', 'lowpass', 7500, 0.4);
  R.connect(hiss, hf); R.connect(hf, hlp); R.connect(hlp, hissNorm); R.connect(hissNorm, hissLevel);
  R.connect(hissLevel, wearBus);   // v3：嘶电平已随 wow 微摆（bedTargets）——pitch-wow 对噪声无意义，直达路原样

  // （L2 和声垫/S3 张力弦/S2 律动已随旧织体床退役令出殡——作曲层不再是床的一部分）
  R.auto(lp.frequency); R.auto(shelf.gain);

  // ---- 唱片层（SOUND-R3）：recSrc → recLP → recG → master ----
  const records = opts.records || []; // [{name,title,x:Float32Array,sr,lufs,bpmMeasured}]（PCM 已解码：页 decodeAudioData／ear afconvert）
  const recLP = R.filter('recLP', 'lowpass', SP.record.filterHzHi, 0.4);
  const recG = R.level('recG'); // levels 遍历域：stopAll/trim/hardMute 自动覆盖（G1/G2 含唱片路径的结构保证）
  R.connect(recLP, recG); R.connect(recG, master);
  const recWowLfo = R.osc('recWowLfo', 'sine', SP.record.wowRateHz);
  const recWowD = R.depth('recWowD', 0.03); // max≈50 音分的 rate 摆幅（2^(50/1200)−1）
  const stuckRng = mulberry32(seedOf('rec-stuck:' + (opts.seed || '') + ':' + opts.repoKey));

  // ---- 引擎状态 ----
  const E = {
    ctx, SP, R, ROOT,
    nodes: { master, shelf, lp, wearBus, fgBus, humLevel, crackleLevel, hissLevel, recLP, recG },
    onSound: null,   // 越级检测仪抽头（声资产批§二）：单声上线报 {name, klass, at}——检测先于上线的执法口
    bedBornAt: null, // POST 温柔苏醒：床（哼/嘶/crackle）压黑至此刻，届时随慢 slew 缓起（乐谱'嗡起偏慢'）
    vrot: new Map(), // 机枪律轮换账：声名→已发次数（变体=次数%N·种子化=渲染确定性不破）
    transport: null,
    lastGridAt: 0, lastBarAt: 0, lastAskRepeat: -1e9, doneSilentUntil: -1, wxLatch: 0,
    habLog: new Map(),
    mutes: new Set(), // 隔离板 v3：'hum'|'hiss'|'crackle'|'fg'|'record'
    paused: false,   // 运输暂停旗（状态表'暂停抬带=嘶止哼存'的真值源——pause/resumeRecord 同刀设）
    rec: { idx: -1, meta: null, buf: null, srcs: [], calibLin: 0, posBase: 0, posBaseAt: 0, tapeStopped: false, paused: false, pausePos: 0 },
  };

  // ---- 唱片机芯（全排程纪律：离线渲染器无事件循环，一切源的起停在调度刻排定） ----
  /** 唱片在位（作曲四层退场的口径）：有唱片、未被 tape-stop 停死、隔离板未勾掉。 */
  function recOn() { return !!E.rec.meta && !E.rec.tapeStopped && !E.rec.paused && !E.mutes.has('record'); }
  /** 读头位置账本（秒，恒速 1 域；wow 微抖均值 1 忽略；卡碟期打转不前进——复走点=卡点）。 */
  function recPosAt(t) { return E.rec.meta ? (E.rec.posBase + Math.max(0, t - E.rec.posBaseAt)) % E.rec.meta.seconds : 0; }
  /** 建一个唱片源（接 wow 调制口+recLP）；一切 start/stop 由调用方排程。buffer 装盘时建一次，多源复用。 */
  function recMakeSrc() {
    const s = ctx.createBufferSource(); s.buffer = E.rec.buf; s.loop = true;
    R.modPort(s.playbackRate, 1); // 调制口修法（规矩③增补）：唱片 playbackRate 为获准口——wow 之真身
    R.modulate(recWowLfo, recWowD, s.playbackRate);
    R.connect(s, recLP);
    E.rec.srcs.push(s);
    return s;
  }
  /** 装盘（不起播）：idx 入账、buffer 建一次、定标增益（targetLufs−lufs 数据驱动归一）。 */
  function loadRecord(idx) {
    if (!records.length) return;
    const i = ((idx % records.length) + records.length) % records.length;
    const m = records[i];
    E.rec.idx = i; E.rec.meta = m;
    E.rec.buf = ctx.createBuffer(1, m.x.length, m.sr);
    E.rec.buf.copyToChannel(m.x, 0);
    E.rec.calibLin = dbToLin(SP.record.targetLufs - m.lufs);
  }
  /** 起播唱片（at 起、唱片内相位 offsetSec）——startTransport/换曲共用。
   *  POST 乐谱序钳（刀三）：holdBedUntil 同时钳唱片进场点——"若有唱片：落针接管"在嗡起之后。 */
  function recStart(at, offsetSec) {
    if (!E.rec.meta) return;
    if (E.recHoldUntil && at < E.recHoldUntil) at = E.recHoldUntil;
    const s = recMakeSrc();
    const off = ((offsetSec % E.rec.meta.seconds) + E.rec.meta.seconds) % E.rec.meta.seconds;
    s.start(at, off);
    E.rec.posBase = off; E.rec.posBaseAt = at; E.rec.tapeStopped = false;
  }
  function recStopAll(at) {
    for (const s of E.rec.srcs) { try { s.stop(at); } catch (_e) { /* 已停/未起 */ } }
    E.rec.srcs.length = 0;
  }
  /** 跳针针嗒（每循环回绕一声）：哑跳可辨的物理来源——素材恰逢休止时（实测 2-am-debug-loop
   *  12s 处 −52dBFS 乐句间隙），乐句重复本身听不见，"嗒…嗒…"才是世界上最可识别的那半。
   *  过唱片链（recLP→recG）：duck/tape-stop/停止连带，物理上针嗒出自唱片系统。 */
  const tickRng = mulberry32(seedOf('rec-tick:' + (opts.seed || '') + ':' + opts.repoKey));
  function recTick(at) {
    const n = Math.ceil(ctx.sampleRate * 0.008);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (tickRng() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(); s.buffer = b;
    // P0-2 尾单：1800Hz 高通亮嗒（金属感）→ 1250Hz 带通闷"啵"（黑胶锁槽的那种 pop）
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1250; hp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = SP.record.stuckTickGain;
    R.connect(s, hp); R.connect(hp, g); R.connect(g, recLP);
    s.start(at); R.ephemeral(s, at + 0.05);
  }
  /** STUCK 跳针啃唱片：短循环 [pos−L,pos] 重复 durSec＋每回绕一声针嗒（CLEARED 即复走）——全排程。 */
  function recordStuck(at, durSec) {
    if (!recOn() || !E.rec.srcs.length) return;
    const L = SP.record.stuckLoopSecLo + stuckRng() * (SP.record.stuckLoopSecHi - SP.record.stuckLoopSecLo);
    const pos = recPosAt(at);
    const ls = Math.max(0, pos - L);
    if (pos - ls < 0.05) return; // 曲头无肉可啃（<50ms）：跳过，主源照走
    // durSec 是播放轴（压缩轴）秒；唱片恒 1× 走（speed 是带子快进，不是唱片快放）→ 音频钟域换算
    const dur = Math.max(0.3, (durSec || 3) / (E.transport ? E.transport.speed : 1));
    const main = E.rec.srcs[E.rec.srcs.length - 1];
    try { main.stop(at); } catch (_e) { /* 已停 */ }
    const stuck = recMakeSrc();
    stuck.loopStart = ls; stuck.loopEnd = pos;
    stuck.start(at, ls); stuck.stop(at + dur);
    const loopLen = pos - ls;
    for (let k = 1; k <= 64; k++) { // 每回绕一嗒（护栏 64）
      const tickAt = at + k * loopLen;
      if (tickAt > at + dur - 0.02) break;
      recTick(tickAt);
    }
    const resume = recMakeSrc();
    resume.start(at + dur, pos);
    // 复走账本：卡碟期读头打转不前进——复走点=卡点
    E.rec.posBase = pos; E.rec.posBaseAt = at + dur;
  }
  /** DONE tape-stop：降速滑停（pitch 随速降）→ 真静默。playbackRate 自动化=全排程。 */
  function recordTapeStop(at) {
    if (!recOn() || !E.rec.srcs.length) return;
    const sec = SP.record.tapeStopSec;
    for (const s of E.rec.srcs) {
      s.playbackRate.cancelScheduledValues(at);
      s.playbackRate.setValueAtTime(1, at);
      s.playbackRate.linearRampToValueAtTime(0, at + sec);
      try { s.stop(at + sec + 0.1); } catch (_e) { /* 已停 */ }
    }
    R.setDepth(recWowD, 0, at, 0.3, false); // 停转的唱片不再走带不稳（免 rate≈0 时微爬行）
    E.rec.tapeStopped = true;
  }
  /** 暂停唱片（第五号手令 丙.2 改判：暂停＝唱片随带停；房间常在；恢复＝续播不重建）。
   *  ——本席四号手令"画停声继 v1 维持"当庭撤销。短促 spin-down 到静默（拨杆的轻微 wow＝delight），
   *  记住读头位置；床/底噪/呼吸一概不动——存在层独立于此（不变量二）。paused 与 tapeStopped 分道：
   *  后者遇非 DONE 相自动复活（滑停语义），前者只认 resumeRecord（暂停不该被下一包偷偷叫醒）。 */
  function pauseRecord(at) {
    E.paused = true;                          // v3 状态表：暂停抬带=嘶止哼存（下一网格 applyBed 执法）
    if (E.rec.paused || !recOn() || !E.rec.srcs.length) return;
    E.rec.pausePos = recPosAt(at);            // 记住读头＝续播点
    const sec = SP.record.pauseSec ?? 0.28;   // 拨杆 wow：短于 tape-stop 滑停
    for (const s of E.rec.srcs) {
      s.playbackRate.cancelScheduledValues(at);
      s.playbackRate.setValueAtTime(1, at);
      s.playbackRate.linearRampToValueAtTime(0, at + sec); // 掉速＝下滑的 wow
      try { s.stop(at + sec + 0.05); } catch (_e) { /* 已停 */ }
    }
    R.setDepth(recWowD, 0, at, 0.2, false);
    E.rec.srcs.length = 0;
    E.rec.paused = true;
    recG.gain.cancelScheduledValues(at);
    recG.gain.setTargetAtTime(0, at, Math.max(sec / 3, 0.05)); // 电平随停（applyRecord 亦已闸 paused）
  }
  /** 恢复唱片（续播不重建）：从暂停读头位置重新落针起播；房间层本就没停，续上即可。 */
  function resumeRecord(at) {
    E.paused = false;                         // v3 状态表：复走=嘶回
    if (!E.rec.paused) return;
    E.rec.paused = false;
    if (!E.transport || !E.rec.meta) return;
    recStart(at, E.rec.pausePos);             // 从记住的读头续播（非从头＝续播不重建）
    recG.gain.cancelScheduledValues(at);
    recG.gain.setTargetAtTime(E.rec.calibLin, at, 0.06); // 电平回归（下一网格 applyRecord 精修）
  }
  /** 换曲（HUD/URL）：停当前、装下一张、即刻起播（唱片从头）；电平由下一网格（≤半拍）纠正。 */
  function setRecord(idx, at) {
    const t = at !== undefined ? at : ctx.currentTime;
    recStopAll(t);
    loadRecord(idx);
    if (E.transport) recStart(t, 0);
  }
  if (records.length) loadRecord(opts.recordIndex || 0);

  const beat = () => 60 / SP.bpm, grid = () => beat() / 2, bar = () => beat() * 4;

  // ---- 床参数施加（slew；imm=起播首拍立即就位，EAR-2 沿革） ----
  function applyBed(bt, at, imm) {
    const fast = SP.bed.slewMsFast / 1000, slow = SP.bed.slewMsSlow / 1000;
    const set = (param, v, tc) => {
      if (imm) { param.cancelScheduledValues(at); param.setValueAtTime(v, at); }
      else param.setTargetAtTime(v, at, tc);
    };
    const mg = (n) => (E.mutes.has(n) ? 0 : 1);
    const born = E.bedBornAt == null || at >= E.bedBornAt ? 1 : 0;   // POST 借床：诞生前恒零（imm 起播同受闸）
    if (born && E.bedBornAt != null) E.bedBornAt = null;             // 诞生即销闸（慢 slew=起势缓）
    set(humLevel.gain, bt.hum * born * mg('hum'), slow);
    set(hissLevel.gain, bt.hiss * born * mg('hiss'), fast);      // 嘶随走带即停即起（暂停抬带=嘶止要快）
    set(crackleLevel.gain, bt.crackle * born * mg('crackle'), slow);
    set(lp.frequency, bt.filterHz, slow);
    set(shelf.gain, bt.hfShelfDb, slow);
  }

  // ---- 唱片参数施加（SOUND-R3；与 applyBed 同拍调度） ----
  function applyRecord(rt, at, imm) {
    if (!E.rec.meta) return;
    const slow = SP.bed.slewMsSlow / 1000;
    const set = (param, v, tc) => {
      if (imm) { param.cancelScheduledValues(at); param.setValueAtTime(v, at); }
      else param.setTargetAtTime(v, at, tc);
    };
    // 电平：定标（targetLufs−lufs）×映射目标（trim×duck×关断）；淡入淡出用 rt.fadeSec
    const g = E.mutes.has('record') || E.rec.tapeStopped || E.rec.paused ? 0 : rt.gain * E.rec.calibLin;
    set(recG.gain, g, Math.max(rt.fadeSec / 3, 0.05));
    set(recLP.frequency, rt.lpHz, slow);
    // wow：wowCents → playbackRate 摆幅（2^(c/1200)−1）；tape-stop 后不再抖（recordTapeStop 已排零）
    if (!E.rec.tapeStopped) R.setDepth(recWowD, Math.pow(2, rt.wowCents / 1200) - 1, at, slow, imm);
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
    const o = oneOsc('triangle', degreeHz(ROOT, deg, fail ? 0 : 2, SP), at, at + 0.4);
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
    const o = oneOsc('sine', degreeHz(ROOT, deg, 1, SP), at, at + bar() * 2 + 0.1);
    const g = ctx.createGain(); g.connect(fgBus); g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(SP.foreground.spawnGain * hab, at + bar());
    g.gain.linearRampToValueAtTime(0.0001, at + bar() * 2);
    o.connect(g);
  }
  function duck(at) {
    for (const bus of [wearBus]) {
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
    // P0-2 尾单（船长点名"敲铁盆"）：原 1600Hz 带通噪爆·满呼唤增益·3ms 起音＝钢盆脆响。
    // 改"唱针滑擦"：带通中心 900→500Hz 下滑（针在纹里打滑的闷擦）·Q 放松·增益 0.55×·起音 8ms——
    // 跳针仍一耳可辨，但那是唱片系统的声，不是厨房的。
    duck(at); const n = noiseBurst(at, 0.12);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.6;
    f.frequency.setValueAtTime(900, at);
    f.frequency.exponentialRampToValueAtTime(500, at + 0.11);
    n.connect(f); f.connect(envG(at, SP.call.gain * 0.55, 0.008, 0.12));
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
  /** 落针宣告（己-5 合龙微单：轨乙 connect 自证 SSE wired 到站→一声落针）。
   *  软"咚"（触点低频三角快降）＋一撮表面噪声涌起（针尖入纹的"呲"）。走前景总线（fgBus，
   *  与 pluck/page 同族）——接线宣告与唱片在否无关，房间层态也须可闻，故不入唱片链（recG 无盘即哑）；
   *  隔离板 fg 勾掉则连带静默（announcement 属前景族）。一次性源，非遥测映射、不入回归主流。 */
  /** 单声申报（越级检测仪·声资产批§二）：每一枚具名声上线时自报阶级——表在则审，不在则零成本。 */
  function reportSound(name, klass, at) {
    try { E.onSound && E.onSound({ name, klass, at }); } catch (_e) { /* 仪表异常不许波及发声 */ }
  }

  function needleDrop(at) {
    if (E.mutes.has('fg')) return;
    reportSound('needleDrop', 'ritual', at);   // 落针=仪式级（十四声户口册 #12）
    // P0-2（LEDGER）：拆"不锈钢盘"——原 110Hz 硬三角＋1.9k 带通突刺读感金属敲击。
    // 换"软针落"：① 更低更软的触点"扑"（80→42Hz 正弦·半电平） ② 针入纹＝在库 l1-crackle
    // 真采样一撮涌起（低通 2.4k·慢起慢收·无金属带通）；资产缺席退软化噪声（低通 1.6k）。
    const thunk = ctx.createOscillator(); thunk.type = 'sine';
    thunk.frequency.setValueAtTime(80, at);
    thunk.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    thunk.connect(envG(at, SP.foreground.saveGain * 0.55, 0.008, 0.16));
    thunk.start(at); thunk.stop(at + 0.26); R.ephemeral(thunk, at + 0.26);
    if (crackleClip) {
      const n = Math.min(Math.round(0.6 * crackleClip.sr), crackleClip.x.length);
      const off = Math.floor(keyRng() * Math.max(1, crackleClip.x.length - n));
      const buf = ctx.createBuffer(1, n, crackleClip.sr);
      buf.getChannelData(0).set(crackleClip.x.subarray(off, off + n));
      const src = ctx.createBufferSource(); src.buffer = buf;
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 2400; lp2.Q.value = 0.4;
      const norm = Math.pow(10, -crackleClip.rmsDb / 20);
      src.connect(lp2); lp2.connect(envG(at, SP.foreground.pageGain * 1.2 * norm, 0.05, 0.42));
      src.start(at); src.stop(at + 0.62); R.ephemeral(src, at + 0.62);
    } else {
      const swell = noiseBurst(at, 0.2);
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 1600; lp2.Q.value = 0.5;
      swell.connect(lp2); lp2.connect(envG(at, SP.foreground.pageGain * 0.9, 0.05, 0.18));
    }
  }

  // ---- POST 乐谱声部（声资产批刀三·三层解剖法+阻尼律+机枪律）----------------------
  // 每声=瞬态(材质之咬)+躯体(中频之重)+尾音(阻尼)；全机禁无阻尼金属振铃；
  // 机枪律：3–5 轮换+微随机（音高±2%/增益±1dB）——种子化 rng+轮换账=确定性不破。
  const voiceRng = mulberry32(seedOf('voices:' + (opts.seed || '') + ':' + opts.repoKey));
  function vshot(name) {
    const n = (E.vrot.get(name) || 0); E.vrot.set(name, n + 1);
    // 每发独立但确定：从主流取两枚（顺序即种子链——同渲染两遍逐位同）
    const pm = 1 + (voiceRng() - 0.5) * 0.04;   // 音高 ±2%
    const gm = Math.pow(10, ((voiceRng() - 0.5) * 2) / 20); // 增益 ±1dB
    return { v: n % 4, pm, gm };
  }
  /** 继电器合闸"咔"（手感·POST t0/手势）：接点咔(高频 5ms)+线圈闷动(120Hz 短)+板短阻尼震(400Hz 40ms) */
  function relayClick(at) {
    if (E.mutes.has('fg')) return;
    const { v, pm, gm } = vshot('relay');
    reportSound('relayClick', 'touch', at);
    const g0 = 0.062 * gm;
    // 瞬态：接点咔
    const click = noiseBurst(at, 0.006);
    const chp = ctx.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = (1900 + v * 140) * pm;
    click.connect(chp); chp.connect(envG(at, g0, 0.001, 0.012));
    // 躯体：线圈闷动
    const coil = oneOsc('sine', (118 + v * 6) * pm, at, at + 0.09);
    coil.connect(envG(at, g0 * 0.7, 0.004, 0.055));
    // 尾音：机箱板短震（带通窄阻尼——木箱压钢板=闷震）
    const body = noiseBurst(at + 0.004, 0.05);
    const bbp = ctx.createBiquadFilter(); bbp.type = 'bandpass'; bbp.frequency.value = 420 * pm; bbp.Q.value = 2.2;
    body.connect(bbp); bbp.connect(envG(at + 0.004, g0 * 0.5, 0.003, 0.042));
  }
  /** 钨丝点火"嗒"（耳语·灯亮瞬间）：极短嘀，近无躯体无尾（灯丝热胀的一粒） */
  function filamentTick(at) {
    if (E.mutes.has('fg')) return;
    const { v, pm, gm } = vshot('filament');
    reportSound('filamentTick', 'whisper', at);
    const g0 = 0.016 * gm;
    const o = oneOsc('sine', (2950 + v * 90) * pm, at, at + 0.02);
    o.connect(envG(at, g0, 0.001, 0.011));
    const n = noiseBurst(at, 0.004);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    n.connect(hp); hp.connect(envG(at, g0 * 0.5, 0.001, 0.006));
  }
  /** 伺服扫摆"吱—嘀嘀"（耳语·POST 探针/校准钮）：滑走窄带吱+端点两嘀 */
  function servoSweep(at, durSec = 1.6) {
    if (E.mutes.has('fg')) return;
    const { pm, gm } = vshot('servo');
    reportSound('servoSweep', 'whisper', at);
    const g0 = 0.16 * gm;   // 窄带损耗补偿（Q4 带通吃 ~22dB）——出口带内 ≈−42dBFS=床下温柔可闻
    const zh = noiseBurst(at, durSec * 0.72);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
    bp.frequency.setValueAtTime(640 * pm, at);
    bp.frequency.linearRampToValueAtTime(880 * pm, at + durSec * 0.4);
    bp.frequency.linearRampToValueAtTime(560 * pm, at + durSec * 0.72);
    zh.connect(bp); bp.connect(envG(at, g0, 0.05, durSec * 0.66));
    for (const dt of [durSec * 0.74, durSec * 0.86]) {   // 端点嘀×2（落位确认）
      const o = oneOsc('sine', 1450 * pm, at + dt, at + dt + 0.03);
      o.connect(envG(at + dt, 0.02 * gm, 0.002, 0.02));   // 嘀走独立小增益（不吃带通损耗补偿）
    }
  }
  /** Solari 哗啦（耳语~手感上限·换曲/POST）：塑片连击程序化（电木=干咔·长度随时长·簇密度前紧后松） */
  function solariClatter(at, durMs = 1050) {
    if (E.mutes.has('fg')) return;
    const { gm } = vshot('solari');
    reportSound('solariClatter', 'touch', at);
    const dur = Math.min(Math.max(durMs, 200), 1150) / 1000;   // 值班帽与翻牌同法
    const clickRng = mulberry32(seedOf('solari:' + (E.vrot.get('solari') || 0) + ':' + opts.repoKey));
    const n = Math.round(26 + clickRng() * 10);                 // 一环连击数（12 格×2 相 前后错峰）
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const jitter = (clickRng() - 0.5) * 0.018;
      const tAt = at + u * dur * 0.92 + jitter;
      if (tAt < at) continue;
      const pm = 1 + (clickRng() - 0.5) * 0.10;
      const cg = 0.08 * gm * (0.75 + clickRng() * 0.5);
      const c = noiseBurst(tAt, 0.004);
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = (2400 + clickRng() * 900) * pm; hp.Q.value = 1.4;
      c.connect(hp); hp.connect(envG(tAt, cg, 0.001, 0.008));
    }
    // 末翻 thunk（触底重拍——与视觉末翻回弹同性格）
    const th = noiseBurst(at + dur * 0.94, 0.012);
    const tb = ctx.createBiquadFilter(); tb.type = 'bandpass'; tb.frequency.value = 700; tb.Q.value = 1.8;
    th.connect(tb); tb.connect(envG(at + dur * 0.94, 0.06 * gm, 0.002, 0.03));
  }
  /** 床诞生（POST 温柔苏醒）：即刻压黑，bornAt 起随慢 slew 缓起（"嗡——"起势缓） */
  function holdBedUntil(bornAt) {
    E.bedBornAt = bornAt;
    E.recHoldUntil = bornAt;   // 乐谱序：唱片在床诞生后接管（fadeIn 1.2s 温柔原样）
    const now = ctx.currentTime;
    for (const lv of [humLevel, hissLevel, crackleLevel]) {
      lv.gain.cancelScheduledValues(now); lv.gain.setValueAtTime(0, now);
    }
  }

  function habFor(cls, at) {
    if (cls >= 6) return 1;
    const w = SP.foreground.habituationWindowSec;
    const arr = (E.habLog.get(cls) || []).filter((t) => at - t <= w);
    arr.push(at); E.habLog.set(cls, arr);
    return habituationGain(arr.length, SP);
  }

  // ---- transport 与调度（probe 页与机器耳朵共用的唯一调度体；SOUND-R1 沿革） ----
  // startPm（EAR-11 增）：从压缩轴任意毫秒起播——原速法把"跳转"变成刚需（66 分钟带没人从头听）。
  function startTransport(audio0, speed, track, durMs, startPm = 0) {
    E.transport = { audio0, speed, track, durMs, startPm };
    E.lastGridAt = audio0; E.lastBarAt = audio0; E.lastAskRepeat = -1e9;
    E.doneSilentUntil = -1; E.wxLatch = 0; E.habLog.clear();
    wearBus.gain.cancelScheduledValues(ctx.currentTime);
    wearBus.gain.setValueAtTime(1, ctx.currentTime);
    // 唱片起播（R3）：重建源（stop 后源不可复用）；唱片内相位=带位置映射（确定性＋跳转对应感）
    if (E.rec.meta || records.length) {
      recStopAll(ctx.currentTime);
      if (!E.rec.meta) loadRecord(opts.recordIndex || 0);
      E.rec.tapeStopped = false;
      recStart(audio0, (startPm / 1000) * speed % 1e9);
    }
    const s0 = track.length ? sampleAt(track, Math.min(startPm, durMs)) : [0, 0, 0, 0, 0, 0, 0, 0];
    applyBed(bedTargets(stateOf(s0), SP), ctx.currentTime, true);
    applyRecord(recordTargets(stateOf(s0), SP), ctx.currentTime, true);
  }
  const stateOf = (s) => ({ T: s[2], A: s[3], wow: s[6], phase: ['IDLE', 'WORKING', 'WAITING', 'DONE'][s[5]] || 'WORKING', weather: 'CLEAR', pendingAsk: s[7] === 1, recordOn: recOn(),
    moving: !!E.transport && !E.paused, speed: E.transport ? E.transport.speed : 1 });   // 状态表三态真值（v3）

  function scheduleGridUntil(untilSec) {
    const { audio0, speed, track, durMs, startPm } = E.transport;
    while (E.lastGridAt <= untilSec) {
      const at = E.lastGridAt, gpm = (at - audio0) * 1000 * speed + (startPm || 0);
      const s = sampleAt(track, Math.min(gpm, durMs));
      const bt = bedTargets(stateOf(s), SP);
      if (at > E.doneSilentUntil) { applyBed(bt, at, false); applyRecord(recordTargets(stateOf(s), SP), at, false); }
      // （bar 悬挂音摆/S2 打点已随作曲床出殡——网格唯余床/唱片参数与 ASK 重奏）
      if (s[7] === 1 && (at - E.lastAskRepeat) >= SP.call.askRepeatSec) {
        E.lastAskRepeat = at;
        if (at > audio0 + 1 && !E.mutes.has('fg')) askMotif(at);
      }
      E.lastGridAt += grid();
    }
  }

  function trigger(cls, atE, deg, vel) {
    // 唱片处置先于前景静音判定：跳针/滑停是机器对唱片的动作，不属前景层（隔离板 fg 勾掉时照常）
    if (cls === 7) recordStuck(atE, vel); // vel 装卡碟期秒数（蒸馏侧 STUCK_LOOP→STUCK_CLEARED 实测）
    else if (cls === 9) recordTapeStop(atE);
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
    applyRecord(recordTargets(stateOf(s), SP), ctx.currentTime, true);
  }

  return {
    ctx, SP, ROOT, nodes: E.nodes,
    registry: R,
    assetsUsed: { crackle: !!crackleClip },   // v3：织体资产（roomtone/filmstatic）随退役令出列
    stackInfo: { hum: hum.info }, // 三关铁律自述（金测试断言口·v3=马达低哼）
    get transport() { return E.transport; },
    get lastGridAt() { return E.lastGridAt; },
    get doneSilentUntil() { return E.doneSilentUntil; },
    // 唱片面（R3）：HUD/验证用。recordInfo=当前装盘；setRecord=换曲（HUD/URL 消费）
    get recordInfo() { return E.rec.meta ? { idx: E.rec.idx, name: E.rec.meta.name, title: E.rec.meta.title || E.rec.meta.name, seconds: E.rec.meta.seconds, count: records.length, tapeStopped: E.rec.tapeStopped } : null; },
    recordCount: records.length,
    setRecord,
    recordPosAt: recPosAt,
    applyBed, startTransport, scheduleGridUntil, trigger, applyBedNow, needleDrop,
    relayClick, filamentTick, servoSweep, solariClatter, holdBedUntil,   // POST 乐谱声部（刀三）
    pauseRecord, resumeRecord, // 丙.2：暂停＝唱片随带停（房间常在），恢复＝续播不重建
    get recordPaused() { return E.rec.paused; },
    setMute(name, on) { if (on) E.mutes.add(name); else E.mutes.delete(name); },
    setOnSound(fn) { E.onSound = fn; },   // 越级检测仪挂钩（?soundclass 诊断口专用）
    stop(at) {
      R.stopAll(at);
      recStopAll(at); // G1 含唱片路径：levels 闸（recG）+源硬停，双重
      wearBus.gain.setTargetAtTime(1, at, 0.05);
    },
    hardMute() { R.hardMute(); },
    muteMaster(at) { master.gain.setTargetAtTime(0, at, 0.05); },
    unmuteMaster(at) { master.gain.cancelScheduledValues(at); master.gain.setTargetAtTime(0.9, at, 0.05); },
    debugGains() { return R.debugGains(); },
  };
}
