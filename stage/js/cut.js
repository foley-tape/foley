// 戏剧计分器＋叙事文法＋时长求解器（FOLEY_DESIGN_DUB §1，剪辑正典）
//
// 纯函数纪律：同带＋同参 → cuts 逐字节一致（金测试盯着）。为此：
// · 只用 IEEE 位一致的算术（+ − × ÷ abs min max floor round）——
//   Math.sin/exp/pow 引擎间无位一致保证，禁入；
// · 一切排序带显式全序比较器；输出只含整数（毫秒、整倍速）。
// 语义纪律：cuts 的时间轴是舞台时间（拼接折叠后），与走纸/回放同轴。
// 词表映射（协议真词 → 设计案名词）：
//   STUCK 边沿 = STUCK_LOOP moment；RESOLVE = RESOLVE moment（引擎 §2.1 三形态共用；
//   ok 型破卡碟与 RESOLVE 同刻双发，expiry 型只发 STUCK_CLEARED——无声，不计分）；
//   ASK 边沿 = pendingAsk 0→1；DONE = phase 沿入 DONE（moment 的 DONE 与其同刻，不重记）。
//   注：五带 fixtures 零 RESOLVE 样本（狩猎早于 RESOLVE 多态化），加成候日带上岗。

export const CUTS_VERSION = 1;

// —— 1s 分箱与密度 d(t) = a·T̄ + b·|ΔT̄| + c·momentRate(60s窗) ＋ 事件加成 ——
export function analyzeTape(tape, params) {
  const { curve, st, moments } = tape;
  const B = Math.max(1, Math.ceil(tape.duration / 1000));
  const Tmean = new Float64Array(B);
  const cnt = new Int32Array(B);
  const active = new Uint8Array(B);
  const wmax = new Int32Array(B).fill(-1);
  const bonus = new Float64Array(B);

  let prevPhase = -1, prevAsk = 0;
  for (let i = 0; i < curve.n; i++) {
    const b = Math.min(B - 1, Math.floor(st[i] / 1000));
    Tmean[b] += curve.T[i]; cnt[b]++;
    if (curve.phase[i] !== 0) active[b] = 1; // 非 IDLE
    if (curve.weather[i] > wmax[b]) wmax[b] = curve.weather[i];
    if (curve.pendingAsk[i] === 1 && prevAsk === 0) bonus[b] += params.bonus.askEdge;
    if (curve.phase[i] === 3 && prevPhase !== 3 && prevPhase >= 0) bonus[b] += params.bonus.done;
    prevAsk = curve.pendingAsk[i]; prevPhase = curve.phase[i];
  }
  // 空箱承前（拼接折叠处可能缺样）
  let lastT = 0, lastW = 0;
  for (let b = 0; b < B; b++) {
    if (cnt[b] > 0) { Tmean[b] /= cnt[b]; lastT = Tmean[b]; } else Tmean[b] = lastT;
    if (wmax[b] < 0) wmax[b] = lastW; else lastW = wmax[b];
  }

  const mCount = new Int32Array(B);
  for (const m of moments) {
    const b = Math.min(B - 1, Math.max(0, Math.floor(m.stageT / 1000)));
    mCount[b]++;
    if (m.special === 'STUCK_LOOP') bonus[b] += params.bonus.stuckEdge;
    else if (m.special === 'RESOLVE') bonus[b] += params.bonus.resolve;
  }
  const rate = new Float64Array(B); // 事件/秒，60s 尾窗
  let acc = 0;
  for (let b = 0; b < B; b++) {
    acc += mCount[b];
    if (b >= 60) acc -= mCount[b - 60];
    rate[b] = acc / 60;
  }

  const d = new Float64Array(B);
  const ca = params.density.a, cb = params.density.b, cc = params.density.c;
  for (let b = 0; b < B; b++) {
    const slope = b === 0 ? 0 : Math.abs(Tmean[b] - Tmean[b - 1]);
    const wUp = b > 0 && wmax[b] > wmax[b - 1] ? params.bonus.weatherUp : 0;
    d[b] = ca * Tmean[b] + cb * slope + cc * rate[b] + bonus[b] + wUp;
  }

  // 前缀和与活跃统计
  const P = new Float64Array(B + 1);
  let activeCount = 0, dActiveSum = 0;
  for (let b = 0; b < B; b++) {
    P[b + 1] = P[b] + d[b];
    if (active[b]) { activeCount++; dActiveSum += d[b]; }
  }
  const dActiveMean = activeCount > 0 ? dActiveSum / activeCount : 0;

  return { B, d, P, Tmean, active, activeCount, dActiveMean, mCount };
}

