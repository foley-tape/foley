// 增量蒸馏器（M1.9 §1.1 v1-live）：原始 JSONL **逐行** → 因果驱动操作（LiveOp）。
// 与批式 distillTape 同源：verb 分类 / normErr / targetHash / sig / 幅度原料全部复用 parse.ts 同一套函数。
// 两管线等价由金测试断言（golden/m19.test.ts：同一原始卷，批式→replay 与 增量→live 逐字节一致）。
//
// 【隐私膜】与 parse.ts 同纪律：这是唯一读原始行的地方。pending 表只存骨架
// （useT/verb/tool/tags/targetHash/兜底行数），工具输入原文、对话内容一律不留。
//
// 因果限制（如实记录，不硬造）：
//  - 未决 tool_use（结果永不到）在批式磁带里占 seq 槽位；增量侧到流尾才可知，因此
//    含未决的卷 moments.csv 的 seq 与批式有让位（curve 不受影响）。金测试用全配对卷。
//  - 无 timestamp 的行：批式回退全局 firstT（增量不可知）→ 回退最近见过的时戳。真实日志皆有时戳。
//  - 同毫秒多 ASK 开窗的行序：批式按磁带 seq，增量按 use 到达序——病理场景，记录在案。
//
// 同刻操作次序正典（与 cli/driver.ts actionsOf 一致）：
//   DONE(retro)=0 < SESSION_START=1 < askClose=2 < land=3(按 seq) < askOpen=4 < DONE(final)=5 < drip=6

import type { Verb, Outcome, Special } from '../../protocol/index.ts';
import type { Params } from '../../engine/params.ts';
import { verbOf, classifyBash, tagsForCommand, isKnownTool } from './verbs.ts';
import {
  fnv1a, normErr, targetHashOf, resultText, num, patchLines, inputFallbackLines, runSeconds, readKb,
  type DistilledMoment, type MKind, type RawLine, type ContentBlock,
} from './parse.ts';

/** 驱动操作：live 运行器依序 apply 到 Driver。t = 动作时刻（retro DONE 时 > rec.t）。 */
export interface LiveOp {
  t: number;
  op: 'punct' | 'askClose' | 'land' | 'askOpen' | 'dripAdd' | 'dripClose';
  rec?: DistilledMoment;
  key?: string;       // dripAdd/dripClose
  useT?: number;      // dripAdd
  end?: number;       // dripAdd（未决 = Infinity）
}

export interface IncrementalStats {
  totalLines: number;
  parsedLines: number;
  badLines: number;
  toolUseCount: number;
  toolResultCount: number;
  pairedCount: number;
  unpairedOpen: number;   // 当前仍未决（有界：≤未回收 tool_use 数）
  askToolCount: number;
  unknownTools: Record<string, number>;
  eventCount: number;     // 已落地（非标点）
  episodeCount: number;
}

interface Pend {
  useT: number;
  useIdx: number;
  verb: Verb;
  tool: string;
  tags: string[];
  targetHash: string;
  fallbackLines: number;  // WRITE 兜底（use 侧预存，不留原文）
  sidechain: boolean;
  isAsk: boolean;
}

// 缓冲条目：等待同刻齐全后按正典序出队
interface BufRec { kind: 'rec'; t: number; useIdx: number; rec: Omit<DistilledMoment, 'seq' | 'episode'>; isAsk: boolean }
interface BufOpen { kind: 'askOpen'; t: number; useIdx: number; rec: DistilledMoment }
interface BufDrip { kind: 'dripAdd' | 'dripClose'; t: number; useIdx: number; key: string; useT?: number }
type BufEntry = BufRec | BufOpen | BufDrip;

export interface IncrementalDistiller {
  /** 喂一行原始 JSONL。返回已按正典序排好的驱动操作（时间早于本行时戳的都会出队）。 */
  feedLine(line: string): LiveOp[];
  /** 实时模式：墙钟越过 (条目 t + lagMs) 的缓冲强制出队（无后续行也要让琥珀管呼吸）。 */
  flushDue(wallT: number, lagMs?: number): LiveOp[];
  /** EOF/停机：冲干净缓冲 + 段尾 DONE。 */
  close(): LiveOp[];
  stats(): IncrementalStats;
}

