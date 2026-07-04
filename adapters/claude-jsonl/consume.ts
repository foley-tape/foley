// 消费侧：蒸馏记录 → 协议 MomentEvent。m 在此按 mRaw + params 归一（不在蒸馏时定死，
// 故改 amplitude/failDefault 无需重蒸馏）。纯函数。
//
// 施工令裁决①（A 增强版）：outcome=FAIL 时 m = max(amplitude.failDefault, 实测值)。
// 失败读没有内容 → 实测≈0 → 取兜底 0.3；90s 测试挂掉 → 实测≈0.63 → 取实测（更重）。

import type { MomentEvent, Outcome } from '../../protocol/index.ts';
import type { Params } from '../../engine/params.ts';
import { fnv1a, type DistilledMoment, type MKind } from './parse.ts';

/** verb|tool 身份哈希，供引擎"同 verb+tool 的 OK 清卡碟"匹配（driver 侧算）。 */
export function clearSigOf(r: DistilledMoment): string {
  return fnv1a(`${r.verb}|${r.tool}`);
}

/** 对数归一幅度：m = min(1, ln(1+x)/ln(1+cap))。 */
function amp(x: number, cap: number): number {
  if (x <= 0) return 0;
  return Math.min(1, Math.log(1 + x) / Math.log(1 + cap));
}

/** 原料量 → m。FAIL 以 failDefault 兜底（见文件头裁决①）。 */
export function magnitudeOf(mKind: MKind, mRaw: number, outcome: Outcome, params: Params): number {
  const a = params.amplitude;
  let measured: number;
  switch (mKind) {
    case 'lines': measured = amp(mRaw, a.writeDiffCap); break;
    case 'sec': measured = amp(mRaw, a.runSecCap); break;
    case 'kb': measured = amp(mRaw, a.readKbCap); break;
    default: measured = a.default;
  }
  return outcome === 'FAIL' ? Math.max(a.failDefault, measured) : measured;
}

/** 蒸馏记录 → 协议净版 MomentEvent。标点记录 m=0。 */
export function momentOf(r: DistilledMoment, params: Params): MomentEvent {
  const ev: MomentEvent = {
    kind: 'moment', t: r.t, seq: r.seq, agent: 'main',
    verb: r.verb, outcome: r.outcome,
    m: r.special ? 0 : magnitudeOf(r.mKind, r.mRaw, r.outcome, params),
    tags: r.tags,
  };
  if (r.special) ev.special = r.special;
  if (r.sig) ev.sig = r.sig;
  return ev;
}
