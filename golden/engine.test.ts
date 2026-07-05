// M1 金测试（§10 + 施工令 §4 新增）。引擎数学直测 + 蒸馏/回放确定性。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createEngine, advanceTo, ingest, snapshot, tension, reap,
  type EngineState, type IngestMoment,
} from '../engine/index.ts';
import { resolveParams, type Params } from '../engine/params.ts';
import { replayText } from '../cli/replay.ts';
import { distillTape, serializeTape, momentOf } from '../adapters/claude-jsonl/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const paramsRaw = JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8'));
const params: Params = resolveParams(paramsRaw);
const META = { engineSha: 'test', paramsHash: 'test', tapeName: 't' };

function mom(p: Partial<IngestMoment> & { t: number }): IngestMoment {
  return {
    kind: 'moment', seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA',
    m: 0.5, tags: [], ...p,
  };
}
function seed(): EngineState {
  const st = createEngine(params);
  ingest(st, mom({ t: 0, special: 'SESSION_START' }), params);
  return st;
}

// ① 同签名连败 3 次 → T 严格递增，且第 3 次发射 STUCK_LOOP（k=2）
test('① 连败3次 → T严增 + 第3次STUCK_LOOP(k=2)', () => {
  const st = seed();
  const f = (t: number) => mom({ t, verb: 'WRITE', outcome: 'FAIL', m: 0.5, sig: 'X', clearSig: 'write|edit' });
  advanceTo(st, 1000, params); const d1 = ingest(st, f(1000), params); const T1 = tension(st.S, params);
  advanceTo(st, 1001, params); const d2 = ingest(st, f(1001), params); const T2 = tension(st.S, params);
  advanceTo(st, 1002, params); const d3 = ingest(st, f(1002), params); const T3 = tension(st.S, params);
  assert.ok(T1 < T2 && T2 < T3, `T 应严格递增: ${T1},${T2},${T3}`);
  assert.equal(d1.filter((x) => x.special === 'STUCK_LOOP').length, 0);
  assert.equal(d2.filter((x) => x.special === 'STUCK_LOOP').length, 0);
  assert.equal(d3.filter((x) => x.special === 'STUCK_LOOP').length, 1, '第3次应发 STUCK_LOOP');
  assert.equal(d3.find((x) => x.special === 'STUCK_LOOP')!.k, 2);
});

// ② S=1.0 时 test-OK → S≈0.6（乘法泄能），并发 RESOLVE
test('② S=1.0 test-OK → S≈0.6 + RESOLVE', () => {
  const st = seed();
  st.S = 1.0; st.lastEventT = st.now;
  const before = st.S;
  const d = ingest(st, mom({ t: 100, verb: 'RUN', outcome: 'OK', tags: ['test'], m: 0.4 }), params);
  assert.ok(Math.abs(st.S - 0.6 * before) < 1e-9, `S=${st.S} 应≈0.6`);
  assert.equal(d.filter((x) => x.special === 'RESOLVE').length, 1);
});

// ③ T 在 0.72↔0.77 振荡 → STORM 只进出一次（迟滞防抖）
test('③ T 0.72↔0.77 振荡 → STORM 只进一次不抖', () => {
  const st = seed();
  st.lastEventT = st.now;
  const Sfor = (T: number) => -Math.log(1 - T) * params.stress.S0;
  const seq = [0.72, 0.77, 0.72, 0.77, 0.72, 0.77, 0.73, 0.76];
  let stormEntries = 0;
  let prev = st.weather;
  for (const T of seq) {
    st.S = Sfor(T);
    advanceTo(st, st.now + 1, params);
    if (st.weather === 'STORM' && prev !== 'STORM') stormEntries++;
    prev = st.weather;
  }
  assert.equal(stormEntries, 1, `STORM 只应进入一次，实际 ${stormEntries}`);
  assert.equal(st.weather, 'STORM', '底部 0.72>0.60 不应退出 STORM');
});

// ④ ASK/DONE 状态转移正确（直通道；原名"≤50ms"经审计更名——测的是状态转移非计时）
test('④ ASK/DONE 状态转移正确', () => {
  const st = seed();
  advanceTo(st, 5000, params);
  ingest(st, mom({ t: 5000, verb: 'ASK', outcome: 'NA' }), params);
  const pkt = snapshot(st, 5000, params);
  assert.equal(pkt.pendingAsk, true);
  assert.equal(pkt.phase, 'WAITING');
  ingest(st, mom({ t: 6000, special: 'DONE' }), params);
  const pkt2 = snapshot(st, 6000, params);
  assert.equal(pkt2.phase, 'DONE');
});

