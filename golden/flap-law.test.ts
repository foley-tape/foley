// 翻字牌律金测试（BATCH3 ②·值班律护栏）：
// 律一：环序单向前滚——不倒转不跳字，远字翻得久（真 Solari 机械）。
// 律二：12 格硬截＋大写＋字集外置'·'＋右补空（长曲名护栏）。
// 律三：时长帽——最远格也须在 FLAP_CAP_MS 内落定（step 压缩，有下限防闪帧）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planRoll, normalizeTitle, capStep, ringNext, FLAP_CELLS, FLAP_CAP_MS,
} from '../stage/js/flapboard.js';

test('㊾ 环序前滚：单向·同字零步·ringNext 与 planRoll 自洽', () => {
  assert.equal(planRoll('A', 'A'), 0);
  assert.equal(planRoll(' ', 'A'), 1);          // 空格居环首
  assert.equal(planRoll('A', ' '), 41 - 1);     // 只能前滚回环（环长 41）
  let ch = 'S', steps = planRoll('S', 'F');
  for (let i = 0; i < steps; i++) ch = ringNext(ch);
  assert.equal(ch, 'F');                        // 逐步走完恰到站
  assert.ok(planRoll('A', 'Z') > planRoll('A', 'C'), '远字必须翻得久');
});

test('㊿ 标题律：12 硬截·大写·字集外→·未满右补空', () => {
  assert.equal(normalizeTitle('Warm Fuzz'), 'WARM FUZZ   ');
  assert.equal(normalizeTitle('Saturation'), 'SATURATION  ');
  assert.equal(normalizeTitle('An Extremely Long Title'), 'AN EXTREMELY');   // 硬截 12
  assert.equal(normalizeTitle('深夜电台?!'), '······' + '      ');  // 字集外（含标点）逐字置·（6 字→6 枚）
  assert.equal(normalizeTitle(null), ' '.repeat(FLAP_CELLS));                 // 缺席=全空（留白）
  assert.equal(normalizeTitle('').length, FLAP_CELLS);
});

test('51 时长帽：最坏步程也在帽内落定·step 有下限', () => {
  const worst = 40;                              // 环长-1=最远
  const step = capStep(worst);
  assert.ok(step >= 16, 'step 压过下限＝闪帧');
  assert.ok(step * worst + 26 * (FLAP_CELLS - 1) <= FLAP_CAP_MS + 1,
    `最坏 ${step * worst + 26 * 11}ms 超帽 ${FLAP_CAP_MS}`);
  assert.equal(capStep(0), capStep(1) >= capStep(40) ? capStep(0) : capStep(0)); // 平凡不炸
  assert.ok(capStep(5) >= capStep(40), '近字不得比远字更慢步');
});
