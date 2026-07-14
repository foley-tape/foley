// POST 开机自检（⑦船长二修令 5.0s 紧凑 → 设计三§六.2 两乐章制·§四 POST 两乐章制移植 Nagra）。
// 总长 5.0s 不变·音色与性格 B 不变·结构随选择器分两乐章：
//
//   TEST 乐章·电气自检（0–3.4s）  合闸（选择器档位咔哒=t0）。LINE 立亮微弱底光；VU 涌流
//                                 0.1s 打满最右红区→回弹带物理颤抖归零；魔眼 0.5–1.5s 青绿
//                                 浮现向心对焦；1.5s WRAP 爆亮（真点火→热衰减+余温红）；
//                                 1.7s CUE 闪亮后常亮；1.8–3.2s 探针全幅扫摆（电气拍加速版·
//                                 伺服吱同刻）；2.2s 翻字牌起翻（有卡=揭幕·无卡=整环空翻·
//                                 帽 1.15s→3.35s 内定格）。**全乐章马达不转**（Nagra TEST
//                                 本义：机器醒着、带不走）。
//   ON 尾章·电机降生（3.4–5.0s）  3.4s 马达双盘沉重 ¼ 转拉紧张力（1.5s 惯性）；3.8s 床诞生
//                                 （起转后 400ms 嗡起=电机通电的物理延迟·哼与盘同章降生）；
//                                 5.0s 探针已落位、牌已定格——仪式彻底交还日常。
//
// 过渡条款（§六.4）：现有拨杆/首手势暂代「快拧直达 ON」＝本压缩版（电气拍加速后接马达）；
// 真 TEST 驻留（旋钮停 TEST 档 ≥400ms=只演电气不接尾章·床第六态微嗡）候 B 箱选择器视觉。
// 编排三律（不变）：直调把手不走包总线；只碰开关物理全程真跑；借走必还（进槽借出槽还·
// 双向守卫）。?post=0 素面；?postloop=1 循环。揭幕闸 postGate：POST 期 onRecordChange
// 让位并入翻牌拍（§11 唯一写者不破·只延时不代笔）。

// —— TEST 乐章（电气自检·马达不转） ——
const T = {
  vuKickEnd: 100,                 // 涌流冲击窗：0–0.1s 打满红区
  vuRelease: 900,                 // 甩毕早还（回弹余振 0.1–0.5s 自己收尾）
  eyeOn: 500, eyeFocus: 1500,     // 魔眼预热：浮现+向心对焦
  wrapOn: 1500, wrapOff: 1650,    // 对焦完成触发：爆亮脉冲→自带 ~1.3s 热衰减变暗
  cueOn: 1700,                    // 紧接闪亮一次后常亮（Lamps post 无熄相）到终幕
  penOn: 1800, penOff: 3200,      // 探针全幅扫摆（电气拍加速版 1.4s·原独演 2.9s）
  flapAt: 2200,                   // 翻牌起翻（≤1.15s 帽→3.35s 定格=乐章内收束）
  // —— ON 尾章（电机降生） ——
  reelAt: 3400, reelMs: 1500,     // 马达启动：电气拍全部完成后接马达（两乐章分界）
  bedBirth: 3800,                 // 床诞生：起转后 400ms 嗡起（电机通电物理延迟·哼与盘同章）
};
export const TEST_END_MS = T.reelAt;  // 两乐章分界（B 箱旋钮 TEST 驻留的结构缝）
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
  const { vu, chart, lamps, deck, flap, sound } = h;   // sound=声桥（可缺席——乐谱声部静默让位）
  return new Promise((resolve) => {
    const T0 = performance.now();
    postGate.active = true;
    // POST 乐谱 B（声资产批定稿§四·序=乐谱 钟=视觉事件）：t0 选择器档位咔哒（原继电器首咔·
    // 设计三§六.3 迁籍——同一声资产同性格，声籍改判归主功能选择器）＋床压黑至"嗡起"点
    // （温柔苏醒：留白偏长·嗡起偏慢——bedBirth 随慢 slew 缓起=ON 尾章电机降生）
    sound?.postOpen?.(T.bedBirth);
    let tickLine = false, tickWrap = false, tickCue = false, servoCued = false;
    // TEST 乐章即刻起：涌流粮从第一帧就上桥（0–0.1s 冲击窗不容 rAF 迟到）。
    // 涌流钟惰性锚定：VU 第一次进食才起表——click 处理器同步工作（demo POWER ~110ms）阻塞 rAF 时，
    // 冲击窗不被吃掉（物理：合闸的涌流从电流到达表头起算，不从拨开关的手起算）。
    let vuSrc = null, vuPrev = null, vuDone = !vu || !!opts.skipVu, vuT0 = null;
    if (!vuDone) {
      vuPrev = vu.source;
      vuSrc = () => { if (vuT0 === null) vuT0 = performance.now(); return dbAt(performance.now() - vuT0); };
      vu.source = vuSrc;
    }
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
      // 涌流粮早还（回弹已毕；声起换粮守卫=借了才还）
      if (vuSrc && !vuDone && t >= T.vuRelease) {
        if (vu.source === vuSrc) vu.source = vuPrev;
        vuDone = true;
      }
      // TEST 乐章 · 探针：进槽偷 penHead（chart null 守卫自动跳写），出槽即还
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
      // 灯序嗒×3（钨丝点火·耳语）：LINE 首帧→WRAP 1.5s→CUE 1.7s（声形同刻=灯亮即嗒）
      if (!tickLine && t >= 30) { tickLine = true; sound?.lampTick?.(); }
      if (!tickWrap && t >= T.wrapOn) { tickWrap = true; sound?.lampTick?.(); }
      if (!tickCue && t >= T.cueOn) { tickCue = true; sound?.lampTick?.(); }
      // 伺服吱—嘀嘀（耳语）：探针进槽同刻
      if (!servoCued && t >= T.penOn) { servoCued = true; sound?.servoCue?.((T.penOff - T.penOn) / 1000); }
      // TEST 乐章 · 翻牌（与探针重叠）：有台词=揭幕；无台词=空翻——哗啦与起翻同刻
      if (!flapFired && t >= T.flapAt) {
        flapFired = true;
        const line = postGate._take();
        if (line) line();                                  // 揭幕台词自带哗啦（apply 内 cue·免双击）
        else { sound?.solariCue?.(1050); flap?.sweep?.(); } // 空翻拍由 POST 供声
      }
      // ON 尾章 · 电机降生：马达 ¼ 转（沉重感=1.5s 惯性窗）——电气拍全部完成后才接（两乐章铁序）
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
