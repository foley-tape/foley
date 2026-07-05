// 工具名 → 元动词映射（§4 事件词汇表）。
// 全系统唯一认识"哪个工具算哪个动词"的地方。
// M0 as-built：映射对照真实磁带验证，未知工具一律 OTHER（禁 crash，计数上报）。
//
// M1.8-F ①②（NIGHT-1 修复 P1-4 死参数 + P1-1 诚实条款）：
//   - 分类不再用硬编码正则匹配命令**全串**（旧法把 `curl …/test`、`echo "git commit"` 误判）。
//   - 改为**命令头结构化匹配**：按 &&/||/;/| 分段，跳过前导 `FOO=bar` 环境赋值与 `cd x`，
//     取每段 argv 头，与 params.adapter 的 token 集比对。
//   - 模式集全部来自 params.adapter（saveCommand / testRunners / buildTools / packageManagerRunners）——
//     不再有硬编码常量，改 params 即改行为（金测试证）。

import type { Verb } from '../../protocol/index.ts';
import type { Params } from '../../engine/params.ts';

type AdapterCfg = Params['adapter'];

// §4 表：动词 → 源工具（假设列，M0 已对照现实）
const VERB_TABLE: Record<Exclude<Verb, 'RUN' | 'SAVE' | 'OTHER'>, string[]> = {
  READ: ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'NotebookRead'],
  WRITE: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'],
  ASK: [], // §4：ASK 无显式源工具，靠 §5 启发式。见 PARSE_REPORT 现实修正（AskUserQuestion）。
  SPAWN: ['Task', 'Agent'],
};

const TOOL_TO_VERB = new Map<string, Verb>();
for (const [verb, tools] of Object.entries(VERB_TABLE)) {
  for (const t of tools) TOOL_TO_VERB.set(t, verb as Verb);
}
// RUN 单独：Bash（git commit 时升格 SAVE，见 classifyBash）
TOOL_TO_VERB.set('Bash', 'RUN');

/** 已知工具集合（用于区分"已知丢弃"与"未知兜底"）。extra=params.adapter.verbMapExtra。 */
export function isKnownTool(name: string, extra?: Record<string, string>): boolean {
  return TOOL_TO_VERB.has(name) || (!!extra && Object.prototype.hasOwnProperty.call(extra, name));
}

/**
 * 工具名 → 动词。未知工具 → OTHER（兜底，禁 crash）。
 * extra（params.adapter.verbMapExtra，已签核）优先：AskUserQuestion→ASK、ToolSearch→READ。
 */
export function verbOf(name: string, extra?: Record<string, string>): Verb {
  const e = extra?.[name];
  if (e) return e as Verb;
  return TOOL_TO_VERB.get(name) ?? 'OTHER';
}

// ---------- 命令头结构化解析（M1.8-F ②） ----------

/** 松散分词：引号跨度视作单 token，否则按非空白切。非完整 shell 解析，够读 argv 头即可。 */
function tokenize(seg: string): string[] {
  const out: string[] = [];
  const re = /"[^"]*"|'[^']*'|\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(seg)) !== null) {
    let t = m[0];
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1);
    out.push(t);
  }
  return out;
}

/**
 * 命令行 → 各段的 argv 头列表。按 &&/||/;/|/换行分段；跳过前导 `FOO=bar` 环境赋值与
 * 前导 `cd <dir>` 段及常见无操作包裹（sudo/command/nice/time/exec）。空段丢弃。
 */
export function commandHeads(command: string): string[][] {
  const heads: string[][] = [];
  const segs = command.split(/&&|\|\||[;\n]|\|/);
  for (const seg of segs) {
    const toks = tokenize(seg);
    let i = 0;
    while (i < toks.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(toks[i]!)) i++; // 环境赋值
    // 前导 cd/包裹词
    while (i < toks.length) {
      const t = toks[i]!;
      if (t === 'cd' || t === 'pushd') { i += 2; continue; }        // cd + 目标：整段跳
      if (t === 'sudo' || t === 'command' || t === 'nice' || t === 'time' || t === 'exec') { i += 1; continue; }
      break;
    }
    const argv = toks.slice(i);
    if (argv.length) heads.push(argv);
  }
  return heads;
}

/** Bash：任一段头是 saveCommand（默认 ["git","commit"]）→ SAVE，否则 RUN。 */
export function classifyBash(command: string | undefined, adapter: AdapterCfg): Verb {
  if (!command) return 'RUN';
  const save = adapter.saveCommand;
  for (const argv of commandHeads(command)) {
    if (argv.length >= save.length && save.every((tok, i) => argv[i] === tok)) return 'SAVE';
  }
  return 'RUN';
}

/** 单段 argv 头是否命中某类运行器（含两词形与包管理器 run 脚本）。 */
function matchRunner(argv: string[], runners: string[], pms: string[], kind: 'test' | 'build'): boolean {
  const a0 = argv[0] ?? '', a1 = argv[1] ?? '', a2 = argv[2] ?? '';
  if (runners.includes(a0)) return true;                     // 单词运行器：jest/vitest/tsc/webpack…
  if (a1 && runners.includes(a0 + ' ' + a1)) return true;    // 两词：cargo test / go build / vite build / docker build
  if (pms.includes(a0)) {                                    // 包管理器：npm test / npm run test* / yarn build
    const script = a1 === 'run' ? a2 : a1;
    if (script === kind || script.startsWith(kind + ':') || script.startsWith(kind)) return true;
  }
  return false;
}

/** RUN/SAVE 上挂的语义 tag（不进核心词汇）。命令头结构化匹配，非全串子串。 */
export function tagsForCommand(command: string | undefined, adapter: AdapterCfg): string[] {
  if (!command) return [];
  let isTest = false, isBuild = false;
  for (const argv of commandHeads(command)) {
    if (matchRunner(argv, adapter.testRunners, adapter.packageManagerRunners, 'test')) isTest = true;
    if (matchRunner(argv, adapter.buildTools, adapter.packageManagerRunners, 'build')) isBuild = true;
  }
  const tags: string[] = [];
  if (isTest) tags.push('test');
  if (isBuild) tags.push('build');
  return tags;
}
