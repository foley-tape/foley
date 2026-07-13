// FT 注册律金测试（阶段〇·增补包 v2 修正一）：入架注册即编号——永久不可变·数带不数卡·
// 厂带不占序·回填按 mtime 升序（「你的第 N 盘」时序）·母带不在场 v3 照愈（带侧真相不赖母带）。
// 沙箱纪律同 cards.test.ts：FOLEY_HOME/FOLEY_PROJECTS 指 tmp，不碰真 ~/.foley 与 ~/.claude。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const port = 4300 + Math.floor(Math.random() * 300);

describe('FT 注册与 rack.json v3（沙箱 serve）', () => {
  const home = mkdtempSync(join(tmpdir(), 'foley-ft-'));
  const emptyProjects = mkdtempSync(join(tmpdir(), 'foley-proj-'));
  let proc: ChildProcess | null = null;
  const base = `http://127.0.0.1:${port}`;

  // 假卡制备：audit 校验带当卡体（小而全）；mtime 定时序——sid-old 老于 sid-new
  const mkCard = (sid: string, ageSec: number) => {
    const dir = join(home, 'cards', sid);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'curve.csv'), readFileSync(join(repoRoot, 'stage', 'fixtures', 'audit.curve.csv')));
    writeFileSync(join(dir, 'moments.csv'), readFileSync(join(repoRoot, 'stage', 'fixtures', 'audit.moments.csv')));
    const t = new Date(Date.now() - ageSec * 1000);
    utimesSync(join(dir, 'curve.csv'), t, t);
  };

  const startServe = () => new Promise<void>((resolve, reject) => {
    proc = spawn('node', [join(repoRoot, 'stage', 'serve.mjs'), String(port)],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FOLEY_HOME: home, FOLEY_PROJECTS: emptyProjects } });
    const to = setTimeout(() => reject(new Error('serve 启动超时')), 8000);
    proc.stdout!.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
    proc.on('exit', (c) => { clearTimeout(to); reject(new Error(`serve 提前退出 ${c}`)); });
  });
  const stopServe = () => { proc?.kill('SIGKILL'); proc = null; };
  const getRack = async () => (await (await fetch(base + '/rack')).json()).rack as any[];

  before(async () => {
    mkCard('sid-old-aaaaaaaa', 3600);   // 一小时前
    mkCard('sid-new-bbbbbbbb', 60);     // 一分钟前
    await startServe();
  });
  after(() => {
    stopServe();
    rmSync(home, { recursive: true, force: true });
    rmSync(emptyProjects, { recursive: true, force: true });
  });

  test('69 入架即编号·时序回填：老带 FT-1 新带 FT-2；注册表落盘', async () => {
    const rack = await getRack();
    const oldC = rack.find((x) => x.id === 'card:sid-old-aaaaaaaa');
    const newC = rack.find((x) => x.id === 'card:sid-new-bbbbbbbb');
    assert.ok(oldC && newC, '两卡都须上架');
    assert.equal(oldC.ft, 1, '最老的带＝FT-0001（你的第 N 盘时序）');
    assert.equal(newC.ft, 2);
    const reg = JSON.parse(readFileSync(join(home, 'ft-registry.json'), 'utf8'));
    assert.equal(reg.tapes['sid-old-aaaaaaaa'], 1);
    assert.equal(reg.tapes['sid-new-bbbbbbbb'], 2);
    assert.equal(reg.next, 3);
  });

  test('70 rack.json v3 母带缺席照愈：ft/c/草章齐备·draft=true', async () => {
    await getRack();   // 触发愈合
    const rj = JSON.parse(readFileSync(join(home, 'cards', 'sid-old-aaaaaaaa', 'rack.json'), 'utf8'));
    assert.equal(rj.v, 3);
    assert.equal(rj.ft, 1);
    assert.equal(rj.c, 'C30');                    // audit 体 2.8min → C30
    assert.ok(rj.seal && rj.seal.id, '草章在场');
    assert.equal(rj.seal.draft, true, '定标期＝铅灰草章（修正二）');
    assert.ok(rj.seal.reason.length > 0, '判章理由随章入册（阶段一悬停粮）');
  });

  test('71 编号永久不可变：重启 serve＋mtime 扰动＋新带入房——旧号不动新号续排', async () => {
    stopServe();
    // 数带不数卡：扰动老卡 mtime（后卡替前卡场景）——号不得变
    const t = new Date();
    utimesSync(join(home, 'cards', 'sid-old-aaaaaaaa', 'curve.csv'), t, t);
    mkCard('sid-3rd-cccccccc', 5);
    await startServe();
    const rack = await getRack();
    assert.equal(rack.find((x) => x.id === 'card:sid-old-aaaaaaaa').ft, 1, 'mtime 扰动不换号');
    assert.equal(rack.find((x) => x.id === 'card:sid-new-bbbbbbbb').ft, 2, '重启不换号');
    assert.equal(rack.find((x) => x.id === 'card:sid-3rd-cccccccc').ft, 3, '新带续排');
  });

  test('72 厂带不占序：注册表只有真卡，DEMO_TAPES 一概不入', async () => {
    const reg = JSON.parse(readFileSync(join(home, 'ft-registry.json'), 'utf8'));
    const keys = Object.keys(reg.tapes).sort();
    assert.deepEqual(keys, ['sid-3rd-cccccccc', 'sid-new-bbbbbbbb', 'sid-old-aaaaaaaa']);
    const rack = await getRack();
    for (const it of rack.filter((x) => x.kind === 'demo')) {
      assert.equal(it.ft, undefined, `厂带 ${it.id} 不得携 FT`);
    }
  });
});
