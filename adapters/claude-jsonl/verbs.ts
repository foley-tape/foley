// 工具名 → 元动词映射（§4 事件词汇表）。
// 全系统唯一认识"哪个工具算哪个动词"的地方。
// M0 as-built：映射对照 3 卷真实磁带验证，未知工具一律 OTHER（禁 crash，计数上报）。

import type { Verb } from '../../protocol/index.ts';

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

/** 已知工具集合（用于区分"已知丢弃"与"未知兜底"）。 */
export function isKnownTool(name: string): boolean {
  return TOOL_TO_VERB.has(name);
}

/**
 * 工具名 → 动词。未知工具 → OTHER（兜底，禁 crash）。
 * Bash 的 SAVE 升格在 classifyBash 里做（需命令文本）。
 */
export function verbOf(name: string): Verb {
  return TOOL_TO_VERB.get(name) ?? 'OTHER';
}

const SAVE_RE = /git\s+commit/;
const TAG_TEST_RE = /\b(test|jest|vitest|pytest|cargo test|go test)\b/;
const TAG_BUILD_RE = /\b(build|tsc|webpack|vite build)\b/;

/** Bash：命令匹配 git commit → SAVE，否则 RUN。 */
export function classifyBash(command: string | undefined): Verb {
  if (command && SAVE_RE.test(command)) return 'SAVE';
  return 'RUN';
}

/** RUN 上挂的语义 tag（不进核心词汇）。 */
export function tagsForCommand(command: string | undefined): string[] {
  if (!command) return [];
  const tags: string[] = [];
  if (TAG_TEST_RE.test(command)) tags.push('test');
  if (TAG_BUILD_RE.test(command)) tags.push('build');
  return tags;
}
