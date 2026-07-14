// 主功能选择器（渲染批·设计三§四）：机加工旋钮三档 OFF·TEST·ON。
// 视觉=条帧 canvas（25 帧 OFF −38°→ON +38°·透明底叠板——板上烙的是 ON 姿态，条首帧 OFF 盖之）；
// 手势=拖拧跟随指针绕钮心+释放吸附最近档；TEST 驻留 ≥400ms=电气自检独演（两乐章制§四.2）；
// 快拧直达 ON（点按/一气拖到底·TEST 逗留 <400ms）=压缩版 POST；ON 后回拧=机械拒绝（关机语义候设计）。
// pre-gesture 呼吸示能（play-cue 处决后的正门继承）走 CSS；本件只管状态机与条帧。
const DEG = { off: -38, test: 0, on: 38 };   // meta 同源（selector_strip.meta.json·扫程 OFF→ON）
const FRAMES = 25;
const DWELL_MS = 400;                          // TEST 驻留判定（设计三§四.2）

export function mountSelector(el, { onQuick, onTest, onFinale, onStop, onDark, sound } = {}) {
  if (!el) return null;
  const cv = el.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const img = new Image();
  img.src = 'assets/selector_strip.webp';
  let fw = 0, fh = 0, drawn = -1;
  img.decode?.().then(() => { fw = img.width / FRAMES; fh = img.height; draw(frameOf(angle), true); }).catch(() => {});

  let state = 'off';                           // off | test | on
  let angle = DEG.off;                         // 当前显示角
  let dwellTimer = null;

  const frameOf = (a) => Math.max(0, Math.min(FRAMES - 1, Math.round((a - DEG.off) / (DEG.on - DEG.off) * (FRAMES - 1))));
  function draw(f, force) {
    if (!fw || (f === drawn && !force)) return;   // 体温法：帧不变零绘制
    drawn = f;
    const w = el.clientWidth, h = el.clientHeight, dpr = devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, f * fw, 0, fw, fh, 0, 0, cv.width, cv.height);
  }

  function settle(a) { angle = a; draw(frameOf(a)); }

  // 程序快拧（首手势非旋钮区）：OFF→ON 条动画 ~420ms + 档位咔哒（t0 声由 runPost postOpen 供，勿双击）
  let twisting = false;
  function autoTwist(ms = 420) {
    if (state === 'on' || twisting) return Promise.resolve();
    twisting = true;
    const a0 = angle, a1 = DEG.on, t0 = performance.now();
    return new Promise((res) => {
      (function fr(now) {
        const u = Math.min(1, (now - t0) / ms);
        const e = u * u * (3 - 2 * u);
        settle(a0 + (a1 - a0) * e);
        if (u < 1) { requestAnimationFrame(fr); return; }
        state = 'on'; twisting = false; res();
      })(t0);
    });
  }

  // 拖拧：角度跟随指针绕钮心（真旋钮语法）
  let dragging = false, dragBase = 0, ptrBase = 0;
  const ptrAngle = (e) => {
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
  };
  el.addEventListener('pointerdown', (e) => {
    // 不 stopPropagation：window 级手势（房间醒/声桥出生）必须照收——快拧路由自己按 target 让位
    // 关机语义（审计余项2 当庭定案）：三档全向合法——ON→TEST 优雅停机·TEST→OFF 熄灯·
    // OFF→ON 重开机（POST+补撕）。live 回拧不停 agent=观察者诚实（调用方执法）。
    if (twisting) return;
    dragging = true; el.classList.add('twisting');
    dragBase = angle; ptrBase = ptrAngle(e);
    el.setPointerCapture?.(e.pointerId);
    clearTimeout(dwellTimer);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    settle(Math.max(DEG.off, Math.min(DEG.on, dragBase + (ptrAngle(e) - ptrBase))));
  });
  const finishDrag = () => {
    if (!dragging) return;
    dragging = false; el.classList.remove('twisting');
    // 吸附最近档
    const snaps = [['off', DEG.off], ['test', DEG.test], ['on', DEG.on]];
    let best = snaps[0];
    for (const s of snaps) if (Math.abs(angle - s[1]) < Math.abs(angle - best[1])) best = s;
    const [name, deg] = best;
    const changed = name !== state;
    // 点按（零拖动）=快拧直达 ON（最顺手的开机·Nagra 快拧语义；关机后点按=重开机同门）
    if (!changed && state === 'off' && Math.abs(angle - DEG.off) < 2) {
      autoTwist().then(() => onQuick?.());
      return;
    }
    settle(deg);
    if (!changed) return;
    const prev = state; state = name;
    if (changed) sound?.()?.selectorClick?.();                 // 档位咔哒（#17·迁籍声）
    if (name === 'test') {
      if (prev === 'on') onStop?.();                           // ON→TEST：优雅停机（歇手不闭眼）
      else dwellTimer = setTimeout(() => { if (state === 'test') onTest?.(); }, DWELL_MS);   // OFF 来：驻留 ≥400ms
    } else if (name === 'on') {
      if (prev === 'test') onFinale?.();                       // TEST→ON：尾章（电机降生/复走）
      else onQuick?.();                                        // OFF→ON 一气（TEST 逗留 <400ms）：压缩版
    } else if (name === 'off') {
      onDark?.();                                              // →OFF：熄灯（一气 ON→OFF=停机+熄灯由调用方兜全）
    }
  };
  el.addEventListener('pointerup', finishDrag);
  el.addEventListener('pointercancel', finishDrag);
  window.addEventListener('resize', () => draw(drawn, true));

  return {
    autoTwist,
    get state() { return state; },
    setOn() { state = 'on'; settle(DEG.on); },   // 快照恢复（POST 素面等）
  };
}
