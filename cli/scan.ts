// cli scan —— §9 标准带甄选规程。
// 扫描 ~/.claude/projects 全部 JSONL，各提名 3 卷候选，出体检表 + PARSE_REPORT。
// 只读、零配置、零网络。tapes/ 不复制（交船长手工圈选）。

import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import {
  parseTapeFile,
  healthOf,
  type HealthCard,
  type ParseResult,
} from '../adapters/claude-jsonl/index.ts';

interface FileCard {
  path: string;
  short: string;
  health: HealthCard;
  res: ParseResult;
}

function findJsonl(root: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(root, { recursive: true }) as string[];
  } catch {
    return out;
  }
  for (const e of entries) {
    if (typeof e === 'string' && e.endsWith('.jsonl')) out.push(join(root, e));
  }
  return out;
}

// ---- §9 候选判据 ----
function isSmooth(h: HealthCard): boolean {
  // §9 时长判据落在"活跃时长"上（墙钟跨度会被多日续跑虚高，见 PARSE_REPORT 现实修正）
  return (
    h.activeMin >= 10 && h.activeMin <= 40 &&
    h.eventCount >= 40 &&
    h.failRate < 0.05 &&
    (h.hasSave || h.hasResolveProxy) &&
    h.maxSameSigRepeat <= 1
  );
}
function isHell(h: HealthCard): boolean {
  return (
    (h.failCount >= 8 || h.failRate >= 0.25) &&
    h.distinctSigs >= 3 &&
    (h.hasSave || h.hasResolveProxy)
  );
}
function isLoop(h: HealthCard): boolean {
  return h.maxSameSigRepeat >= 4;
}

function fmt(n: number, d = 1): string {
  return n.toFixed(d);
}

function healthRow(c: FileCard): string {
  const h = c.health;
  return `| \`${c.short}\` | ${fmt(h.activeMin)} | ${fmt(h.durationMin)} | ${h.eventCount} | ${h.failCount} | ${fmt(h.failRate * 100)}% | ${h.distinctSigs} | ${h.maxSameSigRepeat} | ${h.hasSave ? '✅' : '—'} | ${h.hasResolveProxy ? '✅*' : '—'} |`;
}

const TABLE_HEAD =
  '| 磁带 | 活跃min | 墙钟min | 事件 | FAIL | 失败率 | 独立签名 | 最大同签名重复 | SAVE | RESOLVE* |\n' +
  '|---|---|---|---|---|---|---|---|---|---|';

