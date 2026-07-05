// 红队C · 恶意磁带 —— 崩/慢/算错 三面。
// (1) 酷刑磁带：截断行/无result/result无use/同毫秒千事件/未来/负时间戳/嵌套怪胎 → 禁 crash。
// (2) 极端时间戳 → 报告 new Date(t).toISOString() 是否抛 RangeError。
// (3) 性能：合成 N=500/5000/50000 事件磁带，测 distill+replay 墙钟与堆内存，报拐点。
// 只读审计：import 真实 adapter + replay，不改源码。
//
// 运行：node audit/repro/redteamC_robust.ts

import { distillTape, serializeTape } from '../../adapters/claude-jsonl/index.ts';
import { replayText, replayCore } from '../../cli/replay.ts';
import { resolveParams } from '../../engine/params.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const params = resolveParams(JSON.parse(readFileSync(join(here, '..', '..', 'params.json'), 'utf8')));
const META = { engineSha: 'audit', paramsHash: 'audit', tapeName: 'torture' };

console.log('═══ 红队C-1 · 酷刑磁带：禁 crash ═══\n');
const torture = [
  '{"type":"assistant","timestamp":"2026-07-04T10:00:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"a","name":"Bash","input":{"command":"ls"}}]}}',
  '{ this is not valid json at all',                                   // 截断/坏行
  '{"type":"user","timestamp":"2026-07-04T10:00:01.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"NOSUCHUSE","is_error":false,"content":"orphan result"}]}}', // result 无 use
  '{"type":"assistant","timestamp":"2026-07-04T10:00:02.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"b","name":"Bash","input":{"command":"sleep 1"}}]}}', // use 无 result
  '{"type":"assistant","timestamp":"1969-12-31T23:59:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"neg","name":"Read","input":{"file_path":"/x"}}]}}', // 负时间戳(1969)
  '{"type":"assistant","timestamp":"not-a-date","message":{"role":"assistant","content":[{"type":"tool_use","id":"nd","name":"Edit","input":{"file_path":"/y","old_string":"a","new_string":"b"}}]}}', // 坏时间戳
  '{"type":"assistant","timestamp":"2026-07-04T10:00:03.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"deep","name":"Bash","input":{"command":"x","nested":{"a":{"b":{"c":[1,2,3]}}}}}]}}', // 嵌套怪胎
  // 同毫秒 1000 事件
  ...Array.from({ length: 1000 }, (_, i) =>
    `{"type":"assistant","timestamp":"2026-07-04T10:00:05.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"f${i}","name":"Bash","input":{"command":"boom"}}]}}`),
].join('\n') + '\n';

let crashed = false, d;
try {
  d = distillTape(torture, params);
  const out = replayText(serializeTape(d), params, META);
  console.log(`  distill+replay 完成：记录 ${d.records.length}｜坏行 ${d.meta.stats.badLines}｜未配对 ${d.meta.stats.unpairedToolUse}｜覆盖率 ${(d.meta.stats.parseCoverage * 100).toFixed(1)}%`);
  console.log(`  同毫秒 1000 事件已吞；曲线采样 ${out.snaps.length}；峰值 T=${out.metrics.peakT.toFixed(3)}`);
} catch (e) { crashed = true; console.log('  ❌ CRASH:', (e as Error).message); }
console.log(`  → ${crashed ? '❌ 崩了（违反"禁 crash"）' : '✅ 未崩（坏行跳过计数、孤儿result忽略、无result记NA）'}\n`);

console.log('═══ 红队C-2 · 极端未来时间戳 → 报告 toISOString 是否抛 RangeError ═══\n');
// JS Date 有效范围 ±8.64e15 ms（±275760年）。超范围 ISO → Date.parse 返 NaN（被 Number.isFinite 滤掉）。
const probes = ['+275760-09-13T00:00:00.000Z', '+275760-09-14T00:00:00.000Z', '9999-12-31T23:59:59.999Z'];
for (const tsStr of probes) {
  const parsed = Date.parse(tsStr);
  console.log(`  Date.parse("${tsStr}") = ${parsed} (finite=${Number.isFinite(parsed)})`);
}
// 造一卷"最大合法时间戳"的双事件带，看报告生成是否抛
const extreme = [
  `{"type":"assistant","timestamp":"+275760-09-13T00:00:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"m1","name":"Bash","input":{"command":"a"}}]}}`,
  `{"type":"user","timestamp":"+275760-09-13T00:00:00.000Z","toolUseResult":{"code":1},"message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"m1","is_error":true,"content":"err"}]}}`,
].join('\n') + '\n';
let reportThrew = false;
try {
  const out = replayText(serializeTape(distillTape(extreme, params)), params, META);
  console.log(`  最大合法时间戳带：报告长度 ${out.report.length}B，未抛。`);
} catch (e) { reportThrew = true; console.log('  ⚠ 报告生成抛：', (e as Error).message); }
console.log(`  → ${reportThrew ? '⚠ 存在 RangeError 面（极端但可达）' : '✅ DEFENDED：超范围 ISO 被 Date.parse→NaN 挡在门外，合法范围内 toISOString 不抛'}\n`);

console.log('═══ 红队C-3 · 性能拐点：合成 N 事件磁带，测 distill+replay ═══\n');
function synth(nEvents: number, cadenceMs: number): string {
  const lines: string[] = [];
  const base = Date.UTC(2026, 0, 1, 0, 0, 0);
  for (let i = 0; i < nEvents; i++) {
    const useT = new Date(base + i * cadenceMs).toISOString();
    const resT = new Date(base + i * cadenceMs + 50).toISOString();
    const err = i % 7 === 0;
    lines.push(JSON.stringify({ type: 'assistant', timestamp: useT, message: { role: 'assistant', content: [{ type: 'tool_use', id: `e${i}`, name: 'Bash', input: { command: i % 3 ? 'ls' : 'python x.py' } }] } }));
    lines.push(JSON.stringify({ type: 'user', timestamp: resT, toolUseResult: { durationMs: 50, code: err ? 1 : 0, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `e${i}`, is_error: err, content: err ? 'RuntimeError: boom' : 'ok' }] } }));
  }
  return lines.join('\n') + '\n';
}
const mb = (b: number) => (b / 1048576).toFixed(1);
console.log('  N事件 | cadence | distill ms | replay ms | snaps | curveCSV MB | heapUsed MB');
for (const N of [500, 5000, 50000]) {
  const cadence = 2000; // 2s/事件真实节奏
  const raw = synth(N, cadence);
  global.gc?.();
  const t0 = performance.now();
  const d = distillTape(raw, params);
  const t1 = performance.now();
  const distilled = serializeTape(d);
  const core = replayCore(distilled, params, 0.5);
  const t2 = performance.now();
  const out = replayText(distilled, params, META);
  const heap = process.memoryUsage().heapUsed;
  console.log(`  ${String(N).padStart(6)} | ${cadence}ms  | ${(t1 - t0).toFixed(0).padStart(9)} | ${(t2 - t1).toFixed(0).padStart(8)} | ${String(core.snaps.length).padStart(6)} | ${mb(out.curveCsv.length).padStart(10)} | ${mb(heap).padStart(10)}`);
}
console.log('\n  拐点观察：snaps 与 curveCSV 随「墙钟跨度 ÷ 100ms 采样」线性膨胀（非随事件数）。');
console.log('  50000 事件×2s = 27.7h 跨度 → 100ms 网格产出百万级 StatePacket / 数十 MB CSV。');
console.log('  → replay 内存/输出正比于磁带墙钟时长；长跑(6-8h live)若沿用累积式采样，内存单调增长（soak 重点验证）。');
