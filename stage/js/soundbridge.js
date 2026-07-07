// demo 声桥（M2.5 §B.1）：sound/core.js＋graph.js 纯 ESM 直吃——引擎与映射律的单一事实源，
// 舞台侧零合成、零参数私造（只读消费，写权在 Track-SOUND）。
//
// 唱片随站：出厂 CC0 一张（Still Life · HoliznaCC0，血统条款署名于页脚与本注）；
// 取不到唱片时按产品语义落房间层（L1 织体照常，音乐缺席，机器不撒谎）。
//
// 前景分类映射（soundClassOf）镜像自 cli/rendercuts.ts（其自 cli/probe.ts——probe 侧仍是正典）。
// 已提请 Track-SOUND：把分类器提为 sound/ 浏览器可用出口，三处镜像归一（FEEDBACK 记案）。
import { resolveSoundParams, buildTrack, degreeOf } from '../../sound/core.js';
import { buildEngine } from '../../sound/graph.js';
import { PHASES, WEATHERS, unfoldStageT } from './replay.js';

function soundClassOf(m, resolveTimes) {
  if (m.special === 'STUCK_LOOP') return 7;
  if (m.special === 'RESOLVE') return 6;
  if (m.special === 'DONE') return 9;
  if (m.special) return null;
  if (m.verb === 'ASK') return 8;
  if (m.outcome === 'FAIL') return 1;
  if (m.outcome !== 'OK') return null;
  switch (m.verb) {
    case 'WRITE': return 0;
    case 'READ': return 2;
    case 'RUN': return (m.tags || '').includes('test') && resolveTimes.has(m.t) ? null : 3;
    case 'SAVE': return 4;
    case 'SPAWN': return 5;
    default: return null;
  }
}

export class SoundBridge {
  async start(tape, atStageMs) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();

    const spRaw = await fetch('../sound-params.json').then(r => r.json());
    const sp = resolveSoundParams(spRaw);

    // L1 织体资产（manifest 定标 → graph 数据驱动归一）。
    // G8 热修：npm 装包不含 wav（走 Releases）——资产缺席不许炸桥，落 graph 侧合成织体退路
    // （M2.4 §C「结构不因资产缺席而变」；架构师已裁合成退路为开箱声）。
    let assets = null;
    try {
      const manifest = await fetch('../sound/assets/manifest.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
      const got = {};
      for (const a of manifest.assets) {
        const buf = await fetch(`../sound/assets/${a.file}`).then((r) => { if (!r.ok) throw new Error(`${a.file} ${r.status}`); return r.arrayBuffer(); });
        const ab = await ctx.decodeAudioData(buf);
        got[a.name] = { x: ab.getChannelData(0), sr: ab.sampleRate, rmsDb: a.rmsDb };
      }
      assets = got;
    } catch (err) {
      console.warn('[sound] 织体资产缺席，落合成退路（不哑）：', err.message ?? err);
    }

    // 出厂唱片（随站一张；取不到→房间层，honest fallback）
    let records = null, recordIndex = 0;
    try {
      const catalog = await fetch('../sound/records/catalog.json').then(r => r.json());
      const rec = catalog.records.find(r => r.name === 'still-life') ?? catalog.records[0];
      const buf = await fetch(`../records/${rec.file}`).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); });
      const ab = await ctx.decodeAudioData(buf);
      // 单声道混合（probe 同法）
      const n = ab.length, x = new Float32Array(n);
      for (let c = 0; c < ab.numberOfChannels; c++) {
        const d = ab.getChannelData(c);
        for (let i = 0; i < n; i++) x[i] += d[i] / ab.numberOfChannels;
      }
      records = [{ name: rec.name, title: rec.title, x, sr: ab.sampleRate, seconds: ab.duration, lufs: rec.lufs, bpmMeasured: rec.bpmMeasured }];
      this.record = rec;
    } catch (err) {
      console.warn('[demo] 唱片缺席，落房间层：', err.message ?? err);
    }

    // snaps（曲线数组 → 声侧包形）→ 压缩轴 track（声侧折叠律 cap=1500，known-limit：
    // 与舞台折叠帽 400 不齐，跨大接带处画声漂移 ~1.1s/道——轴主归一记案在册）
    const c = tape.curve;
    const snaps = new Array(c.n);
    for (let i = 0; i < c.n; i++) {
      snaps[i] = {
        t: c.t[i], needle: c.needle[i], T: c.T[i], A: c.A[i],
        weather: WEATHERS[c.weather[i]], phase: PHASES[c.phase[i]],
        wow: c.wow[i], pendingAsk: c.pendingAsk[i] === 1,
      };
    }
    const { track, comp, t0 } = buildTrack(snaps);
    const durMs = track.length ? track[track.length - 1][0] : 0;
    const pmOf = (rawT) => { // 原始 t → 压缩轴（二分 + 步内线性）
      let lo = 0, hi = c.n - 1;
      if (rawT <= c.t[0]) return 0;
      if (rawT >= c.t[hi]) return comp[hi];
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c.t[mid] <= rawT) lo = mid; else hi = mid; }
      const span = c.t[lo + 1] - c.t[lo];
      const f = span > 0 ? (rawT - c.t[lo]) / span : 0;
      return comp[lo] + f * (comp[lo + 1] - comp[lo]);
    };

    // 前景事件 → 压缩轴（RESOLVE 双发语义：ok 型脱卡有和弦，expiry 无声）
    const resolveTimes = new Set(tape.moments.filter(m => m.special === 'RESOLVE').map(m => m.t));
    const events = [];
    for (const m of tape.moments) {
      const cls = soundClassOf(m, resolveTimes);
      if (cls === null) continue;
      events.push({ pm: pmOf(m.t), cls, deg: degreeOf(m.slot, sp), vel: cls === 7 ? 2.5 : 0.5 });
    }
    events.sort((a, b) => a.pm - b.pm);

    // 起播：与视觉同起点（舞台 ms → 原始 t → 压缩轴；反折叠走 replay.js 同源出口）
    const startRaw = unfoldStageT(tape, atStageMs);
    const startPm = pmOf(startRaw);
    const eng = buildEngine(ctx, sp, { repoKey: 'demo:storm', seed: 'demo', assets, records, recordIndex });
    const audio0 = ctx.currentTime + 0.12;
    eng.startTransport(audio0, 1, track, durMs, startPm);

    // 排程窗：床网格与前景事件都排到"当下+30s"，10s 一续（probe 同律）
    let ei = 0;
    while (ei < events.length && events[ei].pm < startPm) ei++;
    const horizon = () => {
      const elapsed = ctx.currentTime - audio0;
      eng.scheduleGridUntil(elapsed + 30);
      const pmMax = startPm + (elapsed + 30) * 1000;
      while (ei < events.length && events[ei].pm <= pmMax) {
        const e = events[ei++];
        eng.trigger(e.cls, audio0 + (e.pm - startPm) / 1000, e.deg, e.vel);
      }
    };
    horizon();
    this._timer = setInterval(horizon, 10000);
    this.engine = eng; this.ctx = ctx;
    return this;
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this.engine?.stop(this.ctx.currentTime + 0.1);
  }
}
