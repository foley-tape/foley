// cli hook —— 钩子落纸头：SessionEnd（收工吐卡·轨乙①三号手令·丁）＋ SessionStart（生产者心跳 PID 报到·席二工单 2）。
// 即发即忘：stdin 的钩子 JSON → 一行 NDJSON append 到 ~/.foley/spool/events.ndjson，serve 尾随消费。
//
// 传输裁定（三号手令·丁-轨乙）：走文件落盘；否决 HTTP 直喂——钩子处收工热路径，
// 不许与 serve 可用性耦合，也不给机器新开入口面。
//
// 三条铁律：
// ① 永远退 0——钩子的任何失败都不许波及用户的 Claude Code 会话；
// ② 不碰 /dev/tty——hooks 无控制终端；
// ③ 此处零重活——蒸馏、回放、出卡全在 serve 尾随侧，这里只落一行纸。

import { appendFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// FOLEY_HOME 供测试/CI 指别处（缺省 ~/.foley）——与 serve 尾随侧同一枚环境位
export const SPOOL_DIR = join(process.env.FOLEY_HOME ?? join(homedir(), '.foley'), 'spool');
export const SPOOL_EVENTS = join(SPOOL_DIR, 'events.ndjson');

export function appendSpool(entry: Record<string, unknown>): void {
  mkdirSync(SPOOL_DIR, { recursive: true });
  appendFileSync(SPOOL_EVENTS, JSON.stringify({ v: 1, at: Date.now(), ...entry }) + '\n');
}

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
      if (p?.hook_event_name === 'SessionEnd') { // 收工事件（勿用 Stop——那是每回合收笔）
        appendSpool({
          kind: 'session-end',
          sessionId: String(p.session_id ?? ''),
          transcriptPath: String(p.transcript_path ?? ''),
          reason: String(p.reason ?? 'other'),
        });
      } else if (p?.hook_event_name === 'SessionStart') {
        // 席二工单 2 生产者心跳：开工即报到——PID 落纸，serve 侧 kill -0 轮询作 REC 的主判据。
        // resume/clear 也会来（source 字段），同 session 后行覆盖前行＝天然处理进程更迭。
        const producer = findProducerPid();
        appendSpool({
          kind: 'session-start',
          sessionId: String(p.session_id ?? ''),
          transcriptPath: String(p.transcript_path ?? ''),
          source: String(p.source ?? 'startup'),
          pid: producer?.pid ?? null,
          pidCommand: producer?.command ?? null,
        });
      }
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
