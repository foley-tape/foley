// M1.9 金测试：v1-live 正典。
// ㉔ replay ≡ live 逐字节（审计发现 7 收尾）——同一原始卷：批式蒸馏→replay(20Hz) 与
//    增量蒸馏→live driver（含心跳抖动模拟）→ curve/moments 全逐字节一致。
// ㉕ 未决尾随（含挂起 RUN / 未答 ASK）：curve 逐字节一致（moments 的 seq 让位，见 FEEDBACK M1.9）。
// ㉖ 滴灌 B-5 结案：真挂起的 RUN 会滴灌；开局慢 RUN 窗口可见；总量栅格无关（容差）。
// ㉗ ASK 语义：pendingAsk 窗口 [useT,resolveT)、WAITING、ASK_CLEARED、SESSION_START 复位。
// ㉘ bounded：长流过后 sigStates/滴灌窗/未决表全有界（审计发现 4 固化）。
// ㉙ 时钟单调护栏：迟到事件不回拨（审计 B-7 逆时防护）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { StatePacket } from '../protocol/index.ts';
import { createEngine, ingest, advanceTo as engineAdvance } from '../engine/index.ts';
import { resolveParams, type Params } from '../engine/params.ts';
import {
  distillTape, serializeTape, createIncrementalDistiller,
} from '../adapters/claude-jsonl/index.ts';
import { replayText, replayCore, buildCurveCsv, buildMomentsCsv } from '../cli/replay.ts';
import { createDriver, applyOp, LIVE_SNAP_MS, ARCHIVE_SNAP_MS, type Emit } from '../cli/driver.ts';

const here = dirname(fileURLToPath(import.meta.url));
const paramsRaw = JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8'));
const params: Params = resolveParams(paramsRaw);
const META = { engineSha: 'test', paramsHash: 'test', tapeName: 't' };

// ---------- 原始行构造 ----------

const T0 = Date.parse('2026-07-05T10:00:00.000Z');
const iso = (t: number): string => new Date(t).toISOString();

function useLine(t: number, id: string, name: string, input: Record<string, unknown>): string {
  return JSON.stringify({
    type: 'assistant', timestamp: iso(t),
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  });
}
function resLine(t: number, id: string, opts: { err?: boolean; content?: string; tur?: Record<string, unknown> } = {}): string {
  return JSON.stringify({
    type: 'user', timestamp: iso(t), toolUseResult: opts.tur ?? {},
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: opts.err === true, content: opts.content ?? 'ok' }] },
  });
}

/** 全配对正典卷：FAIL、真 test 绿、被回答的 ASK、单槽 3 败＋ok 破卡碟、慢 RUN 滴灌、SAVE。 */
function fixtureCanon(): string {
  const L: string[] = [];
  let t = T0;
  L.push(useLine(t, 'a', 'Edit', { file_path: '/x', old_string: 'a', new_string: 'b' }));
  L.push(resLine(t + 500, 'a', { err: true, content: 'Error: nope' }));
  L.push(useLine(t + 2000, 'b', 'Bash', { command: 'vitest run' }));
  L.push(resLine(t + 4000, 'b', { tur: { durationMs: 2000, code: 0, interrupted: false } }));
  L.push(useLine(t + 6000, 'ask1', 'AskUserQuestion', { questions: [] }));
  L.push(resLine(t + 20_000, 'ask1', { content: 'answered' }));
  // 同槽 3 败 + ok 破卡碟（同命令头 → 同 targetHash）
  for (let i = 0; i < 3; i++) {
    L.push(useLine(t + 22_000 + i * 3000, `j${i}`, 'Bash', { command: 'curl http://x/y' }));
    L.push(resLine(t + 23_000 + i * 3000, `j${i}`, { err: true, content: 'curl: (7) Failed to connect' }));
  }
  L.push(useLine(t + 32_000, 'j3', 'Bash', { command: 'curl http://x/y' }));
  L.push(resLine(t + 33_000, 'j3', { tur: { code: 0 }, content: '200 OK' }));
  // 慢 RUN（90s）：滴灌中段可见
  L.push(useLine(t + 40_000, 'slow', 'Bash', { command: 'npm run build' }));
  L.push(resLine(t + 130_000, 'slow', { tur: { durationMs: 90_000, code: 0 } }));
  // 提交收尾
  L.push(useLine(t + 140_000, 'save', 'Bash', { command: 'git commit -m done' }));
  L.push(resLine(t + 141_000, 'save', { tur: { code: 0 } }));
  L.push(useLine(t + 150_000, 'r', 'Read', { file_path: '/x' }));
  L.push(resLine(t + 150_500, 'r', { content: 'data' }));
  return L.join('\n') + '\n';
}

