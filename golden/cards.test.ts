// 收工吐卡回归（轨乙①②，三号手令·丁）：钩子落纸头 → spool → serve 尾随出纸 → 卡片端点纪律，
// 外加接线安装器（connect）的分层写与幂等。全程沙箱（FOLEY_HOME / CLAUDE_CONFIG_DIR 指 tmp），
// 不碰真 ~/.foley 与 ~/.claude。素材＝合成夹具 unknown-tool.jsonl（P1-③ 同源，含绝对时戳供脱敏断言）。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const fixture = join(here, 'fixtures', 'unknown-tool.jsonl');
const titleSentinel = 'NEW_CARD_OPENING_SENTINEL_91c2';
const offTitleSentinel = 'OFF_CARD_OPENING_SENTINEL_2a71';

// ─────────────────────────── 轨乙① · 钩子落纸头（cli/hook.ts）───────────────────────────
describe('钩子落纸头（cli/hook.ts 即发即忘）', () => {
  const home = mkdtempSync(join(tmpdir(), 'foley-spool-'));
  after(() => rmSync(home, { recursive: true, force: true }));
  const runHook = (stdin: string, args: string[] = []) =>
    spawnSync('node', [join(repoRoot, 'cli', 'hook.ts'), ...args],
      { input: stdin, env: { ...process.env, FOLEY_HOME: home }, encoding: 'utf8' });
  const spool = () => { try { return readFileSync(join(home, 'spool', 'events.ndjson'), 'utf8'); } catch { return ''; } };

  test('SessionEnd → 一行 NDJSON（sessionId/transcriptPath/reason 齐全）且退 0', () => {
    const r = runHook(JSON.stringify({
      hook_event_name: 'SessionEnd', session_id: 'sess-abc',
      transcript_path: '/tmp/t.jsonl', reason: 'clear',
    }));
    assert.equal(r.status, 0);
    const e = JSON.parse(spool().trim().split('\n').at(-1)!);
    assert.equal(e.kind, 'session-end');
    assert.equal(e.sessionId, 'sess-abc');
    assert.equal(e.reason, 'clear'); // clear 落卡（清屏即翻章）——事件必须过纸，滤 reason 是消费侧的事
  });

  test('Stop 事件不落纸（勿用 Stop：每回合收笔≠收工）', () => {
    const n = spool().length;
    const r = runHook(JSON.stringify({ hook_event_name: 'Stop', session_id: 'x' }));
    assert.equal(r.status, 0);
    assert.equal(spool().length, n);
  });

  test('坏载荷静默退 0（铁律①：钩子任何失败不许波及用户会话）', () => {
    const r = runHook('{嘎');
    assert.equal(r.status, 0);
    assert.equal(r.stderr, '');
  });

  test('--hello 自证走同一条落纸路径', () => {
    const r = runHook('', ['--hello']);
    assert.equal(r.status, 0);
    assert.ok(spool().includes('"kind":"hello"'));
  });
});

