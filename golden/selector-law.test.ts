// 选择器律金测（席三工单二·回归族·夜审 D-8②/复盘甲.7 补账）：OFF·TEST·ON 三档全向转移表零金测，
// 关机三档回归风险真实在案——此测把整张表钉死（提纯律 selector-law.js 为单源，selector.js 委托之）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  snapState, frameOf, selectorAction,
  SELECTOR_DEG, SELECTOR_FRAMES, SELECTOR_DWELL_MS, SELECTOR_STATES,
} from '../stage/js/selector-law.js';

test('吸附 snapState：显示角落最近档（含越界钳与等距先手）', () => {
  assert.equal(snapState(SELECTOR_DEG.off), 'off');       // −38
  assert.equal(snapState(SELECTOR_DEG.test), 'test');     // 0
  assert.equal(snapState(SELECTOR_DEG.on), 'on');         // +38
  assert.equal(snapState(-30), 'off');                    // 明显近 OFF
  assert.equal(snapState(-8), 'test');                    // 近 TEST
  assert.equal(snapState(8), 'test');
  assert.equal(snapState(30), 'on');
  assert.equal(snapState(-999), 'off');                   // 越界钳向最近
  assert.equal(snapState(999), 'on');
});

test('条帧 frameOf：OFF=0 → ON=FRAMES−1·中档居中·越界钳', () => {
  assert.equal(frameOf(SELECTOR_DEG.off), 0);
  assert.equal(frameOf(SELECTOR_DEG.on), SELECTOR_FRAMES - 1);
  assert.equal(frameOf(SELECTOR_DEG.test), Math.round((SELECTOR_FRAMES - 1) / 2));  // 中档=中帧
  assert.equal(frameOf(-999), 0);
  assert.equal(frameOf(999), SELECTOR_FRAMES - 1);
});

// 关机三档全向转移表（6 真转移 + 3 同档无变）——夜审点名的回归风险面，逐格钉死。
const TABLE: Array<[string, string, string]> = [
  ['off', 'off', 'none'],
  ['off', 'test', 'testDwell'],   // OFF→TEST：驻留自检（须 ≥DWELL_MS 才 onTest）
  ['off', 'on', 'quick'],         // OFF→ON 一气：压缩版 POST
  ['test', 'off', 'dark'],        // TEST→OFF：熄灯
  ['test', 'test', 'none'],
  ['test', 'on', 'finale'],       // TEST→ON：尾章（电机降生/复走）
  ['on', 'off', 'dark'],          // ON→OFF：熄灯（调用方兜停机）
  ['on', 'test', 'stop'],         // ON→TEST：优雅停机（歇手不闭眼）
  ['on', 'on', 'none'],
];

test('全向转移表：selectorAction(prev,next) 九格逐一钉死', () => {
  for (const [prev, next, action] of TABLE) {
    assert.equal(selectorAction(prev as never, next as never), action, `${prev}→${next} 应为 ${action}`);
  }
});

test('关机三档不对称铁例：ON→TEST=优雅停机(stop) 而 OFF→TEST=驻留(testDwell)——同目标异前态', () => {
  assert.equal(selectorAction('on', 'test'), 'stop');
  assert.equal(selectorAction('off', 'test'), 'testDwell');
  assert.notEqual(selectorAction('on', 'test'), selectorAction('off', 'test'));
});

test('常量护栏：三档序/扫程/驻留阈与设计三§四同源', () => {
  assert.deepEqual([...SELECTOR_STATES], ['off', 'test', 'on']);
  assert.equal(SELECTOR_DEG.off, -38);
  assert.equal(SELECTOR_DEG.on, 38);
  assert.equal(SELECTOR_DWELL_MS, 400);
  assert.equal(SELECTOR_FRAMES, 25);
});
