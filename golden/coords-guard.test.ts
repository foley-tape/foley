// 坐标单源 diff 守护（整固批·复盘§8 欠账的第一段）：plate.coords.json＝板坐标唯一真相，
// plate.css 的百分比是手拷副本——板若重渲/相机若动，副本必漂。本测把「册↔表」钉死：
// 漂移＝测红。（第二段"coords 生成 CSS 变量一源三用"属阶段四镜头移动硬前置，另立项。）
//
// 豁免对（法定偏离·各有渲染学理由，不入对表）：
//   #reel-l/#reel-r/#guide-l/#guide-r/#band-run —— 条渲染 border 像素对齐 bbox（与 coords
//     器件 bbox 故意不同：条与板同相机同灯，坐标以条的裁切框为准·渲染打印勿手调）；
//   .vu-needle 转心 —— ⑤复审画弧圆心律：针转心锚画上弧心（bottom −2%＝cy 1.02H），
//     与 coords vu_pivot（板上针轴视觉位 97%）故意不同心。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coords = JSON.parse(readFileSync(new URL('../stage/assets/plate.coords.json', import.meta.url), 'utf8'));
const css = readFileSync(new URL('../stage/css/plate.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// 取选择器的合并声明（后写者胜——与浏览器同序），再读几何四值
function geomOf(sel: string) {
  const decl: Record<string, number> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sels = m[1]!.split(',').map((s) => s.trim());
    if (!sels.includes(sel)) continue;
    for (const d of m[2]!.split(';')) {
      const mm = d.match(/^\s*(left|top|width|height)\s*:\s*(-?[\d.]+)%\s*$/);
      if (mm) decl[mm[1]!] = Number(mm[2]);
    }
  }
  return decl;
}
const box = (k: string) => (coords[k] as number[]).map((v) => v * 100);
const union = (a: number[], b: number[]) => {
  const [ax, ay, aw, ah] = a as [number, number, number, number];
  const [bx, by, bw, bh] = b as [number, number, number, number];
  const x0 = Math.min(ax, bx), y0 = Math.min(ay, by);
  const x1 = Math.max(ax + aw, bx + bw), y1 = Math.max(ay + ah, by + bh);
  return [x0, y0, x1 - x0, y1 - y0];
};

// 对表（selector ↔ coords 键或并集）——新器件上板须入此表（守护即户口）
const PAIRS: [string, number[]][] = [
  ['#vu-svg', box('vu')],
  ['#chart-canvas', box('recorder')],
  ['#paper-relight', box('recorder')],
  ['#dub-overlay', box('recorder')],
  ['#magic-eye', box('eye')],
  ['#counter-housing', box('counter')],
  ['#counter-dim', box('counter')],          // 整固批压暗层＝同一扇窗
  ['#amber-tube', box('lamp_ask')],
  ['#emerald', box('lamp_done')],
  ['#pilot', box('lamp_main')],
  ['#now-plate', box('nameplate')],
  ['#deck', box('deck_zone')],
  ['#play-cue', box('play_dome')],
  ['#song-keys', union(box('key_prev'), box('key_next'))],
  ['#dub-group', union(box('dub_tags'), box('dub_key'))],
];

test('73 坐标单源守护：plate.css 手拷几何 对 coords.json ±0.01%（漂移即红·板重渲必同步）', () => {
  for (const [sel, want] of PAIRS) {
    const g = geomOf(sel);
    const got = [g.left, g.top, g.width, g.height];
    for (let i = 0; i < 4; i++) {
      assert.ok(Number.isFinite(got[i]), `${sel}: 缺几何声明（left/top/width/height 须四全）`);
      assert.ok(Math.abs(got[i]! - want[i]!) <= 0.01,
        `${sel}[${['left', 'top', 'width', 'height'][i]}]: css=${got[i]} vs coords=${want[i]!.toFixed(4)}（超差——查板是否重渲未同步）`);
    }
  }
});

test('74 守护对表全员有靠：coords 器件键要么入对表要么在豁免名单（新键不得裸奔）', () => {
  const paired = new Set(['vu', 'recorder', 'eye', 'counter', 'lamp_ask', 'lamp_done', 'lamp_main',
    'nameplate', 'deck_zone', 'play_dome', 'key_prev', 'key_next', 'dub_tags', 'dub_key']);
  const exempt = new Set([
    'res',                                   // 画幅
    '_camera',                               // 相机契约存签（hero_scene assert_plate_camera 对签·非器件）
    'reelL', 'reelR',                        // 条渲染 border 对齐（豁免·文件头有法）
    'guideL', 'guideR', 'band_run',          // 同上（走带条）
    'vu_pivot',                              // 画弧圆心律（⑤复审·故意不同心）
    'rec_jewel',                             // REC 削头案锚点（y<0 出画·候信箱重构图，无 CSS 消费者）
  ]);
  for (const k of Object.keys(coords)) {
    assert.ok(paired.has(k) || exempt.has(k),
      `coords 新键 ${k} 未入守护对表也不在豁免名单——上板器件必须有守护（或注明豁免理由）`);
  }
});
