// 席二 D2 金测：接线迁移锁（必修 #5）——connect 必须装 SessionEnd＋SessionStart 双钩子；
// 旧装仅 SessionEnd 视为「未齐」（心跳缺席则 REC 撒谎·NIGHT3 病），再 connect 一次幂等补齐。
// 隔离：CLAUDE_CONFIG_DIR + FOLEY_HOME 指 tmp（不碰真 ~/.claude）——须在 import connect 前置好
//       （connect.ts 于模块载入时从 env 定 SETTINGS 路径）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const claudeDir = mkdtempSync(join(tmpdir(), 'mig-claude-'));
const foleyHome = mkdtempSync(join(tmpdir(), 'mig-foley-'));
process.env.CLAUDE_CONFIG_DIR = claudeDir;
process.env.FOLEY_HOME = foleyHome;
const SETTINGS = join(claudeDir, 'settings.json');
const connect = await import('../cli/connect.ts');

type HookEntry = { type?: string; command?: string };
type Group = { hooks?: HookEntry[] };
type Settings = { hooks?: Record<string, Group[]> };
const readSettings = (): Settings => JSON.parse(readFileSync(SETTINGS, 'utf8'));
const foleyIn = (s: Settings, event: string): boolean => {
  const groups = s?.hooks?.[event];
  return Array.isArray(groups) && groups.some((g) => Array.isArray(g?.hooks) && g.hooks!.some((h) => connect.isFoleyHook(h?.command)));
};

test('MIG-1 空档首装：wireSettings 一刀装齐 SessionEnd＋SessionStart，wiredIn=true', () => {
  rmSync(SETTINGS, { force: true });
  const { changed } = connect.wireSettings();
  assert.equal(changed, true, '空档首装应 changed');
  const s = readSettings();
  assert.ok(foleyIn(s, 'SessionEnd'), 'SessionEnd 收工钩子在位');
  assert.ok(foleyIn(s, 'SessionStart'), 'SessionStart 心跳在位（迁移核心：生产侧真的注册了 PID 心跳）');
  assert.equal(connect.wiredIn(s), true, '两钩子俱在 → wiredIn=true');
});

test('MIG-2 幂等：再 wireSettings 一次不重写（changed=false）', () => {
  const { changed } = connect.wireSettings();
  assert.equal(changed, false, '已齐再装应幂等 no-op');
});

test('MIG-3 旧装迁移：仅 SessionEnd 老档 → wiredIn=false（未齐）→ wireSettings 补 SessionStart → wiredIn=true', () => {
  const cmd = connect.hookCommand();
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(SETTINGS, JSON.stringify({ hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: cmd }] }] } }, null, 2) + '\n');
  assert.equal(connect.wiredIn(readSettings()), false, '仅 SessionEnd＝未齐（心跳缺席·REC 会撒谎——旧真绿的真相）');
  const { changed } = connect.wireSettings();
  assert.equal(changed, true, '补装 SessionStart 应 changed');
  assert.ok(foleyIn(readSettings(), 'SessionStart'), '迁移后 SessionStart 补齐');
  assert.equal(connect.wiredIn(readSettings()), true, '迁移后 wiredIn=true');
});

test('MIG-4 不碰他人钩子：既有非 foley 的 SessionEnd 钩子原样保留（加法·不覆盖）', () => {
  const cmd = connect.hookCommand();
  writeFileSync(SETTINGS, JSON.stringify({ hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: 'echo someone-elses-hook' }] }] } }, null, 2) + '\n');
  connect.wireSettings();
  const groups = readSettings().hooks?.SessionEnd ?? [];
  const cmds = groups.flatMap((g) => (g.hooks ?? []).map((h) => h.command));
  assert.ok(cmds.includes('echo someone-elses-hook'), '他人钩子原样保留');
  assert.ok(cmds.includes(cmd), 'foley 钩子并存追加');
});

test.after(() => {
  try { rmSync(claudeDir, { recursive: true, force: true }); } catch { /* 尽力 */ }
  try { rmSync(foleyHome, { recursive: true, force: true }); } catch { /* 尽力 */ }
});
