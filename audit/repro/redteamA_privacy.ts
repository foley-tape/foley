// 红队A · 隐私攻击者 —— 复现证据。
// 目标：证伪"蒸馏带接近可分享、无原文泄露"（icebox #4 / M1.5 §3 / M16 §1修正#4"主动加固"）。
// 只读审计：本脚本不改任何源码，只 import 真实 adapter 跑对抗输入。
//
// 运行：node audit/repro/redteamA_privacy.ts

import { distillTape, redactResult, serializeTape } from '../../adapters/claude-jsonl/index.ts';
import { fnv1a } from '../../adapters/claude-jsonl/parse.ts';
import { resolveParams } from '../../engine/params.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const params = resolveParams(JSON.parse(readFileSync(join(here, '..', '..', 'params.json'), 'utf8')));

// ---- 构造对抗性原始 JSONL：把"密钥"藏进错误首行 ----
const SECRETS: { label: string; errFirstLine: string; secret: string }[] = [
  { label: '10位口令(alnum)', errFirstLine: 'Error: auth failed for password hunter2xy at db', secret: 'hunter2xy' },
  { label: '8位PIN(纯数字)', errFirstLine: 'Error: invalid PIN 45781233 rejected by gateway', secret: '45781233' },
  { label: '-pSECRET 内嵌参数', errFirstLine: 'mysql -pMyS3cretPw connect refused to host', secret: 'MyS3cretPw' },
  { label: '短API key', errFirstLine: 'Error: api key sk-ab12cd rejected (401)', secret: 'sk-ab12cd' },
  { label: '12位hex(无0x)', errFirstLine: 'commit deadbeefcafe not found in tree', secret: 'deadbeefcafe' },
  { label: 'Windows反斜杠路径', errFirstLine: 'cannot open C:\\Users\\alice\\secret.pem denied', secret: 'alice' },
  { label: '对照:40位token(应被抹)', errFirstLine: 'Error: bearer sk-abcdefghijklmnopqrstuvwxyz0123456789 bad', secret: 'sk-abcdefghijklmnopqrstuvwxyz0123456789' },
];

function rawFor(i: number, s: { errFirstLine: string }): string[] {
  const useT = `2026-07-04T10:00:${String(i).padStart(2, '0')}.000Z`;
  const resT = `2026-07-04T10:00:${String(i).padStart(2, '0')}.100Z`;
  return [
    JSON.stringify({ type: 'assistant', timestamp: useT, message: { role: 'assistant', content: [{ type: 'tool_use', id: `x${i}`, name: 'Bash', input: { command: 'run-thing' } }] } }),
    JSON.stringify({ type: 'user', timestamp: resT, toolUseResult: { code: 1, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `x${i}`, is_error: true, content: s.errFirstLine + '\n(second line: irrelevant)' }] } }),
  ];
}

const raw = SECRETS.flatMap((s, i) => rawFor(i, s)).join('\n') + '\n';
const d = distillTape(raw, params);
const failRecs = d.records.filter((r) => r.errClass);

console.log('═══ 红队A · 隐私 —— 短密钥穿透 errClass 净化 ═══\n');
console.log('normErr 净化管线：抹 /~路径 → 0x-hex → ≥16位token → 数字→0 → 截断60\n');
let leaks = 0;
SECRETS.forEach((s, i) => {
  const rec = failRecs[i];
  const errClass = rec?.errClass ?? '(无)';
  // 可恢复性判定：把密钥按 normErr 的数字规则(\d+→0)自变换，得"泄露形态"；
  // 若该形态整体出现在 errClass 且保留 ≥3 个字母 → 视为泄露（被抹的只是数字，每位仅 1/10 暴力）。
  const leakForm = s.secret.toLowerCase().replace(/\d+/g, '0');
  const alphaKept = (leakForm.match(/[a-z]/g) ?? []).length;
  const leaked = alphaKept >= 3 && errClass.toLowerCase().includes(leakForm);
  if (leaked) leaks++;
  console.log(`[${leaked ? '❌ 泄露' : '✅ 抹净'}] ${s.label}`);
  console.log(`   密钥        : ${s.secret}`);
  console.log(`   errClass    : ${errClass}`);
  console.log(`   泄露形态"${leakForm}"整体存活: ${errClass.toLowerCase().includes(leakForm)}｜保留字母数: ${alphaKept}\n`);
});
console.log(`默认蒸馏带：${leaks}/${SECRETS.length} 条含字母的密钥可恢复地存活于明文 errClass（仅纯数字/≥16位被真正抹净）。\n`);

// ---- --redact 之后：errClass 变哈希，但 sig 保留 + FNV-1a 可暴力反演 ----
console.log('═══ redact 后仍不安全：sig 保留 + FNV-1a(32位) 可字典反演 ═══\n');
const red = redactResult(d);
const sample = red.records.find((r) => r.sig && r.errClass);
console.log('--redact 输出样本记录：');
console.log('  errClass(已哈希):', sample?.errClass);
console.log('  sig(保留!)      :', sample?.sig, '  ← 金测试⑬ 明确断言 redact 不改 sig');
console.log('  t/useT/resolveT :', sample?.t, sample?.useT, sample?.resolveT, ' ← 绝对 epoch，泄露墙钟/时区/节奏\n');

// sig = fnv1a(`${verb}|${tool}|${errClass_明文}`)。攻击者有候选错误模板字典 → 暴力命中。
console.log('攻击演示：攻击者拿到 redact 带的 sig，用"候选错误模板"字典暴力反演 →');
const target = failRecs.find((r) => r.tool === 'Bash')!;
const targetSig = target.sig!;                       // 明文 sig（redact 保留）
// 字典：把上面的密钥模板都试一遍（模拟攻击者知道错误长相）
let cracked: string | null = null;
for (const s of SECRETS) {
  // 复算 normErr 的候选（攻击者可复刻净化管线，它开源）
  const guessErr = s.errFirstLine.split('\n')[0]!.toLowerCase()
    .replace(/[\/~][\w./@-]+/g, 'PATH').replace(/0x[0-9a-f]+/g, 'HEX')
    .replace(/[a-z0-9_-]{16,}/g, 'TOKEN').replace(/\d+/g, '0').replace(/\s+/g, ' ').trim().slice(0, 60);
  const guessSig = fnv1a(`RUN|Bash|${guessErr}`);
  if (guessSig === targetSig) { cracked = guessErr; break; }
}
console.log('  目标 sig     :', targetSig);
console.log('  字典命中明文 :', cracked ?? '(未命中——扩大字典即可)');
console.log('  → 32位 FNV-1a 非加密，低熵 errClass 可被"已知错误长相"字典秒破，还原含残留短密钥的模板。\n');

// ---- 时间戳指纹 ----
const ts = red.records.filter((r) => !r.special).map((r) => r.t);
console.log('═══ 时间戳指纹（default 与 redact 均保留绝对 epoch）═══');
console.log('  首事件:', new Date(Math.min(...ts)).toISOString(), '｜末:', new Date(Math.max(...ts)).toISOString());
console.log('  → 泄露会话发生的真实日期/时刻/活跃时段（可推时区），以及逐事件间隔（行为指纹）。\n');

console.log('═══ 结论 ═══');
console.log(`默认蒸馏带含明文短密钥残留（${leaks}/${SECRETS.length}）；--redact 带 errClass 哈希但 sig 明文保留且 FNV-1a 可反演，`);
console.log('叠加绝对时间戳指纹 → "无原文泄露/接近可分享"的主张对两种形态均不成立。');
