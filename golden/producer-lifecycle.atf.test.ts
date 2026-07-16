// Producer 生命周期 ATF · 纯状态机层（席一著作权）。
// 本文件是需求正文，不是实现提示。实现前为 RED；禁止 skip/todo/retry 或削弱断言。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type ProducerValue = null | 'alive' | 'dead' | 'ended';
type Phase = 'DETACHED' | 'UNKNOWN' | 'ALIVE' | 'GRACE' | 'ENDED' | 'DEAD';
type Terminal = {
  key: string;
  sessionId: string;
  incarnation: string;
  producerEpoch: number;
  generation: number;
  terminal: 'dead' | 'ended';
};
type View = {
  producer: ProducerValue;
  phase: Phase;
  key: string | null;
  sessionId: string | null;
  incarnation: string | null;
  producerEpoch: number;
  generation: number;
  watchEpoch: number;
};
type Event =
  | { type: 'ARM'; key: string }
  | { type: 'DISARM' }
  | { type: 'CLOSE' }
  | { type: 'SESSION_START'; key: string; sessionId: string; incarnation: string; producerEpoch: number }
  | { type: 'PID_VERIFIED'; key: string; incarnation: string; watchEpoch: number }
  | {
    type: 'SESSION_END';
    key: string;
    sessionId: string;
    incarnation: string;
    producerEpoch: number;
    reason: string;
  }
  | { type: 'PID_GONE'; key: string; incarnation: string; watchEpoch: number }
  | { type: 'GRACE_EXPIRED'; key: string; incarnation: string; watchEpoch: number };

type ProducerModule = {
  createProducerState(terminals?: Terminal[]): unknown;
  reduceProducer(state: unknown, event: Event): unknown;
  producerView(state: unknown): View;
  terminalRecords(state: unknown): Terminal[];
};

const targetRoot = resolve(process.env.FOLEY_ATF_REPO ?? process.cwd());
const moduleFile = join(targetRoot, 'stage', 'producer-lifecycle.mjs');

async function loadProducerModule(): Promise<ProducerModule> {
  assert.ok(
    existsSync(moduleFile),
    `ATF-M00 缺显式状态机：${moduleFile}。先建纯 reducer，不得继续在 serve.mjs 里堆 timer/flag。`,
  );
  const mod = await import(pathToFileURL(moduleFile).href + `?atf=${Date.now()}`) as Partial<ProducerModule>;
  for (const name of ['createProducerState', 'reduceProducer', 'producerView', 'terminalRecords'] as const) {
    assert.equal(typeof mod[name], 'function', `ATF-M00 必须导出 ${name}()`);
  }
  return mod as ProducerModule;
}

const arm = (key: string): Event => ({ type: 'ARM', key });
const start = (key: string, incarnation: string, producerEpoch = 1, sessionId = 'same-session'): Event => ({
  type: 'SESSION_START', key, sessionId, incarnation, producerEpoch,
});
const verified = (key: string, incarnation: string, watchEpoch: number): Event => ({
  type: 'PID_VERIFIED', key, incarnation, watchEpoch,
});
const end = (
  key: string,
  incarnation: string,
  reason = 'other',
  sessionId = 'same-session',
  producerEpoch = 1,
): Event => ({
  type: 'SESSION_END', key, sessionId, incarnation, producerEpoch, reason,
});
const gone = (key: string, incarnation: string, watchEpoch: number): Event => ({
  type: 'PID_GONE', key, incarnation, watchEpoch,
});
const expire = (key: string, incarnation: string, watchEpoch: number): Event => ({
  type: 'GRACE_EXPIRED', key, incarnation, watchEpoch,
});
const compact = (values: ProducerValue[]): ProducerValue[] => {
  const out: ProducerValue[] = [];
  for (const value of values) if (out.at(-1) !== value) out.push(value);
  return out;
};

