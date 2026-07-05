// M1.8-F 金测试（NIGHT-1 修复回归）：P1-4 参数可调 / P1-1 诚实条款 / F② saveResolveMinS /
// P1-3 目标分槽 / F2 快修（驱逐·needle夹·wow打折）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  createEngine, advanceTo, ingest, reap, snapshot,
  type EngineState, type IngestMoment,
} from '../engine/index.ts';
import { resolveParams, type Params } from '../engine/params.ts';
import { classifyBash, tagsForCommand } from '../adapters/claude-jsonl/verbs.ts';
import { distillTape, serializeTape } from '../adapters/claude-jsonl/index.ts';
import { replayText } from '../cli/replay.ts';

const here = dirname(fileURLToPath(import.meta.url));
const paramsRaw = JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8'));
const params: Params = resolveParams(paramsRaw);
const META = { engineSha: 'test', paramsHash: 'test', tapeName: 't' };

function mom(p: Partial<IngestMoment> & { t: number }): IngestMoment {
  return { kind: 'moment', seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0.5, tags: [], ...p };
}
function seed(): EngineState { const st = createEngine(params); ingest(st, mom({ t: 0, special: 'SESSION_START' }), params); return st; }
const A = (id: string, cmd: string, ts: string): string => JSON.stringify({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: cmd } }] } });
const U = (id: string, isErr: boolean, ts: string): string => JSON.stringify({ type: 'user', timestamp: ts, toolUseResult: { code: isErr ? 1 : 0, durationMs: 100 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isErr, content: isErr ? 'boom' : 'ok' }] } });

// ⑲ P1-4：改 params.adapter 必须能改行为（正则/token 集真读，非硬编码）
test('⑲ P1-4 参数可调：改 testRunners 集即改 tag 行为', () => {
  assert.deepEqual(tagsForCommand('vitest run', params.adapter), ['test'], '默认 vitest 是测试器');
  const stripped = { ...params.adapter, testRunners: params.adapter.testRunners.filter((x) => x !== 'vitest') };
  assert.deepEqual(tagsForCommand('vitest run', stripped), [], '从 params 移除 vitest → 不再贴 test（证明真读 params）');
  // saveCommand 同理
  assert.equal(classifyBash('git commit -m x', params.adapter), 'SAVE');
  const noSave = { ...params.adapter, saveCommand: ['hg', 'commit'] };
  assert.equal(classifyBash('git commit -m x', noSave), 'RUN', '改 saveCommand → git commit 不再 SAVE');
});

// ⑳ P1-1 诚实条款：无辜命令零 tag/零 SAVE；真命令正常（redteamC 转正回归）
test('⑳ P1-1 诚实条款：无辜命令不误触，真命令正确', () => {
  const innocent = ['grep "test" src/', 'rm -rf ./test', 'echo "remember to git commit later"', 'curl -s https://x/health/test', 'cat build.log', 'mkdir test && cd test', 'grep -r "git commit" docs/'];
  for (const c of innocent) {
    assert.deepEqual(tagsForCommand(c, params.adapter), [], `无辜命令不应贴 tag: ${c}`);
    assert.equal(classifyBash(c, params.adapter), 'RUN', `无辜命令不应判 SAVE: ${c}`);
  }
  const real: [string, string, string[]][] = [
    ['npm test', 'RUN', ['test']], ['cd frontend && npm test', 'RUN', ['test']],
    ['vitest run', 'RUN', ['test']], ['cargo test', 'RUN', ['test']],
    ['yarn build', 'RUN', ['build']], ['docker build -t x .', 'RUN', ['build']],
    ['git commit -m wip', 'SAVE', []], ['git add . && git commit -m y', 'SAVE', []],
  ];
  for (const [c, v, tags] of real) {
    assert.equal(classifyBash(c, params.adapter), v, `verb: ${c}`);
    assert.deepEqual(tagsForCommand(c, params.adapter), tags, `tags: ${c}`);
  }
});

// ㉑ P1-1 端到端：高张力中一条含 test 的无关命令 OK → 零 RESOLVE（不再捏造解脱）
test('㉑ P1-1 端到端：curl …/test 成功不发 RESOLVE（诚实条款）', () => {
  const lines: string[] = [];
  for (let i = 0; i < 6; i++) { lines.push(A('f' + i, `deploy step${i}`, `2026-06-01T12:00:0${i}.000Z`)); lines.push(U('f' + i, true, `2026-06-01T12:00:0${i}.500Z`)); }
  lines.push(A('c', 'curl -s https://status/health/test', '2026-06-01T12:00:20.000Z')); lines.push(U('c', false, '2026-06-01T12:00:20.500Z'));
  const out = replayText(serializeTape(distillTape(lines.join('\n') + '\n', params)), params, META);
  const peakBefore = out.snaps.filter((s) => s.t <= Date.parse('2026-06-01T12:00:20.000Z')).reduce((mx, s) => Math.max(mx, s.T), 0);
  assert.ok(peakBefore > 0.3, `curl 前应有真张力: ${peakBefore}`);
  assert.equal(out.emitted.filter((e) => e.ev.special === 'RESOLVE').length, 0, '无关 curl 不得发 RESOLVE');
  assert.equal(out.metrics.oppTestOk, 0, 'oppTestOk=0（这不是测试）');
});

