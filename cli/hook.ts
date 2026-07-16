// cli hook —— 钩子落纸头：SessionEnd（收工吐卡·轨乙①三号手令·丁）＋ SessionStart（生产者身份账·ATF 重建）。
// 即发即忘：stdin 的钩子 JSON → 一行 NDJSON append 到 ~/.foley/spool/events.ndjson，serve 尾随消费。
//
// 传输裁定（三号手令·丁-轨乙）：走文件落盘；否决 HTTP 直喂——钩子处收工热路径，
// 不许与 serve 可用性耦合，也不给机器新开入口面。
//
// 身份账（席一验收单 ATF §2/ATF-I06）：
// · incarnation＝每次 SessionStart 全新 UUIDv4（同 transcript/同 sessionId/同父进程 resume 也换新）；
// · producerEpoch＝按 transcript key 持久严格递增整数，落 spool 前分配——serve 以其裁决乱序；
// · eventId＝每行唯一 UUIDv4（serve 消费回显，证明旧事件确已到达）；
// · 身份槽按 producer 父进程「出生身份」分槽（pid 槽），两父重叠时 A 的 End 仍找回 A 的身份；
//   爬链失败以 sessionId 槽兜底；两者皆无＝升级遗留，不伪造身份（ATF §5），落无身份行。
//
// 三条铁律：
// ① 永远退 0——钩子的任何失败都不许波及用户的 Claude Code 会话；
// ② 不碰 /dev/tty——hooks 无控制终端；
// ③ 此处零重活——蒸馏、回放、出卡全在 serve 尾随侧，这里只落一行纸。

import { appendFileSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// FOLEY_HOME 供测试/CI 指别处（缺省 ~/.foley）——与 serve 尾随侧同一枚环境位
const FOLEY_HOME_DIR = process.env.FOLEY_HOME ?? join(homedir(), '.foley');
export const SPOOL_DIR = join(FOLEY_HOME_DIR, 'spool');
export const SPOOL_EVENTS = join(SPOOL_DIR, 'events.ndjson');
// producerEpoch 分配账＋出生身份槽（hook 单独持有；serve 只消费 spool 行，不读此档）
export const IDENTITY_FILE = join(FOLEY_HOME_DIR, 'producer-identity.json');

export function appendSpool(entry: Record<string, unknown>): void {
  mkdirSync(SPOOL_DIR, { recursive: true });
  appendFileSync(SPOOL_EVENTS, JSON.stringify({ v: 1, at: Date.now(), ...entry }) + '\n');
}

interface ProducerSlot { incarnation: string; producerEpoch: number; sessionId: string }
interface IdentityLedger { v: 1; epochs: Record<string, number>; slots: Record<string, ProducerSlot> }

function isSlot(s: unknown): s is ProducerSlot {
  return !!s && typeof s === 'object'
    && typeof (s as ProducerSlot).incarnation === 'string'
    && Number.isSafeInteger((s as ProducerSlot).producerEpoch)
    && (s as ProducerSlot).producerEpoch > 0
    && typeof (s as ProducerSlot).sessionId === 'string';
}
function loadIdentity(): IdentityLedger {
  try {
    const parsed = JSON.parse(readFileSync(IDENTITY_FILE, 'utf8')) as Record<string, unknown>;
    const epochs = parsed?.epochs, slots = parsed?.slots;
    if (epochs && typeof epochs === 'object' && !Array.isArray(epochs)
      && slots && typeof slots === 'object' && !Array.isArray(slots)) {
      return { v: 1, epochs: epochs as Record<string, number>, slots: slots as Record<string, ProducerSlot> };
    }
  } catch { /* 缺档＝首启；坏档＝重建（epoch 账丢失时新分配从 1 起，serve 侧旧代裁决仍安全：等值/较小一律 no-op） */ }
  return { v: 1, epochs: {}, slots: {} };
}
function saveIdentity(ledger: IdentityLedger): void {
  mkdirSync(FOLEY_HOME_DIR, { recursive: true });
  const temp = `${IDENTITY_FILE}.${process.pid}.${Date.now()}.tmp`; // 同目录临时件＋rename：读者只见旧版或新版
  writeFileSync(temp, JSON.stringify(ledger) + '\n');
  renameSync(temp, IDENTITY_FILE);
}
const pidSlotKey = (pid: number, key: string): string => `pid:${pid}:${key}`;
const sidSlotKey = (sid: string, key: string): string => `sid:${sid}:${key}`;

/** 生产者 PID（席二工单 2）：钩子由 claude 派生——爬 ppid 链找第一个 claude 形态进程。
 *  实证（2026-07-15 实验）：SessionStart 钩子的 process.ppid 通常一层直达 claude CLI；
 *  但钩子命令若含复合 shell 会插中间层，故爬 ≤4 层按 command 匹配。找不到＝null（serve 转 unknown，永不误判死）。 */
export function findProducerPid(): { pid: number; command: string } | null {
  let pid = process.ppid;
  for (let i = 0; i < 4 && pid > 1; i++) {
    let out = '';
    try { out = execSync(`ps -o ppid=,command= -p ${pid}`, { encoding: 'utf8', timeout: 1500 }).trim(); } catch { return null; }
    const m = out.match(/^\s*(\d+)\s+([\s\S]*)$/);
    const command = (m?.[2] ?? '').trim();
    if (/(^|\/)claude([ .]|$)|claude-code|claude\.app/i.test(command)) return { pid, command: command.slice(0, 160) };
    pid = Number(m?.[1] ?? 0);
  }
  return null;
}

function onSessionStart(p: Record<string, unknown>): void {
  const producer = findProducerPid();
  const sessionId = String(p.session_id ?? '');
  const transcriptPath = String(p.transcript_path ?? '');
  // 每次 Start 都是新 incarnation（resume/clear/同父重启无一例外）；sessionId 不得代用（ATF §2.1）
  const incarnation = randomUUID();
  let producerEpoch = 1;
  try {
    const ledger = loadIdentity();
    const cur = ledger.epochs[transcriptPath];
    producerEpoch = (Number.isSafeInteger(cur) && (cur as number) > 0 ? (cur as number) : 0) + 1;
    ledger.epochs[transcriptPath] = producerEpoch;
    const slot: ProducerSlot = { incarnation, producerEpoch, sessionId };
    if (producer) ledger.slots[pidSlotKey(producer.pid, transcriptPath)] = slot;
    ledger.slots[sidSlotKey(sessionId, transcriptPath)] = slot;   // 爬链失败时 End 的兜底槽
    saveIdentity(ledger);
  } catch { /* 账本写不动：仍携本次身份落行（铁律①·不拦会话） */ }
  appendSpool({
    v: 2,
    kind: 'session-start',
    eventId: randomUUID(),
    sessionId,
    transcriptPath,
    source: String(p.source ?? 'startup'),
    incarnation,
    producerEpoch,
    pid: producer?.pid ?? null,
    pidCommand: producer?.command ?? null,
  });
}

function onSessionEnd(p: Record<string, unknown>): void {
  const sessionId = String(p.session_id ?? '');
  const transcriptPath = String(p.transcript_path ?? '');
  let slot: ProducerSlot | null = null;
  try {
    const ledger = loadIdentity();
    const producer = findProducerPid();
    if (producer) {
      const byPid = ledger.slots[pidSlotKey(producer.pid, transcriptPath)];
      if (isSlot(byPid)) slot = byPid;   // 出生身份优先：两父重叠时 A 父的 End 归 A（ATF-I06）
    }
    if (!slot) {
      const bySid = ledger.slots[sidSlotKey(sessionId, transcriptPath)];
      if (isSlot(bySid)) slot = bySid;
    }
  } catch { /* 账本读不动＝按升级遗留处理 */ }
  appendSpool({
    v: 2,
    kind: 'session-end',
    eventId: randomUUID(),
    sessionId: slot ? slot.sessionId : sessionId,   // End 绑定出生身份的 sessionId（全匹配四元组之一）
    transcriptPath,
    reason: String(p.reason ?? 'other'),
    ...(slot ? { incarnation: slot.incarnation, producerEpoch: slot.producerEpoch } : {}),
    // 无槽＝升级遗留：不伪造 incarnation/producerEpoch（ATF §5），serve 对其生命周期义务安全忽略；出卡语义照旧
  });
}

export function runHook(argv: string[]): void {
  if (argv.includes('--hello')) {
    // connect 接线自证：走同一条落纸路径写一枚 hello（serve 收到即宣告接通）
    try { appendSpool({ kind: 'hello' }); } catch { /* 即发即忘 */ }
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  process.stdin.on('data', (d: Buffer) => {
    size += d.length;
    if (size <= 1e6) chunks.push(d); // 载荷超 1MB 不像钩子事件，弃
  });
  process.stdin.on('end', () => {
    try {
      const p = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (p?.hook_event_name === 'SessionEnd') onSessionEnd(p);        // 收工事件（勿用 Stop——那是每回合收笔）
      else if (p?.hook_event_name === 'SessionStart') onSessionStart(p);
    } catch { /* 坏载荷静默丢弃（铁律①） */ }
  });
  process.stdin.on('error', () => { /* 铁律① */ });
  // 5s 保险丝：stdin 迟迟不收口也不许挂住收工
  setTimeout(() => process.exit(0), 5000).unref();
}

// 独立入口（connect 安装的钩子命令直指本件）：钩子热路径不背 cli/index.ts 的整张模块图
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runHook(process.argv.slice(2));
}
