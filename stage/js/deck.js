// 走带甲板：双带轴 ＋ 机械计数轮（M-S2）
//
// 器件法：带轴一件两义封顶——转速=A（值），转速稳定度=wow（方差）。
// 动法：一切服从惯性。ω 一阶惯性起停；DONE 是滑停不是刹车。
// 编舞：STUCK 是带轴卡在同一拍反复——跳针的视觉孪生；CLEARED 复走。
// 时间法·钨丝分频（v1.2）：走带机构属机器，走舞台时间——倍速回放时带轴加速，
// 而灯与呼吸留在真实时间。机器可以快进，它对人的语速不变。

import { PacketPair } from './instruments.js';

const SPIN_UP_TAU = 650;    // ms 舞台时间，起转惯性
const COAST_TAU = 2100;     // ms，滑停（角动量比马达大）
const WOW_RATE = 0.8;       // Hz，走带不稳的目视频率
const STUCK_PERIOD = 920;   // ms，卡拍周期
const STUCK_SWING = 0.30;   // rad，卡拍前冲幅度

const NS = 'http://www.w3.org/2000/svg';

// 全圆两弧 path（evenodd 打窗用）
function circlePath(cx, cy, r) {
  return `M ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} Z`;
}

// 盘面＝定光胶片条（decree13 乙-2/丁-②）：同场景同灯渲的整周自转 N 帧雪碧图——
// 光是"定"的（高光不随 CSS 转），转的是盘（badge/窗格走·辐条周期无缝）。禁匀光+CSS旋转（病理①）。
// 帧1＝场景板姿态：条未动时与板逐像素同一张，加载即无跳变；条缺席时 canvas 空透明→板上静盘如实兜底。
// 条内不含投影（板上烘定静影·圆盘剪影旋转不变）——绝无双重影子（十三号放行③）。
// P0-1①②（LEDGER）：换帧从"巨图 background-position"改为 canvas 抠帧 blit——
// 大元素 bg-position 逼 GPU 常驻光栅巨层（风暴冻盘元凶），canvas 只合成盘那么大的一层。
const STRIP = { N: 120, COLS: 12, ROWS: 10, src: { l: 'assets/reel_l.webp', r: 'assets/reel_r.webp' } };
// 第三批③ 走带复活：辊条/带面流动条（同场景同灯定光条·透明底叠板）。
// 一只钟律：辊与带不自持时间——一切从两盘"显示转角"的增量派生（Δθ→带线速→辊角/带面相位），
// 滑停/卡拍挣扎/断电，辊带与盘逐帧同命；不存在局部动画。
const GUIDE = { N: 24, COLS: 6, ROWS: 4, src: { l: 'assets/guide_l.webp', r: 'assets/guide_r.webp' } };
const BAND = { N: 12, COLS: 4, ROWS: 3, src: 'assets/band_run.webp' };
const PACK_R = 0.815, ROLLER_R = 0.10;   // 世界几何（hero_scene 同源：两饼 0.85/0.78 取均→带线速）
const ROLLER_MAX_STEP = 0.14;            // 辊每显示帧限步 rad（值班律：不封顶＝风暴 3.5rev/s 频闪轮）
const ROLLER_DIR = -1, BAND_DIR = -1;    // 手性二常数·真机目验铆定：+dθ 在镜像相机下＝屏上顺时针；
                                         // 供带在屏右→带流向屏左→辊顶须向左（逆时针）＝翻负。带面同理。

