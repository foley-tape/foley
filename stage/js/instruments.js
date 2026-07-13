// 三件器件：VU 针 · 走纸记录仪 · 琥珀管（附双宝石）
//
// 动法纪律：
// · VU 针吃 needle 字段，引擎已做弹簧-阻尼——此处禁自加缓动。渲染仅做
//   相邻两包线性重建（恒迟一包 ≈50ms，时间法：宁迟勿早）。
// · 灯的钨丝热惯性是真实世界的物理，走真实时间（回放倍速不改变灯丝冷却）。
// · 走纸是走带机构，走舞台（磁带）时间；DONE 时纸停，带一口短惯性。

import { PACKET_MS } from './replay.js';
import { vuTravel, travelToDeg, VuMovement, VU_SWEEP } from './vu-law.js';

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
const SWEEP = VU_SWEEP; // 总扫角 -47°..+47°（vu-law 单源：表脸几何＝针弹道同一张尺）
// ?vutrace=1 诊断口：逐帧记 [t, 行程, 驱动]（弹道验收器·不入正常路径）
const VUTRACE = typeof location !== 'undefined'
  && new URLSearchParams(location.search).has('vutrace');
if (VUTRACE) window.__vutrace = [];
export class VuMeter {
  constructor(svg) {
    this.needleEl = svg.querySelector('.vu-needle');   // decree12①：指针=CSS 元件；表脸=渲染贴图(刻度已烙·94°弧配弹道)
    this.shadowEl = svg.querySelector('.vu-needle-shadow');   // Z 轴深度：针的落影孪生（屏幕空间定向·随针同帧转）
    this.pair = new PacketPair();
    // ⑤ 修宪（BATCH3 裁决 甲.3）：VU＝master 总线真实包络——音量表看音乐睡觉是撒谎；表脸改名 LEVEL
    // 之日即该同步此义。source＝声桥 dB 抽头（外接·声起即上位）；无声桥（手势前/?sound=0）退旧
    // 事件弹道兜底——机器在动比死针诚实。纸仍独占张力（死规矩②的"VU 不吃 T"半边原样成立）。
    this.source = null;
    this._move = new VuMovement();   // ⑤复审：二阶弹簧阻尼表头（一阶平滑=雨刮器，已废）
    this._fed = false;
    this._srcT = null;
  }
  /* _buildTicks 已葬（清葬批·发现栏原令）：板前时代 SVG 自画刻度遗物——表脸自⑤起烙板
     （vu_texture.py），零调用点。 */
  onPacket(pkt, isSeek) {
    if (SHADOW && this.pair.p1 && !isSeek) {
      const s = Math.abs(pkt.needle - this.pair.p1.needle) / (PACKET_MS / 1000);
      if (s > window.__shadow.needlePacketPeak) window.__shadow.needlePacketPeak = s;
    }
    this.pair.push(pkt, isSeek);
  }
  render(now) {
    let v;
    if (this.source) {
      // 表脸即真值表（vu-law 查表锚死画上 20/10/5/0/+3）：0VU≡−20dBFS 砸在画上红区界。
      // ±0.15dB 迟滞死区掐掉 RMS 帧抖——微颤不是机械是数字噪声，源头处死；质量低通是第二道。
      const db = this.source();
      if (this._dbHeld === undefined || Math.abs(db - this._dbHeld) > 0.15) this._dbHeld = db;
      const dt = this._srcT === null ? 16 : Math.min(100, now - this._srcT);
      if (!this._fed) { this._fed = true; this._move.pos = this._move.drive = this._lastV || 0; }  // 换粮首帧从现位接管，不跳针
      v = this._move.step(vuTravel(this._dbHeld), dt);
    } else {
      // 事件弹道兜底：引擎已做弹簧-阻尼——此处禁自加缓动（动法纪律①原样成立）
      v = Math.max(0, Math.min(1, this.pair.value('needle', now)));
    }
    this._srcT = now;
    this._lastV = v;
    if (VUTRACE && window.__vutrace.length < 20000) {
      window.__vutrace.push([Math.round(now), +v.toFixed(4), +this._move.drive.toFixed(4)]);
    }
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
    const deg = travelToDeg(v).toFixed(2);
    if (deg !== this._deg) {                 // P0-1②：针不动＝零样式写（0.01° 步进远细于肉眼）
      this._deg = deg;
      this.needleEl.style.transform = `rotate(${deg}deg)`;
      // 落影同帧同角：translate 先于 rotate＝偏移在屏幕空间（光定死·影方向不随针转）；偏移与 CSS 基态同值
      if (this.shadowEl) this.shadowEl.style.transform = `translate(110%, 4.2%) rotate(${deg}deg)`;
    }
  }
}

