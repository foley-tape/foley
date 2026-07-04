// claude-jsonl 适配器核心：纯函数 text → 事件流 + 解析统计。
// 无 fs、无网络（fs 封装在 index.ts）。同构可测。
//
// as-built（对照真实 ~/.claude/projects/**/*.jsonl，M0 格式考古）：
//  - tool_use 在 assistant.message.content[]（block.type==='tool_use'：id/name/input）
//  - tool_result 在 user.message.content[]（block.type==='tool_result'：tool_use_id/is_error/content）
//  - 配对键：tool_use.id === tool_result.tool_use_id
//  - 富结果在顶层 toolUseResult（durationMs/code/structuredPatch/interrupted/file...）
//  - timestamp 为 ISO 字符串 → Date.parse → ms
//  - 其余 line type（mode/system/file-history-snapshot/ai-title/...）故意丢弃（§4）

import type { MomentEvent, Verb, Outcome } from '../../protocol/index.ts';
import {
  verbOf,
  classifyBash,
  tagsForCommand,
  isKnownTool,
} from './verbs.ts';

// ---- 松散的日志行类型（真实日志字段多，只narrow我们要的）----
interface ContentBlock {
  type?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
  text?: string;
}
interface RawMessage {
  role?: string;
  content?: ContentBlock[] | string;
  stop_reason?: string | null;
}
interface RawLine {
  type?: string;
  timestamp?: string;
  uuid?: string;
  message?: RawMessage;
  toolUseResult?: Record<string, unknown> | string;
  isSidechain?: boolean;
  sourceToolAssistantUUID?: string;
}

export interface ParseStats {
  totalLines: number;
  parsedLines: number;
  badLines: number;
  parseCoverage: number; // parsedLines / totalLines
  lineTypeCounts: Record<string, number>;
  toolUseCount: number;
  toolResultCount: number;
  pairedCount: number;
  unpairedToolUse: number; // 无配对结果（尾随局限 / 未决）
  sidechainLines: number;
  unknownTools: Record<string, number>; // name → count（→ OTHER）
  askToolCount: number; // AskUserQuestion 出现次数（现实修正观测量）
  firstT: number | null;
  lastT: number | null;
}

/** 内部增强：带 tool_use / tool_result 时刻，供回放驱动做未决 RUN 滴灌。 */
export interface TimedMoment extends MomentEvent {
  useT: number;          // tool_use 发起时刻
  resolveT: number | null; // tool_result 到达时刻（未配对为 null）
}

export interface ParseResult {
  moments: MomentEvent[]; // 协议净版（供总线/CSV/测试）
  timed: TimedMoment[];   // 内部增强版（供 driver）
  stats: ParseStats;
}

// ---------- 工具函数 ----------

const enc = new TextEncoder();
function utf8Bytes(s: string): number {
  return enc.encode(s).length;
}

/** 对数归一幅度：m = min(1, ln(1+x)/ln(1+cap))。 */
function amp(x: number, cap: number): number {
  if (x <= 0) return 0;
  return Math.min(1, Math.log(1 + x) / Math.log(1 + cap));
}

/** FNV-1a 32-bit → 8位hex。确定性、零依赖。 */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 归一化错误首行：抹掉数字/路径/hex，供 sig 稳定聚类。 */
function normErr(text: string): string {
  const first = (text.split('\n')[0] ?? '').toLowerCase();
  return first
    .replace(/[\/~][\w./@-]+/g, 'PATH')
    .replace(/0x[0-9a-f]+/g, 'HEX')
    .replace(/\d+/g, '0')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** 从 tool_result 的 content（string 或 block[]）提取文本。 */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as ContentBlock).text ?? '') : ''))
      .join('\n');
  }
  return '';
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// ---------- 幅度计算 ----------

