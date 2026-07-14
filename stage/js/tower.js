// 高塔导航（渲染批·RACK_SPEC 一.2 镜头即导航）：#tower=段A 机器+段B 带库鞋盒一根长板；
// 镜头下摇=tower translateY（transform-only·惯性缓动·禁 linear）。滚轮/触摸拖/点架沿下摇，
// 上滚回机器；光随指针（四.1 简版）=带库层暖光晕跟随 pointermove。
export function mountTower({ tower, room, lipHint, lib }) {
  if (!tower || !room) return null;
  let y = 0, target = 0, raf = 0;

  const maxY = () => Math.max(0, tower.scrollHeight - room.clientHeight);
  function tick() {
    raf = 0;
    const d = target - y;
    if (Math.abs(d) < 0.4) { y = target; }
    else { y += d * 0.16; schedule(); }                 // 指数缓动=惯性（禁 linear）
    tower.style.transform = `translateY(${(-y).toFixed(2)}px)`;
    const libView = y > room.clientHeight * 0.4;
    document.body.classList.toggle('lib-view', libView);
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(tick); }
  function go(v) { target = Math.max(0, Math.min(maxY(), v)); schedule(); }

  room.addEventListener('wheel', (e) => {
    if (e.target.closest('#rack')) return;              // 货架自滚不劫
    e.preventDefault();
    go(target + e.deltaY);
  }, { passive: false });
  // 触摸拖（pan）
  let ty0 = null, tt0 = 0;
  room.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { ty0 = e.touches[0].clientY; tt0 = target; } }, { passive: true });
  room.addEventListener('touchmove', (e) => { if (ty0 !== null) go(tt0 + (ty0 - e.touches[0].clientY)); }, { passive: true });
  room.addEventListener('touchend', () => { ty0 = null; });
  lipHint?.addEventListener('click', () => go(room.clientHeight * 0.98));   // 点架沿=下摇入带库
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'PageDown') go(target + room.clientHeight * 0.6);
    if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Escape') go(e.key === 'Escape' ? 0 : target - room.clientHeight * 0.6);
  });
  window.addEventListener('resize', () => go(target));

  // 光随指针（RACK_SPEC 四.1 简版）：钨丝光晕漫至指针所至的盒脊
  const lamp = lib?.querySelector('.lib-lamp');
  if (lib && lamp) {
    let lx = 0, ly = 0, lraf = 0;
    lib.addEventListener('pointermove', (e) => {
      const r = lib.getBoundingClientRect();
      lx = e.clientX - r.left; ly = e.clientY - r.top;
      if (!lraf) lraf = requestAnimationFrame(() => { lraf = 0; lamp.style.transform = `translate(${lx - lamp.clientWidth / 2}px, ${ly - lamp.clientHeight / 2}px)`; });
    });
  }
  return { go, get y() { return y; } };
}
