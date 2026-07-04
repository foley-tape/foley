// M1.7 金测试：criterion status 三态 / landmark N/A≠FAIL / L2 自定位（decayAfterClear）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StatePacket } from '../protocol/index.ts';
import type { DerivedMoment } from '../engine/index.ts';
import { judgeBand, bandViolation, type BandCriteria, type MetricsView } from '../engine/verdict.ts';
import { evalLandmarks, type Emit } from '../cli/replay.ts';
import type { Landmark } from '../engine/verdict.ts';

const MV: MetricsView = {
  peakT: 0.9, dutyTlt30: 0.5, dutyRainStorm: 0.2, rainR: 1.0,
  stuckEdges: 9, resolves: 0, opportunities: 2, jamMonotone: true,
};

// ⑯ criterion status 三态：active 拦路、informational/retired 不入 allGreen 与 violation
test('⑯ status 三态：只有 active 决定 allGreen 与违规', () => {
  const c: BandCriteria = {
    peakT: { min: 0.65, max: 0.92, status: 'active' },          // 0.9 ∈ → PASS
    dutyTlt30: { min: 0.99, status: 'informational' },          // 0.5 < 0.99 未达，但记分不拦
    resolveOnOpportunity: { status: 'retired', reason: 'x' },   // 机会2/RESOLVE0 会红，但退役不计
  };
  const { rows, allGreen } = judgeBand(c, MV);
  assert.equal(allGreen, true, 'active(peakT)过 → 全绿；info/retired 不拉低');
  assert.equal(rows.find((r) => r.label.includes('峰值'))!.status, 'active');
  assert.equal(rows.find((r) => r.label.includes('占空') && r.label.includes('0.30'))!.status, 'informational');
  const retiredRow = rows.find((r) => r.label.includes('RESOLVE'))!;
  assert.equal(retiredRow.status, 'retired');
  assert.equal(retiredRow.ok, false, 'retired 仍记录实测（此处未达）——但不计分');
  assert.equal(bandViolation(c, MV), 0, '仅 active 计违规；active 全过 → 0');

  // 对照：把 informational 提为 active → 立刻拦路
  const c2: BandCriteria = { ...c, dutyTlt30: { min: 0.99, status: 'active' } };
  assert.equal(judgeBand(c2, MV).allGreen, false, 'dutyTlt30 转 active 后应拦路');
  assert.ok(bandViolation(c2, MV) > 0, 'active 未达 → 违规>0');
});

// ---- landmark 构造 helper ----
function snap(t: number, T: number): StatePacket {
  return { kind: 'state', t, agent: 'main', S: -Math.log(1 - T), T, A: 0, wow: 0, needle: T, phase: 'WORKING', weather: 'CLEAR', pendingAsk: false };
}
function clearedEv(t: number): Emit {
  const ev: DerivedMoment = { kind: 'moment', t, seq: -1, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'STUCK_CLEARED', clearedBy: 'ok' };
  return { ev, emitT: t };
}
const L2: Landmark = { id: 'L2', tape: 'storm', desc: '自定位', kind: 'decayAfterClear', status: 'informational', windowSec: 120, minRelDrop: 0.25 };

// ⑰ landmark N/A≠FAIL：无前置（无 STUCK_CLEARED）→ N/A，不算 FAIL
test('⑰ decayAfterClear 前置不满足 → N/A（非 FAIL）', () => {
  const snaps = Array.from({ length: 201 }, (_, i) => snap(i * 1000, 0.6));
  const res = evalLandmarks([L2], 'storm', snaps, [], /* 无 STUCK_CLEARED */ []);
  assert.equal(res.length, 1);
  assert.equal(res[0]!.na, true, '无 STUCK_CLEARED → N/A');
  assert.equal(res[0]!.ok, false, 'N/A 时 ok=false 但由 na 覆盖，报告显 N/A 不显 ❌');
});

// ⑱ L2 自定位：末次破卡碟后自寻无充能衰减窗，T 非增且降≥25% → ✅（不随固定时间窗漂移）
test('⑱ decayAfterClear 自定位到衰减窗 → 命中', () => {
  // T 从 0.80 线性降到 0.50（降 37.5%）于 120s 内，其后维持；末次 CLEARED 在 t=0，无后续 FAIL
  const snaps: StatePacket[] = [];
  for (let t = 0; t <= 200000; t += 1000) {
    const T = t <= 120000 ? 0.80 - 0.30 * (t / 120000) : 0.50;
    snaps.push(snap(t, T));
  }
  const res = evalLandmarks([L2], 'storm', snaps, [], [clearedEv(0)]);
  assert.equal(res[0]!.na, false, '有 STUCK_CLEARED + 存在无充能窗 → 非 N/A');
  assert.equal(res[0]!.ok, true, `非增且降≥25% → 命中；detail=${res[0]!.detail}`);
});
