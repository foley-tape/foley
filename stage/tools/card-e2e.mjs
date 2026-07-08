// 收工吐卡 E2E（轨乙①③④验收器）：沙箱 FOLEY_HOME 里预置一枚收工事件 →
// 起 serve → 真浏览器开 live 页 → 欠账自撕 → card.png 落盘断言 ＋ 接线签/hover 铭牌在场断言。
// 复跑：node stage/tools/card-e2e.mjs [--port 4187]
// 拍摄期依赖：playwright-core（cd stage/tools && npm i playwright-core）＋本机 ms-playwright chromium 缓存。
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const args = process.argv.slice(2);
const port = Number(args[args.indexOf('--port') + 1]) || 4187;
const BASE = `http://127.0.0.1:${port}`;
const OUT = join(repoRoot, 'runs', `card-e2e-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`);
mkdirSync(OUT, { recursive: true });

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.error('拍摄期依赖未装：cd stage/tools && npm i playwright-core'); process.exit(2); }
// 本机 chromium 缓存（RECON 同法：换机自调此路径，或 npx playwright install chromium）
const exeCandidates = [];
try {
  const cacheRoot = join(process.env.HOME ?? '', 'Library', 'Caches', 'ms-playwright');
  for (const d of readdirSync(cacheRoot)) {
    if (!d.startsWith('chromium-') || d.includes('headless')) continue;
    exeCandidates.push(join(cacheRoot, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
  }
} catch { /* 非 mac 或无缓存：下方 launch 走默认解析 */ }
const executablePath = exeCandidates.find(existsSync);

// —— 沙箱：FOLEY_HOME 指 tmp，预置一枚收工事件（素材＝金夹具，含绝对时戳供脱敏对照）——
const home = mkdtempSync(join(tmpdir(), 'foley-e2e-'));
const emptyProjects = mkdtempSync(join(tmpdir(), 'foley-e2e-empty-'));
const sid = 'e2e-sess-0001';
// 素材诚实（RECON 真实材料申明同款）：优先拿本机最新真实会话当收工素材——产品条件；
// 无会话的机器退回金夹具（仅 6s 纸，必走「无戏可剪」skip 销账——链路照样证成，如实降级断言）
let transcript = join(repoRoot, 'golden', 'fixtures', 'unknown-tool.jsonl');
let fixtureFallback = true;
try {
  const root = join(process.env.HOME ?? '', '.claude', 'projects');
  let bestM = -1;
  for (const e of readdirSync(root, { recursive: true })) {
    if (typeof e !== 'string' || !e.endsWith('.jsonl')) continue;
    try {
      const p = join(root, e);
      const st = statSync(p);
      if (st.size > 100_000 && st.mtimeMs > bestM) { bestM = st.mtimeMs; transcript = p; fixtureFallback = false; }
    } catch { /* 消失即略 */ }
  }
} catch { /* 无会话根：夹具兜底 */ }
console.log(`素材：${fixtureFallback ? '金夹具（预期 skip 销账）' : transcript}（真实会话，蒸馏默认脱敏后方进卡房）`);
mkdirSync(join(home, 'spool'), { recursive: true });
writeFileSync(join(home, 'spool', 'events.ndjson'),
  JSON.stringify({ v: 1, kind: 'session-end', sessionId: sid, transcriptPath: transcript, reason: 'other' }) + '\n');

const serve = spawn('node', [join(repoRoot, 'stage', 'serve.mjs'), String(port)],
  { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FOLEY_HOME: home, FOLEY_PROJECTS: emptyProjects } });
serve.stderr.on('data', d => process.stderr.write(`[serve] ${d}`));
await new Promise((resolve, reject) => {
  const to = setTimeout(() => reject(new Error('serve 启动超时')), 8000);
  serve.stdout.on('data', d => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
});

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[PAGEERROR]', e.message));
await page.goto(`${BASE}/?mode=live`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__stage?.dub, null, { timeout: 20000 });

const verdicts = [];
const check = (name, ok, note = '') => { verdicts.push({ name, ok, note }); console.log(`${ok ? '✔' : '✗'} ${name}${note ? `（${note}）` : ''}`); };

// ③ 接线签（沙箱必然未接线）＋不压 DUB 组
const tag = await page.waitForSelector('#wire-tag', { timeout: 8000 }).catch(() => null);
check('接线签在场（live 未接线）', !!tag);
if (tag) {
  const overlap = await page.evaluate(() => {
    const a = document.getElementById('wire-tag').getBoundingClientRect();
    const b = document.getElementById('dub-group').getBoundingClientRect();
    return !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
  });
  check('接线签不压 DUB 操作件', !overlap);
}

// ④ hover 铭牌显影
await page.hover('#dub-key');
await page.waitForTimeout(1100);
const cap = await page.evaluate(() => getComputedStyle(document.querySelector('#dub-key'), '::after').opacity);
check('DUB 键 hover 铭牌显影', Number(cap) > 0.3, `opacity=${cap}`);

// ① 收工卡：欠账自撕 → card.png 落盘（8× 誊录 45s ≈ 6s＋蒸馏/回放前置＋15s 工单轮询兜底）
const cardPng = join(home, 'cards', sid, 'card.png');
const cardSkip = join(home, 'cards', sid, 'card.skip.json');
let landed = false, skipped = false;
for (let i = 0; i < 90; i++) {
  landed = existsSync(cardPng); skipped = existsSync(cardSkip);
  if (landed || skipped) break;
  await page.waitForTimeout(1000);
}
if (fixtureFallback) {
  check('全链证成（夹具 6s 纸→无戏可剪→skip 销账）', landed || skipped, landed ? '竟出了卡' : skipped ? 'skip' : '既无卡也无销账');
} else {
  check('card.png 落盘（全链：spool→蒸馏→回放→台上撕卡→/card/save）', landed, skipped ? '被 skip 销账（素材太静？）' : '');
}
if (landed) {
  const meta = readFileSync(join(home, 'cards', sid, 'card.meta.json'), 'utf8');
  const m = JSON.parse(meta);
  check('meta 形制（kind/segments）', m.kind === 'foley-card/session-end' && Array.isArray(m.segments) && m.segments.length > 0);
  check('meta 无墙钟键（G7 纪律）', !('createdAt' in m) && !('liveEpoch' in m));
  check('meta 泄漏抽查（用户名/仓名/日期/邮箱域）', !/shadow|tape0|2026-|@gmail/.test(meta));
  const tapeLine = readFileSync(join(home, 'cards', sid, 'session.tape.jsonl'), 'utf8');
  check('素材走脱敏蒸馏（src=redacted）', tapeLine.includes('"sourceHash":"redacted"'));
}
await page.waitForTimeout(1500);
await page.screenshot({ path: join(OUT, 'card-rested.png') });
await browser.close();
serve.kill('SIGTERM');
rmSync(home, { recursive: true, force: true });
rmSync(emptyProjects, { recursive: true, force: true });

const fails = verdicts.filter(v => !v.ok);
console.log(`\n${verdicts.length - fails.length}/${verdicts.length} 过 ｜ 静帧 → ${join(OUT, 'card-rested.png')}`);
process.exit(fails.length ? 1 : 0);
