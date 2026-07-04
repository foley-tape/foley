// claude-jsonl 适配器公开面：fs 读取封装 + §9 体检指标计算。
// 唯一允许 import Node API 的适配层（parse.ts 保持纯）。

import { readFileSync } from 'node:fs';
import type { MomentEvent } from '../../protocol/index.ts';
import { parseTape, type ParseResult, type ParseStats } from './parse.ts';

export { parseTape } from './parse.ts';
export type { ParseResult, ParseStats } from './parse.ts';

export function parseTapeFile(path: string): ParseResult {
  return parseTape(readFileSync(path, 'utf8'));
}

/** §9 体检表指标。RESOLVE 为 M0 代理（test-tagged RUN-OK 存在），精确 RESOLVE 属 M1 引擎。 */
export interface HealthCard {
  durationMin: number; // 墙钟跨度（首末事件差）——多日续跑文件会虚高
  activeMin: number; // 活跃时长：只累加 <10min 的相邻事件间隔（真实工作时长）
  eventCount: number; // 元动作数（不含 SESSION_START/DONE 标点）
  failCount: number;
  failRate: number; // fail / (OK+FAIL)，NA 不计入分母
  distinctSigs: number;
  maxSameSigRepeat: number; // 10分钟滑窗内同签名最大出现次数
  hasSave: boolean;
  hasResolveProxy: boolean; // test-tagged RUN 成功（M0 代理）
  askToolCount: number;
  unknownToolCount: number;
}

const REP_WINDOW_MS = 600_000; // 10 分钟

export function healthOf(res: ParseResult): HealthCard {
  const evs = res.moments.filter((m) => !m.special); // 只算元动作
  const failCount = evs.filter((m) => m.outcome === 'FAIL').length;
  const decided = evs.filter((m) => m.outcome === 'OK' || m.outcome === 'FAIL').length;
  const sigs = new Set(evs.map((m) => m.sig).filter(Boolean));
  const hasSave = evs.some((m) => m.verb === 'SAVE' && m.outcome === 'OK');
  const hasResolveProxy = evs.some(
    (m) => m.verb === 'RUN' && m.outcome === 'OK' && m.tags.includes('test'),
  );

  const { firstT, lastT } = res.stats;
  const durationMin = firstT !== null && lastT !== null ? (lastT - firstT) / 60000 : 0;

  // 活跃时长：相邻事件间隔 <10min 才累加（剔除续跑文件的多日空档）
  const IDLE_GAP_MS = 600_000;
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
    askToolCount: res.stats.askToolCount,
    unknownToolCount: Object.values(res.stats.unknownTools).reduce((a, b) => a + b, 0),
  };
}

/** 10 分钟滑窗内任一签名的最大出现次数（FAIL 事件才计入卡碟统计）。 */
function maxSameSigRepeat(evs: MomentEvent[]): number {
  const bySig = new Map<string, number[]>(); // sig → 升序时间戳
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
