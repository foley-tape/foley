// Solari 翻字牌机芯（BATCH3 ②）：曲名的唯一显示面。
//
// 机械律（真 Solari 的三条脾气）：
// · 环序滚动——每格从当前字**沿字环单向前滚**到目标字（远字翻得久=真机行为），不许倒转、不许跳字。
// · 折叶两相——上半片沿轴折下（0→−180°）：正面带旧字上半、背面带新字下半；静片先上后下换字。
// · 哗啦=级联——左→右逐格错峰起翻；全牌必须在时长帽内落定（值班律）。
//
// 纪律：§11 唯一写者——本模块只被 onRecordChange 驱动（确认上桥才翻·切曲不预写·缺席留白=DOM 隐、
// 板上烙的空白卡就是留白态）；样式写只发生在翻动期，静止零写（体温法）。

export const FLAP_CELLS = 12;                 // 值班律①：12 格硬截（三厂盘曲名 ≤10 全容）
export const FLAP_CAP_MS = 1150;              // 值班律②：全牌落定时长帽
const STEP_MS = 42;                           // 单折基准时长（帽内可压缩）
const STAGGER_MS = 26;                        // 相邻格起翻错峰
const RING = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.·&';   // 字环（真机卡序·空格居首=归位字）
// ?flapslow[=N] 诊断口：折叶 ×N 慢放（缺值=4·钳 2..20；末翻回弹/90°边光逐帧验收器·不入正常路径·帽不管慢放）
const _fs = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('flapslow') : null;
const SLOW = _fs === null ? 1 : Math.min(20, Math.max(2, Number(_fs) || 4));

// —— 纯函数（金测面） ——
export function planRoll(fromCh, toCh) {      // 环序前滚步数
  const a = Math.max(0, RING.indexOf(fromCh));
  const b = RING.indexOf(toCh);
  const bi = b < 0 ? RING.indexOf('·') : b;   // 字集外→'·'（中点字·不装没翻过）
  return (bi - a + RING.length) % RING.length;
}
export function normalizeTitle(t) {           // 大写·12 硬截·字集外置'·'·右补空
  const up = String(t ?? '').toUpperCase().slice(0, FLAP_CELLS);
  let s = '';
  for (const ch of up) s += RING.includes(ch) ? ch : '·';
  return s.padEnd(FLAP_CELLS, ' ');
}
export function capStep(maxSteps) {           // 时长帽压缩：最远格也须帽内到站
  // 末翻 thunk 加时 ×2.2 计入帽：总时 ≈ (n−1)·step + 2.2·step = (n+1.2)·step
  if (maxSteps <= 0) return STEP_MS;
  return Math.min(STEP_MS, Math.max(16, (FLAP_CAP_MS - STAGGER_MS * (FLAP_CELLS - 1)) / (maxSteps + 1.2)));
}
export function ringNext(ch) {
  const i = Math.max(0, RING.indexOf(ch));
  return RING[(i + 1) % RING.length];
}

// ② 甲案：曲单纸标签（印刷品域）——catalog 喂一次，静态可读；不标当前曲（翻字牌即"当前"，零冗余）
export function mountTrackIndex(el, titles) {
  if (!el || !titles?.length) return;
  const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  el.innerHTML = titles.map((t, i) => `<span><b>${i + 1}</b>${esc(t).toUpperCase()}</span>`).join('');
  el.classList.add('on');
}

