// 声音相纯映射核（SOUND-R1：自 index.ts 迁为纯 JS）。纯：无 Node、无 Web Audio、无随机、无 Date。
// 为什么是 .js —— 这份代码必须**逐字**跑在两处：Node（cli ear / golden 离线渲染）与浏览器（probe 页内嵌）。
// 前四轮失明的土壤之一就是 probe 页里手抄了一份"同源律"——同源靠纪律必然漂移，同源靠同一份文件才是结构。
// probe 生成页时把本文件按行内嵌（剥 import/export 语法），Node 侧按 ESM 正常 import；类型见 core.d.ts。
//
// 值的唯一事实源 = sound-params.json（与 params.json 同级治理：hashJson 上报，_ 键不入哈希）。

/** JSON → 强类型（缺段即抛；参数是地基，不容默认漂移——与 engine/params 同纪律）。 */
export function resolveSoundParams(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('sound-params 必须是对象');
  const p = raw;
  const out = {
    bpm: p['bpm'], gridDiv: p['gridDiv'], bed: p['bed'], foreground: p['foreground'],
    call: p['call'], loudness: p['loudness'], scale: p['scale'],
  };
  for (const k of ['bpm', 'gridDiv', 'bed', 'foreground', 'call', 'loudness', 'scale']) {
    if (out[k] === undefined || out[k] === null) throw new Error(`sound-params 缺少 ${k}`);
  }
  if (typeof out.bed.breathDepth !== 'number') throw new Error('sound-params 缺少 bed.breathDepth（SOUND-R1 方案 B）');
  for (const k of ['l1Gain', 'l1IdleGain', 'l1AirRatio', 'crackleDbLo', 'crackleDbHi', 'l2Gain']) {
    if (typeof out.bed[k] !== 'number') throw new Error(`sound-params 缺少 bed.${k}（SOUND-R2 三层床）`);
  }
  // 铁律执法（SOUND-R2 §2 L2）：和声垫电平永远低于织体体——参数层就把违例拦死
  if (out.bed.l2Gain >= out.bed.l1Gain) throw new Error(`铁律：l2Gain(${out.bed.l2Gain}) 必须 < l1Gain(${out.bed.l1Gain})——和声垫永远躺在织体下面`);
  // SOUND-R3 唱机改造：record 节（唱片总线处置参数）
  out.record = p['record'];
  if (!out.record) throw new Error('sound-params 缺少 record（SOUND-R3 唱机改造）');
  for (const k of ['targetLufs', 'duckDb', 'duckSlewMs', 'stuckLoopSecLo', 'stuckLoopSecHi',
    'stuckTickGain', 'tapeStopSec', 'filterHzLo', 'filterHzHi', 'wowCentsLo', 'wowCentsHi', 'wowTBoost',
    'wowRateHz', 'fadeInSec', 'fadeOutSec']) {
    if (typeof out.record[k] !== 'number') throw new Error(`sound-params 缺少 record.${k}（SOUND-R3 唱片总线）`);
  }
  if (out.record.stuckLoopSecHi < out.record.stuckLoopSecLo) throw new Error('record：stuckLoopSecHi 必须 ≥ stuckLoopSecLo');
  return out;
}

export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const dbToLin = (db) => Math.pow(10, db / 20);
export const linToDb = (lin) => (lin <= 1e-9 ? -180 : 20 * Math.log10(lin));

// ---------- 床（连续层）映射律 §2.2 ----------

export function bedTargets(s, sp) {
  const b = sp.bed;
  const T = clamp01(s.T), A = clamp01(s.A), wow = clamp01(s.wow);
  const idle = s.phase === 'IDLE';
  const silence = s.phase === 'DONE';
  // SOUND-R3 总纲：音乐由唱片供给，信息由机器供给。唱片在位（recordOn）时作曲四层
  // （L1/L2/S2/S3）退场——房间层只在无唱片态发声；磨损（crackle/hiss）是机器介质噪声，照旧。
  // 未传 recordOn（旧调用方/金测试）＝false，全部 R2 断言原样成立（判据冻结纪律）。
  const rec = s.recordOn === true;
  const trim = dbToLin(b.trimDb); // 床总闸进 targets：验收能量模型与渲染器同一数字
  // P0-2 混音宪法（LEDGER）：唱片在位时磨损（crackle/hiss）随之近隐——唱片为主声道。
  // 缺省（参数缺席）＝0dB：旧 fixtures/金测试旧世界原样（判据冻结纪律的兼容面）。
  const under = rec ? dbToLin(b.underRecordDb ?? 0) : 1;
  // L1 织体体（真采样为体；IDLE 唯余此层最弱态——白皮书 v1.1 §2.1）
  const l1 = trim * (silence || rec ? 0 : idle ? b.l1IdleGain : b.l1Gain);
  // crackle 磨损织体（T 驱动，与 hiss 同属介质噪声，直达输出）
  const crackle = trim * under * (silence ? 0 : dbToLin(b.crackleDbLo + (b.crackleDbHi - b.crackleDbLo) * T));
  // L2 和声垫（三关铁律成品；永低于 L1——resolve 已执法）
  const l2 = trim * (silence || idle || rec ? 0 : b.l2Gain);
  const s2gate = clamp01((A - b.s2GateA) / (1 - b.s2GateA));
  const s2 = trim * (silence || idle || rec ? 0 : b.s2Gain * s2gate);
  const s3gate = clamp01((T - b.s3GateT) / (1 - b.s3GateT));
  const s3 = trim * (silence || rec ? 0 : b.s3Gain * s3gate);
  const hissLin = trim * under * (silence ? 0 : dbToLin(b.hissDbLo + (b.hissDbHi - b.hissDbLo) * T));
  return {
    l1, crackle, l2, s2, s3, hissLin,
    filterHz: b.filterHzHi + (b.filterHzLo - b.filterHzHi) * T,
    hfShelfDb: b.hfShelfDbLo + (b.hfShelfDbHi - b.hfShelfDbLo) * T,
    wowCents: b.wowCentsLo + (b.wowCentsHi - b.wowCentsLo) * wow,
    susProb: T,
    density: b.s2DensityLo + (b.s2DensityHi - b.s2DensityLo) * A,
    hover: s.pendingAsk,
    silence,
  };
}

