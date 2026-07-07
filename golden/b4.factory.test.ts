// B4 factory 缓存回退回归（M2.6 丙·乙-②——RECON 新雷：打包态出厂唱片/床音永 404）。
// 病理：npm 包 files 白名单排除 sound/records/*.mp3 与 sound/assets/*.wav（真身走 Releases）；
//   用户 `foley records fetch` 明示同意后落 ~/.foley/{records,assets}/factory/，
//   但 serve 静态根只见 repo → 打包态页面声桥一律 404（dev 被 vendored mp3 掩蔽故此前漏网）。
// 修：serve 于 /records/**、/sound/assets/** repo 缺件时回退 factory 缓存；三闸叠既有 Host/DoS——
//   只读（readFile）＋落盘目录 fence 前缀校验＋文件名**白名单**（catalog/manifest 之 file 字段确切扁平名）。
// 测试环境：本机工作树天然复现打包态（mp3 gitignored 不入树）；HOME 重定向造 hermetic factory
//   （os.homedir() 认 $HOME，与 records-fetch.ts/records-node.ts/assets-node.ts 落盘位同源）。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

describe('B4 · factory 缓存回退（打包态出厂音频粮道）', () => {
  let proc: ChildProcess | undefined;
  let base = '';
  let home = '';
  const port = 45100 + Math.floor(Math.random() * 800);

  before(async () => {
    home = mkdtempSync(join(tmpdir(), 'b4-home-'));
    const recF = join(home, '.foley', 'records', 'factory');
    const astF = join(home, '.foley', 'assets', 'factory');
    mkdirSync(recF, { recursive: true });
    mkdirSync(astF, { recursive: true });
    // 白名单内（catalog 在册）＋白名单外（投毒件）＋一处 HOME 秘密（穿越靶，绝不得泄漏）
    writeFileSync(join(recF, 'saturation.mp3'), Buffer.from('REC-FACTORY-SATURATION'));
    writeFileSync(join(recF, 'evil.mp3'), Buffer.from('POISON-NOT-IN-CATALOG'));
    writeFileSync(join(astF, 'l1-roomtone.wav'), Buffer.from('AST-FACTORY-ROOMTONE'));
    writeFileSync(join(home, 'SECRET.txt'), Buffer.from('HOME-SECRET-MUST-NOT-LEAK'));
    base = `http://127.0.0.1:${port}`;
    // --replay-only：纯静态态（不 spawn cli live），自举 302 亦不武装——只验声资产粮道
    proc = spawn('node', [join(repoRoot, 'stage', 'serve.mjs'), String(port), '--replay-only'],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: home } });
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('serve 启动超时')), 8000);
      proc!.stdout!.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
      proc!.on('exit', (c) => { clearTimeout(to); reject(new Error(`serve 提前退出 ${c}`)); });
    });
  });

  after(() => { proc?.kill('SIGKILL'); try { rmSync(home, { recursive: true, force: true }); } catch { /* 已清 */ } });

  test('前提：工作树无 vendored records mp3（打包态天然复现，测试自证有效）', () => {
    assert.equal(existsSync(join(repoRoot, 'sound', 'records', 'saturation.mp3')), false,
      'mp3 若在树内则 repo 命中、回退路径不会被本测真正触达——测试失去意义（须在干净检出/CI 跑）');
  });

  test('① 白名单唱片 repo 缺 → factory 供出（200＋factory 真字节＋audio MIME）', async () => {
    const r = await fetch(base + '/records/saturation.mp3');
    assert.equal(r.status, 200, 'B4：打包态出厂唱片必须由 factory 缓存顶上，不得 404');
    assert.equal(await r.text(), 'REC-FACTORY-SATURATION', '须供出 factory 缓存的真字节');
    assert.equal(r.headers.get('content-type'), 'audio/mpeg', 'mp3 → audio/mpeg');
  });

  test('② 白名单外投毒件拒；白名单内但未取回（factory 亦缺）诚实 404', async () => {
    assert.equal((await fetch(base + '/records/evil.mp3')).status, 404,
      'catalog 未在册的文件名即使落在 factory 也一律不供——挡投毒/任意读');
    assert.equal((await fetch(base + '/records/still-life.mp3')).status, 404,
      '白名单内但 repo/factory 皆缺 → 诚实 404（页面退房间层，不崩）');
  });

  test('③ 穿越/逃逸即便 HOME 有秘密也拒（normalize＋fence＋白名单三闸叠加）', async () => {
    for (const p of [
      '/records/../../SECRET.txt',
      '/records/..%2f..%2fSECRET.txt',
      '/records/%2e%2e%2f%2e%2e%2fSECRET.txt',
      '/sound/assets/../../SECRET.txt',
      '/records/',                              // 空 base
      '/records/saturation.mp3/../evil.mp3',    // 折叠后 base=evil.mp3（白名单外）
    ]) {
      const r = await fetch(base + p);
      assert.ok(r.status === 403 || r.status === 404, `${p} 必须被闸（403/404），实得 ${r.status}`);
      assert.ok(!(await r.text()).includes('HOME-SECRET'), `${p} 绝不得泄漏 HOME 秘密`);
    }
  });

  test('④ 元数据仍从 repo 供出（catalog/manifest 入包，回退不误伤）', async () => {
    for (const p of ['/sound/records/catalog.json', '/sound/assets/manifest.json', '/sound-params.json']) {
      assert.equal((await fetch(base + p)).status, 200, `${p} 元数据应仍 200`);
    }
  });

  test('⑤ 床音同构回退·源码卫兵：assets factory 回退位/前缀/白名单不许摘', () => {
    // 工作树 wav 在树内（tracked，非 gitignore）→ repo 命中，assets happy-path 由打包 E2E（audit/repro）另证；
    // 此处守源码：serve 必挂 assets factory 回退分支＋前缀＋白名单，防回潮。
    const serve = readFileSync(join(repoRoot, 'stage', 'serve.mjs'), 'utf8');
    assert.match(serve, /ASSETS_FACTORY/, 'serve 必挂 assets factory 回退位（B4 复发即此处）');
    assert.match(serve, /\/sound\/assets\//, 'assets 回退须锚 /sound/assets/ 前缀');
    assert.match(serve, /AUDIO_WL\.ast/, 'assets 回退须过白名单（factory 目录用户可写，命门在册）');
  });

  test('⑥ 回退不误伤 repo 命中：工作树内的 vendored 床音 wav 仍 200', async () => {
    // 回归：我的改动只在 catch（repo 缺件）里加回退——repo 命中路径不得被触碰。
    if (existsSync(join(repoRoot, 'sound', 'assets', 'l1-roomtone.wav'))) {
      const r = await fetch(base + '/sound/assets/l1-roomtone.wav');
      assert.equal(r.status, 200, 'repo 内床音仍应直供（回退分支不劫持命中路径）');
    }
  });
});
