// 席二工单 2 金测 · D2：生产者心跳（PID 主判据·kill -0 轮询·REC 的 producer 因子）。
// serve 集成级（night2.security 同姿势）：真起 serve＋隔离 FOLEY_HOME/FOLEY_PROJECTS，
// GET /transport 只读快照口读 producer 四值（null|'alive'|'dead'|'ended'）。五案：报到即活（prime 路径）／
// 杀之即死（≤5s·SIGKILL 级猝死）／PID 转租防护（command 对表不符＝unknown）／无 PID＝unknown（永不误判死）／
// session-end＝'ended'（收工·SIGTERM 优雅退同路——REC 熄但非死相）。
// D2 非空过链接：PROD-2 把 producer 因子经 deriveMachineState 真跑一遍——证 producer 是驱动 REC 的那个变量。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error 纯 JS 导出（契约可执行正文·形状由 derive.test.ts 钉死）
import { deriveMachineState } from '../stage/js/derive.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(here);

const psCommand = (pid: number): string => {
  try { return execSync(`ps -o command= -p ${pid}`, { encoding: 'utf8', timeout: 1500 }).trim(); } catch { return ''; }
};

interface Rig { home: string; projects: string; tape: string; port: number; serve: ChildProcess; base: string }

const sessionLine = (t: number, n: number): string => JSON.stringify({
  parentUuid: null, isSidechain: false, userType: 'external', cwd: '/tmp/prodtest', sessionId: 'prod-test', version: '2.1.209',
  type: 'assistant', timestamp: new Date(t).toISOString(), uuid: `a${n}`,
  message: { id: `m${n}`, type: 'message', role: 'assistant', model: 'probe', content: [{ type: 'tool_use', id: `t${n}`, name: 'Bash', input: { command: `echo ${n}` } }] },
});

function spoolStartLine(home: string, transcript: string, pid: number | null, pidCommand: string | null): void {
  const dir = join(home, 'spool');
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, 'events.ndjson'), JSON.stringify({
    v: 1, at: Date.now(), kind: 'session-start', sessionId: 'prod-test',
    transcriptPath: transcript, source: 'startup', pid, pidCommand,
  }) + '\n');
}

