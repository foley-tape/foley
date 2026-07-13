// POST 开机自检（⑦·船长二修令：废 11.6s 串行独演——真实机器的通电是紧凑且相互重叠的）。
// 总长 5.0s·三阶段·动作重叠无空白等待期：
//
//   一·瞬间通电冲击（0–0.5s）   合闸。LINE 立亮微弱底光；VU 受涌流冲击 0.1s 内极速打满
//                                最右红区→快速回弹带物理颤抖（弹簧撞钉+欠阻尼余振）退回
//                                零位。此半秒其余机械静止——电最快。
//   二·灯管缓慢预热（0.5–2.0s） 魔眼预热：青绿从无到有缓慢浮现并向中心收缩对焦（磷光
//                                环带向心收缩=材质重构的对焦参数）；1.5s 对焦完成触发状态
//                                灯——WRAP 瞬间爆亮（真点火 surge）随即入它本来的缓慢变暗
//                                （热衰减 τ620+余温红 ~1.3s）；紧接 CUE 闪亮一次后保持常亮。
//   三·机械运转与重叠（2.0–5.0s）马达启动：双盘沉重 ¼ 转拉紧张力（1.5s 惯性），同时记录
//                                仪探针开始全幅扫摆（2.0–4.9s）；3.5s 探针扫至尾声时翻字牌
//                                立刻起翻（有卡=揭幕滚真曲名·无卡=整环空翻·帽 1.15s）；
//                                5.0s 牌定格曲名、探针落位停稳——仪式彻底交还日常。
//
// 编排三律（不变）：直调把手不走包总线；只碰开关物理全程真跑；借走必还（进槽借出槽还·
// 双向守卫）。?post=0 素面；?postloop=1 循环。揭幕闸 postGate：POST 期 onRecordChange
// 让位并入翻牌拍（§11 唯一写者不破·只延时不代笔）。

const T = {
  vuKickEnd: 100,                 // 涌流冲击窗：0–0.1s 打满红区
  vuRelease: 900,                 // 甩毕早还（回弹余振 0.1–0.5s 自己收尾）
  eyeOn: 500, eyeFocus: 1500,     // 魔眼预热：浮现+向心对焦
  wrapOn: 1500, wrapOff: 1650,    // 对焦完成触发：爆亮脉冲→自带 ~1.3s 热衰减变暗
  cueOn: 1700,                    // 紧接闪亮一次后常亮（Lamps post 无熄相）到终幕
  reelAt: 2000, reelMs: 1500,     // 马达启动：沉重 ¼ 转拉紧张力
  penOn: 2000, penOff: 4900,      // 探针全幅扫摆（与盘同启·尾声与翻牌重叠）
  flapAt: 3500,                   // 探针尾声翻牌起翻（≤1.15s 帽→5.0s 前定格）
};
const POST_MS = 5000;

const sm = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

// VU 涌流 db(t)：0–0.1s 满驱 +3（钉最右红区·弹簧撞钉），随后断流 −60（回弹+颤抖=真弹道）
function dbAt(t) { return t < T.vuKickEnd ? 3 : -60; }
// 探针 T(t)：0.5 → 1（顶）→ 0（底）→ 0.5（全幅伺服·2.9s 慢扫）
function penT(t) {
  const u = (t - T.penOn) / (T.penOff - T.penOn);
  if (u < 0.3) return 0.5 + 0.5 * sm(u / 0.3);
  if (u < 0.75) return 1 - sm((u - 0.3) / 0.45);
  return 0.5 * sm((u - 0.75) / 0.25);
}
// 魔眼预热 act(t)：0.5s 前静默 → 1.5s 对焦完成，此后凝视到终幕
function actAt(t) {
  if (t < T.eyeOn) return 0;
  return sm((t - T.eyeOn) / (T.eyeFocus - T.eyeOn));
}