// 最大盈余窗（Kleinberg 突发权重精神：强度×时长——加一秒平庸即减分）。
// 全序决胜：盈余大者；平则窗长者；再平则起点早者。
function bestExcessWindow(P, dMean, B, minLen, maxLen, lo = 0, hi = B) {
  let best = null;
  const L1 = Math.min(maxLen, hi - lo);
  for (let L = Math.max(1, minLen); L <= L1; L++) {
    for (let s = lo; s + L <= hi; s++) {
      const ex = (P[s + L] - P[s]) - dMean * L;
      if (best === null || ex > best.ex || (ex === best.ex && (L > best.L || (L === best.L && s < best.s)))) {
        best = { s, L, ex };
      }
    }
  }
  return best;
}

// 区间工具：候选段对已占区间做减法，取自身内最大空段（平则靠前）
function clipAgainst(b0, b1, placed) {
  let frees = [[b0, b1]];
  for (const p of placed) {
    const next = [];
    for (const [f0, f1] of frees) {
      if (p.b1 <= f0 || p.b0 >= f1) { next.push([f0, f1]); continue; }
      if (p.b0 > f0) next.push([f0, p.b0]);
      if (p.b1 < f1) next.push([p.b1, f1]);
    }
    frees = next;
  }
  let best = null;
  for (const [f0, f1] of frees) {
    if (best === null || f1 - f0 > best[1] - best[0]) best = [f0, f1];
  }
  return best; // 可能为 null（全被占）
}

