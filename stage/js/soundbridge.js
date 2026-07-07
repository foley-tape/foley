// 声桥（轨甲重铸·总线一元论）：浏览器薄壳——手势开机、取资产、建引擎、挂机器代理（analyser）。
// 流式大脑在 sound/livebridge.js（纯逻辑、时钟可注入，金测试离线同真）；本壳只做浏览器专属事：
// AudioContext、fetch、定时泵、唱片异步热装。
//
// 一元论形制：本桥是总线的**普通订阅者**（onPacket/onMoment/render 与器件同鸭型，main.js 把它
// push 进 instruments）——live 实流与磁带回放喂的是同一根总线，桥对模式全盲。
// "整带上桥"（旧 start(tape) 吃完整 curve 一次性 buildTrack）已拆除：live 无完整带可给，
// 那个形状正是静音病的病灶（RECON B3 双证）。
//
// 第一分钟出声（零外网依赖）：引擎起播即有房间层（资产缺席→graph 合成织体退路，结构不变）；
// 唱片是**增强**不是前提——异步取、到即热装（`foley records` 下载完成后 90s 内自动上桥，
// 免刷新页）。一切 fetch 都对着 localhost serve；零静默外网红线照守（白皮书 §2.0）。
//
// 唱片随站血统：出厂 CC0（catalog.json 机读清单＋LICENSES.md 逐条溯源）；取不到→房间层，
// 机器不撒谎（honest fallback）。
import { resolveSoundParams } from '../../sound/core.js';
import { buildEngine } from '../../sound/graph.js';
import { createLiveBridge } from '../../sound/livebridge.js';

const ASSET_FETCH_CAP_MS = 3000;   // 织体资产取件帽：超时按缺席走合成退路（起声不许被粮道拖死）
const RECORD_RETRY_MS = 90000;     // 唱片缺席重试节拍（等 `foley records` 落盘；localhost 轻拍）
const RECORD_RETRY_MAX = 10;
const PUMP_MS = 250;               // 大脑泵：押后窗放行＋前瞻窗兜底（藏页节流下包流仍是主武装）

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`超时 ${ms}ms`)), ms))]);
}

export class SoundBridge {
  constructor(opts = {}) {
    this.repoKey = opts.repoKey || 'live:default';
    this.seed = opts.seed || 'live';
    this._records = [];   // 引擎闭包共享此引用：热装=push 后 setRecord（graph 装盘律原样）
    this._bridge = null;
  }

  /** 开机仪式（用户手势内调用）：起引擎、上钟、开泵。resolve 即有声（房间层）；唱片后到后加入。 */
  async start(firstPkt) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    this.ctx = ctx;

    const spRaw = await fetch('../sound-params.json').then(r => r.json());
    const sp = resolveSoundParams(spRaw);
    this.sp = sp;

    // L1 织体资产（manifest 定标 → graph 数据驱动归一）；缺席/超时不炸桥——合成织体同构顶上
    let assets = null;
    try {
      assets = await withTimeout((async () => {
        const manifest = await fetch('../sound/assets/manifest.json').then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
        const got = {};
        for (const a of manifest.assets) {
          const buf = await fetch(`../sound/assets/${a.file}`).then((r) => { if (!r.ok) throw new Error(`${a.file} ${r.status}`); return r.arrayBuffer(); });
          const ab = await ctx.decodeAudioData(buf);
          got[a.name] = { x: ab.getChannelData(0), sr: ab.sampleRate, rmsDb: a.rmsDb };
        }
        return got;
      })(), ASSET_FETCH_CAP_MS);
    } catch (err) {
      console.warn('[sound] 织体资产缺席，落合成退路（不哑）：', err.message ?? err);
    }

    const eng = buildEngine(ctx, sp, { repoKey: this.repoKey, seed: this.seed, assets, records: this._records, recordIndex: 0 });
    this.engine = eng;

    // 机器代理（DECREE-003 丁-轨甲验收增补）：master 旁挂 AnalyserNode——回归仪测实际渲染波形，
    // 不是账本（门规：账本永不作发声证明）。人耳终审权不因此让渡。
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    eng.nodes.master.connect(this.analyser);

    this._bridge = createLiveBridge(eng, sp);
    if (firstPkt) this._bridge.onPacket(firstPkt);
    this._timer = setInterval(() => this._bridge.pump(), PUMP_MS);

    this._mountRecord(0); // 异步热装，不 await：起声在前，唱片在后（架构方针原文）
    return this;
  }

  /** 唱片装载（异步；缺席按节拍重试——等 `foley records`/B4 粮道通了自动上桥）。 */
  async _mountRecord(attempt) {
    try {
      const catalog = await fetch('../sound/records/catalog.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
      const rec = catalog.records.find(r => r.name === 'still-life') ?? catalog.records[0];
      const buf = await fetch(`../records/${rec.file}`).then(r => { if (!r.ok) throw new Error(`${rec.file} ${r.status}`); return r.arrayBuffer(); });
      const ab = await this.ctx.decodeAudioData(buf);
      const n = ab.length, x = new Float32Array(n);
      for (let c = 0; c < ab.numberOfChannels; c++) {
        const d = ab.getChannelData(c);
        for (let i = 0; i < n; i++) x[i] += d[i] / ab.numberOfChannels;
      }
      this._records.push({ name: rec.name, title: rec.title, x, sr: ab.sampleRate, seconds: ab.duration, lufs: rec.lufs, bpmMeasured: rec.bpmMeasured });
      this.engine.setRecord(0);
      this.record = rec;
      console.log(`[sound] 唱片上桥：${rec.title}（${rec.name}）`);
    } catch (err) {
      if (attempt + 1 < RECORD_RETRY_MAX) {
        this._recordRetry = setTimeout(() => this._mountRecord(attempt + 1), RECORD_RETRY_MS);
      } else {
        console.warn('[sound] 唱片缺席，落房间层（honest fallback）：', err.message ?? err);
      }
    }
  }

  // ---- 总线订阅面（与器件同鸭型；start 未毕时到的包如实丢弃——下一包 50ms 后就来） ----
  onPacket(pkt) { this._bridge && this._bridge.onPacket(pkt); }
  onMoment(m) { this._bridge && this._bridge.onMoment(m); }
  render() { /* 声不走 rAF：调度在音频钟上（体温法：渲染环是画的事） */ }

  /** 机器代理读数：master 总线当下 RMS（回归仪/repro 脚本消费）。 */
  rms() {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let e = 0;
    for (let i = 0; i < buf.length; i++) e += buf[i] * buf[i];
    return Math.sqrt(e / buf.length);
  }

  get recordInfo() { return this.engine ? this.engine.recordInfo : null; }
  stats() { return this._bridge ? this._bridge.stats() : null; }

  stop() {
    if (this._timer) clearInterval(this._timer);
    if (this._recordRetry) clearTimeout(this._recordRetry);
    this.engine?.stop(this.ctx.currentTime + 0.1);
  }
}
