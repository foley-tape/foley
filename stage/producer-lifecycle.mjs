// producer 生命周期显式状态机 —— ATF 裁决 §二.2 的落地（需求正文＝席一验收单
// audit/seat1-producer-atf/PRODUCER_LIFECYCLE_ATF.md；金测 golden/producer-lifecycle.atf.test.ts）。
//
// 纯 reducer 纪律（ATF §3）：不读时钟/文件/PID/网络；不原地修改输入 state；
// state 与 terminalRecords() 输出皆可无损 JSON round-trip。serve 只是 adapter——
// PID 检测、timer、spool、持久层只产「事实事件」送入本机，禁止旁路直写公开 producer。
//
// 三条时序轴（ATF §2·互不冒充）：
//   incarnation   一枚 logical producer run 的身份；每次 SessionStart 都是新 incarnation。
//   producerEpoch 每 transcript key 持久严格递增（hook 落 spool 前分配）——外部乱序裁决依据：
//                 只有更大者建立新代；相等重放/相等冲突/较小迟到 Start 严格 no-op。
//   watchEpoch    arm/watch 生命周期：只有 ARM/DISARM/CLOSE 推进；watcher 回调（verify/gone/expire）
//                 必须携带发起时的 watchEpoch，过期即弃。
//
// 两层结构（ATF §4）：
//   registry    按 key 记当前代身份＋终态（后台 start/end 未 arm 也更新；后台 start 只登记身份）。
//   projection  只投影 armedKey；watch ∈ UNKNOWN|ALIVE|GRACE 是投影层相位（终态相位由 registry 派生）。

const TERMINALS = new Set(['ended', 'dead']);

/** 从持久 terminal 记录折叠初始 state：同 key 取最高 generation（不依赖数组顺序·ATF-M06）。 */
export function createProducerState(terminals = []) {
  const registry = {};
  if (Array.isArray(terminals)) {
    for (const t of terminals) {
      if (!t || typeof t !== 'object') continue;
      const key = typeof t.key === 'string' && t.key ? t.key : null;
      const terminal = TERMINALS.has(t.terminal) ? t.terminal : null;
      if (!key || !terminal) continue;
      if (!Number.isSafeInteger(t.generation) || t.generation <= 0) continue;
      if (!Number.isSafeInteger(t.producerEpoch) || t.producerEpoch <= 0) continue;
      const cur = registry[key];
      if (cur && (cur.generation > t.generation
        || (cur.generation === t.generation && cur.producerEpoch >= t.producerEpoch))) continue;
      registry[key] = {
        sessionId: String(t.sessionId ?? ''),
        incarnation: String(t.incarnation ?? ''),
        producerEpoch: t.producerEpoch,
        generation: t.generation,
        terminal,
      };
    }
  }
  return { armedKey: null, watch: 'UNKNOWN', watchEpoch: 0, registry };
}

