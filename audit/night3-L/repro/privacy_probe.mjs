// NIGHT-3 左耳：以纯合成 Claude JSONL 驱动产品的 openingLine → rack.json → /rack 全链。
// 不接触真实用户文本；固定使用左耳端口 4204。
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = new URL('../../../', import.meta.url).pathname.replace(/\/$/, '');
const out = join(root, 'audit', 'night3-L', 'evidence');
const scratchRoot = join(out, 'scratch');
mkdirSync(scratchRoot, { recursive: true });
const scratch = mkdtempSync(join(scratchRoot, 'privacy-'));
const foleyHome = join(scratch, 'foley-home');
const sid = 'sentinel-session-0001';
const cardDir = join(foleyHome, 'cards', sid);
const projectsDir = join(scratch, 'projects');
const projectDir = join(projectsDir, '-synthetic-repo');
mkdirSync(cardDir, { recursive: true });
mkdirSync(projectDir, { recursive: true });

const sentinel = 'SYNTHETIC_SECRET_DO_NOT_PERSIST sk-test-123 /Users/alice/SecretProject';
writeFileSync(join(projectDir, `${sid}.jsonl`), `${JSON.stringify({
  type: 'user',
  isSidechain: false,
  message: { content: [{ type: 'text', text: sentinel }] },
})}\n`);
writeFileSync(join(cardDir, 'curve.csv'), 't,S,T,A,wow,needle,phase,weather,pendingAsk\n0,0,0,0,0,0,0,0,0\n50,0,0,0,0,0,0,0,0\n');
writeFileSync(join(cardDir, 'moments.csv'), 't,verb,outcome,m,special,targetHash,sig\n');

const PORT = 4204;
const serve = spawn(process.execPath, [join(root, 'stage', 'serve.mjs'), String(PORT), '--replay-only'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, FOLEY_HOME: foleyHome, FOLEY_PROJECTS: projectsDir },
});
let err = '';
serve.stderr.on('data', (d) => { err += String(d); });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`serve 启动超时：${err.slice(-500)}`)), 10000);
  serve.stdout.on('data', (d) => {
    if (String(d).includes('stage @')) { clearTimeout(timer); resolve(); }
  });
  serve.on('exit', (code) => reject(new Error(`serve 提前退出 ${code}`)));
});

try {
  const response = await fetch(`http://127.0.0.1:${PORT}/rack`);
  const body = await response.text();
  let persisted = '';
  for (let i = 0; i < 40; i++) {
    try { persisted = readFileSync(join(cardDir, 'rack.json'), 'utf8'); break; }
    catch { await delay(25); }
  }
  const verdict = {
    sampledAt: new Date().toISOString(),
    ownedPid: serve.pid,
    mechanism: 'missing rack.json -> GET /rack -> ensureCardMeta -> openingLine(synthetic JSONL) -> rack.json',
    sentinel,
    httpStatus: response.status,
    rackJsonCreatedByProduct: persisted.length > 0,
    persistedInRackJson: persisted.includes(sentinel),
    exposedByRackApi: body.includes(sentinel),
    rackEntry: JSON.parse(body).rack?.find((x) => x.id === `card:${sid}`) ?? null,
  };
  verdict.PASS_REPRO = verdict.rackJsonCreatedByProduct && verdict.persistedInRackJson && verdict.exposedByRackApi;
  writeFileSync(join(out, 'privacy-verdict.json'), `${JSON.stringify(verdict, null, 2)}\n`);
  console.log(JSON.stringify(verdict, null, 2));
} finally {
  if (serve.exitCode === null) serve.kill('SIGTERM');
  rmSync(scratch, { recursive: true, force: true });
}
