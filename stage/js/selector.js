// 主功能选择器（渲染批·设计三§四）：机加工旋钮三档 OFF·TEST·ON。
// 视觉=条帧 canvas（25 帧 OFF −38°→ON +38°·透明底叠板——板上烙的是 ON 姿态，条首帧 OFF 盖之）；
// 手势=拖拧跟随指针绕钮心+释放吸附最近档；TEST 驻留 ≥400ms=电气自检独演（两乐章制§四.2）；
// 快拧直达 ON（点按/一气拖到底·TEST 逗留 <400ms）=压缩版 POST；ON 后回拧=机械拒绝（关机语义候设计）。
// pre-gesture 呼吸示能（play-cue 处决后的正门继承）走 CSS；本件只管手势/绘制，转移律提纯至 selector-law。
import { SELECTOR_DEG as DEG, SELECTOR_FRAMES as FRAMES, SELECTOR_DWELL_MS as DWELL_MS, snapState, frameOf, selectorAction } from './selector-law.js';

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
    const name = snapState(angle);                             // 吸附最近档（律·selector-law）
    const changed = name !== state;
    // 点按（零拖动）=快拧直达 ON（最顺手的开机·Nagra 快拧语义；关机后点按=重开机同门）
    if (!changed && state === 'off' && Math.abs(angle - DEG.off) < 2) {
      autoTwist().then(() => onQuick?.());
      return;
    }
    settle(DEG[name]);
    if (!changed) return;
    const prev = state; state = name;
    sound?.()?.selectorClick?.();                              // 档位咔哒（#17·迁籍声）
    switch (selectorAction(prev, name)) {                      // 关机三档全向转移表（律·selector-law）
      case 'stop': onStop?.(); break;                          // ON→TEST：优雅停机（歇手不闭眼）
      case 'testDwell': dwellTimer = setTimeout(() => { if (state === 'test') onTest?.(); }, DWELL_MS); break;  // OFF→TEST：驻留 ≥400ms
      case 'finale': onFinale?.(); break;                      // TEST→ON：尾章（电机降生/复走）
      case 'quick': onQuick?.(); break;                        // OFF→ON 一气（TEST 逗留 <400ms）：压缩版
      case 'dark': onDark?.(); break;                          // →OFF：熄灯（TEST→OFF/ON→OFF 同门·调用方兜停机）
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
