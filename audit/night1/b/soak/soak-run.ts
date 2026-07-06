// 通宵耐力测试运行器。两模式：
//   --virtual [hours]  ：虚拟时钟跑 N 小时"模拟会话"（秒级完成），采样引擎内态 + reap 成本
//                        + 单会话 sigStates 累加器增长 + 过期 CLEARED tick 对齐。
//   --wall [hours]     ：真实墙钟长跑（默认 7h），每分钟采样 RSS/CPU，滚动写 soak_wall.csv，
//                        自记录、自终止、脱离审计会话。晨间 soak-summarize 出报告。
//
// 注：SPEC 的 `cli live` 为未实现桩（cli/index.ts: 打印后 exit 2）。故此处以引擎公开 API
//     （createEngine/advanceTo/ingest/reap/snapshot）复刻 live 消费回路——真 live 会走同一批调用。
//
// 用法：node audit/b/soak/soak-run.ts --virtual 8
//       nohup node audit/b/soak/soak-run.ts --wall 7 > audit/b/soak/soak_wall.out 2>&1 &

import { createEngine, advanceTo, ingest, reap, snapshot, type IngestMoment } from '../../../engine/index.ts';
import { resolveParams, type Params } from '../../../engine/params.ts';
import { distillTape } from '../../../adapters/claude-jsonl/index.ts';
import { momentOf, clearSigOf } from '../../../adapters/claude-jsonl/consume.ts';
import { makeGenerator } from './generate.ts';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const params: Params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));
const here = new URL('.', import.meta.url).pathname;
const SNAP_MS = 100;

function driveEvent(st: ReturnType<typeof createEngine>, useLine: string, resLine: string | null): { emits: number; reapMs: number } {
  // 蒸馏单事件对（拿到骨架记录），喂引擎。模拟 live：事件到达即 advance+ingest，其后 reap。
  const raw = resLine ? useLine + '\n' + resLine + '\n' : useLine + '\n';
  const d = distillTape(raw, params);
  let emits = 0, reapMs = 0;
  for (const r of d.records) {
    if (r.special === 'SESSION_START' || r.special === 'DONE') continue; // 单事件蒸馏会带标点，跳过（连续会话不复位）
    advanceTo(st, r.t, params);
    const ev = momentOf(r, params);
    const input: IngestMoment = r.special ? ev : Object.assign({}, ev, { clearSig: clearSigOf(r) });
    const derived = ingest(st, input, params);
    emits += derived.length;
    const t0 = performance.now();
    const reaped = reap(st, params);
    reapMs += performance.now() - t0;
    emits += reaped.length;
  }
  return { emits, reapMs };
}

function runVirtual(hours: number): void {
  console.log(`# SOAK virtual：模拟 ${hours}h 会话（种子 424242）`);
  const st = createEngine(params);
  ingest(st, { kind: 'moment', t: 0, seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'SESSION_START' } as IngestMoment, params);
  const startT = Date.parse('2026-06-01T00:00:00.000Z');
  // realistic pace ≈ 15s/event → hours*3600/15 事件（风暴簇另加）
  const count = Math.floor((hours * 3600) / 15);
  const gen = makeGenerator(424242, startT, count);

  const samples: string[] = ['simMin,events,sigStatesSize,outcomesLen,rssMB,cumReapMs,lastReapUs'];
  let events = 0, cumEmits = 0, cumReapMs = 0, lastT = startT, maxSig = 0;
  let nextSampleT = startT + 600_000; // 每模拟 10 分钟一采样
  for (const ev of gen) {
    const { emits, reapMs } = driveEvent(st, ev.useLine, ev.resLine);
    cumEmits += emits; cumReapMs += reapMs; events++; lastT = ev.t;
    maxSig = Math.max(maxSig, st.sigStates.size);
    if (ev.t >= nextSampleT) {
      const simMin = Math.round((ev.t - startT) / 60000);
      const lastReapUs = (reapMs / Math.max(1, 1)) * 1000;
      samples.push(`${simMin},${events},${st.sigStates.size},${st.outcomes.length},${(process.memoryUsage().rss / 1e6).toFixed(1)},${cumReapMs.toFixed(2)},${lastReapUs.toFixed(1)}`);
      nextSampleT += 600_000;
    }
  }
  writeFileSync(here + 'soak_virtual.csv', samples.join('\n') + '\n');
  console.log(`  事件 ${events}｜派生时刻 ${cumEmits}｜sigStates 峰值 ${maxSig}（会话内从不 evict，除非 SESSION_START）`);
  console.log(`  outcomes 数组长度：${st.outcomes.length}（应恒 ≤ wowWindow=${params.companions.wowWindow}）`);
  console.log(`  最终 RSS：${(process.memoryUsage().rss / 1e6).toFixed(1)}MB｜累计 reap 耗时 ${cumReapMs.toFixed(1)}ms`);

  // 累加器压力测试：注入 N 个"各不相同 sig"的失败，测 reap 成本随 map 增长
  console.log('\n# sigStates 累加器 + reap O(n) 退化压力测试');
  const st2 = createEngine(params);
  ingest(st2, { kind: 'moment', t: 0, seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'SESSION_START' } as IngestMoment, params);
  const growth: string[] = ['distinctSigs,reapUs'];
  let tt = 1000;
  for (let n = 1; n <= 20000; n++) {
    tt += 10;
    advanceTo(st2, tt, params);
    ingest(st2, { kind: 'moment', t: tt, seq: n, agent: 'main', verb: 'RUN', outcome: 'FAIL', m: 0.3, tags: [], sig: 'sig' + n, clearSig: 'c' + n } as IngestMoment, params);
    if (n % 2000 === 0) {
      const t0 = performance.now();
      for (let k = 0; k < 50; k++) reap(st2, params);
      const us = ((performance.now() - t0) / 50) * 1000;
      growth.push(`${st2.sigStates.size},${us.toFixed(1)}`);
      console.log(`  distinctSigs=${String(st2.sigStates.size).padStart(6)}  单次 reap ≈ ${us.toFixed(1)}µs`);
    }
  }
  writeFileSync(here + 'soak_sig_growth.csv', growth.join('\n') + '\n');
  console.log('  → reap 每 tick 全量扫 sigStates；单会话无 evict → 长会话中 tick 成本随累计 distinct sig 线性上升。');
}