// —— 走纸记录仪 ——
// 体温法（M2.1 §1.2）：增量绘制。纸的像素只画一次——每帧把旧纸平移（blit）、
// 右缘补一条新纸、笔在原位落一段新墨；纸槽内阴影挪去 CSS。物理即优化：
// 笔本来就只在笔位写字，是纸把墨迹带走的。
export const PAPER_SPEED = 16.5; // px / 舞台秒（dub 的齿孔映射与纸条渲染同此尺）——④船长旋钮"稍微快一点"：13→16.5
const STOP_TAU = 260;     // ms（舞台时间），纸停惯性
export class ChartRecorder {
  constructor(canvas, tape) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tape = tape;
    this.paperImg = new Image(); this.paperImg.src = 'assets/paper.png';   // decree12：纸理来自渲染管线贴图，非 CSS 手画栅格
    this.paperImg.onload = () => { this.needFull = true; };                 // 贴图到→整窗重画一次
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
    // ④ 钢笔回魂：渲染笔针总成（#pen-head·伺服滑针 translateY）——墨笔硬锁＝针尖与墨端同一 penY；
    //    枢轴壳（板上检流计座）读作伺服马达座。元素缺席优雅退化（画布墨湾仍在）。
    this.penHead = document.getElementById('pen-head');
    this._penTy = null;
    this.pips = [];   // ④ 时刻痕 {pos,big}：事故族（STUCK/FAIL）高痕·节点族（RESOLVE/DONE/ASK）底缘短痕
    this._resize();
  }
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = r.width; this.h = r.height;
    this.canvas.width = r.width * this.dpr; this.canvas.height = r.height * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // ④复审：墨端＝针尖物理极点。由 DOM 实测反推（同一 CSS 坐标系·零系统差）：
    // apex 在 sprite 帧内比例 0.18276＝(apex_u 0.66532 − 层左 0.649609)/层宽 0.0859375（渲染打点导出，几何常量）；
    // penX ＝ 针层盒左 + 0.18276×层宽 − 画布盒左 − 2px（笔尖压线：锥尾 AA 亚像素段，墨自针下渗出）。
    // 教训在案：坐标换算隔一层猜一层（w−56 差 9px、比例法仍差 ~5px）——两盒同系实测才闭环。
    const ph = this.penHead?.getBoundingClientRect?.();
    this.penX = (ph && ph.width) ? (ph.left + ph.width * 0.18276 - r.left) - 2 : this.w - 56;
    // 纸的双缓冲（ping-pong blit 用；同尺寸位图）
    this.ping = document.createElement('canvas');
    this.pong = document.createElement('canvas');
    for (const c of [this.ping, this.pong]) { c.width = this.canvas.width; c.height = this.canvas.height; }
    this.needFull = true;
  }
  // ④ 增益重标定（船长旋钮"幅度大一点"）：中带扩张 S 曲线——真实会话的窄 T 摆幅放大 ~1.66×，
  // 两端软膝（AUDIT 幕七满摆不削顶；tanh 归一保 0/1 仍落纸缘内）。线性旧法：e=t。
  _yOf(T) {
    const top = 26, bot = this.h - 26;
    const t = Math.max(0, Math.min(1, T));
    const k = 3.0;
    const e = 0.5 + Math.tanh((t - 0.5) * k) / (2 * Math.tanh(k / 2));
    return bot - e * (bot - top);
  }
  // 切带清纸（第五号手令 丁-E2）：换带即换纸——墨账清零、接带痕重置、可换 tape 引用（splices 决接痕）。
  reset(tape) {
    if (tape) this.tape = tape;
    this.points = []; this.seams = []; this.pips = []; this.pos = 0; this.lastStageT = 0; this.spliceIdx = 0;
    this.pair = new PacketPair(); this.needFull = true;
  }

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
    this._lastPktWall = performance.now();   // ④ 颤的包鲜度闸之源（暂停断流≠停机，v 留旧值会假活）
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
      if (this.pips.length && this.pips[0].pos < cutoff) this.pips = this.pips.filter(p => p.pos >= cutoff);
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
    // ④ 笔尖永不死：马达在转笔就有微颤（振动经械体传导·写进墨里——平线也是活的平线）；
    //    停机（DONE 滑停 v→0）笔真休；暂停/断流（包不再来）颤同灭——否则"纸停笔动"分支原位堆墨成疱。
    const fresh = now - (this._lastPktWall ?? -1e9) < 400 ? 1 : 0;
    const live = fresh * Math.min(1, Math.max(0, this.v / PAPER_SPEED));
    const trem = live * 0.6 * (Math.sin(now / 37) + 0.6 * Math.sin(now / 23) + 0.35 * Math.sin(now / 11)) / 1.95;
    const penY = this._yOf(this.pair.value('T', now)) + trem;

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

    // 合成：纸位图 1:1 + 墨湾
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.ping, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._drawPen(penY);
    // ④ 伺服滑针随墨端（值不变零写）：针尖 y ≡ penY＝墨端 y——墨笔硬锁
    if (this.penHead) {
      const ty = (penY - this._yOf(0.5)).toFixed(2);
      if (this._penTy !== ty) { this._penTy = ty; this.penHead.style.transform = `translateY(${ty}px)`; }
    }
  }

  // 纸空间基准：pos(x) = posNow + (x − penX)；右缘 R = posNow + (w − penX)
  // wOpt：dub 纸条离屏重渲传任意窗宽，常规走 this.w
  _paperStrip(pctx, x0, R, wOpt) {
    const w = wOpt ?? this.w, { h } = this;
    const posLo = R - (w - x0);
    const img = this.paperImg;
    if (img && img.complete && img.naturalWidth) {
      // 纸理来自渲染管线贴图（decree12·纸位 1:1 平铺，随纸滚动）——不再 CSS 渐变+手画栅格
      const tileW = img.naturalWidth * (h / img.naturalHeight);
      const phase = ((posLo % tileW) + tileW) % tileW;
      pctx.save(); pctx.beginPath(); pctx.rect(x0, 0, w - x0 + 1, h); pctx.clip();
      for (let x = x0 - phase; x < w; x += tileW) pctx.drawImage(img, x, 0, tileW, h);
      pctx.restore();
    } else {
      pctx.fillStyle = '#E4D6BA'; pctx.fillRect(x0, 0, w - x0 + 1, h);   // 贴图未到的素纸底
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
    // 墨洇进纸（decree13 放行④）：multiply 落墨——红乘纸纤维，纤维透墨而现，非浮于面的矢量红线
    pctx.save(); pctx.globalCompositeOperation = 'multiply';
    for (const pass of [{ c: 'rgba(140,47,27,0.34)', wdt: 3.8 }, { c: '#8C2F1B', wdt: 2.2 }]) {
      pctx.strokeStyle = pass.c; pctx.lineWidth = pass.wdt;
      pctx.lineCap = 'round';
      pctx.beginPath(); pctx.moveTo(x0, y0); pctx.lineTo(x1, y1); pctx.stroke();
    }
    pctx.restore();
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
    // ④ 时刻痕落笔（事件笔道·与墨同帧过针）
    for (const p of this.pips) {
      if (p.pos > newPos - cssShift - 0.01 && p.pos <= newPos + 0.01) this._pipStroke(pctx, this.penX - (newPos - p.pos), p.big);
    }
    const t = this.ping; this.ping = this.pong; this.pong = t;
  }

  // ④ 事件笔道：真实记录仪的边缘事件针——事故族（STUCK/FAIL）高痕，节点族底缘短痕；洇墨同法
  _pipStroke(pctx, x, big) {
    pctx.save(); pctx.globalCompositeOperation = 'multiply';
    pctx.strokeStyle = big ? 'rgba(110,30,16,0.5)' : 'rgba(110,30,16,0.34)';
    pctx.lineWidth = big ? 2.6 : 2;
    pctx.beginPath();
    pctx.moveTo(x, this.h - 6); pctx.lineTo(x, big ? this.h * 0.42 : this.h - 18);
    pctx.stroke(); pctx.restore();
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
    pctx.save(); pctx.globalCompositeOperation = 'multiply';   // 墨洇进纸（放行④）：全量重画同一支洇墨笔
    for (const pass of [{ c: 'rgba(140,47,27,0.34)', wdt: 3.8 }, { c: '#8C2F1B', wdt: 2.2 }]) {
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
    pctx.restore();
    // ④ 时刻痕全量重画（窗重画/纸条重渲同一支笔——撕下的纸条也带事件痕）
    for (const p of this.pips) {
      if (p.pos < posLo || p.pos > posHi) continue;
      const x = xOf(p.pos);
      if (x > xMax + 1) continue;
      this._pipStroke(pctx, x, p.big);
    }
  }

  _drawPen(penY) {
    // ④ 回魂后画布只留墨湾（针尖那点湿红）——笔架硬件＝渲染件 #pen-head，不再手画（宪法归位）
    const { ctx } = this;
    ctx.fillStyle = '#8C2F1B';
    ctx.beginPath(); ctx.arc(this.penX, penY, 1.4, 0, Math.PI * 2); ctx.fill();   // 墨湾缩珠（④复审⑤：贴点不成球）
  }
  // ④ 时刻加粗：STUCK/FAIL＝高痕（事故一眼可见），RESOLVE/DONE/ASK＝底缘短痕（节点可数）
  onMoment(m) {
    const big = m.special === 'STUCK_LOOP' || m.outcome === 'FAIL';
    if (big || m.special === 'RESOLVE' || m.special === 'DONE' || m.verb === 'ASK') this.pips.push({ pos: this.pos, big });
  }
}

// —— 灯组：琥珀管（ASK 呼吸）＋ 绿宝石（DONE / RESOLVE 一闪）＋ 待机粒 ——
// 光机融合（命题三）：每盏灯对应一种真实发光物——包络即物性，走真实时间。
// CUE＝氩气放电管：冷硬梯形呼吸（陡起 180ms→平台 1.6s→利落收 500ms→暗 1.2s）——气体只有通断，没有暖场。
// WRAP＝灼热钨丝：合闸涌流=点火过冲（surge）→热衰减落稳态（heat）；断电余温拖尾——灯丝不会瞬间冷；
//        升降温中段泛出余温红（--ember 层）——钨丝本来就是先红后亮的。RESOLVE=一记小点火（一件成了）。
// LINE＝暗房红宝石安全灯：恒基底照度 0.12·永不呼吸永不闪——它是底噪不是话语（断链即熄归⑥接 E5）。
const CUE_CYCLE_MS = 3480;   // 180 up / 1600 hold / 500 down / 1200 dark
export class Lamps {
  constructor(tubeEl, emeraldEl, pilotEl) {
    this.tube = tubeEl; this.emerald = emeraldEl; this.pilot = pilotEl;
    this.eye = document.getElementById('magic-eye');   // 魔眼（decree12）：活动强度持续开合
    this.askEnv = 0; this.heat = 0; this.surge = 0; this._wasOn = false;
    this.act = 0; this.actTarget = 0;
    this.phase = 'IDLE';
    this.lastNow = performance.now();
    this._post = null;
    // ⑥ LINE=线路灯（E5 第一件物理落地）：serve 链路健康=稳亮基底，断链=熄。
    // 缺省 true=demo 橱窗（无线路概念·POWER 即在场）；index 构造后置 false，SSE 证明后亮。
    this.linkUp = true;
  }
  // ⑦POST 覆写通道：POST 只碰"开关"（ask/wrap/act/line），物理全程真跑——氩管梯形、钨丝
  // 点火/热衰减/余温红原机不动，故 POST 的 WRAP 就是一次真点火。override 期真包照收
  // （onPacket 不拦），render 读开关时让位；post(null)=交还，余温自然拖尾衰到零写。
  // ask 上升沿记通电时刻：POST 的氩管相位从合闸起算（通电即起辉）——不许撞上
  // 挂钟梯形的暗相（验收竞态坑①同族：POST 教学窗黑着＝白教）。
  post(o) {
    if (o && o.ask && !(this._post && this._post.ask)) this._postAskT0 = performance.now();
    this._post = o;
  }
  onPacket(pkt) {
    this.phase = pkt.phase; this.pendingAsk = pkt.pendingAsk;
    this.actTarget = Math.min(1, (pkt.needle || 0) * 0.72 + (pkt.A || 0) * 0.55);
  }
  onMoment(m) { if (m.special === 'RESOLVE') this.surge = Math.min(0.8, this.surge + 0.4); }  // 一件成了=小点火
  // P0-1②：值没变就不写
  _put(el, key, val) {
    if (el['_v' + key] !== val) { el['_v' + key] = val; el.style.setProperty(key, val); }
  }
  render(now) {
    const dt = Math.min(now - this.lastNow, 100); this.lastNow = now;
    const rise = (x, tau) => x + (1 - x) * (1 - Math.exp(-dt / tau));
    const fall = (x, tau) => x * Math.exp(-dt / tau);

    // CUE：终身只说一句话——"该你了"（氩管梯形呼吸·熄透后零写）
    const asking = this._post ? !!this._post.ask : this.pendingAsk;
    this.askEnv = asking ? rise(this.askEnv, 130) : fall(this.askEnv, 210);
    // POST 灯检（船长时序令）：起辉 180ms 后保持常亮无熄相——灯检要的是"在场证明"不是呼吸；
    // 正常路径照走挂钟梯形循环。
    let trap;
    if (this._post && this._post.ask) {
      trap = Math.min(1, (now - this._postAskT0) / 180);
    } else {
      const c = (now % CUE_CYCLE_MS) / CUE_CYCLE_MS;
      trap = c < 0.0517 ? c / 0.0517 : c < 0.5115 ? 1 : c < 0.6552 ? 1 - (c - 0.5115) / 0.1437 : 0;
    }
    this._put(this.tube, '--lit', (this.askEnv < 0.004 ? 0 : this.askEnv * trap).toFixed(3));

    // WRAP：这一场成了（DONE 常亮=灯丝在烧）；点火过冲+热衰减+余温红
    const on = this._post ? !!this._post.wrap : this.phase === 'DONE';
    if (on && !this._wasOn) this.surge = Math.max(this.surge, 0.32);   // 合闸涌流=点火泛光
    this._wasOn = on;
    this.surge = fall(this.surge, 380);
    // 重标定（首验峰值 0.997=无过冲——涌流衰得比升温快）：灯丝升温本来就快（τ80），
    // 泛光衰减才是慢的（τ380）——亮度先冲 ~1.15 再落稳态 1.0，热衰减可见。
    this.heat = on ? rise(this.heat, 80) : fall(this.heat, 620);
    const lit = Math.min(1.25, this.heat + this.surge);
    this._put(this.emerald, '--lit', (lit < 0.004 ? 0 : lit).toFixed(3));
    const ember = Math.max(0, Math.min(1, this.heat * (1 - this.heat) * 2.6));
    this._put(this.emerald, '--ember', (ember < 0.004 ? 0 : ember).toFixed(3));

    // LINE：线路在场=恒基底照度；断链=熄（⑥·E5 落地：死死不动一眼可读从此有灯）。
    // POST 抬 0.26 灯检——仍低于 REC 满红：修宪甲护的是信号语义，灯检非信号。
    this._put(this.pilot, '--lit',
      this._post && this._post.line != null ? this._post.line.toFixed(2)
        : this.linkUp ? '0.12' : '0');

    // 魔眼：快跟事件能量、慢回落；活动近零 shimmer 降格 2 位小数（P0-1③）
    if (this.eye) {
      const tgt = this._post && this._post.act != null ? this._post.act : this.actTarget;
      this.act += (tgt - this.act) * (1 - Math.exp(-dt / (tgt > this.act ? 95 : 300)));
      const shimmer = 0.028 * (0.5 + 0.5 * Math.sin(now / 1900));
      const v = Math.min(1, this.act + shimmer);
      this._put(this.eye, '--act', v.toFixed(v < 0.08 ? 2 : 3));
    }
  }
}
