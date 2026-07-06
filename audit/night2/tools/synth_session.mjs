// NIGHT-2 §2 合成会话发生器：可复现种子 → 拟真 Claude Code 原始 JSONL，滴写 6–8h。
// 格式仿真蓝本：adapters/claude-jsonl/parse.ts as-built 注释 + 真实会话抽样。
// 节奏：工作串（bout）＋风暴簇（同 errClass 连败→修复 RESOLVE；一簇故意烂尾）＋ASK 窗＋深睡谷（含一记 >episodeGap 的 35min）。
// 纪律：内容全由种子决定；时间戳=计划时刻（写出抖动另记 gen-log.csv，供"发射 vs 理论"对账）。
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, v) => a.startsWith('--') ? [a.slice(2), v[i + 1]] : []).filter(x => x.length));
const OUT = args.out ?? 'audit/night2/soak/synth-raw.jsonl';
const SEED = Number(args.seed ?? 20260706);
const DEADLINE = Number(args.deadlineEpochMs); // 发生器停笔时刻（driver 传入）
if (!Number.isFinite(DEADLINE)) { console.error('need --deadlineEpochMs'); process.exit(2); }
const GENLOG = path.join(path.dirname(OUT), 'gen-log.csv');
const PLAN = path.join(path.dirname(OUT), 'gen-plan.json');

// ---- 种子 PRNG（mulberry32）----
let _s = SEED >>> 0;
const rnd = () => { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const rf = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---- 行构造 ----
const START = Date.now();
const SID = 'night2-synth-' + SEED;
let seq = 0, uuidN = 0;
const uuid = () => `synth-${SEED}-${(uuidN++).toString(36).padStart(6, '0')}`;
const iso = (t) => new Date(t).toISOString();
const aline = (t, name, input) => {
  const id = `toolu_synth_${seq}`;
  return { id, line: { parentUuid: null, isSidechain: false, type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] }, uuid: uuid(), timestamp: iso(t), sessionId: SID, version: '2.1.197', cwd: '/tmp/night2-synth', gitBranch: 'audit/night2' } };
};
const rline = (t, id, isErr, content, tur) => ({ parentUuid: null, isSidechain: false, type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isErr, content }] }, toolUseResult: tur, uuid: uuid(), timestamp: iso(t), sessionId: SID, version: '2.1.197', cwd: '/tmp/night2-synth' });

// ---- 计划表 ----
const plan = []; // {off, json, kind}
const pushPair = (off, name, input, latMs, isErr, rtext, tur, kind) => {
  const { id, line } = aline(START + off, name, input);
  plan.push({ off, json: JSON.stringify(line), kind: `use:${kind}` });
  const roff = off + latMs;
  plan.push({ off: roff, json: JSON.stringify(rline(START + roff, id, isErr, rtext, tur)), kind: `res:${kind}` });
  seq++;
  return roff;
};

const FILES = Array.from({ length: 12 }, (_, i) => `/tmp/night2-synth/src/mod${i}.ts`);
const okBash = ['node scripts/build.mjs', 'ls -la', 'node --version', 'grep -rn TODO src', 'node scripts/check.mjs'];

function workAction(off) {
  const w = rnd();
  if (w < 0.32) { // READ
    const f = pick(FILES);
    return pushPair(off, pick(['Read', 'Grep']), { file_path: f }, ri(250, 1200), false, `content of ${f}\n`.repeat(ri(1, 40)), { bytes: ri(300, 60000) }, 'read');
  } else if (w < 0.62) { // WRITE
    const f = pick(FILES);
    const lines = ri(2, 60);
    const fail = rnd() < 0.02;
    return pushPair(off, 'Edit', { file_path: f, old_string: 'x\n'.repeat(lines), new_string: 'y\n'.repeat(lines) }, ri(350, 1800), fail, fail ? 'Error: old_string not found in file' : 'ok', fail ? undefined : { structuredPatch: [{ lines: Array.from({ length: lines }, (_, i) => (i % 2 ? '+y' : '-x')) }] }, 'write');
  } else if (w < 0.87) { // RUN
    const cmd = pick(okBash);
    const durMs = ri(800, 22000);
    const fail = rnd() < 0.06;
    return pushPair(off, 'Bash', { command: cmd }, durMs, fail, fail ? `Error: script exited with code 1` : 'done', { durationMs: durMs, code: fail ? 1 : 0 }, 'run');
  } else if (w < 0.9) { // SPAWN
    const durMs = ri(8000, 90000);
    return pushPair(off, 'Task', { description: 'synth subtask', prompt: 'do' }, durMs, false, 'sub done', { durationMs: durMs }, 'spawn');
  } else if (w < 0.93) { // unknown tool（未知工具计数路径）
    return pushPair(off, 'SynthProbe', { q: 1 }, ri(300, 900), false, 'ok', undefined, 'other');
  } else { // READ 大文件
    return pushPair(off, 'Read', { file_path: pick(FILES) }, ri(400, 1500), false, 'big\n'.repeat(ri(100, 800)), { file: { bytes: ri(100000, 900000) } }, 'read');
  }
}

