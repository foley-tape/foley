// cli 入口 —— distill / scan / replay / live / probe。
// v0 范围梯：M0 = distill/scan；replay/live = M1；probe = M2。越级施工是缺陷，不是惊喜。

import { runScan } from './scan.ts';
import { runReplay } from './replay.ts';
import { runDistill } from './distill.ts';
import { runProbe } from './probe.ts';

const cmd = process.argv[2];

switch (cmd) {
  case 'distill':
    runDistill(process.argv.slice(3));
    break;
  case 'scan':
    runScan();
    break;
  case 'replay':
    runReplay(process.argv.slice(3));
    break;
  case 'probe':
    runProbe(process.argv.slice(3));
    break;
  case 'live':
    console.error('live：M1 直播尾随（尾随＋广播）。M2 探针就绪后接线。');
    process.exit(2);
    break;
  default:
    console.error('用法: node cli/index.ts <distill|scan|replay|probe>');
    console.error('  distill 原始 JSONL → 蒸馏带 .tape.jsonl（§3，唯一读原始处）');
    console.error('  scan    扫描 ~/.claude/projects，提名标准带候选（体检按 episode）');
    console.error('  replay  离线跑蒸馏带 → REPORT.md（判定表/占空比/拐点）');
    console.error('  probe   起素面探针页（M2：针＋曲线＋三音）');
    process.exit(cmd ? 2 : 1);
}