// —— 叙事文法：不是 top-N，是一条弧 ——
export function proposeCuts(tape, params, targetS) {
  const A = analyzeTape(tape, params);
  const { B, d, P, Tmean, active, activeCount, dActiveMean } = A;
  const g = params.grammar;
  const target = (targetS ?? params.solver.defaultS) * 1000;
  if (activeCount === 0) return { segments: [], analysis: shadowOf(tape, params, [], A) }; // 无戏可剪，机器不提议

  // 锚段候选（bin 坐标；先各自找家，再按优先级落座互不相压）
  let firstActive = 0; while (firstActive < B && !active[firstActive]) firstActive++;
  let lastActive = B - 1; while (lastActive > 0 && !active[lastActive]) lastActive--;

  // PEAK：全带最大盈余窗，原速——高潮必须原速
  const pk = bestExcessWindow(P, dActiveMean, B, g.peak.minS, g.peak.maxS);
  const peak = { role: 'PEAK', b0: pk.s, b1: pk.s + pk.L, speed: g.peak.speed };

  // CLOSE：正格终止感优先——最后一次 DONE 落针；无 DONE 取最终衰减段
  let doneBin = -1;
  {
    const c = tape.curve;
    let prev = -1;
    for (let i = 0; i < c.n; i++) {
      if (c.phase[i] === 3 && prev !== 3 && prev >= 0) doneBin = Math.min(B - 1, Math.floor(tape.st[i] / 1000));
      prev = c.phase[i];
    }
  }
  const closeEnd = doneBin >= 0 ? Math.min(B, doneBin + g.close.tailS) : Math.min(B, lastActive + 1);
  const close = {
    role: 'CLOSE', speed: g.close.speed,
    b0: Math.max(0, closeEnd - g.close.viewerS * g.close.speed), b1: closeEnd,
  };

  // OPEN：起步或首次活动，快进掠过
  const open = {
    role: 'OPEN', speed: g.open.speed,
    b0: firstActive, b1: Math.min(B, firstActive + g.open.viewerS * g.open.speed),
  };

  // RAMP：峰前最大爬升窗（Σ正向ΔT̄）
  let ramp = null;
  {
    const speed = g.ramp.speeds[0];
    const L = g.ramp.viewerS * speed;
    if (peak.b0 >= L) {
      const R = new Float64Array(B + 1);
      for (let b = 0; b < B; b++) R[b + 1] = R[b] + (b > 0 ? Math.max(0, Tmean[b] - Tmean[b - 1]) : 0);
      let best = null;
      for (let s = 0; s + L <= peak.b0; s++) {
        const v = R[s + L] - R[s];
        if (best === null || v > best.v || (v === best.v && s < best.s)) best = { s, v };
      }
      if (best && best.v > 0) ramp = { role: 'RAMP', b0: best.s, b1: best.s + L, speed };
    }
  }

  // TURN（可选）：峰外最大单秒 |ΔT̄|，过阈才够格
  let turn = null;
  {
    let tb = -1, tv = 0;
    for (let b = 1; b < B; b++) {
      if (b >= peak.b0 - 2 && b < peak.b1 + 2) continue;
      const s = Math.abs(Tmean[b] - Tmean[b - 1]);
      if (s > tv) { tv = s; tb = b; }
    }
    if (tb >= 0 && tv >= g.turn.minJump) {
      const L = g.turn.viewerS * g.turn.speed;
      turn = { role: 'TURN', b0: Math.max(0, tb - 1), b1: Math.min(B, Math.max(0, tb - 1) + L), speed: g.turn.speed };
    }
  }

  // 落座：优先级 PEAK > CLOSE > OPEN > RAMP > TURN；相压者让/裁/弃
  const placed = [];
  const minBins = { PEAK: g.peak.minS, CLOSE: g.close.viewerMinS * g.close.speed, OPEN: g.open.viewerMinS * g.open.speed, RAMP: g.ramp.viewerMinS * g.ramp.speeds[0], TURN: g.turn.viewerMinS * g.turn.speed };
  for (const cand of [peak, close, open, ramp, turn]) {
    if (!cand) continue;
    const slot = clipAgainst(cand.b0, cand.b1, placed);
    if (!slot || slot[1] - slot[0] < Math.max(1, minBins[cand.role])) continue;
    placed.push({ ...cand, b0: slot[0], b1: slot[1] });
  }
  placed.sort((x, y) => x.b0 - y.b0 || x.b1 - y.b1);

  // 桥段：连接锚段的空隙里各取一截 16×（纸带飞驰的延时感）；至多 maxCount 条，大隙优先
  const gaps = [];
  for (let i = 0; i + 1 < placed.length; i++) {
    const gp = placed[i + 1].b0 - placed[i].b1;
    if (gp > 0) gaps.push({ at: placed[i].b1, size: gp });
  }
  gaps.sort((x, y) => y.size - x.size || x.at - y.at);
  const bridges = gaps.slice(0, g.bridge.maxCount).map(gp => ({
    role: 'BRIDGE', speed: g.bridge.speed,
    b0: gp.at, b1: gp.at + Math.min(gp.size, g.bridge.stageS), gapSize: gp.size,
  }));

  // —— 时长求解器：目标为盖，锚段按优先级分配，桥段吸收余量 ——
  const segs = placed.concat(bridges);
  const viewerMs = s => Math.round(((s.b1 - s.b0) * 1000) / s.speed);
  const total = () => segs.reduce((t, s) => t + viewerMs(s), 0);
  const byRole = r => segs.find(s => s.role === r);
  const drop = s => { const i = segs.indexOf(s); if (i >= 0) segs.splice(i, 1); };

  let guard = 64;
  while (total() > target && guard-- > 0) {
    const bs = segs.filter(s => s.role === 'BRIDGE');
    const over = total() - target;
    if (bs.length > 1) { drop(bs[bs.length - 1]); continue; }             // ① 减桥
    if (bs.length === 1 && bs[0].b1 - bs[0].b0 > g.bridge.stageMinS) {    // ② 缩桥
      bs[0].b1 = bs[0].b0 + Math.max(g.bridge.stageMinS, (bs[0].b1 - bs[0].b0) - 8); continue;
    }
    const tn = byRole('TURN'); if (tn) { drop(tn); continue; }            // ③ 弃转
    const rp = byRole('RAMP');
    if (rp && rp.speed < g.ramp.speeds[g.ramp.speeds.length - 1]) { rp.speed = g.ramp.speeds[g.ramp.speeds.length - 1]; continue; } // ④ 爬坡提速
    const op = byRole('OPEN');
    if (op && op.b1 - op.b0 > g.open.viewerMinS * op.speed) { op.b1 = op.b0 + g.open.viewerMinS * op.speed; continue; } // ⑤ 缩起
    const cl = byRole('CLOSE');
    if (cl && cl.b1 - cl.b0 > g.close.viewerMinS * cl.speed) { cl.b0 = cl.b1 - g.close.viewerMinS * cl.speed; continue; } // ⑥ 缩终
    const pkk = byRole('PEAK');
    if (pkk && pkk.b1 - pkk.b0 > g.peak.minS) { pkk.b1 = pkk.b0 + Math.max(g.peak.minS, (pkk.b1 - pkk.b0) - 1); continue; } // ⑦ 削峰（最后）
    if (over > 0 && bs.length === 1) { drop(bs[0]); continue; }
    break;
  }
  guard = 64;
  while (total() < target && guard-- > 0) {
    const cl = byRole('CLOSE');                                            // ① 终段舒展
    if (cl && cl.b1 - cl.b0 < g.close.viewerMaxS * cl.speed) {
      const room = clipAgainst(Math.max(0, cl.b1 - g.close.viewerMaxS * cl.speed), cl.b0, segs.filter(s => s !== cl));
      if (room && room[1] === cl.b0 && room[0] < cl.b0) { cl.b0 = Math.max(room[0], cl.b1 - g.close.viewerMaxS * cl.speed); continue; }
    }
    const rp = byRole('RAMP');                                             // ② 爬坡舒展
    if (rp && (rp.b1 - rp.b0) / rp.speed < g.ramp.viewerMaxS) {
      const room = clipAgainst(rp.b1, Math.min(B, rp.b1 + rp.speed), segs.filter(s => s !== rp));
      if (room && room[0] === rp.b1 && room[1] > rp.b1) { rp.b1 = room[1]; continue; }
    }
    const bs = segs.filter(s => s.role === 'BRIDGE' && s.b1 - s.b0 < Math.min(s.gapSize ?? Infinity, g.bridge.stageMaxS)); // ③ 桥段吸收
    if (bs.length > 0) { bs[0].b1 = Math.min(bs[0].b0 + (bs[0].b1 - bs[0].b0) + 8, bs[0].b0 + Math.min(bs[0].gapSize, g.bridge.stageMaxS)); continue; }
    if (params.solver.allowUnderrun) break;                                // 短带放宽：不用死气凑数
    break;
  }

  // 出段：bin → 毫秒，整理相邻同速（裁切造出的假接带不该存在）
  segs.sort((x, y) => x.b0 - y.b0 || x.b1 - y.b1);
  const ROLE_RANK = { PEAK: 0, CLOSE: 1, OPEN: 2, RAMP: 3, TURN: 4, BRIDGE: 5 };
  const out = [];
  for (const s of segs) {
    const t0 = s.b0 * 1000, t1 = Math.min(s.b1 * 1000, Math.round(tape.duration));
    if (t1 <= t0) continue;
    const prev = out[out.length - 1];
    if (prev && prev.t1 === t0 && prev.speed === s.speed) {
      prev.t1 = t1;
      if (ROLE_RANK[s.role] < ROLE_RANK[prev.role]) prev.role = s.role;
    } else {
      out.push({ role: s.role, t0, t1, speed: s.speed });
    }
  }
  return { segments: out, analysis: shadowOf(tape, params, out, A) };
}

