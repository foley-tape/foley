// vu-law.js 的类型面：实现在 vu-law.js（纯 JS，浏览器/Node 逐字同源——金测试直接吃本体），类型在此供 tsc 检查。

export const VU_REF_DBFS: number;   // 0VU ≡ −20dBFS
export const VU_DEG0: number;       // 左钉角（=画上 '20' 刻度）
export const VU_SWEEP: number;      // 总扫角
export const VU_WN: number;         // 表头固有角频率 rad/s
export const VU_ZETA: number;       // 上行阻尼比
export const VU_FALL_DRAG: number;  // 回程阻尼倍率
export const VU_ATTACK_MS: number;
export const VU_RELEASE_MS: number;

export function vuTravel(busDb: number): number;      // dBFS → 行程 0..1（画上五枚数字＝查表锚）
export function travelToDeg(v: number): number;       // 行程 → 针角 deg

export class VuMovement {
  pos: number;
  vel: number;
  drive: number;
  step(target: number, dtMs: number): number;
}