function buildLayerStrip(host, src, cols, rows) {
  if (!host) return null;                // 元素缺席＝优雅退化（旧页无伤）
  const cv = document.createElement('canvas');
  cv.className = 'reel-spin';
  host.appendChild(cv);
  const s = { cv, ctx: cv.getContext('2d'), bmp: null, fw: 0, fh: 0, drawn: -1, cols };
  const img = new Image();
  img.src = src;
  img.decode()
    .then(() => createImageBitmap(img))
    .then(b => { s.bmp = b; s.fw = b.width / cols; s.fh = b.height / rows; s.drawn = -1; })
    .catch(() => {});
  const size = () => {
    const r = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; s.drawn = -1; }
  };
  size();
  window.addEventListener('resize', size);
  return s;
}
function blitIdx(s, idx) {
  if (!s || !s.bmp || idx === s.drawn) return;   // 帧不变零绘制（体温法）
  s.drawn = idx;
  const col = idx % s.cols, row = (idx / s.cols) | 0;
  s.ctx.clearRect(0, 0, s.cv.width, s.cv.height);
  s.ctx.drawImage(s.bmp, col * s.fw, row * s.fh, s.fw, s.fh, 0, 0, s.cv.width, s.cv.height);
}
function buildReelStrip(host, which) {
  const cv = document.createElement('canvas');
  cv.className = 'reel-spin';
  host.appendChild(cv);
  const s = { cv, ctx: cv.getContext('2d'), bmp: null, fw: 0, fh: 0, drawn: -1 };
  const img = new Image();
  img.src = STRIP.src[which];
  img.decode()
    .then(() => createImageBitmap(img))
    .then(b => { s.bmp = b; s.fw = b.width / STRIP.COLS; s.fh = b.height / STRIP.ROWS; s.drawn = -1; })
    .catch(() => {});
  const size = () => {
    const r = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; s.drawn = -1; }
  };
  size();
  window.addEventListener('resize', size);
  return s;
}

export class ReelDeck {
  constructor(leftEl, rightEl, tapeband) {
    this.reels = [
      { el: leftEl, rot: buildReelStrip(leftEl, 'l'), theta: 0, omega: 0, ratio: 1.0, hadWob: false },
      { el: rightEl, rot: buildReelStrip(rightEl, 'r'), theta: 0.9, omega: 0, ratio: 1.18, hadWob: false }, // 收带盘转快
    ];
    this.tapeband = tapeband;
    // 第三批③：走带活层（辊×2＋带面）——从盘的显示转角派生，见 render() 一只钟段
    this.guides = [
      { s: buildLayerStrip(document.getElementById('guide-l'), GUIDE.src.l, GUIDE.COLS, GUIDE.ROWS), theta: 0 },
      { s: buildLayerStrip(document.getElementById('guide-r'), GUIDE.src.r, GUIDE.COLS, GUIDE.ROWS), theta: 0 },
    ];
    this.bandRun = { s: buildLayerStrip(document.getElementById('band-run'), BAND.src, BAND.COLS, BAND.ROWS), phase: 0 };
    this._prevTheta = null;
    this.pair = new PacketPair();
    this.stuck = false;
    this.stuckTheta = null;
    this.lastStageT = 0;
    this.wowPhase = 0;
  }

  onPacket(pkt, isSeek) {
    if (!Number.isFinite(pkt.stageT) || !Number.isFinite(pkt.A)) return; // 防脏包毒害走带物理（NaN 一旦入 theta 永久污染）
    if (isSeek) { this.stuck = false; this.stuckTheta = null; this.lastStageT = pkt.stageT; } // dev 跳带即换带上机，卡碟态清零
    const dt = Math.max(0, pkt.stageT - this.lastStageT); // 舞台时间：倍速下机构如实加速
    this.lastStageT = pkt.stageT;

    // 目标转速：A 给马达供电；IDLE/DONE 断电滑停
    const powered = pkt.phase === 'WORKING' || pkt.phase === 'WAITING';
    const target = powered ? 0.5 + 2.6 * pkt.A : 0;
    if (!powered && this.stuck) { this.stuck = false; this.stuckTheta = null; }  // 物理释放律：断电的机器不挣扎（防 CLEARED 缺席闩死到停机后）

    this.wowPhase += (dt / 1000) * WOW_RATE * Math.PI * 2;
    const wowMod = 1 + 0.35 * pkt.wow * Math.sin(this.wowPhase);

    for (const r of this.reels) {
      const tau = target > r.omega ? SPIN_UP_TAU : COAST_TAU;
      r.omega += (target - r.omega) * (1 - Math.exp(-dt / tau));
      if (!this.stuck) r.theta += r.omega * r.ratio * wowMod * (dt / 1000);
    }
    this.wow = pkt.wow;
    this.pair.push(pkt, isSeek);
  }

  // ⑦POST 把手：仪式拨盘——smoothstep 把 rad 分摊到 ms 内（起停含惯性口感），走 render 钟
  // 故无包也走（冷启 EMPTY 正是 POST 的窗口）；辊/带经"一只钟"从显示转角增量自然跟转。
  nudge(rad, ms = 900) { this._nudge = { t0: performance.now(), rad, ms, prev: 0 }; }

