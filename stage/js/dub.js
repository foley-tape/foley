// DUB 剪辑机构（FOLEY_DESIGN_DUB §2，M-T1 剪刀与纸）
//
// 三条铁律在此执行：
// ① 机器提议，人来撕——齿孔是提议，撕开才成立；十秒无动作缓缓淡去，机器不催。
// ② 段内恒速，换速只在接带处——预览即机器亲自把这盘 dub 放一遍：
//    dub 时间均匀走纸（50ms 包网格），源内容按段速压缩采样，段接处打真接带痕。
//    这与 M-T2 的离线导出吃同一份 cuts 时刻表——导出是回放的另一种消费者。
// ③ 素材诚实——tapeHash 记的是真被剪的那卷 CSV；无从摆拍。
//
// 交互法自查：本机构全部交互 ∈ { 按键（DUB/纸长签）、拖选（纸上）、撕（顺齿孔）}。
// 面板零数字维持：时长以纸长签呈现；精确秒数只活在 HUD。
import { PACKET_MS, sampleAt, buildTape } from './replay.js';
import { proposeCuts, cutsDocument } from './cut.js';

const FADE_AFTER_MS = 10000; // 提议搁置十秒，齿孔缓缓淡去
const FADE_SLOW_MS = 2600;
const FADE_QUICK_MS = 480;
const TEAR_DONE = 0.55;      // 撕程过半即断
const SOFT = 0.16;           // 软惯性（≈220ms 收敛，同 loupe 镜头语言）
const MIN_MANUAL_PX = 26;    // 手动拖选下限（约 2s 纸）

