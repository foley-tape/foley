// cli 入口 —— scan / replay / live / probe 四命令。
// v0 范围梯：M0 仅 scan 可用；replay/live=M1，probe=M2。越级施工是缺陷，不是惊喜。

import { runScan } from './scan.ts';

const cmd = process.argv[2];

switch (cmd) {
  case 'scan':
    runScan();
    break;
  case 'replay':
    console.error('replay：M1 里程碑（引擎＋回放）。当前仅 M0 已开工。');
    process.exit(2);
    break;
  case 'live':
    console.error('live：M1 里程碑（尾随＋广播）。当前仅 M0 已开工。');
    process.exit(2);
    break;
  case 'probe':
    console.error('probe：M2 里程碑（探针页）。M1 首轮校准往返完成后方可开工（§10 闸门）。');
    process.exit(2);
    break;
  default:
    console.error('用法: node cli/index.ts <scan|replay|live|probe>');
    console.error('  scan   扫描 ~/.claude/projects，提名标准带候选（M0，本轮可用）');
    console.error('  replay 离线跑带 → REPORT.md（M1）');
    console.error('  live   尾随最近会话 → 本地 WS 广播（M1）');
    console.error('  probe  起素面探针页（M2）');
    process.exit(cmd ? 2 : 1);
}
