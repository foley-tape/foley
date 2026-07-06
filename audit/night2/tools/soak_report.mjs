// NIGHT-2 §2 晨间一条命令：node audit/night2/tools/soak_report.mjs [soakDir] [liveOutDir]
// 汇 soak/{system,host,browser,gen-log}.csv + runs/live-*/{curve,moments}.csv + 各 log → SOAK2_REPORT.md
import fs from 'node:fs';
import path from 'node:path';

const WT = '/Users/shadow/tape0-night2';
const SOAK = process.argv[2] ?? path.join(WT, 'audit/night2/soak');
const localDate = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const LIVEOUT = process.argv[3] ?? path.join(WT, 'runs', `live-${localDate(Date.now())}`);

const readCsv = (p) => {
  try {
    const rows = fs.readFileSync(p, 'utf8').trim().split('\n');
    const head = rows[0].split(',');
    return rows.slice(1).map(r => { const c = r.split(','); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
  } catch { return []; }
};
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
const q = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const fmtMB = (kb) => (kb / 1024).toFixed(1) + 'MB';
const hhmm = (ms) => new Date(ms).toTimeString().slice(0, 8);
const slopePerHour = (pts) => { // 最小二乘 [t(ms), v] → v/h
  if (pts.length < 3) return null;
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let a = 0, b = 0;
  for (const [x, y] of pts) { a += (x - mx) * (y - my); b += (x - mx) ** 2; }
  return b === 0 ? null : (a / b) * 3600000;
};

const sys = readCsv(path.join(SOAK, 'system.csv'));
const host = readCsv(path.join(SOAK, 'host.csv'));
const br = readCsv(path.join(SOAK, 'browser.csv'));
const gen = readCsv(path.join(SOAK, 'gen-log.csv'));
const curve = readCsv(path.join(LIVEOUT, 'curve.csv'));
const moments = readCsv(path.join(LIVEOUT, 'moments.csv'));
const slurp = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
const serveLog = slurp(path.join(SOAK, 'serve.log'));
const brLog = slurp(path.join(SOAK, 'browser-console.log'));
const driverLog = slurp(path.join(SOAK, 'driver.log'));
const plan = (() => { try { return JSON.parse(slurp(path.join(SOAK, 'gen-plan.json'))); } catch { return null; } })();

let md = `# SOAK2_REPORT — NIGHT-2 §2 整机通宵值机\n\n`;
md += `> 首夜全栈过夜：合成会话（种子 ${plan?.seed ?? '?'}，计划 ${plan?.n ?? '?'} 行）→ cli live（serve 自孵，20Hz）→ SSE → 真浏览器引擎全程在场。\n> soak 目录：\`audit/night2/soak/\`；live 产物流：\`${path.relative(WT, LIVEOUT)}\`。\n\n`;

// —— 值机时窗
const t0 = sys.length ? num(sys[0].wall) * 1000 : null;
const t1 = sys.length ? num(sys[sys.length - 1].wall) * 1000 : null;
md += `## 0. 时窗\n\n- 采样起止：${t0 ? hhmm(t0) : '?'} → ${t1 ? hhmm(t1) : '?'}（${t0 && t1 ? ((t1 - t0) / 3600000).toFixed(2) : '?'} 小时）\n- driver 日志：\n\`\`\`\n${driverLog.trim()}\n\`\`\`\n\n`;

// —— RSS
md += `## 1. 常驻内存（RSS）——bounded 纪律实测\n\n| 角色 | 首采 | 末采 | 峰值 | 斜率/小时 | 判语 |\n|---|---|---|---|---|---|\n`;
const roles = [...new Set(sys.map(r => r.role))];
for (const role of roles) {
  const rows = sys.filter(r => r.role === role && num(r.rss_kb) !== null);
  if (!rows.length) continue;
  const pts = rows.map(r => [num(r.wall) * 1000, num(r.rss_kb)]);
  const rss = pts.map(p => p[1]);
  const sl = slopePerHour(pts);
  const verdict = sl === null ? '样本不足' : Math.abs(sl) < 1024 ? '恒平 ✅' : sl > 0 ? `**增长 ⚠️ +${fmtMB(sl)}/h**` : '下降';
  md += `| ${role} | ${fmtMB(rss[0])} | ${fmtMB(rss[rss.length - 1])} | ${fmtMB(Math.max(...rss))} | ${sl === null ? '—' : (sl >= 0 ? '+' : '') + fmtMB(sl)} | ${verdict} |\n`;
}
md += `\n浏览器标签页 JS 堆：`;
const heaps = br.map(r => num(r.heapUsed)).filter(x => x);
if (heaps.length) {
  const hp = br.filter(r => num(r.heapUsed)).map(r => [num(r.wall), num(r.heapUsed)]);
  const hs = slopePerHour(hp);
  md += `首 ${(heaps[0] / 1048576).toFixed(1)}MB → 末 ${(heaps[heaps.length - 1] / 1048576).toFixed(1)}MB（峰 ${(Math.max(...heaps) / 1048576).toFixed(1)}MB，斜率 ${hs === null ? '—' : (hs / 1048576).toFixed(2) + 'MB/h'}）\n`;
} else md += `无数据\n`;

// —— CPU / 体温
md += `\n## 2. CPU 与体温法\n\n| 角色 | CPU 均值% | CPU 峰值% |\n|---|---|---|\n`;
for (const role of roles) {
  const cpu = sys.filter(r => r.role === role).map(r => num(r.pcpu)).filter(x => x !== null);
  if (!cpu.length) continue;
  md += `| ${role} | ${(cpu.reduce((a, b) => a + b, 0) / cpu.length).toFixed(1)} | ${Math.max(...cpu).toFixed(1)} |\n`;
}
const loads = host.map(r => num(r.load1)).filter(x => x !== null);
md += `\n- 主机 load1：均 ${loads.length ? (loads.reduce((a, b) => a + b, 0) / loads.length).toFixed(2) : '?'}，峰 ${loads.length ? Math.max(...loads).toFixed(2) : '?'}\n`;
const thermSample = host.find(r => r.therm && r.therm.length > 4 && !/error|not/i.test(r.therm));
md += thermSample ? `- 热度采样（pmset -g therm）示例：\`${String(thermSample.therm).slice(0, 120)}\`；CPU_Speed_Limit 全程异常与否见 host.csv\n` : `- 热度：pmset -g therm 本机不可用/无输出（如实申报，改以 CPU% 与 load 为体温代理）\n`;

// —— 恒迟影子
md += `\n## 3. 恒迟影子（浏览器实测：到达墙钟 − 包内 t）\n\n`;
const lagRows = br.filter(r => num(r.lagMean) !== null).map(r => [num(r.wall), num(r.lagMean)]);
if (lagRows.length >= 3) {
  const lags = lagRows.map(p => p[1]);
  const firstH = lagRows.slice(0, Math.min(60, Math.ceil(lagRows.length / 6))).map(p => p[1]);
  const lastH = lagRows.slice(-Math.min(60, Math.ceil(lagRows.length / 6))).map(p => p[1]);
  const drift = slopePerHour(lagRows);
  md += `- 分均值：全程中位 ${q(lags, 0.5)?.toFixed(1)}ms ｜ 首时段均 ${(firstH.reduce((a, b) => a + b, 0) / firstH.length).toFixed(1)}ms → 末时段均 ${(lastH.reduce((a, b) => a + b, 0) / lastH.length).toFixed(1)}ms\n`;
  md += `- 漂移斜率：${drift === null ? '—' : drift.toFixed(1) + ' ms/h'} ${drift !== null && Math.abs(drift) < 20 ? '（恒迟成立 ✅）' : '（**漂移可疑 ⚠️**）'}\n`;
  const lagMaxAll = br.map(r => num(r.lagMax)).filter(x => x !== null);
  md += `- 分钟窗内峰值的峰值：${lagMaxAll.length ? Math.max(...lagMaxAll).toFixed(0) : '?'}ms\n`;
} else md += `样本不足。\n`;
const gone = br.length ? br[br.length - 1].goneSeen : '0';
md += `- SSE 断线（gone 事件）：${gone} 次\n`;

// —— 发生器守时 & moments 发射对账
md += `\n## 4. 发射时刻 vs 理论时刻\n\n`;
const late = gen.map(r => num(r.latenessMs)).filter(x => x !== null);
md += `- 发生器写出迟到（计划→实写）：p50 ${q(late, 0.5)}ms ｜ p95 ${q(late, 0.95)}ms ｜ max ${late.length ? Math.max(...late) : '?'}ms（500ms 轮询节拍内为正常）\n`;
const emitLag = moments.map(r => (num(r.emitT) ?? 0) - (num(r.t) ?? 0)).filter(x => Number.isFinite(x));
if (emitLag.length) {
  md += `- live 时刻发射（emitT − t，含追赶期负载）：p50 ${q(emitLag, 0.5)?.toFixed(0)}ms ｜ p95 ${q(emitLag, 0.95)?.toFixed(0)}ms ｜ max ${Math.max(...emitLag).toFixed(0)}ms\n`;
  const askM = moments.filter(r => r.verb === 'ASK' || (r.special ?? '').startsWith('ASK'));
  if (askM.length) {
    const al = askM.map(r => (num(r.emitT) ?? 0) - (num(r.t) ?? 0));
    md += `- ASK/ASK_CLEARED 直通道：${askM.length} 发，emit 滞后 max ${Math.max(...al).toFixed(0)}ms（协议：不排队）\n`;
  }
}

// —— 深睡台阶 & phase
md += `\n## 5. 深睡台阶与相位（curve.csv）\n\n`;
if (curve.length) {
  const trans = [];
  for (let i = 1; i < curve.length; i++) if (curve[i].phase !== curve[i - 1].phase) trans.push({ t: num(curve[i].t), from: curve[i - 1].phase, to: curve[i].phase });
  md += `- 采样 ${curve.length} 行；相位切换 ${trans.length} 次\n`;
  const show = trans.length > 40 ? trans.slice(0, 20).concat([{ t: null }], trans.slice(-20)) : trans;
  md += show.map(x => x.t === null ? '  …' : `  - ${hhmm(x.t)} ${x.from}→${x.to}`).join('\n') + '\n';
} else md += `无 curve 数据 ⚠️\n`;

// —— moments 对账 & STUCK/RESOLVE
md += `\n## 6. 时刻账（moments.csv）\n\n`;
if (moments.length) {
  const byVerb = {}, bySpecial = {};
  for (const m of moments) {
    byVerb[m.verb] = (byVerb[m.verb] ?? 0) + 1;
    if (m.special) bySpecial[m.special] = (bySpecial[m.special] ?? 0) + 1;
  }
  md += `- 动词分布：${Object.entries(byVerb).map(([k, v]) => `${k}×${v}`).join('  ')}\n`;
  md += `- 标点/特判：${Object.entries(bySpecial).map(([k, v]) => `${k}×${v}`).join('  ') || '无'}\n`;
  const stuck = moments.filter(m => m.special === 'STUCK_LOOP');
  const resolve = moments.filter(m => m.special === 'RESOLVE');
  md += `- 卡碟 STUCK_LOOP：${stuck.length} 次（k=${stuck.map(m => m.k).join(',') || '—'}）；RESOLVE：${resolve.length} 次（计划：风暴簇 4，其中 3 修复 1 烂尾）\n`;
  const fails = moments.filter(m => m.outcome === 'FAIL').length;
  md += `- 事件量：${moments.length} 行（FAIL ${fails}）\n`;
} else md += `无 moments 数据 ⚠️\n`;
if (plan) md += `- 发生器计划种类账：\`${JSON.stringify(plan.kinds)}\`\n`;

// —— live 自述（serve.log 里的 [live] stderr）
md += `\n## 7. live 自述（追赶与停机摘要）\n\n\`\`\`\n`;
md += serveLog.split('\n').filter(l => l.includes('[live]')).slice(0, 30).join('\n');
md += `\n\`\`\`\n`;

// —— 浏览器台账
md += `\n## 8. 浏览器台账\n\n`;
const pageErrs = brLog.split('\n').filter(l => l.includes('PAGEERROR'));
const offhost = brLog.split('\n').filter(l => l.includes('OFFHOST-REQUEST'));
const lastBr = br[br.length - 1];
md += `- SSE 收包：state ${lastBr?.stateN ?? '?'} ｜ moment ${lastBr?.momentN ?? '?'}\n- PAGEERROR：${pageErrs.length} 条${pageErrs.length ? '（样本：' + pageErrs[0].slice(0, 160) + '）' : ''}\n- 出站请求（非 localhost:8932）：${offhost.length} 条${offhost.length ? ' **⚠️ 零网络主张破** ' + offhost[0] : '（零网络成立 ✅）'}\n- 截屏：shot-h*.png（逐小时）＋ shot-final.png\n`;

md += `\n## 9. 诚实申报\n\n- 浏览器为 headless Chromium（真引擎、无声卡）：SSE/渲染循环/内存台账有效；音频通路与屏上光学不在本测范围。\n- 本报告由 soak_report.mjs 机器汇算生成，禁手工誊写数字。\n`;

fs.writeFileSync(path.join(WT, 'audit/night2/SOAK2_REPORT.md'), md);
console.log(`SOAK2_REPORT.md written (${md.length} bytes)`);