async function startRig(prep: (home: string, tape: string) => void): Promise<Rig> {
  const home = mkdtempSync(join(tmpdir(), 'prod-home-'));
  const projects = mkdtempSync(join(tmpdir(), 'prod-proj-'));
  const pdir = join(projects, '-prodtest');
  mkdirSync(pdir, { recursive: true });
  const tape = join(pdir, 'prod-test.jsonl');
  const t0 = Date.now() - 10000;
  writeFileSync(tape, [sessionLine(t0, 1), sessionLine(t0 + 3000, 2)].join('\n') + '\n');
  prep(home, realpathSync(tape));
  const port = 45700 + Math.floor(Math.random() * 90);
  const serve = spawn('node', [join(repoRoot, 'stage', 'serve.mjs'), String(port)], {
    env: { ...process.env, FOLEY_HOME: home, FOLEY_PROJECTS: projects }, stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${port}`;
  // 等 serve 起＋live 装带（CUE 460ms）＋stderr latest 锚定
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(base + '/transport'); if (r.ok) { const t = await r.json(); if (t.phase === 'PLAYING') break; } } catch { /* 未起 */ }
  }
  return { home, projects, tape, port, serve, base };
}
function stopRig(rig: Rig): void {
  try { rig.serve.kill('SIGTERM'); } catch { /* 已亡 */ }
  try { rmSync(rig.home, { recursive: true, force: true }); } catch { /* 尽力 */ }
  try { rmSync(rig.projects, { recursive: true, force: true }); } catch { /* 尽力 */ }
}
async function transportOf(rig: Rig): Promise<Record<string, unknown>> {
  return (await fetch(rig.base + '/transport')).json() as Promise<Record<string, unknown>>;
}
async function waitProducer(rig: Rig, want: unknown, timeoutMs: number): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const t = await transportOf(rig);
    if (t.producer === want) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

test('PROD-1 报到即活（prime 路径）：起动前 spool 已有 session-start（pid=本测试进程）→ producer=alive', async () => {
  const rig = await startRig((home, tape) => {
    spoolStartLine(home, tape, process.pid, psCommand(process.pid));
  });
  try {
    assert.ok(await waitProducer(rig, 'alive', 6000), `报到的活 PID 应判 alive，实测 ${JSON.stringify((await transportOf(rig)).producer)}`);
  } finally { stopRig(rig); }
});

test('PROD-2 杀之即死（增量路径＋≤5s 验收＋derive 非空过链接）：杀 PID → ≤5s producer=dead，且经 derive 真的翻 REC＋死相', async () => {
  const victim = spawn('sleep', ['300'], { stdio: 'ignore' });
  const rig = await startRig(() => { /* 起动时 spool 为空——走增量 poll 路径 */ });
  try {
    spoolStartLine(rig.home, realpathSync(rig.tape), victim.pid!, psCommand(victim.pid!));
    assert.ok(await waitProducer(rig, 'alive', 8000), 'sleep 替身报到后应判 alive（增量路径）');
    victim.kill('SIGKILL');
    const t0 = Date.now();
    assert.ok(await waitProducer(rig, 'dead', 7000), '杀替身后应判 dead');
    const elapsed = Date.now() - t0;
    assert.ok(elapsed <= 5000, `REC 熄判据须 ≤5s（轮询 2s 级），实测 ${elapsed}ms`);
    // 非空过链接（必修 #1·金测侧）：serve 快照缺 power/link（页侧四源），故补齐录制语境后
    // 断言 producer 是唯一变量真的驱动 REC——alive→REC 亮，dead→REC 灭＋死相 dead。
    const recCtx = { power: 'on', sourceKind: 'live', phase: 'PLAYING', link: 'live', pendingAsk: false, done: false };
    assert.equal(deriveMachineState({ ...recCtx, producer: 'alive' }).recording, true, '杀前语境 producer=alive → REC 亮');
    const dead = deriveMachineState({ ...recCtx, producer: 'dead' });
    assert.equal(dead.recording, false, '杀后 producer=dead → REC 灭（producer 因子真的关掉 REC，非仅字段翻转）');
    assert.equal(dead.signalCue, 'dead', '杀后死相=dead（Source Gone 族）');
  } finally {
    try { victim.kill('SIGKILL'); } catch { /* 已亡 */ }
    stopRig(rig);
  }
});

test('PROD-3 PID 转租防护：pid 活着但 command 对表不符 → unknown（null），永不谎报活', async () => {
  const rig = await startRig((home, tape) => {
    spoolStartLine(home, tape, process.pid, '/usr/bin/claude 当年的进程（已被 OS 转租）');
  });
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const t = await transportOf(rig);
    assert.equal(t.producer, null, `转租 PID 应判 unknown，实测 ${JSON.stringify(t.producer)}`);
  } finally { stopRig(rig); }
});

test('PROD-4 无 PID＝unknown：钩子爬链失败（pid:null）→ null——安静思考≠死亡，无硬证据不判死', async () => {
  const rig = await startRig((home, tape) => {
    spoolStartLine(home, tape, null, null);
  });
  try {
    await new Promise((r) => setTimeout(r, 2500));
    const t = await transportOf(rig);
    assert.equal(t.producer, null, `无 PID 应判 unknown，实测 ${JSON.stringify(t.producer)}`);
    assert.equal(t.live, true, 'live 带照常上机（unknown 不碰 transport 其余因子）');
  } finally { stopRig(rig); }
});

test('PROD-5 收工即熄（ended）：session-end 行到 → producer=ended——SIGTERM 优雅退同路（善终非死相）', async () => {
  const victim = spawn('sleep', ['300'], { stdio: 'ignore' });
  const rig = await startRig((home, tape) => {
    spoolStartLine(home, tape, victim.pid!, psCommand(victim.pid!));
  });
  try {
    assert.ok(await waitProducer(rig, 'alive', 6000), '报到后 alive');
    // session-end 行（钩子在 SIGTERM/自然完成时都会发）——transcriptPath 同键
    appendFileSync(join(rig.home, 'spool', 'events.ndjson'), JSON.stringify({
      v: 1, at: Date.now(), kind: 'session-end', sessionId: 'prod-test',
      transcriptPath: realpathSync(rig.tape), reason: 'other',
    }) + '\n');
    assert.ok(await waitProducer(rig, 'ended', 6000), `session-end 后应判 ended，实测 ${JSON.stringify((await transportOf(rig)).producer)}`);
    // ended 经 derive：REC 熄但无死相（善终不是死）
    const recCtx = { power: 'on', sourceKind: 'live', phase: 'PLAYING', link: 'live', pendingAsk: false, done: false };
    const ended = deriveMachineState({ ...recCtx, producer: 'ended' });
    assert.equal(ended.recording, false, 'ended → REC 灭（收工不再录）');
    assert.equal(ended.signalCue, null, 'ended → 无死相（善终不打 Source Gone）');
  } finally {
    try { victim.kill('SIGKILL'); } catch { /* 已亡 */ }
    stopRig(rig);
  }
});

test('PROD-6 终态持久＋复活（席一 D2 复审 #3）：session-end→ended 持久不自退回 null；同 transcript 新 session-start→复活 alive', async () => {
  const victim = spawn('sleep', ['300'], { stdio: 'ignore' });
  const rig = await startRig((home, tape) => { spoolStartLine(home, tape, victim.pid!, psCommand(victim.pid!)); });
  try {
    assert.ok(await waitProducer(rig, 'alive', 6000), '报到 alive');
    appendFileSync(join(rig.home, 'spool', 'events.ndjson'), JSON.stringify({ v: 1, at: Date.now(), kind: 'session-end', sessionId: 'prod-test', transcriptPath: realpathSync(rig.tape), reason: 'other' }) + '\n');
    assert.ok(await waitProducer(rig, 'ended', 6000), 'session-end→ended');
    await new Promise((r) => setTimeout(r, 3500));   // 持久：等几秒不得自退回 null/alive（避已收工重亮 REC）
    assert.equal((await transportOf(rig)).producer, 'ended', 'ended 持久（不退回 null）');
    const v2 = spawn('sleep', ['300'], { stdio: 'ignore' });   // 复活：同 transcript 新 session-start（新活 PID）
    spoolStartLine(rig.home, realpathSync(rig.tape), v2.pid!, psCommand(v2.pid!));
    assert.ok(await waitProducer(rig, 'alive', 6000), '新 session-start→复活 alive（复活唯一通道）');
    try { v2.kill('SIGKILL'); } catch { /* 已亡 */ }
  } finally { try { victim.kill('SIGKILL'); } catch { /* 已亡 */ } stopRig(rig); }
});

test('PROD-7 SIGTERM 竞态·善终全程不闪 dead（席一 D2 复审 #1）：session-end 落盘＋PID 消失→ended，轨迹绝无 dead', async () => {
  const victim = spawn('sleep', ['300'], { stdio: 'ignore' });
  const rig = await startRig((home, tape) => { spoolStartLine(home, tape, victim.pid!, psCommand(victim.pid!)); });
  try {
    assert.ok(await waitProducer(rig, 'alive', 6000), '报到 alive');
    // 模拟优雅终止：钩子先写 session-end 落盘，进程随即退出（杀 PID）——宽限窗须判 ended，全程零 dead
    appendFileSync(join(rig.home, 'spool', 'events.ndjson'), JSON.stringify({ v: 1, at: Date.now(), kind: 'session-end', sessionId: 'prod-test', transcriptPath: realpathSync(rig.tape), reason: 'other' }) + '\n');
    victim.kill('SIGKILL');
    const seen = new Set<unknown>(); let reachedEnded = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {   // 高频采全轨迹
      const p = (await transportOf(rig)).producer; seen.add(p);
      if (p === 'ended') { reachedEnded = true; break; }
      await new Promise((r) => setTimeout(r, 150));
    }
    assert.ok(reachedEnded, `善终应判 ended，轨迹=${[...seen].join('→')}`);
    assert.ok(!seen.has('dead'), `善终全程不得闪 dead（宽限窗先扫 session-end 再判死），轨迹=${[...seen].join('→')}`);
  } finally { try { victim.kill('SIGKILL'); } catch { /* 已亡 */ } stopRig(rig); }
});

test('PROD-8 代际隔离（席一 D2 复审二·issue 1）：会话 A 死后 B 上代际复活，旧 A 的 session-end 绝不覆盖新 B 的 alive', async () => {
  const vA = spawn('sleep', ['300'], { stdio: 'ignore' });
  const rig = await startRig(() => { /* 空 spool·下面手写 session-start */ });
  try {
    const tk = realpathSync(rig.tape);
    mkdirSync(join(rig.home, 'spool'), { recursive: true });
    const ev = (o: Record<string, unknown>) => appendFileSync(join(rig.home, 'spool', 'events.ndjson'), JSON.stringify({ v: 1, at: Date.now(), ...o }) + '\n');
    ev({ kind: 'session-start', sessionId: 'sess-A', transcriptPath: tk, source: 'startup', pid: vA.pid, pidCommand: psCommand(vA.pid!) });
    assert.ok(await waitProducer(rig, 'alive', 8000), 'A 报到 alive');
    vA.kill('SIGKILL');
    assert.ok(await waitProducer(rig, 'dead', 8000), 'A 猝死 dead');
    // B 上机（同 transcript·新 PID·新 sessionId）→ 新代际·复活 alive（B 的 session-start 覆盖 A 的 terminal）
    const vB = spawn('sleep', ['300'], { stdio: 'ignore' });
    ev({ kind: 'session-start', sessionId: 'sess-B', transcriptPath: tk, source: 'startup', pid: vB.pid, pidCommand: psCommand(vB.pid!) });
    assert.ok(await waitProducer(rig, 'alive', 8000), 'B 上代际 → 复活 alive');
    // 迟到的 A 的 session-end（旧 sessionId）——代际隔离，绝不熄 B
    ev({ kind: 'session-end', sessionId: 'sess-A', transcriptPath: tk, reason: 'other' });
    const seen = new Set<unknown>(); const t0 = Date.now();
    while (Date.now() - t0 < 5000) { seen.add((await transportOf(rig)).producer); await new Promise((r) => setTimeout(r, 200)); }
    assert.equal((await transportOf(rig)).producer, 'alive', `B 必须仍 alive（旧 A 的 session-end 不覆盖新 B），窗内轨迹=${[...seen].join('→')}`);
    try { vB.kill('SIGKILL'); } catch { /* 已亡 */ }
  } finally { try { vA.kill('SIGKILL'); } catch { /* 已亡 */ } stopRig(rig); }
});
