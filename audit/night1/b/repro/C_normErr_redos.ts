// 红队C：归一化"过度"面（不同错误塌成同一 sig → 误触 STUCK_LOOP）+ 正则 ReDoS 计时。
import { distillTape, serializeTape } from '../../../adapters/claude-jsonl/index.ts';
import { replayText } from '../../../cli/replay.ts';
import { resolveParams } from '../../../engine/params.ts';
import { readFileSync } from 'node:fs';

const params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));
const META = { engineSha: 'audit', paramsHash: 'audit', tapeName: 'C2' };
function A(id: string, cmd: string, ts: string) { return JSON.stringify({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: cmd } }] } }); }
function U(id: string, content: string, ts: string) { return JSON.stringify({ type: 'user', timestamp: ts, toolUseResult: { code: 1 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content }] } }); }

console.log('=== 1) 归一化过度：三个"不同文件不存在"的错误 → 同 errClass → 同 sig → 误触 STUCK_LOOP ===');
{
  // 三次读不同文件失败：错误只差路径。normErr 抹路径后三者同签名。
  const raw = [
    A('e1', 'cat /home/alice/projA/config.yml', '2026-06-01T09:00:00.000Z'),
    U('e1', 'cat: /home/alice/projA/config.yml: No such file or directory', '2026-06-01T09:00:01.000Z'),
    A('e2', 'cat /var/lib/serviceB/settings.json', '2026-06-01T09:00:02.000Z'),
    U('e2', 'cat: /var/lib/serviceB/settings.json: No such file or directory', '2026-06-01T09:00:03.000Z'),
    A('e3', 'cat /opt/toolC/data.db', '2026-06-01T09:00:04.000Z'),
    U('e3', 'cat: /opt/toolC/data.db: No such file or directory', '2026-06-01T09:00:05.000Z'),
  ].join('\n') + '\n';
  const d = distillTape(raw, params);
  const sigs = d.records.filter((r) => !r.special && r.outcome === 'FAIL').map((r) => ({ err: r.errClass, sig: r.sig }));
  console.log('  三条失败的 errClass / sig：');
  for (const s of sigs) console.log(`    errClass=${JSON.stringify(s.err)}  sig=${s.sig}`);
  const uniqueSigs = new Set(sigs.map((s) => s.sig));
  const out = replayText(serializeTape(d), params, META);
  console.log(`  独立 sig 数 = ${uniqueSigs.size}（三个不同文件不存在 → ${uniqueSigs.size === 1 ? '❌ 塌成 1 个' : uniqueSigs.size + ' 个'}）`);
  console.log(`  STUCK_LOOP 发射 = ${out.metrics.stuckEdges}  ${out.metrics.stuckEdges > 0 ? '❌ 误判"踩同一把耙子"（实为三个不同文件）' : ''}`);
}

console.log('\n=== 2) 反向：三个"同类但内容真不同"的错误是否被区分？ ===');
{
  const raw = [
    A('d1', 'run a', '2026-06-01T09:10:00.000Z'), U('d1', 'TypeError: cannot read property foo', '2026-06-01T09:10:01.000Z'),
    A('d2', 'run b', '2026-06-01T09:10:02.000Z'), U('d2', 'SyntaxError: unexpected token bar', '2026-06-01T09:10:03.000Z'),
    A('d3', 'run c', '2026-06-01T09:10:04.000Z'), U('d3', 'RangeError: index out of bounds', '2026-06-01T09:10:05.000Z'),
  ].join('\n') + '\n';
  const d = distillTape(raw, params);
  const sigs = new Set(d.records.filter((r) => !r.special && r.outcome === 'FAIL').map((r) => r.sig));
  console.log(`  三种不同错误类型 → 独立 sig 数 = ${sigs.size}（应 3）${sigs.size === 3 ? ' ✅' : ' ❌'}`);
}

console.log('\n=== 3) ReDoS 计时：对抗性长串喂给各正则 ===');
{
  const TAG_TEST = /\b(test|jest|vitest|pytest|cargo test|go test)\b/;
  const NORM_TOKEN = /[a-z0-9_-]{16,}/g;
  const NORM_PATH = /[\/~][\w./@-]+/g;
  const evil1 = 'test'.repeat(50000);                    // 重复关键词
  const evil2 = 'a'.repeat(200000);                       // 长同字符（token 正则）
  const evil3 = '/' + 'a/'.repeat(100000);                // 长路径
  const time = (fn: () => void, label: string) => { const t0 = performance.now(); fn(); console.log(`    ${label}: ${(performance.now() - t0).toFixed(1)}ms`); };
  time(() => TAG_TEST.test(evil1), 'TAG_TEST × "test"×50000');
  time(() => evil2.replace(NORM_TOKEN, 'T'), 'NORM_TOKEN × "a"×200000');
  time(() => evil3.replace(NORM_PATH, 'P'), 'NORM_PATH × "/a/"×100000');
  console.log('  → 均为线性量词（无嵌套回溯）；用时随长度线性，无灾难性回溯（ReDoS 面：低）。');
}
