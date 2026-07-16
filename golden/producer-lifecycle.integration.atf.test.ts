// Producer 生命周期 ATF · 极薄 serve 集成层（席一著作权）。
// 工装纪律：合成 PID＋合成 transcript＋tmp 沙箱；无浏览器、无真 Claude、无仓内 runs 写入。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';

type ProducerValue = null | 'alive' | 'dead' | 'ended';
type Transport = {
  phase?: string;
  live?: boolean;
  producer?: ProducerValue;
  producerAtf?: {
    phase?: string;
    incarnation?: string | null;
    producerEpoch?: number;
    generation?: number;
    watchEpoch?: number;
    lastEventId?: string | null;
    bootHeld?: boolean;
  };
};
type SpoolEvent = {
  kind: 'session-start' | 'session-end';
  producerEpoch: number;
  sessionId: string;
  incarnation: string;
  source?: string;
  reason?: string;
  pid?: number | null;
  pidCommand?: string | null;
};
type ServeHandle = {
  child: ChildProcess;
  port: number;
  base: string;
  logs: string[];
};
type Rig = {
  root: string;
  home: string;
  projects: string;
  runs: string;
  userHome: string;
  claudeHome: string;
  tmp: string;
  trapBin: string;
  trapFile: string;
  tape: string;
  spool: string;
  at: number;
  victims: ChildProcess[];
  workers: ChildProcess[];
  fastTimers: boolean;
  serve?: ServeHandle;
};
type SyntheticProducer = {
  child: ChildProcess;
  send(payload: Record<string, unknown>): Promise<void>;
  stop(): Promise<void>;
};

const sourceRoot = resolve(process.env.FOLEY_ATF_REPO ?? process.cwd());
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const trackedChildren = new Map<ChildProcess, boolean>();

function trackChild(child: ChildProcess, processGroup: boolean): ChildProcess {
  trackedChildren.set(child, processGroup);
  if (!processGroup) child.once('exit', () => trackedChildren.delete(child));
  return child;
}

function makeSandboxRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'foley-producer-atf-repo-'));
  for (const entry of ['stage', 'cli', 'engine', 'protocol', 'adapters', 'sound']) {
    const src = join(sourceRoot, entry);
    if (existsSync(src)) cpSync(src, join(root, entry), { recursive: true });
  }
  for (const file of ['package.json', 'params.json', 'verdict.json', 'sweep.json', 'sound-params.json']) {
    const src = join(sourceRoot, file);
    if (existsSync(src)) cpSync(src, join(root, file));
  }
  return root;
}

function makeRig(options: { fastTimers?: boolean } = {}): Rig {
  const root = mkdtempSync(join(tmpdir(), 'foley-producer-atf-rig-'));
  const home = join(root, 'foley');
  const projects = join(root, 'projects');
  const runs = join(root, 'runs');
  const userHome = join(root, 'user-home');
  const claudeHome = join(root, 'claude');
  const tmp = join(root, 'tmp');
  const trapBin = join(root, 'bin');
  const trapFile = join(root, 'real-claude-invoked');
  const pdir = join(projects, '-producer-atf');
  for (const dir of [home, projects, runs, userHome, claudeHome, tmp, trapBin, pdir, join(home, 'spool')]) {
    mkdirSync(dir, { recursive: true });
  }
  const trap = join(trapBin, 'claude');
  writeFileSync(trap, '#!/bin/sh\nprintf invoked >> \"$FOLEY_ATF_CLAUDE_TRAP\"\nexit 97\n');
  chmodSync(trap, 0o755);
  const tape = join(pdir, 'producer-atf.jsonl');
  const now = Date.now() - 10000;
  const line = (n: number): string => JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    userType: 'external',
    cwd: '/tmp/producer-atf',
    sessionId: 's',
    version: 'atf',
    type: 'assistant',
    timestamp: new Date(now + n * 1000).toISOString(),
    uuid: `atf-${n}`,
    message: {
      id: `m-${n}`,
      type: 'message',
      role: 'assistant',
      model: 'synthetic',
      content: [{ type: 'tool_use', id: `tu-${n}`, name: 'Bash', input: { command: `echo ${n}` } }],
    },
  });
  writeFileSync(tape, `${line(1)}\n${line(2)}\n`);
  return {
    root,
    home,
    projects,
    runs,
    userHome,
    claudeHome,
    tmp,
    trapBin,
    trapFile,
    tape: realpathSync(tape),
    spool: join(home, 'spool', 'events.ndjson'),
    at: Date.now(),
    victims: [],
    workers: [],
    fastTimers: options.fastTimers ?? false,
  };
}

function appendEvent(rig: Rig, event: SpoolEvent): string {
  const eventId = randomUUID();
  appendFileSync(rig.spool, JSON.stringify({
    v: 2,
    at: ++rig.at,
    eventId,
    transcriptPath: rig.tape,
    ...event,
  }) + '\n');
  return eventId;
}

function psCommand(pid: number): string {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 1500,
    }).trim();
  } catch {
    return '';
  }
}