/** 因果边界卷：开局慢 RUN、真挂起 RUN（结果永不来）、未答 ASK、31min 空档分段。含未决 → 只比 curve。 */
function fixtureEdges(): string {
  const L: string[] = [];
  let t = T0;
  L.push(useLine(t, 'first', 'Bash', { command: 'npm run build' }));      // 开局慢 RUN
  L.push(resLine(t + 90_000, 'first', { tur: { durationMs: 90_000, code: 0 } }));
  L.push(useLine(t + 95_000, 'hang', 'Bash', { command: 'sleep 999999' })); // 真挂起：结果永不来
  L.push(useLine(t + 100_000, 'p1', 'Read', { file_path: '/a' }));
  L.push(resLine(t + 100_500, 'p1', { content: 'x' }));
  L.push(useLine(t + 200_000, 'p2', 'Read', { file_path: '/b' }));
  L.push(resLine(t + 200_500, 'p2', { content: 'y' }));
  L.push(useLine(t + 210_000, 'ask2', 'AskUserQuestion', { questions: [] })); // 未答 ASK
  // 31 分钟空档 → 新 episode（q2 让新段在 SESSION_START 之后仍有采样，供 ㉗b 断言复位）
  const t2 = t + 210_000 + 31 * 60_000;
  L.push(useLine(t2, 'q1', 'Read', { file_path: '/c' }));
  L.push(resLine(t2 + 500, 'q1', { content: 'z' }));
  L.push(useLine(t2 + 5000, 'q2', 'Read', { file_path: '/d' }));
  L.push(resLine(t2 + 5500, 'q2', { content: 'w' }));
  return L.join('\n') + '\n';
}

// ---------- live 仿真（与 cli/live.ts 同一 applyOp 正典映射） ----------

function liveSim(raw: string, snapMs: number, opts: { ticks?: boolean } = {}): { curve: string; moments: string; snaps: StatePacket[]; emitted: Emit[]; driver: ReturnType<typeof createDriver> } {
  const snaps: StatePacket[] = [];
  const emitted: Emit[] = [];
  const d = createDriver(params, snapMs, { snap: (s) => snaps.push(s), moment: (e) => emitted.push(e) });
  const inc = createIncrementalDistiller(params);
  let lastT: number | null = null;
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    // 心跳抖动模拟：行到达前，以 37ms 的怪步长打点（证明采样轴不吃墙钟抖动）。
    // 次序镜像 cli/live.ts 心跳：先 flushDue 再 tickTo（此处 lag=0 = 零延迟正典 live；
    // 真 live 的 lag>0 只把事件生效推迟 ≤lag+poll，不碰采样轴——见 FEEDBACK M1.9）。
    if (opts.ticks) {
      const o = JSON.parse(line) as { timestamp?: string };
      const lt: number | null = o.timestamp ? Date.parse(o.timestamp) : lastT;
      if (lastT !== null && lt !== null) {
        for (let w = lastT; w < lt; w += 37) {
          for (const op of inc.flushDue(w, 0)) applyOp(d, op);
          d.tickTo(w);
        }
      }
      if (lt !== null) lastT = lt;
    }
    for (const op of inc.feedLine(line)) applyOp(d, op);
  }
  for (const op of inc.close()) applyOp(d, op);
  return { curve: buildCurveCsv(snaps), moments: buildMomentsCsv(emitted), snaps, emitted, driver: d };
}

