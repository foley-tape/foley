// cli probe —— M2 探针页。验收带全绿并经船长转达架构师签核后开工（施工令 §6/§8 闸门）。
// 此为闸门桩：在验收判定全绿前，拒绝越级施工。

export function runProbe(_argv: string[]): void {
  console.error('probe：M2 探针页处于闸门后。需先 replay 三带、§6 验收全绿，方可开工。');
  console.error('（越级施工是缺陷。当前请先跑 replay 校验。）');
  process.exit(2);
}