// —— 影子指标（informational 首轮，先验影子自身）：覆盖率与时长占比 ——
// 首采发现：raw 覆盖率对长带在数学上不可达（基线张力×小时数 ≫ 任何 45s 选段），
// 故并采「盈余口径」——只计高出活跃均值的戏剧质量 Σmax(0, d−d̄ₐ)，
// 这是浓度的正确量纲（Kleinberg 突发质量）。两口径同报，候裁选定。
function shadowOf(tape, params, segments, A) {
  const { B, d, P, activeCount, dActiveMean } = A;
  const E = new Float64Array(B + 1); // 盈余前缀和
  for (let b = 0; b < B; b++) E[b + 1] = E[b] + Math.max(0, d[b] - dActiveMean);
  let selD = 0, selE = 0, selMs = 0, selBins = 0;
  for (const s of segments) {
    const b0 = Math.max(0, Math.floor(s.t0 / 1000)), b1 = Math.min(B, Math.ceil(s.t1 / 1000));
    selD += P[b1] - P[b0];
    selE += E[b1] - E[b0];
    selMs += s.t1 - s.t0;
    selBins += b1 - b0;
  }
  const totD = P[B];
  // 选择效率：同 bin 预算下，选到的 ∫d ÷ 理论最优（top-K 无文法约束）。
  // raw/盈余覆盖率量的是带子的浓度性格（storm 弥漫≈0.07，jam 集中≈0.46）；
  // 效率才量选段器本身——文法为叙事让掉的密度是自愿的，此处看它让了多少。
  let efficiency = 0;
  if (selBins > 0 && totD > 0) {
    const sorted = Array.from(d).sort((x, y) => y - x);
    let top = 0;
    for (let k = 0; k < Math.min(selBins, sorted.length); k++) top += sorted[k];
    efficiency = top > 0 ? selD / top : 0;
  }
  const viewerMs = segments.reduce((t, s) => t + Math.round((s.t1 - s.t0) / s.speed), 0);
  return {
    bins: B,
    activeMs: activeCount * 1000,
    viewerMs,
    selectedStageMs: selMs,
    coverage: totD > 0 ? selD / totD : 0,
    excessCoverage: E[B] > 0 ? selE / E[B] : 0,
    efficiency,
    durationShare: activeCount > 0 ? selMs / (activeCount * 1000) : 0,
  };
}

// 任意段表的影子复算（手动选段 / 工具复核用；求解器内已随 proposeCuts 附带）
export function analyzeCuts(tape, params, segments) {
  return shadowOf(tape, params, segments, analyzeTape(tape, params));
}

// —— cuts.json 正典形（只含整数与字符串；序列化逐字节稳定） ——
export function cutsDocument({ tapeName, tapeHash, paramsHash, targetS, segments }) {
  return {
    version: CUTS_VERSION,
    tape: tapeName,
    tapeHash,
    paramsHash,
    targetS,
    segments: segments.map(s => ({ role: s.role, t0: s.t0, t1: s.t1, speed: s.speed })),
  };
}
export function serializeCuts(doc) { return JSON.stringify(doc, null, 2) + '\n'; }