function storm(off, resolve) {
  // 同 errClass 连败（sig 恒等）→ 引擎充能/卡碟；resolve=true 则以 test-OK 收束
  const n = ri(5, 9);
  const errLine = 'Error: expect(received).toBe(expected) at /tmp/night2-synth/golden/a.test.ts:42';
  for (let i = 0; i < n; i++) {
    const durMs = ri(2500, 9000);
    off = pushPair(off, 'Bash', { command: 'npm test' }, durMs, true, errLine + '\n  at Object.<anonymous>', { durationMs: durMs, code: 1 }, 'storm-fail') + ri(5000, 16000);
  }
  off += ri(4000, 12000);
  if (resolve) {
    off = pushPair(off, 'Edit', { file_path: FILES[0], old_string: 'bad\n', new_string: 'good\n' }, ri(500, 1500), false, 'ok', { structuredPatch: [{ lines: ['-bad', '+good'] }] }, 'storm-fix') + ri(3000, 8000);
    const durMs = ri(4000, 15000);
    off = pushPair(off, 'Bash', { command: 'npm test' }, durMs, false, 'all pass', { durationMs: durMs, code: 0 }, 'storm-resolve');
  }
  return off;
}

const MIN = 60000;
function build() {
  const total = DEADLINE - START - 10 * MIN; // 尾留 10min 静默
  // 结构锚（相对 off, ms）
  const asks = [20, 90, 170, 260, 330].map(m => m * MIN).filter(o => o < total - 5 * MIN);
  const storms = [45, 125, 210, 300].map(m => m * MIN).filter(o => o < total - 15 * MIN);
  const stormResolve = [true, true, false, true]; // 第三簇故意烂尾（弃卡无仪式）
  const idles = [[75 * MIN, 9 * MIN], [150 * MIN, 12 * MIN], [240 * MIN, 35 * MIN], [350 * MIN, 8 * MIN]].filter(([o]) => o < total - 10 * MIN);
  const saves = [];
  for (let m = 35; m * MIN < total - 5 * MIN; m += ri(28, 48)) saves.push(m * MIN);

  let off = 1000; // 首行 1s 后
  // 开场标点性杂线（拟真非事件行）
  plan.push({ off: 200, json: JSON.stringify({ type: 'ai-title', aiTitle: 'NIGHT2 synth soak', sessionId: SID }), kind: 'misc' });
  let stormI = 0, askI = 0, saveI = 0;
  while (off < total) {
    // 到点插结构件
    if (stormI < storms.length && off >= storms[stormI]) { off = storm(off, stormResolve[stormI]); stormI++; continue; }
    if (askI < asks.length && off >= asks[askI]) {
      const wait = askI === 3 ? ri(7 * MIN, 9 * MIN) : ri(25000, 150000); // 第四窗超长 ASK（灯的耐心）
      off = pushPair(off, 'AskUserQuestion', { questions: [{ question: 'synth?' }] }, wait, false, 'answered', undefined, 'ask') + ri(2000, 8000);
      askI++; continue;
    }
    if (saveI < saves.length && off >= saves[saveI]) {
      off = pushPair(off, 'Bash', { command: 'git add -A && git commit -m synth' }, ri(600, 2500), false, 'committed', { durationMs: 900, code: 0 }, 'save') + ri(2000, 6000);
      saveI++; continue;
    }
    const idle = idles.find(([o, d]) => off >= o && off < o + d);
    if (idle) { off = idle[0] + idle[1]; continue; } // 深睡谷：直接跳过
    // 普通工作串
    const bout = ri(3, 9);
    for (let i = 0; i < bout && off < total; i++) off = workAction(off) + ri(1500, 14000);
    off += ri(25000, 150000); // 串间歇
  }
  // 收束：SAVE + test-OK + 尾声 READ
  off = pushPair(off, 'Bash', { command: 'git add -A && git commit -m final' }, 1200, false, 'committed', { durationMs: 1100, code: 0 }, 'final-save') + 5000;
  off = pushPair(off, 'Bash', { command: 'npm test' }, 9000, false, 'all pass', { durationMs: 8800, code: 0 }, 'final-test') + 8000;
  pushPair(off, 'Read', { file_path: FILES[1] }, 600, false, 'bye', { bytes: 1200 }, 'coda');
  plan.sort((a, b) => a.off - b.off);
}

build();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(PLAN, JSON.stringify({ seed: SEED, start: START, deadline: DEADLINE, n: plan.length, asks: 'see kinds', kinds: plan.reduce((m, p) => (m[p.kind] = (m[p.kind] ?? 0) + 1, m), {}) }, null, 2));
fs.writeFileSync(OUT, ''); // 先建空卷（live openSync 需要）
fs.writeFileSync(GENLOG, 'i,kind,plannedT,actualT,latenessMs\n');
console.log(`[gen] plan ${plan.length} lines over ${((plan[plan.length - 1].off) / 3600000).toFixed(2)}h → ${OUT}`);

let i = 0;
const timer = setInterval(() => {
  const now = Date.now();
  let wrote = 0;
  while (i < plan.length && START + plan[i].off <= now) {
    const p = plan[i];
    fs.appendFileSync(OUT, p.json + '\n');
    fs.appendFileSync(GENLOG, `${i},${p.kind},${START + p.off},${now},${now - (START + p.off)}\n`);
    i++; wrote++;
  }
  if (i >= plan.length || now >= DEADLINE) {
    clearInterval(timer);
    fs.writeFileSync(path.join(path.dirname(OUT), 'GEN_DONE'), `${Date.now()} wrote ${i}/${plan.length}\n`);
    console.log(`[gen] done: ${i}/${plan.length} lines`);
    process.exit(0);
  }
}, 500);
process.on('SIGTERM', () => { fs.writeFileSync(path.join(path.dirname(OUT), 'GEN_DONE'), `${Date.now()} SIGTERM at ${i}/${plan.length}\n`); process.exit(0); });
