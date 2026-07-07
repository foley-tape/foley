#!/usr/bin/env node
// 复现（乙·蒸馏管线 normErr 死角）：normErr 是默认（非 --redact）带唯一自由文本字段 errClass 的
// 唯一脱敏闸。穷举对抗向量，报告哪些敏感子串"穿过"落进 errClass。
// 分类：CONFIRMED-CATCH（闸挡住，防御生效）｜SURVIVOR（穿过——注明是否已知边界）。
//
// 用法: node repro/final-乙/normErr_probe.mjs
import { normErr } from '../../adapters/claude-jsonl/parse.ts';

// [标签, 错误首行文本, 期望被抹掉的敏感子串, 是否已知/文档承认的边界]
const V = [
  // —— 应被挡（防御基线；穿过=回归） ——
  ['AWS key',        'invalid credentials AKIAIOSFODNN7EXAMPLE rejected', 'AKIAIOSFODNN7EXAMPLE', false],
  ['Bearer',         'Authorization: Bearer sk-proj-abc123def456 401',    'sk-proj-abc123def456', false],
  ['GH token',       'remote: Invalid token ghp_16C7e42F292c6912E7710 auth','ghp_16C7e42F292c6912E7710', false],
  ['email PII',      'recipient alice.wonderland@acme-corp.com bounce',    'alice.wonderland@acme-corp.com', false],
  ['home user',      "ENOENT open '/Users/jbezos/secret/.env'",           'jbezos', false],
  ['conn str',       'ECONNREFUSED postgres://admin:s3cr3tpw@db.corp:5432','s3cr3tpw', false],
  ['-p inline',      'denied mysql -phunterpass2 key',                     'hunterpass2', false],
  ['key=val',        'STRIPE_SECRET_KEY=rk_live_51H8xExample invalid',     'rk_live_51H8xExample', false],
  ['IPv4',           'connection refused 10.13.37.42:5432 timeout',        '10.13.37.42', false],

  // —— 可能穿过（本探针要暴露的死角） ——
  ['CJK 人名 PII',    '错误：用户 张伟 的密码 月亮宝贝 无效',                  '张伟', true],
  ['CJK 密码',        '认证失败 密码是 月亮宝贝门牌',                          '月亮宝贝门牌', true],
  ['Cyrillic pwd',   'ошибка пароль солнцеключ неверный',                  'солнцеключ', true],
  ['内网主机名',      'cannot resolve host api.staging.internal down',      'api.staging.internal', false],
  ['内网主机2',       'timeout db-prod-eu.corp unreachable',               'db-prod-eu.corp', false],
  ['纯字母口令',      'psql FATAL password swordfish authentication',       'swordfish', true],
  ['私有仓(无.git)',  "repo git@github.com:acme-secret/moonshot not found", 'moonshot', false],
  ['scheme-less URL', 'blocked host secret-admin.evil-internal.co path',    'secret-admin.evil-internal.co', false],
  ['UUID',           'session 550e8400-e29b-41d4-a716-446655440000 gone',  '550e8400', false],
];

let survivors = 0, unexpected = 0;
for (const [label, input, secret, knownBoundary] of V) {
  const out = normErr(input);
  const survived = out.includes(secret.toLowerCase()) || out.includes(secret);
  if (survived) {
    survivors++;
    const tag = knownBoundary ? '已知边界' : '⚠ 非文档边界';
    if (!knownBoundary) unexpected++;
    console.log(`SURVIVOR [${tag}] ${label}: "${secret}" 存活 → errClass="${out}"`);
  } else {
    console.log(`caught            ${label}: 已抹 → errClass="${out}"`);
  }
}
console.log(`\n穿过 ${survivors}/${V.length}（其中非文档边界 ${unexpected} 条）。`);
console.log('注：默认带 errClass 是 README「outputs never stored」的兑现点；穿过者即"输出派生的敏感残留"。');
process.exit(unexpected > 0 ? 1 : 0);
