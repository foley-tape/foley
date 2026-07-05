// 三件器件：VU 针 · 走纸记录仪 · 琥珀管（附双宝石）
//
// 动法纪律：
// · VU 针吃 needle 字段，引擎已做弹簧-阻尼——此处禁自加缓动。渲染仅做
//   相邻两包线性重建（恒迟一包 ≈50ms，时间法：宁迟勿早）。
// · 灯的钨丝热惯性是真实世界的物理，走真实时间（回放倍速不改变灯丝冷却）。
// · 走纸是走带机构，走舞台（磁带）时间；DONE 时纸停，带一口短惯性。

import { PACKET_MS } from './replay.js';

// —— 两包重建器：显示值 = p0→p1 的线性插值，恒迟一包 ——
export class PacketPair {
  constructor() { this.p0 = null; this.p1 = null; this.realT1 = 0; }
  push(pkt, isSeek) {
    if (isSeek || !this.p1) { this.p0 = pkt; this.p1 = pkt; }
    else { this.p0 = this.p1; this.p1 = pkt; }
    this.realT1 = performance.now();
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
  onPacket(pkt, isSeek) { this.pair.push(pkt, isSeek); }
  render(now) {
    const v = Math.max(0, Math.min(1, this.pair.value('needle', now)));
    const deg = -47 + v * SWEEP;
    this.needleEl.setAttribute('transform', `rotate(${deg.toFixed(3)} 150 168)`);
  }
}

// —— 走纸记录仪 ——
const PAPER_SPEED = 13;   // px / 舞台秒
const STOP_TAU = 260;     // ms（舞台时间），纸停惯性
export class ChartRecorder {
  constructor(canvas, tape) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tape = tape;
    this.pair = new PacketPair();
    this.points = [];   // {pos, T}
    this.seams = [];    // 接带痕的纸位
    this.pos = 0;       // 纸的累计走位（px）
    this.v = PAPER_SPEED;
    this.lastStageT = 0;
    this.spliceIdx = 0;
    this.dpr = window.devicePixelRatio || 1;
    this._resize();
  }
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = r.width * this.dpr; this.canvas.height = r.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.penX = this.w - 56;
  }
  _yOf(T) { const top = 26, bot = this.h - 26; return bot - Math.max(0, Math.min(1, T)) * (bot - top); }

  onPacket(pkt, isSeek) {
    if (isSeek) { // dev 跳带：墨迹重来，纸位对齐（DONE 段忽略，仅调试用）
      this.points = []; this.seams = []; this.spliceIdx = 0;
      this.pos = (pkt.stageT / 1000) * PAPER_SPEED;
      this.v = PAPER_SPEED; this.lastStageT = pkt.stageT;
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
    // 墨点（纸停时不堆点）
    const last = this.points[this.points.length - 1];
    if (!last || this.pos - last.pos > 0.15) this.points.push({ pos: this.pos, T: pkt.T });
    else if (last) last.T = pkt.T; // 纸停、笔仍随 T 立着
    // 清理滚出画外的旧墨
    const cutoff = this.pos - this.penX - 40;
    let drop = 0;
    while (drop < this.points.length - 1 && this.points[drop + 1].pos < cutoff) drop++;
    if (drop > 0) this.points.splice(0, drop);
    if (this.seams.length && this.seams[0] < cutoff) this.seams.shift();
    this.pair.push(pkt, isSeek);
  }

  render(now) {
    const { ctx, w, h } = this;
    if (!this.pair.p1) return;
    // 纸位也走两包重建，与针同钟
    const pos1 = this.pair.p1._pos ?? this.pos;
    const pos0 = this.pair.p0?._pos ?? pos1;
    const posNow = pos0 + (pos1 - pos0) * this.pair.frac(now);

    // 纸面
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#DECDA2'); g.addColorStop(0.5, '#E9D9B2'); g.addColorStop(1, '#D9C79A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    const xOf = (pos) => this.penX - (posNow - pos);

    // 网格（无数字）：横 5 道、纵每 5 舞台秒一道，随纸走
    ctx.strokeStyle = 'rgba(140,47,27,0.18)'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = this._yOf(i / 4);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    const gridPx = PAPER_SPEED * 5;
    ctx.strokeStyle = 'rgba(140,47,27,0.11)';
    for (let x = this.penX - Math.ceil((posNow % gridPx)); x > -gridPx; x -= gridPx) {
      ctx.beginPath(); ctx.moveTo(x + gridPx, 14); ctx.lineTo(x + gridPx, h - 14); ctx.stroke();
    }

    // 齿孔（介质的触感）
    ctx.fillStyle = 'rgba(58,34,18,0.5)';
    const holeStep = 26;
    for (let x = this.penX - Math.ceil(posNow % holeStep); x < w + holeStep; x += holeStep) {
      ctx.beginPath(); ctx.arc(x, 8, 2.2, 0, Math.PI * 2); ctx.arc(x, h - 8, 2.2, 0, Math.PI * 2); ctx.fill();
    }

    // 接带痕：一道细的斜浅痕
    for (const s of this.seams) {
      const x = xOf(s);
      if (x < -6 || x > w + 6) continue;
      ctx.strokeStyle = 'rgba(58,34,18,0.22)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 3, 4); ctx.lineTo(x - 3, h - 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,250,235,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 4, 4); ctx.lineTo(x - 2, h - 4); ctx.stroke();
    }

    // 牛血红墨线：先一遍洇痕，再一遍实线；接带处断笔
    if (this.points.length > 1) {
      for (const pass of [{ c: 'rgba(140,47,27,0.25)', wdt: 3.2 }, { c: '#8C2F1B', wdt: 1.5 }]) {
        ctx.strokeStyle = pass.c; ctx.lineWidth = pass.wdt;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        let started = false, seam = 0;
        for (const p of this.points) {
          const x = xOf(p.pos);
          if (x > this.penX + 1) break;
          while (seam < this.seams.length && this.seams[seam] < p.pos - 0.01) seam++;
          const brk = seam < this.seams.length && Math.abs(this.seams[seam] - p.pos) < 1.2;
          if (!started || brk) { ctx.moveTo(x, this._yOf(p.T)); started = true; }
          else ctx.lineTo(x, this._yOf(p.T));
        }
        ctx.stroke();
      }
    }

    // 笔桥与笔尖：笔位即当刻 T（数据直驱，禁缓动）
    const penY = this._yOf(this.pair.value('T', now));
    ctx.fillStyle = 'rgba(30,22,14,0.85)';
    ctx.fillRect(this.penX + 8, 0, 7, h);
    ctx.strokeStyle = 'rgba(20,14,8,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(this.penX + 9, penY - 7); ctx.lineTo(this.penX + 1, penY); ctx.lineTo(this.penX + 9, penY + 7); ctx.stroke();
    ctx.fillStyle = '#8C2F1B';
    ctx.beginPath(); ctx.arc(this.penX, penY, 2, 0, Math.PI * 2); ctx.fill();

    // 纸槽内阴影
    const sh = ctx.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, 'rgba(20,12,6,0.35)'); sh.addColorStop(0.12, 'rgba(20,12,6,0)');
    sh.addColorStop(0.88, 'rgba(20,12,6,0)'); sh.addColorStop(1, 'rgba(20,12,6,0.4)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
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
