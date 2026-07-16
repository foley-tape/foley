// 工单 4 ATF：零会话首分钟。
// 需求正文：audit/seat1-wo4-atf/ZERO_SESSION_FIRST_MINUTE_ATF.md
//
// 全套均为隔离集成：HOME/FOLEY_HOME/CLAUDE_CONFIG_DIR/FOLEY_PROJECTS/
// FOLEY_RUNS_DIR/TMPDIR 全指临时根；不碰真实 ~/.claude、~/.foley 或用户会话。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const fixture = join(here, 'fixtures', 'unknown-tool.jsonl');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Transport = {
  phase: string;
  loaded: string | null;
  live: boolean;
  epoch: number;
};
type Rig = {
  root: string;
  home: string;
  projects: string;
  claude: string;
  runs: string;
  base: string;
  child: ChildProcess;
  stdout: string[];
  stderr: string[];
};

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitFor<T>(
  label: string,
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs = 8000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      last = await read();
      if (accept(last)) return last;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`${label} 超时；last=${JSON.stringify(last)} error=${String(lastError ?? '')}`);
}

async function startRig(seed?: (rig: Omit<Rig, 'base' | 'child' | 'stdout' | 'stderr'>) => void): Promise<Rig> {
  const root = mkdtempSync(join(tmpdir(), 'foley-wo4-atf-'));
  const home = join(root, 'foley');
  const projects = join(root, 'projects');
  const claude = join(root, 'claude');
  const runs = join(root, 'runs');
  for (const dir of [home, projects, claude, runs]) mkdirSync(dir, { recursive: true });
  seed?.({ root, home, projects, claude, runs });
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const stdout: string[] = [];
  const stderr: string[] = [];
  const child = spawn(process.execPath, [join(repoRoot, 'stage', 'serve.mjs'), String(port)], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOME: root,
      FOLEY_HOME: home,
      CLAUDE_CONFIG_DIR: claude,
      FOLEY_PROJECTS: projects,
      FOLEY_RUNS_DIR: runs,
      TMPDIR: root,
    },
  });
  child.stdout?.on('data', (chunk) => stdout.push(String(chunk)));
  child.stderr?.on('data', (chunk) => stderr.push(String(chunk)));
  const rig = { root, home, projects, claude, runs, base, child, stdout, stderr };
  await waitFor('serve 监听', async () => stdout.join(''), (text) => text.includes('stage @'), 8000)
    .catch(async (error) => {
      await stopRig(rig);
      throw new Error(`${error}\nstdout=${stdout.join('')}\nstderr=${stderr.join('')}`);
    });
  return rig;
}

async function stopRig(rig: Rig): Promise<void> {
  if (rig.child.exitCode === null && rig.child.signalCode === null) {
    try { process.kill(-(rig.child.pid ?? 0), 'SIGTERM'); } catch { rig.child.kill('SIGTERM'); }
    await Promise.race([once(rig.child, 'exit'), sleep(1200)]);
  }
  if (rig.child.exitCode === null && rig.child.signalCode === null) {
    try { process.kill(-(rig.child.pid ?? 0), 'SIGKILL'); } catch { rig.child.kill('SIGKILL'); }
    await Promise.race([once(rig.child, 'exit'), sleep(500)]);
  }
  rmSync(rig.root, { recursive: true, force: true });
}

async function json<T>(base: string, path: string): Promise<T> {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, `${path} 应 200`);
  return response.json() as Promise<T>;
}

const transport = (rig: Rig) => json<Transport>(rig.base, '/transport');

async function liveStatus(rig: Rig): Promise<number> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 1500);
  try {
    const response = await fetch(rig.base + '/live', { signal: ac.signal });
    const status = response.status;
    ac.abort();
    return status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

describe('工单 4 ATF · 零会话首分钟', () => {
  test('ATF-W4-01 空 FOLEY_PROJECTS 自动上厂带，不伪装 dead LIVE/CLI 故障', async () => {
    const rig = await startRig();
    try {
      const rack = await waitFor(
        '厂带进入 PLAYING',
        () => json<{ rack: { id: string; kind: string }[]; transport: Transport }>(rig.base, '/rack'),
        (value) => value.transport.phase === 'PLAYING',
      );
      const loaded = rack.rack.find((item) => item.id === rack.transport.loaded);
      assert.ok(loaded, `上机件必须存在于 rack：${JSON.stringify(rack.transport)}`);
      assert.equal(loaded.kind, 'demo', '空会话应自动上厂带，而不是 live');
      assert.equal(rack.transport.live, false, '厂带不得伪装 live');
      const logs = rig.stderr.join('');
      assert.doesNotMatch(logs, /ENOENT|--latest[^\n]*没有 JSONL|\n\s*at\s+\S+/,
        `空目录属于正常首启，不得吐 CLI 原始故障：\n${logs}`);
    } finally {
      await stopRig(rig);
    }
  });

  test('ATF-W4-02 declinedAt 必须穿透 /onboard/status', async () => {
    const declinedAt = 1_783_900_000_000;
    const rig = await startRig(({ home }) => {
      writeFileSync(join(home, 'onboard.json'), JSON.stringify({ declinedAt }) + '\n');
    });
    try {
      const status = await json<{ wired: boolean; declined?: boolean }>(rig.base, '/onboard/status');
      assert.equal(status.declined, true, '持久拒绝必须成为状态 API 的明确字段');
    } finally {
      await stopRig(rig);
    }
  });

  test('ATF-W4-02B 页面必须消费 declined，禁止再挂接线单', () => {
    const main = readFileSync(join(repoRoot, 'stage', 'js', 'main.js'), 'utf8');
    assert.ok(/st\?\.declined/.test(main),
      '页面接线状态机必须读取 /onboard/status.declined；sessionStorage 不能替代持久拒绝');
    assert.ok(/declined[\s\S]{0,240}(?:mountWireTag|wire)/.test(main),
      'declined 分支必须在挂接线单之前参与裁决');
  });

  test('ATF-W4-03 同一 serve 先厂带、后会话：自动拉起 live 并换带，无需刷新', async () => {
    const rig = await startRig();
    try {
      const initial = await waitFor(
        '初始厂带',
        () => transport(rig),
        (value) => value.phase === 'PLAYING' && value.live === false && !!value.loaded,
      );
      const sessionDir = join(rig.projects, '-Users-atf-late');
      mkdirSync(sessionDir, { recursive: true });
      writeFileSync(join(sessionDir, 'late-session.jsonl'), readFileSync(fixture));

      await waitFor('live 子进程后至拉起', () => liveStatus(rig), (status) => status === 200, 10000);
      const later = await waitFor(
        'transport 自动转 live',
        () => transport(rig),
        (value) => value.phase === 'PLAYING' && value.live === true && value.loaded === 'live',
        10000,
      );
      assert.equal(later.epoch, initial.epoch, '必须在同一 serve 纪元内完成，不能靠重启/刷新过关');
    } finally {
      await stopRig(rig);
    }
  });
});
