// selector-law.js 的类型面：实现在 selector-law.js（纯 JS·浏览器/Node 逐字同源——金测试直接吃本体），类型在此供 tsc。

export type SelectorState = 'off' | 'test' | 'on';
export type SelectorAction = 'none' | 'quick' | 'testDwell' | 'finale' | 'stop' | 'dark';

export const SELECTOR_DEG: { readonly off: number; readonly test: number; readonly on: number };
export const SELECTOR_FRAMES: number;
export const SELECTOR_DWELL_MS: number;
export const SELECTOR_STATES: readonly SelectorState[];

export function snapState(angle: number): SelectorState;
export function frameOf(angle: number): number;
export function selectorAction(prev: SelectorState, next: SelectorState): SelectorAction;
