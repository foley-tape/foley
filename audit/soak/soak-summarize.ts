// 独立 soak 摘要器（夜班令 §2 稳健性要求：晨间任何人跑一条命令即出 SOAK_REPORT.md）。
// 读 audit/soak/run/soak-samples.jsonl（滚动日志），产 SOAK_REPORT.md。运行时机不限：跑到一半也能出中期报告。
// 与 soak.ts 解耦——不 import 引擎，只读日志。
//
// 运行：node audit/soak/soak-summarize.ts [samplesPath]

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SAMPLES = process.argv[2] ?? join(here, 'run', 'soak-samples.jsonl');
const OUT = join(dirname(SAMPLES), '..', 'SOAK_REPORT.md');

if (!existsSync(SAMPLES)) { console.error(`无日志：${SAMPLES}（soak 尚未启动？）`); process.exit(1); }

interface Row { kind: string; [k: string]: unknown }
const rows: Row[] = readFileSync(SAMPLES, 'utf8').split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return { kind: 'bad' }; } });
const meta = rows.find((r) => r.kind === 'meta');
const samples = rows.filter((r) => r.kind === 'sample');
const emits = rows.filter((r) => r.kind === 'emit');
const done = rows.find((r) => r.kind === 'done');
const err = rows.find((r) => r.kind === 'error');

// RSS 线性拟合（斜率 = 每分钟 MB 漂移；判内存泄漏）
function slope(xs: number[], ys: number[]): number {
  const n = xs.length; if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i]! - mx) * (ys[i]! - my); den += (xs[i]! - mx) ** 2; }
  return den > 0 ? num / den : 0;
}
const simMin = samples.map((s) => Number(s['simElapsedMin']));
const rss = samples.map((s) => Number(s['rssMB']));
const heap = samples.map((s) => Number(s['heapMB']));
const rssSlope = slope(simMin, rss);
const rssMin = rss.length ? Math.min(...rss) : 0, rssMax = rss.length ? Math.max(...rss) : 0;
const heapMin = heap.length ? Math.min(...heap) : 0, heapMax = heap.length ? Math.max(...heap) : 0;

// 漂移分布（STUCK_LOOP/RESOLVE 发射 vs 理论）
const nonExpiry = emits.filter((e) => !(e['special'] === 'STUCK_CLEARED' && e['clearedBy'] === 'expiry')).map((e) => Number(e['drift']));
const expiry = emits.filter((e) => e['special'] === 'STUCK_CLEARED' && e['clearedBy'] === 'expiry').map((e) => ({ emitSim: Number(e['emitSim']), drift: Number(e['drift']) }));
const sortNum = (a: number[]) => [...a].sort((x, y) => x - y);
const qOf = (a: number[], p: number) => { const s = sortNum(a); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))]! : 0; };
const absMax = (a: number[]) => a.length ? Math.max(...a.map(Math.abs)) : 0;

// expiry 对齐是否随时长退化：按发射 simElapsed 前/后半比 |err|
const startSim = meta ? undefined : undefined;
const emin = expiry.map((e) => e.emitSim);
const mid = emin.length ? (Math.min(...emin) + Math.max(...emin)) / 2 : 0;
const eFirst = expiry.filter((e) => e.emitSim < mid).map((e) => Math.abs(e.drift));
const eSecond = expiry.filter((e) => e.emitSim >= mid).map((e) => Math.abs(e.drift));
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

const lastSample = samples[samples.length - 1];
const statusLine = done ? '✅ 完成' : err ? `❌ 出错：${err['message']}` : '⏳ 进行中（中期快照）';

const report = `# SOAK_REPORT — 通宵耐力测试（夜班令 §2）

状态：**${statusLine}**　｜　日志：\`${SAMPLES.replace(/^.*\/tape0\//, '')}\`　｜　生成于 ${new Date().toISOString()}

## 配置
- 目标时长 ${meta?.['hours'] ?? '?'}h（sim）｜墙钟压缩 ${meta?.['speed'] ?? '?'}×｜种子 ${meta?.['seed'] ?? '?'}｜paramsHash ${meta?.['paramsHash'] ?? '?'}
- 启动 ${meta?.['startedAt'] ?? '?'}${done ? `｜完成 ${done['finishedAt']}｜墙钟 ${done['wallSec']}s` : ''}

## 事件与发射
| 采样点 | 事件 | 失败 | 派生发射 | 最新 sig 态数 | 最新 S |
|---|---|---|---|---|---|
| ${samples.length} | ${lastSample?.['events'] ?? (done?.['events'] ?? 0)} | ${lastSample?.['faults'] ?? (done?.['faults'] ?? 0)} | ${lastSample?.['emits'] ?? (done?.['emits'] ?? 0)} | ${lastSample?.['sigStates'] ?? (done?.['finalSigStates'] ?? '?')} | ${lastSample?.['S'] ?? (done?.['finalS'] ?? '?')} |

## 内存/CPU 稳定性（每分钟采样 ×${samples.length}）
- RSS：${rssMin}–${rssMax} MB｜线性斜率 **${rssSlope.toFixed(4)} MB/simmin**（≈0 → 无泄漏；>0.5 可疑）
- Heap：${heapMin}–${heapMax} MB
- 判据：live-等价消费者为 **bounded**（不累积 snapshot）→ 预期 RSS 平。斜率 ${Math.abs(rssSlope) < 0.5 ? '✅ 平（无单调增长）' : '⚠ 非平，见曲线'}

## MomentEvent 发射漂移（STUCK_LOOP/RESOLVE：应≈0，同刻发射）
- n=${nonExpiry.length}｜median ${qOf(nonExpiry, 0.5)}ms｜p95 ${qOf(nonExpiry, 0.95)}ms｜max|·| ${absMax(nonExpiry)}ms
- 解读：这两类在事件到达同刻发射，漂移应恒 0（非 0 即 driver 排序问题）。

## 过期型 CLEARED 的 tick 对齐（气味线索：随时长是否退化）
- n=${expiry.length}｜tick 分辨率 50ms
- 前半均 |对齐误差| ${mean(eFirst).toFixed(2)}ms｜后半均 |对齐误差| ${mean(eSecond).toFixed(2)}ms
- 退化判定：${expiry.length < 4 ? 'ℹ 样本不足（延长 soak 或提高失败密度）' : Math.abs(mean(eSecond) - mean(eFirst)) < 5 ? '✅ 未见退化（前后半误差相当，sim 钟浮点累加未漂）' : '⚠ 后半误差偏大——疑 sim 钟长期累加漂移'}
- 注：引擎把 expiry 的 moment.t 钉在理论过期点(lastHit+win)，对齐误差应恒 ≤ 一个 tick，与已跑时长无关（M1.6-A §2.6 正典）。本测即验证该不变量在长跑下成立。

${done ? `## 收尾摘要（soak-done.json）
\`\`\`json
${JSON.stringify(done, null, 2)}
\`\`\`` : '_（尚未收尾——重跑本脚本可刷新中期数据；soak 完成后自动含收尾摘要。）_'}

---
_本报告由 \`audit/soak/soak-summarize.ts\` 独立生成，不依赖 soak 进程存活。_
`;

writeFileSync(OUT, report);
console.log(`SOAK_REPORT → ${OUT}`);
console.log(`  状态 ${statusLine}｜采样 ${samples.length}｜发射 ${emits.length}｜RSS 斜率 ${rssSlope.toFixed(4)} MB/min`);
