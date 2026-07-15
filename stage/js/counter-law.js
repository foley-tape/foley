// 计数轮·纯棘爪律（渲染批回归·设计三§三）——环上就近＋临界阻尼落卡＋条帧映射。
// 实现单源在此（浏览器 counter.js 与 Node 金测逐字同吃）；类型面在 counter-law.d.ts。
// 提纯缘由：夜审 D-8②/复盘甲.7——「counter 落卡（临界阻尼+wrap 就近）」零金测（席三工单二·回归族）。
// 棘爪律：落卡临界阻尼 ≤250ms（~4τ）／停必落卡位（整数字·无过冲不弹跳）／滚动带惯性。

export const COUNTER_FRAMES = 40;      // 整周＝10 数字×4 帧（counter_strip.meta.json）
export const COUNTER_TAU_MS = 60;      // 临界阻尼时间常数（~4τ=240ms 到 99% ≤ 250ms 落卡令）
export const COUNTER_K_COUNT = 0.55;   // 带量标定：盘转角(rad)→计数（观感起手值）
export const COUNTER_SNAP_EPS = 0.004; // 贴住阈：|位差|<此即咬死整字位（棘爪落卡）

// 环上就近：位差映入 [−5,5)——9→0 走短弧 +1（真机进位方向），非 −9。半程(=5)向后（−5）。
export function wrapDelta(from, to) {
  const d = to - from;
  return ((d % 10) + 15) % 10 - 5;
}

// 临界阻尼一步：pos 指数逼近 target（无过冲=停必落卡不弹跳）；贴住(<EPS)即咬死整字位。
// dtMs 内钳 100（丢帧不暴冲——与 counter.js render 同律，纯函数自足可测）。
export function dampStep(pos, target, dtMs) {
  const a = 1 - Math.exp(-Math.min(100, dtMs) / COUNTER_TAU_MS);
  const d = wrapDelta(pos, target);
  if (Math.abs(d) < COUNTER_SNAP_EPS) return ((target % 10) + 10) % 10;   // 棘爪：咬死整字位
  return (pos + d * a + 10) % 10;
}

// 位 → 帧号（pos 0..10 环 → 4 帧/数字·整周 COUNTER_FRAMES·钳环）
export function counterFrameOf(pos) {
  return ((Math.round(pos * 4) % COUNTER_FRAMES) + COUNTER_FRAMES) % COUNTER_FRAMES;
}

// 计数 → 四位数字（千百十个·个位在右）
export function digitsOf(count) {
  const t = Math.floor(count);
  return [Math.floor(t / 1000) % 10, Math.floor(t / 100) % 10, Math.floor(t / 10) % 10, t % 10];
}

// 盘转角(rad) → 计数（一只钟律·K_COUNT 标定·% 10000 四位环·绝对值单调）
export function countFromTheta(theta) {
  return Math.abs(theta * COUNTER_K_COUNT) % 10000;
}
