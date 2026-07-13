// VU 律（单源）：表脸几何＝针弹道同一张尺。
//
// 表脸是板上烙死的 vu_scale.png（art/hero/ref/vu_texture.py）——弧 94°(-47°..+47°)，
// 五枚数字 20/10/5/0/+3，红区起于 texture 角 +13.16°(=47°×0.28)。针的映射查表锚死
// 这五枚**画上的**数字：底层 0VU 时针必须砸在画上 0 刻度线（红区界）上，分毫不差。
// 段内插值走幅度线性（10^(dB/20)）——真 VU 表头吃整流电流，偏转∝幅度；对数压缩
// 是刻度盘画出来的，不是电路算出来的。绝不做 dB→角度的整段线性映射。
//
// 0VU ≡ −20dBFS（唱片响度锚 targetLufs 同源·⑤修宪原点不动）。

export const VU_REF_DBFS = -20;          // 0VU 基准
export const VU_DEG0 = -47;              // 左钉（=画上 '20' 刻度）
export const VU_SWEEP = 94;              // 总扫角（画上弧宽）

// 锚点＝画上五枚数字：[VU 值, 幅度 10^(vu/20), 行程 (texture角+47)/94]
const FACE = [
  [-20, 0.1,                0.0],
  [-10, 0.31622776601683794, 0.275],   // texture 角 −21.15°
  [-5,  0.5623413251903491,  0.475],   // texture 角 −2.35°
  [0,   1.0,                 0.64],    // texture 角 +13.16° ＝ 红区界
  [3,   1.4125375446227544,  1.0],
];

// busDb(dBFS) → 行程 0..1（画上刻度即真值表）
export function vuTravel(busDb) {
  const A = Math.pow(10, (busDb - VU_REF_DBFS) / 20);
  if (A <= FACE[0][1]) return 0;
  for (let i = 1; i < FACE.length; i++) {
    if (A <= FACE[i][1]) {
      const [, a0, t0] = FACE[i - 1], [, a1, t1] = FACE[i];
      return t0 + (t1 - t0) * (A - a0) / (a1 - a0);
    }
  }
  return 1;
}

export const travelToDeg = v => VU_DEG0 + v * VU_SWEEP;

// —— 表头机械：二阶弹簧-阻尼（半隐式欧拉·子步 8ms）——
// 剥除一阶平滑的雨刮感：欠阻尼 ζ=0.60 → 急停必过冲 ~9% 且仅一次可见回弹
// （回程 vel<0 阻尼 ×1.7 ≈ 临界——金属被死死拽住，第二摆肉眼不可辨）。
// 前级整流驱动非对称：attack τ10ms（强信号=瞬间锤击）/ release τ60ms
// （驱动拖着掉＋回程重阻尼 → 落底合计 ~300ms 真 VU 衰减曲线）。
// 3.9Hz 谐振质量天然低通：RMS 帧间高频抖推不动这坨铁（ζ0.6 无谐振峰，不嗡）。
export const VU_WN = 26;                 // 固有角频率 rad/s
export const VU_ZETA = 0.60;             // 上行阻尼比（欠阻尼=过冲）
export const VU_FALL_DRAG = 1.7;         // 回程阻尼倍率（滞重下坠）
export const VU_ATTACK_MS = 10;
export const VU_RELEASE_MS = 60;
const PEG_K = 0.25;                      // 撞钉恢复系数（打表在钉上死弹一下）
const H = 0.008;                         // 积分子步 s（ωn·h=0.21 ≪ 2 稳定）

export class VuMovement {
  constructor() { this.pos = 0; this.vel = 0; this.drive = 0; }
  step(target, dtMs) {
    const dt = Math.min(dtMs, 100);      // 切后台回来不炸簧
    const tau = target > this.drive ? VU_ATTACK_MS : VU_RELEASE_MS;
    this.drive += (target - this.drive) * (1 - Math.exp(-dt / tau));
    let s = dt / 1000;
    while (s > 1e-6) {
      const h = Math.min(s, H); s -= h;
      const zeta = VU_ZETA * (this.vel < 0 ? VU_FALL_DRAG : 1);
      this.vel += (VU_WN * VU_WN * (this.drive - this.pos) - 2 * zeta * VU_WN * this.vel) * h;
      this.pos += this.vel * h;
      if (this.pos < 0) { this.pos = 0; if (this.vel < 0) this.vel *= -PEG_K; }
      else if (this.pos > 1) { this.pos = 1; if (this.vel > 0) this.vel *= -PEG_K; }
    }
    // 静息休眠：贴住即咬死（0.01° 级微爬不进样式写）
    if (Math.abs(target - this.drive) < 8e-4 && Math.abs(this.pos - this.drive) < 8e-4
        && Math.abs(this.vel) < 0.004) { this.drive = target; this.pos = target; this.vel = 0; }
    return this.pos;
  }
}
