// 主功能选择器·纯转移律（渲染批·设计三§四）——OFF·TEST·ON 三档全向转移表＋吸附＋条帧映射。
// 实现单源在此（浏览器 selector.js 与 Node 金测逐字同吃）；类型面在 selector-law.d.ts。
// 提纯缘由：夜审 D-8②/复盘甲.7——「关机三档全向转移表」零金测·回归风险真实（席三工单二·回归族）。
// 关机三档全向（审计余项2 当庭定案）：
//   OFF→TEST 驻留自检 ｜ OFF→ON 一气压缩 ｜ TEST→ON 尾章 ｜ TEST→OFF 熄灯 ｜ ON→TEST 优雅停机 ｜ ON→OFF 熄灯。

export const SELECTOR_DEG = { off: -38, test: 0, on: 38 };   // 扫程 OFF→ON（selector_strip.meta.json 同源）
export const SELECTOR_FRAMES = 25;
export const SELECTOR_DWELL_MS = 400;                         // TEST 驻留判定（设计三§四.2）
export const SELECTOR_STATES = ['off', 'test', 'on'];

// 吸附：显示角 → 最近档名
export function snapState(angle) {
  let best = SELECTOR_STATES[0];
  for (const s of SELECTOR_STATES) {
    if (Math.abs(angle - SELECTOR_DEG[s]) < Math.abs(angle - SELECTOR_DEG[best])) best = s;
  }
  return best;
}

// 条帧映射：角 → 帧号（OFF=0 → ON=FRAMES−1·钳内）
export function frameOf(angle) {
  const u = (angle - SELECTOR_DEG.off) / (SELECTOR_DEG.on - SELECTOR_DEG.off);
  return Math.max(0, Math.min(SELECTOR_FRAMES - 1, Math.round(u * (SELECTOR_FRAMES - 1))));
}

// 全向转移表：(prev,next) → 动作。'none'=同档无变；其余五动作各触一路回调。
//   'testDwell'=OFF→TEST（须驻留 ≥DWELL_MS 才 onTest）｜'stop'=ON→TEST 优雅停机
//   'finale'=TEST→ON 尾章｜'quick'=OFF→ON 一气压缩｜'dark'=→OFF 熄灯（TEST→OFF 与 ON→OFF 同门）
export function selectorAction(prev, next) {
  if (prev === next) return 'none';
  if (next === 'test') return prev === 'on' ? 'stop' : 'testDwell';
  if (next === 'on') return prev === 'test' ? 'finale' : 'quick';
  return 'dark';
}
