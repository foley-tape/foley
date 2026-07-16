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
    this.es = null;
    this._namedListeners = [];   // 具名 SSE 监听登记（transport/card/wired…）——重连换 ES 后自动复挂
    this._reconnectTimer = null;
  }

  // 具名 SSE 旁路通告一律经此登记（勿直挂 live.es）：EventSource 致命关闭后 connect() 会换新实例，
  // 直挂的监听会随旧实例失联——transport 推送就乘此线，失联=页面失聪（工单4 P0-3 病灶之一）。
  addEsListener(name, fn) {
    this._namedListeners.push([name, fn]);
    this.es?.addEventListener(name, fn);
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

  // 今晨的纸：只补**尾窗**（P0-3 根修）。整日 curve 可达几十 MB／几十万行，全史同步回灌会把
  // 主线程噎死几十秒＝"迟到者开页全不动"（船长 103MB 案）。纸只能显示 ~57s（penX÷13px·s⁻¹），
  // 尾窗 120s 即全部所需；首包走既有 primed→isFirst=seek 语义：pos/里程一步对齐，SSE 无缝续上。
  async prime() {
    let curveText = null, momentsText = 't\n';
    try {
      const [c, m] = await Promise.all([
        fetch('/today/curve.csv?tailSec=120').then(r => (r.ok ? r.text() : null)),
        fetch('/today/moments.csv').then(r => (r.ok ? r.text() : 't\n')),
      ]);
      curveText = c; momentsText = m;
    } catch { /* 无今晨（--replay-only 或产物未落）：从现在开始，不算错 */ }
    if (!curveText) return;

    const curve = parseCurve(curveText);
    const moments = parseMoments(momentsText);
    let mi = 0;
    // 尾窗配套：窗前的陈年时刻整段跳过——旧 STUCK/RESOLVE 在首包炸串回灌会闩错灯态/卡拍态
    if (curve.n > 0) { while (mi < moments.length && moments[mi].t < curve.t[0]) mi++; }
    // 回灌须越过水位线（P0-3 根修②）：connect 即到的 serve lastState 把 lastT 钉在"现在"，
    // 历史行全部 t≤lastT 被去重吞掉——迟到者纸上从来无史（与 75MB 噎死并列的第二根病根）。
    // 回灌前把钟基与水位回拨到窗口起点：史行升序通过；随后 SSE（t 在窗尾之后）自然续闸。
    if (curve.n > 0) {
      this.t0 = Math.min(this.t0 ?? Infinity, curve.t[0]);
      this.lastT = Math.min(this.lastT, curve.t[0] - 1);
    }
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
    clearTimeout(this._reconnectTimer); this._reconnectTimer = null;
    clearInterval(this._watchdog);       // 重连不叠看门狗
    if (this.es) { try { this.es.close(); } catch { /* 已死 */ } }
    const es = new EventSource('/live');
    this._lastRecvAt = performance.now(); // 宽限起点：连上到首包之间不误判静默
    es.onmessage = (e) => {
      this._lastRecvAt = performance.now();
      clearTimeout(this._lostTimer);            // 有数据＝信号在，撤销待判丢失
      // 数据在流＝live——含 gone 后新 live 子进程复活（工单4 P0-3：gone 不再粘滞，源回来灯语跟着回）
      if (this.status !== 'live') { this.gone = false; this._setStatus('live'); }
      let obj;
      try { obj = JSON.parse(e.data); } catch { return; }
      if (this._buffering) { this._buffer.push(obj); return; }
      this._dispatch(obj);
    };
    es.addEventListener('gone', () => { this.gone = true; this._setStatus('gone'); }); // live 子进程退出：源没了
    es.onerror = () => {
      // EventSource 对网络瞬断会自动重连；但非 200 应答（空会话房厂带期 /live=503）是**致命关闭**
      // （readyState=CLOSED·规范不重试）。工单4 P0-3：transport 推送与包流同乘此线，
      // 断线＝页面失聪——CLOSED 即定时重开新 ES，直到 live 后至（serve 连上即喂 transport 快照，零漏拍）。
      if (es.readyState === EventSource.CLOSED && this.es === es && !this._reconnectTimer) {
        this._reconnectTimer = setTimeout(() => { this._reconnectTimer = null; this.connect(); }, 2000);
      }
      if (this.status === 'gone') return;
      clearTimeout(this._lostTimer);
      this._lostTimer = setTimeout(() => this._setStatus('lost'), 1200);
    };
    for (const [name, fn] of this._namedListeners) es.addEventListener(name, fn);   // 登记过的具名监听复挂
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