// ⑥ 伺服校准（记录仪右下圆钮定职）：拍一下伺服马达座，滑针自检一趟全程。
// 与 POST 同一偷/还纪律；POST 演出期 penHead 已被借走→窃取失败即静默让位（天然互斥）。
export function runPenSweep(chart, ms = 1600) {
  if (!chart?.penHead || !chart._yOf) return Promise.resolve();
  const el = chart.penHead; chart.penHead = null;
  const T0 = performance.now();
  return new Promise((res) => {
    (function fr(now) {
      const u = (now - T0) / ms;
      if (u >= 1) {
        el.style.transform = 'translateY(0px)';
        chart.penHead = el; chart._penTy = null; res(); return;
      }
      const T = u < 0.3 ? 0.5 + 0.5 * sm(u / 0.3)
        : u < 0.75 ? 1 - sm((u - 0.3) / 0.45)
          : 0.5 * sm((u - 0.75) / 0.25);
      el.style.transform = `translateY(${(chart._yOf(T) - chart._yOf(0.5)).toFixed(2)}px)`;
      requestAnimationFrame(fr);
    })(T0);
  });
}

// 曲名揭幕闸：POST 活动期把 onRecordChange 的翻牌台词接进翻牌拍（末令有效）
export const postGate = {
  active: false, _q: null,
  defer(fn) { if (!this.active) return false; this._q = fn; return true; },
  _take() { const fn = this._q; this._q = null; return fn; },
  _flush() { const fn = this._take(); this.active = false; if (fn) fn(); },
};

export function runPost(h, opts = {}) {
  const { vu, chart, lamps, deck, flap } = h;
  return new Promise((resolve) => {
    const T0 = performance.now();
    postGate.active = true;
    // 阶段一即刻起：涌流粮从第一帧就上桥（0–0.1s 冲击窗不容 rAF 迟到）
    let vuSrc = null, vuPrev = null, vuDone = !vu || !!opts.skipVu;
    if (!vuDone) { vuPrev = vu.source; vuSrc = () => dbAt(performance.now() - T0); vu.source = vuSrc; }
    let penEl = null, penDone = false, flapFired = false, reelFired = false;

    function frame(now) {
      const t = now - T0;
      if (t >= POST_MS) {
        if (vuSrc && vu.source === vuSrc) vu.source = vuPrev;
        if (penEl) { penEl.style.transform = 'translateY(0px)'; chart.penHead = penEl; chart._penTy = null; }
        lamps?.post?.(null);
        postGate._flush();                          // 迟到的上桥落定后照常补翻
        resolve();
        return;
      }
      // 一→二交界：涌流粮早还（回弹已毕；声起换粮守卫=借了才还）
      if (vuSrc && !vuDone && t >= T.vuRelease) {
        if (vu.source === vuSrc) vu.source = vuPrev;
        vuDone = true;
      }
      // 三 · 探针：进槽偷 penHead（chart null 守卫自动跳写），出槽即还
      if (chart?.penHead && !penEl && !penDone && t >= T.penOn) { penEl = chart.penHead; chart.penHead = null; }
      if (penEl && !penDone) {
        if (t < T.penOff) {
          const ty = (chart._yOf(penT(t)) - chart._yOf(0.5)).toFixed(2);
          if (ty !== frame._ty) { frame._ty = ty; penEl.style.transform = `translateY(${ty}px)`; }
        } else {
          penEl.style.transform = 'translateY(0px)';
          chart.penHead = penEl; chart._penTy = null; penEl = null; penDone = true;
        }
      }
      // 三 · 翻牌（与探针重叠）：有台词=揭幕；无台词=空翻
      if (!flapFired && t >= T.flapAt) {
        flapFired = true;
        const line = postGate._take();
        if (line) line(); else flap?.sweep?.();
      }
      // 三 · 马达 ¼ 转（沉重感=1.5s 惯性窗）
      if (!reelFired && t >= T.reelAt) { reelFired = true; deck?.nudge?.(Math.PI / 2, T.reelMs); }
      // 灯语开关（Lamps 物理机全程真跑）：LINE 微弱底光全程在场
      lamps?.post?.({
        ask: t >= T.cueOn,
        wrap: t >= T.wrapOn && t < T.wrapOff,
        act: actAt(t),
        line: 0.26,
      });
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}