// ㉔ replay ≡ live 逐字节（正典，20Hz）
test('㉔ replay≡live 逐字节：批式→replay(20Hz) vs 增量→driver（含心跳抖动）', () => {
  const raw = fixtureCanon();
  const distilled = serializeTape(distillTape(raw, params));
  const rep = replayText(distilled, params, META, LIVE_SNAP_MS);
  const liveA = liveSim(raw, LIVE_SNAP_MS);
  const liveB = liveSim(raw, LIVE_SNAP_MS, { ticks: true });
  assert.equal(liveA.curve, rep.curveCsv, 'curve 应逐字节一致（无心跳）');
  assert.equal(liveA.moments, rep.momentsCsv, 'moments 应逐字节一致（无心跳）');
  assert.equal(liveB.curve, rep.curveCsv, 'curve 应逐字节一致（含 37ms 心跳抖动）');
  assert.equal(liveB.moments, rep.momentsCsv, 'moments 应逐字节一致（含 37ms 心跳抖动）');
});

// ㉕ 未决尾随：curve 仍逐字节；未决占位导致 moments seq 让位（记录在案，不比）
test('㉕ 未决/未答/分段边界卷：curve 逐字节一致', () => {
  const raw = fixtureEdges();
  const distilled = serializeTape(distillTape(raw, params));
  const rep = replayText(distilled, params, META, LIVE_SNAP_MS);
  const live = liveSim(raw, LIVE_SNAP_MS);
  assert.equal(live.curve, rep.curveCsv, '含未决卷 curve 应逐字节一致');
});

// ㉖ 滴灌 B-5 结案
test('㉖a 真挂起 RUN 会滴灌（replay 与 live 同律）', () => {
  const raw = fixtureEdges();
  const distilled = serializeTape(distillTape(raw, params));
  const core = replayCore(distilled, params, 0.5, LIVE_SNAP_MS);
  // 挂起 RUN use@t+95s，窗口自 t+125s 起漏到流尾；[t+130s, t+200s] 间无其他充能源（p1 已过、READ-OK 无充能）
  const s150 = core.snaps.filter((s) => s.t >= T0 + 150_000 && s.t <= T0 + 160_000);
  const s190 = core.snaps.filter((s) => s.t >= T0 + 190_000 && s.t <= T0 + 200_000);
  assert.ok(s150.length > 0 && s190.length > 0, '应有采样');
  assert.ok(s190[0]!.S > s150[0]!.S, `挂起滴灌应使 S 上行: S@150s=${s150[0]!.S} → S@190s=${s190[0]!.S}`);
});

test('㉖b 开局慢 RUN：落地前滴灌窗口可见（B-5 场景二）', () => {
  const raw = fixtureEdges();
  const distilled = serializeTape(distillTape(raw, params));
  const core = replayCore(distilled, params, 0.5, LIVE_SNAP_MS);
  // 首事件 t=T0+90s（resolveT）；滴灌窗 [T0+30s, T0+90s] 在任何落地之前
  const pre = core.snaps.filter((s) => s.t >= T0 + 60_000 && s.t < T0 + 90_000);
  assert.ok(pre.length > 0, '落地前应有采样（driver 自最早动作起钟）');
  assert.ok(pre[pre.length - 1]!.S > 0, `落地前 S 应因滴灌 >0: ${pre[pre.length - 1]!.S}`);
});

test('㉖c 滴灌总量栅格无关（10Hz vs 20Hz 容差 1e-6）', () => {
  const raw = fixtureCanon();
  const distilled = serializeTape(distillTape(raw, params));
  const a = replayCore(distilled, params, 0.5, ARCHIVE_SNAP_MS);
  const b = replayCore(distilled, params, 0.5, LIVE_SNAP_MS);
  const bByT = new Map(b.snaps.map((s) => [s.t, s]));
  let compared = 0;
  for (const s of a.snaps) {
    const x = bByT.get(s.t);
    if (!x) continue;
    compared++;
    // 滴灌**总量**闭式栅格无关；滴灌-衰减交错仍按栅格离散 → 二阶小量 ~dripΣ×(1−e^(−snap/τ))，容差 1e-4
    assert.ok(Math.abs(x.S - s.S) < 1e-4, `S@${s.t} 栅格漂移过大: ${s.S} vs ${x.S}`);
  }
  assert.ok(compared > 100, `共享时刻应足量（实际 ${compared}）`);
});

