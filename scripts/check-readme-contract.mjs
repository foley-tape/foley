#!/usr/bin/env node
// README 承诺对表闸（席三工单二·诚约族·夜审 L#2/右耳隐私）——机械化席一 item1 之 PRIVACY-CLAIMS-MATRIX。
//
// 律：README/README.zh/LAUNCH_KIT 的隐私承诺须与代码行为一致（PRIV-01~07 稳定 Claim ID）：
//   · 旧「never stored / 永不落盘」式超额承诺（P0 谎——本地标题实存 rack.json）绝迹；
//   · 本地标题披露 + 退出开关（FOLEY_NO_LOCAL_TITLES/localTitles）+ 出屋默认脱敏 三诚实句在场。
// README 任何隐私句变动须重新过此闸（席一 matrix「交席三事项」#1）。隐私属 P0——命中即红（非黄牌）。
// 用作 prepublish/CI 闸，**不入默认 npm test**。--root 指别处工作树（供席三对审席一 seat/trust）。
//
//   node scripts/check-readme-contract.mjs [--root <repoRoot>]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
let ROOT = argOf('--root', null);
if (!ROOT) { try { ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { ROOT = process.cwd(); } }

const FILES = ['README.md', 'README.zh.md', 'docs/launch/LAUNCH_KIT.md'];
const MATRIX = 'docs/launch/PRIVACY-CLAIMS-MATRIX.md';   // 席一 item1 对照表·PRIV-01~07 单源
const read = (p) => { const f = join(ROOT, p); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
const texts = Object.fromEntries(FILES.map(f => [f, read(f)]));
const corpus = FILES.map(f => texts[f] || '').join('\n');

// 禁句（隐私谎·任一文件命中即红）——绑 PRIV-02（本地标题实存·非 never stored）
const FORBIDDEN = [
  { id: 'PRIV-02', re: /\bnever stored\b/i, why: '「never stored」超额承诺（本地标题实存 rack.json）' },
  { id: 'PRIV-02', re: /transcripts?\s+never\s+(stored|shown)/i, why: '「transcripts never stored/shown」超额承诺' },
  { id: 'PRIV-02', re: /(原文|对话)\s*永不落盘/, why: '「永不落盘」超额承诺' },
];
// 须句（诚实披露·合并语料任一别名满足）
const REQUIRED = [
  { id: 'PRIV-02', re: /(local (opening )?title|本地(开场)?标题)/i, why: '披露首句成本地标题' },
  { id: 'PRIV-03', re: /(FOLEY_NO_LOCAL_TITLES|localTitles)/, why: '披露标题退出开关' },
  { id: 'PRIV-05', re: /(redact|脱敏|minimization)/i, why: '披露出屋默认脱敏' },
];

const problems = [];
if (!read(MATRIX)) problems.push(`契约缺席：${MATRIX} 不存在（PRIV-01~07 单源·席一 item1 应交/合入）`);
for (const f of FILES) {
  if (texts[f] == null) { problems.push(`文件缺席：${f}`); continue; }
  for (const g of FORBIDDEN) if (g.re.test(texts[f])) problems.push(`禁句命中 ${f}〔${g.id}〕：${g.why}`);
}
for (const r of REQUIRED) if (!r.re.test(corpus)) problems.push(`须句缺席〔${r.id}〕：${r.why}`);

console.log(`README 承诺对表闸（root=${ROOT}）`);
console.log(`  扫描：${FILES.filter(f => texts[f] != null).join('、') || '（无）'}`);
console.log(`  契约锚 ${MATRIX}：${read(MATRIX) ? '在' : '缺'}`);
if (problems.length) {
  console.error(`\n✗ 隐私对表不合 ${problems.length} 条：`);
  for (const p of problems) console.error('  · ' + p);
  process.exit(1);
}
console.log(`\n✓ README 隐私承诺与 PRIV-01~07 对表一致。`);
