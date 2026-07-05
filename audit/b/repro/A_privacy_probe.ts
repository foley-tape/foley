// 红队A 隐私攻击复现：构造对抗性原始 JSONL（伪造，非真带），跑 distill + redact，
// 逐字段审计什么"活着穿过"了隐私膜。只读审计脚本，不改源码。
//
// 运行：node audit/b/repro/A_privacy_probe.ts
import { distillTape, serializeTape } from '../../../adapters/claude-jsonl/index.ts';
import { redactResult } from '../../../adapters/claude-jsonl/distill.ts';
import { resolveParams } from '../../../engine/params.ts';
import { readFileSync } from 'node:fs';

const params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));

// ---- 攻击载荷：各类"密钥/敏感"埋进不同位置 ----
const SECRETS = {
  shortPin: '80421',                         // 8位以下纯数字 PIN（会被 \d+→0 吗？）
  pin8: '48213765',                          // 8 位 PIN
  pass10: 'hunter2pw!',                       // 10 位口令（<16，含符号）
  pass12: 'Tr0ub4dor&3x',                     // 12 位口令
  embeddedFlag: '-phunter2secret',            // -pSECRET 内嵌参数式
  apiKeyShort: 'sk-abc123',                    // 短 API key 前缀
  cjkSecret: '客户张伟的私钥密码是月亮',           // CJK 敏感短语（无 ascii）
  emojiSecret: 'pwd🔑moon🌙key',               // emoji 混排
  mcpTool: 'mcp__acmecorp_secret__exfiltrate', // MCP 工具名含公司名
  urlCred: 'https://admin:p4ssw0rd@internal.acme.corp/db', // URL 内嵌凭据
};

function assistantToolUse(id: string, name: string, input: unknown, ts: string): string {
  return JSON.stringify({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
}
function userResult(id: string, isError: boolean, content: string, ts: string, tur: unknown = {}): string {
  return JSON.stringify({ type: 'user', timestamp: ts, toolUseResult: tur, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } });
}

const lines: string[] = [
  // 1) 短密钥藏在错误首行（errClass 抓不抓得住？）
  assistantToolUse('t1', 'Bash', { command: `curl -u admin:${SECRETS.pass10} https://x` }, '2026-06-01T10:00:00.000Z'),
  userResult('t1', true, `auth failed for token ${SECRETS.pass10} pin ${SECRETS.pin8} short ${SECRETS.shortPin}`, '2026-06-01T10:00:01.000Z', { code: 1 }),
  // 2) 内嵌 -pSECRET 参数式，命令失败
  assistantToolUse('t2', 'Bash', { command: `mysql ${SECRETS.embeddedFlag} -h db` }, '2026-06-01T10:00:02.000Z'),
  userResult('t2', true, `ERROR 1045 (28000): Access denied using password ${SECRETS.embeddedFlag}`, '2026-06-01T10:00:03.000Z', { code: 1 }),
  // 3) CJK 敏感短语在错误首行
  assistantToolUse('t3', 'Bash', { command: 'run secret' }, '2026-06-01T10:00:04.000Z'),
  userResult('t3', true, `错误：${SECRETS.cjkSecret}，验证失败`, '2026-06-01T10:00:05.000Z', { code: 1 }),
  // 4) emoji 混排
  assistantToolUse('t4', 'Bash', { command: 'auth' }, '2026-06-01T10:00:06.000Z'),
  userResult('t4', true, `login error: ${SECRETS.emojiSecret}`, '2026-06-01T10:00:07.000Z', { code: 1 }),
  // 5) MCP 工具名（公司名/敏感词在 tool 字段）
  assistantToolUse('t5', SECRETS.mcpTool, { arg: 'x' }, '2026-06-01T10:00:08.000Z'),
  userResult('t5', false, 'ok', '2026-06-01T10:00:09.000Z', {}),
  // 6) URL 内嵌凭据（WebFetch → targetHash 取 url；errClass 里也带）
  assistantToolUse('t6', 'WebFetch', { url: SECRETS.urlCred }, '2026-06-01T10:00:10.000Z'),
  userResult('t6', true, `fetch failed: ${SECRETS.urlCred} 500`, '2026-06-01T10:00:11.000Z', { code: 1 }),
  // 7) 短 API key
  assistantToolUse('t7', 'Bash', { command: `deploy --key ${SECRETS.apiKeyShort}` }, '2026-06-01T10:00:12.000Z'),
  userResult('t7', true, `invalid key ${SECRETS.apiKeyShort}`, '2026-06-01T10:00:13.000Z', { code: 1 }),
];

const raw = lines.join('\n') + '\n';
const d = distillTape(raw, params);
const dTapeText = serializeTape(d);
const red = redactResult(d);
const redTapeText = serializeTape(red);

// ---- 审计：任一 SECRET（长度≥5 的子串）是否出现在蒸馏带/脱敏带全文 ----
function survivors(tapeText: string, label: string): void {
  console.log(`\n===== ${label} =====`);
  let anySurvive = false;
  for (const [name, sec] of Object.entries(SECRETS)) {
    const hits: string[] = [];
    // 检查完整密钥
    if (tapeText.includes(sec)) hits.push('完整');
    // 检查有意义子串（≥6 字符的连续片段）
    for (let i = 0; i + 6 <= sec.length; i++) {
      const sub = sec.slice(i, i + 6);
      if (/^[\x20-\x7e]{6}$/.test(sub) && tapeText.includes(sub) && !hits.includes('完整')) { hits.push(`子串"${sub}"`); break; }
    }
    if (hits.length) { anySurvive = true; console.log(`  ❌ 存活 [${name}]: ${hits.join(', ')}`); }
    else console.log(`  ✅ 未泄 [${name}]`);
  }
  if (!anySurvive) console.log('  （无密钥子串存活）');
}

console.log('攻击载荷密钥表：');
for (const [k, v] of Object.entries(SECRETS)) console.log(`  ${k} = ${JSON.stringify(v)}`);

survivors(dTapeText, '默认蒸馏带（无 --redact）—— 本地抽检用');
survivors(redTapeText, '全脱敏带（--redact）—— 声称"接近可分享"');

// ---- 逐字段暴露 errClass / tool / 时间戳 ----
console.log('\n===== 全脱敏带逐记录字段抽样（前几条非标点）=====');
for (const r of red.records.filter((x) => !x.special).slice(0, 8)) {
  console.log(`  t=${r.t} tool=${JSON.stringify(r.tool)} verb=${r.verb} outcome=${r.outcome} errClass=${JSON.stringify(r.errClass)}`);
}
console.log('\n===== 全脱敏带 meta 首行（时间指纹）=====');
console.log('  distiller=', red.meta.distiller);
console.log('  episodes=', JSON.stringify(red.meta.episodes));
console.log('  firstT/lastT=', red.meta.stats.firstT, '/', red.meta.stats.lastT,
  '→', new Date(red.meta.stats.firstT!).toISOString(), '/', new Date(red.meta.stats.lastT!).toISOString());
