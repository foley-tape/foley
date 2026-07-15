#!/usr/bin/env node
// 账本回写检查（席三工单二·诚约族）——闭合工单一「此后新增一条回写检查」·夜审 L§2.1「8挂账未回写」。
//
// 律：发现-源文档（夜审报告 / 施工复盘）的发现须回写 FOLEY_LEDGER.md（发现栏/门禁台账）——恢复并守
// 「唯一活文档＝唯一事实源」。悬置发现**超期**（源文档 git 龄 > GRACE 天）仍未回写即**黄牌**。
// 默认 warn（exit 0·informational）；--strict → 有黄牌即 exit 1（供 CI/release 硬闸）。
//
//   node scripts/check-ledger-writeback.mjs [--grace-days 3] [--strict]
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const GRACE = Number(argOf('--grace-days', 3));
const STRICT = process.argv.includes('--strict');

// 发现-源登记册：{doc, marker=LEDGER 须含之回写证}。新增夜审/复盘→回写后在此登记其 marker；
// 否则 auto-发现即黄牌逼「回写并登记」。marker 取该源在 LEDGER 里的唯一指纹（仓名/标签族/文件名）。
const SOURCES = [
  { doc: 'audit/night3-L/NIGHT3_REPORT.md', marker: 'night3-L' },
  { doc: 'audit/night3-R/NIGHT3_REPORT.md', marker: 'night3-R' },
  { doc: 'docs/复盘_渲染批与接线_施工侧.md', marker: '渲§' },       // 挂账八条标签族
  { doc: 'docs/复盘_施工侧观察.md', marker: '复盘_施工侧观察' },
  { doc: 'docs/复盘_新终端首轮_施工侧.md', marker: '复盘_新终端首轮' },
];
// 归档豁免：LEDGER 建账（2026-07-10）前的发现-源，发现另居 GATE.md/记忆/M2.6 修复——非本账本事实源。
const ARCHIVED = [/^audit\/night1\//, /^audit\/night2\//];
// 发现-源自动发现范围（一级夜审主报告 + 施工复盘）
const SRC_RE = /^(docs\/复盘_.*\.md|audit\/night\d[^/]*\/(NIGHT\d*_REPORT|AUDIT_REPORT)\.md)$/;

const ledger = readFileSync('FOLEY_LEDGER.md', 'utf8');
const ageDays = (path) => {
  try {
    const ct = Number(execFileSync('git', ['log', '-1', '--format=%ct', '--', path], { encoding: 'utf8' }).trim());
    return ct ? (Date.now() / 1000 - ct) / 86400 : 0;   // 未提交→0（宽限内）
  } catch { return 0; }
};

let tracked = [];
try { tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean); } catch { }   // -z：CJK 路径不加引号转义
const discovered = tracked.filter(f => SRC_RE.test(f) && !ARCHIVED.some(a => a.test(f)));

const yellow = [];
const rows = [];
const known = new Set(SOURCES.map(s => s.doc));

for (const s of SOURCES) {
  const has = ledger.includes(s.marker);
  const age = ageDays(s.doc);
  if (has) rows.push(['✓ 已回写', s.doc, `marker '${s.marker}'`, `${age.toFixed(1)}d`]);
  else if (age > GRACE) { rows.push(['✗ 超期未回写', s.doc, `marker '${s.marker}'`, `${age.toFixed(1)}d`]); yellow.push(`超期未回写：${s.doc}（marker '${s.marker}' 不在 LEDGER·龄 ${age.toFixed(1)}d）`); }
  else rows.push(['· 未回写(宽限内)', s.doc, `marker '${s.marker}'`, `${age.toFixed(1)}d`]);
}
for (const d of discovered) {
  if (known.has(d)) continue;
  const age = ageDays(d);
  if (age > GRACE) { rows.push(['✗ 未登记(超期)', d, '未在登记册', `${age.toFixed(1)}d`]); yellow.push(`未登记发现-源：${d}（龄 ${age.toFixed(1)}d·回写 LEDGER 后登记其 marker，或加 ARCHIVED 豁免）`); }
  else rows.push(['· 未登记(宽限内)', d, '未在登记册', `${age.toFixed(1)}d`]);
}

console.log(`账本回写检查（唯一活文档＝唯一事实源·GRACE ${GRACE}d）：`);
for (const r of rows) console.log(`  ${r[0]}  ${r[1]}  [${r[2]} · ${r[3]}]`);
if (yellow.length) {
  console.log(`\n🟡 黄牌 ${yellow.length}：`);
  for (const y of yellow) console.log('  · ' + y);
  process.exit(STRICT ? 1 : 0);
}
console.log('\n✓ 全部发现-源已回写 / 在宽限内。');
