// claude-jsonl 蒸馏核（§3 蒸馏工序）：纯函数 原始JSONL文本 → 蒸馏记录 + meta。
// 无 fs、无网络（fs 封装在 distill.ts / index.ts）。同构可测。
//
// 【隐私膜】这是全系统唯一读取原始 JSONL 的地方。产出蒸馏带只含事件骨架：
//   t / useT / resolveT / verb / tool / outcome / m原料量(mKind+mRaw) / durationMs
//   / sig / episode / sidechain / seq，外加唯一文本字段 errClass（错误首行归一化，≤60）。
//   工具输入、输出正文、对话内容一律不落盘。
//
// as-built（对照真实 ~/.claude/projects/**/*.jsonl，M0 格式考古）：
//  - tool_use 在 assistant.message.content[]（block.type==='tool_use'：id/name/input）
//  - tool_result 在 user.message.content[]（block.type==='tool_result'：tool_use_id/is_error/content）
//  - 配对键：tool_use.id === tool_result.tool_use_id
//  - 富结果在顶层 toolUseResult（durationMs/code/structuredPatch/interrupted/file...）
//  - timestamp 为 ISO 字符串 → Date.parse → ms

import type { Verb, Outcome, Special } from '../../protocol/index.ts';
import type { Params } from '../../engine/params.ts';
import { verbOf, classifyBash, tagsForCommand, isKnownTool } from './verbs.ts';

// ---- m 原料量的种类：决定消费时用哪个 cap 归一 ----
export type MKind = 'lines' | 'sec' | 'kb' | 'default';

/** 蒸馏记录：一行事件骨架。序列化即蒸馏带一行。 */
export interface DistilledMoment {
  t: number;               // 效果落地时刻 = resolveT ?? useT
  useT: number;            // tool_use 发起时刻（未决 RUN 滴灌窗起点基准）
  resolveT: number | null; // tool_result 到达时刻（未配对=null；标点=t）
  seq: number;
  verb: Verb;
  tool: string;            // 源工具名（骨架，非内容）
  outcome: Outcome;
  mKind: MKind;            // m 原料量种类
  mRaw: number;            // 原料量（行/秒/KB；default 为 0）
  durationMs: number | null;
  tags: string[];          // test/build 语义标签（派生分类，非内容）
  sig: string | null;      // hash(verb|tool|errClass) —— 充能/卡碟分组键（distill/2 规则不变）
  targetHash: string;      // hash(命令头/主路径) —— 卡碟"同目标"清除键（distill/2 §3；余空''）
  errClass: string | null; // 唯一文本字段：错误首行归一化(抹路径/hex/token/数字)≤60；仅 FAIL
  episode: number;         // 会话分段序号（§4.1）
  sidechain: boolean;      // 子 agent 轨（v0 折叠 main，仅留标记）
  special: Special | null; // SESSION_START / DONE 等标点
}

export interface EpisodeInfo { i: number; startT: number; endT: number; events: number }

export interface DistillStats {
  totalLines: number;
  parsedLines: number;
  badLines: number;
  parseCoverage: number;
  lineTypeCounts: Record<string, number>;
  toolUseCount: number;
  toolResultCount: number;
  pairedCount: number;
  unpairedToolUse: number;
  sidechainLines: number;
  unknownTools: Record<string, number>;
  askToolCount: number;
  firstT: number | null;
  lastT: number | null;
}

export interface DistillMeta {
  distiller: string;      // 蒸馏器版本
  sourceHash: string;     // 原始文件字节 FNV-1a
  episodes: EpisodeInfo[];
  eventCount: number;     // 非标点记录数
  stats: DistillStats;
}

export interface DistillResult {
  records: DistilledMoment[]; // 已按 (t,seq) 排序，含标点
  meta: DistillMeta;
}

export const DISTILLER_VERSION = 'distill/2';

// ---------- 工具函数 ----------

const enc = new TextEncoder();
function utf8Bytes(s: string): number {
  return enc.encode(s).length;
}

