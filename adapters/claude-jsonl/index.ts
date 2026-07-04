// claude-jsonl 适配器公开面：蒸馏 API 汇出 + §9 体检指标（吃蒸馏记录）。
// 唯一允许 import Node API 的适配层（parse.ts / consume.ts 保持纯）。

import type { DistilledMoment, DistillResult } from './parse.ts';

export {
  distillTape, DISTILLER_VERSION,
} from './parse.ts';
export type {
  DistilledMoment, DistillMeta, DistillResult, DistillStats, EpisodeInfo, MKind,
} from './parse.ts';
export { magnitudeOf, momentOf, clearSigOf } from './consume.ts';
export {
  serializeTape, parseDistilled, distillFile, loadDistilled, writeDistilled, redactResult,
} from './distill.ts';

/** §9 体检表指标。RESOLVE 为体检代理（test-tagged RUN-OK 存在）；精确 RESOLVE 属引擎。 */
export interface HealthCard {
  durationMin: number;       // 墙钟跨度（首末事件差）——多日续跑会虚高
  activeMin: number;         // 活跃时长：只累加 <10min 的相邻事件间隔（真实工作时长）
  eventCount: number;        // 元动作数（不含标点）
  failCount: number;
  failRate: number;          // fail /(OK+FAIL)，NA 不计入分母
  distinctSigs: number;
  maxSameSigRepeat: number;  // 10 分钟滑窗内同签名最大出现次数（FAIL）
  hasSave: boolean;
  hasResolveProxy: boolean;
  askToolCount: number;
  unknownToolCount: number;
  episodeCount: number;
}

const REP_WINDOW_MS = 600_000; // 10 分钟
const IDLE_GAP_MS = 600_000;   // 活跃时长切分阈

export function healthOf(d: DistillResult): HealthCard {
  const evs = d.records.filter((r) => !r.special);
  const failCount = evs.filter((m) => m.outcome === 'FAIL').length;
  const decided = evs.filter((m) => m.outcome === 'OK' || m.outcome === 'FAIL').length;
  const sigs = new Set(evs.map((m) => m.sig).filter(Boolean));
  const hasSave = evs.some((m) => m.verb === 'SAVE' && m.outcome === 'OK');
  const hasResolveProxy = evs.some((m) => m.verb === 'RUN' && m.outcome === 'OK' && m.tags.includes('test'));

  const { firstT, lastT } = d.meta.stats;
  const durationMin = firstT !== null && lastT !== null ? (lastT - firstT) / 60000 : 0;

  const ts = evs.map((m) => m.t).sort((a, b) => a - b);
  let activeMs = 0;
  for (let i = 1; i < ts.length; i++) {
    const gap = ts[i]! - ts[i - 1]!;
    if (gap > 0 && gap < IDLE_GAP_MS) activeMs += gap;
  }

  return {
    durationMin,
    activeMin: activeMs / 60000,
    eventCount: evs.length,
    failCount,
    failRate: decided === 0 ? 0 : failCount / decided,
    distinctSigs: sigs.size,
    maxSameSigRepeat: maxSameSigRepeat(evs),
    hasSave,
    hasResolveProxy,
    askToolCount: d.meta.stats.askToolCount,
    unknownToolCount: Object.values(d.meta.stats.unknownTools).reduce((a, b) => a + b, 0),
    episodeCount: d.meta.episodes.length,
  };
}

/** 10 分钟滑窗内任一签名的最大出现次数（仅 FAIL 计入卡碟统计）。 */
function maxSameSigRepeat(evs: DistilledMoment[]): number {
  const bySig = new Map<string, number[]>();
  for (const m of evs) {
    if (m.outcome !== 'FAIL' || !m.sig) continue;
    const arr = bySig.get(m.sig) ?? [];
    arr.push(m.t);
    bySig.set(m.sig, arr);
  }
  let best = 0;
  for (const times of bySig.values()) {
    times.sort((a, b) => a - b);
    let lo = 0;
    for (let hi = 0; hi < times.length; hi++) {
      while (times[hi]! - times[lo]! > REP_WINDOW_MS) lo++;
      best = Math.max(best, hi - lo + 1);
    }
  }
  return best;
}