export function runScan(): void {
  const projects = join(homedir(), '.claude', 'projects');
  const files = findJsonl(projects);
  process.stderr.write(`扫描 ${projects}\n找到 ${files.length} 卷 JSONL\n`);

  const cards: FileCard[] = [];
  // 聚合解析统计（PARSE_REPORT 用）
  let totalLines = 0, parsedLines = 0, badLines = 0;
  const lineTypes: Record<string, number> = {};
  const unknownTools: Record<string, number> = {};
  let totalToolUse = 0, totalPaired = 0, totalUnpaired = 0, totalAsk = 0, totalSidechain = 0;

  for (const path of files) {
    let res: ParseResult;
    try {
      res = parseTapeFile(path);
    } catch (err) {
      process.stderr.write(`跳过（读取/解析异常，禁 crash）: ${path} — ${(err as Error).message}\n`);
      continue;
    }
    const s = res.stats;
    totalLines += s.totalLines; parsedLines += s.parsedLines; badLines += s.badLines;
    totalToolUse += s.toolUseCount; totalPaired += s.pairedCount; totalUnpaired += s.unpairedToolUse;
    totalAsk += s.askToolCount; totalSidechain += s.sidechainLines;
    for (const [k, v] of Object.entries(s.lineTypeCounts)) lineTypes[k] = (lineTypes[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.unknownTools)) unknownTools[k] = (unknownTools[k] ?? 0) + v;

    cards.push({ path, short: relative(projects, path), health: healthOf(res), res });
  }

  // 提名各 3 卷
  const smooth = cards.filter((c) => isSmooth(c.health))
    .sort((a, b) => b.health.eventCount - a.health.eventCount || a.health.failRate - b.health.failRate)
    .slice(0, 3);
  const hell = cards.filter((c) => isHell(c.health))
    .sort((a, b) => b.health.failCount - a.health.failCount || b.health.distinctSigs - a.health.distinctSigs)
    .slice(0, 3);
  const loop = cards.filter((c) => isLoop(c.health))
    .sort((a, b) => b.health.maxSameSigRepeat - a.health.maxSameSigRepeat)
    .slice(0, 3);

  // ---- 输出：体检表到 stdout ----
  const nomBlock = (title: string, cs: FileCard[], note: string): string => {
    if (cs.length === 0) return `### ${title}\n\n_（无候选满足判据）_ ${note}\n`;
    return `### ${title}\n\n${TABLE_HEAD}\n${cs.map(healthRow).join('\n')}\n\n${note}\n`;
  };

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const outDir = join(process.cwd(), 'runs', ts);
  mkdirSync(outDir, { recursive: true });

  const parseReport = buildParseReport({
    projects, fileCount: files.length, scannedCount: cards.length,
    totalLines, parsedLines, badLines, lineTypes, unknownTools,
    totalToolUse, totalPaired, totalUnpaired, totalAsk, totalSidechain,
  });
  writeFileSync(join(outDir, 'PARSE_REPORT.md'), parseReport, 'utf8');

  const candidatesMd =
    `# 标准带候选体检表\n\n` +
    `> 扫描 ${cards.length} 卷。船长各圈选 1 卷，复制入 \`tapes/\` 重命名 smooth/hell/loop.jsonl。\n` +
    `> \`RESOLVE*\` 为 M0 代理（test-tagged RUN-OK 存在）；精确 RESOLVE 属 M1 引擎。\n\n` +
    nomBlock('顺风带 smooth（3 提名）', smooth,
      '判据：时长10–40min｜事件≥40｜失败率<5%｜含SAVE或test-OK｜最大同签名重复≤1') + '\n' +
    nomBlock('地狱带 hell（3 提名）', hell,
      '判据：FAIL≥8 或 失败率≥25%｜独立签名≥3｜含SAVE或RESOLVE（张力弧完整）') + '\n' +
    nomBlock('死循环带 loop（3 提名）', loop,
      '判据：同签名10分钟窗内≥4次');
  writeFileSync(join(outDir, 'CANDIDATES.md'), candidatesMd, 'utf8');

  process.stdout.write(candidatesMd);
  process.stdout.write(`\n---\n解析覆盖率 ${fmt((parsedLines / Math.max(1, totalLines)) * 100)}% ｜异常行 ${badLines} ｜未知工具 ${Object.keys(unknownTools).length} 种\n`);
  process.stdout.write(`\n产出：\n  ${relative(process.cwd(), join(outDir, 'PARSE_REPORT.md'))}\n  ${relative(process.cwd(), join(outDir, 'CANDIDATES.md'))}\n`);
}

interface ReportInput {
  projects: string; fileCount: number; scannedCount: number;
  totalLines: number; parsedLines: number; badLines: number;
  lineTypes: Record<string, number>; unknownTools: Record<string, number>;
  totalToolUse: number; totalPaired: number; totalUnpaired: number;
  totalAsk: number; totalSidechain: number;
}

