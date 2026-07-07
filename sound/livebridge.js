// live 声桥大脑（轨甲·总线一元论，DECREE-003 丁-轨甲）：StatePacket/MomentEvent → 引擎调度的唯一翻译层。
// 纯逻辑：无 DOM、无 fetch、无定时器——时钟可注入（浏览器=AudioContext.currentTime，
// 金测试=OfflineCtx 模拟钟），同一份大脑在页内直播与离线渲染器上逐字同真（core/graph 同款同源纪律）。
//
// 三律：
//  ① 渲染器=总线普通订阅者，与画面平级：只认到达的包与时刻，对 live/replay 全盲——
//     回放=磁带喂同一根总线，"整带上桥"自此无路径（静音病的结构性根除）。
//  ② 时间轴=音频钟：行 pm=(到达时刻−audio0)·1000。不吃 stageT、不认折叠轴、不问倍速——
//     渲染器唯一知道的时间是"现在"；画也按到达即走，音画同源是构造性质不是巧合。
//  ③ StatePacket→连续参数（床/唱片处置，经引擎网格窗生效）；MomentEvent→前景
//     （乐音级由引擎量化到下一网格宁迟勿早；呼唤级 RESOLVE/STUCK/ASK/DONE 直通不量化——
//     两条通道都是 graph.trigger 的既有法，这里只做翻译不造新律）。
//
// 前瞻窗短测（LOOKAHEAD 1s）：网格 tick 的参数在**排程刻**定值，窗越长状态越陈旧（整带旧桥
// 的 30s 窗是全知磁带的特权）。20Hz 包流即窗即再武装（live 心跳恒在：driver.tickTo 静场照发包）；
// 藏页下 SSE message 不受定时器节流；织体环/唱片是常驻源——包流断绝也只是参数冻结，永不死寂。
//
// 前景分类映射（classOf）镜像自 cli/rendercuts.ts（其自 cli/probe.ts——probe 侧仍是正典）；
// 三处镜像归一候后续轮（FEEDBACK 在案）。live 流的 tags 是数组、CSV 回放是竖线串——tagsOf 双容。

import { degreeOf } from './core.js';

const LOOKAHEAD_SEC = 1.0;   // 网格前瞻窗：短到状态新鲜（≈2–3 tick），长到 250ms 泵/20Hz 包流轻松续上
const TRACK_KEEP = 4096;     // 行帐修剪：网格只采"当下"邻域，历史行无人回读（20Hz 下 ≈3.4 分钟）
const TRACK_CAP = 8192;
const RUN_HOLD_SEC = 0.25;   // test 型 RUN-OK 押后窗：等可能同刻的 RESOLVE 双发（和弦让位律，§3.1）
const RESOLVE_MEMORY = 32;   // 近期 RESOLVE 时刻记忆（同刻去重用，raw t 轴）
const STUCK_CHEW_SEC = 2.5;  // 卡碟啃唱片默认时长（demo 桥沿革；流式下 CLEARED 时刻不可先知，known-limit）

const WEATHER_IDX = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM'];
const PHASE_IDX = ['IDLE', 'WORKING', 'WAITING', 'DONE'];

/** live 流 tags=数组／CSV 回放 tags=竖线串——归一为串（子串匹配口径与 probe 镜像一致）。 */
function tagsOf(m) {
  return Array.isArray(m.tags) ? m.tags.join('|') : (m.tags || '');
}

/** 前景分类（probe 正典镜像）；test 型 RUN-OK 的 RESOLVE 让位在调用方（押后窗）处理。 */
function classOf(m) {
  if (m.special === 'STUCK_LOOP') return 7;
  if (m.special === 'RESOLVE') return 6;
  if (m.special === 'DONE') return 9;
  if (m.special) return null;
  if (m.verb === 'ASK') return 8;
  if (m.outcome === 'FAIL') return 1;
  if (m.outcome !== 'OK') return null;
  switch (m.verb) {
    case 'WRITE': return 0;
    case 'READ': return 2;
    case 'RUN': return 3;
    case 'SAVE': return 4;
    case 'SPAWN': return 5;
    default: return null;
  }
}