function writeDiffLines(input: Record<string, unknown> | undefined, tur: Record<string, unknown> | undefined): number {
  // 优先 structuredPatch：统计 +/- 变更行
  const patch = tur?.['structuredPatch'];
  if (Array.isArray(patch)) {
    let changed = 0;
    for (const hunk of patch) {
      const lines = (hunk as { lines?: unknown }).lines;
      if (Array.isArray(lines)) {
        for (const ln of lines) {
          const s = String(ln);
          if (s.startsWith('+') || s.startsWith('-')) changed++;
        }
      }
    }
    if (changed > 0) return changed;
  }
  // 退路：Write 用 content 行数；Edit 用 old/new 行数差
  const content = input?.['content'];
  if (typeof content === 'string') return content.split('\n').length;
  const oldS = typeof input?.['old_string'] === 'string' ? (input['old_string'] as string) : '';
  const newS = typeof input?.['new_string'] === 'string' ? (input['new_string'] as string) : '';
  return Math.max(oldS.split('\n').length, newS.split('\n').length);
}

function runSeconds(
  tur: Record<string, unknown> | undefined,
  useT: number,
  resT: number | null,
): number {
  const d = num(tur?.['durationMs']);
  if (d !== undefined) return d / 1000;
  if (resT !== null && resT > useT) return (resT - useT) / 1000;
  return 0;
}

function readKb(tur: Record<string, unknown> | undefined, rtext: string): number {
  const file = tur?.['file'];
  if (file && typeof file === 'object') {
    const bytes = num((file as Record<string, unknown>)['bytes']);
    if (bytes !== undefined) return bytes / 1024;
  }
  const bytes = num(tur?.['bytes']);
  if (bytes !== undefined) return bytes / 1024;
  return utf8Bytes(rtext) / 1024;
}

// ---------- 结果索引 ----------

interface ResultRec {
  isError: boolean;
  interrupted: boolean;
  code: number | undefined;
  tur: Record<string, unknown> | undefined;
  text: string;
  t: number | null;
}

// ---------- 主解析 ----------

const AMP = { writeDiffCap: 500, runSecCap: 120, readKbCap: 100, default: 0.3 } as const;

