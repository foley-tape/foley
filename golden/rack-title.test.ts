// 席一·本地标题诚约：默认标题法守住；env/config 退出同时封新旧缓存与 /rack 回显。
// 全程沙箱 FOLEY_HOME/FOLEY_PROJECTS/HOME，replay-only 不起 live、不写 repo runs。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const roots: string[] = [];
const children = new Set<ChildProcess>();
const sentinel = 'OPENING_SENTINEL_LOCAL_ONLY_7f04';

after(() => {
  for (const child of children) if (child.exitCode === null) child.kill('SIGKILL');
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function makeSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'foley-rack-title-'));
  roots.push(root);
  const home = join(root, 'foley-home');
  const projects = join(root, 'projects');
  const sid = 'title-sentinel-session';
  const card = join(home, 'cards', sid);
  const project = join(projects, '-Users-shadow-atlas');
  mkdirSync(card, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(join(card, 'curve.csv'), readFileSync(join(repoRoot, 'stage', 'fixtures', 'audit.curve.csv')));
  writeFileSync(join(card, 'moments.csv'), readFileSync(join(repoRoot, 'stage', 'fixtures', 'audit.moments.csv')));
  writeFileSync(join(project, `${sid}.jsonl`), `${JSON.stringify({
    type: 'user', isSidechain: false, message: { content: [{ type: 'text', text: sentinel }] },
  })}\n`);
  return { root, home, projects, sid, card };
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function startServe(home: string, projects: string, extraEnv: Record<string, string> = {}) {
  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env, FOLEY_HOME: home, FOLEY_PROJECTS: projects, HOME: dirname(home) };
  delete env.FOLEY_NO_LOCAL_TITLES; // 开发机全局偏好不得污染默认态金测
  Object.assign(env, extraEnv);
  const child = spawn(process.execPath, [join(repoRoot, 'stage', 'serve.mjs'), String(port), '--replay-only'], {
    cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env,
  });
  children.add(child);
  let stderr = '';
  child.stderr!.on('data', (d) => { stderr += String(d); });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`serve 启动超时：${stderr.slice(-500)}`)), 8000);
    child.stdout!.on('data', (d) => {
      if (String(d).includes('stage @')) { clearTimeout(timer); resolve(); }
    });
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`serve 提前退出 ${code}：${stderr.slice(-500)}`)); });
  });
  return { child, base: `http://127.0.0.1:${port}`, stderr: () => stderr };
}

async function stopServe(child: ChildProcess) {
  if (child.exitCode !== null) { children.delete(child); return; }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    child.kill('SIGTERM');
  });
  children.delete(child);
}

async function rack(base: string) {
  const response = await fetch(`${base}/rack`);
  assert.equal(response.status, 200);
  return response.json() as Promise<{ rack: any[] }>;
}

function fileHasOpening(file: string) {
  try { return Object.hasOwn(JSON.parse(readFileSync(file, 'utf8')), 'opening'); }
  catch { return false; }
}

function treeContains(root: string, needle: string): boolean {
  if (!existsSync(root)) return false;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) { if (treeContains(path, needle)) return true; }
    else if (readFileSync(path).includes(Buffer.from(needle))) return true;
  }
  return false;
}

test('本地标题：默认在位；env 退出清缓存并回落仓名＋章名；重启可自愈', async () => {
  const s = makeSandbox();
  const rackFile = join(s.card, 'rack.json');

  const first = await startServe(s.home, s.projects);
  const defaultBody = await rack(first.base);
  const defaultCard = defaultBody.rack.find((x) => x.id === `card:${s.sid}`);
  assert.equal(defaultCard.name, 'atlas');
  assert.equal(defaultCard.summary, sentinel, '默认标题法须显示首条真人发言');
  assert.equal(JSON.parse(readFileSync(rackFile, 'utf8')).opening, sentinel,
    '/rack 返回 200 前，默认标题须已原子写入本地 rack.json');
  await stopServe(first.child);

  const off = await startServe(s.home, s.projects, { FOLEY_NO_LOCAL_TITLES: '1' });
  const offBody = await rack(off.base);
  const offCard = offBody.rack.find((x) => x.id === `card:${s.sid}`);
  assert.ok(offCard?.seal?.zh || offCard?.seal?.en, '关闭态须有章名垫底');
  assert.equal(offCard.name, 'atlas');
  assert.equal(offCard.summary, offCard.seal.zh || offCard.seal.en);
  assert.ok(!JSON.stringify(offBody).includes(sentinel), '/rack 完整响应不得回显旧标题');
  assert.ok(existsSync(rackFile) && !fileHasOpening(rackFile),
    '/rack 返回 200 前，关闭态须已原子清除旧 opening 缓存');
  await stopServe(off.child);

  const again = await startServe(s.home, s.projects);
  const restored = await rack(again.base);
  assert.equal(restored.rack.find((x) => x.id === `card:${s.sid}`).summary, sentinel,
    '重新开启且母带仍在时，缺失字段应按同一标题法自愈');
  await stopServe(again.child);
});

