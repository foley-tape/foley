// cli distill <raw.jsonl> <out.tape.jsonl> —— 蒸馏工序（§3）。
// 原始 JSONL 在此被读一次，产出只含事件骨架的蒸馏带。下游一律只吃蒸馏带。

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { writeDistilled } from '../adapters/claude-jsonl/index.ts';
import { resolveParams } from '../engine/params.ts';

export function runDistill(argv: string[]): void {
  const redact = argv.includes('--redact');
  const pos = argv.filter((a) => !a.startsWith('--'));
  const raw = pos[0];
  const out = pos[1];
  if (!raw || !out) {
    console.error('用法: node cli/index.ts distill <raw.jsonl> <out.tape.jsonl> [--redact]');
    console.error('  --redact 产全脱敏分享带（errClass→聚类哈希，零明文）');
    process.exit(2);
    return;
  }
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const d = writeDistilled(raw, out, params, redact);
  process.stderr.write(
    `蒸馏 ${basename(raw)} → ${out}${redact ? '（全脱敏）' : ''}\n` +
    `  记录 ${d.records.length}（事件 ${d.meta.eventCount}）｜episode ${d.meta.episodes.length}` +
    `｜src ${d.meta.sourceHash}｜覆盖率 ${(d.meta.stats.parseCoverage * 100).toFixed(1)}%\n`,
  );
}
