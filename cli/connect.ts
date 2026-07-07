// cli connect —— 新手引导的安装接线（轨乙②，三号手令·丁）：
// 检测 Claude Code → 征询同意 → 分层写 ~/.claude/settings.json（只增不毁：读旧→合并→写回，
// 解析不动即中止且原文不动，写前留底 .foley-bak）→ 写一枚 hello 走 spool 自证 → 一声针落宣告接通。
//
// 边界申明：钩子命令本身不碰 /dev/tty（hooks 无控制终端，见 cli/hook.ts）；
// 本命令跑在用户终端里，问答走 stdin/stdout，且非 TTY 一律不问（--yes 才动手）。

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendSpool } from './hook.ts';

// CLAUDE_CONFIG_DIR：Claude Code 自家的配置搬家位，接线跟着走；FOLEY_HOME 供测试/CI 指别处
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
const SETTINGS = join(CLAUDE_DIR, 'settings.json');
const FOLEY_HOME = process.env.FOLEY_HOME ?? join(homedir(), '.foley');
const ONBOARD = join(FOLEY_HOME, 'onboard.json');

function hookEntryPath(): string {
  return fileURLToPath(new URL('./hook.ts', import.meta.url));
}
// 绝对路径钉死本副本（repo 检出与 npm 装包皆稳）；npx 缓存被清则钩子静默失效——known limit，FEEDBACK 在案
export function hookCommand(): string {
  return `node ${JSON.stringify(hookEntryPath())}`;
}
// 识别我方钩子：cli/hook.ts 直入（现口径）或 “… hook” 子命令（兼容手写）
export function isFoleyHook(cmd: unknown): boolean {
  const s = String(cmd ?? '');
  return /cli[\\/]hook\.ts/.test(s) || (/\shook(\s|$)/.test(s) && /cli[\\/]index\.ts|foley/.test(s));
}
export function wiredIn(settings: unknown): boolean {
  const groups = (settings as { hooks?: { SessionEnd?: unknown } })?.hooks?.SessionEnd;
  if (!Array.isArray(groups)) return false;
  return groups.some((g) => Array.isArray(g?.hooks) && g.hooks.some((h: { command?: unknown }) => isFoleyHook(h?.command)));
}

interface OnboardState { wiredAt?: number; declinedAt?: number }
function readOnboard(): OnboardState {
  try { return JSON.parse(readFileSync(ONBOARD, 'utf8')); } catch { return {}; }
}
function remember(k: 'wiredAt' | 'declinedAt'): void {
  try {
    mkdirSync(dirname(ONBOARD), { recursive: true });
    writeFileSync(ONBOARD, JSON.stringify({ ...readOnboard(), [k]: Date.now() }, null, 2) + '\n');
  } catch { /* 记不下也不拦 */ }
}

function backupAndWrite(settings: object): void {
  mkdirSync(CLAUDE_DIR, { recursive: true });
  if (existsSync(SETTINGS)) copyFileSync(SETTINGS, SETTINGS + '.foley-bak'); // 动别人的家当前先留底
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

// 分层写：settings.json 里只动 hooks.SessionEnd 一处；幂等（在位即更新命令，不重复追加）
export function wireSettings(): { changed: boolean } {
  let settings: Record<string, unknown> = {};
  if (existsSync(SETTINGS)) {
    try { settings = JSON.parse(readFileSync(SETTINGS, 'utf8')); }
    catch { throw new Error('~/.claude/settings.json 解析不动——不敢分层合并，请先修好它（原文未动）'); }
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      throw new Error('~/.claude/settings.json 顶层不是对象——不敢动（原文未动）');
    }
  }
  const hooks = ((settings.hooks as Record<string, unknown>) ??= {});
  const groups = ((hooks.SessionEnd as unknown[]) ??= []) as { hooks?: { type?: string; command?: string }[] }[];
  const cmd = hookCommand();
  for (const g of groups) {
    if (!Array.isArray(g?.hooks)) continue;
    for (const h of g.hooks) {
      if (isFoleyHook(h?.command)) {
        if (h.command === cmd) return { changed: false };
        h.command = cmd; // 装包位置挪了：原位换命令
        backupAndWrite(settings);
        return { changed: true };
      }
    }
  }
  groups.push({ hooks: [{ type: 'command', command: cmd }] });
  backupAndWrite(settings);
  return { changed: true };
}

