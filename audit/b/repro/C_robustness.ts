// 红队C 崩溃/鲁棒面：恶意/畸形磁带喂给 distill + replay，断言"禁 crash"。只读。
import { distillTape, serializeTape } from '../../../adapters/claude-jsonl/index.ts';
import { replayText } from '../../../cli/replay.ts';
import { resolveParams } from '../../../engine/params.ts';
import { readFileSync } from 'node:fs';

const params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));
const META = { engineSha: 'audit', paramsHash: 'audit', tapeName: 'C3' };
const ok = (b: boolean) => (b ? '✅ 不崩' : '❌ 崩了/异常');

function tryDistill(label: string, raw: string): void {
  try {
    const d = distillTape(raw, params);
    let replayOk = true, note = '';
    try { const o = replayText(serializeTape(d), params, META); note = `records=${d.records.length} peakT=${o.metrics.peakT.toFixed(3)}`; }
    catch (e) { replayOk = false; note = 'replay抛:' + (e as Error).message; }
    console.log(`  ${label}: distill ${ok(true)} / replay ${ok(replayOk)} — ${note}`);
  } catch (e) {
    console.log(`  ${label}: distill ${ok(false)} — ${(e as Error).message}`);
  }
}

console.log('=== 畸形/恶意磁带鲁棒性 ===');
// 1) 截断行（末行无换行 + 半个 JSON）
tryDistill('截断末行', '{"type":"assistant","timestamp":"2026-06-01T10:00:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","id":"a","name":"Read","input":{"file_pa');
// 2) tool_result 无对应 tool_use
tryDistill('孤儿 tool_result', JSON.stringify({ type: 'user', timestamp: '2026-06-01T10:00:00.000Z', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'ghost', is_error: false, content: 'x' }] } }) + '\n');
// 3) tool_use 无 result
tryDistill('未决 tool_use（无 result）', JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: { command: 'sleep 999' } }] } }) + '\n');
// 4) 深度嵌套怪胎
tryDistill('深度嵌套 input', JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'n', name: 'Edit', input: { file_path: { deeply: { nested: [1, [2, [3]]] } } } }] } }) + '\n');
// 5) 未来时间戳
tryDistill('未来时间戳(2999)', [
  JSON.stringify({ type: 'assistant', timestamp: '2999-01-01T00:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'f', name: 'Bash', input: { command: 'ls' } }] } }),
  JSON.stringify({ type: 'user', timestamp: '2999-01-01T00:00:01.000Z', toolUseResult: { code: 0 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'f', is_error: false, content: 'ok' }] } }),
].join('\n') + '\n');
// 6) 负/畸形时间戳
tryDistill('畸形时间戳', [
  JSON.stringify({ type: 'assistant', timestamp: 'not-a-date', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'g', name: 'Bash', input: { command: 'ls' } }] } }),
  JSON.stringify({ type: 'user', timestamp: '', toolUseResult: { code: 1 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'g', is_error: true, content: 'boom' }] } }),
].join('\n') + '\n');
// 7) 同毫秒千事件
{
  const lines: string[] = [];
  for (let i = 0; i < 1000; i++) {
    lines.push(JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x' + i, name: 'Bash', input: { command: 'ls' } }] } }));
    lines.push(JSON.stringify({ type: 'user', timestamp: '2026-06-01T10:00:00.000Z', toolUseResult: { code: 0 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x' + i, is_error: false, content: 'ok' }] } }));
  }
  tryDistill('同毫秒 ×1000 事件', lines.join('\n') + '\n');
}
// 8) 空文件 / 纯空白
tryDistill('空文件', '');
tryDistill('纯空白/换行', '\n\n   \n');
// 9) content 是数组块（非字符串）
tryDistill('tool_result content 为块数组', [
  JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'h', name: 'Read', input: { file_path: '/x' } }] } }),
  JSON.stringify({ type: 'user', timestamp: '2026-06-01T10:00:01.000Z', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'h', is_error: false, content: [{ type: 'text', text: 'hi' }, { type: 'image' }] }] } }),
].join('\n') + '\n');
// 10) message.content 为字符串（非数组）
tryDistill('message.content 为字符串', JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: 'just text' } }) + '\n');

console.log('\n=== 性能：单行大 JSON（10MB content）耗时/内存 ===');
{
  const big = 'x'.repeat(10 * 1024 * 1024);
  const raw = [
    JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'big', name: 'Write', input: { file_path: '/x', content: big } }] } }),
    JSON.stringify({ type: 'user', timestamp: '2026-06-01T10:00:01.000Z', toolUseResult: {}, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'big', is_error: false, content: 'ok' }] } }),
  ].join('\n') + '\n';
  const t0 = performance.now(); const rss0 = process.memoryUsage().rss;
  const d = distillTape(raw, params);
  console.log(`  10MB 单行：${(performance.now() - t0).toFixed(0)}ms，ΔRSS≈${((process.memoryUsage().rss - rss0) / 1e6).toFixed(0)}MB，mRaw(行数)=${d.records.find((r) => r.verb === 'WRITE')?.mRaw}`);
}
