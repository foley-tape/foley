// G8 空盘自举回归（M2.6 热修·前置静音雷——船长物理走查实证：`npx .` 尾随歇场会话 →
// 针死零、纸走平、页面死寂）。三根断线的机器证词：
//   ① 最近会话缺席/歇场（>15min）时，裸正门 `/` 必须 302 落厂演示卷 `?tape=storm&speed=8`
//     （URL 明示演示带——素材诚实；`?mode=live` 等带 query 来意一律尊重）；
//   ② serve 必须供声资产（/sound-params.json、/sound/**、/records/**）——此前静态根钉死 stage/，
//     正页声桥被物理断粮（404），`npx foley` 点破天也无声；
//   ③ 正页（main.js）必须挂 SoundBridge（此前只有 demo 页在用）——源码卫兵。
// FOLEY_PROJECTS 指空目录=模拟「空盘/无会话」机器（探针与 live 子进程同吃）。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

describe('G8 · 空盘自举（正门必须活）', () => {
  let proc: ChildProcess | undefined;
  let base = '';
  let emptyDir = '';
  const port = 44100 + Math.floor(Math.random() * 1000);

  before(async () => {
    emptyDir = mkdtempSync(join(tmpdir(), 'g8-empty-'));
    base = `http://127.0.0.1:${port}`;
    // 注意：不带 --replay-only（自举闸只在 live 意图下武装）；空 FOLEY_PROJECTS = 空盘机器。
    // FOLEY_HOME 同指空沙箱：live 态 serve 兼卡片值守（轨乙①），测试不许尾随真 ~/.foley/spool
    proc = spawn('node', [join(repoRoot, 'stage', 'serve.mjs'), String(port)],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FOLEY_PROJECTS: emptyDir, FOLEY_HOME: emptyDir } });
    await new Promise<void>((resolve, reject) => {
      const to = setTimeout(() => reject(new Error('serve 启动超时')), 8000);
      proc!.stdout!.on('data', (d) => { if (String(d).includes('stage @')) { clearTimeout(to); resolve(); } });
      proc!.on('exit', (c) => { clearTimeout(to); reject(new Error(`serve 提前退出 ${c}`)); });
    });
  });

  after(() => { proc?.kill('SIGKILL'); try { rmSync(emptyDir, { recursive: true, force: true }); } catch { /* 已清 */ } });

  test('① 首页默认磁带架（丁-E2 取代 G8 302 演示卷）：裸正门 200 直上卡带架；深链来意尊重', async () => {
    const r = await fetch(base + '/', { redirect: 'manual' });
    assert.equal(r.status, 200, '首页默认磁带架——裸正门直上 index.html，不再 302（空盘死机观感由卡带架化解）');
    const html = await r.text();
    assert.match(html, /id="rack"/, '首页必须是卡带架（架上有带可选，天然非死寂）');
    const live = await fetch(base + '/?mode=live', { redirect: 'manual' });
    assert.equal(live.status, 200, '?mode=live 深链上机可达');
    const tape = await fetch(base + '/?tape=smooth', { redirect: 'manual' });
    assert.equal(tape.status, 200, '?tape= 深链上机可达');
  });

  test('② 声资产挂载：params/织体/唱片目录可达，穿越仍被闸', async () => {
    for (const p of ['/sound-params.json', '/sound/assets/manifest.json', '/sound/records/catalog.json']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 200, `${p} 应 200——声桥的粮道`);
    }
    // 穿越（normalize 折叠后落 stage 根 miss / fence 拒）：绝不放行仓库任意读
    for (const p of ['/records/../../package.json', '/sound/../params.json', '/records/..%2F..%2Fpackage.json']) {
      const r = await fetch(base + p);
      assert.ok(r.status === 403 || r.status === 404, `${p} 应被闸（403/404），实得 ${r.status}`);
    }
  });

  test('③ 源码卫兵：正页挂声桥＋卡带架/声资产在位，防回潮', () => {
    const main = readFileSync(join(repoRoot, 'stage', 'js', 'main.js'), 'utf8');
    assert.match(main, /SoundBridge/, 'main.js 必须接声桥——正页无声即 G8 复发');
    assert.match(main, /pointerdown/, '声桥须由用户手势解锁（浏览器手势律）');
    const serve = readFileSync(join(repoRoot, 'stage', 'serve.mjs'), 'utf8');
    assert.match(serve, /['"]\/rack['"]/, 'serve 卡带架路由不许摘（首页默认磁带架 丁-E2）');
    assert.match(serve, /sound-params\.json/, 'serve 声资产挂载不许摘');
  });
});