function spawnVictim(rig: Rig): ChildProcess {
  const child = trackChild(
    spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }),
    false,
  );
  rig.victims.push(child);
  return child;
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const port = address.port;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function transportOf(base: string): Promise<Transport | null> {
  try {
    const response = await fetch(`${base}/transport`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as Transport;
  } catch {
    return null;
  }
}

async function waitTransport(
  base: string,
  predicate: (transport: Transport) => boolean,
  timeoutMs = 8000,
): Promise<Transport> {
  const started = Date.now();
  let last: Transport | null = null;
  while (Date.now() - started < timeoutMs) {
    last = await transportOf(base);
    if (last && predicate(last)) return last;
    await sleep(100);
  }
  assert.fail(`等待 transport 条件超时 ${timeoutMs}ms；末态=${JSON.stringify(last)}`);
}

function processGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalChild(child: ChildProcess, processGroup: boolean, signal: NodeJS.Signals): void {
  try {
    if (processGroup && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch { /* 已退出 */ }
}

async function stopChild(child: ChildProcess | undefined, processGroup = false): Promise<void> {
  if (!child) return;
  const pid = child.pid;
  const alive = (): boolean => processGroup && pid
    ? processGroupAlive(pid)
    : child.exitCode === null && child.signalCode === null;
  if (!alive()) {
    trackedChildren.delete(child);
    return;
  }

  signalChild(child, processGroup, 'SIGTERM');
  const termDeadline = Date.now() + 1500;
  while (alive() && Date.now() < termDeadline) await sleep(25);
  if (alive()) {
    signalChild(child, processGroup, 'SIGKILL');
    const killDeadline = Date.now() + 1500;
    while (alive() && Date.now() < killDeadline) await sleep(25);
  }
  assert.equal(alive(), false, `子进程${processGroup ? '组' : ''}未收尸：pid=${pid ?? 'unknown'}`);
  trackedChildren.delete(child);
}

async function startServe(
  sandboxRepo: string,
  rig: Rig,
  options: { waitForPlaying?: boolean; bootHold?: boolean } = {},
): Promise<ServeHandle> {
  const port = await freePort();
  const logs: string[] = [];
  const child = trackChild(
    spawn(process.execPath, [
      join(sandboxRepo, 'stage', 'serve.mjs'),
      String(port),
      '--raw',
      rig.tape,
    ], {
      cwd: sandboxRepo,
      detached: true,
      env: {
        ...process.env,
        PATH: `${rig.trapBin}:${process.env.PATH ?? ''}`,
        HOME: rig.userHome,
        CLAUDE_CONFIG_DIR: rig.claudeHome,
        FOLEY_HOME: rig.home,
        FOLEY_PROJECTS: rig.projects,
        FOLEY_RUNS_DIR: rig.runs,
        FOLEY_ATF: '1',
        FOLEY_ATF_CLAUDE_TRAP: rig.trapFile,
        ...(options.bootHold ? { FOLEY_ATF_BOOT_HOLD: '1' } : {}),
        ...(rig.fastTimers ? {
          FOLEY_PRODUCER_POLL_MS: '100',
          FOLEY_PRODUCER_GRACE_MS: '1000',
        } : {}),
        TMPDIR: rig.tmp,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
    true,
  );
  child.stdout?.on('data', (data) => logs.push(String(data)));
  child.stderr?.on('data', (data) => logs.push(String(data)));
  const handle = { child, port, base: `http://127.0.0.1:${port}`, logs };
  rig.serve = handle;

  const started = Date.now();
  while (Date.now() - started < 10000) {
    if (child.exitCode !== null) {
      assert.fail(`serve 提前退出 ${child.exitCode}：\n${logs.join('').slice(-2000)}`);
    }
    const transport = await transportOf(handle.base);
    if (transport && (options.waitForPlaying === false || transport.phase === 'PLAYING')) return handle;
    await sleep(100);
  }
  assert.fail(`serve 未进入 PLAYING：\n${logs.join('').slice(-2000)}`);
}

async function stopRig(rig: Rig): Promise<void> {
  await stopChild(rig.serve?.child, true);
  for (const worker of rig.workers) await stopChild(worker, true);
  for (const victim of rig.victims) await stopChild(victim);
  rmSync(rig.root, { recursive: true, force: true });
}

async function startSyntheticProducer(
  sandboxRepo: string,
  rig: Rig,
  label: string,
): Promise<SyntheticProducer> {
  const batch = join(rig.tmp, `producer-${label}`);
  mkdirSync(batch, { recursive: true });
  const claude = join(batch, 'claude');
  symlinkSync(process.execPath, claude);
  const hookUrl = pathToFileURL(join(sandboxRepo, 'cli', 'hook.ts')).href;
  const runner = join(batch, 'drive-hooks.mjs');
  writeFileSync(runner, `
    import { spawnSync } from 'node:child_process';
    import { createInterface } from 'node:readline';
    const hookUrl = process.argv[2];
    const entry = 'import { runHook } from ' + JSON.stringify(hookUrl) + '; runHook([]);';
    process.stdout.write(JSON.stringify({ ready: true }) + '\\n');
    const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line) continue;
      const payload = JSON.parse(line);
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', entry], {
        input: JSON.stringify(payload),
        encoding: 'utf8',
        env: process.env,
        timeout: 5000,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
      });
      const ok = !r.error && r.status === 0;
      process.stdout.write(JSON.stringify({
        ok,
        status: r.status,
        signal: r.signal,
        error: r.error?.message,
        stderr: String(r.stderr || '').slice(-1000),
      }) + '\\n');
    }
  `);

  const child = trackChild(
    spawn(claude, [runner, hookUrl], {
      cwd: sandboxRepo,
      detached: true,
      env: {
        ...process.env,
        PATH: `${rig.trapBin}:${process.env.PATH ?? ''}`,
        HOME: rig.userHome,
        CLAUDE_CONFIG_DIR: rig.claudeHome,
        FOLEY_HOME: rig.home,
        FOLEY_PROJECTS: rig.projects,
        FOLEY_RUNS_DIR: rig.runs,
        FOLEY_ATF: '1',
        FOLEY_ATF_CLAUDE_TRAP: rig.trapFile,
        TMPDIR: rig.tmp,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    }),
    true,
  );
  rig.workers.push(child);

  const messages: Array<Record<string, unknown>> = [];
  const waiters: Array<(message: Record<string, unknown>) => void> = [];
  const logs: string[] = [];
  let buffer = '';
  child.stderr?.on('data', (data) => logs.push(String(data)));
  child.stdout?.on('data', (data) => {
    buffer += String(data);
    let cut;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      if (!line) continue;
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(line) as Record<string, unknown>;
      } catch {
        message = { ok: false, error: `driver 非 JSON 输出：${line}` };
      }
      const waiter = waiters.shift();
      if (waiter) waiter(message);
      else messages.push(message);
    }
  });

  const nextMessage = async (timeoutMs = 7000): Promise<Record<string, unknown>> => {
    const queued = messages.shift();
    if (queued) return queued;
    return new Promise((resolveMessage, reject) => {
      const timer = setTimeout(() => {
        const index = waiters.indexOf(onMessage);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error(`合成 producer 等应答超时；logs=${logs.join('').slice(-1000)}`));
      }, timeoutMs);
      const onMessage = (message: Record<string, unknown>): void => {
        clearTimeout(timer);
        resolveMessage(message);
      };
      waiters.push(onMessage);
    });
  };

  const ready = await nextMessage(5000);
  assert.equal(ready.ready, true, `合成 producer 未 ready：${JSON.stringify(ready)} ${logs.join('')}`);

  return {
    child,
    send: async (payload: Record<string, unknown>): Promise<void> => {
      assert.equal(child.exitCode, null, `合成 producer 已退出：${logs.join('').slice(-1000)}`);
      await new Promise<void>((resolveWrite, reject) => {
        child.stdin?.write(`${JSON.stringify(payload)}\n`, (error) => error ? reject(error) : resolveWrite());
      });
      const ack = await nextMessage();
      assert.equal(ack.ok, true, `hook 执行失败：${JSON.stringify(ack)} ${logs.join('').slice(-1000)}`);
    },
    stop: async (): Promise<void> => {
      child.stdin?.end();
      if (child.exitCode === null && child.signalCode === null) {
        await Promise.race([once(child, 'exit'), sleep(500)]);
      }
      await stopChild(child, true);
    },
  };
}

function distinct(values: ProducerValue[]): ProducerValue[] {
  const out: ProducerValue[] = [];
  for (const value of values) if (out.at(-1) !== value) out.push(value);
  return out;
}

function openTransportTrace(base: string): {
  values: ProducerValue[];
  snapshots: Transport[];
  ready: Promise<void>;
  error: () => unknown;
  stop: () => Promise<void>;
} {
  const controller = new AbortController();
  const values: ProducerValue[] = [];
  const snapshots: Transport[] = [];
  let traceError: unknown = null;
  let readySettled = false;
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  const ready = new Promise<void>((resolvePromise, rejectPromise) => {
    resolveReady = resolvePromise;
    rejectReady = rejectPromise;
  });
  const done = (async () => {
    const response = await fetch(`${base}/live`, { signal: controller.signal });
    assert.equal(response.status, 200, `/live 应可订阅，实测 ${response.status}`);
    assert.ok(response.body, '/live 缺响应体');
    readySettled = true;
    resolveReady();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done: ended, value } = await reader.read();
      if (ended) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const lines = block.split('\n');
        if (!lines.some((line) => line === 'event: transport')) continue;
        const data = lines.filter((line) => line.startsWith('data: ')).map((line) => line.slice(6)).join('\n');
        if (!data) continue;
        const transport = JSON.parse(data) as Transport;
        snapshots.push(transport);
        values.push(transport.producer ?? null);
      }
    }
  })().catch((error: unknown) => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
    if (!(error instanceof Error && error.name === 'AbortError')) traceError = error;
  });
  return {
    values,
    snapshots,
    ready,
    error: () => traceError,
    stop: async () => {
      controller.abort();
      await done;
      if (traceError) throw traceError;
    },
  };
}

