// NIGHT-2 安全组合拳回归（M2.4 §0.6.⑤：审计攻击脚本全部转正为金测试，永久在册）。
// 来源：audit/night2 分支 repro/{xss_tape_param,normErr_probe}.mjs + malicious/hugeline + C3 写盘鉴权向量。
// 覆盖：C1 DOM-XSS sink（X-1）、C2 巨型单行崩溃（长度守卫）、A1 邮箱/凭据 PII、C3 写盘鉴权（W-1＋令牌）、
//       §0.6.①④ save-bin 参数白名单。与金测试同跑。
// M2.6 增补（双盲终审 AUDIT_FINAL_BOARD）：F1 畸形 %-路径 DoS、F5 GET 面 Host 白名单——
// 红队验收对应 repro：serve_dos_malformed_percent.sh／rebinding 读面探针（audit/final-乙）。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, rmSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normErr, targetHashOf } from '../adapters/claude-jsonl/parse.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

// ─────────────────────────── C2 · 巨型单行不挂死（parse 纯函数）───────────────────────────
// 病理锚：audit repro malicious/hugeline.jsonl（10MB 单 token）→ sanitizeToken/normErr 量词正则
// 灾难性回溯（99%CPU 挂死蒸馏器与 live tail）。长度守卫后须秒回、有界。
test('C2 · 10MB 单行 normErr/targetHash 不挂死、有界返回', () => {
  const huge = 'a'.repeat(10_000_000);
  const t0 = Date.now();
  const h = targetHashOf('RUN', undefined, huge);
  const e = normErr(huge + '\n第二行');
  const dt = Date.now() - t0;
  assert.ok(dt < 2000, `超长输入应秒回（守卫生效），实测 ${dt}ms`);
  assert.equal(typeof h, 'string');
  assert.ok(e.length <= 60, `errClass 仍截断 60，实测 ${e.length}`);
});

test('C2 · 长度守卫不牺牲抹敏：8KB 内凭据照抹', () => {
  const out = normErr('x'.repeat(200) + ' password=hunter2xyz done');
  assert.ok(!out.includes('hunter2xyz'), `首行 8KB 内凭据仍须抹：${out}`);
});

// ─────────────────────────── A1 · PII 凭据类全抹（normErr_probe 转正）───────────────────────────
// 中文业务词（如「财务系统」）属 normErr 的 ASCII 正则设计边界，不在断言内——见 GATE/交付报告备注。
const PII: ReadonlyArray<readonly [string, string, string]> = [
  ['AWS 密钥', 'Error: invalid credentials AKIAIOSFODNN7EXAMPLE rejected', 'AKIAIOSFODNN7EXAMPLE'],
  ['Bearer 头', 'fetch failed: Authorization: Bearer sk-proj-abc123def456ghi789 401', 'sk-proj-abc123def456ghi789'],
  ['明文短口令', 'psql: FATAL password "hunter2" authentication failed', 'hunter2'],
  ['连接串', 'ECONNREFUSED postgres://admin:s3cr3tpw@db.internal.corp:5432/prod', 's3cr3tpw'],
  ['邮箱 PII', 'SMTP rejected recipient alice.wonderland@acme-corp.com bounce', 'alice.wonderland@acme-corp.com'],
  ['家目录用户名', "ENOENT open '/Users/jbezos/secret-project/.env'", 'jbezos'],
  ['JWT', 'token invalid eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc rejected', 'eyJhbGciOiJIUzI1NiJ9'],
  ['GH token', 'remote: Invalid token ghp_16C7e42F292c6912E7710c838347Ae178B4a auth', 'ghp_16C7e42F292c6912E7710c838347Ae178B4a'],
  ['私有仓名', "fatal: repository 'git@github.com:acme-secret/moonshot.git' not found", 'moonshot'],
  ['Slack webhook', 'POST https://hooks.slack.com/services/T00/B00/XXXXYYYYZZZZ failed', 'XXXXYYYYZZZZ'],
  ['环境变量值', 'STRIPE_SECRET_KEY=rk_live_51H8xExample is invalid', 'rk_live_51H8xExample'],
];
for (const [label, input, secret] of PII) {
  test(`A1 · normErr 抹「${label}」明文子串`, () => {
    const out = normErr(input);
    assert.ok(
      !out.includes(secret) && !out.toLowerCase().includes(secret.toLowerCase()),
      `「${label}」泄漏于 errClass：${out}`,
    );
  });
}