// ⑤ 同（蒸馏）带两跑 → curve/moments CSV 逐字节一致（确定性）
test('⑤ 蒸馏→回放两跑 CSV 逐字节一致', () => {
  const raw = [
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-04T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Edit', input: { file_path: '/x', old_string: 'a', new_string: 'b' } }] } }),
    JSON.stringify({ type: 'user', timestamp: '2026-07-04T10:00:00.500Z', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'Error: nope' }] } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-04T10:00:02.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'vitest run' } }] } }),
    JSON.stringify({ type: 'user', timestamp: '2026-07-04T10:00:04.000Z', toolUseResult: { durationMs: 2000, code: 0, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', is_error: false, content: 'ok' }] } }),
  ].join('\n') + '\n';
  const distilled = serializeTape(distillTape(raw, params));
  const a = replayText(distilled, params, META);
  const b = replayText(distilled, params, META);
  assert.equal(a.curveCsv, b.curveCsv, 'curve.csv 应逐字节一致');
  assert.equal(a.momentsCsv, b.momentsCsv, 'moments.csv 应逐字节一致');
});

// ⑥ 静默 5min → S 按活跃 τ（断流 >idleThreshold 后切 idle τ）分段衰减吻合（τ 值读 params，抗冠军漂移）
test('⑥ 静默5min → 分段τ衰减吻合', () => {
  const { tauActiveSec, tauIdleSec, idleThresholdSec } = params.decay;
  const st = seed();
  st.S = 1.0; st.lastEventT = 0; st.now = 0;
  advanceTo(st, idleThresholdSec * 1000, params);
  const atThr = Math.exp(-idleThresholdSec / tauActiveSec);
  assert.ok(Math.abs(st.S - atThr) < 1e-4, `${idleThresholdSec}s 后应≈${atThr.toFixed(4)}，实际 ${st.S.toFixed(4)}`);
  advanceTo(st, 300_000, params);
  const at300 = atThr * Math.exp(-(300 - idleThresholdSec) / tauIdleSec); // 前 idleThreshold τ=active，其后 τ=idle
  assert.ok(Math.abs(st.S - at300) < 1e-4, `5min 后应≈${at300.toFixed(4)}，实际 ${st.S.toFixed(4)}`);
});

// ⑦ 1000 行 diff 与 10 行 diff 的 m 比值符合对数公式（消费侧 momentOf 算 m）
test('⑦ 1000/10 行 diff 的 m 合对数式', () => {
  const writeTape = (lines: number, id: string) => {
    const content = Array.from({ length: lines }, (_, i) => `line${i}`).join('\n');
    return [
      JSON.stringify({ type: 'assistant', timestamp: '2026-07-04T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Write', input: { file_path: '/x', content } }] } }),
      JSON.stringify({ type: 'user', timestamp: '2026-07-04T10:00:00.100Z', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: false, content: 'ok' }] } }),
    ].join('\n');
  };
  const cap = params.amplitude.writeDiffCap;
  const amp = (x: number) => Math.min(1, Math.log(1 + x) / Math.log(1 + cap));
  const mOf = (lines: number, id: string) => {
    const rec = distillTape(writeTape(lines, id), params).records.find((r) => r.verb === 'WRITE')!;
    return momentOf(rec, params).m;
  };
  const m1000 = mOf(1000, 'w1');
  const m10 = mOf(10, 'w2');
  assert.ok(Math.abs(m10 - amp(10)) < 1e-6, `m10=${m10} 应≈${amp(10)}`);
  assert.ok(Math.abs(m1000 - amp(1000)) < 1e-6, `m1000=${m1000} 应≈${amp(1000)}`);
  assert.ok(Math.abs(m1000 / m10 - amp(1000) / amp(10)) < 1e-6, 'm 比值应合对数式');
});

// ⑧ 卡碟边沿化：同签名连败 4 次 → STUCK_LOOP 只发一次（第 3 次，k=2）
test('⑧ 卡碟边沿化：连败4次只发1次 STUCK_LOOP', () => {
  const st = seed();
  const f = (t: number) => mom({ t, verb: 'RUN', outcome: 'FAIL', m: 0.4, sig: 'Y', clearSig: 'run|bash' });
  let loops = 0; let lastK = -1;
  for (let i = 0; i < 4; i++) {
    advanceTo(st, 1000 + i, params);
    const d = ingest(st, f(1000 + i), params);
    const l = d.filter((x) => x.special === 'STUCK_LOOP');
    loops += l.length;
    if (l.length) lastK = l[0]!.k!;
  }
  assert.equal(loops, 1, '4次只应发1次 STUCK_LOOP（边沿触发）');
  assert.equal(lastK, 2, '发射时 k=2（第3次）');
});

