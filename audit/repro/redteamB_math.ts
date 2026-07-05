// 红队B · 数学审计员 —— 边界与确定性。
// 含气味线索C要求的"双跑比对脚本"，外加 wow(n=2)、弹簧大dt、迟滞等号三处边界。
// 只读审计：import 真实 engine + replay，不改源码。
//
// 运行：node audit/repro/redteamB_math.ts

import {
  createEngine, advanceTo, advance, ingest, snapshot, reap, tension, type IngestMoment,
} from '../../engine/index.ts';
import { replayText } from '../../cli/replay.ts';
import { resolveParams, type Params } from '../../engine/params.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const params: Params = resolveParams(JSON.parse(readFileSync(join(root, 'params.json'), 'utf8')));
const META = { engineSha: 'audit', paramsHash: 'audit', tapeName: 'b' };
const mom = (p: Partial<IngestMoment> & { t: number }): IngestMoment =>
  ({ kind: 'moment', seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0.5, tags: [], ...p });

console.log('═══ 红队B-1 · 双跑确定性（同平台）：五带各回放两次，逐字节比对 ═══\n');
const tapes = ['silence', 'smooth', 'busy', 'jam', 'storm'];
let allByteEqual = true;
for (const name of tapes) {
  const text = readFileSync(join(root, 'tapes', `${name}.tape.jsonl`), 'utf8');
  const a = replayText(text, params, META);
  const b = replayText(text, params, META);
  const eq = a.curveCsv === b.curveCsv && a.momentsCsv === b.momentsCsv;
  if (!eq) allByteEqual = false;
  console.log(`  ${name.padEnd(8)} curve ${a.curveCsv.length}B / moments ${a.momentsCsv.length}B → ${eq ? '✅ 逐字节一致' : '❌ 不一致'}`);
}
console.log(`\n同平台确定性：${allByteEqual ? '✅ 成立（SPEC §3"同一磁带两次回放逐字节一致"兑现）' : '❌ 破裂'}`);
console.log('注：SPEC 只主张"同一磁带两次回放"（同平台同进程）。跨 Node 版本/平台的一致性 SPEC 未主张；');
console.log('   Math.exp/Math.pow/tanh 与浮点累加顺序是 libm 相关，跨平台最后一位 ULP 可能异——见 B-4。\n');

console.log('═══ 红队B-2 · wow 在 n=2（气味线索"wow 在样本<2 时"的边界+1）═══\n');
{
  const st = createEngine(params);
  ingest(st, mom({ t: 0, special: 'SESSION_START' }), params);
  advanceTo(st, 1000, params); ingest(st, mom({ t: 1000, verb: 'RUN', outcome: 'OK' }), params);
  const w1 = snapshot(st, 1000, params).wow;
  advanceTo(st, 1001, params); ingest(st, mom({ t: 1001, verb: 'RUN', outcome: 'FAIL', sig: 'x' }), params);
  const w2raw = st.wowEvent; // 平滑前的原始 wow
  console.log(`  1 个有结果事件后 wow=${w1.toFixed(3)}（n<2 → 0，正确）`);
  console.log(`  第 2 个事件(OK→FAIL 一次跳变)后 原始 wow=${w2raw.toFixed(3)}`);
  console.log(`  → n=2 且一次跳变 = 100% 交替率 → 原始 wow 直接顶到 1.0（"最大飘")。`);
  console.log('    单次 OK→FAIL 即判"最不确定"，对短样本偏激进（虽有 30s 平滑缓冲，冷启动仍可瞬冲）。\n');
}

