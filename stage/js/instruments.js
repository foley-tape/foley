// 三件器件：VU 针 · 走纸记录仪 · 琥珀管（附双宝石）
//
// 动法纪律：
// · VU 针吃 needle 字段，引擎已做弹簧-阻尼——此处禁自加缓动。渲染仅做
//   相邻两包线性重建（恒迟一包 ≈50ms，时间法：宁迟勿早）。
// · 灯的钨丝热惯性是真实世界的物理，走真实时间（回放倍速不改变灯丝冷却）。
// · 走纸是走带机构，走舞台（磁带）时间；DONE 时纸停，带一口短惯性。

import { PACKET_MS } from './replay.js';

// 影子指标采样（M2.1 §2，informational）：?shadow=1 时上岗。
// 品味验收的机器可判影子：光学不许比物理快；恒迟有界。
const SHADOW = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('shadow') === '1';
if (SHADOW) window.__shadow = { needlePacketPeak: 0, needleRenderPeak: 0, delays: [] };

// —— 两包重建器：显示值 = p0→p1 的线性插值，恒迟一包 ——
// _clock（实例级，M-T2）：胶印离线渲染把收包钟换成虚拟 dub 钟——重建法不变、
// 钟源可换，帧网格上的插值就此确定（同一条恒迟law，两种消费者）。台上器件不受染。
export class PacketPair {
  constructor() { this.p0 = null; this.p1 = null; this.realT1 = 0; this._clock = null; }
  push(pkt, isSeek) {
    if (isSeek || !this.p1) { this.p0 = pkt; this.p1 = pkt; }
    else { this.p0 = this.p1; this.p1 = pkt; }
    this.realT1 = this._clock ? this._clock() : performance.now();
  }
  // f∈[0,1] 走完 p0→p1 的 50ms 窗
  frac(now) { return this.p1 === this.p0 ? 1 : Math.min((now - this.realT1) / PACKET_MS, 1); }
  value(field, now) {
    if (!this.p1) return 0;
    const f = this.frac(now);
    return this.p0[field] + (this.p1[field] - this.p0[field]) * f;
  }
  discrete(field) { return this.p1 ? this.p1[field] : null; }
}

