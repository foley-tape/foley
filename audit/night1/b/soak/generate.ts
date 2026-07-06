// 合成会话发生器（可复现种子）。以真实节奏产原始 JSONL 事件：每 5–40s 一事件，
// 偶发风暴簇（连续同形失败）。供 soak 挂机测试。纯确定性（seed → 同序列）。
//
// 导出 makeGenerator：给定 seed 与虚拟起点，逐个吐出"原始 JSONL 行 + 该事件的虚拟时刻(ms)"。

export interface GenEvent { t: number; useLine: string; resLine: string | null }

/** 确定性 PRNG（mulberry32）。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const READ_TOOLS = ['Read', 'Grep', 'Glob', 'WebFetch'];
const RUN_CMDS = ['ls -la', 'npm run lint', 'node build.js', 'git status', 'cat log.txt'];
const STORM_URLS = Array.from({ length: 40 }, (_, i) => `https://api.svc/endpoint/${i}`);

function isoOf(t: number): string { return new Date(t).toISOString(); }
function assistant(id: string, name: string, input: unknown, t: number): string {
  return JSON.stringify({ type: 'assistant', timestamp: isoOf(t), message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
}
function user(id: string, isErr: boolean, content: string, t: number, code = isErr ? 1 : 0): string {
  return JSON.stringify({ type: 'user', timestamp: isoOf(t), toolUseResult: { code, durationMs: 200, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isErr, content }] } });
}

/**
 * 生成器：从 startT 起，产 count 个事件（含结果行）。
 * 正常段：READ/WRITE/RUN 混合，多为 OK，间隔 5–40s。
 * 风暴簇：以 ~8% 概率进入，连续 6–15 个"同形 URL 失败"（迷路型），间隔 1–4s。
 */
export function* makeGenerator(seed: number, startT: number, count: number): Generator<GenEvent> {
  const rnd = mulberry32(seed);
  let t = startT;
  let id = 0;
  let i = 0;
  while (i < count) {
    const stormy = rnd() < 0.08;
    if (stormy) {
      const burst = 6 + Math.floor(rnd() * 10);
      for (let b = 0; b < burst && i < count; b++, i++) {
        t += 1000 + Math.floor(rnd() * 3000); // 1–4s
        const uid = 'u' + id++;
        const url = STORM_URLS[Math.floor(rnd() * STORM_URLS.length)]!;
        // 迷路型：不同 URL，同错误形状（正是红队C 塌缩场景，真实风暴质地）
        yield { t, useLine: assistant(uid, 'WebFetch', { url }, t), resLine: user(uid, true, 'fetch failed: connection timeout', t + 200) };
      }
    } else {
      t += 5000 + Math.floor(rnd() * 35000); // 5–40s
      const uid = 'u' + id++;
      const roll = rnd();
      let useLine: string, resLine: string;
      if (roll < 0.45) { const tool = READ_TOOLS[Math.floor(rnd() * READ_TOOLS.length)]!; useLine = assistant(uid, tool, { file_path: '/src/f' + (id % 50) + '.ts' }, t); resLine = user(uid, rnd() < 0.1, rnd() < 0.1 ? 'not found' : 'ok', t + 200); }
      else if (roll < 0.75) { useLine = assistant(uid, 'Edit', { file_path: '/src/f' + (id % 50) + '.ts', old_string: 'a', new_string: 'b' }, t); resLine = user(uid, rnd() < 0.05, 'ok', t + 200); }
      else { const cmd = RUN_CMDS[Math.floor(rnd() * RUN_CMDS.length)]!; useLine = assistant(uid, 'Bash', { command: cmd }, t); resLine = user(uid, rnd() < 0.15, rnd() < 0.15 ? 'exit 1' : 'ok', t + 200); }
      yield { t, useLine, resLine };
      i++;
    }
  }
}
