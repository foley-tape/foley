// seal-law.js 的类型面：实现在 seal-law.js（纯 JS，浏览器/Node 逐字同源——金测试直接吃本体），类型在此供 tsc 检查。

export const SEAL_LAW_VER: number;

export interface SealDef {
  id: string; en: string; zh: string;
  band: [number, number];   // 词汇表 v1 分布目标（%）
  blurb: string;
}
export const SEALS: SealDef[];   // 数组序＝优先序（粗混＞抢救＞一条过＞跳针＞长版＞即兴＞小样＞样片）

export interface SealThresholds {
  oneTakeMaxFails: number; oneTakeMaxPeakT: number;
  grooveMinRepeat: number; grooveLocalWindowS: number;   // v2：锁槽=局域态
  salvageHighT: number; salvageDwellS: number; salvageEndT: number;
  roughEndT: number; endWindowS: number; tailErrWindowS: number;   // v2：近期错误未平
  jamMinS: number; jamMinFiles: number;
  demoMaxS: number; longPlayMinS: number;
  skeletonN: number;
}
export const SEAL_THRESHOLDS: SealThresholds;

export interface SealFeatures {
  durS: number;
  tPeak: number; tEndMean: number; tHighDwellS: number;
  tSkeleton: Float64Array;         // 张力曲线→骨架（指纹消费者·阶段二）
  storm: boolean;
  fails: number; distinctSigs: number; maxSameSigRepeat: number;
  maxSameSigLocal: number;         // v2：局域窗内同签名最大连撞（判章粮；全带累计归指纹/报告）
  tailUnresolved: boolean;         // v2：尾窗 FAIL 后无实质解决（RESOLVE/STUCK_CLEARED；DONE 不算）
  files: number;                   // 独立目标槽数＝文件数代理
  stuckEdges: number; cleared: number; resolves: number; asks: number; done: number;
  moments: number;
}
export function extractFeatures(tape: unknown, th?: SealThresholds): SealFeatures;

export interface SealCheck { id: string; hit: boolean; why: string; }
export interface SealVerdict { id: string; en: string; zh: string; reason: string; checks: SealCheck[]; }
export function judgeSeal(features: SealFeatures, th?: SealThresholds): SealVerdict;

export const C_LADDER: number[];
export function snapC(durS: number): string;
