// M1.6 / M1.6-A 金测试：targetHash 误清 / expiry 正典时刻(replay≡live) / redact 无明文 /
// sweep 确定性 / RESOLVE 多态化。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createEngine, advanceTo, ingest, reap,
  type EngineState, type IngestMoment,
} from '../engine/index.ts';
import { resolveParams, type Params } from '../engine/params.ts';
import { distillTape, serializeTape, redactResult } from '../adapters/claude-jsonl/index.ts';
import { replayText, loadVerdict } from '../cli/replay.ts';
import { computeSweep, type BandDef, type Dim } from '../cli/sweep.ts';

const here = dirname(fileURLToPath(import.meta.url));
const paramsRaw = JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8'));
const params: Params = resolveParams(paramsRaw);
const META = { engineSha: 'test', paramsHash: 'test', tapeName: 't' };

function mom(p: Partial<IngestMoment> & { t: number }): IngestMoment {
  return { kind: 'moment', seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0.5, tags: [], ...p };
}
function seed(): EngineState {
  const st = createEngine(params);
  ingest(st, mom({ t: 0, special: 'SESSION_START' }), params);
  return st;
}
function runEv(id: string, cmd: string, useT: string, resT: string, err: boolean): string[] {
  return [
    JSON.stringify({ type: 'assistant', timestamp: useT, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: cmd } }] } }),
    JSON.stringify({ type: 'user', timestamp: resT, toolUseResult: { durationMs: 100, code: err ? 1 : 0, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: err, content: err ? 'boom error here' : 'ok' }] } }),
  ];
}

// ⑪ targetHash 误清反例：bash-A 卡碟不被 bash-B 成功误清（distill/2 §3）
test('⑪ targetHash：bash-B OK 不清 bash-A 卡碟；bash-A OK 才清', () => {
  const fooFails = [
    ...runEv('f1', 'foocmd', '2026-07-04T10:00:00.000Z', '2026-07-04T10:00:00.100Z', true),
    ...runEv('f2', 'foocmd', '2026-07-04T10:00:01.000Z', '2026-07-04T10:00:01.100Z', true),
    ...runEv('f3', 'foocmd', '2026-07-04T10:00:02.000Z', '2026-07-04T10:00:02.100Z', true),
  ];
  const misClear = [...fooFails, ...runEv('b1', 'barcmd', '2026-07-04T10:00:03.000Z', '2026-07-04T10:00:03.100Z', false)].join('\n') + '\n';
  const a = replayText(serializeTape(distillTape(misClear, params)), params, META);
  assert.equal(a.metrics.stuckEdges, 1, 'foo 第3次应进卡碟');
  assert.equal(a.metrics.clearedOk, 0, 'bar(异目标)OK 不应清 foo 卡碟');

  const selfClear = [...fooFails, ...runEv('a1', 'foocmd', '2026-07-04T10:00:03.000Z', '2026-07-04T10:00:03.100Z', false)].join('\n') + '\n';
  const b = replayText(serializeTape(distillTape(selfClear, params)), params, META);
  assert.equal(b.metrics.clearedOk, 1, 'foo(同目标)OK 应清 foo 卡碟');
});

// ⑫ expiry 正典时刻：STUCK_CLEARED.t = lastHit+repWindow，与 reap 调用时刻无关（replay≡live）；expiry 不泄能
test('⑫ expiry STUCK_CLEARED 正典时刻 tick 无关 + 不泄能', () => {
  const win = params.stress.repWindowMs;
  const stuck = (): EngineState => {
    const st = seed();
    const f = (t: number) => mom({ t, verb: 'RUN', outcome: 'FAIL', m: 0.5, sig: 'Z', clearSig: 'a' });
    advanceTo(st, 1000, params); ingest(st, f(1000), params);
    advanceTo(st, 1001, params); ingest(st, f(1001), params);
    advanceTo(st, 1002, params); ingest(st, f(1002), params);
    return st;
  };
  const stA = stuck(); advanceTo(stA, 1002 + win + 5_000, params);
  const sBefore = stA.S; const rA = reap(stA, params); const sAfter = stA.S;
  const stB = stuck(); advanceTo(stB, 1002 + win + 900_000, params); const rB = reap(stB, params);
  const ca = rA.find((x) => x.special === 'STUCK_CLEARED')!;
  const cb = rB.find((x) => x.special === 'STUCK_CLEARED')!;
  assert.equal(ca.t, 1002 + win, '过期时刻取理论过期点 lastHit+win');
  assert.equal(cb.t, 1002 + win, 'reap 调用时刻不同 → 发射时刻仍逐字节一致');
  assert.equal(ca.clearedBy, 'expiry');
  assert.equal(sBefore, sAfter, 'expiry 消散不改 S（不泄能）');
  assert.equal(rA.filter((x) => x.special === 'RESOLVE').length, 0, 'expiry 不发 RESOLVE');
});