/** FNV-1a 32-bit → 8位hex。确定性、零依赖。 */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** 归一化错误首行：抹凭据/路径/hex/token/数字，供 sig 稳定聚类。截断 60（§3.2）。
 *  M1.8-F④ 补刀（B-2）：内联凭据/短口令/相对·Windows 路径/疑似令牌 → SECRET。宁可过抹——errClass 只为聚类。 */
export function normErr(text: string): string {
  const first = (text.split('\n')[0] ?? '').toLowerCase();
  return first
    .replace(/-[pp]\S+/g, 'SECRET')                                       // -pSECRET 内联凭据（已小写）
    .replace(/\S*[=:]\S{3,}/g, 'SECRET')                                  // key=val / key:val 内联（含短口令、URL）
    .replace(/[a-z]:\\[\\\S]*/g, 'PATH')                                  // Windows 路径 c:\...
    .replace(/\.{0,2}\/[\w./@\\-]+/g, 'PATH')                             // 绝对/相对 路径（含 ./ ../ /abs）
    .replace(/[~][\w./@-]+/g, 'PATH')                                     // ~ 家目录路径
    .replace(/0x[0-9a-f]+/g, 'HEX')
    .replace(/[a-z0-9_-]{16,}/g, 'TOKEN')                                 // 长 token（密钥/哈希）
    .replace(/\b(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]{4,15}\b/g, 'SECRET') // 4–15 位字母数字混合疑似令牌
    .replace(/\d+/g, '0')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** 净化单个 token：含路径 → PATH，长 token（密钥/哈希）→ TOKEN。不落盘原文，仅供 targetHash 前净化。 */
function sanitizeToken(t: string): string {
  if (t.includes('/') || t.startsWith('~') || t.startsWith('.')) return 'PATH';
  if (/[A-Za-z0-9_-]{16,}/.test(t)) return 'TOKEN';
  return t;
}

/**
 * targetHash 键（distill/2 §3）：卡碟"同目标"清除用。RUN 取命令头前 2 token（净化路径/长token）；
 * READ/WRITE 取主目标路径；其余动词空。返回 fnv1a hex 或 ''（键为空时不参与"同目标"约束）。
 */
export function targetHashOf(verb: Verb, input: Record<string, unknown> | undefined, command: string | undefined): string {
  let key = '';
  if (verb === 'RUN' || verb === 'SAVE') {
    if (command) key = command.trim().split(/\s+/).slice(0, 2).map(sanitizeToken).join(' ');
  } else if (verb === 'READ' || verb === 'WRITE') {
    // 主目标定位符：文件路径 / 目录 / 笔记本 / URL（WebFetch）/ 模式（Grep,Glob）。
    const p = input?.['file_path'] ?? input?.['path'] ?? input?.['notebook_path']
      ?? input?.['url'] ?? input?.['pattern'];
    if (typeof p === 'string' && p) key = p;
  }
  return key ? fnv1a(key) : '';
}

/** 从 tool_result 的 content（string 或 block[]）提取文本。仅蒸馏内部用，不落盘。 */
export function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && 'text' in b ? String((b as ContentBlock).text ?? '') : ''))
      .join('\n');
  }
  return '';
}

export function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// ---- 松散日志行类型 ----
export interface ContentBlock {
  type?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
  text?: string;
}
export interface RawMessage {
  role?: string;
  content?: ContentBlock[] | string;
  stop_reason?: string | null;
}
export interface RawLine {
  type?: string;
  timestamp?: string;
  uuid?: string;
  message?: RawMessage;
  toolUseResult?: Record<string, unknown> | string;
  isSidechain?: boolean;
  sourceToolAssistantUUID?: string;
}

// ---------- 原料量提取（原始 → mRaw；m 归一在消费侧 consume.ts） ----------

/** result 侧：structuredPatch 的改动行数；无有效 patch → null。（增量蒸馏两段式之一） */
export function patchLines(tur: Record<string, unknown> | undefined): number | null {
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
  return null;
}

