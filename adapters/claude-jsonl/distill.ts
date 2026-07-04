// 蒸馏带序列化 + fs 入口（§3）。原始 JSONL 只在 distillFile 被读一次。
// 下游（scan/replay/live/引擎/报告）一律走 loadDistilled，只见蒸馏带。

import { readFileSync, writeFileSync } from 'node:fs';
import type { Params } from '../../engine/params.ts';
import {
  distillTape, fnv1a, type DistillResult, type DistilledMoment, type DistillMeta,
} from './parse.ts';

/**
 * 全脱敏（M1.6-A §1.二.4）：把唯一文本字段 errClass 换成其聚类哈希，产可分享形态。
 * 蒸馏带其余字段本就无明文（tool 名、tags、hash）。sig 不变（聚类键稳定）。默认不脱敏——本地抽检需人读错误模板。
 */
export function redactResult(d: DistillResult): DistillResult {
  const records: DistilledMoment[] = d.records.map((r) =>
    r.errClass ? { ...r, errClass: 'e' + fnv1a(r.errClass) } : r);
  return { records, meta: { ...d.meta, distiller: d.meta.distiller + '+redact' } };
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
