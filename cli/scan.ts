// cli scan —— §9 标准带甄选规程。
// 扫描 ~/.claude/projects 全部 JSONL，蒸馏后体检，各提名候选，出体检表 + PARSE_REPORT。
// 只读、零网络。原始经蒸馏器读一次即化为骨架记录（下游只见蒸馏记录）。

import { readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import {
  distillFile, healthOf, type HealthCard, type DistillResult,
} from '../adapters/claude-jsonl/index.ts';
import { resolveParams, type Params } from '../engine/params.ts';

interface FileCard {
  path: string;
  short: string;
  health: HealthCard;
  d: DistillResult;
}

function findJsonl(root: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(root, { recursive: true }) as string[]; }
  catch { return out; }
  for (const e of entries) {
    if (typeof e === 'string' && e.endsWith('.jsonl')) out.push(join(root, e));
  }
  return out;
}

// ---- §9 候选判据 ----
function isSmooth(h: HealthCard): boolean {
  return (
    h.activeMin >= 10 && h.activeMin <= 40 &&
    h.eventCount >= 40 &&
    h.failRate < 0.05 &&
    (h.hasSave || h.hasResolveProxy) &&
    h.maxSameSigRepeat <= 1
  );
}
function isStorm(h: HealthCard): boolean {
  return (
    (h.failCount >= 8 || h.failRate >= 0.25) &&
    h.distinctSigs >= 3 &&
    (h.hasSave || h.hasResolveProxy)
  );
}
// jam：施工令 §5 追加"活跃≥5min 且事件≥30"（现役样本仅 36 秒，太薄，仅够验探测器）
function isJam(h: HealthCard): boolean {
  return h.maxSameSigRepeat >= 4 && h.activeMin >= 5 && h.eventCount >= 30;
}

const SMOOTH_LOOSE = { activeMin: [5, 60] as const, eventCount: 30, failRate: 0.08 };
function smoothMisses(h: HealthCard): string[] {
  const miss: string[] = [];
  if (!(h.activeMin >= 10 && h.activeMin <= 40)) miss.push('时长');
  if (h.eventCount < 40) miss.push('事件<40');
  if (h.failRate >= 0.05) miss.push('失败率≥5%');
  if (!(h.hasSave || h.hasResolveProxy)) miss.push('无收束点');
  if (h.maxSameSigRepeat > 1) miss.push('有重复签名');
  return miss;
}
function isSmoothLoose(h: HealthCard): boolean {
  return (
    h.activeMin >= SMOOTH_LOOSE.activeMin[0] && h.activeMin <= SMOOTH_LOOSE.activeMin[1] &&
    h.eventCount >= SMOOTH_LOOSE.eventCount &&
    h.failRate < SMOOTH_LOOSE.failRate &&
    h.maxSameSigRepeat <= 2
  );
}

function fmt(n: number, d = 1): string { return n.toFixed(d); }

function healthRow(c: FileCard): string {
  const h = c.health;
  return `| \`${c.short}\` | ${fmt(h.activeMin)} | ${fmt(h.durationMin)} | ${h.eventCount} | ${h.failCount} | ${fmt(h.failRate * 100)}% | ${h.distinctSigs} | ${h.maxSameSigRepeat} | ${h.episodeCount} | ${h.hasSave ? '✅' : '—'} | ${h.hasResolveProxy ? '✅*' : '—'} |`;
}

const TABLE_HEAD =
  '| 磁带 | 活跃min | 墙钟min | 事件 | FAIL | 失败率 | 独立签名 | 最大同签名重复 | episode | SAVE | RESOLVE* |\n' +
  '|---|---|---|---|---|---|---|---|---|---|---|';

