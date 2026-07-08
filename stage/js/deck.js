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

// 盘面：香槟法兰 evenodd 三窗 ＋ 轮毂；窗后可见磁带饼（介质，唯它显旧）
function buildReelSvg(host, suffix) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 300 300');
  svg.innerHTML = `
    <defs>
      <radialGradient id="pack-${suffix}" cx="42%" cy="38%" r="72%">
        <stop offset="0%" stop-color="#231710"/><stop offset="55%" stop-color="#180F0A"/>
        <stop offset="100%" stop-color="#0E0906"/>
      </radialGradient>
      <linearGradient id="flange-${suffix}" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stop-color="#D3C29A"/><stop offset="40%" stop-color="#A8946A"/>
        <stop offset="100%" stop-color="#5F5138"/>
      </linearGradient>
      <linearGradient id="hub-${suffix}" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stop-color="#C3B18A"/><stop offset="100%" stop-color="#6B5C41"/>
      </linearGradient>
    </defs>
    <circle cx="150" cy="150" r="128" fill="url(#pack-${suffix})"/>
    <circle cx="150" cy="150" r="96" fill="none" stroke="rgba(255,235,205,0.05)" stroke-width="30"/>
    <g class="flange">
      <path fill-rule="evenodd" fill="url(#flange-${suffix})" d="${
        circlePath(150, 150, 140)
        + [90, 210, 330].map(a => {
          const rad = (a * Math.PI) / 180;
          return circlePath(150 + Math.cos(rad) * 80, 150 + Math.sin(rad) * 80, 36);
        }).join(' ')
      }"/>
      <circle cx="150" cy="150" r="139" fill="none" stroke="rgba(255,245,225,0.35)" stroke-width="1.6"/>
      <circle cx="150" cy="150" r="34" fill="url(#hub-${suffix})"/>
      <circle cx="150" cy="150" r="12" fill="#17100A"/>
      ${[30, 150, 270].map(a => {
        const rad = (a * Math.PI) / 180;
        return `<circle cx="${(150 + Math.cos(rad) * 23).toFixed(1)}" cy="${(150 + Math.sin(rad) * 23).toFixed(1)}" r="3.6" fill="#4A3D28"/>`;
      }).join('')}
    </g>`;
  host.appendChild(svg);
  return svg.querySelector('.flange');
}

export class ReelDeck {
  constructor(leftEl, rightEl, tapeband) {
    this.reels = [
      { el: leftEl, flange: buildReelSvg(leftEl, 'l'), theta: 0, omega: 0, ratio: 1.0 },
      { el: rightEl, flange: buildReelSvg(rightEl, 'r'), theta: 0.9, omega: 0, ratio: 1.18 }, // 收带盘饼小转快
    ];
    this.tapeband = tapeband;
    this.pair = new PacketPair();
    this.stuck = false;
    this.stuckTheta = null;
    this.lastStageT = 0;
    this.wowPhase = 0;
  }

  onPacket(pkt, isSeek) {
    if (isSeek) { this.stuck = false; this.stuckTheta = null; this.lastStageT = pkt.stageT; } // dev 跳带即换带上机，卡碟态清零
    const dt = Math.max(0, pkt.stageT - this.lastStageT); // 舞台时间：倍速下机构如实加速
    this.lastStageT = pkt.stageT;

    // 目标转速：A 给马达供电；IDLE/DONE 断电滑停
    const powered = pkt.phase === 'WORKING' || pkt.phase === 'WAITING';
    const target = powered ? 0.5 + 2.6 * pkt.A : 0;

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
      // 同一道槽：前冲—啪嗒弹回—再冲。收带盘只挣扎一半。
      const f = (now % STUCK_PERIOD) / STUCK_PERIOD;
      const swing = STUCK_SWING * (i === 0 ? 1 : 0.5);
      const jerk = f < 0.62 ? (f / 0.62) : Math.max(0, 1 - (f - 0.62) / 0.12);
      return this.stuckTheta[i] + swing * jerk;
    }
    return r.theta;
  }

  render(now) {
    for (let i = 0; i < 2; i++) {
      const r = this.reels[i];
      const theta = this.thetaAt(i, now);
      const deg = (theta * 180) / Math.PI;
      // 走带不稳的轴心抖：肉眼可见，但不越过"微醺"
      const wob = (this.wow || 0) * 1.6;
      const wx = wob * Math.cos(theta * 1.7), wy = wob * Math.sin(theta * 2.3);
      r.flange.setAttribute('transform', `rotate(${deg.toFixed(2)} 150 150)`);
      r.el.style.transform = `translate(${wx.toFixed(2)}px, ${wy.toFixed(2)}px)`;
    }
    // 带面微颤随 wow
    if (this.tapeband) this.tapeband.style.opacity = (0.9 - (this.wow || 0) * 0.25).toFixed(3);
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
