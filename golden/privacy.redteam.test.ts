// 常设隐私闸门（M1.8-F④，采纳审计质疑席#3：安全正典第一，从今有牙）。
// 来源：红队A 七类对抗密钥 + 红队B 工具名/时间戳向量。与金测试同跑、永久在册。
// 断言：(1) --redact 分享形态无明文密钥/MCP工具名/绝对时间；(2) 默认带 normErr 抹内联凭据与短口令。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { distillTape, serializeTape } from '../adapters/claude-jsonl/index.ts';
import { redactResult } from '../adapters/claude-jsonl/distill.ts';
import { resolveParams } from '../engine/params.ts';

const here = dirname(fileURLToPath(import.meta.url));
const params = resolveParams(JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8')));

const A = (id: string, name: string, input: unknown, ts: string): string =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const U = (id: string, isErr: boolean, content: string, ts: string): string =>
  JSON.stringify({ type: 'user', timestamp: ts, toolUseResult: { code: isErr ? 1 : 0 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isErr, content }] } });

// 七类对抗密钥 + 工具名/时间戳向量
const SECRETS = {
  pass10: 'hunter2pw!', pin8: '48213765', pass12: 'Tr0ub4dor3x',
  embeddedFlag: '-phunterpass', apiKeyShort: 'skabc12345',
  cjk: '张伟的私钥密码月亮', emojiWrap: 'pwdmoonkeyx',
};
const MCP_TOOL = 'mcp__AcmeCorp_ProjectZeus__deployProd';
const URL_CRED = 'https://admin:p4sw0rdxyz@internal.acme.corp/db';
const ABS_TS = '2026-06-01T10:00:01.000Z';

function adversarialRaw(): string {
  return [
    A('t1', 'Bash', { command: `curl -u admin:${SECRETS.pass10} https://x` }, '2026-06-01T10:00:00.000Z'),
    U('t1', true, `auth failed token ${SECRETS.pass10} pin ${SECRETS.pin8} ${SECRETS.pass12}`, ABS_TS),
    A('t2', 'Bash', { command: `mysql ${SECRETS.embeddedFlag}` }, '2026-06-01T10:00:02.000Z'),
    U('t2', true, `denied password ${SECRETS.embeddedFlag} key ${SECRETS.apiKeyShort}`, '2026-06-01T10:00:03.000Z'),
    A('t3', 'Bash', { command: 'run' }, '2026-06-01T10:00:04.000Z'),
    U('t3', true, `错误 ${SECRETS.cjk} ${SECRETS.emojiWrap}`, '2026-06-01T10:00:05.000Z'),
    A('t4', MCP_TOOL, { arg: 1 }, '2026-06-01T10:00:06.000Z'),
    U('t4', false, 'ok', '2026-06-01T10:00:07.000Z'),
    A('t5', 'WebFetch', { url: URL_CRED }, '2026-06-01T10:00:08.000Z'),
    U('t5', true, `fetch failed ${URL_CRED}`, '2026-06-01T10:00:09.000Z'),
  ].join('\n') + '\n';
}

/** ascii 密钥的代表性 ≥6 字符子串（用于机械红线）。 */
function asciiProbe(sec: string): string | null {
  for (let i = 0; i + 6 <= sec.length; i++) {
    const sub = sec.slice(i, i + 6);
    if (/^[\x21-\x7e]{6}$/.test(sub)) return sub;
  }
  return null;
}

test('隐私·redact 分享带：七类密钥无明文子串存活', () => {
  const share = serializeTape(redactResult(distillTape(adversarialRaw(), params), 'REDTEAMSALT'));
  for (const [name, sec] of Object.entries(SECRETS)) {
    assert.ok(!share.includes(sec), `完整密钥 [${name}] 不应存活: ${sec}`);
    const probe = asciiProbe(sec);
    if (probe) assert.ok(!share.includes(probe), `密钥 [${name}] 子串 "${probe}" 不应存活`);
  }
});

