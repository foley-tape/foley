// 蒸馏带序列化 + fs 入口（§3）。原始 JSONL 只在 distillFile 被读一次。
// 下游（scan/replay/live/引擎/报告）一律走 loadDistilled，只见蒸馏带。

import { readFileSync, writeFileSync } from 'node:fs';
import type { Params } from '../../engine/params.ts';
import {
  distillTape, fnv1a, type DistillResult, type DistilledMoment, type DistillMeta,
} from './parse.ts';

/** 内建工具白名单——脱敏时保留其名（无隐私）；其余（含 MCP 自定义工具）哈希。 */
const BUILTIN_TOOLS = new Set([
  'Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'NotebookRead',
  'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Task', 'Agent', 'Bash',
  'AskUserQuestion', 'ToolSearch', '',
]);

/** 每带随机盐（堵字典反演）。非密码学强度，够挡"已知明文→哈希"字典反查。 */
function randomSalt(): string {
  return Date.now().toString(36) + '.' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * 全脱敏（M1.6-A §1.二.4 + M1.8-F④/B-2 三向量全堵）：产**经对抗测试最小化**的可分享形态。
 * 堵三向量：(1) errClass → 加盐聚类 id（零模板文本）；(2) 工具名 → 内建保留、其余(含 MCP)加盐哈希；
 * (3) 时间戳 → 改为相对首事件偏移（保节奏、去日历/时钟指纹）。sig/targetHash 每带随机盐重算。
 * 文案纪律：这是"最小化"，**不是"零明文保证"**，仍不建议外传未审带（见 SPEC 附注 / FEEDBACK-FIX）。
 * salt 可注入（金测试用固定盐）；缺省每带随机。
 */
export function redactResult(d: DistillResult, salt?: string): DistillResult {
  const s = salt ?? randomSalt();
  const h = (x: string): string => fnv1a(s + '|' + x);
  const firstT = d.meta.stats.firstT ?? 0;
  const rel = (t: number): number => t - firstT;
  const relN = (t: number | null): number | null => (t === null ? null : t - firstT);
  const records: DistilledMoment[] = d.records.map((r) => ({
    ...r,
    t: rel(r.t), useT: rel(r.useT), resolveT: relN(r.resolveT),
    tool: r.tool && !BUILTIN_TOOLS.has(r.tool) ? 't' + h(r.tool) : r.tool,
    errClass: r.errClass ? 'e' + h(r.errClass) : null,
    sig: r.sig ? 's' + h(r.sig) : null,
    targetHash: r.targetHash ? h(r.targetHash) : '',
  }));
  const episodes = d.meta.episodes.map((e) => ({ ...e, startT: rel(e.startT), endT: rel(e.endT) }));
  // meta.stats.unknownTools 的**键**是原始工具名（含 MCP 自定义名）——同样脱敏：内建保留、其余哈希。
  const unknownTools: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.meta.stats.unknownTools)) {
    unknownTools[BUILTIN_TOOLS.has(k) ? k : 't' + h(k)] = v;
  }
  const stats = {
    ...d.meta.stats, unknownTools,
    firstT: firstT === 0 ? d.meta.stats.firstT : 0,
    lastT: d.meta.stats.lastT === null ? null : rel(d.meta.stats.lastT),
  };
  return { records, meta: { ...d.meta, distiller: d.meta.distiller + '+redact', sourceHash: 'redacted', episodes, stats } };
}

/** 蒸馏带文本：meta 首行（kind:'meta'）+ 每记录一行。确定性。 */
export function serializeTape(d: DistillResult): string {
  const lines: string[] = [JSON.stringify({ kind: 'meta', ...d.meta })];
  for (const r of d.records) lines.push(JSON.stringify(r));
  return lines.join('\n') + '\n';
}

/** 蒸馏带文本 → 记录 + meta。禁 crash：坏行跳过。 */
export function parseDistilled(text: string): DistillResult {
  const records: DistilledMoment[] = [];
  let meta: DistillMeta | null = null;
  for (const l of text.split('\n')) {
    if (l.trim() === '') continue;
    let o: unknown;
    try { o = JSON.parse(l); } catch { continue; }
    if (!o || typeof o !== 'object') continue;
    const rec = o as Record<string, unknown>;
    if (rec['kind'] === 'meta') {
      const { kind, ...m } = rec; void kind;
      meta = m as unknown as DistillMeta;
    } else {
      records.push(rec as unknown as DistilledMoment);
    }
  }
  if (!meta) throw new Error('蒸馏带缺 meta 首行');
  return { records, meta };
}

/** 从原始 JSONL 蒸馏（唯一读原始的 fs 入口）。 */
export function distillFile(rawPath: string, params: Params): DistillResult {
  return distillTape(readFileSync(rawPath, 'utf8'), params);
}

/** 读回蒸馏带文件（下游只走这个）。 */
export function loadDistilled(path: string): DistillResult {
  return parseDistilled(readFileSync(path, 'utf8'));
}

/** 蒸馏并写盘 .tape.jsonl。redact=true 产全脱敏分享带。 */
export function writeDistilled(rawPath: string, outPath: string, params: Params, redact = false): DistillResult {
  const d0 = distillFile(rawPath, params);
  const d = redact ? redactResult(d0) : d0;
  writeFileSync(outPath, serializeTape(d), 'utf8');
  return d;
}
