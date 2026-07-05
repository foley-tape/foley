// cli ear —— 声音层机器验收（白皮书 §6.1）：五带回放，床响度包络（1s RMS）与 T 曲线 Pearson r。
// storm 必测 r ≥ 0.6（F5"床的能量包络必须诚实追随 T"的可执行化）。
// 包络由 sound/ 纯映射核算出——与 probe 渲染器同一段代码，验的是设计律本身，不是渲染巧合。
// 人耳条目（盲听 v2 / F3 保护性检查 / 阻断级听感）机器不可代劳，报告中列为待船长。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { resolveParams, hashParams, hashJson } from '../engine/params.ts';
import { replayCore, loadVerdict } from './replay.ts';
import { resolveSoundParams, bedTargets, bedEnergyDb, pearson, type SoundParams } from '../sound/index.ts';
import type { StatePacket } from '../protocol/index.ts';

const TAPES = ['silence', 'smooth', 'busy', 'jam', 'storm'] as const;

/** snaps → 1s 窗：窗内床能量 RMS（dB 域先转线性再 RMS 再回 dB）与 T 均值。 */
export function envelope1s(snaps: StatePacket[], sp: SoundParams): { edb: number[]; t: number[] } {
  const bySec = new Map<number, { e2: number; t: number; n: number }>();
  for (const s of snaps) {
    const sec = Math.floor(s.t / 1000);
    const bt = bedTargets({ T: s.T, A: s.A, wow: s.wow, phase: s.phase, weather: s.weather, pendingAsk: s.pendingAsk }, sp);
    const lin = Math.pow(10, bedEnergyDb(bt) / 20);
    const cell = bySec.get(sec) ?? { e2: 0, t: 0, n: 0 };
    cell.e2 += lin * lin; cell.t += s.T; cell.n++;
    bySec.set(sec, cell);
  }
  const secs = [...bySec.keys()].sort((a, b) => a - b);
  const edb: number[] = [], t: number[] = [];
  for (const sec of secs) {
    const c = bySec.get(sec)!;
    const rms = Math.sqrt(c.e2 / c.n);
    edb.push(rms <= 1e-9 ? -120 : 20 * Math.log10(rms));
    t.push(c.t / c.n);
  }
  return { edb, t };
}

export function runEar(argv: string[]): void {
  void argv;
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const soundRaw = JSON.parse(readFileSync(new URL('../sound-params.json', import.meta.url), 'utf8'));
  const sp = resolveSoundParams(soundRaw);
  const { verdict, hash: verdictHash } = loadVerdict();

  const rows: string[] = [];
  let stormR: number | null = null;
  for (const k of TAPES) {
    const core = replayCore(readFileSync(new URL(`../tapes/${k}.tape.jsonl`, import.meta.url), 'utf8'), params, verdict.rain.floor);
    const { edb, t } = envelope1s(core.snaps, sp);
    const r = pearson(edb, t);
    if (k === 'storm') stormR = r;
    const mark = r === null ? 'NA（方差趋零）' : r >= 0.6 ? `✅ ${r.toFixed(3)}` : `ℹ ${r.toFixed(3)}`;
    rows.push(`| ${k} | ${edb.length} | ${core.metrics.peakT.toFixed(3)} | ${mark} |`);
  }
  const stormPass = stormR !== null && stormR >= 0.6;

  const report = `# EAR_ACCEPT —— 声音层机器验收（白皮书 §6）

engine ${gitShaSafe()} / params ${hashParams(paramsRaw)} / verdict ${verdictHash} / **sound-params ${hashJson(soundRaw)}**

## §6.1 床响度包络（1s RMS）× T 曲线 Pearson r
| 磁带 | 1s窗数 | 峰值T | r |
|---|---|---|---|
${rows.join('\n')}

**storm（必测）：${stormPass ? `✅ r=${stormR!.toFixed(3)} ≥ 0.6` : `❌ r=${stormR === null ? 'NA' : stormR.toFixed(3)} < 0.6`}**
_r 的口径：床能量由 sound/ 纯映射核（与 probe 渲染器同源）从 curve 状态逐样本算出，按 1s 窗 RMS；
A 驱动的 S2 是白皮书明令的第二驱动（律动密度 ∝ A），故 A 主导带（busy）的 r 天然偏低——informational。_

## 人耳条目（机器不可代劳，待船长）
- [ ] §6.2 盲听 v2：单卷冷听（不许对比）30–60s 判日子类型 ≥4/5；G2"愿意陪一下午"≥"看情况"（\`probe --anon\` 出匿名卷）
- [ ] §6.3 F3 保护性检查：突变警觉证词复现（升频/骤变"想回头看"）
- [ ] §6.4 呼唤级三音在床最响时一耳可辨（ASK 频谱专区 ${sp.call.askBandHzLo}–${sp.call.askBandHzHi}Hz 已由纯核夹带；实听复核）
- [ ] §6.5 阻断级听感条目 = 0

## 响度纪律（§7 起手值，静态增益近似；LUFS 实测校准入冰箱）
床 ${sp.loudness.bedLufs} LUFS ±${sp.loudness.bedSwingDb}｜前景峰 ${sp.loudness.fgPeakLufs}｜呼唤 ${sp.loudness.callPeakLufs}｜真峰 ≤ ${sp.loudness.truePeakDbTp}dBTP
`;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(process.cwd(), 'runs', `ear-${ts}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'EAR_ACCEPT.md'), report, 'utf8');
  process.stdout.write(report);
  process.stdout.write(`\n产出：${relative(process.cwd(), join(outDir, 'EAR_ACCEPT.md'))}\n`);
  if (!stormPass) process.exit(1);
}

function gitShaSafe(): string {
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); }
  catch { return 'nogit'; }
}