// ㉒ F② saveResolveMinS：平静时提交只泄能不发 RESOLVE；张力时才发和弦
test('㉒ saveResolveMinS：低 S 提交无 RESOLVE，高 S 提交有', () => {
  const lo = seed(); lo.S = 0.1; lo.lastEventT = lo.now; // < 0.15
  const dlo = ingest(lo, mom({ t: 100, verb: 'SAVE', outcome: 'OK', m: 0.3 }), params);
  assert.ok(Math.abs(lo.S - 0.05) < 1e-9, `泄能照旧 S×0.5=0.05，实 ${lo.S}`);
  assert.equal(dlo.filter((x) => x.special === 'RESOLVE').length, 0, '平静提交不发 RESOLVE（卡座咔哒非和弦）');
  const hi = seed(); hi.S = 0.5; hi.lastEventT = hi.now; // ≥ 0.15
  const dhi = ingest(hi, mom({ t: 100, verb: 'SAVE', outcome: 'OK', m: 0.3 }), params);
  assert.equal(dhi.filter((x) => x.special === 'RESOLVE').length, 1, '张力中提交发 RESOLVE');
});

// ㉓ P1-3 目标分槽：3 个不同目标失败 → 零 STUCK；3 个同目标失败 → 1 STUCK
test('㉓ P1-3 目标分槽：扫射≠跳针', () => {
  const diff = seed();
  for (let i = 0; i < 3; i++) { advanceTo(diff, 1000 + i, params); ingest(diff, mom({ t: 1000 + i, verb: 'READ', outcome: 'FAIL', m: 0.4, sig: 'sameErr', clearSig: 'READ|WebFetch|url' + i }), params); }
  const stuckDiff = 0; // 收集
  let sd = 0; const diff2 = seed();
  for (let i = 0; i < 3; i++) { advanceTo(diff2, 1000 + i, params); sd += ingest(diff2, mom({ t: 1000 + i, verb: 'READ', outcome: 'FAIL', m: 0.4, sig: 'sameErr', clearSig: 'READ|WebFetch|url' + i }), params).filter((x) => x.special === 'STUCK_LOOP').length; }
  assert.equal(sd, 0, '3 个不同 URL 同错形 → 扫射，非跳针，零 STUCK');
  void stuckDiff;
  let ss = 0; const same = seed();
  for (let i = 0; i < 3; i++) { advanceTo(same, 1000 + i, params); ss += ingest(same, mom({ t: 1000 + i, verb: 'READ', outcome: 'FAIL', m: 0.4, sig: 'sameErr', clearSig: 'READ|WebFetch|SAMEurl' }), params).filter((x) => x.special === 'STUCK_LOOP').length; }
  assert.equal(ss, 1, '3 次同一 URL 失败 → 真卡碟，1 次 STUCK');
});

// ㉔ F2 过期驱逐：卡碟槽过期 reap 后从 map 移除（无终身累加器）
test('㉔ F2 sigStates 过期驱逐：reap 后 size 归零', () => {
  const st = seed();
  const f = (t: number) => mom({ t, verb: 'RUN', outcome: 'FAIL', m: 0.4, sig: 'e', clearSig: 'slotA' });
  advanceTo(st, 1000, params); ingest(st, f(1000), params);
  advanceTo(st, 1001, params); ingest(st, f(1001), params);
  assert.ok(st.sigStates.size >= 1, '有槽');
  advanceTo(st, 1001 + params.stress.repWindowMs + 5000, params);
  reap(st, params);
  assert.equal(st.sigStates.size, 0, '窗外无活动的槽应被驱逐（size 上界）');
});

// ㉕ F2 needle 发射侧硬夹 [0,1]（饱和过冲不越表）
test('㉕ F2 needle 夹 [0,1]', () => {
  const st = seed(); st.S = 50; st.lastEventT = st.now; // 目标 T≈1
  let maxN = 0;
  for (let i = 0; i < 40; i++) { advanceTo(st, st.now + 100, params); maxN = Math.max(maxN, snapshot(st, st.now, params).needle); }
  assert.ok(maxN <= 1.0 + 1e-12, `needle 发射值应 ≤1，实 ${maxN}`);
  assert.ok(maxN > 0.9, '仍应接近满量程（未把有效信号夹没）');
});

// ㉖ F2 wow 小样本打折：n<4 的交替率被折减
test('㉖ F2 wow n<4 打折', () => {
  const st2 = seed();
  advanceTo(st2, 100, params); ingest(st2, mom({ t: 100, verb: 'RUN', outcome: 'OK', m: 0.3 }), params);
  advanceTo(st2, 101, params); ingest(st2, mom({ t: 101, verb: 'RUN', outcome: 'FAIL', m: 0.3, sig: 'a', clearSig: 'a' }), params);
  const wow2 = st2.wowEvent; // n=2，一次跳变，raw=1，打折×(1/3)
  assert.ok(wow2 > 0 && wow2 < 0.4, `n=2 交替应被折减到 ~1/3，实 ${wow2}`);
});
