// live 实流客户端（M-S3；M-S4 加"今晨的纸"）
//
// 开机顺序：先订 SSE（进缓冲）→ 吃 /today/curve.csv 铺纸（追赶全史，同步喂包，
// 纸空间全等红利：铺纸与实走在纸上逐像素一致）→ 按 t 去重放行缓冲 → 实时。
// 一台以"纸带即时间轴"立论的机器，不再开机失忆（M2.1 §1.1）。
//
// 钟在包里：stageT = t − t₀，t₀ = 今晨首包。EventSource 是 I/O 驱动，
// 藏页照收、状态照走——这是构造性保证，不是巧合（M2.0 §2 验证件二）。

import { parseCurve, parseMoments, PHASES, WEATHERS } from './replay.js';

export class LiveStream {
  constructor() {
    this.onPacket = [];   // (pkt, isFirst) => void
    this.onMoment = [];
    this.t0 = null;
    this.primed = false;
    this.stateCount = 0;
    this.momentCount = 0;
    this.prefilledCount = 0;
    this.lastPkt = null;
    this.lastT = -Infinity; // 去重水位（原始 t，毫秒）
    this.gone = false;
    this._buffer = [];      // 铺纸期间的 SSE 暂存
    this._buffering = true;
    // 状态可诊（第五号手令 丁-E5）：连接健康态 connecting|live|lost|gone。
    // lost＝服务端不可达/断网（SSE 报错，去抖 1.2s 防瞬断闪烁）或静默看门狗；gone＝live 子进程退出。
    this.onStatus = [];     // (state)=>void
    this.status = 'connecting';
    this._lastRecvAt = 0;
    this._lostTimer = null;
    this._watchdog = null;
  }

  _setStatus(s) {
    if (s === this.status) return;
    this.status = s;
    for (const fn of this.onStatus) fn(s);
  }

  _feedState(obj) {
    if (this.t0 === null) this.t0 = obj.t;
    if (obj.t <= this.lastT) return; // 铺纸已覆盖
    this.lastT = obj.t;
    this.stateCount++;
    const pkt = { ...obj, stageT: obj.t - this.t0 };
    this.lastPkt = pkt;
    const first = !this.primed; this.primed = true;
    for (const fn of this.onPacket) fn(pkt, first);
  }

  _feedMoment(obj) {
    if (this.t0 === null) this.t0 = obj.t;
    this.momentCount++;
    for (const fn of this.onMoment) fn({ ...obj, stageT: obj.t - this.t0 });
  }

  // 今晨的纸：同步喂完 out 产物流的全史
  async prime() {
    let curveText = null, momentsText = 't\n';
    try {
      const [c, m] = await Promise.all([
        fetch('/today/curve.csv').then(r => (r.ok ? r.text() : null)),
        fetch('/today/moments.csv').then(r => (r.ok ? r.text() : 't\n')),
      ]);
      curveText = c; momentsText = m;
    } catch { /* 无今晨（--replay-only 或产物未落）：从现在开始，不算错 */ }
    if (!curveText) return;

    const curve = parseCurve(curveText);
    const moments = parseMoments(momentsText);
    let mi = 0;
    for (let i = 0; i < curve.n; i++) {
      // moments 与包流按 t 合流（灯的余温、卡碟态、计数轮里程都要今晨的账）
      while (mi < moments.length && moments[mi].t <= curve.t[i]) this._feedMoment(moments[mi++]);
      this._feedState({
        t: curve.t[i], S: curve.S[i], T: curve.T[i], A: curve.A[i],
        wow: curve.wow[i], needle: curve.needle[i],
        phase: PHASES[curve.phase[i]], weather: WEATHERS[curve.weather[i]],
        pendingAsk: curve.pendingAsk[i] === 1,
      });
    }
    while (mi < moments.length) this._feedMoment(moments[mi++]);
    this.prefilledCount = curve.n;
  }

  connect() {
    const es = new EventSource('/live');
    this._lastRecvAt = performance.now(); // 宽限起点：连上到首包之间不误判静默
    es.onmessage = (e) => {
      this._lastRecvAt = performance.now();
      clearTimeout(this._lostTimer);            // 有数据＝信号在，撤销待判丢失
      if (this.status !== 'gone' && this.status !== 'live') this._setStatus('live');
      else if (this.status === 'live') { /* 保持 */ }
      let obj;
      try { obj = JSON.parse(e.data); } catch { return; }
      if (this._buffering) { this._buffer.push(obj); return; }
      this._dispatch(obj);
    };
    es.addEventListener('gone', () => { this.gone = true; this._setStatus('gone'); }); // live 子进程退出：源没了
    es.onerror = () => {
      // EventSource 自动重连；瞬断不该闪红——去抖 1.2s 未恢复才判信号丢失（serve 亡/断网）
      if (this.status === 'gone') return;
      clearTimeout(this._lostTimer);
      this._lostTimer = setTimeout(() => this._setStatus('lost'), 1200);
    };
    this.es = es;
    // 静默看门狗：live 有 20Hz 心跳，>2.5s 无包＝喂食断（子进程挂/卡），也判丢失
    this._watchdog = setInterval(() => {
      if (this.status === 'live' && this._lastRecvAt && performance.now() - this._lastRecvAt > 2500) this._setStatus('lost');
    }, 1000);
  }

  _dispatch(obj) {
    if (obj.kind === 'state') this._feedState(obj);
    else if (obj.kind === 'moment') this._feedMoment(obj);
  }

  // prime 完毕后放行缓冲（_feedState 的水位去重挡住重叠段）
  flushBuffer() {
    this._buffering = false;
    for (const obj of this._buffer) this._dispatch(obj);
    this._buffer = [];
  }
}
