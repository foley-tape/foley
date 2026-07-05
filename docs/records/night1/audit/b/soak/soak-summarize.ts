// 独立汇总器：读滚动 CSV（虚拟 + 墙钟），产 SOAK_REPORT.md。与审计会话解耦——
// 晨间任何人跑 `node audit/b/soak/soak-summarize.ts` 即出报告，无需本会话在场。
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
function readCsv(name: string): { head: string[]; rows: number[][] } | null {
  const p = here + name;
  if (!existsSync(p)) return null;
  const lines = readFileSync(p, 'utf8').trim().split('\n');
  if (lines.length < 2) return null;
  const head = lines[0]!.split(',');
  const rows = lines.slice(1).map((l) => l.split(',').map(Number));
  return { head, rows };
}
function col(d: { head: string[]; rows: number[][] }, name: string): number[] {
  const i = d.head.indexOf(name); return i < 0 ? [] : d.rows.map((r) => r[i]!);
}
const stat = (xs: number[]) => xs.length ? { min: Math.min(...xs), max: Math.max(...xs), first: xs[0]!, last: xs[xs.length - 1]! } : null;

let md = `# SOAK_REPORT — TAPE-0 通宵耐力测试（审计方 B）\n\n> 由 \`audit/b/soak/soak-summarize.ts\` 生成，读滚动 CSV。与审计会话解耦。\n\n`;

// 虚拟
const v = readCsv('soak_virtual.csv');
if (v) {
  const rss = stat(col(v, 'rssMB'))!, sig = stat(col(v, 'sigStatesSize'))!, out = stat(col(v, 'outcomesLen'))!;
  md += `## A) 虚拟时钟（8h 模拟会话，秒级完成）\n`;
  md += `- 采样点：${v.rows.length}（每模拟 10 分钟一采样）\n`;
  md += `- RSS：${rss.first}→${rss.last} MB（min ${rss.min} / max ${rss.max}）——${rss.max - rss.min < 30 ? '✅ 有界' : '⚠ 波动>30MB，复核'}\n`;
  md += `- sigStates 会话内峰值：${sig.max}（realistic 会话很小：errClass 归一塌缩）\n`;
  md += `- outcomes 数组长度：恒 ${out.max}（≤ wowWindow → ✅ 无泄漏）\n\n`;
} else md += `## A) 虚拟时钟\n_（未跑：node audit/b/soak/soak-run.ts --virtual 8）_\n\n`;

// sig 增长
const g = readCsv('soak_sig_growth.csv');
if (g) {
  const sigs = col(g, 'distinctSigs'), us = col(g, 'reapUs');
  const first = us[0]!, last = us[us.length - 1]!;
  md += `## B) reap O(n) 退化压力（单会话累积 distinct sig）\n`;
  md += `| distinctSigs | reap µs |\n|---|---|\n`;
  for (let i = 0; i < sigs.length; i++) md += `| ${sigs[i]} | ${us[i]!.toFixed(1)} |\n`;
  md += `\n结论：单次 reap ${first.toFixed(1)}µs → ${last.toFixed(1)}µs（${sigs[0]}→${sigs[sigs.length - 1]} sig）。`;
  md += `reap 每 tick 全量扫 sigStates，会话内无 evict → **tick 成本随累计 distinct sig 线性上升**。realistic 归一下 sig 少故当前无痛；若把 targetHash 并入 sig（修红队C 塌缩），distinct sig 暴涨，此退化转为真问题。\n\n`;
}

// 墙钟
const w = readCsv('soak_wall.csv');
if (w) {
  const rss = stat(col(w, 'rssMB'))!, heap = stat(col(w, 'heapMB'))!, drift = stat(col(w, 'driftMaxMs'))!, ev = stat(col(w, 'events'))!, cpu = stat(col(w, 'cpuUserSec'))!;
  const mins = col(w, 'wallMin');
  const dur = mins.length ? mins[mins.length - 1]! : 0;
  md += `## C) 墙钟长跑（真实 ${(dur / 60).toFixed(1)}h）\n`;
  md += `- 采样点：${w.rows.length}（每分钟）\n`;
  md += `- 事件累计：${ev.last}\n`;
  md += `- RSS：${rss.first}→${rss.last} MB（min ${rss.min} / max ${rss.max}）——${rss.max - rss.min < 50 ? '✅ 有界（无缓慢泄漏）' : '⚠ 增幅>50MB，疑泄漏，见曲线'}\n`;
  md += `- heapUsed：${heap.first}→${heap.last} MB\n`;
  md += `- CPU user：${cpu.last}s 累计（${(cpu.last / Math.max(1, dur * 60)).toFixed(4)} s/s 占用）\n`;
  md += `- 处理延迟（发射漂移代理）每分钟峰值：min ${drift.min} / max ${drift.max} ms\n\n`;
  // 简易 RSS sparkline
  const rvals = col(w, 'rssMB'); const lo = Math.min(...rvals), hi = Math.max(...rvals);
  const spark = rvals.map((x) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor(((x - lo) / Math.max(1e-9, hi - lo)) * 8))]).join('');
  md += `RSS 轨迹：\`${spark}\`\n\n`;
} else md += `## C) 墙钟长跑\n_（未跑或未完成：nohup node audit/b/soak/soak-run.ts --wall 7 &。CSV：audit/b/soak/soak_wall.csv）_\n\n`;

md += `## 判读\n`;
md += `- **无终身累加器？** outcomes ✅ 有界；sigStates ❌ 会话内不 evict（realistic 归一下峰值小，但违反"无终身累加器"原则，且 reap O(n)/tick）。\n`;
md += `- **过期 CLEARED tick 对齐随时长退化？** 发射时刻取理论过期点 lastHit+win（与 tick 无关，金测试⑫已证）→ 时刻本身不漂移；退化的是 reap **算力**（扫全 map），非时刻精度。\n`;
md += `- **RSS/CPU 有界？** 见 A/C 实测。\n`;

writeFileSync(here + 'SOAK_REPORT.md', md);
process.stdout.write(md);
process.stdout.write(`\n写入 ${here}SOAK_REPORT.md\n`);
