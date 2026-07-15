// 计数轮（渲染批回归·设计三§三）：读窗烙板（休眠即黑）·四只数字鼓 canvas＝鼓条换帧。
// 棘爪律：落卡临界阻尼 ≤250ms／停必落卡位（整数字）／上下排一致（四轮同法同径同字）／滚动带惯性。
// 数据源=一只钟律（第三批③同宗）：从盘的显示转角派生带量——盘冻数字冻、盘滑停数字落卡，逐帧同命。
// 棘爪落卡律提纯至 counter-law（环上就近＋临界阻尼＋条帧映射·夜审 D-8②补金测）；本件只管绘制与钟。
import { COUNTER_FRAMES as FRAMES, dampStep, counterFrameOf, digitsOf, countFromTheta } from './counter-law.js';

export function mountCounter(el, deck) {
  if (!el || !deck) return null;
  const cvs = [...el.querySelectorAll('canvas')];
  const ctxs = cvs.map((c) => c.getContext('2d'));
  const img = new Image();
  img.src = 'assets/counter_strip.webp';
  let fw = 0, fh = 0;
  img.decode?.().then(() => { fw = img.width / FRAMES; fh = img.height; }).catch(() => {});

  const pos = [0, 0, 0, 0];          // 各轮连续位置（0..10 环·个位在右）
  const drawnF = [-1, -1, -1, -1];
  let lastNow = 0, lit = false;

  function drawWheel(i, f) {
    if (!fw || f === drawnF[i]) return;      // 体温法
    drawnF[i] = f;
    const c = cvs[i], x = c.clientWidth, y = c.clientHeight, dpr = devicePixelRatio || 1;
    if (c.width !== Math.round(x * dpr)) { c.width = Math.round(x * dpr); c.height = Math.round(y * dpr); }
    ctxs[i].clearRect(0, 0, c.width, c.height);
    ctxs[i].drawImage(img, f * fw, 0, fw, fh, 0, 0, c.width, c.height);
  }

  function render(now) {
    const dt = Math.min(100, now - lastNow); lastNow = now;
    const on = document.body.classList.contains('tape-loaded');
    if (on !== lit) { lit = on; el.classList.toggle('lit', lit); }
    if (!lit) return;
    // 一只钟：带量自盘转角派生（供带盘=reels[0]·theta 单调累计）→ 棘爪律逐轮落卡（律·counter-law）
    const digs = digitsOf(countFromTheta(deck.reels?.[0]?.theta ?? 0));
    for (let i = 0; i < 4; i++) {
      pos[i] = dampStep(pos[i], digs[i], dt);
      drawWheel(i, counterFrameOf(pos[i]));
    }
  }

  return { render, onPacket() {}, reset() { pos.fill(0); drawnF.fill(-1); } };
}