// ⑨ STUCK_CLEARED：同 verb+tool 的 OK 解除卡碟；解除后再败可重入；窗口过期 reap 也解除
test('⑨ STUCK_CLEARED：OK 解除 + 重入 + reap 过期解除', () => {
  const st = seed();
  const F = (t: number) => mom({ t, verb: 'RUN', outcome: 'FAIL', m: 0.4, sig: 'Z', clearSig: 'run|bash' });
  advanceTo(st, 1000, params); ingest(st, F(1000), params);
  advanceTo(st, 1001, params); ingest(st, F(1001), params);
  advanceTo(st, 1002, params); const d3 = ingest(st, F(1002), params);
  assert.equal(d3.filter((x) => x.special === 'STUCK_LOOP').length, 1, '第3次进卡碟');

  advanceTo(st, 1003, params);
  const dok = ingest(st, mom({ t: 1003, verb: 'RUN', outcome: 'OK', m: 0.2, tags: [], clearSig: 'run|bash' }), params);
  assert.equal(dok.filter((x) => x.special === 'STUCK_CLEARED').length, 1, '同 verb+tool 的 OK 应发 STUCK_CLEARED');

  advanceTo(st, 1004, params);
  const d5 = ingest(st, F(1004), params);
  assert.equal(d5.filter((x) => x.special === 'STUCK_LOOP').length, 1, '解除后再败应重入卡碟（再发一次）');

  advanceTo(st, 1004 + params.stress.repWindowMs + 1000, params);
  const reaped = reap(st, params);
  assert.ok(reaped.some((x) => x.special === 'STUCK_CLEARED'), 'reap 应在窗口过期后解除卡碟');
});

// ⑩ episode 分段：>30min 空档切段（蒸馏侧）+ SESSION_START 复位 S/rep/卡碟（引擎侧）
test('⑩ episode 分段：切段 + 复位', () => {
  const rawRun = (id: string, use: string, res: string, err: boolean) => [
    JSON.stringify({ type: 'assistant', timestamp: use, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: 'ls' } }] } }),
    JSON.stringify({ type: 'user', timestamp: res, toolUseResult: { durationMs: 500, code: err ? 1 : 0, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: err, content: err ? 'Error: boom' : 'ok' }] } }),
  ];
  const raw = [
    ...rawRun('a1', '2026-07-04T10:00:00.000Z', '2026-07-04T10:00:00.500Z', true),
    ...rawRun('a2', '2026-07-04T10:00:01.000Z', '2026-07-04T10:00:01.500Z', true),
    ...rawRun('a3', '2026-07-04T10:00:02.000Z', '2026-07-04T10:00:02.500Z', true),
    ...rawRun('b1', '2026-07-04T10:40:00.000Z', '2026-07-04T10:40:00.500Z', false), // 40min 后
  ].join('\n') + '\n';
  const d = distillTape(raw, params);
  assert.equal(d.meta.episodes.length, 2, '>30min 空档应切成 2 段');
  assert.equal(d.records.filter((r) => r.special === 'SESSION_START').length, 2, '两段各一 SESSION_START');

  // 引擎侧：SESSION_START 复位
  const st = seed();
  const f = (t: number) => mom({ t, verb: 'RUN', outcome: 'FAIL', m: 0.5, sig: 'W', clearSig: 'run|bash' });
  advanceTo(st, 100, params); ingest(st, f(100), params);
  advanceTo(st, 101, params); ingest(st, f(101), params);
  advanceTo(st, 102, params); ingest(st, f(102), params); // 卡碟 + 应力
  assert.ok(st.S > 0.1 && st.sigStates.size > 0);
  ingest(st, mom({ t: 200, special: 'SESSION_START' }), params);
  assert.equal(st.S, 0, 'S 复位');
  assert.equal(st.sigStates.size, 0, 'rep/卡碟态复位');
  // 复位后同签名从头计数：到第 3 次才再发 STUCK_LOOP
  let d3loops = 0;
  for (let i = 0; i < 3; i++) { advanceTo(st, 300 + i, params); d3loops += ingest(st, f(300 + i), params).filter((x) => x.special === 'STUCK_LOOP').length; }
  assert.equal(d3loops, 1, '复位后重新计数，第3次才发 STUCK_LOOP');
});
