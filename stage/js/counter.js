// 计数轮（渲染批回归·设计三§三）：读窗烙板（休眠即黑）·四只数字鼓 canvas＝鼓条换帧。
// 棘爪律：落卡临界阻尼 ≤250ms／停必落卡位（整数字）／上下排一致（四轮同法同径同字）／滚动带惯性。
// 数据源=一只钟律（第三批③同宗）：从盘的显示转角派生带量——盘冻数字冻、盘滑停数字落卡，逐帧同命。
const FRAMES = 40;            // 整周=10 数字×4 帧（counter_strip.meta.json）
const TAU_MS = 60;            // 临界阻尼时间常数：~4τ=240ms 到 99% ≤ 250ms 落卡令
const K_COUNT = 0.55;         // 带量标定：盘转角(rad)→计数（观感起手值·真机=转数计）

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
    // 一只钟：带量自盘转角派生（供带盘=reels[0]·theta 单调累计）
    const count = Math.abs((deck.reels?.[0]?.theta ?? 0) * K_COUNT) % 10000;
    const target = Math.floor(count);
    const digs = [Math.floor(target / 1000) % 10, Math.floor(target / 100) % 10, Math.floor(target / 10) % 10, target % 10];
    const a = 1 - Math.exp(-dt / TAU_MS);    // 临界阻尼（指数逼近·无过冲=停必落卡不弹跳）
    for (let i = 0; i < 4; i++) {
      let d = digs[i] - pos[i];
      d = ((d % 10) + 15) % 10 - 5;          // 环上就近（wrap：9→0 走短弧=真机进位方向）
      if (Math.abs(d) < 0.004) pos[i] = digs[i];   // 落卡：贴住即咬死整字位（棘爪）
      else pos[i] = (pos[i] + d * a + 10) % 10;
      drawWheel(i, Math.round(pos[i] * 4) % FRAMES);
    }
  }

  return { render, onPacket() {}, reset() { pos.fill(0); drawnF.fill(-1); } };
}