export function runScan(): void {
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params: Params = resolveParams(paramsRaw);

  const projects = join(homedir(), '.claude', 'projects');
  const files = findJsonl(projects);
  process.stderr.write(`扫描 ${projects}\n找到 ${files.length} 卷 JSONL\n`);

  const cards: FileCard[] = [];
  let totalLines = 0, parsedLines = 0, badLines = 0;
  const lineTypes: Record<string, number> = {};
  const unknownTools: Record<string, number> = {};
  let totalToolUse = 0, totalPaired = 0, totalUnpaired = 0, totalAsk = 0, totalSidechain = 0;

  for (const path of files) {
    let d: DistillResult;
    try { d = distillFile(path, params); }
    catch (err) { process.stderr.write(`跳过（读取/蒸馏异常，禁 crash）: ${path} — ${(err as Error).message}\n`); continue; }
    const s = d.meta.stats;
    totalLines += s.totalLines; parsedLines += s.parsedLines; badLines += s.badLines;
    totalToolUse += s.toolUseCount; totalPaired += s.pairedCount; totalUnpaired += s.unpairedToolUse;
    totalAsk += s.askToolCount; totalSidechain += s.sidechainLines;
    for (const [k, v] of Object.entries(s.lineTypeCounts)) lineTypes[k] = (lineTypes[k] ?? 0) + v;
    for (const [k, v] of Object.entries(s.unknownTools)) unknownTools[k] = (unknownTools[k] ?? 0) + v;
    cards.push({ path, short: relative(projects, path), health: healthOf(d), d });
  }

  const smooth = cards.filter((c) => isSmooth(c.health))
    .sort((a, b) => b.health.eventCount - a.health.eventCount || a.health.failRate - b.health.failRate)
    .slice(0, 3);
  const strictShorts = new Set(smooth.map((c) => c.short));
  const smoothLoose = cards.filter((c) => isSmoothLoose(c.health) && !strictShorts.has(c.short))
    .sort((a, b) => smoothMisses(a.health).length - smoothMisses(b.health).length || a.health.failRate - b.health.failRate)
    .slice(0, 5);
  const storm = cards.filter((c) => isStorm(c.health))
    .sort((a, b) => b.health.failCount - a.health.failCount || b.health.distinctSigs - a.health.distinctSigs)
    .slice(0, 5);
  const jam = cards.filter((c) => isJam(c.health))
    .sort((a, b) => b.health.maxSameSigRepeat - a.health.maxSameSigRepeat || b.health.activeMin - a.health.activeMin)
    .slice(0, 5);

  const nomBlock = (title: string, cs: FileCard[], note: string): string => {
    if (cs.length === 0) return `### ${title}\n\n_（无候选满足判据）_ ${note}\n`;
    return `### ${title}\n\n${TABLE_HEAD}\n${cs.map(healthRow).join('\n')}\n\n${note}\n`;
  };
  const looseBlock = (title: string, cs: FileCard[], note: string): string => {
    if (cs.length === 0) return `### ${title}\n\n_（无近失候选）_ ${note}\n`;
    const head = TABLE_HEAD.replace(' |\n', ' | 缺项 |\n').replace(/\|---\|$/, '|---|---|');
    const rows = cs.map((c) => `${healthRow(c)} ${smoothMisses(c.health).join('/') || '—'} |`).join('\n');
    return `### ${title}\n\n${head}\n${rows}\n\n${note}\n`;
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
    `> 扫描 ${cards.length} 卷（蒸馏后体检）。\`RESOLVE*\`=test-tagged RUN-OK 存在（体检代理）。\n` +
    `> 圈选后 \`node cli/index.ts distill <原始> tapes/<名>.tape.jsonl\` 蒸馏入册。\n\n` +
    nomBlock('顺风带 smooth（严格判据）', smooth,
      '判据：活跃10–40min｜事件≥40｜失败率<5%｜含SAVE或test-OK｜最大同签名重复≤1') + '\n' +
    looseBlock('顺风带 smooth（放宽层）', smoothLoose,
      '放宽：活跃5–60min｜事件≥30｜失败率<8%｜重复≤2。"缺项"=未过的严格判据。') + '\n' +
    nomBlock('风暴带 storm（提名）', storm,
      '判据：FAIL≥8 或 失败率≥25%｜独立签名≥3｜含SAVE或RESOLVE（张力弧完整）') + '\n' +
    nomBlock('卡碟带 jam（提名）', jam,
      '判据：同签名10min窗内≥4次｜活跃≥5min｜事件≥30（施工令 §5 加厚）');
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
  return `# PARSE_REPORT — 格式考古（蒸馏口径）

> 由 \`cli scan\` 自动生成。原始经蒸馏器读一次化为骨架。逐条现实修正见 FEEDBACK.md。

## 解析覆盖
- 扫描目录：\`${i.projects}\`
- JSONL 文件：${i.fileCount}（成功体检 ${i.scannedCount}）
- 总行数：${i.totalLines}｜成功解析：${i.parsedLines}｜**异常行：${i.badLines}**
- **解析覆盖率：${cov}%**
- tool_use 总数：${i.totalToolUse}｜已配对：${i.totalPaired}｜未配对：${i.totalUnpaired}
- AskUserQuestion：${i.totalAsk} 次（现映射 **ASK**，施工令裁决④已签核）
- sidechain（子 agent）行：${i.totalSidechain}（v0 折叠 main，仅计数）

## 行类型分布
${lineTypeList.map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## 未知工具清单（→ OTHER，禁 crash，计数上报）
${unknownList.length === 0 ? '（无）' : unknownList.map(([k, v]) => `- \`${k}\`: ${v}`).join('\n')}

## 金测试
- 未知工具 → OTHER 不 crash：\`golden/unknown-tool.test.ts\`
- 引擎与蒸馏/回放确定性：\`golden/engine.test.ts\`（\`npm test\`）
`;
}