  onMoment(m) {
    if (m.special === 'STUCK_LOOP' && !this.stuck) {
      this.stuck = true;
      this.stuckTheta = this.reels.map(r => r.theta);
    } else if (m.special === 'STUCK_CLEARED') {
      this.stuck = false; this.stuckTheta = null;
    }
  }

  // 显示转角（含卡拍编舞）——台上 render 与胶印合成器同吃这一支（M2.5 同源抽取）
  thetaAt(i, now) {
    const r = this.reels[i];
    if (this.stuck && this.stuckTheta) {
      // 卡拍编舞 v2（船长案：192s 长卡把节拍器演成"机器人坏了"）：挣扎—歇。
      // 真卡住的带轴不是节拍器——宏周期 4.6s：两记前冲弹回（同一道槽），其余静伏憋着；
      // 收带盘只挣扎一半、且晚半拍（两盘不同步才像被同一条带拽着）。
      const MACRO = 4600;
      const f = ((now + i * 460) % MACRO) / MACRO;
      const swing = STUCK_SWING * (i === 0 ? 1 : 0.5);
      const win = (f0, f1) => (f >= f0 && f < f1 ? (f - f0) / (f1 - f0) : null);
      const g = win(0, STUCK_PERIOD / MACRO) ?? win(0.30, 0.30 + STUCK_PERIOD / MACRO);
      if (g === null) return this.stuckTheta[i];
      const jerk = g < 0.62 ? (g / 0.62) : Math.max(0, 1 - (g - 0.62) / 0.12);
      return this.stuckTheta[i] + swing * jerk;
    }
    return r.theta;
  }

  render(now) {
    if (this._nudge) {
      const n = this._nudge;
      const f = Math.min(1, (now - n.t0) / n.ms);
      const e = f * f * (3 - 2 * f);
      const d = n.rad * (e - n.prev); n.prev = e;
      for (const r of this.reels) r.theta += d * r.ratio;
      if (f >= 1) this._nudge = null;                      // 毕即撤=静止零写回归
    }
    for (let i = 0; i < 2; i++) {
      const r = this.reels[i];
      const theta = this.thetaAt(i, now);
      // 胶片条换帧：theta → 整周 [0,1) → 帧格（theta=0 即帧1＝板上姿态）。
      // 只在帧号变化时写样式（体温法：待机盘停＝零样式写）。
      const u = ((theta / (Math.PI * 2)) % 1 + 1) % 1;
      const idx = Math.floor(u * STRIP.N) % STRIP.N;
      const s = r.rot;
      if (s.bmp && idx !== s.drawn) {          // 只在帧号变化时 blit（待机盘停＝零绘制）
        s.drawn = idx;
        const col = idx % STRIP.COLS, row = (idx / STRIP.COLS) | 0;
        s.ctx.clearRect(0, 0, s.cv.width, s.cv.height);
        s.ctx.drawImage(s.bmp, col * s.fw, row * s.fh, s.fw, s.fh, 0, 0, s.cv.width, s.cv.height);
      }
      // 走带不稳的轴心抖：肉眼可见，但不越过"微醺"（P0-1②：静止时不写样式）
      const wob = (this.wow || 0) * 1.6;
      if (wob > 0.02 || r.hadWob) {
        const wx = wob * Math.cos(theta * 1.7), wy = wob * Math.sin(theta * 2.3);
        r.el.style.transform = `translate(${wx.toFixed(2)}px, ${wy.toFixed(2)}px)`;
        r.hadWob = wob > 0.02;
      }
    }
    // 带面微颤随 wow
    if (this.tapeband) this.tapeband.style.opacity = (0.9 - (this.wow || 0) * 0.25).toFixed(3);

    // ── 一只钟（第三批③）：两盘显示转角的增量 → 带线速 → 辊角/带面相位。
    //    卡拍挣扎、滑停、断电：dθ 是多少辊带就走多少——与盘逐帧同命，不存在局部动画。
    const th0 = this.thetaAt(0, now), th1 = this.thetaAt(1, now);
    if (this._prevTheta) {
      const dlin = ((th0 - this._prevTheta[0]) + (th1 - this._prevTheta[1])) * 0.5 * PACK_R;
      if (dlin !== 0) {
        for (const g of this.guides) {
          if (!g.s) continue;
          let step = ROLLER_DIR * dlin / ROLLER_R;
          if (step > ROLLER_MAX_STEP) step = ROLLER_MAX_STEP;
          else if (step < -ROLLER_MAX_STEP) step = -ROLLER_MAX_STEP;
          g.theta += step;
          const u = ((g.theta / (Math.PI * 2)) % 1 + 1) % 1;
          blitIdx(g.s, Math.floor(u * GUIDE.N) % GUIDE.N);
        }
        if (this.bandRun.s) {
          this.bandRun.phase += BAND_DIR * dlin * 1.4;   // 带面纹理流速（视觉系数·方向随带）
          const u = ((this.bandRun.phase % 1) + 1) % 1;
          blitIdx(this.bandRun.s, Math.floor(u * BAND.N) % BAND.N);
        }
      }
    }
    this._prevTheta = [th0, th1];
  }
}

