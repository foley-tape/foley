// cli doctor —— P0-4 ③（LEDGER）：一条命令答"它到底接了啥"（兼 E5 状态可诊最小版）。
// 打印：母带房项目列表/各自会话数 · live 将尾随谁 · 卡房 · 唱片/床音在位 · 音频输出 · serve 状态。
// 纪律：只读体检——零写盘、零外网（唯 127.0.0.1 探针）；查不到就直说，不装健康。
//
//   node cli/index.ts doctor [端口]     （端口缺省 4173；serve 起在别处就带上）

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const rel = (ms: number): string => {
  const s = (Date.now() - ms) / 1000;
  if (s < 90) return '刚才';
  if (s < 3600) return `${Math.max(2, Math.round(s / 60))} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  if (s < 172800) return '昨天';
  return `${Math.round(s / 86400)} 天前`;
};
const repoName = (enc: string): string => enc.split('-').filter(Boolean).pop() || enc; // -Users-x-tape0 → tape0

export async function runDoctor(argv: string[]): Promise<void> {
  const port = Number(argv.find((a) => /^\d+$/.test(a)) ?? process.env.PORT ?? 4173);
  const out: string[] = [];
  const line = (s = ''): void => { out.push(s); };

  line('FOLEY DOCTOR —— 它到底接了啥（只读体检）');
  line('');

  // ── 母带房：发现的项目 × 各自会话数 ──
  const projectsDir = process.env.FOLEY_PROJECTS || join(homedir(), '.claude', 'projects');
  type Proj = { name: string; count: number; newest: number };
  const projs: Proj[] = [];
  let newestPath: string | null = null, newestM = -1, newestRepo = '';
  try {
    for (const e of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      let count = 0, newest = -1;
      try {
        for (const f of readdirSync(join(projectsDir, e.name))) {
          if (!f.endsWith('.jsonl')) continue;
          count++;
          try {
            const m = statSync(join(projectsDir, e.name, f)).mtimeMs;
            if (m > newest) newest = m;
            if (m > newestM) { newestM = m; newestPath = join(projectsDir, e.name, f); newestRepo = repoName(e.name); }
          } catch { /* 消失的文件 */ }
        }
      } catch { /* 读不动的项目目录 */ }
      if (count > 0) projs.push({ name: repoName(e.name), count, newest });
    }
  } catch { /* 无母带房 */ }
  projs.sort((a, b) => b.newest - a.newest);
  if (projs.length === 0) {
    line(`【项目】${projectsDir} 下没找到任何会话——机器无带可接（先用 Claude Code 干点活）`);
  } else {
    const total = projs.reduce((s, p) => s + p.count, 0);
    line(`【项目】母带房 ${projectsDir}：${projs.length} 个项目 · 共 ${total} 盘会话`);
    for (const p of projs.slice(0, 8)) {
      line(`    ${p.name.padEnd(24)} ${String(p.count).padStart(4)} 盘   最近 ${rel(p.newest)}`);
    }
    if (projs.length > 8) line(`    …另 ${projs.length - 8} 个项目（按最近活动排序，已省略）`);
  }
  line('');

  // ── live 将尾随谁（与 cli live --latest 同一把尺：全房最新 .jsonl）──
  if (newestPath) {
    const growing = Date.now() - newestM < 120_000;
    line(`【live】起播即尾随：${newestRepo} 的最新会话（${rel(newestM)}有动静${growing ? '·像是正在生长' : ''}）`);
    line(`    ${newestPath}`);
  } else {
    line('【live】无带可尾随（母带房是空的）');
  }
  line('');

  // ── 卡房：收工吐卡 ──
  const cardsDir = join(homedir(), '.foley', 'cards');
  let cards = 0, labeled = 0;
  try {
    for (const e of readdirSync(cardsDir, { withFileTypes: true })) {
      if (!e.isDirectory() || !existsSync(join(cardsDir, e.name, 'curve.csv'))) continue;
      cards++;
      if (existsSync(join(cardsDir, e.name, 'rack.json'))) labeled++;
    }
  } catch { /* 无卡房 */ }
  line(cards > 0
    ? `【卡房】~/.foley/cards：${cards} 张会话卡（货架标签齐 ${labeled}/${cards}——缺的开架时自愈）`
    : '【卡房】还没有会话卡（接线后每次收工自动吐卡：node cli/index.ts connect）');
  line('');

  // ── 唱片/床音在位（与 records status 同一把尺：vendored 优先 → factory 缓存）──
  try {
    const m = JSON.parse(readFileSync(new URL('../sound/records/records.manifest.json', import.meta.url), 'utf8'));
    const recVendor = new URL('../sound/records/', import.meta.url).pathname;
    const assetVendor = new URL('../sound/assets/', import.meta.url).pathname;
    const spot = (file: string, vendor: string, factory: string): boolean =>
      existsSync(join(vendor, file)) || existsSync(join(homedir(), '.foley', factory, file));
    const recs = (m.records || []) as { file: string }[];
    const assets = (m.assets || []) as { file: string }[];
    const recOk = recs.filter((r) => spot(r.file, recVendor, 'records/factory'));
    const asOk = assets.filter((a) => spot(a.file, assetVendor, 'assets/factory'));
    const missing = [...recs.filter((r) => !recOk.includes(r)), ...assets.filter((a) => !asOk.includes(a))].map((x) => x.file);
    line(`【唱片】在位 ${recOk.length}/${recs.length} · 床音 ${asOk.length}/${assets.length}` +
      (missing.length ? `——缺 ${missing.join('、')}（取回：node cli/index.ts records fetch；缺席时房间层/合成织体顶上，不算哑）` : '——声音供应链齐'));
  } catch {
    line('【唱片】清单读不到（sound/records/records.manifest.json）——缺席时房间层顶上');
  }
  line('');

  // ── 音频输出（macOS）──
  if (process.platform === 'darwin') {
    try {
      const v = execFileSync('osascript', ['-e', 'get volume settings'], { timeout: 3000 }).toString();
      const vol = v.match(/output volume:(\d+)/)?.[1];
      const muted = /output muted:true/.test(v);
      const flag = muted ? '——已静音！机器再响你也听不见' : Number(vol) < 15 ? '——音量很低，机器再响也只剩耳语' : '';
      line(`【音频】系统输出音量 ${vol ?? '?'}%${flag}（声音在浏览器里放；首次要点一下页面——浏览器手势法）`);
    } catch { line('【音频】读不到系统音量（不碍事；声音在浏览器里放）'); }
  } else {
    line('【音频】声音在浏览器里放；首次要点一下页面（浏览器手势法）');
  }
  line('');

  // ── serve 状态 ──
  try {
    const r = await fetch(`http://127.0.0.1:${port}/rack`, { signal: AbortSignal.timeout(800) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { rack?: { kind: string }[]; transport?: { phase: string; loaded: string | null; live: boolean } };
    const n = j.rack?.length ?? 0;
    const t = j.transport;
    const state = !t || t.phase === 'EMPTY' ? '空机待带' : t.live ? '正在放 LIVE' : `正在放 ${t.loaded}（${t.phase}）`;
    line(`【serve】http://127.0.0.1:${port} 在跑：架上 ${n} 盘 · ${state}`);
  } catch {
    line(`【serve】127.0.0.1:${port} 没起（起播：foley；起在别的端口就 foley doctor <端口>）`);
  }

  console.log(out.join('\n'));
}