export function mountFlapBoard(el) {
  if (!el) return null;
  const cells = [];
  for (let i = 0; i < FLAP_CELLS; i++) {
    const c = document.createElement('span'); c.className = 'fcell';
    c.innerHTML = '<i class="fc-top"><b> </b></i><i class="fc-bot"><b> </b></i>'
      + '<i class="fc-leaf"><span class="fl-f"><b> </b></span><span class="fl-b"><b> </b></span><i class="fl-edge"></i></i>';
    el.appendChild(c);
    cells.push({
      top: c.querySelector('.fc-top b'), bot: c.querySelector('.fc-bot b'),
      leaf: c.querySelector('.fc-leaf'), lf: c.querySelector('.fl-f b'), lb: c.querySelector('.fl-b b'),
      edge: c.querySelector('.fl-edge'),
    });
  }
  const chars = Array(FLAP_CELLS).fill(' ');
  let gen = 0;

  function flipOnce(cell, fromCh, toCh, dur, last) {
    cell.top.textContent = toCh;              // 静上=新字（被叶盖住·叶落即露）
    cell.lf.textContent = fromCh;             // 叶正=旧字上半
    cell.lb.textContent = toCh;               // 叶背=新字下半（CSS 预翻 180° 校正镜像）
    // 末翻 thunk（船长令·二阶阻尼回弹）：加速下坠→72% 触底→回弹 8°→86%→被拽回钉死。
    // 回弹幅 8° 不再穿越 90°——边光只闪一次（物理如此，提案"两短拍"系误算，就地勘正）。
    const D = dur * (last ? 2.2 : 1) * SLOW;
    const kf = last
      ? [{ transform: 'rotateX(0deg)', easing: 'cubic-bezier(.5,.05,.85,.5)' },
         { transform: 'rotateX(-180deg)', offset: 0.72, easing: 'cubic-bezier(.25,.6,.45,1)' },
         { transform: 'rotateX(-172deg)', offset: 0.86, easing: 'cubic-bezier(.55,0,.8,.5)' },
         { transform: 'rotateX(-180deg)', offset: 1 }]
      : [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-180deg)' }];
    const a = cell.leaf.animate(kf, { duration: D, easing: last ? 'linear' : 'cubic-bezier(.5,.05,.7,.4)' });
    // 90° 边缘高光切变：卡片转到正对光的一瞬，轴线上闪出一道材质切边。
    // 值班闸：步长被帽压到 <30ms 时闪不出来的帧不写（末翻 D≥2.2×16=35ms 恒有闪）。
    if (cell.edge && D >= 30) {
      const mid = last ? 0.40 : 0.48;         // 末翻下坠段 0..0.72，90° 约在 0.40
      cell.edge.animate(
        [{ opacity: 0 }, { opacity: 0.9, offset: mid }, { opacity: 0, offset: Math.min(mid + 0.16, 0.9) }, { opacity: 0 }],
        { duration: D, easing: 'linear' },
      );
    }
    // 动画毕叶片归 0°=顶卡复位（真 Solari 静止时叶即顶卡）：叶正面必须同步新字，
    // 否则旧字上半片盖住新静片=上下错字（首验抓获的病）；静下片同刻换新。
    a.finished.then(() => { cell.bot.textContent = toCh; cell.lf.textContent = toCh; }, () => {});
    return a;
  }

  function run(steps, opts = {}) {                          // 级联共件：set/sweep 同一套哗啦
    const g = ++gen;                                        // 新令作废旧翻（连点切曲）
    const dur = capStep(Math.max(...steps));
    let pending = 0;
    steps.forEach((n, i) => {
      if (!n) return;
      pending++;
      const cell = cells[i];
      const tick = (k) => {
        if (g !== gen) return;                              // 被新令superseded：本格就地停翻
        const next = ringNext(chars[i]);
        const last = k + 1 >= n;
        flipOnce(cell, chars[i], next, dur, last);
        chars[i] = next;
        if (!last) setTimeout(tick, dur * SLOW, k + 1);
        else setTimeout(() => {                             // 结算钉在末翻触底帧（0.72×D）——软落针=那声闷 thunk
          if (--pending === 0 && g === gen) opts.onSettle?.();
        }, dur * 2.2 * SLOW * 0.72);
      };
      setTimeout(() => tick(0), STAGGER_MS * i * SLOW);
    });
    if (!pending) opts.onSettle?.();                        // 同字/空→无翻仍确认（落针语义=确认，非翻牌）
  }
  function set(title, opts = {}) {
    const target = normalizeTitle(title);
    el.classList.toggle('lit', target.trim().length > 0);   // 留白=DOM 隐·板上空白卡即牌面
    run(chars.map((ch, i) => planRoll(ch, target[i])), opts);
  }
  // ⑦POST：空翻——每格沿字环整环滚回原字（机场牌自检礼）。空牌也要看得见哗啦，
  // 故 sweep 期强制点亮，落定后还原留白态；不改字=与 §11"唯一写者"零冲突。
  function sweep(opts = {}) {
    el.classList.add('lit');
    run(chars.map(() => RING.length), {
      onSettle: () => {
        el.classList.toggle('lit', chars.join('').trim().length > 0);
        opts.onSettle?.();
      },
    });
  }
  return { set, sweep, get text() { return chars.join(''); } };
}