// ─────────────────────────── C1 · DOM-XSS sink 源守卫（X-1）───────────────────────────
// 浏览器点燃需 playwright（非依赖）；此处以源守卫防回归：boot 错误路径不得 insertAdjacentHTML 拼串。
test('C1/X-1 · main.js boot 错误经 textContent 落地，非 insertAdjacentHTML', () => {
  const src = readFileSync(join(repoRoot, 'stage', 'js', 'main.js'), 'utf8');
  const tail = src.slice(src.indexOf('boot().catch'));
  assert.ok(tail.length > 0, '未找到 boot().catch');
  assert.ok(!/insertAdjacentHTML\s*\(/.test(tail), 'boot 错误路径不得调用 insertAdjacentHTML（XSS sink 复活）');
  assert.ok(/\.textContent\s*=/.test(tail), 'boot 错误应经 textContent 转义落地');
});

test('C1/§0.6.① · tapeName 白名单：注入字符被剥离', () => {
  // main.js 的清洗式：`(tape || 'storm').replace(/[^\w-]/g,'') || 'storm'`。同式复核，防回归。
  const clean = (t: string) => (t.replace(/[^\w-]/g, '')) || 'storm';
  assert.equal(clean('zzz"><img src=x onerror=alert(1)>'), 'zzzimgsrcxonerroralert1');
  assert.equal(clean('../../etc/passwd'), 'etcpasswd');
  assert.equal(clean('storm'), 'storm');
  assert.equal(clean('2026-07-05'), '2026-07-05'); // 日带名（连字符）不误伤
});

// ─────────────────────────── C3 · 写盘鉴权 + save-bin 清洗（serve 集成）───────────────────────────
describe('C3 · serve 写盘鉴权（W-1＋令牌＋§0.6.①④）', () => {
  let proc: ChildProcess | undefined;
  let base = '';
  let token = '';
  const port = 42000 + Math.floor(Math.random() * 2000);

  before(async () => {
    base = `http://127.0.0.1:${port}`;
    proc = spawn('node', [join(repoRoot, 'stage', 'serve.mjs'), String(port), '--replay-only'],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('serve 启动超时')), 8000);
      proc!.stdout!.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
      proc!.on('exit', (c) => { clearTimeout(to); reject(new Error(`serve 提前退出 ${c}`)); });
    });
    const html = await (await fetch(base + '/')).text();
    token = html.match(/name="dub-token" content="([^"]+)"/)?.[1] ?? '';
  });

  after(() => {
    proc?.kill('SIGKILL');
    try {
      const dubs = join(repoRoot, 'runs', 'dubs');
      for (const f of readdirSync(dubs)) if (f.includes('sectest')) rmSync(join(dubs, f), { force: true });
    } catch { /* runs/dubs 可能不存在 */ }
  });

  const saveBody = () => JSON.stringify({ tape: 'sectest', png: Buffer.from([0]).toString('base64'), meta: { k: 1 } });

  test('③ · 令牌注入 <head> 且足够随机', () => {
    assert.ok(token.length >= 20, `令牌应注入且 ≥20 字符，实得 "${token}"`);
  });

  test('W-1 · /dub/save 无令牌 → 403', async () => {
    const r = await fetch(base + '/dub/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: saveBody() });
    assert.equal(r.status, 403);
  });

  test('W-1 · /dub/save 跨站 Origin（带令牌也拒）→ 403', async () => {
    const r = await fetch(base + '/dub/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dub-token': token, origin: 'http://evil.example' },
      body: saveBody(),
    });
    assert.equal(r.status, 403);
  });

  test('W-1 · /dub/save-bin 无令牌 → 403', async () => {
    const r = await fetch(base + `/dub/save-bin?tape=sectest&kind=gif`, { method: 'POST', body: Buffer.from([1, 2, 3]) });
    assert.equal(r.status, 403);
  });

  test('授权写盘（同源＋令牌）→ 200 落盘', async () => {
    const r = await fetch(base + '/dub/save', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-dub-token': token }, body: saveBody(),
    });
    assert.equal(r.status, 200);
    const j = await r.json() as { saved: string[] };
    assert.ok(j.saved.every((p) => p.startsWith('runs/dubs/')), `落盘须在 runs/dubs：${JSON.stringify(j)}`);
  });

  test('§0.6.④ · save-bin kind 非白名单 → 落 .bin，不穿越/不注入', async () => {
    const r = await fetch(base + `/dub/save-bin?tape=sectest&kind=${encodeURIComponent('../../evil.sh')}`, {
      method: 'POST', headers: { 'x-dub-token': token }, body: Buffer.from([1, 2, 3]),
    });
    assert.equal(r.status, 200);
    const j = await r.json() as { saved: string };
    assert.ok(j.saved.endsWith('.bin'), `非白名单 kind 应落 .bin：${j.saved}`);
    assert.ok(!j.saved.includes('..') && !j.saved.includes('evil') && !j.saved.includes('/evil'), `不得穿越/注入：${j.saved}`);
  });

  test('§0.6.① · save-bin tape 穿越序列被清洗', async () => {
    const r = await fetch(base + `/dub/save-bin?tape=${encodeURIComponent('../../../sectest_x')}&kind=png`, {
      method: 'POST', headers: { 'x-dub-token': token }, body: Buffer.from([9]),
    });
    assert.equal(r.status, 200);
    const j = await r.json() as { saved: string };
    assert.ok(!j.saved.includes('..'), `tape 穿越序列应被折叠：${j.saved}`);
    assert.match(j.saved, /^runs\/dubs\/foley-dub-.*sectest_x-.*\.png$/, `应留在 runs/dubs：${j.saved}`);
  });

  // ── M2.6 P1-②/乙-F1：畸形 %-路径曾令 decodeURIComponent 在 try 外同步抛 → unhandled rejection → 进程终止。
  //    修后：400 且进程存活（后续请求照常）。裸 /% 走原始 socket 保真（fetch 会拒不合法 URL）。──
  test('F1 · /%zz 畸形 %-序列 → 400，进程存活', async () => {
    const r = await fetch(base + '/%zz');
    assert.equal(r.status, 400);
    assert.equal((await fetch(base + '/')).status, 200, '单请求不得打崩 serve——后续请求应照常服务');
  });

  test('F1 · 裸 /% → 4xx，进程存活', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const s = connect(port, '127.0.0.1', () => s.write(`GET /% HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`));
      let buf = '';
      s.on('data', (d) => { buf += d; });
      s.on('end', () => {
        const m = buf.match(/^HTTP\/1\.[01] (\d{3})/);
        if (m) resolve(Number(m[1])); else reject(new Error(`无状态行：${buf.slice(0, 80)}`));
      });
      s.on('error', reject);
    });
    assert.ok(status >= 400 && status < 500, `裸 /% 应 4xx，实得 ${status}`);
    assert.equal((await fetch(base + '/')).status, 200);
  });

  // ── M2.6 P1-④/乙-F5：绑定 127.0.0.1 只断局域网；DNS-rebinding 恰解析回 127.0.0.1，读面须 Host 白名单。
  //    fetch 禁改 Host，走 node:http 保真。──
  test('F5 · Host 非白名单（rebind 读面）→ 403；白名单 Host → 200', async () => {
    const hostStatus = (host: string): Promise<number> => new Promise((resolve, reject) => {
      const rq = httpRequest({ host: '127.0.0.1', port, path: '/', headers: { host } }, (rs) => { rs.resume(); resolve(rs.statusCode ?? 0); });
      rq.on('error', reject); rq.end();
    });
    assert.equal(await hostStatus(`evil.example:${port}`), 403, 'rebind 形态的 Host 应被拒');
    assert.equal(await hostStatus('evil.example'), 403, '无端口形态同样拒');
    assert.equal(await hostStatus(`127.0.0.1:${port}`), 200);
    assert.equal(await hostStatus(`localhost:${port}`), 200);
  });
});
