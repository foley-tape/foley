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
  amplitude: { writeDiffCap: number; runSecCap: number; readKbCap: number; default: number; failDefault: number };
  release: {
    testResolveMinS: number; testResolveFactor: number; saveFactor: number;
    jamBreakFactor: number; jamBreakMinS: number;
    saveResolveMinS: number; // M1.8-F②：SAVE-OK 泄能照旧，但 RESOLVE 时刻仅 S≥此值才发（平静提交=卡座咔哒非和弦）
  };
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
  companions: {
    activityRateScale: number; wowWindow: number; wowSmoothingSec: number;
    idlePhaseSec: number; activityEmaSec: number;
  };
  spring: { up: SpringLaw; down: SpringLaw };
  adapter: {
    episodeGapMin: number;
    verbMapExtra: Record<string, string>;
    // M1.8-F①：token 集取代硬编码正则（分类改命令头结构化匹配，见 verbs.ts）。
    saveCommand: string[];            // ["git","commit"]：段头等于此序列 → SAVE
    testRunners: string[];            // 测试器：单词(jest/vitest/pytest…)或两词(cargo test/go test)
    buildTools: string[];             // 构建器：单词(tsc/webpack…)或两词(vite build/cargo build…)
    packageManagerRunners: string[];  // npm/pnpm/yarn/bun：run <script> 或直接 <script> 脚本名前缀匹配
  };
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
    adapter: p['adapter'],
  } as unknown as Params;
  for (const k of ['stress', 'amplitude', 'release', 'decay', 'weather', 'companions', 'spring', 'adapter'] as const) {
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

/** 任意 JSON 对象 → 确定性 8位hex（键排序、排除 _ 注释键）。供 params/verdict 等一切事实源。 */
export function hashJson(raw: unknown): string {
  const s = stableStringify(raw);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** FNV-1a 32-bit → 8位hex。引擎输出携带此 paramsHash。 */
export const hashParams = hashJson;
