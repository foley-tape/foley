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
import { runHook } from './hook.ts';
import { runConnect, offerConnect } from './connect.ts';
import { runDoctor } from './doctor.ts';

const cmd = process.argv[2];

function usage(): void {
  console.error('用法: foley [端口] [--no-open] [--replay-only]   起播磁带机（尾随你最近的 Claude Code 会话，浏览器里现出唱机）');
  console.error('                     裸命令即正门；端口/旗标直接透传（play/deck 为同义子命令）');
  console.error('      foley <命令>   命令行工具：');
  console.error('  distill 原始 JSONL → 蒸馏带 .tape.jsonl（事件蒸馏唯一入口；本地标题另只读首句；默认脱敏，--raw 保留精确源指纹/明文错误类，勿外传）');
  console.error('  scan    扫描 ~/.claude/projects，提名标准带候选（体检按 episode）');
  console.error('  replay  离线跑蒸馏带 → REPORT.md（判定表/占空比/拐点）[--hz 10|20]');
  console.error('  live    尾随生长中的原始 JSONL，20Hz 广播（M1.9 §1.1，bounded）');
  console.error('  hunt    磁带狩猎 v2：真卡碟带 + 释放带（M1.9 §1.3 判据）');
  console.error('  ear     机器耳朵（SOUND-R3 v3）：离线渲染 G1–G8 门（含唱片路径；G7 唱片在位 −20 LUFS）');
  console.error('  calibrate 定标轮（R3 §4.4）：CALIB 四常数实测 vs 冻结对照（只测不改）');
  console.error('  probe   探针页（v1 声音相：床＋前景＋调音抽屉）');
  console.error('  records 出厂音频（唱片+床音织体）：显式 records fetch 后明示征询下载（哈希校验；拒绝照常起播——房间层/合成织体退路）');
  console.error('  connect 接线：收工吐卡接进你的 Claude Code（征询后分层写 ~/.claude/settings.json 的 SessionEnd 钩子）');
  console.error('  doctor  体检：一条命令答"它到底接了啥"——项目/会话数/live 尾随谁/唱片在位/音频/serve 状态（只读）');
  console.error('  hook    （内部）SessionEnd 钩子落纸头——connect 代装；stdin 钩子 JSON → ~/.foley/spool/');
}

// 无参 / play / deck / 端口 / 旗标：起播磁带机（hero 命令）——stage/serve.mjs 尾随最近会话＋供出唱机页。
// 参数透传（端口/--replay-only/--raw 等）。stage 零依赖、绑 127.0.0.1、运行时零外网。
// B2（三号手令·丙）：首参为端口或旗标时同样走正门——注释所许即参数面所许，`foley 4180 --no-open` 直达。
const isHelp = cmd === 'help' || cmd === '--help' || cmd === '-h';
const isDeck = !isHelp && (!cmd || cmd === 'play' || cmd === 'deck' || /^\d+$/.test(cmd) || cmd.startsWith('-'));
if (isDeck) {
  const rest = process.argv.slice(cmd === 'play' || cmd === 'deck' ? 3 : 2);
  const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const serve = join(pkgRoot, 'stage', 'serve.mjs');
  const boot = (): void => {
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
  };
  // 轨乙②首启征询：接线问答先于起播（TTY 四门全过才开口；15s 不答自动放行）——绝不拦死正门
  offerConnect().finally(boot);
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
    case 'connect':
      runConnect(process.argv.slice(3)).catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
      break;
    case 'doctor':
      runDoctor(process.argv.slice(3)).catch((e) => { console.error(String(e?.message || e)); process.exit(1); });
      break;
    case 'hook':
      runHook(process.argv.slice(3));
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