// 针落声：只读消费在位的 wav（repo 真身 → foley records 的 factory 缓存）；
// 播放器缺席只留字——宣告不许因声炸掉。合成写权在 Track-SOUND，此处零私造。
function needleDrop(): void {
  console.log('♪ 针落——接线成功。收工时这台机器会自己撕一张卡（默认脱敏）。');
  if (!process.stdout.isTTY) return; // 没人坐在终端前（测试/CI/管道）：字到即宣告，不放声
  const repoRoot = dirname(dirname(hookEntryPath()));
  const wav = [
    join(repoRoot, 'sound', 'assets', 'l1-crackle.wav'),
    join(FOLEY_HOME, 'assets', 'factory', 'l1-crackle.wav'),
  ].find((p) => existsSync(p));
  if (!wav) return;
  try {
    const p = process.platform === 'darwin'
      ? spawn('afplay', ['-t', '1.6', wav], { stdio: 'ignore', detached: true })
      : process.platform === 'win32'
        ? spawn('powershell', ['-NoProfile', '-c', `(New-Object Media.SoundPlayer '${wav.replace(/'/g, "''")}').PlaySync()`], { stdio: 'ignore', detached: true })
        : spawn('aplay', ['-d', '2', '-q', wav], { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch { /* 无播放器：字已到位 */ }
}

function printTerms(): void {
  console.log('接线单：把「收工吐卡」接进你的 Claude Code——');
  console.log('  · 写入 ~/.claude/settings.json 一条 SessionEnd 钩子（原有内容分层保留，写前留底 .foley-bak）');
  console.log('  · 会话收工时钩子往 ~/.foley/spool/ 落一行纸；正在跑的 foley 据此蒸馏（默认脱敏）并自撕一张卡');
  console.log('  · resume（延续会话）不落卡；clear（清屏翻章）落卡；同一会话后卡替前卡');
  console.log('  · 纯本地、零遥测；随时可从 settings.json 摘除该钩子');
}

function ask(prompt: string, timeoutMs = 0): Promise<'y' | 'n' | 'timeout'> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let timer: NodeJS.Timeout | null = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => { rl.close(); console.log('（未答——这轮先不接，问答不拦起播）'); resolve('timeout'); }, timeoutMs);
      timer.unref();
    }
    rl.question(prompt, (a) => {
      if (timer) clearTimeout(timer);
      rl.close();
      resolve(/^y(es)?$/i.test(a.trim()) ? 'y' : 'n');
    });
  });
}

export async function runConnect(argv: string[]): Promise<void> {
  if (!existsSync(CLAUDE_DIR)) {
    console.error('未见 ~/.claude —— 这台机器尾随的是 Claude Code 会话；装好再回来接线。');
    process.exit(1);
    return;
  }
  const yes = argv.includes('--yes') || argv.includes('-y');
  if (!yes) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      console.error('非交互环境不代答同意：明示请跑 foley connect --yes');
      process.exit(1);
      return;
    }
    printTerms();
    const a = await ask('接吗？[y/N] ');
    if (a !== 'y') { remember('declinedAt'); console.log('先不接。想通了随时：foley connect'); return; }
  }
  const { changed } = wireSettings();
  remember('wiredAt');
  console.log(changed ? '钩子已写入 ~/.claude/settings.json（SessionEnd）。' : '钩子本就在位（幂等，未重写）。');
  try { appendSpool({ kind: 'hello' }); } catch { /* spool 落不下不拦宣告 */ }
  needleDrop();
}

// 首启征询（正门顺带，一次性）：TTY、在用 Claude Code、未接线、未谢绝，四门全过才开口；
// 15 秒不答＝这轮不问且不记账（问答绝不拦起播——boot 由调用侧在 finally 里走）。
export async function offerConnect(timeoutMs = 15000): Promise<void> {
  try {
    if (process.env.FOLEY_NO_ONBOARD === '1') return;
    if (!process.stdin.isTTY || !process.stdout.isTTY) return;
    if (!existsSync(CLAUDE_DIR)) return;
    const st = readOnboard();
    if (st.wiredAt || st.declinedAt) return;
    let settings: unknown = {};
    try { settings = JSON.parse(readFileSync(SETTINGS, 'utf8')); } catch { /* 无档或坏档：按未接线待之 */ }
    if (wiredIn(settings)) { remember('wiredAt'); return; }
    console.log('见你在用 Claude Code，而收工吐卡还没接线——60 秒接好：');
    printTerms();
    const a = await ask('现在接吗？[y/N] ', timeoutMs);
    if (a === 'timeout') return;
    if (a !== 'y') { remember('declinedAt'); console.log('好。想通了随时：foley connect'); return; }
    const { changed } = wireSettings();
    remember('wiredAt');
    console.log(changed ? '钩子已写入 ~/.claude/settings.json（SessionEnd）。' : '钩子本就在位（幂等，未重写）。');
    try { appendSpool({ kind: 'hello' }); } catch { /* 同上 */ }
    needleDrop();
  } catch (err) {
    console.error('接线征询未成（不拦起播）：', err instanceof Error ? err.message : err);
  }
}