// ⑬ redact（M1.8-F④ 三向量）：errClass/sig 加盐哈希、时间相对化、内建工具名保留
test('⑬ redact 三向量：errClass/sig 加盐、时间相对化、内建工具名保留', () => {
  const raw = runEv('e1', 'somecmd', '2026-07-04T10:00:00.000Z', '2026-07-04T10:00:00.100Z', true).join('\n') + '\n';
  const d = distillTape(raw, params);
  const red = redactResult(d, 'FIXEDSALT'); // 固定盐 → 确定性
  for (const r of red.records) {
    if (r.errClass !== null) assert.match(r.errClass, /^e[0-9a-f]{8}$/, `errClass 应为加盐哈希: ${r.errClass}`);
    if (r.sig !== null) assert.match(r.sig, /^s[0-9a-f]{8}$/, `sig 应为加盐哈希: ${r.sig}`);
  }
  assert.ok(red.records.find((r) => r.verb === 'RUN' && r.errClass), '应有一条失败记录被脱敏');
  // Bash 是内建工具 → 名保留
  assert.equal(red.records.find((r) => !r.special)!.tool, 'Bash', '内建工具名保留');
  // 时间相对化：首事件后所有 t 从 0 起（去日历指纹）
  assert.equal(red.meta.stats.firstT, 0, '脱敏后 firstT 归 0（相对化）');
  assert.ok(red.records.every((r) => r.t >= 0 && r.t < 1e12), '记录时间相对化（非 epoch 绝对值）');
  // 盐改变 → sig 不同（堵字典反演）
  const red2 = redactResult(d, 'OTHERSALT');
  const s1 = red.records.find((r) => r.sig)!.sig;
  const s2 = red2.records.find((r) => r.sig)!.sig;
  assert.notEqual(s1, s2, '不同盐 → 不同 sig 哈希（每带盐防跨带关联）');
});

// ⑭ sweep 确定性：computeSweep 同输入两跑 → CSV 逐字节一致（§4.1）
test('⑭ sweep 确定性：computeSweep 两跑 CSV 逐字节一致', () => {
  const { verdict } = loadVerdict();
  const dims: Dim[] = [
    { path: 'stress.verbWeights.READ', values: [0.15, 0.24] },
    { path: 'amplitude.failDefault', values: [0.3, 0.5] },
  ];
  const current = { 'stress.verbWeights.READ': 0.12, 'amplitude.failDefault': 0.3 };
  const silence = readFileSync(join(here, '..', 'tapes', 'silence.tape.jsonl'), 'utf8');
  const tapes = new Map([['silence', silence]]);
  const bands: BandDef[] = [{ name: 'silence', file: '' }];
  const a = computeSweep(paramsRaw, dims, current, verdict, verdict.rain.floor, bands, tapes);
  const b = computeSweep(paramsRaw, dims, current, verdict, verdict.rain.floor, bands, tapes);
  assert.equal(a.csv, b.csv, 'sweep CSV 应逐字节一致');
  assert.equal(a.results.length, 4, '2×2 网格应 4 组');
});

// ⑮ RESOLVE 多态化：SAVE-OK 发 RESOLVE + S×0.5；破卡碟 OK 发 RESOLVE + S×jamBreakFactor（§2.1）
test('⑮ SAVE-OK 发 RESOLVE 且 S×=0.5', () => {
  const st = seed(); st.S = 1.0; st.lastEventT = st.now;
  const d = ingest(st, mom({ t: 100, verb: 'SAVE', outcome: 'OK', m: 0.3 }), params);
  assert.ok(Math.abs(st.S - 0.5) < 1e-9, `S=${st.S} 应=0.5`);
  assert.equal(d.filter((x) => x.special === 'RESOLVE').length, 1, 'SAVE-OK 现在发 RESOLVE');
});

test('⑮ 破卡碟 OK 发 RESOLVE 且 S×=jamBreakFactor', () => {
  const st = seed();
  const f = (t: number) => mom({ t, verb: 'RUN', outcome: 'FAIL', m: 0.5, sig: 'Z', clearSig: 'a' });
  advanceTo(st, 1000, params); ingest(st, f(1000), params);
  advanceTo(st, 1001, params); ingest(st, f(1001), params);
  advanceTo(st, 1002, params); ingest(st, f(1002), params);
  advanceTo(st, 1003, params);
  const before = st.S;
  assert.ok(before > params.release.jamBreakMinS, '卡碟时 S 应超 jamBreakMinS');
  const d = ingest(st, mom({ t: 1003, verb: 'RUN', outcome: 'OK', m: 0.2, clearSig: 'a' }), params);
  assert.equal(d.filter((x) => x.special === 'STUCK_CLEARED' && x.clearedBy === 'ok').length, 1, '同目标 OK → ok 型 CLEARED');
  assert.equal(d.filter((x) => x.special === 'RESOLVE').length, 1, '破卡碟发 RESOLVE');
  assert.ok(Math.abs(st.S - before * params.release.jamBreakFactor) < 1e-6, `S 应×=${params.release.jamBreakFactor}`);
});
