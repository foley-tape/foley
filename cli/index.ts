// cli 入口 —— distill / scan / replay / live / probe / hunt。
// v0 范围梯：M0 = distill/scan；replay = M1；probe = M2；live/hunt = v1（M1.9）。

import { runScan } from './scan.ts';
import { runReplay } from './replay.ts';
import { runDistill } from './distill.ts';
import { runProbe } from './probe.ts';
import { runSweep } from './sweep.ts';
import { runLive } from './live.ts';
import { runHunt } from './hunt.ts';
import { runEar } from './ear.ts';

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
  case 'sweep':
    runSweep(process.argv.slice(3));
    break;
  case 'probe':
    runProbe(process.argv.slice(3));
    break;
  case 'live':
    runLive(process.argv.slice(3));
    break;
  case 'hunt':
    runHunt(process.argv.slice(3));
    break;
  case 'ear':
    runEar(process.argv.slice(3));
    break;
  default:
    console.error('用法: node cli/index.ts <distill|scan|replay|live|hunt|probe>');
    console.error('  distill 原始 JSONL → 蒸馏带 .tape.jsonl（§3，唯一读原始处）');
    console.error('  scan    扫描 ~/.claude/projects，提名标准带候选（体检按 episode）');
    console.error('  replay  离线跑蒸馏带 → REPORT.md（判定表/占空比/拐点）[--hz 10|20]');
    console.error('  live    尾随生长中的原始 JSONL，20Hz 广播（M1.9 §1.1，bounded）');
    console.error('  hunt    磁带狩猎 v2：真卡碟带 + 释放带（M1.9 §1.3 判据）');
    console.error('  ear     声音层机器验收：五带床包络 × T 的 Pearson r（白皮书 §6.1）');
    console.error('  probe   探针页（v1 声音相：床＋前景＋调音抽屉）');
    process.exit(cmd ? 2 : 1);
}
