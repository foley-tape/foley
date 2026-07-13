#!/usr/bin/env node
// 阶段〇·章分布报告器（增补包 v2 队列2＋定标语料条款）。
//
// 语料圈定（增补包 五·即日生效）：五厂带（storm/busy/jam/silence/smooth）＋现有真卡
// （$FOLEY_HOME/cards）＋滚动累积的船长真实会话蒸馏（captain 第六带即首笔滚动）。
// audit＝校验仪器带（生而策展的合成巡礼）：列出供对照，**不计分布**。
// 对照目标（词汇表 v1）：兜底 30–40%／类型各 5–15%／稀有 1–5%。阈值锁定最低语料量 30 场。
//
// 用法：node stage/tools/seal-report.mjs [--out 报告.md]（FOLEY_HOME 供测试/CI 指别处）
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildTape } from '../js/replay.js';
import { extractFeatures, judgeSeal, snapC, SEALS, SEAL_THRESHOLDS, SEAL_LAW_VER } from '../js/seal-law.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const FOLEY_HOME = process.env.FOLEY_HOME ?? join(homedir(), '.foley');
const CARDS_DIR = join(FOLEY_HOME, 'cards');
const args = process.argv.slice(2);
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

const FACTORY = ['storm', 'busy', 'jam', 'silence', 'smooth'];   // 五厂带（audit 除外＝仪器带）
const ROLLING = ['captain'];                                     // 滚动语料首笔（第六带·船长真实蒸馏）

function judgeFiles(name, curvePath, momentsPath) {
  const curve = readFileSync(curvePath, 'utf8');
  let moments = 't\n';
  try { if (momentsPath && existsSync(momentsPath)) moments = readFileSync(momentsPath, 'utf8'); } catch { /* 无时刻带合法 */ }
  const tape = buildTape(name, curve, moments);
  const f = extractFeatures(tape);
  return { f, v: judgeSeal(f) };
}