test('本地标题：config 退出时不读首句、不落 opening，整个 FOLEY_HOME 无 sentinel', async () => {
  const s = makeSandbox();
  mkdirSync(s.home, { recursive: true });
  writeFileSync(join(s.home, 'config.json'), `${JSON.stringify({ privacy: { localTitles: false } })}\n`);
  const orphan = join(s.home, 'cards', 'orphan-title-session');
  mkdirSync(orphan, { recursive: true });
  writeFileSync(join(orphan, 'rack.json'), JSON.stringify({ repo: 'orphan', opening: sentinel }));

  const server = await startServe(s.home, s.projects);
  const body = await rack(server.base);
  const card = body.rack.find((x) => x.id === `card:${s.sid}`);
  assert.equal(card.name, 'atlas');
  assert.equal(card.summary, card.seal.zh || card.seal.en);
  assert.ok(!JSON.stringify(body).includes(sentinel));
  assert.ok(existsSync(join(s.card, 'rack.json')), '关闭态应照常写非敏感 rack 元数据');
  assert.ok(!fileHasOpening(join(s.card, 'rack.json')));
  assert.ok(!fileHasOpening(join(orphan, 'rack.json')), '无 curve.csv 的孤儿卡也须清除旧标题缓存');
  assert.ok(!treeContains(s.home, sentinel), '关闭态 FOLEY_HOME 不得出现合成首句');
  await stopServe(server.child);
});

test('本地标题：/rack 组装途中关闭 config，响应与磁盘都按关闭态收紧', async () => {
  const s = makeSandbox();
  const rackFile = join(s.card, 'rack.json');
  writeFileSync(rackFile, JSON.stringify({ repo: 'atlas', opening: sentinel, summary: 'READ · RUN' }));
  const fixture = readFileSync(join(repoRoot, 'stage', 'fixtures', 'audit.curve.csv'), 'utf8');
  const newline = fixture.indexOf('\n');
  writeFileSync(join(s.card, 'curve.csv'), fixture.slice(0, newline + 1) + fixture.slice(newline + 1).repeat(140));

  const server = await startServe(s.home, s.projects);
  const responsePromise = fetch(`${server.base}/rack`);
  await new Promise((resolve) => setTimeout(resolve, 3));
  mkdirSync(s.home, { recursive: true });
  writeFileSync(join(s.home, 'config.json'), `${JSON.stringify({ privacy: { localTitles: false } })}\n`);
  const response = await responsePromise;
  assert.equal(response.status, 200);
  assert.ok(!JSON.stringify(await response.json()).includes(sentinel), '请求中关闭后不得回显旧快照标题');
  assert.ok(!fileHasOpening(rackFile), '请求中关闭后不得把 opening 旧快照写回磁盘');
  await stopServe(server.child);
});

test('本地标题：配置热重验约束双 serve，旧实例不得把 opening 补回', async () => {
  const s = makeSandbox();
  const rackFile = join(s.card, 'rack.json');
  const a = await startServe(s.home, s.projects);
  const b = await startServe(s.home, s.projects);
  assert.equal((await rack(a.base)).rack.find((x) => x.id === `card:${s.sid}`).summary, sentinel);
  assert.equal((await rack(b.base)).rack.find((x) => x.id === `card:${s.sid}`).summary, sentinel);

  mkdirSync(s.home, { recursive: true });
  writeFileSync(join(s.home, 'config.json'), `${JSON.stringify({ privacy: { localTitles: false } })}\n`);
  const [offA, offB] = await Promise.all([rack(a.base), rack(b.base)]);
  for (const body of [offA, offB]) {
    const card = body.rack.find((x) => x.id === `card:${s.sid}`);
    assert.equal(card.summary, card.seal.zh || card.seal.en);
    assert.ok(!JSON.stringify(body).includes(sentinel));
  }
  assert.ok(!fileHasOpening(rackFile), '双实例关闭态结束后，磁盘不得被旧快照补回 opening');
  assert.ok(!JSON.stringify(await rack(a.base)).includes(sentinel));
  await stopServe(a.child);
  await stopServe(b.child);
});

test('本地标题：存在但坏、类型错或不可读的 config 一律 fail-closed 并告警', async () => {
  const cases = [
    { label: 'bad-json', install: (path: string) => writeFileSync(path, '{"privacy":') },
    { label: 'wrong-type', install: (path: string) => writeFileSync(path, JSON.stringify({ privacy: { localTitles: 'false' } })) },
    { label: 'unreadable', install: (path: string) => mkdirSync(path) },
  ];
  for (const c of cases) {
    const s = makeSandbox();
    mkdirSync(s.home, { recursive: true });
    writeFileSync(join(s.card, 'rack.json'), JSON.stringify({ repo: 'atlas', opening: sentinel, summary: sentinel }));
    c.install(join(s.home, 'config.json'));
    const server = await startServe(s.home, s.projects);
    const body = await rack(server.base);
    assert.ok(!JSON.stringify(body).includes(sentinel), `${c.label}: API 不得回显标题`);
    assert.ok(!fileHasOpening(join(s.card, 'rack.json')), `${c.label}: 磁盘须清除 opening`);
    assert.match(server.stderr(), /\[privacy\] 本地标题已关闭/, `${c.label}: 须明确告警`);
    await stopServe(server.child);
  }
});