test('Producer lifecycle ATF · 纯状态机', { timeout: 30000 }, async (t) => {
  const M = await loadProducerModule();
  const apply = (state: unknown, ...events: Event[]): unknown =>
    events.reduce((current, event) => M.reduceProducer(current, event), state);
  const view = (state: unknown): View => M.producerView(state);
  const makeAlive = (
    state: unknown,
    key: string,
    incarnation: string,
    producerEpoch = 1,
    sessionId = 'same-session',
  ): unknown => {
    const started = M.reduceProducer(state, start(key, incarnation, producerEpoch, sessionId));
    return M.reduceProducer(started, verified(key, incarnation, view(started).watchEpoch));
  };
  const strictNoOp = (state: unknown, event: Event, label: string): unknown => {
    const before = structuredClone(state);
    const terminals = structuredClone(M.terminalRecords(state));
    const next = M.reduceProducer(state, event);
    assert.deepEqual(state, before, `${label}：reducer 不得原地改 input`);
    assert.deepEqual(next, before, `${label}：事件必须严格 no-op`);
    assert.deepEqual(M.terminalRecords(next), terminals, `${label}：不得暗写 terminal`);
    return next;
  };
  const assertJsonRoundTrip = (state: unknown, label: string): void => {
    let encoded = '';
    assert.doesNotThrow(() => { encoded = JSON.stringify(state); }, `${label}：state 必须可 JSON stringify`);
    assert.notEqual(encoded, undefined, `${label}：state 不得 stringify 成 undefined`);
    assert.deepEqual(JSON.parse(encoded), state, `${label}：state 必须可无损 JSON round-trip`);
    const terminals = M.terminalRecords(state);
    assert.deepEqual(JSON.parse(JSON.stringify(terminals)), terminals, `${label}：terminalRecords 必须可 JSON round-trip`);
  };

  await t.test('ATF-M01 同 transcript＋同 sessionId 仍按 incarnation 隔离', () => {
    const key = '/tmp/same.jsonl';
    let state = M.createProducerState();
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).key,
        view(state).sessionId,
        view(state).incarnation,
        view(state).producerEpoch,
        view(state).generation,
      ],
      ['DETACHED', null, null, null, null, 0, 0],
      '初态必须 DETACHED 且不泄漏旧身份',
    );

    state = M.reduceProducer(state, arm(key));
    const epoch = view(state).watchEpoch;
    assert.deepEqual(
      [view(state).phase, view(state).producer, view(state).key, view(state).incarnation],
      ['UNKNOWN', null, key, null],
      'ARM 未见 key 必须 UNKNOWN/null',
    );

    state = M.reduceProducer(state, start(key, 'A'));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).incarnation,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['UNKNOWN', null, 'A', 1, 1, epoch],
      'SessionStart 只登记身份；未经当前 arm 的 fresh PID 验真不得亮 alive',
    );
    state = M.reduceProducer(state, verified(key, 'A', epoch));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['ALIVE', 'alive', 1, 1, epoch],
    );
    state = M.reduceProducer(state, end(key, 'A'));
    assert.equal(view(state).producer, 'ended');

    state = M.reduceProducer(state, start(key, 'B', 2));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).incarnation,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['UNKNOWN', null, 'B', 2, 2, epoch],
      '新 incarnation 立即使旧 terminal 失效，但须 fresh verify 后才 alive',
    );
    assert.deepEqual(M.terminalRecords(state), [], 'B start 后 A ended 不得继续被导出');
    state = M.reduceProducer(state, verified(key, 'B', epoch));
    assert.equal(view(state).producer, 'alive', 'B 必须先真 alive，防空过');
    const b = view(state);

    strictNoOp(state, start(key, 'B', 2), '同 incarnation 重复 SessionStart');
    strictNoOp(state, start(key, 'A', 1), 'B 上代后迟到旧 A SessionStart');
    strictNoOp(state, start(key, 'COLLISION', 2), '相同 producerEpoch 的异 incarnation 冲突 Start');
    strictNoOp(state, start(key, 'B', 2, 'wrong-session'), '同 incarnation/epoch 但 sessionId 冲突 Start');
    for (const stale of [
      end(key, 'A'),
      end(key, 'B', 'other', 'wrong-session', 2),
      end(key, 'B', 'other', 'same-session', 1),
      gone(key, 'A', b.watchEpoch),
      expire(key, 'A', b.watchEpoch),
      verified(key, 'A', b.watchEpoch),
    ]) {
      strictNoOp(state, stale, `旧／错身份事件 ${JSON.stringify(stale)}`);
    }

    state = M.reduceProducer(state, gone(key, 'B', b.watchEpoch));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['GRACE', 'alive', 2, 2, b.watchEpoch],
    );
    state = M.reduceProducer(state, expire(key, 'B', b.watchEpoch));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['DEAD', 'dead', 2, 2, b.watchEpoch],
      'B 无本代 End 必须 dead，不得捞 A 历史 End',
    );
  });

  await t.test('ATF-M02 incarnation 与 watchEpoch 双门；换带和 resolver 永不串代', () => {
    const aKey = '/tmp/resolver-A.jsonl';
    const bKey = '/tmp/resolver-B.jsonl';

    let rearmed = makeAlive(apply(M.createProducerState(), arm(aKey)), aKey, 'A');
    const epoch1 = view(rearmed).watchEpoch;
    const generation = view(rearmed).generation;
    rearmed = M.reduceProducer(rearmed, arm(aKey));
    const epoch2 = view(rearmed).watchEpoch;
    assert.deepEqual(
      [view(rearmed).phase, view(rearmed).producer, view(rearmed).producerEpoch, view(rearmed).generation, epoch2],
      ['UNKNOWN', null, 1, generation, epoch1 + 1],
      '同 key rearm 必须推进 watchEpoch、保留 generation，并强制 fresh verify',
    );
    for (const stale of [gone(aKey, 'A', epoch1), expire(aKey, 'A', epoch1), verified(aKey, 'A', epoch1)]) {
      strictNoOp(rearmed, stale, `rearm 后旧 epoch ${JSON.stringify(stale)}`);
    }
    rearmed = M.reduceProducer(rearmed, verified(aKey, 'A', epoch2));
    rearmed = M.reduceProducer(rearmed, gone(aKey, 'A', epoch2));
    assert.deepEqual([view(rearmed).phase, view(rearmed).producer], ['GRACE', 'alive']);

    let switched = makeAlive(apply(M.createProducerState(), arm(aKey)), aKey, 'A');
    const aEpoch1 = view(switched).watchEpoch;
    switched = M.reduceProducer(switched, arm(bKey));
    assert.deepEqual(
      [view(switched).phase, view(switched).producer, view(switched).key, view(switched).watchEpoch],
      ['UNKNOWN', null, bKey, aEpoch1 + 1],
      'A→B 的 ARM 瞬间必须切到 B/UNKNOWN，不能续投影 A',
    );
    switched = M.reduceProducer(switched, arm(aKey));
    const aEpoch3 = view(switched).watchEpoch;
    assert.deepEqual(
      [
        view(switched).phase,
        view(switched).producer,
        view(switched).key,
        view(switched).producerEpoch,
        view(switched).generation,
        aEpoch3,
      ],
      ['UNKNOWN', null, aKey, 1, 1, aEpoch1 + 2],
      'A→B→A 必须再次 fresh verify；generation 不因换带变化',
    );
    strictNoOp(switched, gone(aKey, 'A', aEpoch1), '回到 A 后最早 watcher');
    switched = M.reduceProducer(switched, verified(aKey, 'A', aEpoch3));
    assert.equal(view(switched).producer, 'alive');

    let state = makeAlive(apply(M.createProducerState(), arm(aKey)), aKey, 'A');
    const oldEpoch = view(state).watchEpoch;
    state = M.reduceProducer(state, gone(aKey, 'A', oldEpoch));
    assert.equal(view(state).phase, 'GRACE');
    state = M.reduceProducer(state, start(aKey, 'B', 2));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).incarnation,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['UNKNOWN', null, 'B', 2, 2, oldEpoch],
      'B start 只换 generation，不得偷换 watchEpoch',
    );
    state = M.reduceProducer(state, verified(aKey, 'B', oldEpoch));
    const bState = structuredClone(state);
    for (const stale of [
      expire(aKey, 'A', oldEpoch),
      gone(aKey, 'A', oldEpoch),
      verified(aKey, 'A', oldEpoch),
      end(aKey, 'A'),
    ]) {
      strictNoOp(state, stale, `B 上代后旧 A ${JSON.stringify(stale)}`);
    }
    assert.deepEqual(state, bState);
    assert.deepEqual([view(state).producer, view(state).incarnation], ['alive', 'B']);
  });

  await t.test('ATF-M03 善终两种时序均严格 alive→ended，绝无 dead/null 闪', () => {
    const key = '/tmp/graceful.jsonl';

    let endFirst = makeAlive(apply(M.createProducerState(), arm(key)), key, 'A');
    const seq1: ProducerValue[] = [view(endFirst).producer];
    const epoch1 = view(endFirst).watchEpoch;
    endFirst = M.reduceProducer(endFirst, end(key, 'A')); seq1.push(view(endFirst).producer);
    endFirst = M.reduceProducer(endFirst, gone(key, 'A', epoch1)); seq1.push(view(endFirst).producer);
    assert.deepEqual(compact(seq1), ['alive', 'ended'], `End→PID亡 实测 ${seq1.join('→')}`);
    assert.ok(!seq1.includes('dead') && !seq1.includes(null));

    let goneFirst = makeAlive(apply(M.createProducerState(), arm(key)), key, 'B');
    const epoch2 = view(goneFirst).watchEpoch;
    const seq2: ProducerValue[] = [view(goneFirst).producer];
    goneFirst = M.reduceProducer(goneFirst, gone(key, 'B', epoch2)); seq2.push(view(goneFirst).producer);
    assert.deepEqual([view(goneFirst).phase, view(goneFirst).producer], ['GRACE', 'alive']);
    goneFirst = M.reduceProducer(goneFirst, end(key, 'B')); seq2.push(view(goneFirst).producer);
    goneFirst = M.reduceProducer(goneFirst, expire(key, 'B', epoch2)); seq2.push(view(goneFirst).producer);
    assert.deepEqual(compact(seq2), ['alive', 'ended'], `PID亡→grace内End 实测 ${seq2.join('→')}`);
    assert.ok(!seq2.includes('dead') && !seq2.includes(null));
  });

  await t.test('ATF-M04 猝死：GRACE 到期才 dead，期间公开仍 alive', () => {
    const key = '/tmp/abrupt.jsonl';
    let state = makeAlive(apply(M.createProducerState(), arm(key)), key, 'A');
    const epoch = view(state).watchEpoch;
    const generation = view(state).generation;
    state = M.reduceProducer(state, gone(key, 'A', epoch));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['GRACE', 'alive', 1, generation, epoch],
    );
    state = M.reduceProducer(state, expire(key, 'A', epoch));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['DEAD', 'dead', 1, generation, epoch],
    );
  });

  await t.test('ATF-M05 终态吸收、resume 严格 no-op、仅新 incarnation 复活', () => {
    const key = '/tmp/terminal-absorb.jsonl';

    let dead = makeAlive(apply(M.createProducerState(), arm(key)), key, 'A');
    const deadEpoch = view(dead).watchEpoch;
    dead = apply(dead, gone(key, 'A', deadEpoch), expire(key, 'A', deadEpoch));
    for (const stale of [
      end(key, 'A'),
      end(key, 'A', 'resume'),
      gone(key, 'A', deadEpoch),
      expire(key, 'A', deadEpoch),
      verified(key, 'A', deadEpoch),
    ]) {
      strictNoOp(dead, stale, `DEAD 吸收 ${JSON.stringify(stale)}`);
    }

    let ended = makeAlive(apply(M.createProducerState(), arm(key)), key, 'B');
    ended = M.reduceProducer(ended, end(key, 'B'));
    const endedEpoch = view(ended).watchEpoch;
    for (const stale of [
      end(key, 'B'),
      end(key, 'B', 'resume'),
      gone(key, 'B', endedEpoch),
      expire(key, 'B', endedEpoch),
      verified(key, 'B', endedEpoch),
    ]) {
      strictNoOp(ended, stale, `ENDED 吸收 ${JSON.stringify(stale)}`);
    }

    let alive = makeAlive(apply(M.createProducerState(), arm(key)), key, 'C');
    strictNoOp(alive, end(key, 'C', 'resume'), 'ALIVE + resume End');
    const aliveEpoch = view(alive).watchEpoch;
    alive = M.reduceProducer(alive, gone(key, 'C', aliveEpoch));
    strictNoOp(alive, end(key, 'C', 'resume'), 'GRACE + resume End');

    let successor = M.reduceProducer(ended, start(key, 'D', 2));
    assert.deepEqual(
      [
        view(successor).phase,
        view(successor).producer,
        view(successor).incarnation,
        view(successor).producerEpoch,
        view(successor).generation,
      ],
      ['UNKNOWN', null, 'D', 2, 2],
      '新 incarnation 是唯一复活通道，但必须 fresh verify',
    );
    assert.deepEqual(M.terminalRecords(successor), [], '新 incarnation start 必须立即废除旧 ended');
    successor = M.reduceProducer(successor, verified(key, 'D', view(successor).watchEpoch));
    assert.equal(view(successor).producer, 'alive');
  });

  await t.test('ATF-M06 terminal JSON 持久、最高代 fold、新代立即废除旧 terminal', () => {
    const endedKey = '/tmp/ended.jsonl';
    const deadKey = '/tmp/dead.jsonl';
    let state = apply(M.createProducerState(), arm(endedKey), start(endedKey, 'E'), end(endedKey, 'E'));
    state = M.reduceProducer(state, arm(deadKey));
    state = makeAlive(state, deadKey, 'D');
    const epoch = view(state).watchEpoch;
    state = apply(state, gone(deadKey, 'D', epoch), expire(deadKey, 'D', epoch));

    const records = JSON.parse(JSON.stringify(M.terminalRecords(state))) as Terminal[];
    assert.deepEqual(
      [...records].sort((a, b) => a.key.localeCompare(b.key)),
      [
        {
          key: deadKey, sessionId: 'same-session', incarnation: 'D',
          producerEpoch: 1, generation: 1, terminal: 'dead',
        },
        {
          key: endedKey, sessionId: 'same-session', incarnation: 'E',
          producerEpoch: 1, generation: 1, terminal: 'ended',
        },
      ].sort((a, b) => a.key.localeCompare(b.key)),
    );

    let restarted = apply(M.createProducerState(records), arm(endedKey));
    assert.equal(view(restarted).producer, 'ended');
    strictNoOp(restarted, start(endedKey, 'E'), '重放 persisted ended 的同 incarnation Start');
    restarted = M.reduceProducer(restarted, arm(deadKey));
    assert.equal(view(restarted).producer, 'dead');
    strictNoOp(restarted, start(deadKey, 'D'), '重放 persisted dead 的同 incarnation Start');

    restarted = M.reduceProducer(restarted, start(deadKey, 'D2', 2));
    assert.deepEqual(
      [view(restarted).phase, view(restarted).producer, view(restarted).producerEpoch, view(restarted).generation],
      ['UNKNOWN', null, 2, 2],
      'terminal 后新 incarnation generation 必须恰 +1，且未经 verify 不得 alive',
    );
    assert.deepEqual(
      M.terminalRecords(restarted),
      [{
        key: endedKey, sessionId: 'same-session', incarnation: 'E',
        producerEpoch: 1, generation: 1, terminal: 'ended',
      }],
      'D2 start 后旧 D/dead 必须从 terminalRecords 消失',
    );
    const secondBoot = apply(M.createProducerState(M.terminalRecords(restarted)), arm(deadKey));
    assert.deepEqual(
      [view(secondBoot).phase, view(secondBoot).producer],
      ['UNKNOWN', null],
      '只重放 current terminal 时不得让已被新代废除的 dead 复活',
    );
    restarted = M.reduceProducer(restarted, verified(deadKey, 'D2', view(restarted).watchEpoch));
    assert.equal(view(restarted).producer, 'alive');

    const highKey = '/tmp/highest-generation.jsonl';
    const high: Terminal = {
      key: highKey, sessionId: 'same-session', incarnation: 'new',
      producerEpoch: 4, generation: 4, terminal: 'dead',
    };
    const low: Terminal = {
      key: highKey, sessionId: 'same-session', incarnation: 'old',
      producerEpoch: 2, generation: 2, terminal: 'ended',
    };
    for (const history of [[high, low], [low, high]]) {
      let highest = apply(M.createProducerState(history), arm(highKey));
      assert.deepEqual(
        [view(highest).producer, view(highest).incarnation, view(highest).producerEpoch, view(highest).generation],
        ['dead', 'new', 4, 4],
        '最高 generation fold 不得依赖数组顺序',
      );
      highest = M.reduceProducer(highest, start(highKey, 'fresh', 5));
      assert.deepEqual(
        [view(highest).phase, view(highest).producer, view(highest).producerEpoch, view(highest).generation],
        ['UNKNOWN', null, 5, 5],
      );
      assert.deepEqual(M.terminalRecords(highest), [], 'gen5 start 必须废除 gen4 terminal');
    }
  });

  await t.test('ATF-M07 registry/projection 闭环：后台记事实，切带不闪，close 真失效', () => {
    const aKey = '/tmp/A.jsonl';
    const bKey = '/tmp/B.jsonl';
    const cKey = '/tmp/C.jsonl';

    strictNoOp(
      M.createProducerState(),
      end(aKey, 'UNMATCHED'),
      '没有可匹配 Start 身份账的遗留 End',
    );

    let background = M.reduceProducer(M.createProducerState(), start(aKey, 'A'));
    assert.deepEqual(
      [view(background).phase, view(background).producer, view(background).key],
      ['DETACHED', null, null],
      '未 ARM 时后台 Start 不得偷做 projection',
    );
    background = M.reduceProducer(background, arm(aKey));
    assert.deepEqual(
      [view(background).phase, view(background).producer, view(background).incarnation],
      ['UNKNOWN', null, 'A'],
      '后台 Start 只能提供身份；ARM 后仍须 fresh verify',
    );
    background = M.reduceProducer(background, verified(aKey, 'A', view(background).watchEpoch));
    assert.equal(view(background).producer, 'alive');

    let state = makeAlive(apply(M.createProducerState(), arm(aKey)), aKey, 'A');
    const oldEpoch = view(state).watchEpoch;
    state = M.reduceProducer(state, gone(aKey, 'A', oldEpoch));
    assert.deepEqual([view(state).phase, view(state).producer], ['GRACE', 'alive'], '闭环前提必须真进 GRACE');
    state = M.reduceProducer(state, { type: 'DISARM' });
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).key,
        view(state).sessionId,
        view(state).incarnation,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['DETACHED', null, null, null, null, 0, 0, oldEpoch + 1],
      'DISARM 必须清 projection 身份并只推进 watchEpoch',
    );
    for (const stale of [
      expire(aKey, 'A', oldEpoch),
      gone(aKey, 'A', oldEpoch),
      verified(aKey, 'A', oldEpoch),
    ]) {
      strictNoOp(state, stale, `DISARM 后旧 watcher ${JSON.stringify(stale)}`);
    }
    state = M.reduceProducer(state, end(aKey, 'A'));
    assert.deepEqual([view(state).phase, view(state).producer], ['DETACHED', null]);
    assert.deepEqual(
      M.terminalRecords(state),
      [{
        key: aKey, sessionId: 'same-session', incarnation: 'A',
        producerEpoch: 1, generation: 1, terminal: 'ended',
      }],
      'DISARM 后真实 End 仍须写后台 registry',
    );
    state = M.reduceProducer(state, arm(aKey));
    assert.equal(view(state).producer, 'ended');

    const beforeB = view(state);
    state = M.reduceProducer(state, arm(bKey));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).key,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['UNKNOWN', null, bKey, 0, 0, beforeB.watchEpoch + 1],
      'ARM B 瞬间必须立刻切 B/UNKNOWN，不得等 B Start 才停止投影 A',
    );
    const bEpoch = view(state).watchEpoch;
    state = M.reduceProducer(state, start(bKey, 'B'));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['UNKNOWN', null, 1, 1, bEpoch],
      'B Start 只动 generation',
    );
    state = M.reduceProducer(state, verified(bKey, 'B', bEpoch));
    const bView = structuredClone(view(state));
    for (const event of [
      gone(aKey, 'A', oldEpoch),
      expire(aKey, 'A', oldEpoch),
      end(aKey, 'A'),
    ]) {
      state = M.reduceProducer(state, event);
      assert.deepEqual(view(state), bView, `A 事件不得污染 B：${JSON.stringify(event)}`);
    }

    state = M.reduceProducer(state, start(cKey, 'C'));
    assert.deepEqual(view(state), bView, 'off-key C Start 只记 registry');
    state = M.reduceProducer(state, end(cKey, 'C'));
    assert.deepEqual(view(state), bView, 'off-key C End 只记 registry');
    state = M.reduceProducer(state, arm(cKey));
    assert.equal(view(state).producer, 'ended', 'ARM C 后才看见后台 ended');

    state = M.reduceProducer(state, start(cKey, 'C2', 2));
    state = M.reduceProducer(state, verified(cKey, 'C2', view(state).watchEpoch));
    const closeEpoch = view(state).watchEpoch;
    state = M.reduceProducer(state, gone(cKey, 'C2', closeEpoch));
    assert.equal(view(state).phase, 'GRACE', 'close 前必须有当前 watcher 在飞');
    state = M.reduceProducer(state, { type: 'CLOSE' });
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).key,
        view(state).sessionId,
        view(state).incarnation,
        view(state).producerEpoch,
        view(state).generation,
        view(state).watchEpoch,
      ],
      ['DETACHED', null, null, null, null, 0, 0, closeEpoch + 1],
      'CLOSE 必须清 projection 身份并令当前 watcher 失效',
    );
    for (const stale of [
      gone(cKey, 'C2', closeEpoch),
      expire(cKey, 'C2', closeEpoch),
      verified(cKey, 'C2', closeEpoch),
    ]) {
      strictNoOp(state, stale, `CLOSE 后当前旧 watcher ${JSON.stringify(stale)}`);
    }
  });

  await t.test('ATF-M08 UNKNOWN：不猜死；fresh verify、真实 End 与新代转移明确', () => {
    const key = '/tmp/unknown.jsonl';
    let state = apply(M.createProducerState(), arm(key), start(key, 'A'));
    assert.deepEqual([view(state).phase, view(state).producer], ['UNKNOWN', null]);
    assert.deepEqual(M.terminalRecords(state), []);
    const epoch = view(state).watchEpoch;
    for (const event of [
      gone(key, 'A', epoch),
      expire(key, 'A', epoch),
      end(key, 'A', 'resume'),
      end(key, 'future-incarnation'),
      verified(key, 'A', epoch - 1),
    ]) {
      strictNoOp(state, event, `UNKNOWN 安静／错代事件 ${JSON.stringify(event)}`);
    }

    let verifiedState = M.reduceProducer(state, verified(key, 'A', epoch));
    assert.deepEqual([view(verifiedState).phase, view(verifiedState).producer], ['ALIVE', 'alive']);

    state = M.reduceProducer(state, end(key, 'A'));
    assert.equal(view(state).producer, 'ended', 'UNKNOWN + 本代真实 End 必须 ENDED');
    assert.deepEqual(
      M.terminalRecords(state),
      [{
        key, sessionId: 'same-session', incarnation: 'A',
        producerEpoch: 1, generation: 1, terminal: 'ended',
      }],
    );
    state = M.reduceProducer(state, start(key, 'B', 2));
    assert.deepEqual(
      [
        view(state).phase,
        view(state).producer,
        view(state).incarnation,
        view(state).producerEpoch,
        view(state).generation,
      ],
      ['UNKNOWN', null, 'B', 2, 2],
      '新代先 UNKNOWN，并立即废除旧 terminal',
    );
    assert.deepEqual(M.terminalRecords(state), []);
    state = M.reduceProducer(state, verified(key, 'B', view(state).watchEpoch));
    assert.equal(view(state).producer, 'alive');
  });

  await t.test('ATF-M09 reachable state×event×代际矩阵；三轴分离；全转移纯且可序列化', () => {
    const key = '/tmp/matrix.jsonl';
    const otherKey = '/tmp/other.jsonl';

    const factory = (phase: Phase): unknown => {
      if (phase === 'DETACHED') return M.reduceProducer(M.createProducerState(), start(key, 'A'));
      let state = apply(M.createProducerState(), arm(key), start(key, 'A'));
      if (phase === 'UNKNOWN') return state;
      state = M.reduceProducer(state, verified(key, 'A', view(state).watchEpoch));
      if (phase === 'ALIVE') return state;
      const epoch = view(state).watchEpoch;
      if (phase === 'ENDED') return M.reduceProducer(state, end(key, 'A'));
      state = M.reduceProducer(state, gone(key, 'A', epoch));
      if (phase === 'GRACE') return state;
      return M.reduceProducer(state, expire(key, 'A', epoch));
    };

    const phases: Phase[] = ['DETACHED', 'UNKNOWN', 'ALIVE', 'GRACE', 'ENDED', 'DEAD'];
    for (const phase of phases) {
      const state = factory(phase);
      assert.equal(view(state).phase, phase, `fixture 必须真到 ${phase}`);
      assertJsonRoundTrip(state, phase);

      for (const foreign of [
        end(key, 'FOREIGN'),
        end(otherKey, 'A'),
        gone(key, 'FOREIGN', view(state).watchEpoch),
        gone(otherKey, 'A', view(state).watchEpoch),
        expire(key, 'FOREIGN', view(state).watchEpoch),
        verified(key, 'FOREIGN', view(state).watchEpoch),
      ]) {
        strictNoOp(state, foreign, `${phase} foreign/key-mismatch ${JSON.stringify(foreign)}`);
      }
      if (view(state).incarnation) {
        strictNoOp(
          state,
          start(key, view(state).incarnation!, view(state).producerEpoch, view(state).sessionId!),
          `${phase} duplicate Start`,
        );
        strictNoOp(
          state,
          start(key, 'OLDER', Math.max(0, view(state).producerEpoch - 1)),
          `${phase} older producerEpoch Start`,
        );
        strictNoOp(
          state,
          start(key, 'COLLISION', view(state).producerEpoch),
          `${phase} equal producerEpoch collision`,
        );
        strictNoOp(
          state,
          end(
            key,
            view(state).incarnation!,
            'other',
            'wrong-session',
            view(state).producerEpoch,
          ),
          `${phase} wrong sessionId`,
        );
        strictNoOp(
          state,
          end(
            key,
            view(state).incarnation!,
            'other',
            view(state).sessionId!,
            Math.max(0, view(state).producerEpoch - 1),
          ),
          `${phase} wrong producerEpoch`,
        );
        for (const staleEpoch of [
          gone(key, view(state).incarnation!, view(state).watchEpoch - 1),
          expire(key, view(state).incarnation!, view(state).watchEpoch - 1),
          verified(key, view(state).incarnation!, view(state).watchEpoch - 1),
        ]) {
          strictNoOp(state, staleEpoch, `${phase} stale watchEpoch ${JSON.stringify(staleEpoch)}`);
        }
      }
    }

    const noopCases: Array<[Phase, (state: unknown) => Event, string]> = [
      ['UNKNOWN', () => start(key, 'A'), 'UNKNOWN + duplicate Start'],
      ['UNKNOWN', (state) => gone(key, 'A', view(state).watchEpoch), 'UNKNOWN + PID_GONE'],
      ['UNKNOWN', (state) => expire(key, 'A', view(state).watchEpoch), 'UNKNOWN + GRACE_EXPIRED'],
      ['UNKNOWN', () => end(key, 'A', 'resume'), 'UNKNOWN + resume End'],
      ['ALIVE', () => start(key, 'A'), 'ALIVE + duplicate Start'],
      ['ALIVE', (state) => verified(key, 'A', view(state).watchEpoch), 'ALIVE + duplicate PID_VERIFIED'],
      ['ALIVE', (state) => expire(key, 'A', view(state).watchEpoch), 'ALIVE + GRACE_EXPIRED'],
      ['ALIVE', () => end(key, 'A', 'resume'), 'ALIVE + resume End'],
      ['GRACE', () => start(key, 'A'), 'GRACE + duplicate Start'],
      ['GRACE', (state) => gone(key, 'A', view(state).watchEpoch), 'GRACE + duplicate PID_GONE'],
      ['GRACE', () => end(key, 'A', 'resume'), 'GRACE + resume End'],
      ['ENDED', () => start(key, 'A'), 'ENDED + duplicate Start'],
      ['ENDED', () => end(key, 'A'), 'ENDED + duplicate End'],
      ['ENDED', () => end(key, 'A', 'resume'), 'ENDED + resume End'],
      ['ENDED', (state) => verified(key, 'A', view(state).watchEpoch), 'ENDED + PID_VERIFIED'],
      ['ENDED', (state) => gone(key, 'A', view(state).watchEpoch), 'ENDED + PID_GONE'],
      ['ENDED', (state) => expire(key, 'A', view(state).watchEpoch), 'ENDED + GRACE_EXPIRED'],
      ['DEAD', () => start(key, 'A'), 'DEAD + duplicate Start'],
      ['DEAD', () => end(key, 'A'), 'DEAD + late End'],
      ['DEAD', () => end(key, 'A', 'resume'), 'DEAD + resume End'],
      ['DEAD', (state) => gone(key, 'A', view(state).watchEpoch), 'DEAD + PID_GONE'],
      ['DEAD', (state) => expire(key, 'A', view(state).watchEpoch), 'DEAD + GRACE_EXPIRED'],
      ['DEAD', (state) => verified(key, 'A', view(state).watchEpoch), 'DEAD + PID_VERIFIED'],
    ];
    for (const [phase, eventOf, label] of noopCases) {
      const state = factory(phase);
      strictNoOp(state, eventOf(state), label);
    }

    const transitionCases: Array<[
      Phase,
      (state: unknown) => Event,
      Phase,
      ProducerValue,
      string,
    ]> = [
      ['UNKNOWN', (state) => verified(key, 'A', view(state).watchEpoch), 'ALIVE', 'alive', '验真'],
      ['UNKNOWN', () => end(key, 'A'), 'ENDED', 'ended', '未知态善终'],
      ['ALIVE', (state) => gone(key, 'A', view(state).watchEpoch), 'GRACE', 'alive', '进入宽限'],
      ['ALIVE', () => end(key, 'A'), 'ENDED', 'ended', '活态善终'],
      ['GRACE', (state) => verified(key, 'A', view(state).watchEpoch), 'ALIVE', 'alive', '宽限内重新验真'],
      ['GRACE', (state) => expire(key, 'A', view(state).watchEpoch), 'DEAD', 'dead', '宽限到期'],
      ['GRACE', () => end(key, 'A'), 'ENDED', 'ended', '宽限内 End'],
    ];
    for (const [phase, eventOf, expectedPhase, expectedProducer, label] of transitionCases) {
      const state = factory(phase);
      const before = structuredClone(state);
      const beforeView = view(state);
      const next = M.reduceProducer(state, eventOf(state));
      assert.deepEqual(state, before, `${label} 不得 mutate input`);
      assert.deepEqual(
        [
          view(next).phase,
          view(next).producer,
          view(next).producerEpoch,
          view(next).generation,
          view(next).watchEpoch,
        ],
        [
          expectedPhase,
          expectedProducer,
          beforeView.producerEpoch,
          beforeView.generation,
          beforeView.watchEpoch,
        ],
        `${label} 只能改 phase，不得混动 producerEpoch/generation/watchEpoch`,
      );
      assertJsonRoundTrip(next, label);
    }

    for (const phase of ['UNKNOWN', 'ALIVE', 'GRACE', 'ENDED', 'DEAD'] as const) {
      const state = factory(phase);
      const before = structuredClone(state);
      const beforeView = view(state);
      let next = M.reduceProducer(
        state,
        start(key, `NEXT-${phase}`, beforeView.producerEpoch + 1),
      );
      assert.deepEqual(state, before, `${phase} + new Start 不得 mutate input`);
      assert.deepEqual(
        [
          view(next).phase,
          view(next).producer,
          view(next).producerEpoch,
          view(next).generation,
          view(next).watchEpoch,
        ],
        [
          'UNKNOWN',
          null,
          beforeView.producerEpoch + 1,
          beforeView.generation + 1,
          beforeView.watchEpoch,
        ],
        `${phase} + new Start 接受更大 producerEpoch，并只令 generation 恰 +1`,
      );
      assert.equal(
        M.terminalRecords(next).some((record) => record.key === key),
        false,
        `${phase} + new Start 后该 key 不得残留旧 terminal`,
      );
      const startedView = view(next);
      next = M.reduceProducer(next, verified(key, `NEXT-${phase}`, startedView.watchEpoch));
      assert.deepEqual(
        [
          view(next).phase,
          view(next).producer,
          view(next).producerEpoch,
          view(next).generation,
          view(next).watchEpoch,
        ],
        ['ALIVE', 'alive', startedView.producerEpoch, startedView.generation, startedView.watchEpoch],
        'PID_VERIFIED 不得混动三枚时序量',
      );
    }

    const detached = factory('DETACHED');
    const detachedBefore = structuredClone(detached);
    let detachedNext = M.reduceProducer(detached, start(key, 'B', 2));
    assert.deepEqual(detached, detachedBefore, 'DETACHED + new Start 不得 mutate input');
    assert.deepEqual(
      [view(detachedNext).phase, view(detachedNext).producer, view(detachedNext).watchEpoch],
      ['DETACHED', null, 0],
      'DETACHED + new Start 只更新后台 registry',
    );
    detachedNext = M.reduceProducer(detachedNext, arm(key));
    assert.deepEqual(
      [
        view(detachedNext).phase,
        view(detachedNext).producerEpoch,
        view(detachedNext).generation,
        view(detachedNext).watchEpoch,
      ],
      ['UNKNOWN', 2, 2, 1],
      '后来 ARM 必须看见 DETACHED 期间接受的新代',
    );

    for (const phase of phases) {
      const source = factory(phase);
      const sourceView = view(source);
      const before = structuredClone(source);
      const rearm = M.reduceProducer(source, arm(key));
      const expectedPhase: Phase = phase === 'ENDED' || phase === 'DEAD' ? phase : 'UNKNOWN';
      const expectedProducer: ProducerValue = phase === 'ENDED'
        ? 'ended'
        : phase === 'DEAD'
          ? 'dead'
          : null;
      assert.deepEqual(source, before, `${phase} + ARM 不得 mutate input`);
      assert.deepEqual(
        [
          view(rearm).phase,
          view(rearm).producer,
          view(rearm).producerEpoch,
          view(rearm).generation,
          view(rearm).watchEpoch,
        ],
        [expectedPhase, expectedProducer, 1, 1, sourceView.watchEpoch + 1],
        `${phase} + ARM 只推进 watchEpoch；非终态 fresh verify，terminal 保持`,
      );

      for (const event of [{ type: 'DISARM' } as Event, { type: 'CLOSE' } as Event]) {
        const eventSource = factory(phase);
        const eventView = view(eventSource);
        const eventBefore = structuredClone(eventSource);
        const eventDetached = M.reduceProducer(eventSource, event);
        assert.deepEqual(eventSource, eventBefore, `${phase} + ${event.type} 不得 mutate input`);
        assert.deepEqual(
          [
            view(eventDetached).phase,
            view(eventDetached).producer,
            view(eventDetached).key,
            view(eventDetached).producerEpoch,
            view(eventDetached).generation,
            view(eventDetached).watchEpoch,
          ],
          ['DETACHED', null, null, 0, 0, eventView.watchEpoch + 1],
          `${phase} + ${event.type} 只推进 watchEpoch 并清 projection`,
        );
        const reattached = M.reduceProducer(eventDetached, arm(key));
        assert.deepEqual(
          [
            view(reattached).phase,
            view(reattached).producer,
            view(reattached).producerEpoch,
            view(reattached).generation,
            view(reattached).watchEpoch,
          ],
          [expectedPhase, expectedProducer, 1, 1, eventView.watchEpoch + 2],
          `${phase} + ${event.type} 不得暗改 registry；reducer 可复用重 ARM`,
        );
      }
    }
  });
});
