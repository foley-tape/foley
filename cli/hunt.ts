// cli hunt —— 磁带狩猎 v2（M1.9 §1.3：真实覆盖归零的补课）。
// 猎场：~/.claude/projects 最新会话（含 M1.8 修复会话本身）。只读、零网络、隐私膜内（原始只经蒸馏器）。
//
// 两卷目标（判据来自施工令原文）：
//  - 真卡碟带：同 (verb,tool,targetHash) 目标槽在**单 episode 内** FAIL ≥3；最好含 ok 型破卡碟
//    （≥3 败后同槽 OK）。这才是跳针——29 个不同 URL 是扫射，不算。
//  - 释放带：高张力处 test 转绿或提交收尾——引擎实跑（replayCore）后看 RESOLVE 发射时刻的 T。
//
// 产出：HUNT_REPORT.md = 体检表 + 引擎判定双件套（入册报批件）。不自动入册——圈选权在人。

import { readdirSync, statSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import {
  distillFile, serializeTape, healthOf, clearSigOf,
  type DistillResult, type HealthCard,
} from '../adapters/claude-jsonl/index.ts';
import { resolveParams, type Params } from '../engine/params.ts';
import { replayCore } from './replay.ts';
import { loadVerdict } from './replay.ts';

interface SlotStat { slot: string; verb: string; tool: string; episode: number; fails: number; okBreak: boolean }
interface ResolveAt { t: number; T: number; kind: string }

interface HuntCard {
  path: string;
  short: string;
  health: HealthCard;
  // 卡碟面
  bestSlot: SlotStat | null;      // 单 episode 内 FAIL 最多的目标槽
  slotsGe3: number;               // 达标（≥3）槽数
  // 释放面
  peakT: number;
  resolves: ResolveAt[];          // RESOLVE 发射时刻与其时 T
  bestRelease: ResolveAt | null;  // T 最高的 RESOLVE
}

function findJsonl(root: string, sinceMs: number): string[] {
  const out: string[] = [];
  let entries: string[];
  try { entries = readdirSync(root, { recursive: true }) as string[]; }
  catch { return out; }
  for (const e of entries) {
    if (typeof e !== 'string' || !e.endsWith('.jsonl')) continue;
    const p = join(root, e);
    try { if (statSync(p).mtimeMs >= sinceMs) out.push(p); }
    catch { /* 消失：跳过 */ }
  }
  return out;
}

/** 槽级卡碟分析：同 (verb,tool,targetHash) 单 episode 内 FAIL 计数 + ok 型破卡碟检查。 */
function slotAnalysis(d: DistillResult): { best: SlotStat | null; ge3: number } {
  const failsBySlot = new Map<string, { verb: string; tool: string; episode: number; failTs: number[]; okAfter: boolean }>();
  for (const r of d.records) {
    if (r.special || !r.targetHash) continue;
    const key = `${r.episode}|${clearSigOf(r)}`;
    if (r.outcome === 'FAIL') {
      let s = failsBySlot.get(key);
      if (!s) { s = { verb: r.verb, tool: r.tool, episode: r.episode, failTs: [], okAfter: false }; failsBySlot.set(key, s); }
      s.failTs.push(r.t);
    } else if (r.outcome === 'OK') {
      const s = failsBySlot.get(key);
      if (s && s.failTs.length >= 3) s.okAfter = true; // ≥3 败后同槽 OK = ok 型破卡碟素材
    }
  }
  let best: SlotStat | null = null;
  let ge3 = 0;
  for (const [key, s] of failsBySlot) {
    if (s.failTs.length >= 3) ge3++;
    const cand: SlotStat = {
      slot: key.split('|')[1]!, verb: s.verb, tool: s.tool, episode: s.episode,
      fails: s.failTs.length, okBreak: s.okAfter,
    };
    if (!best || cand.fails > best.fails || (cand.fails === best.fails && cand.okBreak && !best.okBreak)) best = cand;
  }
  return { best, ge3 };
}

export function runHunt(argv: string[]): void {
  const allIdx = argv.indexOf('--all');
  const daysIdx = argv.indexOf('--days');
  const days = daysIdx >= 0 ? Number(argv[daysIdx + 1]) : 14;
  const dirIdx = argv.indexOf('--dir');
  const projects = dirIdx >= 0 ? argv[dirIdx + 1]! : join(homedir(), '.claude', 'projects');
  const sinceMs = allIdx >= 0 ? 0 : Date.now() - days * 86_400_000;

  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params: Params = resolveParams(paramsRaw);
  const { verdict } = loadVerdict();
  const floor = verdict.rain.floor;

  const files = findJsonl(projects, sinceMs);
  process.stderr.write(`狩猎 v2：${projects}（${allIdx >= 0 ? '全部' : `近 ${days} 天`}）→ ${files.length} 卷\n`);

  const cards: HuntCard[] = [];
  for (const path of files) {
    let d: DistillResult;
    try { d = distillFile(path, params); }
    catch (err) { process.stderr.write(`跳过（禁 crash）: ${path} — ${(err as Error).message}\n`); continue; }
    if (d.records.filter((r) => !r.special).length < 10) continue; // 太薄不值得引擎跑

    const { best, ge3 } = slotAnalysis(d);

    // 引擎实跑：RESOLVE 时刻的 T（释放带判据的"高张力处"由引擎说了算，不手扒）
    const core = replayCore(serializeTape(d), params, floor);
    const Tat = (t: number): number => {
      let lo = 0, hi = core.snaps.length - 1, bi = -1;
      while (lo <= hi) { const md = (lo + hi) >> 1; if (core.snaps[md]!.t <= t) { bi = md; lo = md + 1; } else hi = md - 1; }
      return bi >= 0 ? core.snaps[bi]!.T : 0;
    };
    const resolves: ResolveAt[] = core.emitted
      .filter((e) => e.ev.special === 'RESOLVE')
      .map((e) => ({
        t: e.ev.t, T: Tat(e.ev.t - 1),
        kind: e.ev.verb === 'SAVE' ? 'SAVE' : e.ev.tags.includes('test') ? 'test绿' : '破卡碟',
      }));
    const bestRelease = resolves.reduce<ResolveAt | null>((a, b) => (a && a.T >= b.T ? a : b), null);

    cards.push({
      path, short: relative(projects, path), health: healthOf(d),
      bestSlot: best, slotsGe3: ge3,
      peakT: core.metrics.peakT, resolves, bestRelease,
    });
  }

  // 提名排序
  const jamCands = cards
    .filter((c) => c.bestSlot !== null && c.bestSlot.fails >= 3)
    .sort((a, b) => Number(b.bestSlot!.okBreak) - Number(a.bestSlot!.okBreak) || b.bestSlot!.fails - a.bestSlot!.fails || b.health.activeMin - a.health.activeMin)
    .slice(0, 8);
  const releaseCands = cards
    .filter((c) => c.bestRelease !== null && c.bestRelease.T >= 0.40)
    .sort((a, b) => b.bestRelease!.T - a.bestRelease!.T)
    .slice(0, 8);

  const f1 = (n: number): string => n.toFixed(1);
  const f3 = (n: number): string => n.toFixed(3);
  const jamRows = jamCands.map((c) => {
    const s = c.bestSlot!;
    return `| \`${c.short}\` | ${s.verb}/${s.tool} | ep${s.episode} ×${s.fails} | ${s.okBreak ? '✅ ok型' : '—'} | ${c.slotsGe3} | ${f1(c.health.activeMin)} | ${c.health.eventCount} | ${f3(c.peakT)} |`;
  }).join('\n');
  const relRows = releaseCands.map((c) => {
    const r = c.bestRelease!;
    return `| \`${c.short}\` | ${r.kind} | T=${f3(r.T)} | ${new Date(r.t).toISOString()} | ${c.resolves.length} | ${f1(c.health.activeMin)} | ${c.health.eventCount} | ${f3(c.peakT)} |`;
  }).join('\n');

  const report = `# HUNT v2 报告（M1.9 §1.3）——体检表＋引擎判定双件套

> 猎场 \`${projects}\`（${allIdx >= 0 ? '全部' : `近 ${days} 天`}，扫 ${cards.length} 卷可用）。
> 引擎判定 = replayCore 实跑（params 现役冠军），非手扒。**不自动入册——圈选后走 distill 入册照旧。**

## 真卡碟带候选（同 verb+tool+targetHash 单 episode 内 ≥3 败）
${jamCands.length === 0 ? '_（无候选：近期会话无单槽 ≥3 败——记缺照常）_' : `| 磁带 | 槽 | 单ep最大同槽败 | ok型破卡碟 | 达标槽数 | 活跃min | 事件 | 峰值T |
|---|---|---|---|---|---|---|---|
${jamRows}`}

## 释放带候选（高张力处 RESOLVE：test 转绿 / SAVE / 破卡碟）
${releaseCands.length === 0 ? '_（无候选：近期会话无 T≥0.40 处的 RESOLVE——记缺照常）_' : `| 磁带 | 释放形态 | 释放时T | 时刻 | RESOLVE总数 | 活跃min | 事件 | 峰值T |
|---|---|---|---|---|---|---|---|
${relRows}`}

## 入册流程（照旧）
1. 圈选 → \`node cli/index.ts distill <原始> tapes/<名>.tape.jsonl\`
2. 新带接任 jam 角色：\`stuckEdges\` 以 informational 复活一轮（判据试用期法）再转 active
3. 旧 jam 带转任"轻症"参考或退役；随后重扫＝例行换冠军
4. 一卷都没有 → 记缺照常，缺口保留在 verdict \`_batteryCoverage\`
`;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(process.cwd(), 'runs', ts);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'HUNT_REPORT.md'), report, 'utf8');
  process.stdout.write(report);
  process.stdout.write(`\n产出：${relative(process.cwd(), join(outDir, 'HUNT_REPORT.md'))}\n`);
}
