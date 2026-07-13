// VU 律金测试（⑤复审）：表脸即真值表 ＋ 二阶弹簧阻尼表头。
// 律一：查表锚死画上五枚数字（vu_texture.py 的 20/10/5/0/+3）——0VU(−20dBFS) 必须
//       分毫不差落在画上红区界（行程 0.64 ＝ texture 角 +13.16°）。
// 律二：段内插值＝幅度线性（表头吃整流电流·偏转∝幅度），绝非 dB→角度整段线性。
// 律三：弹道＝欠阻尼二阶（过冲＋单次回弹＋滞重回落），非一阶平滑；帧率无关；钉界不越。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  vuTravel, travelToDeg, VuMovement, VU_REF_DBFS,
} from '../stage/js/vu-law.js';

const close = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}±${eps}`);

test('㊹ 刻度对脸：五枚画上数字＝查表锚点（0VU 砸在红区界 0.64）', () => {
  close(vuTravel(-40), 0);        // '20' 刻度＝左钉
  close(vuTravel(-30), 0.275);    // '10'（texture −21.15°）
  close(vuTravel(-25), 0.475);    // '5' （texture −2.35°）
  assert.equal(vuTravel(-20), 0.64);  // '0' ＝红区界（texture +13.16°）——分毫不差
  close(vuTravel(-17), 1);        // '+3'＝右钉满偏
  close(travelToDeg(0.64), 13.16);    // 行程→角：正是画上红区起点
  assert.equal(VU_REF_DBFS, -20);     // 0VU≡−20dBFS（唱片响度锚同源·修宪原点）
});

test('㊺ 段内幅度线性（非 dB 线性）＋单调＋钉外钳制', () => {
  // −10..−5VU 段的幅度中点 → 行程恰为两锚中点（dB 线性会给 0.375 以外的值）
  const aMid = (Math.pow(10, -10 / 20) + Math.pow(10, -5 / 20)) / 2;
  close(vuTravel(VU_REF_DBFS + 20 * Math.log10(aMid)), (0.275 + 0.475) / 2);
  let prev = -1;
  for (let db = -70; db <= -10; db += 0.1) {
    const v = vuTravel(db);
    assert.ok(v >= prev, `单调破裂 @${db}`);
    assert.ok(v >= 0 && v <= 1, `出钉 @${db}`);
    prev = v;
  }
  close(vuTravel(-90), 0);   // 深静默＝针息于钉
  close(vuTravel(-5), 1);    // 超满偏＝钉住不越
});

test('㊻ 弹道·阶跃上：过冲 4–12% ＋ 峰前迅猛 ＋ 单次回弹 ＋ 300ms 级落位', () => {
  const m = new VuMovement();
  const F = 1000 / 120;
  let peak = 0, peakT = 0, cross = 0, prev = 0, settled: number | null = null;
  for (let t = 0; t <= 800; t += F) {
    const p = m.step(0.64, F);
    if (p > peak) { peak = p; peakT = t; }
    if ((prev - 0.64) * (p - 0.64) < 0) cross++;
    if (settled === null && t > peakT + 50 && Math.abs(p - 0.64) < 0.0064) settled = t;
    prev = p;
  }
  const os = peak / 0.64 - 1;
  assert.ok(os > 0.04 && os < 0.12, `过冲 ${(os * 100).toFixed(1)}% 出 4–12% 窗（雨刮器或甩针）`);
  assert.ok(peakT < 200, `峰时 ${peakT}ms ≥200ms：不够暴烈`);
  assert.ok(cross <= 2, `回弹 ${cross} 次：金属没被拽住`);
  assert.ok(settled !== null && settled < 400, `落位 ${settled}ms 超 300ms 级`);
});

test('㊼ 弹道·阶跃下：滞重下坠（100ms 余半程）＋ 400ms 级触底 ＋ 永不下冲', () => {
  const m = new VuMovement();
  for (let t = 0; t < 600; t += 8.33) m.step(0.64, 8.33);   // 先落位 0VU
  let minP = 1, at100 = 0, at400 = 1;
  for (let t = 0; t <= 800; t += 8.33) {
    const p = m.step(0, 8.33);
    if (Math.abs(t - 100) < 5) at100 = p;
    if (Math.abs(t - 400) < 5) at400 = p;
    if (p < minP) minP = p;
  }
  assert.ok(at100 > 0.22, `100ms 已掉到 ${at100}：回落乱甩（该拖着重量）`);
  assert.ok(at400 < 0.02, `400ms 还剩 ${at400}：坠得太拖`);
  assert.ok(minP >= 0, '下冲越过左钉');
});

test('㊽ 帧率无关 ＋ 静息休眠位稳定（贴住即咬死·零样式写）', () => {
  const sim = (frameMs: number) => {
    const m = new VuMovement();
    let peak = 0;
    for (let t = 0; t <= 800; t += frameMs) peak = Math.max(peak, m.step(0.64, frameMs));
    return peak;
  };
  assert.ok(Math.abs(sim(1000 / 120) - sim(33.3)) < 0.01, '120fps 与 30fps 弹道漂移 >1%');
  const m = new VuMovement();
  for (let t = 0; t < 1500; t += 33) m.step(0.64, 33);
  assert.equal(m.pos, 0.64); assert.equal(m.vel, 0); assert.equal(m.drive, 0.64);
});