export function parseTape(text: string): ParseResult {
  const rawLines = text.split('\n');
  const lineTypeCounts: Record<string, number> = {};
  const unknownTools: Record<string, number> = {};
  const resultsById = new Map<string, ResultRec>();

  let totalLines = 0;
  let parsedLines = 0;
  let badLines = 0;
  let toolResultCount = 0;
  let sidechainLines = 0;
  let askToolCount = 0;
  let firstT: number | null = null;
  let lastT: number | null = null;

  const parsed: RawLine[] = [];

  for (const raw of rawLines) {
    if (raw.trim() === '') continue;
    totalLines++;
    let o: RawLine;
    try {
      o = JSON.parse(raw) as RawLine;
    } catch {
      badLines++; // 解析失败：跳过、计数、上报，禁 crash
      continue;
    }
    parsedLines++;
    parsed.push(o);
    const ty = o.type ?? '(no-type)';
    lineTypeCounts[ty] = (lineTypeCounts[ty] ?? 0) + 1;
    if (o.isSidechain) sidechainLines++;

    const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
    if (Number.isFinite(ts)) {
      if (firstT === null || ts < firstT) firstT = ts;
      if (lastT === null || ts > lastT) lastT = ts;
    }

    // 索引 tool_result（在 user 消息里）
    if (o.type === 'user' && o.message && Array.isArray(o.message.content)) {
      for (const b of o.message.content) {
        if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
          toolResultCount++;
          const tur = typeof o.toolUseResult === 'object' && o.toolUseResult !== null
            ? (o.toolUseResult as Record<string, unknown>)
            : undefined;
          resultsById.set(b.tool_use_id, {
            isError: b.is_error === true,
            interrupted: tur?.['interrupted'] === true,
            code: num(tur?.['code']),
            tur,
            text: resultText(b.content),
            t: Number.isFinite(ts) ? ts : null,
          });
        }
      }
    }
  }

  // 第二遍：assistant tool_use → MomentEvent
  const timed: TimedMoment[] = [];
  let seq = 0;
  let toolUseCount = 0;
  let pairedCount = 0;
  let unpairedToolUse = 0;

  // SESSION_START 标点
  if (firstT !== null) {
    timed.push({
      kind: 'moment', t: firstT, seq: seq++, agent: 'main',
      verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'SESSION_START',
      useT: firstT, resolveT: firstT,
    });
  }

  for (const o of parsed) {
    if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    const t = o.timestamp ? Date.parse(o.timestamp) : NaN;
    for (const b of o.message.content) {
      if (b.type !== 'tool_use' || typeof b.name !== 'string') continue;
      toolUseCount++;
      const name = b.name;
      if (name === 'AskUserQuestion') askToolCount++;
      if (!isKnownTool(name)) unknownTools[name] = (unknownTools[name] ?? 0) + 1;

      const input = (b.input && typeof b.input === 'object') ? b.input : undefined;
      const command = typeof input?.['command'] === 'string' ? (input['command'] as string) : undefined;

      let verb: Verb = name === 'Bash' ? classifyBash(command) : verbOf(name);

      const res = typeof b.id === 'string' ? resultsById.get(b.id) : undefined;
      if (res) pairedCount++;
      else unpairedToolUse++;

      // outcome
      let outcome: Outcome;
      if (!res) outcome = 'NA';
      else if (res.interrupted) outcome = 'NA';
      else if (res.isError) outcome = 'FAIL';
      else if (res.code !== undefined && res.code !== 0) outcome = 'FAIL';
      else outcome = 'OK';

      // 幅度 m
      let m: number;
      switch (verb) {
        case 'WRITE':
          m = amp(writeDiffLines(input, res?.tur), AMP.writeDiffCap);
          break;
        case 'RUN':
        case 'SAVE': {
          const secs = runSeconds(res?.tur, Number.isFinite(t) ? t : 0, res?.t ?? null);
          m = verb === 'RUN' ? amp(secs, AMP.runSecCap) : AMP.default;
          break;
        }
        case 'READ':
          m = amp(readKb(res?.tur, res?.text ?? ''), AMP.readKbCap);
          break;
        default:
          m = AMP.default;
      }

      // tags
      const tags = verb === 'RUN' || verb === 'SAVE' ? tagsForCommand(command) : [];

      // sig：hash(verb + tool + normalize(错误首行))
      const errLine = outcome === 'FAIL' ? normErr(res?.text ?? '') : '';
      const sig = fnv1a(`${verb}|${name}|${errLine}`);

      const useT = Number.isFinite(t) ? t : (firstT ?? 0);
      const resolveT = res?.t ?? null;
      // 效果落地时刻 = 结果到达时（outcome 可见时张力才响应）；未配对退回 useT
      const effectT = resolveT ?? useT;

      timed.push({
        kind: 'moment',
        t: effectT,
        seq: seq++,
        agent: 'main',
        verb,
        outcome,
        m,
        tags,
        sig,
        useT,
        resolveT,
      });
    }
  }

  // DONE 启发式（replay 全文视角）：末条 assistant 有 stop_reason 且无未决工具 → 收尾
  const lastAssistant = [...parsed].reverse().find((o) => o.type === 'assistant');
  if (lastAssistant && lastT !== null) {
    const hasStop = !!lastAssistant.message?.stop_reason;
    if (hasStop && unpairedToolUse === 0) {
      timed.push({
        kind: 'moment', t: lastT, seq: seq++, agent: 'main',
        verb: 'OTHER', outcome: 'NA', m: 0, tags: [], special: 'DONE',
        useT: lastT, resolveT: lastT,
      });
    }
  }

  // 排序（效果时刻，seq 破平）→ 协议净版
  timed.sort((a, b) => a.t - b.t || a.seq - b.seq);
  const moments: MomentEvent[] = timed.map((tm) => {
    const { useT, resolveT, ...clean } = tm;
    void useT; void resolveT;
    return clean;
  });

  const stats: ParseStats = {
    totalLines,
    parsedLines,
    badLines,
    parseCoverage: totalLines === 0 ? 1 : parsedLines / totalLines,
    lineTypeCounts,
    toolUseCount,
    toolResultCount,
    pairedCount,
    unpairedToolUse,
    sidechainLines,
    unknownTools,
    askToolCount,
    firstT,
    lastT,
  };

  return { moments, timed, stats };
}
