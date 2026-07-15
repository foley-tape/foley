// 板坐标·几何自洽金测（席三工单二·物理族·§5·建构期 assert）：plate.coords.json 是 Blender 打点导出的
// 板坐标唯一真相（坐标单源）。coords-guard.test.ts 守「册↔CSS 手拷副本不漂」；本测守 coords **自身**的
// 物理自洽——维度为正、器件不逃出画幅、旋钮在座内、**相机契约不漂移一像素**（_law）。板重渲若相机偷动
// 或器件打点出错，此处测红（建构期 assert·纯数据·不碰渲染码）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coords = JSON.parse(readFileSync(new URL('../stage/assets/plate.coords.json', import.meta.url), 'utf8'));
const MARGIN = 0.20;   // 出血容限：器件可微溢画幅（reels/lip/库架故意骑边）但不得逃逸 20%——抓尺度/轴向粗错

// 泛化归类：非 _ 前缀、非 res 的 4-数组＝器件框，2-数组＝锚点（新器件自动纳入·守护即户口）
const boxes: Record<string, number[]> = {};
const points: Record<string, number[]> = {};
for (const [k, v] of Object.entries(coords)) {
  if (k.startsWith('_') || k === 'res') continue;
  if (Array.isArray(v) && v.length === 4 && v.every(n => typeof n === 'number')) boxes[k] = v as number[];
  else if (Array.isArray(v) && v.length === 2 && v.every(n => typeof n === 'number')) points[k] = v as number[];
}
for (const [k, v] of Object.entries(coords._lib_zones_in_b ?? {})) boxes[`lib:${k}`] = v as number[];

test('几何有限＋维度为正：每器件框 [x,y,w,h] 皆有限·w>0·h>0（退化/翻转框＝打点错）', () => {
  for (const [k, b] of Object.entries(boxes)) {
    assert.ok(b.every(Number.isFinite), `${k}: 含非有限值（NaN/Inf＝导出坏）`);
    assert.ok(b[2]! > 0, `${k}: 宽 ${b[2]} 非正`);
    assert.ok(b[3]! > 0, `${k}: 高 ${b[3]} 非正`);
  }
});

test('不逃逸画幅：每框整体落 [−.20, 1.20]（出血合法·逃逸即尺度/轴向粗错）', () => {
  for (const [k, b] of Object.entries(boxes)) {
    const [x, y, w, h] = b as [number, number, number, number];
    assert.ok(x >= -MARGIN && y >= -MARGIN, `${k}: 左上 (${x.toFixed(3)},${y.toFixed(3)}) 逃出容限`);
    assert.ok(x + w <= 1 + MARGIN && y + h <= 1 + MARGIN, `${k}: 右下 (${(x + w).toFixed(3)},${(y + h).toFixed(3)}) 逃出容限`);
  }
});

test('锚点在幅内：vu_pivot/rec_jewel 等点锚落 [−.20, 1.20]', () => {
  for (const [k, p] of Object.entries(points)) {
    assert.ok(p.every(Number.isFinite), `${k}: 点含非有限值`);
    assert.ok(p[0]! >= -MARGIN && p[0]! <= 1 + MARGIN && p[1]! >= -MARGIN && p[1]! <= 1 + MARGIN, `${k}: 点 ${p} 逃出容限`);
  }
});

test('物理包含：selector_knob ⊂ selector（旋钮不得逸出座环）', () => {
  const [kx, ky, kw, kh] = coords.selector_knob as [number, number, number, number];
  const [sx, sy, sw, sh] = coords.selector as [number, number, number, number];
  assert.ok(kx >= sx && ky >= sy && kx + kw <= sx + sw && ky + kh <= sy + sh,
    `旋钮 [${kx},${ky},${kw},${kh}] 未完全落在座环 [${sx},${sy},${sw},${sh}] 内`);
});

// ── 相机契约·不漂移一像素（_law·高板双段签）──
const ca = coords._camera_a, cb = coords._camera_b;
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test('相机契约存签：_law 在位·双段相机契约齐全（不漂移一像素之立法）', () => {
  assert.equal(typeof coords._law, 'string');
  assert.ok(coords._law.length > 0, '_law 非空');
  for (const [n, c] of [['a', ca], ['b', cb]] as const) {
    assert.ok(c && Array.isArray(c.loc) && Array.isArray(c.tgt) && Array.isArray(c.frame) && Array.isArray(c.res),
      `_camera_${n} 契约字段齐全`);
    assert.ok(Number.isFinite(c.lens) && c.lens > 0, `_camera_${n} lens 正`);
  }
});

test('双段同镜同架：lens/loc.xy/tgt.xy 逐位相等·仅 z 平移（同一相机沿板下移·非两次布光）', () => {
  assert.ok(near(ca.lens, cb.lens), `lens 不一致 ${ca.lens} vs ${cb.lens}`);
  assert.ok(near(ca.loc[0], cb.loc[0]) && near(ca.loc[1], cb.loc[1]), '相机 loc 的 x/y 须逐位相等（仅 z 下移）');
  assert.ok(near(ca.tgt[0], cb.tgt[0]) && near(ca.tgt[1], cb.tgt[1]), '相机 tgt 的 x/y 须逐位相等');
  assert.ok(near(ca.loc[2] - ca.tgt[2], cb.loc[2] - cb.tgt[2]), '相机-目标 z 距须相等（同俯角同取景·不改机位姿态）');
  assert.equal(ca.dof, false); assert.equal(cb.dof, false);
});

test('双段无缝拼接：cam_a.frame[1] ≡ cam_b.frame[0]（共享边界·段间不留缝不重叠）', () => {
  assert.ok(near(ca.frame[1], cb.frame[0]),
    `拼接边界不吻合：a 下界 ${ca.frame[1]} ≠ b 上界 ${cb.frame[0]}（板双段会现缝或重影）`);
});

test('分辨率契约：全板 res 为正·横向＝相机横向 ×2（高板 @2x 出图）', () => {
  assert.ok((coords.res as number[]).every(n => Number.isInteger(n) && n > 0), '全板 res 正整数');
  assert.ok(ca.res[0] === cb.res[0], '双段横向分辨率一致');
  assert.equal(coords.res[0], 2 * ca.res[0], '全板横向＝相机横向 ×2（@2x 契约）');
});
