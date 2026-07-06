// 红队A 收敛复现：精确隔离 --redact 后到底"活着"什么。避免检测器自身的子串串扰。
// 结论用于 AUDIT_REPORT_B 的隐私发现。只读审计。
import { distillTape, serializeTape } from '../../../adapters/claude-jsonl/index.ts';
import { redactResult } from '../../../adapters/claude-jsonl/distill.ts';
import { resolveParams } from '../../../engine/params.ts';
import { readFileSync } from 'node:fs';

const params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));

// 单独测 MCP 工具名（不放任何含"secret"的其它字段，排除串扰）
const raw1 = [
  JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'm1', name: 'mcp__AcmeCorp_ProjectZeus__deployProd', input: { x: 1 } }] } }),
  JSON.stringify({ type: 'user', timestamp: '2026-06-01T10:00:01.000Z', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'm1', is_error: false, content: 'ok' }] } }),
].join('\n') + '\n';

const red1 = redactResult(distillTape(raw1, params));
const txt1 = serializeTape(red1);
console.log('=== A) MCP 工具名穿透 --redact ===');
console.log('原始工具名：mcp__AcmeCorp_ProjectZeus__deployProd');
console.log('脱敏带含 "AcmeCorp"       :', txt1.includes('AcmeCorp'));
console.log('脱敏带含 "ProjectZeus"    :', txt1.includes('ProjectZeus'));
console.log('脱敏带含 "deployProd"     :', txt1.includes('deployProd'));
console.log('脱敏带该记录 tool 字段    :', JSON.stringify(red1.records.find((r) => !r.special)!.tool));

// 单独测短口令在 errClass（redact 应抹掉）
const raw2 = [
  JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'p1', name: 'Bash', input: { command: 'auth' } }] } }),
  JSON.stringify({ type: 'user', timestamp: '2026-06-01T10:00:01.000Z', toolUseResult: { code: 1 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'p1', is_error: true, content: 'denied: passwd hunter2pw and pin 4821' }] } }),
].join('\n') + '\n';
const d2 = distillTape(raw2, params);
console.log('\n=== B) errClass 短口令：默认带 vs 脱敏带 ===');
console.log('默认带 errClass          :', JSON.stringify(d2.records.find((r) => r.errClass)!.errClass));
console.log('脱敏带 errClass          :', JSON.stringify(redactResult(d2).records.find((r) => r.errClass)!.errClass));

// 时间戳指纹（redact 不动时间）
console.log('\n=== C) 绝对时间戳穿透 --redact（指纹）===');
const anyRec = red1.records.find((r) => !r.special)!;
console.log('记录 t（epoch ms）        :', anyRec.t, '→', new Date(anyRec.t).toISOString());
console.log('meta.episodes[0].startT   :', red1.meta.episodes[0]!.startT, '→', new Date(red1.meta.episodes[0]!.startT).toISOString());
console.log('meta.sourceHash（原文指纹）:', red1.meta.sourceHash, '（=fnv1a(原始JSONL全文)，同带同源可比对）');

// 金测试 ⑬ 到底断言了什么？
console.log('\n=== D) 金测试 ⑬ 覆盖面核对 ===');
console.log('⑬ 仅断言 errClass 匹配 /^e[0-9a-f]{8}$/ 且 sig 不变；');
console.log('   未断言 tool/timestamp/sourceHash 无明文——故上面 A、C 的残留不被任何金测试拦截。');
