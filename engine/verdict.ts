// 判据即数据（M1.6-A §3.4）。verdict.json 的强类型 + 纯判定器。
// 纯：无 Node、无 fs（CLI 读文本并 JSON.parse 后传入）。judgeBand 供 replay 与 sweep 共用。

export interface Range { min?: number; max?: number; eq?: number }
export interface RainOrDuty { dutyMin: number; dutyMax: number; rMin: number }

/** 单带判据（含 _role 等注释键，评估时忽略）。 */
export interface BandCriteria {
  peakT?: Range;
  dutyTlt30?: Range;
  dutyRainStorm?: Range;
  rainR?: Range;
  stuckEdges?: Range;
  jamMonotone?: boolean;
  rainOrDuty?: RainOrDuty;
  resolveOnOpportunity?: boolean;
}

export interface Landmark {
  id: string; tape: string; desc: string; kind: string;
  fromUtc?: string; toUtc?: string; minPeakT?: number;
  windowSec?: number; minRelDrop?: number; episode?: number;
}

export interface Verdict {
  verdictVersion: string;
  rain: { floor: number; unit: string; provisional: boolean };
  bands: Record<string, BandCriteria>;
  landmarks: Landmark[];
}

/** 判定所需的指标视图（replay 侧算好后喂入）。 */
export interface MetricsView {
  peakT: number;
  dutyTlt30: number;
  dutyRainStorm: number;
  rainR: number;
  stuckEdges: number;
  resolves: number;
  opportunities: number;   // 机会数 = test-OK + SAVE-OK + 同类 OK 破卡碟（§5）
  jamMonotone: boolean;
}

export interface JudgeRow { label: string; value: string; ok: boolean }
export interface LandmarkResult { id: string; desc: string; ok: boolean; detail: string }

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const f3 = (x: number): string => x.toFixed(3);

function inRange(v: number, r: Range): boolean {
  if (r.eq !== undefined) return v === r.eq;
  if (r.min !== undefined && v < r.min) return false;
  if (r.max !== undefined && v > r.max) return false;
  return true;
}
function rangeLabel(r: Range): string {
  if (r.eq !== undefined) return `=${r.eq}`;
  if (r.min !== undefined && r.max !== undefined) return `∈[${r.min},${r.max}]`;
  if (r.min !== undefined) return `≥${r.min}`;
  if (r.max !== undefined) return `≤${r.max}`;
  return '';
}

/** 判据 × 指标 → 判定行 + 全绿标志。键顺序固定（确定性、可读）。 */
export function judgeBand(c: BandCriteria, m: MetricsView): { rows: JudgeRow[]; allGreen: boolean } {
  const rows: JudgeRow[] = [];
  const push = (label: string, value: string, ok: boolean): void => { rows.push({ label, value, ok }); };
  if (c.peakT) push(`峰值T ${rangeLabel(c.peakT)}`, f3(m.peakT), inRange(m.peakT, c.peakT));
  if (c.dutyTlt30) push(`T<0.30 占空 ${rangeLabel(c.dutyTlt30)}`, pct(m.dutyTlt30), inRange(m.dutyTlt30, c.dutyTlt30));
  if (c.dutyRainStorm) push(`RAIN+STORM 占空 ${rangeLabel(c.dutyRainStorm)}`, pct(m.dutyRainStorm), inRange(m.dutyRainStorm, c.dutyRainStorm));
  if (c.rainOrDuty) {
    const dutyOk = m.dutyRainStorm >= c.rainOrDuty.dutyMin && m.dutyRainStorm <= c.rainOrDuty.dutyMax;
    const rOk = m.rainR >= c.rainOrDuty.rMin;
    push(`占空∈[${pct(c.rainOrDuty.dutyMin)},${pct(c.rainOrDuty.dutyMax)}] 或 雨量R≥${c.rainOrDuty.rMin}`,
      `占空${pct(m.dutyRainStorm)} / R=${m.rainR.toFixed(2)}`, dutyOk || rOk);
  }
  if (c.rainR) push(`雨量R ${rangeLabel(c.rainR)} T·min`, m.rainR.toFixed(2), inRange(m.rainR, c.rainR));
  if (c.stuckEdges) push(`STUCK_LOOP 边沿 ${rangeLabel(c.stuckEdges)}`, `${m.stuckEdges}`, inRange(m.stuckEdges, c.stuckEdges));
  if (c.jamMonotone) push('卡碟段内 T 单调不减', m.jamMonotone ? '是' : '否', m.jamMonotone);
  if (c.resolveOnOpportunity) {
    const ok = m.opportunities === 0 || m.resolves >= 1;
    push('机会>0 则 RESOLVE≥1', `机会${m.opportunities}/RESOLVE${m.resolves}`, ok);
  }
  return { rows, allGreen: rows.length > 0 && rows.every((r) => r.ok) };
}

function rangeViol(v: number, r: Range): number {
  if (r.eq !== undefined) return Math.abs(v - r.eq);
  let d = 0;
  if (r.min !== undefined && v < r.min) d = Math.max(d, r.min - v);
  if (r.max !== undefined && v > r.max) d = Math.max(d, v - r.max);
  return d;
}

/** 归一化违规量（0=全过），供帕累托冠军排序（M1.6-A §5）。各判据违规归一到可比尺度后求和。 */
export function bandViolation(c: BandCriteria, m: MetricsView): number {
  let v = 0;
  if (c.peakT) v += rangeViol(m.peakT, c.peakT);                         // T 单位 0–1
  if (c.dutyTlt30) v += Math.max(0, (c.dutyTlt30.min ?? 0) - m.dutyTlt30);
  if (c.dutyRainStorm) v += Math.max(0, m.dutyRainStorm - (c.dutyRainStorm.max ?? 1));
  if (c.rainR && c.rainR.max) v += Math.max(0, m.rainR - c.rainR.max) / c.rainR.max;
  if (c.stuckEdges) v += rangeViol(m.stuckEdges, c.stuckEdges) / Math.max(1, c.stuckEdges.max ?? c.stuckEdges.min ?? 1);
  if (c.jamMonotone) v += m.jamMonotone ? 0 : 1;
  if (c.rainOrDuty) {
    const dutyViol = rangeViol(m.dutyRainStorm, { min: c.rainOrDuty.dutyMin, max: c.rainOrDuty.dutyMax });
    const rViol = Math.max(0, c.rainOrDuty.rMin - m.rainR) / c.rainOrDuty.rMin;
    v += Math.min(dutyViol, rViol); // OR：取更近可满足者
  }
  if (c.resolveOnOpportunity) v += (m.opportunities > 0 && m.resolves < 1) ? 1 : 0;
  return v;
}