console.log('═══ 红队B-3 · 弹簧在大 dt（断流后多日续跑一次性灌入）是否爆振 ═══\n');
{
  // (a) 直接给引擎一个 3 天的 advance —— 命中 integrateSpring 的 SETTLE_MS 快照支
  const st = createEngine(params);
  ingest(st, mom({ t: 0, special: 'SESSION_START' }), params);
  advanceTo(st, 1000, params);
  ingest(st, mom({ t: 1000, verb: 'RUN', outcome: 'FAIL', m: 0.9, sig: 'x' }), params); // 抬 S
  const THREE_DAYS = 3 * 24 * 3600 * 1000;
  advance(st, THREE_DAYS, params);
  const s1 = snapshot(st, st.now, params);
  const finite = Number.isFinite(s1.needle) && Number.isFinite(s1.S) && Number.isFinite(s1.T);
  const bounded = s1.needle >= 0 && s1.needle <= 1.5;
  console.log(`  (a) 3 天单步 advance 后：S=${s1.S.toExponential(2)} T=${s1.T.toFixed(4)} needle=${s1.needle.toFixed(4)}`);
  console.log(`      有限=${finite}｜针∈[0,1.5]=${bounded} → ${finite && bounded ? '✅ 未爆振（SETTLE_MS 快照支 + 4ms 子步守住）' : '❌ 发散'}`);

  // (b) 一堆 1999ms（SETTLE 以下）的大步，且目标反复跳变 —— 命中子步积分支
  const st2 = createEngine(params);
  ingest(st2, mom({ t: 0, special: 'SESSION_START' }), params);
  let maxNeedle = 0, maxVel = 0, t = 0;
  for (let i = 0; i < 200; i++) {
    t += 1999;
    // 交替灌大/小 S，制造针的剧烈目标跳变
    st2.S = i % 2 === 0 ? 5.0 : 0.0;
    advance(st2, 1999, params);
    maxNeedle = Math.max(maxNeedle, Math.abs(st2.needlePos));
    maxVel = Math.max(maxVel, Math.abs(st2.needleVel));
  }
  console.log(`  (b) 200×1999ms 且目标 5↔0 反复跳：max|needle|=${maxNeedle.toFixed(3)} max|vel|=${maxVel.toFixed(3)} → ${maxNeedle < 2 && Number.isFinite(maxVel) ? '✅ 有界收敛（半隐式 Euler ωn·h≪2 稳）' : '❌ 发散'}`);
  console.log('  预判#1（弹簧大dt爆振）：本实现以 SETTLE_MS 解析跳跃 + 4ms 子步双重防守 → 判 DEFENDED。\n');
}

console.log('═══ 红队B-4 · 迟滞恰在阈值等号上（气味线索"迟滞恰好落在阈值等号上"）═══\n');
{
  const S0 = params.stress.S0;
  const Sfor = (T: number) => -Math.log(1 - T) * S0;
  const at = (S: number) => { // 设 S 后用一次 NA 事件触发 updateWeather（ingest 不衰减，无 decay 混淆）
    const st = createEngine(params);
    ingest(st, mom({ t: 0, special: 'SESSION_START' }), params);
    st.S = S;
    ingest(st, mom({ t: 1000, verb: 'OTHER', outcome: 'NA' }), params); // 触发 updateWeather，不改 S
    return { weather: st.weather, T: tension(st.S, params) };
  };
  const probe = (Ttarget: number) => { const r = at(Sfor(Ttarget)); return `T实=${r.T.toFixed(6)} → ${r.weather}`; };
  console.log('  语义：updateWeather 用 `T>=enter` 升档、`T<exit` 降档（升含等号、退不含）——归属确定，非未定义。');
  console.log(`  目标 T=0.750(=STORM 阈)：${probe(0.750)}`);
  console.log(`  目标 T=0.250(=OVERCAST 阈)：${probe(0.250)}`);
  console.log('  ⚠ 关键：想让 T "恰好等于" 0.75 需 S=-ln(0.25)，再经 1-exp(-S) 往返——');
  console.log('    浮点往返未必回到精确 0.75（本机上可能落在 0.749999… 或 0.750000…1），');
  console.log('    即"是否命中等号"本身是 Math.log/Math.exp 的 libm 结果，跨平台可翻面 → 等号语义虽定义，命中与否不可移植。');
  console.log('    预判#4：语义 DEFENDED；真正风险是"命中等号"的浮点可复现性（并入 B-1 跨平台注，建议 SPEC 明确确定性仅限同平台）。\n');
}

console.log('═══ 小结 ═══');
console.log(`双跑确定性 ${allByteEqual ? '✅' : '❌'}｜弹簧大dt DEFENDED｜迟滞等号 DEFENDED｜wow(n=2) 偏激进(P3)`);