test('本地标题：损坏缓存或目录不可达时 /rack 不得假报 200', async (t) => {
  const s = makeSandbox();
  const rackFile = join(s.card, 'rack.json');
  mkdirSync(s.home, { recursive: true });
  writeFileSync(join(s.home, 'config.json'), `${JSON.stringify({ privacy: { localTitles: false } })}\n`);
  writeFileSync(rackFile, `{"repo":"atlas","opening":"${sentinel}"`); // 故意截断：存在但不可解析
  chmodSync(s.card, 0o555);
  let permissionEnforced = false;
  try { writeFileSync(join(s.card, '.permission-probe'), 'x'); }
  catch { permissionEnforced = true; }
  if (!permissionEnforced) {
    rmSync(join(s.card, '.permission-probe'), { force: true });
    chmodSync(s.card, 0o755);
    t.skip('当前执行身份可绕过目录写权限，无法制造可靠 EACCES');
    return;
  }

  let server: Awaited<ReturnType<typeof startServe>> | undefined;
  try {
    server = await startServe(s.home, s.projects);
    const response = await fetch(`${server.base}/rack`);
    assert.equal(response.status, 500, `隐私清除失败不得返回成功货架；stderr=${server.stderr()}`);
    assert.ok(readFileSync(rackFile, 'utf8').includes(sentinel),
      '覆盖失败时旧损坏文件仍在；因此必须 500，不能声称缓存已清除');
    assert.match(server.stderr(), /无法清除 .*本地标题缓存/);
  } finally {
    chmodSync(s.card, 0o755);
    if (server) await stopServe(server.child);
  }

  const lockedCard = makeSandbox();
  mkdirSync(lockedCard.home, { recursive: true });
  writeFileSync(join(lockedCard.home, 'config.json'), `${JSON.stringify({ privacy: { localTitles: false } })}\n`);
  const lockedRack = join(lockedCard.card, 'rack.json');
  writeFileSync(lockedRack, JSON.stringify({ repo: 'atlas', opening: sentinel }));
  chmodSync(lockedCard.card, 0o000);
  let cardLockEnforced = false;
  try { readdirSync(lockedCard.card); } catch { cardLockEnforced = true; }
  if (cardLockEnforced) {
    let lockedServer: Awaited<ReturnType<typeof startServe>> | undefined;
    try {
      lockedServer = await startServe(lockedCard.home, lockedCard.projects);
      assert.equal((await fetch(`${lockedServer.base}/rack`)).status, 500,
        '卡目录不可搜索时不得把 existsSync=false 当作无缓存');
    } finally {
      chmodSync(lockedCard.card, 0o755);
      if (lockedServer) await stopServe(lockedServer.child);
    }
    assert.equal(JSON.parse(readFileSync(lockedRack, 'utf8')).opening, sentinel);
  } else {
    chmodSync(lockedCard.card, 0o755);
    t.diagnostic('当前执行身份可绕过卡目录 000 权限，跳过 card-dir EACCES 子例');
  }

  const lockedHome = makeSandbox();
  mkdirSync(lockedHome.home, { recursive: true });
  writeFileSync(join(lockedHome.home, 'config.json'), `${JSON.stringify({ privacy: { localTitles: false } })}\n`);
  const homeRack = join(lockedHome.card, 'rack.json');
  writeFileSync(homeRack, JSON.stringify({ repo: 'atlas', opening: sentinel }));
  chmodSync(lockedHome.home, 0o000);
  let homeLockEnforced = false;
  try { readdirSync(join(lockedHome.home, 'cards')); } catch { homeLockEnforced = true; }
  if (homeLockEnforced) {
    let lockedServer: Awaited<ReturnType<typeof startServe>> | undefined;
    try {
      lockedServer = await startServe(lockedHome.home, lockedHome.projects);
      assert.equal((await fetch(`${lockedServer.base}/rack`)).status, 500,
        'FOLEY_HOME 不可搜索时只可吞明确 ENOENT，不得吞 EACCES');
    } finally {
      chmodSync(lockedHome.home, 0o755);
      if (lockedServer) await stopServe(lockedServer.child);
    }
    assert.equal(JSON.parse(readFileSync(homeRack, 'utf8')).opening, sentinel);
  } else {
    chmodSync(lockedHome.home, 0o755);
    t.diagnostic('当前执行身份可绕过 FOLEY_HOME 000 权限，跳过 home EACCES 子例');
  }
});
