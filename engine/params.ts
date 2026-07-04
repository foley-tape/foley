// 参数唯一事实源的类型 + 确定性哈希（§6.5）。
// 纯：无 Node、无 Date.now、无随机。CLI 负责从 params.json 读文本并 JSON.parse 后传入。

import type { Verb } from '../protocol/index.ts';

export interface Params {
  stress: {
    S0: number;
    verbWeights: Record<Verb, number>;
    repWindowMs: number;
    repBase: number;
    repCap: number;
    stuckLoopK: number;
  };
  amplitude: { writeDiffCap: number; runSecCap: number; readKbCap: number; default: number };
  release: { testResolveMinS: number; testResolveFactor: number; saveFactor: number };
  decay: {
    tauActiveSec: number;
    tauIdleSec: number;
    idleThresholdSec: number;
    pendingRunDripAfterSec: number;
    pendingRunDripPerMin: number;
  };
  weather: {
    up: { OVERCAST: number; RAIN: number; STORM: number };
    hysteresis: number;
    stormExit: number;
  };
  companions: { activityRateScale: number; wowWindow: number; wowSmoothingSec: number; idlePhaseSec: number };
  spring: { up: SpringLaw; down: SpringLaw };
}
export interface SpringLaw { zeta: number; omegaN: number }

/** JSON（含 _source 注释键）→ 强类型 Params。缺字段即抛（参数是地基，不容默认漂移）。 */
export function resolveParams(raw: unknown): Params {
  if (!raw || typeof raw !== 'object') throw new Error('params 必须是对象');
  const p = raw as Record<string, unknown>;
  // 结构在编译期已约束；此处直接投影（值来自唯一事实源文件）
  const out = {
    stress: p['stress'],
    amplitude: p['amplitude'],
    release: p['release'],
    decay: p['decay'],
    weather: p['weather'],
    companions: p['companions'],
    spring: p['spring'],
  } as unknown as Params;
  for (const k of ['stress', 'amplitude', 'release', 'decay', 'weather', 'companions', 'spring'] as const) {
    if (!out[k]) throw new Error(`params 缺少 ${k} 段`);
  }
  return out;
}

/** 键排序稳定序列化（排除 _ 前缀注释键），供确定性哈希。 */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as Record<string, unknown>).filter((k) => !k.startsWith('_')).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',') + '}';
}

/** FNV-1a 32-bit → 8位hex。引擎输出携带此 paramsHash。 */
export function hashParams(raw: unknown): string {
  const s = stableStringify(raw);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
