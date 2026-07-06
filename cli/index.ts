#!/usr/bin/env node
// cli 入口 —— 无参/play = 起播磁带机（deck）；子命令 = distill/scan/replay/live/probe/hunt/ear/… 工具。
// v0 范围梯：M0 = distill/scan；replay = M1；probe = M2；live/hunt = v1（M1.9）。

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runScan } from './scan.ts';
import { runReplay } from './replay.ts';
import { runDistill } from './distill.ts';
import { runProbe } from './probe.ts';
import { runSweep } from './sweep.ts';
import { runLive } from './live.ts';
import { runHunt } from './hunt.ts';
import { runEar } from './ear.ts';
import { runRuns } from './runs.ts';
import { runCalibrate } from './calibrate.ts';
import { runRenderCuts } from './rendercuts.ts';
import { runRecordsFetch } from './records-fetch.ts';

const cmd = process.argv[2];

function usage(): void {
  console.error('用法: foley            起播磁带机（尾随你最近的 Claude Code 会话，浏览器里现出唱机）');
  console.error('      foley <命令>     命令行工具：');
  console.error('  distill 原始 JSONL → 蒸馏带 .tape.jsonl（§3，唯一读原始处）');
  console.error('  scan    扫描 ~/.claude/projects，提名标准带候选（体检按 episode）');
  console.error('  replay  离线跑蒸馏带 → REPORT.md（判定表/占空比/拐点）[--hz 10|20]');
  console.error('  live    尾随生长中的原始 JSONL，20Hz 广播（M1.9 §1.1，bounded）');
  console.error('  hunt    磁带狩猎 v2：真卡碟带 + 释放带（M1.9 §1.3 判据）');
  console.error('  ear     机器耳朵（SOUND-R3 v3）：离线渲染 G1–G8 门（含唱片路径；G7 唱片在位 −20 LUFS）');
  console.error('  calibrate 定标轮（R3 §4.4）：CALIB 四常数实测 vs 冻结对照（只测不改）');
  console.error('  probe   探针页（v1 声音相：床＋前景＋调音抽屉）');
  console.error('  records 出厂音频（唱片+床音织体）：首启明示征询下载（哈希校验；拒绝照常起播——房间层/合成织体退路）');
}

// 无参 / play / deck：起播磁带机（hero 命令）——stage/serve.mjs 尾随最近会话＋供出唱机页。
// 参数透传（端口/--replay-only/--raw 等）。stage 零依赖、绑 127.0.0.1、运行时零外网。
if (!cmd || cmd === 'play' || cmd === 'deck') {
  const rest = process.argv.slice(3);
  const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const serve = join(pkgRoot, 'stage', 'serve.mjs');
  const child = spawn(process.execPath, [serve, ...rest], { stdio: 'inherit' });
  child.on('error', (e) => { console.error(`起播失败：${e.message}`); process.exit(1); });
  child.on('exit', (code) => process.exit(code ?? 0));
  // best-effort 开浏览器（防弹：无 opener／headless 一律静默，绝不崩起播）。--no-open 关。
  if (!rest.includes('--no-open')) {
    const port = Number(rest.find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? 4173);
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    setTimeout(() => {
      try {
        const b = spawn(opener, [`http://127.0.0.1:${port}/`], { stdio: 'ignore', detached: true });
        b.on('error', () => {});  // 无 opener：静默（serve 已打印 URL）
        b.unref();
      } catch { /* 静默 */ }
    }, 700);
  }
} else {
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
    case 'runs':
      runRuns(process.argv.slice(3));
      break;
    case 'calibrate':
      runCalibrate(process.argv.slice(3));
      break;
    case 'render-cuts':
      runRenderCuts(process.argv.slice(3));
      break;
    case 'records':
      runRecordsFetch(process.argv.slice(3)).catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
      break;
    case 'help':
    case '--help':
    case '-h':
      usage();
      break;
    default:
      usage();
      process.exit(2);
  }
}