function buildParseReport(i: ReportInput): string {
  const cov = fmt((i.parsedLines / Math.max(1, i.totalLines)) * 100);
  const unknownList = Object.entries(i.unknownTools).sort((a, b) => b[1] - a[1]);
  const lineTypeList = Object.entries(i.lineTypes).sort((a, b) => b[1] - a[1]);
  return `# PARSE_REPORT — M0 格式考古

> 由 \`cli scan\` 自动生成。规范：TAPE0_SPEC_v0.1 §5 / §10。

## 解析覆盖

- 扫描目录：\`${i.projects}\`
- JSONL 文件：${i.fileCount}（成功体检 ${i.scannedCount}）
- 总行数：${i.totalLines}｜成功 JSON 解析：${i.parsedLines}｜**异常行：${i.badLines}**
- **解析覆盖率：${cov}%**
- tool_use 总数：${i.totalToolUse}｜已配对结果：${i.totalPaired}｜未配对（未决/尾随局限）：${i.totalUnpaired}
- sidechain（子 agent）行：${i.totalSidechain}（v0 全折叠为 agent="main"，字段留位待 M?多轨）

## as-built 字段对照表（假设 → 现实 → 采用）

| 语义 | §4/§5 假设 | 真实 JSONL 位置 | M0 采用 |
|---|---|---|---|
| 工具调用 | \`type:assistant\` 的 \`tool_use\` | \`assistant.message.content[]\`，block \`type:"tool_use"\`（id/name/input） | ✅ 按此 |
| 工具结果 | 对应 \`tool_result\` | \`user.message.content[]\`，block \`type:"tool_result"\`（tool_use_id/content） | ✅ 按此 |
| 配对键 | 以 id 配对 | \`tool_use.id\` === \`tool_result.tool_use_id\` | ✅ 按此 |
| 错误标记 outcome | \`is_error\` 或等价物 | \`tool_result.is_error\`（布尔，存在于结果 block） | ✅ is_error→FAIL |
| RUN 时长 | tool_use↔result 时差 | 顶层 \`toolUseResult.durationMs\`（Bash 才有）；缺则回退时间戳配对时差 | ✅ 优先 durationMs |
| 退出码 | — | 顶层 \`toolUseResult.code\`（Bash）；≠0→FAIL | ✅ 采用 |
| 中断 | — | 顶层 \`toolUseResult.interrupted:true\` | ✅ interrupted→NA |
| WRITE 幅度 | diff 行数 cap500 | \`toolUseResult.structuredPatch[].lines\`（+/-）；缺则 old/new/content 行数 | ✅ structuredPatch 优先 |
| READ 幅度 | 内容 KB cap100 | \`toolUseResult.file.bytes\`/\`bytes\`；缺则 result 文本 UTF-8 字节 | ✅ 按此 |
| 时间戳 | 数字注入 | ISO 字符串（如 \`2026-06-28T03:55:38.102Z\`）→ \`Date.parse\`→ms | ✅ 转换 |
| 丢弃行 | "其余一切故意丢弃" | \`mode\`/\`permission-mode\`/\`file-history-snapshot\`/\`ai-title\`/\`last-prompt\`/\`system\`/\`attachment\`/\`queue-operation\` | ✅ 计数不解析 |

## 行类型分布（全量）

${lineTypeList.map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## 未知工具清单（→ OTHER，禁 crash，计数上报）

${unknownList.length === 0 ? '（无）' : unknownList.map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## 现实修正（规范说 X／现实是 Y／我做了 Z）

1. **ASK 信号**：§4 说 ASK 无显式源工具、靠 §5 的 >15s 启发式；现实是存在显式 **\`AskUserQuestion\`** 工具（本次扫描出现 ${i.totalAsk} 次），是比启发式精确得多的 ASK 信号。M0 我按冻结的 §4 表把它归入 **OTHER 并计数上报**，未擅自改动动词映射。**建议**：架构师签核后在适配器把 \`AskUserQuestion → ASK\`（精确信号优于启发式，且不改协议 schema）。
2. **RUN 时长来源**：§5 说用 tool_use↔result 时差；现实是 Bash 结果直接带 \`durationMs\`（更准，且不受尾随乱序影响）。我做了：优先 \`durationMs\`，缺失才回退时差。
3. **子 agent**：现实日志有 \`isSidechain\` / \`sourceToolAssistantUUID\` 可精确识别子 agent 轨道（本次 ${i.totalSidechain} 行）；v0 单轨，我全折叠为 \`agent="main"\`，仅计数，为未来多轨留地基（未越级建多轨 UI）。
4. **SESSION_START / DONE**：无显式"会话终结"记录类型；DONE 用"末条 assistant 有 stop_reason 且无未决工具"近似（§5 的静默>10min 判据属 live 尾随，replay 全文视角用此代理）。
5. **一个 JSONL 文件 ≠ 一场会话**：§9 隐含"磁带≈会话"，现实是同一文件被 resume/continue 跨日追加——扫描见到墙钟跨度高达 ~11 天（15969 min）的文件。墙钟时长因此严重虚高。我做了：新增 **"活跃时长 activeMin"**（只累加 <10min 的相邻事件间隔），smooth 的 10–40min 判据落在活跃时长上；体检表两列并列（活跃/墙钟）供船长判断。未擅自把文件切成多会话（那是 selection 粒度的重构，超 M0 范围）——若架构师要求，可在 §9 增补"按 >N min 空档分段"细则。

## 金测试

- 未知工具 → OTHER 不 crash：见 \`golden/unknown-tool.test.ts\`（\`npm test\`）。
`;
}
