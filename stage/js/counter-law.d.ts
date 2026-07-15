// counter-law.js 的类型面：实现在 counter-law.js（纯 JS·浏览器/Node 逐字同源——金测试直接吃本体），类型在此供 tsc。

export const COUNTER_FRAMES: number;
export const COUNTER_TAU_MS: number;
export const COUNTER_K_COUNT: number;
export const COUNTER_SNAP_EPS: number;

export function wrapDelta(from: number, to: number): number;
export function dampStep(pos: number, target: number, dtMs: number): number;
export function counterFrameOf(pos: number): number;
export function digitsOf(count: number): [number, number, number, number];
export function countFromTheta(theta: number): number;
