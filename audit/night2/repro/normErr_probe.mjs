// 红队A' — normErr 泄漏探针：errClass 是非脱敏带里唯一的自由文本字段。
// README 承诺"工具输出正文一律不落盘"，errClass=normErr(错误首行) 是这条承诺的唯一活口。
// 检验：真实错误串里的凭据/路径/主机名/邮箱/IP 是否被抹净。
import { normErr } from '../../../adapters/claude-jsonl/parse.ts';

const cases = [
  // [标签, 输入错误首行, 期望不出现的敏感子串]
  ['AWS 密钥', 'Error: invalid credentials AKIAIOSFODNN7EXAMPLE rejected', 'AKIAIOSFODNN7EXAMPLE'],
  ['Bearer 头', 'fetch failed: Authorization: Bearer sk-proj-abc123def456ghi789 401', 'sk-proj-abc123def456ghi789'],
  ['明文密码短', 'psql: FATAL password "hunter2" authentication failed', 'hunter2'],
  ['连接串', 'ECONNREFUSED postgres://admin:s3cr3tpw@db.internal.corp:5432/prod', 's3cr3tpw'],
  ['邮箱', 'SMTP rejected recipient alice.wonderland@acme-corp.com bounce', 'alice.wonderland@acme-corp.com'],
  ['内网主机名', 'getaddrinfo ENOTFOUND jenkins-prod-01.eng.internal', 'jenkins-prod-01.eng.internal'],
  ['公网IP', 'connect ETIMEDOUT 203.0.113.45:443', '203.0.113.45'],
  ['家目录用户名', "ENOENT open '/Users/jbezos/secret-project/.env'", 'jbezos'],
  ['JWT', 'token invalid eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc rejected', 'eyJhbGciOiJIUzI1NiJ9'],
  ['GH token', 'remote: Invalid token ghp_16C7e42F292c6912E7710c838347Ae178B4a auth', 'ghp_16C7e42F292c6912E7710c838347Ae178B4a'],
  ['短口令数字后', 'login failed for pin 4821 user bob', '4821'],
  ['私有仓名', "fatal: repository 'git@github.com:acme-secret/moonshot.git' not found", 'moonshot'],
  ['Slack webhook', 'POST https://hooks.slack.com/services/T00/B00/XXXXYYYYZZZZ failed', 'XXXXYYYYZZZZ'],
  ['环境变量值', 'STRIPE_SECRET_KEY=rk_live_51H8x... is invalid', 'rk_live_51H8x'],
  ['纯中文错误', '错误：无法连接到内部服务器 财务系统-北京机房', '财务系统'],
];

let leaks = 0;
console.log('标签 | 泄漏? | normErr 输出');
console.log('---|---|---');
for (const [label, input, secret] of cases) {
  const out = normErr(input);
  const leaked = out.includes(secret.toLowerCase()) || out.includes(secret);
  if (leaked) leaks++;
  console.log(`${label} | ${leaked ? '**泄漏**' : 'ok'} | \`${out}\``);
}
console.log(`\n泄漏 ${leaks}/${cases.length}`);
process.exit(leaks > 0 ? 1 : 0);