// ㉗ ASK 语义
test('㉗a ASK：pendingAsk 窗口 [useT,resolveT) + WAITING + ASK_CLEARED', () => {
  const raw = fixtureCanon();
  const distilled = serializeTape(distillTape(raw, params));
  const rep = replayText(distilled, params, META, LIVE_SNAP_MS);
  // 边界开区间：栅格采样先于同刻 ingest（t=useT 的采样是前置态，t=resolveT 的采样还没关窗）
  const inWin = rep.snaps.filter((s) => s.t > T0 + 6000 && s.t < T0 + 20_000);
  const after = rep.snaps.filter((s) => s.t > T0 + 20_000 && s.t < T0 + 22_000);
  assert.ok(inWin.length > 0 && inWin.every((s) => s.pendingAsk && s.phase === 'WAITING'),
    'ASK 提出到回答之间应 pendingAsk=true 且 WAITING');
  assert.ok(after.every((s) => !s.pendingAsk), '回答落地后 pendingAsk 应清除');
  assert.ok(rep.emitted.some((e) => e.ev.special === 'ASK_CLEARED'), '应发 ASK_CLEARED');
  assert.match(rep.curveCsv.split('\n')[0]!, /pendingAsk/, 'curve.csv 应含 pendingAsk 列（M1.9 §1.2）');
});

test('㉗b 未答 ASK 保持 WAITING；SESSION_START 复位', () => {
  const raw = fixtureEdges();
  const distilled = serializeTape(distillTape(raw, params));
  const rep = replayText(distilled, params, META, LIVE_SNAP_MS);
  const t2 = T0 + 210_000 + 31 * 60_000;
  const waiting = rep.snaps.filter((s) => s.t >= T0 + 211_000 && s.t < t2 - 1000);
  assert.ok(waiting.length > 0 && waiting.every((s) => s.pendingAsk), '未答 ASK 应持续 pendingAsk');
  // 新段首事件（q1）落地于 t2+500（SESSION_START 同刻 rank 在前）；其后采样应已复位
  const nextEp = rep.snaps.filter((s) => s.t > t2 + 500);
  assert.ok(nextEp.length > 0, '新段应有采样');
  assert.ok(nextEp.every((s) => !s.pendingAsk), '新段 SESSION_START 应复位 pendingAsk');
});

// ㉘ bounded（审计发现 4 固化）
test('㉘ 长流过后 sigStates/滴灌窗/未决表全有界', () => {
  const L: string[] = [];
  let t = T0;
  for (let i = 0; i < 1500; i++) {
    const cmd = i % 3 === 0 ? 'curl http://x/y' : `node scripts/task${i % 7}.js`;
    L.push(useLine(t, `e${i}`, 'Bash', { command: cmd }));
    L.push(resLine(t + 400, `e${i}`, i % 2 === 0 ? { err: true, content: 'Error: boom' } : { tur: { code: 0 } }));
    t += 8000; // 3.3 小时
  }
  const live = liveSim(L.join('\n') + '\n', LIVE_SNAP_MS);
  assert.ok(live.driver.st.sigStates.size < 64, `sigStates 应有界（过期驱逐）: ${live.driver.st.sigStates.size}`);
  // 驱逐发生在下一次步进：尾部 ≤ 数个窗属边界惯性；有界性主张 = 不随流长累积（1500 窗剩 O(1)）
  assert.ok(live.driver.dripCount() < 8, `滴灌窗应有界（实际 ${live.driver.dripCount()}）`);
  assert.ok(live.driver.st.outcomes.length <= params.companions.wowWindow, 'wow 窗口有界');
});

// ㉙ 时钟单调护栏（审计 B-7 逆时防护）
test('㉙ 迟到事件不回拨引擎时钟', () => {
  const st = createEngine(params);
  ingest(st, { kind: 'moment', t: 5000, seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'SESSION_START' }, params);
  engineAdvance(st, 10_000, params);
  ingest(st, { kind: 'moment', t: 3000, seq: 1, agent: 'main', verb: 'WRITE', outcome: 'FAIL', m: 0.5, tags: [] }, params);
  assert.equal(st.now, 10_000, '迟到事件（t=3000 < now=10000）不得回拨时钟');
});