test('隐私·redact 分享带：MCP 工具名（公司/项目/动作）无明文', () => {
  const share = serializeTape(redactResult(distillTape(adversarialRaw(), params), 'REDTEAMSALT'));
  for (const frag of ['AcmeCorp', 'ProjectZeus', 'deployProd', MCP_TOOL]) {
    assert.ok(!share.includes(frag), `MCP 工具名片段 "${frag}" 不应存活于分享带`);
  }
});

test('隐私·redact 分享带：绝对时间戳/日历指纹去除', () => {
  const red = redactResult(distillTape(adversarialRaw(), params), 'REDTEAMSALT');
  const share = serializeTape(red);
  assert.ok(!share.includes(ABS_TS), '绝对 ISO 时间戳不应存活');
  assert.ok(!share.includes('1780308001000'), '绝对 epoch-ms 不应存活');
  assert.ok(!share.includes('2026-06-01'), '日历日期不应存活');
  assert.equal(red.meta.stats.firstT, 0, '时间相对化：firstT 归 0');
  assert.equal(red.meta.sourceHash, 'redacted', 'sourceHash 去除（防跨带关联）');
});

test('隐私·默认带 normErr：内联凭据/含数字令牌/URL 抹为 SECRET（可识别模式）', () => {
  // 默认（不 redact）带为本地抽检用，normErr 只保证抹掉**可识别的凭据模式**：
  //   内联 key=val/key:val、-p 内联、含数字的疑似令牌、URL、路径、纯数字。
  //   纯字母词（可能是正常错误词）不抹——那是 --redact 分享形态的职责（上面已全覆盖）。
  const d = distillTape(adversarialRaw(), params);
  const blob = d.records.filter((r) => r.errClass).map((r) => r.errClass!).join(' || ');
  // 含数字的口令 / 短 key / PIN / -p 内联 / URL 凭据 —— 必须抹
  for (const [name, sec] of [['pass10', SECRETS.pass10], ['pass12', SECRETS.pass12], ['apiKeyShort', SECRETS.apiKeyShort]] as const) {
    const probe = asciiProbe(sec)!;
    assert.ok(!blob.includes(probe), `默认带 errClass 不应含含数字令牌 [${name}] 子串 "${probe}"：${blob}`);
  }
  assert.ok(!blob.includes('p4sw0rd'), '默认带 errClass 不应含 URL 内凭据');
  assert.ok(!blob.includes('48213765'), '默认带 errClass 不应含 PIN 明文');
  assert.ok(!blob.includes('hunterpass'), '默认带 errClass 不应含 -p 内联凭据');
});

test('隐私·默认带 normErr：邮箱 PII 抹为 EMAIL（NIGHT-2 A1）', () => {
  // 邮箱是 PII 而非凭据，此前各规则全漏（无 =:、@ 切碎长 token）。README「outputs never stored」
  // 的兑现点就在 errClass（默认带唯一输出派生字段），故邮箱向量常设在册。
  const EMAILS = ['alice.smith@example.com', 'Bob_Jones+dev@Corp-Mail.example.ORG', 'x@sub.foo-bar.co.uk'];
  const raw = [
    A('e1', 'Bash', { command: 'git push' }, '2026-06-01T10:00:00.000Z'),
    U('e1', true, `remote rejected: author ${EMAILS[0]} not allowed`, '2026-06-01T10:00:01.000Z'),
    A('e2', 'Bash', { command: 'mail send' }, '2026-06-01T10:00:02.000Z'),
    U('e2', true, `SMTP 550 无此收件人 ${EMAILS[1]} cc ${EMAILS[2]}`, '2026-06-01T10:00:03.000Z'),
  ].join('\n') + '\n';
  const d = distillTape(raw, params);
  const blob = d.records.filter((r) => r.errClass).map((r) => r.errClass!).join(' || ');
  for (const em of EMAILS) {
    assert.ok(!blob.toLowerCase().includes(em.toLowerCase()), `默认带 errClass 不应含邮箱 "${em}"：${blob}`);
    const local = em.split('@')[0]!.toLowerCase();
    assert.ok(!blob.includes(`${local}@`), `邮箱局部 "${local}@" 不应存活：${blob}`);
  }
  assert.ok(blob.includes('EMAIL'), `邮箱应被抹为 EMAIL 占位：${blob}`);
});