// —— VU 针 ——
const SWEEP = 94; // 总扫角，-47°..+47°
export class VuMeter {
  constructor(svg) {
    this.needleEl = svg.querySelector('#needle-group');
    this.pair = new PacketPair();
    this._buildTicks(svg.querySelector('#ticks'));
  }
  _buildTicks(g) {
    // 刻度弧：无数字（字法）。主刻 5 道，副刻其间；末四分之一加粗（高张力区）。
    const cx = 150, cy = 168, rOut = 118, NS = 'http://www.w3.org/2000/svg';
    const pt = (deg, r) => `${(cx + Math.sin(deg * Math.PI / 180) * r).toFixed(1)} ${(cy - Math.cos(deg * Math.PI / 180) * r).toFixed(1)}`;
    const arc = (a0, a1, r, stroke, wdt) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M ${pt(a0, r)} A ${r} ${r} 0 0 1 ${pt(a1, r)}`);
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', stroke); p.setAttribute('stroke-width', wdt);
      g.appendChild(p);
    };
    // 红区并弧（M1.9 打磨②）：同一条弧上印刷，不浮置
    arc(-47, 23.5, rOut, '#3B3225', 2);
    arc(23.5, 47, rOut, '#6E3A28', 2.6);
    for (let i = 0; i <= 24; i++) {
      const major = i % 6 === 0;
      const a = (-47 + (SWEEP * i) / 24) * (Math.PI / 180);
      const hot = i >= 18;
      const rIn = rOut - (major ? 14 : 8);
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', cx + Math.sin(a) * rIn); line.setAttribute('y1', cy - Math.cos(a) * rIn);
      line.setAttribute('x2', cx + Math.sin(a) * rOut); line.setAttribute('y2', cy - Math.cos(a) * rOut);
      line.setAttribute('stroke', hot ? '#6E3A28' : '#3B3225');
      line.setAttribute('stroke-width', major ? 2.4 : hot ? 1.8 : 1.1);
      g.appendChild(line);
    }
  }
  onPacket(pkt, isSeek) {
    if (SHADOW && this.pair.p1 && !isSeek) {
      const s = Math.abs(pkt.needle - this.pair.p1.needle) / (PACKET_MS / 1000);
      if (s > window.__shadow.needlePacketPeak) window.__shadow.needlePacketPeak = s;
    }
    this.pair.push(pkt, isSeek);
  }
  render(now) {
    const v = Math.max(0, Math.min(1, this.pair.value('needle', now)));
    if (SHADOW) {
      const sh = window.__shadow;
      if (this._lv !== undefined && now > this._ln) {
        const rs = Math.abs(v - this._lv) / ((now - this._ln) / 1000);
        if (rs > sh.needleRenderPeak) sh.needleRenderPeak = rs;
      }
      this._lv = v; this._ln = now;
      if (sh.delays.length < 5000 && this.pair.p1) {
        sh.delays.push((now - this.pair.realT1) + PACKET_MS * (1 - this.pair.frac(now)));
      }
    }
    const deg = -47 + v * SWEEP;
    this.needleEl.setAttribute('transform', `rotate(${deg.toFixed(3)} 150 168)`);
  }
}

// —— 走纸记录仪 ——
// 体温法（M2.1 §1.2）：增量绘制。纸的像素只画一次——每帧把旧纸平移（blit）、
// 右缘补一条新纸、笔在原位落一段新墨；纸槽内阴影挪去 CSS。物理即优化：
// 笔本来就只在笔位写字，是纸把墨迹带走的。
export const PAPER_SPEED = 13; // px / 舞台秒（dub 的齿孔映射与纸条渲染同此尺）
const STOP_TAU = 260;     // ms（舞台时间），纸停惯性
export class ChartRecorder {
  constructor(canvas, tape) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tape = tape;
    this.pair = new PacketPair();
    this.points = [];   // {pos, T}（全量重画与指标采样之源）
    this.seams = [];    // 接带痕的纸位
    this.pos = 0;       // 纸的累计走位（px）
    this.v = PAPER_SPEED;
    this.lastStageT = 0;
    this.spliceIdx = 0;
    this.dpr = window.devicePixelRatio || 1;
    this.needFull = true;
    this.retain = false; // dub 演出中不修剪墨账（撕纸要整条重渲）
    this._resize();
  }
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = r.width * this.dpr; this.canvas.height = r.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.penX = this.w - 56;
    // 纸的双缓冲（ping-pong blit 用；同尺寸位图）
    this.ping = document.createElement('canvas');
    this.pong = document.createElement('canvas');
    for (const c of [this.ping, this.pong]) { c.width = this.canvas.width; c.height = this.canvas.height; }
    this.needFull = true;
  }
  _yOf(T) { const top = 26, bot = this.h - 26; return bot - Math.max(0, Math.min(1, T)) * (bot - top); }

  onPacket(pkt, isSeek) {
    if (isSeek) { // dev 跳带：墨迹重来，纸位对齐（DONE 段忽略，仅调试用）
      this.points = []; this.seams = []; this.spliceIdx = 0;
      this.pos = (pkt.stageT / 1000) * PAPER_SPEED;
      this.v = PAPER_SPEED; this.lastStageT = pkt.stageT;
      this.needFull = true;
      while (this.spliceIdx < this.tape.splices.length && this.tape.splices[this.spliceIdx] < pkt.stageT) this.spliceIdx++;
    }
    const dt = Math.max(0, pkt.stageT - this.lastStageT);
    this.lastStageT = pkt.stageT;
    // 纸速：DONE → 0，其余全速；一阶惯性
    const target = pkt.phase === 'DONE' ? 0 : PAPER_SPEED;
    this.v += (target - this.v) * (1 - Math.exp(-dt / STOP_TAU));
    this.pos += (this.v * dt) / 1000;
    pkt._pos = this.pos;
    // 接带痕
    while (this.spliceIdx < this.tape.splices.length && this.tape.splices[this.spliceIdx] <= pkt.stageT) {
      this.seams.push(this.pos);
      this.spliceIdx++;
    }
    // 墨点（纸停时不堆点）；st 随记——纸位↔舞台时反查之源（dub 手动拖选用）
    const last = this.points[this.points.length - 1];
    if (!last || this.pos - last.pos > 0.15) this.points.push({ pos: this.pos, T: pkt.T, st: pkt.stageT });
    else if (last) { last.T = pkt.T; last.st = pkt.stageT; } // 纸停、笔仍随 T 立着
    // 清理滚出画外的旧墨（dub 保留模式下欠着不剪）
    if (!this.retain) {
      const cutoff = this.pos - this.penX - 40;
      let drop = 0;
      while (drop < this.points.length - 1 && this.points[drop + 1].pos < cutoff) drop++;
      if (drop > 0) this.points.splice(0, drop);
      if (this.seams.length && this.seams[0] < cutoff) this.seams.shift();
    }
    this.pair.push(pkt, isSeek);
  }

  // —— dub 剪辑机构的三件小 API（M-T1）：接带痕 / 纸位反查 / 撕除伤口 ——
  markSeam() { this.seams.push(this.pos); } // 段接处打一道真接带痕（落在纸上，随纸走）
  posToStageT(pos) {
    const pts = this.points;
    if (pts.length === 0) return null;
    let lo = 0, hi = pts.length - 1;
    if (pos <= pts[0].pos) return pts[0].st;
    if (pos >= pts[hi].pos) return pts[hi].st;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].pos <= pos) lo = mid; else hi = mid; }
    return pts[lo].st;
  }
  woundRange(pos0, pos1) {
    // 撕走的纸：位图上露出机腔暗槽，墨账同步剜除（needFull 也不还魂）；两侧算接带痕
    const pctx = this.ping.getContext('2d');
    pctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const posNow = this.paperPos ?? this.pos;
    const x0 = Math.max(-4, this.penX - (posNow - pos0));
    const x1 = Math.min(this.w + 4, this.penX - (posNow - pos1));
    if (x1 > x0) { pctx.fillStyle = '#0E0905'; pctx.fillRect(x0, 0, x1 - x0, this.h); }
    this.points = this.points.filter(p => p.pos < pos0 - 0.5 || p.pos > pos1 + 0.5);
    this.seams = this.seams.filter(s => s < pos0 - 0.5 || s > pos1 + 0.5);
    this.seams.push(pos0, pos1);
    this.seams.sort((a, b) => a - b);
  }

  // 纸条重渲（撕纸的产物之源）：纸空间全等红利——points/seams 即墨迹账本，
  // 任意窗宽离屏重渲与实走逐像素同种（同一支 _paperStrip/_inkPaths 笔法）。
  renderStrip(pos0, pos1) {
    const wCss = Math.max(1, pos1 - pos0);
    const c = document.createElement('canvas');
    c.width = Math.ceil(wCss * this.dpr); c.height = Math.round(this.h * this.dpr);
    const pctx = c.getContext('2d');
    pctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._paperStrip(pctx, 0, pos1, wCss);
    this._inkPaths(pctx, pos => pos - pos0, wCss, pos0 - 4, pos1 + 4);
    return c;
  }

  render(now) {
    if (!this.pair.p1) return;
    // 纸位走两包重建，与针同钟
    const pos1 = this.pair.p1._pos ?? this.pos;
    const pos0 = this.pair.p0?._pos ?? pos1;
    const posNow = pos0 + (pos1 - pos0) * this.pair.frac(now);
    const penY = this._yOf(this.pair.value('T', now));

    // blit 只走整数设备像素（亚像素位移反复自拷贝＝把墨抹成雾），余数入账下一帧
    const rawShift = this.lastPosNow === undefined ? Infinity : posNow - this.lastPosNow;
    if (this.needFull || rawShift < 0 || rawShift > 24) {
      this._fullPaper(posNow);          // 开机/跳带/藏页归来：整窗重画一次
      this.needFull = false;
      this._subDev = 0;
      this.paperPos = posNow;           // 纸位图当前对齐的纸位
    } else {
      const totalDev = rawShift * this.dpr + (this._subDev ?? 0);
      const devShift = Math.floor(totalDev);
      this._subDev = totalDev - devShift;
      const penMoved = Math.abs(penY - (this.lastPenY ?? penY)) > 0.05;
      if (devShift > 0) {
        this._advancePaper(devShift / this.dpr, devShift, penY);
        this.paperPos += devShift / this.dpr;
      } else if (penMoved) {
        // 纸没挪、笔在动：原位落竖墨（真实记录仪的做派）
        const pctx = this.ping.getContext('2d');
        pctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this._inkStroke(pctx, this.penX, this.lastPenY ?? penY, this.penX, penY);
      } else {
        this.lastPosNow = posNow;
        return;                         // 纸停笔停：零绘制帧（体温法）
      }
    }
    this.lastPosNow = posNow; this.lastPenY = penY;

    // 合成：纸位图 1:1 + 笔桥
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.ping, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._drawPen(penY);
  }

  // 纸空间基准：pos(x) = posNow + (x − penX)；右缘 R = posNow + (w − penX)
  // wOpt：dub 纸条离屏重渲传任意窗宽，常规走 this.w
  _paperStrip(pctx, x0, R, wOpt) {
    const w = wOpt ?? this.w, { h } = this;
    const bg = pctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#DECDA2'); bg.addColorStop(0.5, '#E9D9B2'); bg.addColorStop(1, '#D9C79A');
    pctx.fillStyle = bg; pctx.fillRect(x0, 0, w - x0 + 1, h);
    const posLo = R - (w - x0);
    pctx.strokeStyle = 'rgba(140,47,27,0.18)'; pctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = this._yOf(i / 4);
      pctx.beginPath(); pctx.moveTo(x0, y); pctx.lineTo(w, y); pctx.stroke();
    }
    const gridPx = PAPER_SPEED * 5;
    pctx.strokeStyle = 'rgba(140,47,27,0.11)';
    for (let m = Math.ceil(posLo / gridPx) * gridPx; m <= R; m += gridPx) {
      const x = w - (R - m);
      pctx.beginPath(); pctx.moveTo(x, 14); pctx.lineTo(x, h - 14); pctx.stroke();
    }
    pctx.fillStyle = 'rgba(58,34,18,0.5)';
    for (let m = Math.ceil((posLo - 3) / 26) * 26; m <= R + 3; m += 26) {
      const x = w - (R - m);
      pctx.beginPath(); pctx.arc(x, 8, 2.2, 0, Math.PI * 2); pctx.arc(x, h - 8, 2.2, 0, Math.PI * 2); pctx.fill();
    }
    for (const s of this.seams) {
      if (s < posLo - 6 || s > R + 6) continue;
      const x = w - (R - s);
      pctx.strokeStyle = 'rgba(58,34,18,0.22)'; pctx.lineWidth = 2;
      pctx.beginPath(); pctx.moveTo(x + 3, 4); pctx.lineTo(x - 3, h - 4); pctx.stroke();
      pctx.strokeStyle = 'rgba(255,250,235,0.35)'; pctx.lineWidth = 1;
      pctx.beginPath(); pctx.moveTo(x + 4, 4); pctx.lineTo(x - 2, h - 4); pctx.stroke();
    }
  }

  _inkStroke(pctx, x0, y0, x1, y1) {
    for (const pass of [{ c: 'rgba(140,47,27,0.25)', wdt: 3.2 }, { c: '#8C2F1B', wdt: 1.5 }]) {
      pctx.strokeStyle = pass.c; pctx.lineWidth = pass.wdt;
      pctx.lineCap = 'round';
      pctx.beginPath(); pctx.moveTo(x0, y0); pctx.lineTo(x1, y1); pctx.stroke();
    }
  }

  _advancePaper(cssShift, devShift, penY) {
    const pctx = this.pong.getContext('2d');
    pctx.setTransform(1, 0, 0, 1, 0, 0);
    pctx.clearRect(0, 0, this.pong.width, this.pong.height);
    pctx.drawImage(this.ping, -devShift, 0);   // 整数设备像素：无重采样，纸永久锐利
    pctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const newPos = this.paperPos + cssShift;
    const R = newPos + (this.w - this.penX);
    this._paperStrip(pctx, this.w - cssShift - 8, R);
    // 落墨：笔原地写，纸带走墨迹；接带越笔即断笔
    const seamCross = this.seams.some(s => s > newPos - cssShift - 0.01 && s <= newPos + 0.01);
    if (!seamCross) this._inkStroke(pctx, this.penX - cssShift, this.lastPenY ?? penY, this.penX, penY);
    const t = this.ping; this.ping = this.pong; this.pong = t;
  }

  _fullPaper(posNow) {
    const pctx = this.ping.getContext('2d');
    pctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const R = posNow + (this.w - this.penX);
    this._paperStrip(pctx, 0, R);
    this._inkPaths(pctx, pos => this.penX - (posNow - pos), this.penX);
  }

  // 全量墨线（points 之源）：洇痕与实线两遍，接带处断笔。窗重画与纸条重渲共用一支笔。
  _inkPaths(pctx, xOf, xMax, posLo = -Infinity, posHi = Infinity) {
    if (this.points.length < 2) return;
    for (const pass of [{ c: 'rgba(140,47,27,0.25)', wdt: 3.2 }, { c: '#8C2F1B', wdt: 1.5 }]) {
      pctx.strokeStyle = pass.c; pctx.lineWidth = pass.wdt;
      pctx.lineJoin = 'round'; pctx.lineCap = 'round';
      pctx.beginPath();
      let started = false, seam = 0;
      for (const p of this.points) {
        if (p.pos < posLo) continue;
        if (p.pos > posHi) break;
        const x = xOf(p.pos);
        if (x > xMax + 1) break;
        while (seam < this.seams.length && this.seams[seam] < p.pos - 0.01) seam++;
        const brk = seam < this.seams.length && Math.abs(this.seams[seam] - p.pos) < 1.2;
        if (!started || brk) { pctx.moveTo(x, this._yOf(p.T)); started = true; }
        else pctx.lineTo(x, this._yOf(p.T));
      }
      pctx.stroke();
    }
  }

  _drawPen(penY) {
    const { ctx, h } = this;
    ctx.fillStyle = 'rgba(30,22,14,0.85)';
    ctx.fillRect(this.penX + 8, 0, 7, h);
    ctx.strokeStyle = 'rgba(20,14,8,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(this.penX + 9, penY - 7); ctx.lineTo(this.penX + 1, penY); ctx.lineTo(this.penX + 9, penY + 7); ctx.stroke();
    ctx.fillStyle = '#8C2F1B';
    ctx.beginPath(); ctx.arc(this.penX, penY, 2, 0, Math.PI * 2); ctx.fill();
  }
  onMoment() {}
}

// —— 灯组：琥珀管（ASK 呼吸）＋ 绿宝石（DONE / RESOLVE 一闪）＋ 待机粒 ——
// 钨丝包络走真实时间；呼吸是对人的信号，也走真实时间。
const BREATH_MS = 4200;
export class Lamps {
  constructor(tubeEl, emeraldEl, pilotEl) {
    this.tube = tubeEl; this.emerald = emeraldEl; this.pilot = pilotEl;
    this.askEnv = 0; this.doneEnv = 0; this.flash = 0;
    this.phase = 'IDLE';
    this.lastNow = performance.now();
  }
  onPacket(pkt) { this.phase = pkt.phase; this.pendingAsk = pkt.pendingAsk; }
  onMoment(m) { if (m.special === 'RESOLVE') this.flash = 1; }
  render(now) {
    const dt = Math.min(now - this.lastNow, 100); this.lastNow = now;
    const rise = (x, tau) => x + (1 - x) * (1 - Math.exp(-dt / tau));
    const fall = (x, tau) => x * Math.exp(-dt / tau);

    // 琥珀：终身只说一句话——"需要你"
    this.askEnv = this.pendingAsk ? rise(this.askEnv, 130) : fall(this.askEnv, 210);
    const breath = 0.56 + 0.44 * Math.sin((now % BREATH_MS) / BREATH_MS * Math.PI * 2);
    this.tube.style.setProperty('--lit', (this.askEnv * breath).toFixed(4));

    // 绿宝石只说一个词——成了（宪法 v1.2 修正案 B）：
    // 常亮＝这一场成了（DONE）；一闪＝这一件成了（RESOLVE）
    this.doneEnv = this.phase === 'DONE' ? rise(this.doneEnv, 90) : fall(this.doneEnv, 220);
    this.flash = fall(this.flash, 320);
    this.emerald.style.setProperty('--lit', Math.min(1, this.doneEnv + this.flash).toFixed(4));

    // MAIN＝待机粒（M1.9 打磨③，正式绑定）：通电即暗暖常亮，钨丝奶油。
    // 它是 IDLE 时整机唯一的灯——机器睡在暗处，这一粒说"我在"。
    this.pilot.style.setProperty('--lit', '0.55');
  }
}