// ──────────────────── 轨乙① · serve 尾随出纸＋卡片端点（集成，沙箱 FOLEY_HOME）────────────────────
describe('serve 卡片值守（spool 尾随 → 蒸馏＋回放出纸 → 端点纪律）', () => {
  let proc: ChildProcess | undefined;
  let base = '';
  let token = '';
  const port = 45100 + Math.floor(Math.random() * 1000);
  const home = mkdtempSync(join(tmpdir(), 'foley-home-'));
  const emptyProjects = mkdtempSync(join(tmpdir(), 'foley-empty-'));

  before(async () => {
    // 预置 spool：一枚正经收工＋一枚 resume（后者不得出卡——延续不是终章）
    mkdirSync(join(home, 'spool'), { recursive: true });
    const transcriptDir = join(home, '-Users-shadow-atlas');
    mkdirSync(transcriptDir, { recursive: true });
    const transcript = join(transcriptDir, 'synthetic-session.jsonl');
    writeFileSync(transcript,
      `${JSON.stringify({ type: 'user', isSidechain: false, message: { content: [{ type: 'text', text: titleSentinel }] } })}\n`
      + readFileSync(fixture, 'utf8'));
    writeFileSync(join(home, 'spool', 'events.ndjson'),
      JSON.stringify({ v: 1, kind: 'session-end', sessionId: 'sess-golden-1', transcriptPath: transcript, reason: 'other' }) + '\n'
      + JSON.stringify({ v: 1, kind: 'session-end', sessionId: 'sess-resume-1', transcriptPath: transcript, reason: 'resume' }) + '\n');
    base = `http://127.0.0.1:${port}`;
    const env: NodeJS.ProcessEnv = { ...process.env, FOLEY_HOME: home, FOLEY_PROJECTS: emptyProjects };
    delete env.FOLEY_NO_LOCAL_TITLES;
    proc = spawn('node', [join(repoRoot, 'stage', 'serve.mjs'), String(port)],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env });
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('serve 启动超时')), 8000);
      proc!.stdout!.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
      proc!.on('exit', (c) => { clearTimeout(to); reject(new Error(`serve 提前退出 ${c}`)); });
    });
    const html = await (await fetch(base + '/?mode=live')).text();
    token = html.match(/name="dub-token" content="([^"]+)"/)?.[1] ?? '';
    // 等出纸（蒸馏＋回放两道子工序）：轮询 /cards/pending，上限 40s
    for (let i = 0; i < 80; i++) {
      const j = await (await fetch(base + '/cards/pending')).json();
      if ((j.pending ?? []).includes('sess-golden-1')) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('40s 内未见 sess-golden-1 出纸');
  });

  after(() => {
    proc?.kill('SIGKILL');
    rmSync(home, { recursive: true, force: true });
    rmSync(emptyProjects, { recursive: true, force: true });
  });

  test('收工新卡默认落本地标题；运行中 config 退出后新卡不落首句且 /rack 清旧缓存', async () => {
    assert.ok(existsSync(join(home, 'cards', 'sess-golden-1', 'curve.csv')));
    assert.ok(existsSync(join(home, 'cards', 'sess-golden-1', 'moments.csv')));
    const cardDir = join(home, 'cards', 'sess-golden-1');
    const rackMeta = JSON.parse(readFileSync(join(cardDir, 'rack.json'), 'utf8'));
    assert.equal(rackMeta.opening, titleSentinel, '默认新卡须经 writeRackMeta 登记首句标题');
    const defaultRack = await (await fetch(`${base}/rack`)).json();
    const defaultCard = defaultRack.rack.find((x: any) => x.id === 'card:sess-golden-1');
    assert.equal(defaultCard.name, 'atlas');
    assert.equal(defaultCard.summary, titleSentinel);
    for (const file of ['session.tape.jsonl', 'curve.csv', 'moments.csv']) {
      assert.ok(!readFileSync(join(cardDir, file), 'utf8').includes(titleSentinel), `${file} 不得复制对话首句`);
    }

    writeFileSync(join(home, 'config.json'), `${JSON.stringify({ privacy: { localTitles: false } })}\n`);
    const offTranscriptDir = join(home, '-Users-shadow-offrepo');
    mkdirSync(offTranscriptDir, { recursive: true });
    const offTranscript = join(offTranscriptDir, 'synthetic-session.jsonl');
    writeFileSync(offTranscript,
      `${JSON.stringify({ type: 'user', isSidechain: false, message: { content: [{ type: 'text', text: offTitleSentinel }] } })}\n`
      + readFileSync(fixture, 'utf8'));
    appendFileSync(join(home, 'spool', 'events.ndjson'),
      `${JSON.stringify({ v: 1, kind: 'session-end', sessionId: 'sess-golden-off', transcriptPath: offTranscript, reason: 'other' })}\n`);
    for (let i = 0; i < 80 && !existsSync(join(home, 'cards', 'sess-golden-off', 'rack.json')); i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const offCardDir = join(home, 'cards', 'sess-golden-off');
    assert.ok(existsSync(join(offCardDir, 'rack.json')), '40s 内应完成关闭态新卡出纸');
    const offMeta = JSON.parse(readFileSync(join(offCardDir, 'rack.json'), 'utf8'));
    assert.equal(offMeta.repo, 'offrepo');
    assert.ok(!Object.hasOwn(offMeta, 'opening'), '标题退出：新卡不得登记 opening 字段');
    for (const file of ['rack.json', 'session.tape.jsonl', 'curve.csv', 'moments.csv']) {
      assert.ok(!readFileSync(join(offCardDir, file), 'utf8').includes(offTitleSentinel), `${file} 不得含关闭态合成首句`);
    }
    const rackBody = await (await fetch(`${base}/rack`)).json();
    const card = rackBody.rack.find((x: any) => x.id === 'card:sess-golden-off');
    assert.equal(card?.name, 'offrepo');
    assert.ok(card?.seal?.zh || card?.seal?.en);
    assert.equal(card.summary, card.seal.zh || card.seal.en);
    assert.ok(!JSON.stringify(rackBody).includes(titleSentinel));
    assert.ok(!JSON.stringify(rackBody).includes(offTitleSentinel));
    assert.ok(!Object.hasOwn(JSON.parse(readFileSync(join(cardDir, 'rack.json'), 'utf8')), 'opening'),
      '同一旧实例重读配置后须原子清除默认态旧标题');
    assert.ok(!existsSync(join(home, 'cards', 'sess-resume-1')), 'resume 不得出卡（延续不是终章）');
  });

  test('出的纸是脱敏形态：蒸馏带 src=redacted、curve 时间全相对', async () => {
    const tape = readFileSync(join(home, 'cards', 'sess-golden-1', 'session.tape.jsonl'), 'utf8');
    assert.ok(tape.includes('"sourceHash":"redacted"'), '卡片素材必须走 distill 默认（脱敏）口径');
    const t0 = Number((await (await fetch(`${base}/cards/sess-golden-1/curve.csv`)).text()).split('\n')[1]?.split(',')[0]);
    assert.ok(Number.isFinite(t0) && t0 < 86400_000, `curve 首样本应为带内相对 ms，实得 ${t0}`);
  });

  test('读面纪律：合法文件 200；越名/穿越一律不放行', async () => {
    assert.equal((await fetch(`${base}/cards/sess-golden-1/curve.csv`)).status, 200);
    assert.equal((await fetch(`${base}/cards/sess-golden-1/session.tape.jsonl`)).status, 404, '读面白名单只有 curve/moments 两文件');
    assert.equal((await fetch(`${base}/cards/sess-golden-1/REPORT.md`)).status, 404);
    const trav = await fetch(`${base}/cards/../spool/events.ndjson`);
    assert.notEqual(trav.status, 200, '目录穿越必须被拒');
  });

  test('/card/save 鉴权：无令牌 403；带令牌落卡（覆盖写＝后卡替前卡）；skip 销账', async () => {
    const png = Buffer.from('第一卡').toString('base64');
    const noAuth = await fetch(`${base}/card/save`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sid: 'sess-golden-1', png }),
    });
    assert.equal(noAuth.status, 403);
    const save = (body: object) => fetch(`${base}/card/save`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-dub-token': token },
      body: JSON.stringify(body),
    });
    assert.equal((await save({ sid: 'sess-golden-1', png, meta: { kind: 'foley-card/session-end' } })).status, 200);
    const p1 = join(home, 'cards', 'sess-golden-1', 'card.png');
    assert.equal(readFileSync(p1, 'utf8'), '第一卡');
    assert.equal((await save({ sid: 'sess-golden-1', png: Buffer.from('第二卡').toString('base64'), meta: {} })).status, 200);
    assert.equal(readFileSync(p1, 'utf8'), '第二卡', '同 sid 覆盖写＝后卡替前卡');
    const j = await (await fetch(`${base}/cards/pending`)).json();
    assert.ok(!(j.pending ?? []).includes('sess-golden-1'), '落卡后工单销账');
    assert.equal((await save({ sid: '../../etc', png })).status, 400, 'sid 白名单');
    assert.equal((await save({ sid: 'sess-nonexist-9', png })).status, 400, '未备纸的 sid 不收卡');
  });

  test('/onboard/status 形状（wired 布尔＋spool 布尔）', async () => {
    const j = await (await fetch(`${base}/onboard/status`)).json();
    assert.equal(typeof j.wired, 'boolean');
    assert.equal(typeof j.spool, 'boolean');
  });
});

