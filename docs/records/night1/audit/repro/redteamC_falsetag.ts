// 红队C · 恶意/无辜磁带 —— tag 正则误匹配 → 误发 RESOLVE + 误泄能（后果链，气味线索C）。
// 目标：命令里带 "test" 一词但不是测试 / echo 里出现 "git commit" 但不是提交 →
//   被贴 test 标签 / 升格 SAVE → 在 S>0.3 时误发 RESOLVE（假解脱）并乘法泄真实张力。
// 只读审计：import 真实 verbs + 全 distill→replay 管线，不改源码。
//
// 运行：node audit/repro/redteamC_falsetag.ts

import { classifyBash, tagsForCommand } from '../../adapters/claude-jsonl/verbs.ts';
import { distillTape, serializeTape } from '../../adapters/claude-jsonl/index.ts';
import { replayText } from '../../cli/replay.ts';
import { resolveParams } from '../../engine/params.ts';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const params = resolveParams(JSON.parse(readFileSync(join(here, '..', '..', 'params.json'), 'utf8')));
const META = { engineSha: 'audit', paramsHash: 'audit', tapeName: 'redteamC' };

console.log('═══ 红队C · tag/SAVE 正则误匹配面 ═══\n');
console.log('这些命令都不是测试/提交，但被贴标签/升格：\n');
const benign = [
  'grep -rn "test" src/',          // 搜索"test"这个词，不是跑测试
  './scripts/test.sh --dry',       // 名字含 test 的脚本
  'cat notes_about_test_plan.md',  // 读文件
  'echo "remember to git commit later"',   // 提醒文本，不是提交
  'git log --grep="commit fix"',   // 查日志，不是提交
  'rm -rf ./test',                 // 删目录
  'docker build -t app .',         // build（可能是有意的）
];
for (const cmd of benign) {
  const verb = classifyBash(cmd);
  const tags = tagsForCommand(cmd);
  const flag = (verb === 'SAVE' || tags.includes('test')) ? '  ⚠️ 误判' : '';
  console.log(`  ${verb.padEnd(4)} tags=[${tags.join(',')}]  ← ${cmd}${flag}`);
}

// ---- 端到端：先攒张力，再来一条无辜的含"test"命令 → 看是否误发 RESOLVE ----
console.log('\n═══ 端到端后果链：无辜命令误泄真实张力 ═══\n');
function ev(id: string, cmd: string, useSec: number, dur: number, err: boolean, errText = 'boom'): string[] {
  const useT = new Date(Date.UTC(2026, 6, 4, 10, 0, useSec)).toISOString();
  const resT = new Date(Date.UTC(2026, 6, 4, 10, 0, useSec) + dur).toISOString();
  return [
    JSON.stringify({ type: 'assistant', timestamp: useT, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: cmd } }] } }),
    JSON.stringify({ type: 'user', timestamp: resT, toolUseResult: { durationMs: dur, code: err ? 1 : 0, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: err, content: err ? errText : 'done' }] } }),
  ];
}

const raw = [
  ...ev('f1', 'python train.py', 1, 500, true, 'RuntimeError: shape mismatch alpha'),
  ...ev('f2', 'python train.py', 3, 500, true, 'RuntimeError: shape mismatch beta'),
  ...ev('f3', 'python train.py', 5, 500, true, 'RuntimeError: shape mismatch gamma'),
  // 此刻 S 已高。下面这条是"搜索 test 这个词"，完全无辜，且成功：
  ...ev('g1', 'grep -rn "test" src/', 8, 50, false),
  // 尾随一条普通 ls，让采样网格捕捉到泄能后的 S（否则末采样落在泄能前）：
  ...ev('h1', 'ls -la', 11, 20, false),
].join('\n') + '\n';

const out = replayText(serializeTape(distillTape(raw, params)), params, META);
const moments = out.emitted.filter((e) => e.ev.special);
const resolves = moments.filter((e) => e.ev.special === 'RESOLVE');
const peakS = Math.max(...out.snaps.map((s) => s.S));
const sBeforeGrep = out.snaps.filter((s) => s.t < Date.UTC(2026, 6, 4, 10, 0, 8)).map((s) => s.S).pop() ?? 0;
const sAfter = out.snaps.filter((s) => s.t >= Date.UTC(2026, 6, 4, 10, 0, 9)).map((s) => s.S)[0] ?? out.snaps[out.snaps.length - 1]!.S;

console.log('注入：3 连 python train.py 失败（真实张力）＋ 1 条 `grep -rn "test" src/` 成功（无辜）。');
console.log(`峰值 S ≈ ${peakS.toFixed(3)}（T≈${(1 - Math.exp(-peakS)).toFixed(3)}）`);
console.log(`grep 前 S ≈ ${sBeforeGrep.toFixed(3)} → grep 后 S ≈ ${sAfter.toFixed(3)}`);
console.log(`RESOLVE 发射次数：${resolves.length}${resolves.length > 0 ? '  ⚠️ 假解脱：无辜的 grep 触发了"和弦解决"音并乘法泄掉真实张力' : ''}`);
console.log('派生时刻：', moments.map((e) => e.ev.special).join(', ') || '（无）');

console.log('\n═══ 结论 ═══');
console.log('`/\\btest\\b/` 命中任何把 "test" 作独立词的命令；`/git\\s+commit/` 命中任何含该子串的命令（含 echo/注释）。');
console.log('叠加"tagged RUN-OK 且 S>0.3 → RESOLVE+泄能"，无辜命令即可伪造解脱、抹平真实张力弧——直接损害仪器诚实条款。');