/** 床能量（dB）：不相关源的 RMS 合成。抽象设计能量——单调性/门控律的口径（金测试 ㉚）。 */
export function bedEnergyDb(bt) {
  const e = Math.sqrt(bt.l1 * bt.l1 + bt.crackle * bt.crackle + bt.l2 * bt.l2
    + bt.s2 * bt.s2 + bt.s3 * bt.s3 + bt.hissLin * bt.hissLin);
  return e <= 1e-9 ? -120 : 20 * Math.log10(e);
}

/**
 * 床渲染 RMS 设计模型（dB）—— G3 的"设计值"口径（SOUND-R1）。
 * 与 bedEnergyDb 的区别只有一项：S2 是稀疏打点（拍点稀疏、力度轻——白皮书 §2.1 设计如此），
 * 长程 RMS = 电平 × S2_CREST × √(密度/参考密度)（打点能量/秒 ∝ 触发率）。
 * 连续 stem 正身在 graph.js 内以固定常数归一到单位 RMS（金测试逐 stem 锁定），电平数字即渲染 RMS。
 * 口径：bedBus 点（S4 磁带总线着色不入账——总线是"同一台机器"的染色，不是床的能量律）。
 * S2_CREST 为离线渲染实测冻结的定标常数（金测试锁定；probe/ear 同一渲染代码，故两处同真）。
 */
export const S2_REF_DENSITY = 0.55;
export const S2_CREST = 0.02615; // 离线渲染实测冻结（@48k，参考密度 0.55，定标轮 SOUND-R1）
export function bedRmsDb(bt) {
  const s2eff = bt.s2 * S2_CREST * Math.sqrt(Math.max(bt.density, 0) / S2_REF_DENSITY);
  const e = Math.sqrt(bt.l1 * bt.l1 + bt.crackle * bt.crackle + bt.l2 * bt.l2
    + s2eff * s2eff + bt.s3 * bt.s3 + bt.hissLin * bt.hissLin);
  return e <= 1e-9 ? -120 : 20 * Math.log10(e);
}

// ---------- 唱片总线映射律（SOUND-R3 §2：机器对唱片的处置——皇冠机制上真盘） ----------

/**
 * 唱片处置目标（纯函数，连续量；STUCK/tape-stop 为事件性处置，由 graph 调度，不在此表）。
 * F5 v2 语义（§七.4 裁 a）：唱片以恒定电平播放，机器不泵音量——T 的表达=处置（磨损/滤波/抖）。
 * gain 只含 trim（G2 总闸遍历域）×duck（ASK 让位）×关断（DONE/IDLE）；
 * 响度定标（targetLufs − 唱片实测 lufs）是数据驱动归一，在 graph 侧乘（与 L1 rmsDb 定标锚同形制）。
 */
export function recordTargets(s, sp) {
  const r = sp.record;
  const T = clamp01(s.T), wow = clamp01(s.wow);
  const idle = s.phase === 'IDLE';
  const silence = s.phase === 'DONE';
  const trim = dbToLin(sp.bed.trimDb);
  const duck = s.pendingAsk ? dbToLin(r.duckDb) : 1; // ASK：唱片让位半格（−6~−9dB，250ms slew）
  return {
    gain: trim * duck * (silence || idle ? 0 : 1),
    lpHz: r.filterHzHi + (r.filterHzLo - r.filterHzHi) * T, // T=磁带变旧变闷（S4 参数域平移）
    // wow=走带不稳的音高微醺；T 加深之（磁带变旧走带更晃）——真旋律上第一次可闻
    wowCents: r.wowCentsLo + (r.wowCentsHi - r.wowCentsLo) * clamp01(wow + T * r.wowTBoost),
    fadeSec: idle || silence ? r.fadeOutSec : r.fadeInSec, // 淡出去（IDLE 房间层接管）／淡进来
    silence, idle,
  };
}

// ---------- 前景（离散层）律 §3 ----------

