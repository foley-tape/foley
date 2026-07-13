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
    this._records = [];   // 引擎闭包共享此引用（按 catalog 序填槽）：热装=填槽后 setRecord（graph 装盘律原样）
    this._catalog = null; // catalog.records（上下曲循环依此，船长反馈：选了三首）
    this.recordIdx = 0;   // 当前上机唱片下标
    this.onRecordChange = null; // (title)=>void：唱片切换/上桥通知（显示牌读之）
    this._bridge = null;
    this.needleDrops = 0; // 落针计次（机器代理只读态，与 rms()/stats() 同族——回归器免竞态读入场仪式）
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

    this._mountRecords(0); // 异步热装，不 await：起声在前，唱片在后（架构方针原文）
    return this;
  }

  /** 唱片装载（异步；缺席按节拍重试）：载全部三首——第一张即起播，其余后台顺序补载，上下曲即时可切。
   *  （船长反馈：一直是那首歌·选了三首。） */
  async _mountRecords(attempt) {
    try {
      const catalog = await fetch('../sound/records/catalog.json').then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
      this._catalog = catalog.records || [];
      if (!this._catalog.length) throw new Error('catalog 空');
      await this._loadRecord(0);          // 第一张：装槽＋起播
      this.engine.setRecord(0);
      this.recordIdx = 0;
      this.onRecordChange?.(this.currentRecordName);
      console.log(`[sound] 唱片上桥：${this.currentRecordName}`);
      for (let i = 1; i < this._catalog.length; i++) {  // 其余后台顺序补载（不阻起声）
        try { await this._loadRecord(i); } catch (e) { console.warn('[sound] 唱片补载失败', i, e?.message ?? e); }
      }
    } catch (err) {
      if ((attempt ?? 0) + 1 < RECORD_RETRY_MAX) {
        this._recordRetry = setTimeout(() => this._mountRecords((attempt ?? 0) + 1), RECORD_RETRY_MS);
      } else {
        console.warn('[sound] 唱片缺席，落房间层（honest fallback）：', err.message ?? err);
      }
    }
  }

  /** 载第 i 张唱片入槽（幂等；catalog 序，槽与 engine.records 同引用）。 */
  async _loadRecord(i) {
    if (this._records[i]) return;
    const rec = this._catalog[i];
    const buf = await fetch(`../records/${rec.file}`).then(r => { if (!r.ok) throw new Error(`${rec.file} ${r.status}`); return r.arrayBuffer(); });
    const ab = await this.ctx.decodeAudioData(buf);
    const n = ab.length, x = new Float32Array(n);
    for (let c = 0; c < ab.numberOfChannels; c++) { const d = ab.getChannelData(c); for (let k = 0; k < n; k++) x[k] += d[k] / ab.numberOfChannels; }
    this._records[i] = { name: rec.name, title: rec.title, x, sr: ab.sampleRate, seconds: ab.duration, lufs: rec.lufs, bpmMeasured: rec.bpmMeasured };
  }

  /** 上/下一曲（dir ±1，循环）：目标已载即换（engine.setRecord 干净停旧起新）；未载则补载后换。返当前曲名。 */
  switchRecord(dir) {
    if (!this._catalog?.length || !this.engine || !this.ctx) return null;
    const n = this._catalog.length;
    const i = (((this.recordIdx + dir) % n) + n) % n;
    const apply = () => { if (this._records[i]) { this.engine.setRecord(i, this.ctx.currentTime + 0.02); this.recordIdx = i; this.onRecordChange?.(this.currentRecordName, true); } };  // 第二参=真人切曲（翻字牌软落针只认手）
    if (this._records[i]) apply(); else this._loadRecord(i).then(apply).catch(() => {});
    return this._catalog[i]?.title ?? null;
  }
  get currentRecordName() { return this._records[this.recordIdx]?.title ?? this._catalog?.[this.recordIdx]?.title ?? ''; }

  /** ⑤ VU 入乐（BATCH3 修宪 甲.3）：master 总线 RMS 包络（dBFS）＝VU 针粮——耳听即针指。
   *  复用轨甲机器代理 analyser（同一只 2048 时域窗·审计庭 RMS 律）；静默地板 −90。 */
  vuDb() {
    if (!this.analyser) return -90;
    if (!this._vuBuf || this._vuBuf.length !== this.analyser.fftSize) this._vuBuf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(this._vuBuf);
    let s = 0; const b = this._vuBuf;
    for (let i = 0; i < b.length; i++) s += b[i] * b[i];
    const rms = Math.sqrt(s / b.length);
    return rms > 1e-5 ? 20 * Math.log10(rms) : -90;
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

  /** 落针宣告（己-5 合龙微单）：轨乙 connect 自证 SSE `wired` 到站时，声桥放一声落针。
   *  声桥未起（手势前）时静默——接线签的视觉退场照走（main.js），声侧下次开机自然有底噪。 */
  needleDrop() {
    if (!this.engine || !this.ctx) return;
    this.needleDrops++;
    this.engine.needleDrop(this.ctx.currentTime + 0.03);
  }

  /** 暂停/恢复（第五号手令 丙.2）：暂停＝唱片随带停（房间常在，只停唱片不停床），恢复＝续播不重建。
   *  单一引擎档位切换——永不二次实例化音频图（丙.1）。 */
  pause() { if (this.engine && this.ctx) this.engine.pauseRecord(this.ctx.currentTime + 0.02); }
  resume() { if (this.engine && this.ctx) this.engine.resumeRecord(this.ctx.currentTime + 0.02); }

  /** 切带淡出/淡入（第五号手令 丁-E2 rule 1）：master 增益平滑坡——绝不销毁音频图（免爆破），
   *  换带只是同一引擎上换喂食源。淡出到近零、淡入回额定。 */
  fadeOut(sec = 0.42) {
    if (!this.engine || !this.ctx) return;
    const g = this.engine.nodes.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(0.0001, t + sec);
  }
  fadeIn(sec = 0.42) {
    if (!this.engine || !this.ctx) return;
    const g = this.engine.nodes.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.linearRampToValueAtTime(0.9, t + sec);
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    if (this._recordRetry) clearTimeout(this._recordRetry);
    this.engine?.stop(this.ctx.currentTime + 0.1);
  }
}
