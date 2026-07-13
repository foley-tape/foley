// flapboard.js 的类型面：实现在 flapboard.js（纯 JS·金测试直接吃本体），类型在此供 tsc 检查。

export const FLAP_CELLS: number;
export const FLAP_CAP_MS: number;

export function planRoll(fromCh: string, toCh: string): number;
export function normalizeTitle(t: string | null | undefined): string;
export function capStep(maxSteps: number): number;
export function ringNext(ch: string): string;

export interface FlapBoard {
  set(title: string, opts?: { onSettle?: () => void }): void;
  sweep(opts?: { onSettle?: () => void }): void;           // ⑦POST 空翻：整环回原字·不改字
  readonly text: string;
}
export function mountFlapBoard(el: Element | null): FlapBoard | null;
export function mountTrackIndex(el: Element | null, titles: string[]): void;