async function sha16(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
// 确定性毛边随机源：同带同窗，撕口同形
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class DubController {
  constructor(opts) {
    // { mode, tapeName, tape, replayer, live, chart, deck, feed, feedMoment,
    //   keyEl, tabsEl, overlayEl, chartCanvas, railEl }
    Object.assign(this, opts);
    const q = new URLSearchParams(location.search);
    this.state = 'idle'; // idle|proposing|armed|tearing|fading|torn|resting
    this.dubClock = Math.max(0.25, Number(q.get('dubclock')) || 1); // 加速演出（自动化；纸空间法保墨迹恒等）
    this.auto = q.get('dub') === 'auto';
    this.params = null; this.paramsHash = null;
    this.cuts = null; this.doc = null;
    this.marks = [];        // {pos, end?}——齿孔的纸位（纸空间，随纸走）
    this.stripRange = null; // [pos0, pos1]
    this.alpha = 0; this._alphaTarget = 0; this._fadeRate = FADE_QUICK_MS;
    this._fadeDeadline = null;
    this._perf = null; this._tear = null; this._sel = null;
    this._savedReplay = null; this._lastNow = performance.now();
    this._stripCanvas = null; this._restEl = null;
    this._gatedMoments = []; // 演出期间欠下的真 moments（卡碟语义有状态，恢复时补喂）
    this._doneResolve = null;
    this.done = new Promise(r => { this._doneResolve = r; });
    this._wireDom();
    this._resizeOverlay();
    if (this.auto) setTimeout(() => this.press(), 900);
  }

  // ———————————————————————— 面板接线 ————————————————————————
  _wireDom() {
    this.keyEl.addEventListener('click', () => this.press());
    this.tabsEl.querySelectorAll('.len-tab').forEach(b => {
      b.addEventListener('click', () => {
        this.tabsEl.querySelectorAll('.len-tab').forEach(x => x.removeAttribute('data-on'));
        b.setAttribute('data-on', '');
      });
    });
    const ov = this.overlayEl;
    ov.addEventListener('pointerdown', e => this._pointerDown(e));
    ov.addEventListener('pointermove', e => this._pointerMove(e));
    ov.addEventListener('pointerup', e => this._pointerUp(e));
    ov.addEventListener('pointercancel', e => this._pointerUp(e));
  }
  get targetS() {
    const on = this.tabsEl.querySelector('.len-tab[data-on]');
    return on ? Number(on.dataset.s) : 45;
  }
  _resizeOverlay() {
    const r = this.chartCanvas.getBoundingClientRect();
    const dpr = this.chart.dpr;
    this.overlayEl.width = Math.round(r.width * dpr);
    this.overlayEl.height = Math.round(r.height * dpr);
    this.overlayEl.style.width = `${r.width}px`;
    this.overlayEl.style.height = `${r.height}px`;
  }
  onResize() { this._resizeOverlay(); }

  // ———————————————————————— DUB 键 ————————————————————————
  async press() {
    if (this.state === 'proposing') { this._cancelPerformance(); return; } // 罢演
    if (this.state === 'armed') { this._dismiss(FADE_QUICK_MS); return; }  // 收回提议
    if (this.state !== 'idle' && this.state !== 'resting') return;
    if (this._restEl) { this._restEl.remove(); this._restEl = null; }      // 台面清位
    this.keyEl.classList.add('latched');
    try {
      await this._propose();
    } catch (err) {
      console.warn('[dub] 不提议：', err.message ?? err);
      this.keyEl.classList.remove('latched');
      this.state = 'idle';
    }
  }

  async _loadParams() {
    if (this.params) return;
    const raw = await fetch('cut-params.json').then(r => r.text());
    this.params = JSON.parse(raw);
    this.paramsHash = await sha16(raw);
  }

  async _sourceTape() {
    if (this.mode === 'replay') {
      return { tape: this.tape, curveText: this.tape.curveText, momentsText: this.tape.momentsText ?? 't\n', name: this.tapeName };
    }
    // live：剪今晨的卷（真素材=当刻的 /today 产物流）
    const [c, m] = await Promise.all([
      fetch('/today/curve.csv').then(r => (r.ok ? r.text() : null)),
      fetch('/today/moments.csv').then(r => (r.ok ? r.text() : 't\n')),
    ]);
    if (!c) throw new Error('今晨无卷');
    return { tape: buildTape('today', c, m), curveText: c, momentsText: m, name: 'today' };
  }

  async _propose() {
    await this._loadParams();
    const src = await this._sourceTape();
    const tapeHash = await sha16(src.curveText + '\n' + src.momentsText); // 带=曲线+时刻两件套（金测试同式）
    const cuts = proposeCuts(src.tape, this.params, this.targetS);
    if (cuts.segments.length === 0) throw new Error('无戏可剪');
    this.cuts = cuts;
    this.doc = cutsDocument({
      tapeName: src.name, tapeHash, paramsHash: this.paramsHash,
      targetS: this.targetS, segments: cuts.segments,
    });
    this._startPerformance(src.tape);
  }

  // ———————————————————— 提议演出：机器把 dub 放一遍 ————————————————————
  _startPerformance(srcTape) {
    this.state = 'proposing';
    this._alphaTarget = 1; this._fadeRate = 300;
    this.marks = []; this.stripRange = null;
    this.chart.retain = true;
    this.overlayEl.classList.add('live-gate');
    // 常规喂包挂起：replay 停机；live 由 eats() 吞包（水位照走，恢复即接真）
    if (this.mode === 'replay') {
      this._savedReplay = { t: this.replayer.stageT, playing: this.replayer.playing };
      this.replayer.pause();
    }
    this._deckStuck = { stuck: this.deck.stuck, theta: this.deck.stuckTheta };

    const segs = this.doc.segments;
    const starts = []; let acc = 0;
    for (const s of segs) { starts.push(acc); acc += (s.t1 - s.t0) / s.speed; }
    const events = []; // 段内 moments 映射到 dub 轴（卡碟、脱卡、里程碑都随片走）
    for (let i = 0; i < segs.length; i++) {
      for (const m of srcTape.moments) {
        if (m.stageT >= segs[i].t0 && m.stageT < segs[i].t1) {
          events.push({ dubT: starts[i] + (m.stageT - segs[i].t0) / segs[i].speed, m });
        }
      }
    }
    events.sort((a, b) => a.dubT - b.dubT);

    const p = this._perf = {
      srcTape, segs, starts, events, ei: 0,
      dubDur: acc,
      base: this.chart.lastStageT + PACKET_MS,
      dubT: 0, gridT: 0, segIdx: -1, lastReal: null,
      timer: null,
    };
    // 演出钟走间隔钟（藏页不冻；与 Replayer 同纪律，比包密一倍）
    p.timer = setInterval(() => this._tick(), PACKET_MS / 2);
  }

  _tick() {
    const p = this._perf;
    if (!p) return;
    const now = performance.now();
    if (p.lastReal === null) p.lastReal = now;
    const realDt = Math.min(now - p.lastReal, 500);
    p.lastReal = now;
    p.dubT += realDt * this.dubClock;
    let emitted = 0;
    while (p.gridT <= p.dubT && emitted < 64) {
      if (p.gridT >= p.dubDur) { this._finishPerformance(); return; }
      this._emitAt(p.gridT);
      p.gridT += PACKET_MS;
      emitted++;
    }
  }

  _emitAt(tau) {
    const p = this._perf;
    let i = Math.max(0, p.segIdx);
    while (i + 1 < p.segs.length && tau >= p.starts[i + 1] - 1e-9) i++;
    if (i !== p.segIdx || p.segIdx === -1) {
      // 段界簿记：首段起点即条头齿孔；段接处打真接带痕＋齿孔
      if (p.segIdx === -1) {
        p.stripStart = this.chart.pos;
        this.marks.push({ pos: this.chart.pos, end: true });
      } else {
        this.chart.markSeam();
        this.marks.push({ pos: this.chart.pos });
      }
      p.segIdx = i;
    }
    const seg = p.segs[i];
    const srcT = Math.min(seg.t1 - 1e-6, seg.t0 + (tau - p.starts[i]) * seg.speed);
    const pkt = sampleAt(p.srcTape, srcT);
    // 桥段=快绕：走带是机器自己的动作，供电不看内容；其余段照抄内容
    let phase = pkt.phase, A = pkt.A;
    if (seg.role === 'BRIDGE') { phase = 'WORKING'; A = Math.max(A, 0.3); }
    const dubPkt = { ...pkt, stageT: p.base + tau, phase, A: A * seg.speed };
    while (p.ei < p.events.length && p.events[p.ei].dubT <= tau) {
      this.feedMoment(p.events[p.ei].m);
      p.ei++;
    }
    this.feed(dubPkt, false);
  }

  _finishPerformance() {
    const p = this._perf;
    clearInterval(p.timer);
    this.marks.push({ pos: this.chart.pos, end: true });
    this.stripRange = [p.stripStart, this.chart.pos];
    this._perf = null;
    this.state = 'armed';
    this._fadeDeadline = performance.now() + FADE_AFTER_MS;
    if (this.auto) setTimeout(() => this._autoTear(), 250);
  }

  _cancelPerformance() {
    const p = this._perf;
    if (p) clearInterval(p.timer);
    this._perf = null;
    this._dismiss(FADE_QUICK_MS);
  }

  // 收回提议：齿孔淡去，机器回常规喂包
  _dismiss(rate) {
    this.state = 'fading';
    this._alphaTarget = 0; this._fadeRate = rate;
    this._fadeDeadline = null;
  }
  _finalizeIdle() {
    this.marks = []; this.stripRange = null;
    this.cuts = null; this.doc = null;
    this.chart.retain = false;
    this.overlayEl.classList.remove('live-gate');
    this.keyEl.classList.remove('latched');
    this._resumeFeed();
    this.state = 'idle';
  }
  noteMoment(m) { if (this._gatedMoments.length < 512) this._gatedMoments.push(m); }
  _resumeFeed() {
    if (this.deck.stuck && !this._deckStuck?.stuck) { // 演出把卡碟带走了：恢复上场前的走带姿态
      this.deck.stuck = false; this.deck.stuckTheta = null;
    }
    if (this.mode === 'replay' && this._savedReplay) {
      this._gatedMoments = [];
      this.replayer.seek(this._savedReplay.t);
      if (this._savedReplay.playing) this.replayer.play();
      this._savedReplay = null;
    } else if (this.mode === 'live') {
      for (const m of this._gatedMoments) this.feedMoment(m); // 补喂欠账（卡碟/脱卡终态归位）
      this._gatedMoments = [];
      if (this.live?.lastPkt) this.feed(this.live.lastPkt, false); // 回到真实（伤口留在纸上，随纸滚走）
    }
  }

  // live 真包在演出/提议期间由此吞下（LiveStream 水位照走，恢复即接最新真实）
  eats() {
    return this.state === 'proposing' || this.state === 'armed'
      || this.state === 'tearing' || this.state === 'fading';
  }

  // ———————————————————————— 指针：拖选与撕 ————————————————————————
  _posOf(clientX) {
    const r = this.chartCanvas.getBoundingClientRect();
    const x = clientX - r.left;
    const posNow = this.chart.lastPosNow ?? this.chart.pos;
    return posNow - (this.chart.penX - x);
  }
  _xOf(pos) {
    const posNow = this.chart.lastPosNow ?? this.chart.pos;
    return this.chart.penX - (posNow - pos);
  }

  _capture(e) { try { this.overlayEl.setPointerCapture(e.pointerId); } catch { /* 合成事件无活跃指针 */ } }
  _pointerDown(e) {
    if (this.state === 'armed' && this.stripRange) {
      const [p0, p1] = this.stripRange;
      const pos = this._posOf(e.clientX);
      if (pos >= p0 - 6 && pos <= p1 + 6) {
        this._capture(e);
        this._beginTear(e.clientX);
        return;
      }
    }
    if (this.state === 'idle') { // 手动模式：不按 DUB，直接在纸上拖选
      this._capture(e);
      const pos = this._posOf(e.clientX);
      this._sel = { a: pos, b: pos };
      this._alphaTarget = 1; this._fadeRate = 200;
    }
  }
  _pointerMove(e) {
    if (this._tear) {
      const [p0, p1] = this.stripRange;
      const visW = Math.max(60, Math.min(this._xOf(p1), this.chart.w) - Math.max(this._xOf(p0), 0));
      this._tear.target = Math.min(1.15, Math.abs(e.clientX - this._tear.x0) / (visW * 0.8));
    } else if (this._sel) {
      this._sel.b = this._posOf(e.clientX);
    }
  }
  async _pointerUp(e) {
    if (this._tear) {
      if (this._tear.prog >= TEAR_DONE) this._tearComplete();
      else { this._tear = null; this.state = 'armed'; this._fadeDeadline = performance.now() + FADE_AFTER_MS; }
      return;
    }
    if (this._sel) {
      const sel = this._sel; this._sel = null;
      const [a, b] = [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)];
      if (b - a < MIN_MANUAL_PX || this.state !== 'idle') { if (this.state === 'idle') { this._alphaTarget = 0; this._fadeRate = FADE_QUICK_MS; } return; }
      try { await this._armManual(a, b); }
      catch (err) { console.warn('[dub] 手动选段不成：', err.message ?? err); this._alphaTarget = 0; }
    }
  }

  // 手动拖选成段：原速单段剪（撕即导出该段）
  async _armManual(posA, posB) {
    await this._loadParams();
    const t0 = this.chart.posToStageT(posA), t1 = this.chart.posToStageT(posB);
    if (t0 === null || t1 === null || t1 - t0 < 400) throw new Error('纸上无此段的账');
    let tapeHash = 'live-window';
    let name = this.tapeName;
    if (this.mode === 'replay') {
      tapeHash = await sha16(this.tape.curveText + '\n' + (this.tape.momentsText ?? 't\n'));
    } else {
      const [c, m] = await Promise.all([
        fetch('/today/curve.csv').then(r => (r.ok ? r.text() : null)),
        fetch('/today/moments.csv').then(r => (r.ok ? r.text() : 't\n')),
      ]);
      if (c) tapeHash = await sha16(c + '\n' + m);
      name = 'today';
    }
    const segments = [{ role: 'MANUAL', t0: Math.round(t0), t1: Math.round(t1), speed: 1 }];
    this.cuts = { segments, analysis: null };
    this.doc = cutsDocument({ tapeName: name, tapeHash, paramsHash: this.paramsHash, targetS: 0, segments });
    this.marks = [{ pos: posA, end: true }, { pos: posB, end: true }];
    this.stripRange = [posA, posB];
    this.chart.retain = true; // 撕之前别把这段的账剪了
    this.overlayEl.classList.add('live-gate');
    if (this.mode === 'replay') {
      this._savedReplay = { t: this.replayer.stageT, playing: this.replayer.playing };
      this.replayer.pause();
    }
    this.state = 'armed';
    this.keyEl.classList.add('latched');
    this._alphaTarget = 1;
    this._fadeDeadline = performance.now() + FADE_AFTER_MS;
  }

  _beginTear(clientX) {
    this.state = 'tearing';
    this._stripCanvas = this._composeStrip();
    this._tear = { x0: clientX, target: 0, prog: 0 };
    this._fadeDeadline = null;
  }

  _autoTear() {
    if (this.state !== 'armed') return;
    this._stripCanvas = this._composeStrip();
    this._tear = { x0: 0, target: 1, prog: 1 };
    this.state = 'tearing';
    this._tearComplete();
  }

  async _tearComplete() {
    const [p0, p1] = this.stripRange;
    this._tear = null;
    this.state = 'torn';
    this.chart.woundRange(p0, p1);
    this.chart.retain = false;
    const saved = await this._saveDub().catch(err => { console.warn('[dub] 落盘不成：', err); return null; });
    this._restStrip();
    this.marks = []; this.stripRange = null;
    this._alphaTarget = 0; this._fadeRate = FADE_QUICK_MS;
    this.overlayEl.classList.remove('live-gate');
    this.keyEl.classList.remove('latched');
    this._resumeFeed();
    this.state = 'resting';
    if (this._doneResolve) {
      this._doneResolve({ doc: this.doc, analysis: this.cuts?.analysis ?? null, saved });
      this._doneResolve = null;
    }
  }

  // 撕下的纸条滑落到胡桃木台面上歇着；点它落盘（浏览器下载）
  _restStrip() {
    const c = this._stripCanvas;
    if (!c) return;
    const dpr = this.chart.dpr;
    const wCss = c.width / dpr, hCss = c.height / dpr;
    const chartR = this.chartCanvas.getBoundingClientRect();
    const railR = this.railEl.getBoundingClientRect();
    const scale = Math.min(0.62, (window.innerWidth * 0.56) / wCss);
    const el = document.createElement('div');
    el.id = 'dub-strip-rest';
    el.title = '';
    const img = document.createElement('canvas');
    img.width = c.width; img.height = c.height;
    img.getContext('2d').drawImage(c, 0, 0);
    img.style.width = `${wCss}px`; img.style.height = `${hCss}px`;
    el.appendChild(img);
    el.style.left = `${chartR.left + Math.max(0, this._xOf(this.stripRange[0]))}px`;
    el.style.top = `${chartR.top + 6}px`;
    document.body.appendChild(el);
    const targetX = window.innerWidth * 0.5 - (wCss * scale) * 0.5;
    const targetY = Math.min(railR.top, window.innerHeight - 40) - hCss * scale + 10;
    requestAnimationFrame(() => {
      el.style.transform = `translate(${targetX - parseFloat(el.style.left)}px, ${targetY - parseFloat(el.style.top)}px) rotate(-1.4deg) scale(${scale})`;
    });
    el.addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = `foley-dub-${this.doc?.tape ?? 'tape'}.png`;
      a.href = c.toDataURL('image/png');
      a.click();
    });
    this._restEl = el;
  }

  async _saveDub() {
    const c = this._stripCanvas;
    if (!c || !this.doc) return null;
    const meta = {
      version: this.doc.version,
      kind: 'foley-dub/M-T1-paper',
      tape: this.doc.tape,
      tapeHash: this.doc.tapeHash,
      paramsHash: this.doc.paramsHash,
      targetS: this.doc.targetS,
      segments: this.doc.segments,
      createdAt: new Date().toISOString(),
    };
    const png = c.toDataURL('image/png').split(',')[1];
    const res = await fetch('/dub/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tape: this.doc.tape, png, meta }),
    });
    if (!res.ok) throw new Error(`save ${res.status}`);
    return res.json();
  }

  // ———————————————————— 纸条合成：真墨迹＋齿孔边＋毛边＋FOLEY 边字 ————————————————————
  _composeStrip() {
    const [p0, p1] = this.stripRange;
    const base = this.chart.renderStrip(p0, p1);
    const dpr = this.chart.dpr;
    const margin = 10, vpad = 3;
    const W = base.width + Math.ceil(margin * 2 * dpr);
    const H = base.height + Math.ceil(vpad * 2 * dpr);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(base, Math.ceil(margin * dpr), Math.ceil(vpad * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const wCss = W / dpr, hCss = H / dpr;
    // FOLEY 边字：真记录纸的派印做法，极淡，替机器署名（此外无水印）
    ctx.fillStyle = 'rgba(140,47,27,0.15)';
    ctx.font = '600 6.5px Helvetica, Arial, sans-serif';
    for (let x = 26; x < wCss - 34; x += 260) ctx.fillText('F O L E Y', x, hCss - 4.2);
    // 段界齿孔打穿（接带处的 rouletting 遗孔）
    ctx.globalCompositeOperation = 'destination-out';
    for (const mk of this.marks) {
      if (mk.end) continue;
      const x = margin + (mk.pos - p0);
      for (let y = 7; y < hCss - 5; y += 7) {
        ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 两端毛边：确定性锯齿（同带同窗，撕口同形——毛边也讲素材诚实）
    const seed = (parseInt(this.doc?.tapeHash?.slice(0, 8) ?? '5a5a5a5a', 16) ^ Math.round(p0 * 7)) | 0;
    const rnd = mulberry32(seed);
    for (const side of [0, 1]) {
      const xEdge = side === 0 ? margin : wCss - margin;
      ctx.beginPath();
      ctx.moveTo(side === 0 ? 0 : wCss, -2);
      let y = -2;
      while (y < hCss + 2) {
        const jag = 1.5 + rnd() * 5.5;
        ctx.lineTo(xEdge + (side === 0 ? -jag : jag) + (side === 0 ? 0 : 0), y);
        y += 3.5 + rnd() * 4.5;
        ctx.lineTo(xEdge + (side === 0 ? -(1 + rnd() * 2.5) : (1 + rnd() * 2.5)), y);
      }
      ctx.lineTo(side === 0 ? 0 : wCss, hCss + 2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return c;
  }

  // ———————————————————————— 渲染：齿孔层与撕的软惯性 ————————————————————————
  render(now) {
    const dt = Math.min(now - this._lastNow, 100); this._lastNow = now;
    // 提议搁置超时 → 缓缓淡去
    if (this.state === 'armed' && this._fadeDeadline && now > this._fadeDeadline) {
      this._dismiss(FADE_SLOW_MS);
    }
    // alpha 包络
    const dir = this._alphaTarget - this.alpha;
    if (dir !== 0) {
      const step = dt / this._fadeRate;
      this.alpha = dir > 0 ? Math.min(this._alphaTarget, this.alpha + step) : Math.max(this._alphaTarget, this.alpha - step);
      if (this.state === 'fading' && this.alpha <= 0) this._finalizeIdle();
    }
    // 撕程软惯性
    if (this._tear) this._tear.prog += (this._tear.target - this._tear.prog) * SOFT;

    const ctx = this.overlayEl.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlayEl.width, this.overlayEl.height);
    if (this.alpha <= 0.01 && !this._sel && !this._tear) return;
    const dpr = this.chart.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const h = this.chart.h;

    // 手动拖选：齿孔跟手＋选区微亮
    if (this._sel) {
      const [a, b] = [Math.min(this._sel.a, this._sel.b), Math.max(this._sel.a, this._sel.b)];
      const xa = this._xOf(a), xb = this._xOf(b);
      ctx.fillStyle = `rgba(255, 240, 205, ${0.05 * this.alpha})`;
      ctx.fillRect(xa, 0, xb - xa, h);
      this._roulette(ctx, xa, h, true);
      this._roulette(ctx, xb, h, true);
      return;
    }

    // 撕进行时：暗槽＋条身抬起（软惯性、毛边阴影）
    if (this._tear && this._stripCanvas && this.stripRange) {
      const [p0, p1] = this.stripRange;
      const x0 = this._xOf(p0), prog = this._tear.prog;
      ctx.fillStyle = `rgba(14, 9, 5, ${Math.min(1, prog * 2.2)})`;
      ctx.fillRect(Math.max(0, x0), 0, Math.min(this.chart.w, this._xOf(p1)) - Math.max(0, x0), h);
      ctx.save();
      ctx.translate(x0 - 10, 3 - prog * 9);
      ctx.rotate(-prog * 0.028);
      ctx.shadowColor = `rgba(0,0,0,${0.25 + prog * 0.3})`;
      ctx.shadowBlur = 4 + prog * 10;
      ctx.shadowOffsetY = 2 + prog * 5;
      ctx.drawImage(this._stripCanvas, 0, 0, this._stripCanvas.width / dpr, this._stripCanvas.height / dpr);
      ctx.restore();
      return;
    }

    // 齿孔提议层（proposing 时随纸滚入，armed 时静候）
    for (const mk of this.marks) {
      const x = this._xOf(mk.pos);
      if (x < -8 || x > this.chart.w + 8) continue;
      this._roulette(ctx, x, h, mk.end);
    }
  }

  _roulette(ctx, x, h, end) {
    const a = this.alpha;
    const step = end ? 5 : 7;
    const r = end ? 2.0 : 1.7;
    ctx.fillStyle = `rgba(24, 14, 7, ${0.52 * a})`;
    for (let y = 8; y < h - 5; y += step) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = `rgba(255, 248, 230, ${0.20 * a})`;
    for (let y = 8; y < h - 5; y += step) {
      ctx.beginPath(); ctx.arc(x + 0.4, y + 0.9, r * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
}