/**
 * 建流式声桥：engine（graph.buildEngine 成品）即刻上钟（startTransport 空带起播——
 * 首行未至时引擎按 IDLE 默认行给房间层最弱态：上电即有底噪）。
 * opts.clock：注入时钟（缺省=engine.ctx.currentTime）；opts.lookaheadSec：前瞻窗覆盖（测试用）。
 */
export function createLiveBridge(eng, SP, opts) {
  const now = (opts && opts.clock) || (() => eng.ctx.currentTime);
  const lookahead = (opts && opts.lookaheadSec) || LOOKAHEAD_SEC;
  const audio0 = now() + 0.12;
  const track = [];               // 生长中的到达帐：[pm, needle, T, A, wxIdx, phIdx, wow, ask]
  const resolveSeen = [];         // 近期 RESOLVE 的 raw t（同刻 RUN 让位判据）
  const heldRuns = [];            // 押后的 test 型 RUN-OK：{ m, dueAt }
  let packetCount = 0, momentCount = 0, firedCount = 0;

  eng.startTransport(audio0, 1, track, Number.MAX_SAFE_INTEGER, 0);

  function horizon() {
    eng.scheduleGridUntil(now() + lookahead);
  }

  function fire(cls, m, at) {
    firedCount++;
    eng.trigger(cls, at, degreeOf(m.slot, SP), cls === 7 ? STUCK_CHEW_SEC : 0.5);
  }

  function flushHeld(t) {
    for (let i = heldRuns.length - 1; i >= 0; i--) {
      const h = heldRuns[i];
      if (resolveSeen.includes(h.m.t)) { heldRuns.splice(i, 1); continue; } // 双发：和弦已到，铃让位
      if (h.dueAt <= t) { heldRuns.splice(i, 1); fire(3, h.m, t + 0.02); }
    }
  }

  function onPacket(pkt) {
    packetCount++;
    const t = now();
    track.push([
      (t - audio0) * 1000,
      pkt.needle, pkt.T, pkt.A,
      Math.max(0, WEATHER_IDX.indexOf(pkt.weather)),
      Math.max(0, PHASE_IDX.indexOf(pkt.phase)),
      pkt.wow, pkt.pendingAsk ? 1 : 0,
    ]);
    if (track.length > TRACK_CAP) track.splice(0, track.length - TRACK_KEEP);
    // DONE 滑停后的复活：非 DONE 相到达＝新一章开工，唱片重新落针（针放歌与机器同醒）。
    // at 走注入时钟（离线渲染 ctx.currentTime 恒 0，缺省参数会把复活排进过去）
    const ri = eng.recordInfo;
    if (ri && ri.tapeStopped && pkt.phase !== 'DONE') eng.setRecord(ri.idx, t);
    flushHeld(t);
    horizon();
  }

  function onMoment(m) {
    momentCount++;
    const t = now();
    const cls = classOf(m);
    if (cls === null) return;
    if (cls === 6) {
      resolveSeen.push(m.t);
      if (resolveSeen.length > RESOLVE_MEMORY) resolveSeen.splice(0, resolveSeen.length - RESOLVE_MEMORY);
      // 同刻 RUN 已押后未发者就地让位
      for (let i = heldRuns.length - 1; i >= 0; i--) if (heldRuns[i].m.t === m.t) heldRuns.splice(i, 1);
      fire(6, m, t + 0.02);
      return;
    }
    if (cls === 3 && tagsOf(m).includes('test')) {
      if (resolveSeen.includes(m.t)) return; // 和弦先到：铃不再鸣
      heldRuns.push({ m, dueAt: t + RUN_HOLD_SEC });
      return;
    }
    fire(cls, m, t + 0.02);
  }

  /** 泵：浏览器壳按间隔调、金测试手动调——押后窗放行＋前瞻窗续排（包流断绝时的兜底）。 */
  function pump() {
    flushHeld(now());
    horizon();
  }

  return {
    onPacket, onMoment, pump,
    stats() {
      return { audio0, rows: track.length, packets: packetCount, moments: momentCount, fired: firedCount, held: heldRuns.length };
    },
  };
}