/** 习惯化（§3.2 F4 机械化）：滚动 60s 窗内同类第 n 次 → ×factor^(n−1)，下限=沉床比。呼唤级豁免（调用方不问）。 */
export function habituationGain(n, sp) {
  if (n <= 1) return 1;
  const g = Math.pow(sp.foreground.habituationFactor, n - 1);
  return Math.max(sp.foreground.habituationFloorRatio, g);
}

/** 乐音级量化：对齐到**下一**1/gridDiv 拍网格线（宁迟勿早）。呼唤级永不过此函数。 */
export function quantizeUpSec(atSec, sp) {
  const grid = 60 / sp.bpm / (sp.gridDiv / 4); // 1/8 @72BPM ≈ 0.4167s
  return Math.ceil(atSec / grid - 1e-9) * grid;
}

/** targetHash/slot（hex 串）→ 五声音阶级数：同一目标反复出现同一动机（文件的主题曲）。 */
export function degreeOf(slotHex, sp) {
  if (!slotHex) return 0;
  let h = 0;
  for (let i = 0; i < slotHex.length; i++) h = ((h << 5) - h + slotHex.charCodeAt(i)) | 0;
  return Math.abs(h) % sp.scale.pentatonic.length;
}

/** repoKey（live=项目路径；replay=磁带 sourceHash，见现实修正）→ 主音 MIDI。每仓库一调。 */
export function rootMidiOf(repoKey, sp) {
  let h = 0;
  for (let i = 0; i < repoKey.length; i++) h = ((h << 5) - h + repoKey.charCodeAt(i)) | 0;
  return sp.scale.rootMidiBase + (Math.abs(h) % sp.scale.rootMidiSpan);
}

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** 级数 → 频率。octave 为相对八度（成功高、失败低的音区分裂由调用方给 octave）。 */
export function degreeHz(rootMidi, degree, octave, sp) {
  return midiToHz(rootMidi + sp.scale.pentatonic[degree % sp.scale.pentatonic.length] + 12 * octave);
}

/** ASK 动机主频：夹进频谱专区 [2k,4k]（呼唤级穿透窗，§3.1/§6.4）。 */
export function askMotifHz(rootMidi, sp) {
  let hz = degreeHz(rootMidi, 4, 3, sp); // 属方向高位
  while (hz < sp.call.askBandHzLo) hz *= 2;
  while (hz > sp.call.askBandHzHi) hz /= 2;
  // 半八度死区：夹不进就贴边（带宽刚好一个八度，理论不至此；护栏而已）
  if (hz < sp.call.askBandHzLo) hz = sp.call.askBandHzLo;
  return hz;
}

// ---------- 状态轨迹（probe 页 / cli ear 共用的时间轴口径） ----------

/**
 * snaps → 压缩轨迹：大空档压到 ≤gapCapMs（探针不播死寂）。行 = [compMs, needle, T, A, wxIdx, phIdx, wow, ask]。
 * 自 probe.ts 迁出：机器耳朵与探针页必须用同一条时间轴，否则"听的"与"验的"又是两个世界。
 */
export const WEATHER_IDX = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM'];
export const PHASE_IDX = ['IDLE', 'WORKING', 'WAITING', 'DONE'];
const r3 = (n) => Math.round(n * 1000) / 1000;

export function buildTrack(snaps, gapCapMs, maxPoints) {
  const cap = gapCapMs ?? 1500;
  const t0 = snaps.length ? snaps[0].t : 0;
  const comp = new Array(snaps.length);
  for (let i = 0; i < snaps.length; i++) {
    comp[i] = i === 0 ? 0 : comp[i - 1] + Math.min(snaps[i].t - snaps[i - 1].t, cap);
  }
  const stride = Math.max(1, Math.ceil(snaps.length / (maxPoints ?? 12000)));
  const track = [];
  const push = (i) => {
    const s = snaps[i];
    track.push([Math.round(comp[i]), r3(s.needle), r3(s.T), r3(s.A),
      WEATHER_IDX.indexOf(s.weather), PHASE_IDX.indexOf(s.phase), r3(s.wow), s.pendingAsk ? 1 : 0]);
  };
  for (let i = 0; i < snaps.length; i += stride) push(i);
  if (snaps.length && (snaps.length - 1) % stride !== 0) push(snaps.length - 1);
  return { track, comp, t0 };
}

/** 压缩轴上取样（二分，取 ≤pm 最近行）。 */
export function sampleAt(track, pm) {
  // 空账（未上带／空载磁带架，丁-E2）：返房间层默认零态（IDLE），免下游 stateOf 读 undefined 崩。
  if (track.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0];
  let lo = 0, hi = track.length - 1, best = 0;
  while (lo <= hi) { const md = (lo + hi) >> 1; if (track[md][0] <= pm) { best = md; lo = md + 1; } else hi = md - 1; }
  return track[best];
}

// ---------- 验收工具 §6.1 ----------

/** Pearson 相关系数。方差趋零（如 silence 带的 T）→ null（NA，不算不及格）。 */
export function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  if (sxx < 1e-12 || syy < 1e-12) return null;
  return sxy / Math.sqrt(sxx * syy);
}