async function waitTrace(
  trace: ReturnType<typeof openTransportTrace>,
  predicate: (transport: Transport) => boolean,
  timeoutMs = 6000,
): Promise<Transport> {
  await trace.ready;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = trace.snapshots.find(predicate);
    if (found) return found;
    if (trace.error()) throw trace.error();
    await sleep(25);
  }
  assert.fail(`等待 SSE 轨迹条件超时；轨迹=${JSON.stringify(trace.snapshots)}`);
}

async function releaseBoot(base: string): Promise<void> {
  const response = await fetch(`${base}/__atf/release`, { method: 'POST' });
  assert.equal(response.status, 204, 'FOLEY_ATF_BOOT_HOLD=1 必须提供一次性 /__atf/release');
}

async function assertBootHeld(
  trace: ReturnType<typeof openTransportTrace>,
  base: string,
): Promise<void> {
  await waitTrace(
    trace,
    (x) => x.producerAtf?.bootHeld === true && x.phase !== 'PLAYING',
  );
  await sleep(250);
  const current = await transportOf(base);
  assert.equal(current?.producerAtf?.bootHeld, true, 'release 前 bootHeld 握手必须持续为真');
  assert.notEqual(current?.phase, 'PLAYING', 'release 前当前态不得进入 PLAYING');
  assert.equal(
    trace.snapshots.some((x) => x.phase === 'PLAYING'),
    false,
    `boot hold 释放前不得已发 PLAYING：${JSON.stringify(trace.snapshots)}`,
  );
}

function filesNamed(root: string, names: Set<string>): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (names.has(entry.name)) out.push(path);
    }
  };
  walk(root);
  return out.sort();
}

async function loadDerive(sandboxRepo: string): Promise<(state: Record<string, unknown>) => { recording: boolean }> {
  const file = join(sandboxRepo, 'stage', 'js', 'derive.js');
  assert.ok(existsSync(file), `ATF-REC 缺 producer→REC 投影正文：${file}`);
  const mod = await import(pathToFileURL(file).href + `?atf=${Date.now()}`) as {
    deriveMachineState?: (state: Record<string, unknown>) => { recording: boolean };
  };
  assert.equal(typeof mod.deriveMachineState, 'function');
  return mod.deriveMachineState!;
}