export function createIncrementalDistiller(params: Params): IncrementalDistiller {
  const extra = params.adapter.verbMapExtra;
  const episodeGapMs = params.adapter.episodeGapMin * 60_000;

  const pending = new Map<string, Pend>(); // tool_use id → 骨架（有界：未决数）
  let buf: BufEntry[] = [];

  let useIdx = 0;          // tool_use 到达序（批式 pre 稳定序的因果镜像）
  let seq = 0;             // 与批式磁带 seq 同步推进（全配对卷下逐一相等）
  let episode = -1;
  let lastEffectT: number | null = null;
  let lastSeenTs = 0;      // 无时戳行的回退
  let closed = false;

  const st: IncrementalStats = {
    totalLines: 0, parsedLines: 0, badLines: 0,
    toolUseCount: 0, toolResultCount: 0, pairedCount: 0, unpairedOpen: 0,
    askToolCount: 0, unknownTools: {}, eventCount: 0, episodeCount: 0,
  };

  const punctRec = (special: Special, t: number, ep: number): DistilledMoment => ({
    t, useT: t, resolveT: t, seq: seq++, verb: 'OTHER', tool: '', outcome: 'NA',
    mKind: 'default', mRaw: 0, durationMs: null, tags: [], sig: null, targetHash: '', errClass: null,
    episode: ep, sidechain: false, special,
  });

  /** 冲出 t < before 的缓冲组（按 t 升序、组内正典序）。 */
  const flushBefore = (before: number): LiveOp[] => {
    if (buf.length === 0) return [];
    const due = buf.filter((e) => e.t < before);
    if (due.length === 0) return [];
    buf = buf.filter((e) => e.t >= before);
    due.sort((a, b) => a.t - b.t || a.useIdx - b.useIdx);

    const out: LiveOp[] = [];
    let i = 0;
    while (i < due.length) {
      const t = due[i]!.t;
      const group: BufEntry[] = [];
      while (i < due.length && due[i]!.t === t) group.push(due[i++]!);

      const recs = group.filter((e): e is BufRec => e.kind === 'rec'); // 已按 useIdx
      // 分段（§4.1）：与批式同判据——相邻效果时刻空档 > gap 切段；DONE 因果延迟到检测时刻
      if (recs.length > 0) {
        if (lastEffectT === null) {
          episode = 0; st.episodeCount = 1;
          out.push({ t, op: 'punct', rec: punctRec('SESSION_START', t, episode) });
        } else if (t - lastEffectT > episodeGapMs) {
          out.push({ t, op: 'punct', rec: punctRec('DONE', lastEffectT, episode) }); // rank0：retro
          episode++; st.episodeCount++;
          out.push({ t, op: 'punct', rec: punctRec('SESSION_START', t, episode) }); // rank1
        }
      }
      // seq 分配：同刻全部落地记录按 useIdx（批式稳定序的镜像）
      const landed = recs.map((e) => ({ e, rec: { ...e.rec, seq: seq++, episode } as DistilledMoment }));
      // rank2：askClose
      for (const { e, rec } of landed) if (e.isAsk) out.push({ t, op: 'askClose', rec });
      // rank3：land（非 ASK）
      for (const { e, rec } of landed) {
        if (!e.isAsk) { out.push({ t, op: 'land', rec }); st.eventCount++; }
      }
      // rank4：askOpen
      for (const e of group) if (e.kind === 'askOpen') out.push({ t, op: 'askOpen', rec: e.rec });
      // rank6：drip
      for (const e of group) {
        if (e.kind === 'dripAdd') out.push({ t, op: 'dripAdd', key: e.key, useT: e.useT!, end: Infinity });
        else if (e.kind === 'dripClose') out.push({ t, op: 'dripClose', key: e.key });
      }
      if (recs.length > 0) lastEffectT = t;
    }
    return out;
  };

  const feedLine = (line: string): LiveOp[] => {
    if (closed || line.trim() === '') return [];
    st.totalLines++;
    let o: RawLine;
    try { o = JSON.parse(line) as RawLine; }
    catch { st.badLines++; return []; } // 坏行：跳过、计数、禁 crash（与批式同纪律）
    st.parsedLines++;
    const ts = o.timestamp ? Date.parse(o.timestamp) : NaN;
    const lineT = Number.isFinite(ts) ? ts : lastSeenTs;
    if (Number.isFinite(ts)) lastSeenTs = Math.max(lastSeenTs, ts);

    // assistant → tool_use：开 pending（ASK 开窗 / RUN|SAVE 滴灌注册）
    if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) {
      for (const b of o.message.content) {
        if (b.type !== 'tool_use' || typeof b.name !== 'string') continue;
        st.toolUseCount++;
        const name = b.name;
        if (name === 'AskUserQuestion') st.askToolCount++;
        if (!isKnownTool(name, extra)) st.unknownTools[name] = (st.unknownTools[name] ?? 0) + 1;
        const input = (b.input && typeof b.input === 'object') ? b.input : undefined;
        const command = typeof input?.['command'] === 'string' ? (input['command'] as string) : undefined;
        const verb: Verb = name === 'Bash' ? classifyBash(command, params.adapter) : verbOf(name, extra);
        const p: Pend = {
          useT: lineT, useIdx: useIdx++, verb, tool: name,
          tags: verb === 'RUN' || verb === 'SAVE' ? tagsForCommand(command, params.adapter) : [],
          targetHash: targetHashOf(verb, input, command),
          fallbackLines: verb === 'WRITE' ? inputFallbackLines(input) : 0,
          sidechain: o.isSidechain === true,
          isAsk: verb === 'ASK',
        };
        if (typeof b.id === 'string') { pending.set(b.id, p); st.unpairedOpen = pending.size; }
        if (p.isAsk) {
          // askOpen 骨架：driver 只用 verb/tool/mKind/mRaw/tags/sig/useT（t/seq/outcome 被覆写）
          buf.push({
            kind: 'askOpen', t: p.useT, useIdx: p.useIdx,
            rec: {
              t: p.useT, useT: p.useT, resolveT: null, seq: -1, verb: 'ASK', tool: name, outcome: 'NA',
              mKind: 'default', mRaw: 0, durationMs: null, tags: [], sig: fnv1a(`ASK|${name}|`),
              targetHash: p.targetHash, errClass: null, episode: Math.max(episode, 0), sidechain: p.sidechain, special: null,
            },
          });
        } else if (verb === 'RUN' || verb === 'SAVE') {
          buf.push({ kind: 'dripAdd', t: p.useT, useIdx: p.useIdx, key: `u${p.useIdx}`, useT: p.useT });
        }
      }
    }

    // user → tool_result：配对落地
    if (o.type === 'user' && o.message && Array.isArray(o.message.content)) {
      for (const b of o.message.content) {
        if (b.type !== 'tool_result' || typeof b.tool_use_id !== 'string') continue;
        st.toolResultCount++;
        const p = pending.get(b.tool_use_id);
        if (!p) continue; // 孤儿 result：计数即弃（与批式"未匹配即无事件"一致）
        pending.delete(b.tool_use_id);
        st.unpairedOpen = pending.size;
        st.pairedCount++;

        const tur = typeof o.toolUseResult === 'object' && o.toolUseResult !== null
          ? (o.toolUseResult as Record<string, unknown>) : undefined;
        const rtext = resultText((b as ContentBlock).content);
        const resolveT = lineT;
        const interrupted = tur?.['interrupted'] === true;
        const code = num(tur?.['code']);
        let outcome: Outcome;
        if (interrupted) outcome = 'NA';
        else if (b.is_error === true) outcome = 'FAIL';
        else if (code !== undefined && code !== 0) outcome = 'FAIL';
        else outcome = 'OK';

        let mKind: MKind, mRaw: number;
        switch (p.verb) {
          case 'WRITE': mKind = 'lines'; mRaw = patchLines(tur) ?? p.fallbackLines; break;
          case 'RUN': mKind = 'sec'; mRaw = runSeconds(tur, p.useT, resolveT); break;
          case 'READ': mKind = 'kb'; mRaw = readKb(tur, rtext); break;
          default: mKind = 'default'; mRaw = 0;
        }
        const errClass = outcome === 'FAIL' ? normErr(rtext) : null;
        const sig = fnv1a(`${p.verb}|${p.tool}|${errClass ?? ''}`);

        buf.push({
          kind: 'rec', t: resolveT, useIdx: p.useIdx, isAsk: p.isAsk,
          rec: {
            t: resolveT, useT: p.useT, resolveT, verb: p.verb, tool: p.tool, outcome,
            mKind, mRaw, durationMs: num(tur?.['durationMs']) ?? null,
            tags: p.tags, sig, targetHash: p.targetHash, errClass,
            sidechain: p.sidechain, special: null,
          },
        });
        if (!p.isAsk && (p.verb === 'RUN' || p.verb === 'SAVE')) {
          buf.push({ kind: 'dripClose', t: resolveT, useIdx: p.useIdx, key: `u${p.useIdx}` });
        }
      }
    }

    // 本行时戳之前的缓冲可以安全出队（同刻的还在等潜在同刻兄弟）
    return flushBefore(lineT);
  };

  return {
    feedLine,
    flushDue(wallT, lagMs = 200) {
      return flushBefore(wallT - lagMs);
    },
    close() {
      if (closed) return [];
      closed = true;
      const out = flushBefore(Infinity);
      if (lastEffectT !== null) {
        out.push({ t: lastEffectT, op: 'punct', rec: punctRec('DONE', lastEffectT, episode) });
      }
      return out;
    },
    stats: () => st,
  };
}
