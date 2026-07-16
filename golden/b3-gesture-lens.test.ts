// 批次三（工单5 一击三事仲裁＋工单6 镜头回程）源码卫兵——挡回潮。
// 行为真验归 stage/tools/verify/gesture_lens_probe.mjs（真 Chrome·13 案·RED/GREEN 在 audit/seat2-state-d2/B3_探针_*）；
// 本文件只钉法条在位：仲裁四件（吞 click/触摸拍/电源门/旋钮豁免）＋回程两件（Escape 键·tower 单写者）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const stageJs = join(here, '..', 'stage', 'js');
const mainSrc = readFileSync(join(stageJs, 'main.js'), 'utf8');
const towerSrc = readFileSync(join(stageJs, 'tower.js'), 'utf8');

describe('批次三 · 工单5 一击三事仲裁（源码卫兵）', () => {
  test('首手势吞本击 click（捕获层·一次性）——器件语义让位', () => {
    assert.match(mainSrc, /swallowFirstGestureSemantics/, '仲裁函数必须在位');
    assert.match(mainSrc, /addEventListener\('click', swallowClick, \{ capture: true, once: true \}\)/,
      '本击派生的 click 必须在捕获层一次性吞掉（deck/货架/琴键/servo/架沿全走 click）');
    assert.match(mainSrc, /addEventListener\('touchstart', swallowTouch, \{ capture: true, once: true \}\)/,
      '触摸拖的 touchstart 同吞（tower 拍手不劫首触）');
    assert.match(mainSrc, /pointerup[\s\S]{0,40}capture: true, once: true/,
      '吞器必须随 pointerup 拆除——绝不吞到第二击');
  });
  test('电源门与旋钮豁免：已通电不拧不吞；旋钮正门自理', () => {
    assert.match(mainSrc, /if \(S\.power !== 'off'\) return;\s*\/\/ 已由正门通电/,
      '正门（旋钮/素面）通电后的首击不属首手势——不吞');
    assert.match(mainSrc, /closest\?\.\('#selector'\)\) return;/,
      '手势落旋钮让位（电源正门自理·不消费路由）');
    assert.match(mainSrc, /swallowFirstGestureSemantics\(\);/, '首手势路径必须先布吞器再快拧');
  });
});

describe('批次三 · 工单6 镜头回程（源码卫兵）', () => {
  test('Escape=回程到 0（夜审 D-6 病·渲染批已治·钉住不回潮）', () => {
    assert.match(towerSrc, /e\.key === 'Escape'/, 'Escape 键必须在导航键表内');
    assert.match(towerSrc, /go\(e\.key === 'Escape' \? 0 :/, 'Escape 必须直达 0（回程），非步进');
  });
  test('一元素一写者：#tower transform 唯 tower.js 一个写者（双写者打架案勘误）', () => {
    for (const f of readdirSync(stageJs).filter((x) => x.endsWith('.js') && x !== 'tower.js')) {
      const src = readFileSync(join(stageJs, f), 'utf8');
      assert.doesNotMatch(src, /tower\.style\.transform/,
        `${f} 不得写 tower transform——导航唯一写者在 tower.js（lens 只写 #machine）`);
    }
    assert.match(towerSrc, /tower\.style\.transform = `translateY/, 'tower.js 自己的写点必须还在');
  });
});