test('Producer lifecycle ATF · serve 集成', { timeout: 240000 }, async (t) => {
  const sandboxRepo = makeSandboxRepo();
  t.after(async () => {
    const cleanupErrors: string[] = [];
    for (const [child, processGroup] of [...trackedChildren]) {
      try {
        await stopChild(child, processGroup);
      } catch (error) {
        cleanupErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    rmSync(sandboxRepo, { recursive: true, force: true });
    assert.deepEqual(cleanupErrors, [], `ATF 全局收尸失败：${cleanupErrors.join('；')}`);
  });

  await t.test('ATF-I01 同-session 历史 End 不得把新代猝死判成 ended', { timeout: 30000 }, async () => {
    const rig = makeRig();
    let trace: ReturnType<typeof openTransportTrace> | null = null;
    try {
      const victim = spawnVictim(rig);
      assert.ok(victim.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: null, pidCommand: null,
      });
      appendEvent(rig, {
        kind: 'session-end', producerEpoch: 1, sessionId: 's', incarnation: 'A', reason: 'other',
      });
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 2, sessionId: 's', incarnation: 'B',
        source: 'resume', pid: victim.pid, pidCommand: psCommand(victim.pid),
      });
      const serve = await startServe(sandboxRepo, rig);
      const before = await waitTransport(serve.base, (x) => x.producer === 'alive');
      assert.equal(before.producer, 'alive', '杀前必须先真 alive，防空过');
      trace = openTransportTrace(serve.base);
      await waitTrace(trace, (x) => x.producer === 'alive');
      const aliveIndex = trace.snapshots.findIndex((x) => x.producer === 'alive');

      const derive = await loadDerive(sandboxRepo);
      const recContext = {
        power: 'on', sourceKind: 'live', phase: 'PLAYING', link: 'live',
        pendingAsk: false, done: false,
      };
      assert.equal(derive({ ...recContext, producer: 'alive' }).recording, true, '杀前 REC 必须真亮');

      const exited = once(victim, 'exit');
      victim.kill('SIGKILL');
      await exited;
      const killedAt = Date.now();
      const terminal = await waitTransport(
        serve.base,
        (x) => x.producer === 'dead' || x.producer === 'ended',
        7000,
      );
      assert.equal(terminal.producer, 'dead', 'B 无本代 End，必须 dead；不得捞 A 历史 End 判 ended');
      assert.ok(Date.now() - killedAt <= 5000, `猝死须 ≤5s，实测 ${Date.now() - killedAt}ms`);
      assert.equal(derive({ ...recContext, producer: terminal.producer }).recording, false, 'dead 必须熄 REC');
      await sleep(1200);
      assert.equal((await transportOf(serve.base))?.producer, 'dead', '结论后旧 callback 成熟仍须保持 dead');
      const trajectory = trace.snapshots.slice(aliveIndex).map((x) => x.producer ?? null);
      assert.deepEqual(
        distinct(trajectory),
        ['alive', 'dead'],
        `猝死全轨迹只能 alive→dead，不得闪 ended/null：${JSON.stringify(trajectory)}`,
      );
    } finally {
      try {
        if (trace) await trace.stop();
      } finally {
        await stopRig(rig);
      }
    }
  });

  await t.test('ATF-I02 dead 跨真实 serve 重启：订阅先于首个 PLAYING，首帧即 dead', { timeout: 40000 }, async () => {
    const rig = makeRig();
    let restartTrace: ReturnType<typeof openTransportTrace> | null = null;
    try {
      const victim = spawnVictim(rig);
      assert.ok(victim.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: victim.pid, pidCommand: psCommand(victim.pid),
      });
      let serve = await startServe(sandboxRepo, rig);
      await waitTransport(serve.base, (x) => x.producer === 'alive');
      victim.kill('SIGKILL');
      await waitTransport(serve.base, (x) => x.producer === 'dead', 7000);

      await stopChild(serve.child, true);
      rig.serve = undefined;
      serve = await startServe(sandboxRepo, rig, { waitForPlaying: false, bootHold: true });
      restartTrace = openTransportTrace(serve.base);
      await assertBootHeld(restartTrace, serve.base);
      await releaseBoot(serve.base);
      await waitTrace(restartTrace, (x) => x.phase === 'PLAYING', 8000);
      const firstPlaying = restartTrace.snapshots.find((x) => x.phase === 'PLAYING');
      assert.ok(firstPlaying, `重启后未捕获首个 PLAYING：${JSON.stringify(restartTrace.snapshots)}`);
      assert.equal(firstPlaying.producer, 'dead', '重启首个 PLAYING 必须已是 dead，不得先发 null/alive 再补');
      assert.equal(firstPlaying.producerAtf?.bootHeld, false, 'release 后首个 PLAYING 必须标记已放行');
      await restartTrace.stop();
      restartTrace = null;

      const successor = spawnVictim(rig);
      assert.ok(successor.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 2, sessionId: 's', incarnation: 'B',
        source: 'resume', pid: successor.pid, pidCommand: psCommand(successor.pid),
      });
      await waitTransport(serve.base, (x) => x.producer === 'alive', 8000);
    } finally {
      if (restartTrace) {
        try { await restartTrace.stop(); } catch { /* cleanup 继续 */ }
      }
      await stopRig(rig);
    }
  });

  await t.test('ATF-I02E ended 跨真实 serve 重启：首个 PLAYING 即 ended', { timeout: 35000 }, async () => {
    const rig = makeRig();
    let restartTrace: ReturnType<typeof openTransportTrace> | null = null;
    try {
      const victim = spawnVictim(rig);
      assert.ok(victim.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: victim.pid, pidCommand: psCommand(victim.pid),
      });
      let serve = await startServe(sandboxRepo, rig);
      await waitTransport(serve.base, (x) => x.producer === 'alive');
      appendEvent(rig, {
        kind: 'session-end', producerEpoch: 1, sessionId: 's', incarnation: 'A', reason: 'other',
      });
      await waitTransport(serve.base, (x) => x.producer === 'ended');

      await stopChild(serve.child, true);
      rig.serve = undefined;
      serve = await startServe(sandboxRepo, rig, { waitForPlaying: false, bootHold: true });
      restartTrace = openTransportTrace(serve.base);
      await assertBootHeld(restartTrace, serve.base);
      await releaseBoot(serve.base);
      await waitTrace(restartTrace, (x) => x.phase === 'PLAYING', 8000);
      const firstPlaying = restartTrace.snapshots.find((x) => x.phase === 'PLAYING');
      assert.equal(firstPlaying?.producer, 'ended', '重启首个 PLAYING 必须已恢复 ended');
      assert.equal(firstPlaying?.producerAtf?.bootHeld, false, 'release 后首个 PLAYING 必须标记已放行');
      await restartTrace.stop();
      restartTrace = null;

      const successor = spawnVictim(rig);
      assert.ok(successor.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 2, sessionId: 's', incarnation: 'B',
        source: 'resume', pid: successor.pid, pidCommand: psCommand(successor.pid),
      });
      await waitTransport(serve.base, (x) => x.producer === 'alive', 8000);
    } finally {
      if (restartTrace) {
        try { await restartTrace.stop(); } catch { /* cleanup 继续 */ }
      }
      await stopRig(rig);
    }
  });

  await t.test('ATF-I03 End 先到、PID 后亡：真实 SSE 去重轨迹严格 alive→ended', { timeout: 30000 }, async () => {
    const rig = makeRig();
    let trace: ReturnType<typeof openTransportTrace> | null = null;
    try {
      const victim = spawnVictim(rig);
      assert.ok(victim.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: victim.pid, pidCommand: psCommand(victim.pid),
      });
      const serve = await startServe(sandboxRepo, rig);
      await waitTransport(serve.base, (x) => x.producer === 'alive');
      trace = openTransportTrace(serve.base);
      await waitTrace(trace, (x) => x.producer === 'alive');

      appendEvent(rig, {
        kind: 'session-end', producerEpoch: 1, sessionId: 's', incarnation: 'A', reason: 'other',
      });
      await waitTransport(serve.base, (x) => x.producer === 'ended', 6000);
      const exited = once(victim, 'exit');
      victim.kill('SIGKILL');
      await exited;
      await sleep(5500); // 生产猝死帽为 5s；越过整顶帽后旧 watcher 仍不得把 ended 打成 dead

      const fromAlive = trace.values.slice(trace.values.indexOf('alive'));
      const sequence = distinct(fromAlive);
      assert.deepEqual(sequence, ['alive', 'ended'], `善终不得闪 dead/null，完整 producer 轨迹=${JSON.stringify(fromAlive)}`);
      assert.equal((await transportOf(serve.base))?.producer, 'ended');

      const derive = await loadDerive(sandboxRepo);
      const recContext = {
        power: 'on', sourceKind: 'live', phase: 'PLAYING', link: 'live',
        pendingAsk: false, done: false,
      };
      assert.equal(derive({ ...recContext, producer: 'alive' }).recording, true);
      assert.equal(derive({ ...recContext, producer: 'ended' }).recording, false);
    } finally {
      try {
        if (trace) await trace.stop();
      } finally {
        await stopRig(rig);
      }
    }
  });

  await t.test('ATF-I04 同-session 新代后迟到旧 End 必须按 incarnation 忽略', { timeout: 25000 }, async () => {
    const rig = makeRig();
    let trace: ReturnType<typeof openTransportTrace> | null = null;
    try {
      const a = spawnVictim(rig);
      assert.ok(a.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: a.pid, pidCommand: psCommand(a.pid),
      });
      const serve = await startServe(sandboxRepo, rig);
      await waitTransport(serve.base, (x) => x.producer === 'alive');

      const b = spawnVictim(rig);
      assert.ok(b.pid);
      const bStartId = appendEvent(rig, {
        kind: 'session-start', producerEpoch: 2, sessionId: 's', incarnation: 'B',
        source: 'resume', pid: b.pid, pidCommand: psCommand(b.pid),
      });
      await waitTransport(
        serve.base,
        (x) => x.producer === 'alive'
          && x.producerAtf?.phase === 'ALIVE'
          && x.producerAtf.incarnation === 'B'
          && x.producerAtf.lastEventId === bStartId,
        8000,
      );

      trace = openTransportTrace(serve.base);
      await waitTrace(
        trace,
        (x) => x.producerAtf?.phase === 'ALIVE' && x.producerAtf.incarnation === 'B',
      );
      const bIndex = trace.snapshots.findIndex(
        (x) => x.producerAtf?.phase === 'ALIVE' && x.producerAtf.incarnation === 'B',
      );
      const oldEndId = appendEvent(rig, {
        kind: 'session-end', producerEpoch: 1, sessionId: 's', incarnation: 'A', reason: 'other',
      });
      await waitTransport(
        serve.base,
        (x) => x.producerAtf?.lastEventId === oldEndId,
        6000,
      );
      await sleep(1200);
      const window = trace.snapshots.slice(bIndex);
      assert.ok(window.length > 0);
      assert.equal(
        window.every(
          (x) => x.producer === 'alive'
            && x.producerAtf?.phase === 'ALIVE'
            && x.producerAtf.incarnation === 'B',
        ),
        true,
        `迟到 A End 全窗不得熄／错投影 B：${JSON.stringify(window)}`,
      );
    } finally {
      try {
        if (trace) await trace.stop();
      } finally {
        await stopRig(rig);
      }
    }
  });

  await t.test('ATF-I05 默认 ATF 全隔离：live output 只进 tmp，真 Claude trap 零击发', { timeout: 25000 }, async () => {
    rmSync(join(sandboxRepo, 'runs'), { recursive: true, force: true });
    const rig = makeRig();
    try {
      const victim = spawnVictim(rig);
      assert.ok(victim.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: victim.pid, pidCommand: psCommand(victim.pid),
      });
      await startServe(sandboxRepo, rig);

      let expected: string[] = [];
      let escaped: string[] = [];
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        expected = filesNamed(rig.runs, new Set(['curve.csv', 'moments.csv']));
        escaped = filesNamed(join(sandboxRepo, 'runs'), new Set(['curve.csv', 'moments.csv']));
        if (expected.length >= 2 || escaped.length > 0) break;
        await sleep(100);
      }
      assert.equal(
        expected.length >= 2 && escaped.length === 0,
        true,
        `live output 必须只进 FOLEY_RUNS_DIR；tmp=${JSON.stringify(expected)} escaped=${JSON.stringify(escaped)}`,
      );
      assert.equal(existsSync(rig.trapFile), false, '默认 ATF 期间不得调用 PATH 中的真 Claude');
    } finally {
      await stopRig(rig);
    }
  });

  await t.test('ATF-I06 生产接线：同一存活父进程 resume 也须新 incarnation/producerEpoch', { timeout: 40000 }, async () => {
    const rig = makeRig();
    let overlapTrace: ReturnType<typeof openTransportTrace> | null = null;
    try {
      const producerA = await startSyntheticProducer(sandboxRepo, rig, 'A');
      await producerA.send({
        hook_event_name: 'SessionStart',
        session_id: 's',
        transcript_path: rig.tape,
        source: 'startup',
      });
      let events = readFileSync(rig.spool, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      const startA = events.find((event) => event.kind === 'session-start');
      assert.ok(startA, `hook 必须落 SessionStart：${JSON.stringify(events)}`);
      assert.equal(startA.pid, producerA.child.pid, 'hook 必须锁到合成 Claude 父 PID，不能锁自身 hook PID');
      const currentCommand = psCommand(producerA.child.pid!);
      assert.ok(
        String(startA.pidCommand).length >= 16 && currentCommand.startsWith(String(startA.pidCommand)),
        `hook 必须记录可复核的父进程命令指纹：stored=${String(startA.pidCommand)} current=${currentCommand}`,
      );
      assert.equal(typeof startA.incarnation, 'string', 'SessionStart spool 必须携 incarnation');
      assert.equal(typeof startA.producerEpoch, 'number', 'SessionStart spool 必须携可排序 producerEpoch');
      assert.equal(typeof startA.eventId, 'string', 'SessionStart spool 必须携唯一 eventId');

      const serve = await startServe(sandboxRepo, rig);
      await waitTransport(
        serve.base,
        (x) => x.producer === 'alive'
          && x.producerAtf?.phase === 'ALIVE'
          && x.producerAtf.incarnation === startA.incarnation
          && x.producerAtf.producerEpoch === startA.producerEpoch
          && x.producerAtf.lastEventId === startA.eventId,
        8000,
      );

      const producerB = await startSyntheticProducer(sandboxRepo, rig, 'B');
      await producerB.send({
        hook_event_name: 'SessionStart',
        session_id: 's',
        transcript_path: rig.tape,
        source: 'resume',
      });
      events = readFileSync(rig.spool, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      let starts = events.filter((event) => event.kind === 'session-start');
      assert.equal(starts.length, 2);
      const startB = starts[1]!;
      assert.equal(startB.pid, producerB.child.pid, '新父 hook 必须锁到新父 PID');
      assert.notEqual(startB.incarnation, startA.incarnation, '重叠新父必须产生新 incarnation');
      assert.ok(Number(startB.producerEpoch) > Number(startA.producerEpoch), '重叠新父 producerEpoch 必须递增');
      await waitTransport(
        serve.base,
        (x) => x.producer === 'alive'
          && x.producerAtf?.incarnation === startB.incarnation
          && x.producerAtf?.producerEpoch === startB.producerEpoch
          && x.producerAtf?.lastEventId === startB.eventId,
        8000,
      );
      overlapTrace = openTransportTrace(serve.base);
      await waitTrace(
        overlapTrace,
        (x) => x.producerAtf?.incarnation === startB.incarnation && x.producer === 'alive',
      );
      const bIndex = overlapTrace.snapshots.findIndex(
        (x) => x.producerAtf?.incarnation === startB.incarnation && x.producer === 'alive',
      );

      await producerA.send({
        hook_event_name: 'SessionEnd',
        session_id: 's',
        transcript_path: rig.tape,
        reason: 'other',
      });
      events = readFileSync(rig.spool, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      let ends = events.filter((event) => event.kind === 'session-end');
      assert.equal(ends.length, 1);
      const lateEndA = ends[0]!;
      assert.equal(lateEndA.incarnation, startA.incarnation, 'B 上代后 A 父 End 仍须找回 A incarnation');
      assert.equal(lateEndA.producerEpoch, startA.producerEpoch, 'B 上代后 A 父 End 仍须找回 A producerEpoch');
      await waitTransport(
        serve.base,
        (x) => x.producerAtf?.lastEventId === lateEndA.eventId,
        8000,
      );
      await sleep(500);
      const overlapWindow = overlapTrace.snapshots.slice(bIndex);
      assert.equal(
        overlapWindow.every(
          (x) => x.producer === 'alive'
            && x.producerAtf?.phase === 'ALIVE'
            && x.producerAtf.incarnation === startB.incarnation,
        ),
        true,
        `迟到 A End 消费后不得熄 B：${JSON.stringify(overlapWindow)}`,
      );
      await overlapTrace.stop();
      overlapTrace = null;

      await producerB.send({
        hook_event_name: 'SessionEnd',
        session_id: 's',
        transcript_path: rig.tape,
        reason: 'resume',
      });
      events = readFileSync(rig.spool, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      ends = events.filter((event) => event.kind === 'session-end');
      assert.equal(ends.length, 2);
      const resumeEndB = ends[1]!;
      assert.equal(resumeEndB.incarnation, startB.incarnation, 'resume End 必须绑定 B 旧 incarnation');
      assert.equal(resumeEndB.producerEpoch, startB.producerEpoch, 'resume End 必须绑定 B 旧 producerEpoch');
      await waitTransport(
        serve.base,
        (x) => x.producer === 'alive'
          && x.producerAtf?.incarnation === startB.incarnation
          && x.producerAtf?.lastEventId === resumeEndB.eventId,
        8000,
      );

      await producerB.send({
        hook_event_name: 'SessionStart',
        session_id: 's',
        transcript_path: rig.tape,
        source: 'resume',
      });
      events = readFileSync(rig.spool, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      starts = events.filter((event) => event.kind === 'session-start');
      assert.equal(starts.length, 3);
      const resumedB = starts[2]!;
      assert.equal(resumedB.pid, producerB.child.pid, '同父 resume 仍须锁回 B 父 PID');
      assert.notEqual(resumedB.incarnation, startB.incarnation, '同父 resume Start 必须产生新 incarnation');
      assert.ok(Number(resumedB.producerEpoch) > Number(startB.producerEpoch), '同父 resume producerEpoch 必须递增');
      await waitTransport(
        serve.base,
        (x) => x.producer === 'alive'
          && x.producerAtf?.incarnation === resumedB.incarnation
          && x.producerAtf?.producerEpoch === resumedB.producerEpoch
          && x.producerAtf?.lastEventId === resumedB.eventId,
        8000,
      );

      await producerB.send({
        hook_event_name: 'SessionEnd',
        session_id: 's',
        transcript_path: rig.tape,
        reason: 'other',
      });
      events = readFileSync(rig.spool, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
      ends = events.filter((event) => event.kind === 'session-end');
      assert.equal(ends.length, 3);
      const finalEndB = ends[2]!;
      assert.equal(finalEndB.incarnation, resumedB.incarnation, 'resume 后最终 End 必须绑定新 incarnation');
      assert.equal(finalEndB.producerEpoch, resumedB.producerEpoch, 'resume 后最终 End 必须绑定新 producerEpoch');
      await waitTransport(
        serve.base,
        (x) => x.producer === 'ended'
          && x.producerAtf?.incarnation === resumedB.incarnation
          && x.producerAtf?.lastEventId === finalEndB.eventId,
        8000,
      );

      const eventIds = events.map((event) => event.eventId);
      assert.equal(
        events.every((event) => Number.isSafeInteger(event.producerEpoch) && Number(event.producerEpoch) > 0),
        true,
        '每枚 hook 行的 producerEpoch 必须是正安全整数',
      );
      assert.equal(
        eventIds.every(
          (id) => typeof id === 'string'
            && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id),
        ),
        true,
        '每枚 hook eventId 必须是 UUIDv4',
      );
      assert.equal(new Set(eventIds).size, eventIds.length, '同案所有 hook eventId 必须两两唯一');

      const connectFile = join(sandboxRepo, 'cli', 'connect.ts');
      const connect = await import(pathToFileURL(connectFile).href + `?atf=${Date.now()}`) as {
        wiredIn?: (settings: unknown) => boolean;
      };
      assert.equal(typeof connect.wiredIn, 'function', 'connect 必须导出 wiredIn() 供迁移闸复用');
      const mine = { type: 'command', command: 'node /tmp/foley/cli/hook.ts' };
      const both = { hooks: {
        SessionStart: [{ hooks: [mine] }],
        SessionEnd: [{ hooks: [mine] }],
      } };
      assert.equal(connect.wiredIn!(both), true, 'SessionStart＋SessionEnd 两钩子俱在才算接线完成');
      assert.equal(connect.wiredIn!({ hooks: { SessionStart: both.hooks.SessionStart } }), false, '只装 SessionStart 不算齐');
      assert.equal(connect.wiredIn!({ hooks: { SessionEnd: both.hooks.SessionEnd } }), false, '只装 SessionEnd 不算齐');
    } finally {
      try {
        if (overlapTrace) await overlapTrace.stop();
      } finally {
        await stopRig(rig);
      }
    }
  });

  await t.test('ATF-I07 A 在 GRACE 时 B 上代：旧 A resolver 成熟不得覆盖 B', { timeout: 20000 }, async () => {
    const rig = makeRig({ fastTimers: true });
    let trace: ReturnType<typeof openTransportTrace> | null = null;
    try {
      const a = spawnVictim(rig);
      assert.ok(a.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: a.pid, pidCommand: psCommand(a.pid),
      });
      const serve = await startServe(sandboxRepo, rig);
      await waitTransport(
        serve.base,
        (x) => x.producer === 'alive'
          && x.producerAtf?.phase === 'ALIVE'
          && x.producerAtf.incarnation === 'A',
      );
      a.kill('SIGKILL');
      await waitTransport(
        serve.base,
        (x) => x.producer === 'alive'
          && x.producerAtf?.phase === 'GRACE'
          && x.producerAtf.incarnation === 'A',
        4000,
      );
      trace = openTransportTrace(serve.base);
      await waitTrace(
        trace,
        (x) => x.producerAtf?.phase === 'GRACE' && x.producerAtf.incarnation === 'A',
      );

      const b = spawnVictim(rig);
      assert.ok(b.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 2, sessionId: 's', incarnation: 'B',
        source: 'resume', pid: b.pid, pidCommand: psCommand(b.pid),
      });
      await waitTrace(
        trace,
        (x) => x.producer === 'alive'
          && x.producerAtf?.phase === 'ALIVE'
          && x.producerAtf.incarnation === 'B',
        4000,
      );
      const bIndex = trace.snapshots.findIndex(
        (x) => x.producerAtf?.phase === 'ALIVE' && x.producerAtf.incarnation === 'B',
      );
      await sleep(1600); // 测试显式把 poll/grace 钉为 100/1000ms；让旧 A resolver 越过全部 deadline
      const window = trace.snapshots.slice(bIndex);
      assert.equal(
        window.every(
          (x) => x.producer === 'alive'
            && x.producerAtf?.phase === 'ALIVE'
            && x.producerAtf.incarnation === 'B',
        ),
        true,
        `B 上代后全窗不得被旧 A resolver 覆盖：${JSON.stringify(window)}`,
      );
    } finally {
      try {
        if (trace) await trace.stop();
      } finally {
        await stopRig(rig);
      }
    }
  });

  await t.test('ATF-I08 GRACE 中 eject：旧 timer 成熟后仍 EMPTY/null', { timeout: 20000 }, async () => {
    const rig = makeRig({ fastTimers: true });
    let trace: ReturnType<typeof openTransportTrace> | null = null;
    try {
      const victim = spawnVictim(rig);
      assert.ok(victim.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: victim.pid, pidCommand: psCommand(victim.pid),
      });
      const serve = await startServe(sandboxRepo, rig);
      await waitTransport(
        serve.base,
        (x) => x.producerAtf?.phase === 'ALIVE' && x.producerAtf.incarnation === 'A',
      );
      victim.kill('SIGKILL');
      await waitTransport(
        serve.base,
        (x) => x.producerAtf?.phase === 'GRACE' && x.producerAtf.incarnation === 'A',
        4000,
      );
      trace = openTransportTrace(serve.base);
      await waitTrace(
        trace,
        (x) => x.producerAtf?.phase === 'GRACE' && x.producerAtf.incarnation === 'A',
      );

      const html = await fetch(`${serve.base}/index.html`).then((r) => r.text());
      const token = html.match(/<meta name="dub-token" content="([^"]+)">/)?.[1];
      assert.ok(token, 'ATF 无法读取本次 serve 写盘令牌');
      const eject = await fetch(`${serve.base}/transport/eject`, {
        method: 'POST',
        headers: { 'x-dub-token': token },
      });
      assert.equal(eject.status, 200);
      await waitTransport(serve.base, (x) => x.phase === 'EMPTY' && x.producer === null);
      await waitTrace(trace, (x) => x.phase === 'EMPTY' && x.producer === null);
      const emptyIndex = trace.snapshots.findIndex((x) => x.phase === 'EMPTY' && x.producer === null);
      await sleep(1600);
      const window = trace.snapshots.slice(emptyIndex);
      assert.equal(
        window.every((x) => x.phase === 'EMPTY' && x.producer === null),
        true,
        `eject 后全窗必须 EMPTY/null，旧 timer 不得复活：${JSON.stringify(window)}`,
      );
      const select = await fetch(`${serve.base}/transport/select`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-dub-token': token,
        },
        body: JSON.stringify({ tape: 'live' }),
      });
      assert.equal(select.status, 200);
      const reloaded = await waitTransport(serve.base, (x) => x.phase === 'PLAYING');
      assert.deepEqual(
        [
          reloaded.producer,
          reloaded.producerAtf?.phase,
          reloaded.producerAtf?.incarnation,
        ],
        [null, 'UNKNOWN', 'A'],
        'eject 后重插同带不得冒出旧 timer 暗写的 dead terminal；须回到 A/UNKNOWN 等 fresh verify',
      );
    } finally {
      try {
        if (trace) await trace.stop();
      } finally {
        await stopRig(rig);
      }
    }
  });

  await t.test('ATF-I09 adapter UNKNOWN：pid:null／错指纹不猜 alive，也不挂死亡 timer', { timeout: 20000 }, async () => {
    const rig = makeRig({ fastTimers: true });
    try {
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 1, sessionId: 's', incarnation: 'A',
        source: 'startup', pid: null, pidCommand: null,
      });
      const serve = await startServe(sandboxRepo, rig);
      await waitTransport(
        serve.base,
        (x) => x.producer === null
          && x.producerAtf?.phase === 'UNKNOWN'
          && x.producerAtf.incarnation === 'A',
        6000,
      );
      await sleep(1600);
      let afterTail = await transportOf(serve.base);
      assert.deepEqual(
        [afterTail?.producer, afterTail?.producerAtf?.phase, afterTail?.producerAtf?.incarnation],
        [null, 'UNKNOWN', 'A'],
        'pid:null 超过 death deadline 仍须 UNKNOWN/null',
      );

      const victim = spawnVictim(rig);
      assert.ok(victim.pid);
      appendEvent(rig, {
        kind: 'session-start', producerEpoch: 2, sessionId: 's', incarnation: 'B',
        source: 'resume', pid: victim.pid, pidCommand: 'definitely-not-this-process',
      });
      await waitTransport(
        serve.base,
        (x) => x.producer === null
          && x.producerAtf?.phase === 'UNKNOWN'
          && x.producerAtf.incarnation === 'B',
        6000,
      );
      await sleep(1600);
      afterTail = await transportOf(serve.base);
      assert.deepEqual(
        [afterTail?.producer, afterTail?.producerAtf?.phase, afterTail?.producerAtf?.incarnation],
        [null, 'UNKNOWN', 'B'],
        '存活 PID 但命令指纹不符，超过 deadline 仍须 UNKNOWN/null',
      );
    } finally {
      await stopRig(rig);
    }
  });

  await t.test('ATF-I10 工装自证：所有可写根均在 tmp，目标代码仅从沙箱执行', async () => {
    const repoReal = realpathSync(sandboxRepo);
    const tmpReal = realpathSync(tmpdir());
    assert.ok(basename(sandboxRepo).startsWith('foley-producer-atf-repo-'));
    assert.ok(repoReal.startsWith(`${tmpReal}/`), `沙箱仓必须位于系统 tmp：${repoReal}`);
    assert.notEqual(repoReal, realpathSync(sourceRoot));

    const rig = makeRig();
    try {
      const rootReal = realpathSync(rig.root);
      const rootPath = resolve(rig.root);
      assert.ok(rootReal.startsWith(`${tmpReal}/`), `rig 必须位于系统 tmp：${rootReal}`);
      for (const path of [
        rig.home,
        rig.projects,
        rig.runs,
        rig.userHome,
        rig.claudeHome,
        rig.tmp,
        rig.trapBin,
        rig.trapFile,
        rig.tape,
        rig.spool,
      ]) {
        const absolute = resolve(path);
        const lexicalInside = absolute === rootPath || absolute.startsWith(`${rootPath}/`);
        const realInside = existsSync(path)
          && (() => {
            const real = realpathSync(path);
            return real === rootReal || real.startsWith(`${rootReal}/`);
          })();
        assert.ok(
          lexicalInside || realInside,
          `可写根不得逃出本次 rig：${absolute}`,
        );
      }
    } finally {
      await stopRig(rig);
    }
  });
});
