// cli distill <raw.jsonl> <out.tape.jsonl> —— 蒸馏工序（§3）。
// 原始 JSONL 的事件蒸馏只在此发生，产出事件骨架；本地标题另由 serve 最多读首句。
//
// M2.6 §1 P1-①（TR-1/G7 脱敏闸，架构师裁定）：**默认形态即安全形态**——
// 产带默认走全脱敏（时间相对化＋MCP 工具名加盐哈希＋sourceHash=redacted），
// 「不脱敏」翻转为显式 --raw 开关，且产原始带时 stderr 强制警示。--redact 旗标保留（=默认，兼容旧口径）。

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { writeDistilled } from '../adapters/claude-jsonl/index.ts';
import { resolveParams } from '../engine/params.ts';

export function runDistill(argv: string[]): void {
  const raw = argv.includes('--raw');
  const redact = !raw; // 默认即脱敏（G7）；--redact 依旧接受、语义与默认相同
  const pos = argv.filter((a) => !a.startsWith('--'));
  const rawPath = pos[0];
  const out = pos[1];
  if (!rawPath || !out) {
    console.error('用法: node cli/index.ts distill <raw.jsonl> <out.tape.jsonl> [--raw]');
    console.error('  默认产全脱敏带（时间相对化＋工具名哈希＋errClass→聚类哈希，可分享形态）');
    console.error('  --raw 产原始带（绝对时间＋明文 MCP 工具名/归一化错误类＋精确 sourceHash——仅限本机调试，勿外传）');
    process.exit(2);
    return;
  }
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const d = writeDistilled(rawPath, out, params, redact);
  if (raw) {
    process.stderr.write(
      '⚠ --raw 原始带：含**绝对时间戳＋明文工具名（含 MCP 名）＋精确 sourceHash＋best-effort 归一化后的明文 errClass**，可反推工作时段、仓库身份或残留错误文本。\n' +
      '  仅限本机调试；分享前请改用默认（脱敏）蒸馏。\n',
    );
  }
  process.stderr.write(
    `蒸馏 ${basename(rawPath)} → ${out}${raw ? '（原始·勿外传）' : '（默认脱敏）'}\n` +
    `  记录 ${d.records.length}（事件 ${d.meta.eventCount}）｜episode ${d.meta.episodes.length}` +
    `｜src ${d.meta.sourceHash}｜覆盖率 ${(d.meta.stats.parseCoverage * 100).toFixed(1)}%\n`,
  );
}
