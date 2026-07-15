// 计数轮律金测（席三工单二·回归族·夜审 D-8②/复盘甲.7 补账）：counter 落卡（临界阻尼+wrap 就近）
// 零金测·回归风险真实——此测钉死棘爪律（提纯律 counter-law.js 为单源，counter.js 委托之）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wrapDelta, dampStep, counterFrameOf, digitsOf, countFromTheta,
  COUNTER_FRAMES, COUNTER_TAU_MS, COUNTER_SNAP_EPS,
} from '../stage/js/counter-law.js';

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}±${eps}`);

test('环上就近 wrapDelta：短弧方向（9→0 走 +1 进位·非 −9）·映入 [−5,5)', () => {
  close(wrapDelta(9, 0), 1);      // 进位：9→0 前进一格
  close(wrapDelta(0, 9), -1);     // 退位：0→9 后退一格
  close(wrapDelta(3, 7), 4);
  close(wrapDelta(7, 3), -4);
  close(wrapDelta(4, 4), 0);      // 同位无差
  close(wrapDelta(2, 7), -5);     // 半程(=5)：律定向后（−5）不 +5——落在 [−5,5)
  for (let from = 0; from < 10; from += 0.37)
    for (let to = 0; to < 10; to += 1) {
      const d = wrapDelta(from, to);
      assert.ok(d >= -5 && d < 5, `wrapDelta(${from},${to})=${d} 越界 [−5,5)`);
    }
});

test('临界阻尼 dampStep：单调逼近·无过冲（停必落卡不弹跳）', () => {
  let pos = 0; const target = 3, dt = 16;         // 目标 +3（无歧义前进）
  let prev = -Infinity;
  for (let i = 0; i < 200; i++) {
    const next = dampStep(pos, target, dt);
    assert.ok(next <= target + 1e-9, `过冲：pos=${next} > target=${target}`);   // 永不越目标
    assert.ok(next >= pos - 1e-9, `非单调：${next} < ${pos}`);                   // 单调不回弹
    pos = next; prev = next;
  }
  close(pos, target, 1e-6);                         // 终落卡在整字位
});

test('落卡棘爪：贴住(<EPS)即咬死整字位（返回精确整数）', () => {
  assert.equal(dampStep(6.999, 7, 16), 7);         // |Δ|<0.004 → 咬死 7
  assert.equal(dampStep(3.0005, 3, 16), 3);
  assert.notEqual(dampStep(6.5, 7, 16), 7);        // 尚远 → 仍在逼近途中，不提前咬
});

test('wrap 落卡方向：9→0 走前进（穿 10 环回 0），非倒退到 8', () => {
  const step = dampStep(9, 0, 16);
  assert.ok(step > 9 && step < 10, `9→0 应前进穿环，实得 ${step}`);   // 9.x 朝 10（=0）
});

test('dt 钳 100：丢帧不暴冲（超 100ms 与 100ms 同步长）', () => {
  close(dampStep(0, 4, 100), dampStep(0, 4, 5000), 1e-12);
});

test('条帧 counterFrameOf：pos→帧（4 帧/字·整周钳环）', () => {
  assert.equal(counterFrameOf(0), 0);
  assert.equal(counterFrameOf(5), 20);
  assert.equal(counterFrameOf(9.999), 0);          // round(39.996)=40 %40 → 0（环回）
  assert.ok(counterFrameOf(3.3) >= 0 && counterFrameOf(3.3) < COUNTER_FRAMES);
});

test('数字拆分 digitsOf：千百十个·个位在右', () => {
  assert.deepEqual(digitsOf(1234), [1, 2, 3, 4]);
  assert.deepEqual(digitsOf(7), [0, 0, 0, 7]);
  assert.deepEqual(digitsOf(9999), [9, 9, 9, 9]);
  assert.deepEqual(digitsOf(50.9), [0, 0, 5, 0]);  // 先 floor
});

test('一只钟 countFromTheta：|θ·K|%10000·绝对值单调', () => {
  close(countFromTheta(0), 0);
  close(countFromTheta(100), 55);                  // 100×0.55
  close(countFromTheta(-100), 55);                 // 绝对值：反转同计
  const big = countFromTheta(1e9);                 // 四位环回：恒落 [0,10000)
  assert.ok(big >= 0 && big < 10000, `环回越界 ${big}`);
});

test('常量护栏：整周/τ/贴住阈与设计三§三同源', () => {
  assert.equal(COUNTER_FRAMES, 40);
  assert.equal(COUNTER_TAU_MS, 60);
  assert.equal(COUNTER_SNAP_EPS, 0.004);
});
