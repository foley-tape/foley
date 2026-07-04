// cli sweep —— 144 组扫参器（M1.6 §4）。五带全量回放；确定性（同网格两跑逐字节一致）。
// 产 runs/sweep-<ts>/{sweep_results.csv, SWEEP_REPORT.md, champion.params.json}。
// 冠军规则 §4.3（全绿中：最少改动→storm峰值最低→τ最小）；
// 闸门 M1.6-A §5：零全绿取帕累托冠军（总违规最小）作 provisional 落盘，照常进 M2。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { resolveParams, hashParams } from '../engine/params.ts';
import { replayCore, toMetricsView, loadVerdict, type Metrics, type TapeKind } from './replay.ts';
import { judgeBand, bandViolation, type Verdict } from '../engine/verdict.ts';

export interface Dim { path: string; values: number[] }
export interface BandDef { name: Exclude<TapeKind, null>; file: string }
const BANDS: BandDef[] = [
  { name: 'silence', file: 'tapes/silence.tape.jsonl' },
  { name: 'smooth', file: 'tapes/smooth.tape.jsonl' },
  { name: 'busy', file: 'tapes/busy.tape.jsonl' },
  { name: 'jam', file: 'tapes/jam.tape.jsonl' },
  { name: 'storm', file: 'tapes/storm.tape.jsonl' },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function setPath(o: any, path: string, v: number): void {
  const ks = path.split('.'); let c = o;
  for (let i = 0; i < ks.length - 1; i++) c = c[ks[i]!];
  c[ks[ks.length - 1]!] = v;
}

interface ComboResult {
  idx: number;
  vals: number[];
  bands: Record<string, { m: Metrics; pass: boolean; viol: number }>;
  allGreen: boolean;
  totalViol: number;
  distance: number;
}

export function runSweep(_argv: string[]): void {
  const baseRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const sweep = JSON.parse(readFileSync(new URL('../sweep.json', import.meta.url), 'utf8'));
  const dims: Dim[] = sweep.dims;
  const current: Record<string, number> = sweep.baseline; // §5：距离锚＝上一个正式参数
  const { verdict, hash: verdictHash } = loadVerdict();
  const rainFloor = verdict.rain.floor;

  const tapeText = new Map<string, string>();
  for (const b of BANDS) tapeText.set(b.name, readFileSync(new URL('../' + b.file, import.meta.url), 'utf8'));

  const { results, csv } = computeSweep(baseRaw, dims, current, verdict, rainFloor, BANDS, tapeText);
  const greens = results.filter((r) => r.allGreen);
  const cmpChampion = (a: ComboResult, b: ComboResult): number =>
    a.distance - b.distance || a.bands.storm!.m.peakT - b.bands.storm!.m.peakT || a.vals[2]! - b.vals[2]!;
  const cmpPareto = (a: ComboResult, b: ComboResult): number =>
    a.totalViol - b.totalViol || cmpChampion(a, b);
  const provisional = greens.length === 0;
  const ranked = provisional ? [...results].sort(cmpPareto) : [...greens].sort(cmpChampion);
  const champion = ranked[0]!;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(process.cwd(), 'runs', `sweep-${ts}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'sweep_results.csv'), csv, 'utf8');

  const champRaw = JSON.parse(JSON.stringify(baseRaw));
  for (let i = 0; i < dims.length; i++) setPath(champRaw, dims[i]!.path, champion.vals[i]!);
  champRaw._source = `TAPE0 M1.6 sweep 冠军${provisional ? '（帕累托·provisional，M1.6-A §5 预授权：照常进 M2）' : ''}。基 params ${hashParams(baseRaw)} + verdict ${verdictHash}。`;
  const champHash = hashParams(champRaw);
  writeFileSync(join(outDir, 'champion.params.json'), JSON.stringify(champRaw, null, 2) + '\n', 'utf8');

  const report = buildSweepReport({ dims, results, greens, ranked, champion, provisional, champRaw, champHash, verdict, verdictHash, engineSha: gitSha() });
  writeFileSync(join(outDir, 'SWEEP_REPORT.md'), report, 'utf8');

  process.stdout.write(report);
  process.stdout.write(`\n产出：${relative(process.cwd(), outDir)}/{sweep_results.csv, SWEEP_REPORT.md, champion.params.json}\n`);
  process.stdout.write(provisional
    ? `\n⚠ 零全绿 → 帕累托冠军 provisional。M1.6-A §5：落盘并照常进 M2。若采纳，把 champion.params.json 覆盖 params.json。\n`
    : `\n全绿 ${greens.length} 组 → 冠军选定。若采纳，把 champion.params.json 覆盖 params.json。\n`);
}

// ---------- 纯扫参核（可测：同输入两跑逐字节一致，M1.6 §4.1 确定性） ----------

/** 枚举组合 × bands 全量回放 → { results, csv }。无 fs、确定性。sweep 与金测试共用。 */
export function computeSweep(
  baseRaw: unknown, dims: Dim[], current: Record<string, number>,
  verdict: Verdict, rainFloor: number, bands: BandDef[], tapeText: Map<string, string>,
): { results: ComboResult[]; csv: string } {
  const norm = (di: number, v: number): number => {
    const vs = dims[di]!.values; const mn = Math.min(...vs), mx = Math.max(...vs);
    return mx > mn ? (v - mn) / (mx - mn) : 0;
  };
  const distanceOf = (vals: number[]): number => {
    let d = 0;
    for (let i = 0; i < dims.length; i++) d += Math.abs(norm(i, vals[i]!) - norm(i, current[dims[i]!.path]!));
    return d;
  };
  let combos: number[][] = [[]];
  for (const dim of dims) {
    const next: number[][] = [];
    for (const prefix of combos) for (const v of dim.values) next.push([...prefix, v]);
    combos = next;
  }
  const results: ComboResult[] = [];
  for (let idx = 0; idx < combos.length; idx++) {
    const vals = combos[idx]!;
    const raw = JSON.parse(JSON.stringify(baseRaw));
    for (let i = 0; i < dims.length; i++) setPath(raw, dims[i]!.path, vals[i]!);
    const params = resolveParams(raw);
    const bandRes: ComboResult['bands'] = {};
    let allGreen = true, totalViol = 0;
    for (const b of bands) {
      const core = replayCore(tapeText.get(b.name)!, params, rainFloor);
      const mv = toMetricsView(core.metrics);
      const j = judgeBand(verdict.bands[b.name]!, mv);
      const viol = bandViolation(verdict.bands[b.name]!, mv);
      bandRes[b.name] = { m: core.metrics, pass: j.allGreen, viol };
      if (!j.allGreen) allGreen = false;
      totalViol += viol;
    }
    results.push({ idx, vals, bands: bandRes, allGreen, totalViol, distance: distanceOf(vals) });
  }
  return { results, csv: buildCsv(dims, bands, results) };
}

// ---------- CSV ----------

const BM = (b: string): string[] => [`${b}_peakT`, `${b}_dutyLt30`, `${b}_dutyRS`, `${b}_rainR`, `${b}_stuck`, `${b}_resolve`, `${b}_opp`, `${b}_pass`, `${b}_viol`];

function buildCsv(dims: Dim[], bands: BandDef[], results: ComboResult[]): string {
  const dimCols = dims.map((d) => d.path.split('.').pop());
  const head = ['combo', ...dimCols, ...bands.flatMap((b) => BM(b.name)), 'allGreen', 'totalViol'].join(',');
  const rows = results.map((r) => {
    const cells: (string | number)[] = [r.idx, ...r.vals];
    for (const b of bands) {
      const x = r.bands[b.name]!; const m = x.m;
      cells.push(m.peakT.toFixed(4), m.dutyTlt30.toFixed(4), m.dutyRainStorm.toFixed(4), m.rainR.toFixed(3),
        m.stuckEdges, m.resolves, m.opportunities, x.pass ? 1 : 0, x.viol.toFixed(4));
    }
    cells.push(r.allGreen ? 1 : 0, r.totalViol.toFixed(4));
    return cells.join(',');
  });
  return head + '\n' + rows.join('\n') + '\n';
}

// ---------- 敏感度表（M1.6-A §1.三一.3：参数耦合，H/M/L） ----------

interface SensMetric { key: string; get: (r: ComboResult) => number }
const SENS_METRICS: SensMetric[] = [
  { key: 'storm.peakT', get: (r) => r.bands.storm!.m.peakT },
  { key: 'storm.rainR', get: (r) => r.bands.storm!.m.rainR },
  { key: 'storm.dutyRS', get: (r) => r.bands.storm!.m.dutyRainStorm },
  { key: 'smooth.dutyLt30', get: (r) => r.bands.smooth!.m.dutyTlt30 },
  { key: 'busy.peakT', get: (r) => r.bands.busy!.m.peakT },
  { key: 'jam.stuck', get: (r) => r.bands.jam!.m.stuckEdges },
];

function sensitivityTable(dims: Dim[], results: ComboResult[]): string {
  const overall = new Map<string, number>();
  for (const mt of SENS_METRICS) { const vs = results.map(mt.get); overall.set(mt.key, Math.max(...vs) - Math.min(...vs)); }
  const head = `| 维度＼指标 | ${SENS_METRICS.map((m) => m.key).join(' | ')} |`;
  const sep = `|---|${SENS_METRICS.map(() => '---').join('|')}|`;
  const rows = dims.map((dim, di) => {
    const cells = SENS_METRICS.map((mt) => {
      const means = dim.values.map((v) => {
        const sub = results.filter((r) => r.vals[di] === v);
        return sub.reduce((a, r) => a + mt.get(r), 0) / sub.length;
      });
      const spread = Math.max(...means) - Math.min(...means);
      const ov = overall.get(mt.key) ?? 0;
      const ratio = ov > 1e-9 ? spread / ov : 0;
      return ratio >= 0.5 ? 'H' : ratio >= 0.2 ? 'M' : 'L';
    });
    return `| ${dim.path.split('.').pop()} | ${cells.join(' | ')} |`;
  });
  return [head, sep, ...rows].join('\n') + '\n\n_H/M/L = 该维取值对该指标的边际波动幅度（占该指标全局跨度比 ≥50%/≥20%/其余）。数据全在 sweep_results.csv，零额外回放。_';
}

// ---------- SWEEP_REPORT ----------

function paramLine(dims: Dim[], vals: number[]): string {
  return dims.map((d, i) => `${d.path.split('.').pop()}=${vals[i]}`).join(' ');
}

function buildSweepReport(a: {
  dims: Dim[]; results: ComboResult[]; greens: ComboResult[]; ranked: ComboResult[];
  champion: ComboResult; provisional: boolean; champRaw: unknown; champHash: string;
  verdict: Verdict; verdictHash: string; engineSha: string;
}): string {
  const { dims, results, greens, ranked, champion, provisional, champRaw, champHash, verdict, verdictHash, engineSha } = a;

  // 冠军红项（逐条 + 差距，双尺）
  const champRedBlocks = BANDS.map((b) => {
    const x = champion.bands[b.name]!;
    const j = judgeBand(verdict.bands[b.name]!, toMetricsView(x.m));
    const reds = j.rows.filter((r) => !r.ok);
    if (reds.length === 0) return null;
    return `- **${b.name}**：` + reds.map((r) => `${r.label}（实测 ${r.value}）`).join('；');
  }).filter(Boolean);

  // 领奖台前 3
  const podium = ranked.slice(0, 3).map((r, i) => {
    const marks = BANDS.map((b) => `${b.name.slice(0, 2)}${r.bands[b.name]!.pass ? '✅' : '❌'}`).join(' ');
    return `| ${i + 1} | ${paramLine(dims, r.vals)} | ${marks} | ${r.allGreen ? '✅' : '❌'} | ${r.distance.toFixed(3)} | ${r.totalViol.toFixed(3)} |`;
  }).join('\n');

  // 冠军参数下五带关键指标（双尺全量）
  const bandTable = BANDS.map((b) => {
    const m = champion.bands[b.name]!.m;
    return `| ${b.name} | ${m.peakT.toFixed(3)} | ${(m.dutyTlt30 * 100).toFixed(1)}% | ${(m.dutyRainStorm * 100).toFixed(1)}% | ${m.rainR.toFixed(2)} | ${m.stuckEdges} | ${m.resolves} | ${m.opportunities} | ${champion.bands[b.name]!.pass ? '✅' : '❌'} |`;
  }).join('\n');

  const gridLine = dims.map((d) => `${d.path.split('.').pop()}[${d.values.join(',')}]`).join(' × ');

  // 架构师预测验证（M1.7 §2）：886928d1 = READ0.21/fD0.4/tau120/repCap4/tR0.3
  const PRED = [0.21, 0.4, 120, 4, 0.3];
  const pred = results.find((r) => r.vals.every((v, i) => v === PRED[i]));
  const champIsPred = champion.vals.every((v, i) => v === PRED[i]);
  const predBlock = pred
    ? `## 架构师预测验证（M1.7 §2，可证伪）\n预测：\`886928d1\`(READ0.21/fD0.4) 在 verdict/2 下全绿并夺冠转正。\n- 886928d1 全绿：**${pred.allGreen ? '✅ 成立' : '❌ 不成立'}**（active 判定）\n- 886928d1 即冠军：**${champIsPred ? '✅ 成立' : `❌ 不成立——冠军是更靠近 baseline 的 \\\`${paramLine(dims, champion.vals)}\\\`（归一距离 ${champion.distance.toFixed(3)} < 886928d1 的 ${pred.distance.toFixed(3)}）`}**\n- 综合：${pred.allGreen && champIsPred ? '预测完全成立。' : pred.allGreen ? '预测半成立（全绿✅，但非最少改动冠军——机械规则选了更近 baseline 者，这是重要信息）。' : '预测不成立，照常出报告。'}\n`
    : '';

  return `# SWEEP_REPORT v2 — verdict/2 重扫（${results.length} 组 × 五带）
engine ${engineSha} / verdict ${verdictHash} / 组合 ${results.length}
网格：${gridLine}

## 结论
- 全绿组合数：**${greens.length} / ${results.length}**
- 闸门：${provisional
    ? '**零全绿 → 帕累托冠军（provisional）**。M1.6-A §5 预授权：落盘并**照常进 M2**（下一级信息增益来自 M2 人耳，不来自再一轮 CSV）。'
    : '存在全绿 → 按冠军规则 §4.3 选定，**直通 M2**。'}
- 冠军理由：${provisional
    ? `全组中归一化总违规最小（${champion.totalViol.toFixed(3)}）；并列取最少改动→storm峰值最低→τ最小。`
    : `全绿组中最少改动（归一距离 ${champion.distance.toFixed(3)}）→ storm 峰值最低 → τ 最小。`}

${predBlock}
## 冠军参数
\`${paramLine(dims, champion.vals)}\`
params hash \`${champHash}\` ｜ 距现参归一距离 ${champion.distance.toFixed(3)} ｜ 总违规 ${champion.totalViol.toFixed(3)}
${provisional ? `
## ⚠ Provisional 红项（逐条 + 差距，双尺并行数据见下表）
${champRedBlocks.length ? champRedBlocks.join('\n') : '（无——但非全绿，检查判据口径）'}
` : ''}
## 领奖台（前 3，按${provisional ? '帕累托' : '冠军'}规则）
| # | 参数 | 五带 | 全绿 | 归一距离 | 总违规 |
|---|---|---|---|---|---|
${podium}

## 冠军参数下五带关键指标（双尺全量：占空 + 雨量R）
| 带 | 峰值T | T<0.3占空 | RAIN+STORM占空 | 雨量R | STUCK边沿 | RESOLVE | 机会 | 判定 |
|---|---|---|---|---|---|---|---|---|
${bandTable}

## 敏感度表（参数耦合，H/M/L）
${sensitivityTable(dims, results)}

## 冠军 champion.params.json（落盘同目录）
\`\`\`json
${JSON.stringify(champRaw, null, 2)}
\`\`\`

---
_确定性：同网格两跑 sweep_results.csv 逐字节一致（金测试）。冠军若采纳则覆盖 params.json 并更新 hash。_
`;
}

function gitSha(): string {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); }
  catch { return 'nogit'; }
}