function runWall(hours: number): void {
  const csv = here + 'soak_wall.csv';
  const started = new Date();
  writeFileSync(csv, 'wallMin,events,sigStatesSize,rssMB,heapMB,cpuUserSec,driftMaxMs\n');
  appendFileSync(here + 'soak_wall.log', `# SOAK wall 启动 ${started.toISOString()} 计划 ${hours}h pid=${process.pid}\n`);
  const st = createEngine(params);
  ingest(st, { kind: 'moment', t: 0, seq: 0, agent: 'main', verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'SESSION_START' } as IngestMoment, params);
  const endWall = Date.now() + hours * 3600_000;
  let virtT = Date.parse('2026-06-01T00:00:00.000Z');
  const gen = makeGenerator(Date.now() & 0x7fffffff, virtT, Number.MAX_SAFE_INTEGER);
  let events = 0, driftMax = 0, lastSampleMin = -1;
  const tick = (): void => {
    if (Date.now() >= endWall) {
      appendFileSync(here + 'soak_wall.log', `# SOAK wall 正常终止 ${new Date().toISOString()} 事件=${events}\n`);
      process.exit(0);
    }
    // 追加一个事件（真实节奏由 setTimeout 抖动模拟；此处每 tick 一个）
    const ev = gen.next().value;
    if (ev) {
      const emitTheory = ev.t;
      const wall0 = performance.now();
      driveEvent(st, ev.useLine, ev.resLine);
      const drift = performance.now() - wall0; // 处理延迟（发射漂移代理）
      driftMax = Math.max(driftMax, drift);
      virtT = ev.t; events++;
    }
    const wallMin = Math.floor((Date.now() - started.getTime()) / 60000);
    if (wallMin > lastSampleMin) {
      lastSampleMin = wallMin;
      const mu = process.memoryUsage(); const cpu = process.cpuUsage();
      appendFileSync(csv, `${wallMin},${events},${st.sigStates.size},${(mu.rss / 1e6).toFixed(1)},${(mu.heapUsed / 1e6).toFixed(1)},${(cpu.user / 1e6).toFixed(1)},${driftMax.toFixed(2)}\n`);
      driftMax = 0;
    }
    setTimeout(tick, 5000 + Math.floor(Math.random() * 35000)); // 5–40s/事件真实节奏
  };
  tick();
}

const mode = process.argv[2];
const hours = Number(process.argv[3] ?? (mode === '--wall' ? 7 : 8));
if (mode === '--virtual') runVirtual(hours);
else if (mode === '--wall') runWall(hours);
else { console.error('用法: node soak-run.ts --virtual [hours] | --wall [hours]'); process.exit(2); }