// ─────────────────────────── 轨乙② · 接线安装器（connect 分层写）───────────────────────────
describe('接线安装器（connect --yes：分层写 settings.json）', () => {
  const claudeDir = mkdtempSync(join(tmpdir(), 'foley-claude-'));
  const home = mkdtempSync(join(tmpdir(), 'foley-onb-'));
  after(() => { rmSync(claudeDir, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); });
  const settings = join(claudeDir, 'settings.json');
  const connect = () => spawnSync('node', [join(repoRoot, 'cli', 'index.ts'), 'connect', '--yes'],
    { env: { ...process.env, CLAUDE_CONFIG_DIR: claudeDir, FOLEY_HOME: home }, encoding: 'utf8' });

  test('全新接线：SessionEnd 钩子写入＋hello 落 spool＋针落宣告', () => {
    const r = connect();
    assert.equal(r.status, 0, r.stderr);
    const s = JSON.parse(readFileSync(settings, 'utf8'));
    const cmds = (s.hooks.SessionEnd as { hooks: { command: string }[] }[]).flatMap((g) => g.hooks.map((h) => h.command));
    assert.ok(cmds.some((c) => /cli[\\/]hook\.ts/.test(c)), `钩子命令应指 cli/hook.ts：${cmds}`);
    assert.ok(readFileSync(join(home, 'spool', 'events.ndjson'), 'utf8').includes('"kind":"hello"'));
    assert.ok(r.stdout.includes('针落'));
  });

  test('分层保留＋幂等：既有键与他人钩子不动，重跑不重复追加', () => {
    const seeded = {
      model: 'opus',
      hooks: {
        PostToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo hi' }] }],
        SessionEnd: [{ hooks: [{ type: 'command', command: 'echo bye' }] }],
      },
    };
    writeFileSync(settings, JSON.stringify(seeded));
    assert.equal(connect().status, 0);
    const once = JSON.parse(readFileSync(settings, 'utf8'));
    assert.equal(once.model, 'opus');
    assert.equal(once.hooks.PostToolUse[0].hooks[0].command, 'echo hi');
    assert.equal(once.hooks.SessionEnd.length, 2, '他人 SessionEnd 钩子保留，我方追加一组');
    assert.ok(existsSync(settings + '.foley-bak'), '写前留底');
    assert.equal(connect().status, 0);
    const twice = JSON.parse(readFileSync(settings, 'utf8'));
    assert.equal(twice.hooks.SessionEnd.length, 2, '幂等：重跑不再追加');
  });

  test('坏档中止且原文不动（不敢分层合并就不动手）', () => {
    writeFileSync(settings, '{嘎');
    const r = connect();
    assert.notEqual(r.status, 0);
    assert.equal(readFileSync(settings, 'utf8'), '{嘎');
  });
});
