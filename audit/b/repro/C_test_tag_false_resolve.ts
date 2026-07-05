// 红队C 复现：tag 正则跑在用户可控命令串上 → 误匹配 test/build → 后果链到 RESOLVE。
// 气味线索兑现："命令里带 test 一词但不是测试，会被贴 test 标签吗？后果链到 RESOLVE？"
// 只读审计脚本。
import { tagsForCommand, classifyBash } from '../../../adapters/claude-jsonl/verbs.ts';
import { distillTape, serializeTape } from '../../../adapters/claude-jsonl/index.ts';
import { replayText } from '../../../cli/replay.ts';
import { resolveParams } from '../../../engine/params.ts';
import { readFileSync } from 'node:fs';

const params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));
const META = { engineSha: 'audit', paramsHash: 'audit', tapeName: 'C' };

console.log('=== 1) 哪些非测试命令被误贴 test / build 标签？ ===');
const cmds = [
  'curl https://example.com/api/test',      // URL 路径含 test
  'git clone https://github.com/acme/test-utils',
  'mkdir test && cd test',                    // 建个叫 test 的目录
  'cat build.log',                            // 读 build 日志（非构建）
  'grep -r "test" src/',                      // 搜索字面量 test
  'rm -rf dist && echo done',                 // 真·无关
  'psql -c "SELECT * FROM latest_orders"',    // latest 含 test 子串（应不匹配）
  'node scripts/seed.js  # populate test db', // 注释里的 test
  'docker build -t myimg .',                  // 真 build
  'npm test',                                 // 真 test（对照）
];
for (const c of cmds) {
  const tags = tagsForCommand(c);
  const flag = (tags.includes('test') || tags.includes('build')) ? '  ⚠️ 贴标' : '';
  console.log(`  ${JSON.stringify(c).padEnd(52)} verb=${classifyBash(c)} tags=[${tags.join(',')}]${flag}`);
}

console.log('\n=== 2) 后果链：高张力会话中一条"含 test 的无关命令 OK" → 误发 RESOLVE + 泄能 ===');
// 造一段真实张力：连续 WRITE/RUN 失败把 S 抬高，然后来一条 `curl .../test` 成功。
function A(id: string, name: string, input: unknown, ts: string): string {
  return JSON.stringify({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
}
function U(id: string, isErr: boolean, content: string, ts: string, code = isErr ? 1 : 0): string {
  return JSON.stringify({ type: 'user', timestamp: ts, toolUseResult: { code, durationMs: 500, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isErr, content }] } });
}
const base = '2026-06-01T12:00:';
const lines: string[] = [];
// 5 次不同签名的 RUN 失败堆张力
for (let i = 0; i < 5; i++) {
  lines.push(A('f' + i, 'Bash', { command: `deploy step${i}` }, `${base}${String(i * 2).padStart(2, '0')}.000Z`));
  lines.push(U('f' + i, true, `error variant ${i}: deployment failed`, `${base}${String(i * 2 + 1).padStart(2, '0')}.000Z`));
}
// 关键：一条明显与"测试通过"无关的命令，但字面含 test，成功返回
lines.push(A('curl1', 'Bash', { command: 'curl -s https://status.internal/health/test' }, `${base}20.000Z`));
lines.push(U('curl1', false, 'HTTP 200 OK', `${base}21.000Z`));
const raw = lines.join('\n') + '\n';

const out = replayText(serializeTape(distillTape(raw, params)), params, META);
const resolves = out.emitted.filter((e) => e.ev.special === 'RESOLVE');
const peakBefore = out.snaps.filter((s) => s.t <= Date.parse(`${base}20.000Z`)).reduce((mx, s) => Math.max(mx, s.T), 0);
console.log(`  curl .../health/test 的 tags = [${tagsForCommand('curl -s https://status.internal/health/test').join(',')}]`);
console.log(`  curl 前峰值 T ≈ ${peakBefore.toFixed(3)}`);
console.log(`  RESOLVE 发射次数 = ${resolves.length}  ${resolves.length > 0 ? '❌ 误发（一次无关健康检查被当成"测试转绿"）' : '（无）'}`);
console.log(`  机会审计 oppTestOk = ${out.metrics.oppTestOk}（应为 0：这不是测试）`);
for (const r of resolves) console.log(`    RESOLVE @ ${new Date(r.ev.t).toISOString()} verb=${r.ev.verb} tags=[${r.ev.tags.join(',')}]`);
