// 红队B 数学审计：边界与确定性。逐项探边，打印实测。只读。
import {
  createEngine, advanceTo, ingest, snapshot, reap, tension,
  type EngineState, type IngestMoment,
} from '../../../engine/index.ts';
import { resolveParams, type Params } from '../../../engine/params.ts';
import { readFileSync } from 'node:fs';

const params: Params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));
function mom(p: Partial<IngestMoment> & { t: number }): IngestMoment {
  return { kind: 'moment', seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0.5, tags: [], ...p };
}
function seed(): EngineState { const st = createEngine(params); ingest(st, mom({ t: 0, special: 'SESSION_START' }), params); return st; }
const ok = (b: boolean) => (b ? '✅' : '❌');

// ---- B1: 断流后巨大 dt 一次性灌入 → 弹簧爆振？ ----
console.log('=== B1 巨大 dt 一次性灌入弹簧（爆振检查）===');
{
  const st = seed(); st.S = 0.9; st.lastEventT = 0; st.now = 0;
  advanceTo(st, 6 * 60 * 60 * 1000, params); // 一次性推进 6 小时
  const snap = snapshot(st, st.now, params);
  console.log(`  6h 一步：needle=${snap.needle.toFixed(6)} T=${snap.T.toFixed(6)} 有限=${ok(Number.isFinite(snap.needle))} 无负=${ok(snap.needle >= 0)} 无过冲=${ok(snap.needle <= 1.0001)}`);
}

// ---- B2: 时钟回拨 / 乱序 ingest（live 模式）→ st.now 行为 ----
console.log('=== B2 时钟回拨 / 乱序事件 ingest ===');
{
  const st = seed();
  advanceTo(st, 10000, params); ingest(st, mom({ t: 10000, verb: 'WRITE', outcome: 'FAIL', m: 0.5, sig: 'A' }), params);
  const S_after_fwd = st.S; const now_fwd = st.now;
  // 回拨：一条时间戳更早的事件到达
  advanceTo(st, 5000, params); // dt<0，advance 早退，st.now 不变
  const now_after_advBack = st.now;
  const d = ingest(st, mom({ t: 5000, verb: 'WRITE', outcome: 'FAIL', m: 0.5, sig: 'A' }), params);
  console.log(`  正向后 now=${now_fwd} S=${S_after_fwd.toFixed(4)}`);
  console.log(`  advanceTo(5000) 后 now=${now_after_advBack}（dt<0 早退，未回退时钟）`);
  console.log(`  ingest(t=5000) 后 now=${st.now}（ingest 无条件 st.now=m.t → 时钟被拉回过去）`);
  console.log(`  → 回拨后再推进会对"过去到现在"重复衰减/积分：确定性依赖输入有序。live 尾随若乱序到达即偏离 replay。`);
  // 量化后果：同两事件、两种到达顺序，终态是否一致？
  const fwd = (() => { const s = seed(); advanceTo(s, 5000, params); ingest(s, mom({ t: 5000, verb: 'WRITE', outcome: 'FAIL', m: 0.5, sig: 'A' }), params); advanceTo(s, 10000, params); ingest(s, mom({ t: 10000, verb: 'WRITE', outcome: 'FAIL', m: 0.5, sig: 'A' }), params); return s.S; })();
  const rev = (() => { const s = seed(); advanceTo(s, 10000, params); ingest(s, mom({ t: 10000, verb: 'WRITE', outcome: 'FAIL', m: 0.5, sig: 'A' }), params); advanceTo(s, 5000, params); ingest(s, mom({ t: 5000, verb: 'WRITE', outcome: 'FAIL', m: 0.5, sig: 'A' }), params); return s.S; })();
  console.log(`  有序终态 S=${fwd.toFixed(6)} vs 乱序终态 S=${rev.toFixed(6)} → 一致=${ok(Math.abs(fwd - rev) < 1e-9)}`);
}

