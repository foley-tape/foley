// live 实流客户端（M-S3）—— 吃 /live SSE 的真 20Hz 广播（StatePacket / MomentEvent）。
//
// 与回放客户端同一副器件接口（onPacket / onMoment），stageT = t − t0 归一。
// 钟在包里：live 不需要本地时间轴——每只包自带 t，藏页时 SSE 照收、状态照走
// （EventSource 是 I/O 驱动，不吃标签页节流；这正是 M2.0 §2 验证件二的构造性保证）。

export class LiveStream {
  constructor() {
    this.onPacket = [];   // (pkt, isFirst) => void
    this.onMoment = [];
    this.t0 = null;
    this.primed = false;
    this.stateCount = 0;
    this.momentCount = 0;
    this.lastPkt = null;
    this.gone = false;
  }

  connect() {
    const es = new EventSource('/live');
    es.onmessage = (e) => {
      let obj;
      try { obj = JSON.parse(e.data); } catch { return; }
      if (this.t0 === null) this.t0 = obj.t;
      if (obj.kind === 'state') {
        this.stateCount++;
        const pkt = { ...obj, stageT: obj.t - this.t0 };
        this.lastPkt = pkt;
        const first = !this.primed; this.primed = true;
        for (const fn of this.onPacket) fn(pkt, first);
      } else if (obj.kind === 'moment') {
        this.momentCount++;
        for (const fn of this.onMoment) fn({ ...obj, stageT: obj.t - this.t0 });
      }
    };
    es.addEventListener('gone', () => { this.gone = true; });
    es.onerror = () => { /* EventSource 自动重连；服务器没了由 gone 记账 */ };
    this.es = es;
  }
}