/** 纯转移函数。合法转移返回新 state（输入不动）；一切旧代/错身份/错 epoch/终态吸收事件严格 no-op（原引用返回）。 */
export function reduceProducer(state, event) {
  if (!state || typeof state !== 'object' || !event || typeof event !== 'object') return state;

  if (event.type === 'ARM') {
    if (typeof event.key !== 'string' || !event.key) return state;
    // ARM 只推进 watchEpoch：终态可直接投影（producerView 派生），非终态一律回 UNKNOWN 等本 epoch fresh verify。
    return { ...state, armedKey: event.key, watch: 'UNKNOWN', watchEpoch: state.watchEpoch + 1 };
  }

  if (event.type === 'DISARM' || event.type === 'CLOSE') {
    // 清 projection 身份、令当前 watcher 失效；registry（含终态与非终态身份账）原封保留，可再 ARM。
    return { ...state, armedKey: null, watch: 'UNKNOWN', watchEpoch: state.watchEpoch + 1 };
  }

  if (event.type === 'SESSION_START') {
    const { key, sessionId, incarnation, producerEpoch } = event;
    if (typeof key !== 'string' || !key) return state;
    if (typeof sessionId !== 'string' || typeof incarnation !== 'string' || !incarnation) return state;
    if (!Number.isSafeInteger(producerEpoch) || producerEpoch <= 0) return state;
    const cur = state.registry[key];
    // producerEpoch 是唯一裁决：等值（重放或异 incarnation 冲突）与较小（迟到旧 Start）全部严格 no-op。
    if (cur && producerEpoch <= cur.producerEpoch) return state;
    const record = {
      sessionId, incarnation, producerEpoch,
      generation: (cur ? cur.generation : 0) + 1,   // 接受新代恰 +1；旧 terminal 当场废除（terminal:null 即不再导出）
      terminal: null,
    };
    const next = { ...state, registry: { ...state.registry, [key]: record } };
    // 仅 armedKey 刷新投影：先 UNKNOWN（绝不凭陈旧后台事实点亮 ALIVE）；watchEpoch 不动（三轴分离）。
    if (state.armedKey === key) next.watch = 'UNKNOWN';
    return next;
  }

  if (event.type === 'SESSION_END') {
    if (event.reason === 'resume') return state;   // resume 延续不产终态：任何 phase 严格 no-op（ATF-M05）
    const key = event.key;
    const cur = typeof key === 'string' ? state.registry[key] : undefined;
    if (!cur || cur.terminal) return state;        // 无可匹配身份账（遗留 End）／终态吸收（dead 不被洗成 ended）
    // 有效身份＝key+sessionId+incarnation+producerEpoch 全匹配（ATF §2.1），任一不符即旧/异物事件。
    if (cur.incarnation !== event.incarnation
      || cur.sessionId !== event.sessionId
      || cur.producerEpoch !== event.producerEpoch) return state;
    // 后台（未 arm/off-key）End 同样入 registry；投影相位由 producerView 派生，DISARM 期公开态不变。
    return { ...state, registry: { ...state.registry, [key]: { ...cur, terminal: 'ended' } } };
  }

  if (event.type === 'PID_VERIFIED' || event.type === 'PID_GONE' || event.type === 'GRACE_EXPIRED') {
    // watcher 事实事件三重门：当前 arm 的 key ∧ 当前 watchEpoch ∧ 当前 incarnation ∧ 非终态。
    const key = event.key;
    if (state.armedKey === null || state.armedKey !== key) return state;
    if (event.watchEpoch !== state.watchEpoch) return state;
    const cur = state.registry[key];
    if (!cur || cur.terminal || cur.incarnation !== event.incarnation) return state;
    if (event.type === 'PID_VERIFIED') {
      if (state.watch === 'ALIVE') return state;               // 重复验真 no-op
      return { ...state, watch: 'ALIVE' };                     // UNKNOWN/GRACE → ALIVE（宽限内重新验真合法）
    }
    if (event.type === 'PID_GONE') {
      if (state.watch !== 'ALIVE') return state;               // UNKNOWN 不猜死；GRACE 重复 gone no-op
      return { ...state, watch: 'GRACE' };                     // 对外仍 alive——善终不闪的必要条件
    }
    if (state.watch !== 'GRACE') return state;                 // GRACE_EXPIRED 只在 GRACE 成立
    return {
      ...state, watch: 'UNKNOWN',
      registry: { ...state.registry, [key]: { ...cur, terminal: 'dead' } },   // 真猝死：持久终态
    };
  }

  return state;   // 未知事件形状：严格 no-op
}

/** 公开投影（ATF §4 表）：GRACE 对外仍 alive；DETACHED/UNKNOWN → null。 */
export function producerView(state) {
  const armedKey = state.armedKey;
  const rec = armedKey !== null ? state.registry[armedKey] : undefined;
  const phase = armedKey === null ? 'DETACHED'
    : rec && rec.terminal === 'ended' ? 'ENDED'
      : rec && rec.terminal === 'dead' ? 'DEAD'
        : rec ? state.watch
          : 'UNKNOWN';
  const producer = phase === 'ALIVE' || phase === 'GRACE' ? 'alive'
    : phase === 'ENDED' ? 'ended'
      : phase === 'DEAD' ? 'dead'
        : null;
  return {
    producer,
    phase,
    key: armedKey,
    sessionId: rec ? rec.sessionId : null,
    incarnation: rec ? rec.incarnation : null,
    producerEpoch: rec ? rec.producerEpoch : 0,
    generation: rec ? rec.generation : 0,
    watchEpoch: state.watchEpoch,
  };
}

/** 只导出各 key 的「当前」terminal：新 incarnation start 后旧 terminal 立即停止导出（ATF-M01/M06）。 */
export function terminalRecords(state) {
  const out = [];
  for (const key of Object.keys(state.registry).sort()) {
    const rec = state.registry[key];
    if (!rec.terminal) continue;
    out.push({
      key,
      sessionId: rec.sessionId,
      incarnation: rec.incarnation,
      producerEpoch: rec.producerEpoch,
      generation: rec.generation,
      terminal: rec.terminal,
    });
  }
  return out;
}