// ---- B3: repWindow 边界差 1ms（含头含尾语义）----
console.log('=== B3 repWindow 边界 ±1ms（rep 计数 / 卡碟窗）===');
{
  const win = params.stress.repWindowMs;
  const test1 = (gap: number): number => {
    const st = seed();
    const f = (t: number) => mom({ t, verb: 'RUN', outcome: 'FAIL', m: 0.4, sig: 'W', clearSig: 'a' });
    advanceTo(st, 1000, params); ingest(st, f(1000), params);      // hit1 @1000
    advanceTo(st, 1000 + gap, params);
    const before = st.sigStates.get('W')!.hits.length;
    ingest(st, f(1000 + gap), params);                             // hit2 @1000+gap
    return st.sigStates.get('W')!.hits.filter((x) => x >= (1000 + gap) - win).length;
  };
  console.log(`  第二次失败距首次 = win-1ms → 窗内计入 ${test1(win - 1)} 次（含 rep 抬升）`);
  console.log(`  第二次失败距首次 = win   ms → 窗内计入 ${test1(win)} 次`);
  console.log(`  第二次失败距首次 = win+1ms → 窗内计入 ${test1(win + 1)} 次（cutoff 用 >=，恰好等于 win 仍保留）`);
}

// ---- B4: 天气迟滞恰落阈值等号 ----
console.log('=== B4 天气阈值等号归属（T 恰=0.75 进 STORM？恰=0.60 出？）===');
{
  const Sfor = (T: number) => -Math.log(1 - T) * params.stress.S0;
  const wxAt = (T: number, from: string): string => {
    const st = seed(); st.lastEventT = st.now; st.weather = from as EngineState['weather'];
    st.S = Sfor(T); advanceTo(st, st.now + 1, params); return st.weather;
  };
  console.log(`  T=0.75 恰进：CLEAR→${wxAt(0.75, 'CLEAR')}（enter 用 >=，应 STORM 途径）`);
  console.log(`  T=0.60 恰出：STORM→${wxAt(0.60, 'STORM')}（exit 用 T<0.60，0.60 不 <0.60 → 应留 STORM）`);
  console.log(`  T=0.5999 出：STORM→${wxAt(0.5999, 'STORM')}`);
  console.log(`  T=0.25 恰进：CLEAR→${wxAt(0.25, 'CLEAR')}`);
}

// ---- B5: wow 样本 <2 ----
console.log('=== B5 wow 样本<2（alternationRate n<2）===');
{
  const st = seed();
  advanceTo(st, 1000, params); ingest(st, mom({ t: 1000, verb: 'RUN', outcome: 'OK', m: 0.3 }), params);
  console.log(`  1 个有结果事件后 wowEvent=${st.wowEvent}（应 0，无跳变可算）wowSmoothed=${st.wowSmoothed}`);
}

// ---- B6: 零时长 episode / 单事件带 ----
console.log('=== B6 单事件（零时长 episode 风味）===');
{
  const st = seed();
  advanceTo(st, 1000, params); ingest(st, mom({ t: 1000, verb: 'WRITE', outcome: 'OK', m: 0.5 }), params);
  const s = snapshot(st, 1000, params);
  console.log(`  单事件 snapshot：T=${s.T.toFixed(4)} needle=${s.needle.toFixed(4)} phase=${s.phase} 有限=${ok(Number.isFinite(s.T) && Number.isFinite(s.needle))}`);
}

// ---- B7: S 极大时浮点 ----
console.log('=== B7 S 极大（浮点 tension→1）===');
{
  const st = seed(); st.S = 1e6; st.lastEventT = st.now;
  const T = tension(st.S, params);
  console.log(`  S=1e6 → T=${T} 有界≤1=${ok(T <= 1)} =1=${ok(T === 1)}`);
  st.S = 1e300; console.log(`  S=1e300 → T=${tension(st.S, params)}（exp 下溢）`);
  advanceTo(st, st.now + 100, params);
  console.log(`  推进后 needle=${snapshot(st, st.now, params).needle}（弹簧目标=1，稳定）`);
}