const rows = [];   // { group, name, 仓籍, f, v, inCorpus }
for (const n of FACTORY) {
  const cv = join(FIX, `${n}.curve.csv`);
  if (!existsSync(cv)) continue;
  const { f, v } = judgeFiles(n, cv, join(FIX, `${n}.moments.csv`));
  rows.push({ group: '厂带', name: n, ji: '厂', f, v, inCorpus: true });
}
for (const n of ROLLING) {
  const cv = join(FIX, `${n}.curve.csv`);
  if (!existsSync(cv)) continue;
  const { f, v } = judgeFiles(n, cv, join(FIX, `${n}.moments.csv`));
  rows.push({ group: '滚动', name: n, ji: '滚动', f, v, inCorpus: true });
}
const repoSet = new Set();   // 仓覆盖账（锁定双条件之二·派工包§二：只数真卡的仓）
try {
  for (const e of readdirSync(CARDS_DIR, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const cv = join(CARDS_DIR, e.name, 'curve.csv');
    if (!existsSync(cv)) continue;
    let label = '', repo = '';
    try {
      const rj = JSON.parse(readFileSync(join(CARDS_DIR, e.name, 'rack.json'), 'utf8'));
      label = rj.ft ? `FT-${String(rj.ft).padStart(4, '0')} ` : '';
      repo = rj.repo ?? '';
      label += repo;
    } catch { /* 无标签照判 */ }
    if (repo) repoSet.add(repo);
    // 仓籍标签（派工包§二配套令）：foley 自指=造 Foley 的元会话（本仓 tape0）；余为他仓
    const ji = repo === 'tape0' ? '自指' : repo ? `他仓·${repo}` : '仓未标';
    const { f, v } = judgeFiles(e.name, cv, join(CARDS_DIR, e.name, 'moments.csv'));
    rows.push({ group: '真卡', name: `${e.name.slice(0, 8)}…${label ? '（' + label + '）' : ''}`, ji, f, v, inCorpus: true });
  }
} catch { /* 无卡房 */ }
// 仪器带（列不计）
{
  const cv = join(FIX, 'audit.curve.csv');
  if (existsSync(cv)) {
    const { f, v } = judgeFiles('audit', cv, join(FIX, 'audit.moments.csv'));
    rows.push({ group: '仪器', name: 'audit（校验带·不计分布）', ji: '仪器', f, v, inCorpus: false });
  }
}

const corpus = rows.filter((r) => r.inCorpus);
const counts = new Map(SEALS.map((s) => [s.id, 0]));
for (const r of corpus) counts.set(r.v.id, counts.get(r.v.id) + 1);

const fmtMin = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${Math.round((s % 3600) / 60)}m` : `${Math.round(s / 60)}min`);
const L = [];
L.push(`# 阶段〇·章分布报告（首份）`);
L.push(`生成：${new Date().toISOString().slice(0, 10)} · 判据版本 SEAL_LAW_VER=${SEAL_LAW_VER}（草章期·全部起手值）`);
L.push(``);
L.push(`## 逐带判章`);
L.push(`| 组 | 带 | 仓籍 | 时长 | C-号 | 章 | 判章理由 |`);
L.push(`|---|---|---|---|---|---|---|`);
for (const r of rows) {
  L.push(`| ${r.group} | ${r.name} | ${r.ji} | ${fmtMin(r.f.durS)} | ${snapC(r.f.durS)} | ${r.v.en}·${r.v.zh}${r.inCorpus ? '' : '†'} | ${r.v.reason} |`);
}
L.push(``);
L.push(`## 分布 对照 词汇表 v1 目标（语料 n=${corpus.length}）`);
L.push(`| 章 | 目标带 | 计数 | 实测 | 裁 |`);
L.push(`|---|---|---|---|---|`);
for (const s of SEALS) {
  const n = counts.get(s.id);
  const pct = corpus.length ? (100 * n) / corpus.length : 0;
  const [lo, hi] = s.band;
  const verdict = n === 0 ? (lo <= 0 ? '—' : '缺席') : pct < lo ? '偏低' : pct > hi ? '**偏高**' : '入带';
  L.push(`| ${s.en}·${s.zh} | ${lo}–${hi}% | ${n} | ${pct.toFixed(0)}% | ${verdict} |`);
}
L.push(``);
L.push(`## 泡语料仪表（阈值锁定**双条件**·派工包§二：量满 30 场 且 仓覆盖 ≥3）`);
const cardN = rows.filter((r) => r.group === '真卡').length;
const selfN = rows.filter((r) => r.ji === '自指').length;
const q1 = corpus.length >= 30, q2 = repoSet.size >= 3;
L.push(`- 量：**${corpus.length}／30 场**（厂带 ${rows.filter((r) => r.group === '厂带').length}＋滚动 ${rows.filter((r) => r.group === '滚动').length}＋真卡 ${cardN}）${q1 ? '✓' : '未满'}`);
L.push(`- 仓覆盖：**${repoSet.size}／3 仓**（${[...repoSet].join('、')}）${q2 ? '✓' : '未满'}`);
L.push(`- 自指占比：真卡中 foley 自指 ${selfN}/${cardN}（${cardN ? Math.round(100 * selfN / cardN) : 0}%）——自指元会话过拟合警戒（派工包§二配套令）`);
L.push(`- 锁定门：${q1 && q2 ? '**双条件已齐——可提请阈值立法**' : '未齐，继续泡（泡的是日历不是工时）'}`);
L.push(`- 滚动增量源：船长真实会话蒸馏（收工吐卡即入语料·全程本地永不出屋）`);
L.push(``);
L.push(`## 现行起手值（阈值立法时逐条过堂）`);
L.push('```json');
L.push(JSON.stringify(SEAL_THRESHOLDS, (k, v2) => (k === 'skeletonN' ? undefined : v2), 2));
L.push('```');
L.push(`† 仪器带不计分布。分布偏斜在定标期是**观察对象不是缺陷**——判据为起手值，30 场后阈值立法再收。`);

const out = L.join('\n') + '\n';
process.stdout.write(out);
if (outFile) { writeFileSync(outFile, out); console.error(`[written] ${outFile}`); }
