// 策展册金测试（复盘§9·队列1）：册＝内容决策正本（stage/fixtures/curation.json），带＝物理实测。
// 修册律同款：fixtures 重生成后册须随修——册带不符＝此处测红，红即修册（不改带迁就册）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildTape } from '../stage/js/replay.js';

const FIX = new URL('../stage/fixtures/', import.meta.url);
const cur = JSON.parse(readFileSync(new URL('curation.json', FIX), 'utf8'));

function loadReal(name: string) {
  const curve = readFileSync(new URL(`${name}.curve.csv`, FIX), 'utf8');
  let moments = 't\n';
  try { moments = readFileSync(new URL(`${name}.moments.csv`, FIX), 'utf8'); } catch { /* 无时刻带合法 */ }
  return buildTape(name, curve, moments);
}

test('61 策展全员在册：每盘 fixture 一条、每条有带（双向）；demo 取景指向在册带', () => {
  const onDisk = readdirSync(FIX)
    .filter(f => f.endsWith('.curve.csv'))
    .map(f => f.replace(/\.curve\.csv$/, ''))
    .sort();
  const inBook = Object.keys(cur.tapes).sort();
  assert.deepEqual(inBook, onDisk, '册与 fixtures 目录必须一一对应（新带入库必须入册）');
  assert.ok(cur.tapes[cur.demo.tape], `demo 取景带 ${cur.demo.tape} 必须在册`);
});

test('62 册带同钟：durS 对 buildTape 实测 ±2s；window/plot 全在带内且 plot 升序', () => {
  for (const [name, entry] of Object.entries(cur.tapes) as [string, any][]) {
    const real = loadReal(name).duration / 1000;
    assert.ok(Math.abs(real - entry.durS) <= 2,
      `${name}: 册载 ${entry.durS}s 对实测 ${real.toFixed(1)}s 超差——带重生成后须修册`);
    const [w0, w1] = entry.window;
    assert.ok(w0 >= 0 && w0 < w1 && w1 <= entry.durS + 2, `${name}: 可看窗口 [${w0},${w1}] 须在带内`);
    let prev = -1;
    for (const p of entry.plot) {
      assert.ok(p.s >= 0 && p.s <= entry.durS + 2, `${name}: 情节点 ${p.s}s(${p.label}) 出带`);
      assert.ok(p.s >= prev, `${name}: 情节点须升序（${p.s}s 逆行）`);
      assert.ok(typeof p.label === 'string' && p.label.length > 0, `${name}: 情节点 ${p.s}s 无名`);
      prev = p.s;
    }
  }
});

test('63 demo 取景自洽：seekS 落在其带可看窗口内（橱窗不许指到窗外）', () => {
  const entry = cur.tapes[cur.demo.tape];
  const [w0, w1] = entry.window;
  assert.ok(cur.demo.seekS >= w0 && cur.demo.seekS <= w1,
    `demo seekS=${cur.demo.seekS} 须在 ${cur.demo.tape} 可看窗口 [${w0},${w1}] 内`);
});