// —— 机械计数轮：数字唯一的活处（字法）。悬停微距才入画。 ——
// 计数由带轴驱动（∫ω dt）：纸停时它停，倍速时它跑——机械的诚实。
const WHEEL_H = 44; // loupe 内单位数字行高 px
export class Counter {
  constructor(housingEl, loupeEl, deck) {
    this.deck = deck;
    this.loupe = loupeEl;
    // 数字轮条带：0–9 加回卷 0（末轮连滚需要 9→0 的下一格）
    for (const wheel of loupeEl.querySelectorAll('.wheel')) {
      const strip = document.createElement('div');
      strip.className = 'wheel-strip';
      strip.innerHTML = '01234567890'.split('').map(d => `<span>${d}</span>`).join('');
      wheel.appendChild(strip);
    }
    this.wheels = [...loupeEl.querySelectorAll('.wheel-strip')];
    this.value = 0;
    this.lastStageT = 0;
    housingEl.addEventListener('mouseenter', () => loupeEl.classList.add('on'));
    housingEl.addEventListener('mouseleave', () => loupeEl.classList.remove('on'));
  }
  // 切带里程归零（第五号手令 丁-E2）：换带即换里程账。
  reset() { this.value = 0; this.lastStageT = 0; this._low = undefined; this._lastV = undefined; }
  onPacket(pkt, isSeek) {
    if (isSeek) { this.value = (pkt.stageT / 1000) * 0.72; this.lastStageT = pkt.stageT; }
    const dt = Math.max(0, pkt.stageT - this.lastStageT);
    this.lastStageT = pkt.stageT;
    // 以左带轴角速度积分（0.72 计数/秒 @ ω≈1.8）
    this.value += (this.deck.reels[0].omega * 0.4) * (dt / 1000);
  }
  render() {
    if (!this.loupe.classList.contains('on')) return;
    const v = this.value % 10000;
    // 棘爪回位律（第五号手令 丁-E4）：停转必须落卡位，永不悬于半格。
    // 走带中末轮连续滚；一停（计数不再前进），末轮缓落最近卡位——棘爪咬入齿的机械诚实。
    const moving = Math.abs(v - (this._lastV ?? v)) > 1e-3;
    this._lastV = v;
    // 末轮连滚，高位轮到位跳（机械计数器的真实做派：低位带高位，进位瞬间才动）
    for (let i = 0; i < 4; i++) {
      const div = Math.pow(10, 3 - i);
      const digitVal = (v / div) % 10;
      let shown;
      if (i === 3) {
        const target = moving ? digitVal : Math.round(digitVal); // 停转落最近卡位（含 9→10 回卷位）
        if (this._low === undefined) this._low = digitVal;
        this._low = moving ? digitVal : this._low + (target - this._low) * 0.2; // 棘爪缓落
        shown = this._low;
      } else {
        shown = Math.floor(digitVal) + (digitVal % 1 > 0.9 ? (digitVal % 1 - 0.9) * 10 : 0);
      }
      this.wheels[i].style.transform = `translateY(${(-shown * WHEEL_H).toFixed(1)}px)`;
    }
  }
  onMoment() {}
}
