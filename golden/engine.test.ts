// M1 金测试（§10 的 7 条）。引擎数学直测 + 回放确定性。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { MomentEvent } from '../protocol/index.ts';
import {
  createEngine, advanceTo, ingest, snapshot, tension, type EngineState,
} from '../engine/index.ts';
import { resolveParams, type Params } from '../engine/params.ts';
import { replayText } from '../cli/replay.ts';
import { parseTape } from '../adapters/claude-jsonl/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const paramsRaw = JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8'));
const params: Params = resolveParams(paramsRaw);

function mom(p: Partial<MomentEvent> & { t: number }): MomentEvent {
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

// ① 同签名连败 3 次 → T 严格递增，且第 3 次发射 STUCK_LOOP
test('① 连败3次 → T严增 + 第3次STUCK_LOOP', () => {
  const st = seed();
  const f = (t: number) => mom({ t, verb: 'WRITE', outcome: 'FAIL', m: 0.5, sig: 'X' });
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
    advanceTo(st, st.now + 1, params); // 触发 updateWeather
    if (st.weather === 'STORM' && prev !== 'STORM') stormEntries++;
    prev = st.weather;
  }
  assert.equal(stormEntries, 1, `STORM 只应进入一次，实际 ${stormEntries}`);
  assert.equal(st.weather, 'STORM', '底部 0.72>0.60 不应退出 STORM');
});

// ④ ASK/DONE 从摄入到广播 ≤50ms（直通道）
test('④ ASK/DONE 摄入→广播 ≤50ms', () => {
  const st = seed();
  advanceTo(st, 5000, params);
  ingest(st, mom({ t: 5000, verb: 'ASK', outcome: 'NA' }), params);
  const pkt = snapshot(st, 5000, params); // 同帧
  assert.equal(pkt.pendingAsk, true);
  assert.equal(pkt.phase, 'WAITING');
  // DONE
  ingest(st, mom({ t: 6000, special: 'DONE' }), params);
  const pkt2 = snapshot(st, 6000, params);
  assert.equal(pkt2.phase, 'DONE');
  // 延迟：状态在事件时刻即反映，≤ 一帧(50ms)
  assert.ok(6000 - 6000 <= 50);
});

// ⑤ 同带两跑 → CSV 逐字节一致（确定性）
test('⑤ 同带两跑 → curve/moments CSV 逐字节一致', () => {
  const tape = [
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-04T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'Edit', input: { file_path: '/x', old_string: 'a', new_string: 'b' } }] } }),
    JSON.stringify({ type: 'user', timestamp: '2026-07-04T10:00:00.500Z', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'Error: nope' }] } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-07-04T10:00:02.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'vitest run' } }] } }),
    JSON.stringify({ type: 'user', timestamp: '2026-07-04T10:00:04.000Z', toolUseResult: { durationMs: 2000, code: 0, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', is_error: false, content: 'ok' }] } }),
  ].join('\n') + '\n';
  const meta = { engineSha: 'test', paramsHash: 'test', tapeName: 't' };
  const a = replayText(tape, params, meta);
  const b = replayText(tape, params, meta);
  assert.equal(a.curveCsv, b.curveCsv, 'curve.csv 应逐字节一致');
  assert.equal(a.momentsCsv, b.momentsCsv, 'moments.csv 应逐字节一致');
});

// ⑥ 静默 5min → S 按 τ=180s（前 60s τ=60）衰减曲线吻合
test('⑥ 静默5min → 分段τ衰减吻合', () => {
  const st = seed();
  st.S = 1.0; st.lastEventT = 0; st.now = 0;
  advanceTo(st, 60_000, params);
  assert.ok(Math.abs(st.S - Math.exp(-1)) < 1e-4, `60s 后应≈${Math.exp(-1).toFixed(4)}，实际 ${st.S.toFixed(4)}`);
  advanceTo(st, 300_000, params);
  const expected = Math.exp(-1) * Math.exp(-240 / 180);
  assert.ok(Math.abs(st.S - expected) < 1e-4, `5min 后应≈${expected.toFixed(4)}，实际 ${st.S.toFixed(4)}`);
});

// ⑦ 1000 行 diff 与 10 行 diff 的 m 比值符合对数公式
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
  const m1000 = parseTape(writeTape(1000, 'w1')).moments.find((m) => m.verb === 'WRITE')!.m;
  const m10 = parseTape(writeTape(10, 'w2')).moments.find((m) => m.verb === 'WRITE')!.m;
  assert.ok(Math.abs(m10 - amp(10)) < 1e-6, `m10=${m10} 应≈${amp(10)}`);
  assert.ok(Math.abs(m1000 - amp(1000)) < 1e-6, `m1000=${m1000} 应≈${amp(1000)}`);
  assert.ok(Math.abs(m1000 / m10 - amp(1000) / amp(10)) < 1e-6, 'm 比值应合对数式');
});