/** use 侧：仅凭 tool_use input 的兜底行数（增量蒸馏在 use 时刻预存此值，不留原文）。 */
export function inputFallbackLines(input: Record<string, unknown> | undefined): number {
  const content = input?.['content'];
  if (typeof content === 'string') return content.split('\n').length;
  const oldS = typeof input?.['old_string'] === 'string' ? (input['old_string'] as string) : '';
  const newS = typeof input?.['new_string'] === 'string' ? (input['new_string'] as string) : '';
  return Math.max(oldS.split('\n').length, newS.split('\n').length);
}

export function writeDiffLines(input: Record<string, unknown> | undefined, tur: Record<string, unknown> | undefined): number {
  return patchLines(tur) ?? inputFallbackLines(input);
}

export function runSeconds(tur: Record<string, unknown> | undefined, useT: number, resT: number | null): number {
  const d = num(tur?.['durationMs']);
  if (d !== undefined) return d / 1000;
  if (resT !== null && resT > useT) return (resT - useT) / 1000;
  return 0;
}

export function readKb(tur: Record<string, unknown> | undefined, rtext: string): number {
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

// 尚未分段/未定 seq 的原料记录
interface PreMoment {
  useT: number;
  resolveT: number | null;
  t: number;
  verb: Verb;
  tool: string;
  outcome: Outcome;
  mKind: MKind;
  mRaw: number;
  durationMs: number | null;
  tags: string[];
  sig: string;
  targetHash: string;
  errClass: string | null;
  sidechain: boolean;
}

// ---------- 主蒸馏 ----------

/** 原始 JSONL 文本 → 蒸馏记录 + meta。唯一读原始的入口。 */
export function distillTape(text: string, params: Params): DistillResult {
  const extra = params.adapter.verbMapExtra;
  const episodeGapMs = params.adapter.episodeGapMin * 60_000;

  const rawLines = text.split('\n');
  const lineTypeCounts: Record<string, number> = {};
  const unknownTools: Record<string, number> = {};
  const resultsById = new Map<string, ResultRec>();

  let totalLines = 0, parsedLines = 0, badLines = 0, toolResultCount = 0, sidechainLines = 0, askToolCount = 0;
  let firstT: number | null = null, lastT: number | null = null;
  const parsed: RawLine[] = [];

  for (const raw of rawLines) {
    if (raw.trim() === '') continue;
    totalLines++;
    let o: RawLine;
    try { o = JSON.parse(raw) as RawLine; }
    catch { badLines++; continue; } // 解析失败：跳过、计数、禁 crash
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

    if (o.type === 'user' && o.message && Array.isArray(o.message.content)) {
      for (const b of o.message.content) {
        if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
          toolResultCount++;
          const tur = typeof o.toolUseResult === 'object' && o.toolUseResult !== null
            ? (o.toolUseResult as Record<string, unknown>) : undefined;
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

  // 第二遍：assistant tool_use → PreMoment（原料量，未分段）
  const pre: PreMoment[] = [];
  let toolUseCount = 0, pairedCount = 0, unpairedToolUse = 0;

  for (const o of parsed) {
    if (o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    const t = o.timestamp ? Date.parse(o.timestamp) : NaN;
    for (const b of o.message.content) {
      if (b.type !== 'tool_use' || typeof b.name !== 'string') continue;
      toolUseCount++;
      const name = b.name;
      if (name === 'AskUserQuestion') askToolCount++;
      if (!isKnownTool(name, extra)) unknownTools[name] = (unknownTools[name] ?? 0) + 1;

      const input = (b.input && typeof b.input === 'object') ? b.input : undefined;
      const command = typeof input?.['command'] === 'string' ? (input['command'] as string) : undefined;
      const verb: Verb = name === 'Bash' ? classifyBash(command, params.adapter) : verbOf(name, extra);

      const res = typeof b.id === 'string' ? resultsById.get(b.id) : undefined;
      if (res) pairedCount++; else unpairedToolUse++;

      let outcome: Outcome;
      if (!res) outcome = 'NA';
      else if (res.interrupted) outcome = 'NA';
      else if (res.isError) outcome = 'FAIL';
      else if (res.code !== undefined && res.code !== 0) outcome = 'FAIL';
      else outcome = 'OK';

      const useT = Number.isFinite(t) ? t : (firstT ?? 0);
      const resolveT = res?.t ?? null;
      const effectT = resolveT ?? useT;
      const durationMs = num(res?.tur?.['durationMs']) ?? null;

      // 原料量（不归一）
      let mKind: MKind, mRaw: number;
      switch (verb) {
        case 'WRITE': mKind = 'lines'; mRaw = writeDiffLines(input, res?.tur); break;
        case 'RUN': mKind = 'sec'; mRaw = runSeconds(res?.tur, useT, resolveT); break;
        case 'READ': mKind = 'kb'; mRaw = readKb(res?.tur, res?.text ?? ''); break;
        default: mKind = 'default'; mRaw = 0; // SAVE/ASK/SPAWN/OTHER 用默认幅度
      }

      const tags = verb === 'RUN' || verb === 'SAVE' ? tagsForCommand(command, params.adapter) : [];
      const errClass = outcome === 'FAIL' ? normErr(res?.text ?? '') : null;
      const sig = fnv1a(`${verb}|${name}|${errClass ?? ''}`);
      const targetHash = targetHashOf(verb, input, command);

      pre.push({
        useT, resolveT, t: effectT, verb, tool: name, outcome,
        mKind, mRaw, durationMs, tags, sig, targetHash, errClass, sidechain: o.isSidechain === true,
      });
    }
  }

  // 排序（效果时刻，稳定）
  pre.sort((a, b) => a.t - b.t);

  // 会话分段（§4.1）：相邻效果时刻空档 > episodeGapMs 切段
  const episodes: EpisodeInfo[] = [];
  const records: DistilledMoment[] = [];
  let seq = 0;
  const pushSpecial = (special: Special, t: number, episode: number): void => {
    records.push({
      t, useT: t, resolveT: t, seq: seq++, verb: 'OTHER', tool: '', outcome: 'NA',
      mKind: 'default', mRaw: 0, durationMs: null, tags: [], sig: null, targetHash: '', errClass: null,
      episode, sidechain: false, special,
    });
  };

  if (pre.length > 0) {
    // 分段边界
    const bounds: number[] = [0];
    for (let i = 1; i < pre.length; i++) {
      if (pre[i]!.t - pre[i - 1]!.t > episodeGapMs) bounds.push(i);
    }
    bounds.push(pre.length);
    for (let e = 0; e < bounds.length - 1; e++) {
      const lo = bounds[e]!, hi = bounds[e + 1]!;
      const startT = pre[lo]!.t, endT = pre[hi - 1]!.t;
      episodes.push({ i: e, startT, endT, events: hi - lo });
      pushSpecial('SESSION_START', startT, e);
      for (let i = lo; i < hi; i++) {
        const p = pre[i]!;
        records.push({
          t: p.t, useT: p.useT, resolveT: p.resolveT, seq: seq++,
          verb: p.verb, tool: p.tool, outcome: p.outcome, mKind: p.mKind, mRaw: p.mRaw,
          durationMs: p.durationMs, tags: p.tags, sig: p.sig, targetHash: p.targetHash, errClass: p.errClass,
          episode: e, sidechain: p.sidechain, special: null,
        });
      }
      pushSpecial('DONE', endT, e);
    }
  }

  const stats: DistillStats = {
    totalLines, parsedLines, badLines,
    parseCoverage: totalLines === 0 ? 1 : parsedLines / totalLines,
    lineTypeCounts, toolUseCount, toolResultCount, pairedCount, unpairedToolUse,
    sidechainLines, unknownTools, askToolCount, firstT, lastT,
  };
  const sourceHash = fnv1a(text);
  const meta: DistillMeta = { distiller: DISTILLER_VERSION, sourceHash, episodes, eventCount: pre.length, stats };
  return { records, meta };
}
