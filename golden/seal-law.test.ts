// 性格章律金测试（阶段〇·011-R2 丁＋增补包 v2 修正三）：
// 全函数律（每带必得且仅得一枚·DAILIES 兜底）／优先序（收尾态＞戏剧＞形状＞规模）／
// 判据边界原文锚／C-吸附阶梯／同源特征管线实带回归（纯函数：同带同章）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTape } from '../stage/js/replay.js';
import { SEALS, SEAL_THRESHOLDS, extractFeatures, judgeSeal, snapC } from '../stage/js/seal-law.js';

// 合成特征（判定器只看特征——修正三：特征管线另测实带）
function mkF(over: Record<string, unknown> = {}) {
  const f: Record<string, unknown> = {
    durS: 1800, tPeak: 0.4, tEndMean: 0.2, tHighDwellS: 0, tSkeleton: new Float64Array(128),
    storm: false, fails: 2, distinctSigs: 2, maxSameSigRepeat: 1, maxSameSigLocal: 1,
    tailUnresolved: false, files: 3,
    stuckEdges: 0, cleared: 0, resolves: 0, asks: 0, done: 1, moments: 10,
    ...over,
  };
  // 合成特征自洽：局域连撞不可能超过全带累计
  if ((f.maxSameSigLocal as number) > (f.maxSameSigRepeat as number)) f.maxSameSigRepeat = f.maxSameSigLocal;
  return f as any;
}

test('64 全函数律：覆盖洞判例（30min/2错/无重复/无风暴/正常收尾）→ DAILIES 兜底；永得且仅得一枚', () => {
  // 011-R2 乙.1 原文场景：曾经无章可盖的普通会话——兜底章保总律
  assert.equal(judgeSeal(mkF()).id, 'DAILIES');
  // 闭集扫射：任意特征组合必得恰一枚在册章
  const ids = new Set(SEALS.map((s) => s.id));
  for (const durS of [60, 601, 3600, 10800, 20000])
    for (const fails of [0, 2, 5])
      for (const rep of [0, 3])
        for (const endT of [0.1, 0.6]) {
          const v = judgeSeal(mkF({ durS, fails, maxSameSigRepeat: rep, tEndMean: endT, tPeak: 0.6 }));
          assert.ok(ids.has(v.id), `${v.id} 必须在闭集`);
          assert.ok(v.reason.length > 0, '判章必附理由');
        }
});

test('65 优先序原文：粗混＞抢救＞一条过＞跳针＞长版＞即兴＞小样＞样片', () => {
  // 序表本身钉死（SEALS 数组序＝优先序）
  assert.deepEqual(SEALS.map((s) => s.id),
    ['ROUGH_MIX', 'SALVAGE', 'ONE_TAKE', 'LOCKED_GROOVE', 'LONG_PLAY', 'JAM', 'DEMO', 'DAILIES']);
  // 收尾态＞戏剧：张力未解压过跳针
  assert.equal(judgeSeal(mkF({ tEndMean: 0.6, maxSameSigLocal: 5 })).id, 'ROUGH_MIX');
  // 戏剧＞形状：抢救压过跳针
  assert.equal(judgeSeal(mkF({ tHighDwellS: 200, tEndMean: 0.1, maxSameSigLocal: 5, tPeak: 0.9 })).id, 'SALVAGE');
  // 稀有先于速写：五分钟零瑕疵是一条过，不是小样
  assert.equal(judgeSeal(mkF({ durS: 300, fails: 0, tPeak: 0.3 })).id, 'ONE_TAKE');
  // 形状＞规模：跳针压过长版
  assert.equal(judgeSeal(mkF({ durS: 12000, maxSameSigLocal: 3, tPeak: 0.6 })).id, 'LOCKED_GROOVE');
  // 长版＞即兴：三小时多文件也先是长版
  assert.equal(judgeSeal(mkF({ durS: 12000, files: 10, tPeak: 0.6 })).id, 'LONG_PLAY');
});

test('66 判据边界原文锚：报错≤1／同签名≥3／≤10min／≥180min／JAM 三条件', () => {
  // ONE TAKE：报错 ≤1（011-R2 原文）——2 错即出局
  assert.equal(judgeSeal(mkF({ fails: 1, tPeak: 0.5 })).id, 'ONE_TAKE');
  assert.notEqual(judgeSeal(mkF({ fails: 2, tPeak: 0.5 })).id, 'ONE_TAKE');
  assert.notEqual(judgeSeal(mkF({ fails: 0, tPeak: 0.56 })).id, 'ONE_TAKE');   // 峰值 T 不低也出局
  // LOCKED GROOVE v2：同签名错误**局域**重复 ≥3（计数阈值 011-R 原文不动·局域=分诊令语义修正）
  assert.equal(judgeSeal(mkF({ maxSameSigLocal: 3, tPeak: 0.6 })).id, 'LOCKED_GROOVE');
  assert.notEqual(judgeSeal(mkF({ maxSameSigLocal: 2, tPeak: 0.6 })).id, 'LOCKED_GROOVE');
  assert.notEqual(judgeSeal(mkF({ fails: 3, distinctSigs: 3, maxSameSigLocal: 1, tPeak: 0.6 })).id, 'LOCKED_GROOVE');
  // v2 分水岭：全带累计高而局域低=长航零星重试，不是锁槽（busy/19h 案）；引擎 STUCK 边沿单独自证
  assert.notEqual(judgeSeal(mkF({ maxSameSigRepeat: 17, maxSameSigLocal: 2, tPeak: 0.6 })).id, 'LOCKED_GROOVE');
  assert.equal(judgeSeal(mkF({ stuckEdges: 1, tPeak: 0.6 })).id, 'LOCKED_GROOVE');
  // 粗混 v2 第二支：近期错误未平单独成章（尾窗 T 低也算烂尾）
  assert.equal(judgeSeal(mkF({ tailUnresolved: true, tEndMean: 0.05, tPeak: 0.6 })).id, 'ROUGH_MIX');
  // DEMO：≤10min（011-R 原文）边界含端点
  assert.equal(judgeSeal(mkF({ durS: 600, tPeak: 0.6 })).id, 'DEMO');
  assert.equal(judgeSeal(mkF({ durS: 601, tPeak: 0.6 })).id, 'DAILIES');
  // LONG PLAY：≥180min（011-R2 原文）边界含端点
  assert.equal(judgeSeal(mkF({ durS: 10800, tPeak: 0.6 })).id, 'LONG_PLAY');
  assert.equal(judgeSeal(mkF({ durS: 10799, files: 0, tPeak: 0.6 })).id, 'DAILIES');
  // JAM：≥60min＋多文件＋未入风暴（011-R 原文）——三缺一皆不中
  assert.equal(judgeSeal(mkF({ durS: 3600, files: 4, tPeak: 0.6 })).id, 'JAM');
  assert.equal(judgeSeal(mkF({ durS: 3599, files: 4, tPeak: 0.6 })).id, 'DAILIES');
  assert.equal(judgeSeal(mkF({ durS: 3600, files: 3, tPeak: 0.6 })).id, 'DAILIES');
  assert.equal(judgeSeal(mkF({ durS: 3600, files: 4, storm: true, tPeak: 0.6 })).id, 'DAILIES');
});

test('67 C-吸附阶梯（011-R2 戊.1）：C30/45/60/90/120·超 120 印真实数·向上取整（壳须装得下）', () => {
  assert.equal(snapC(30), 'C30');           // 半分钟也是一盘 C30
  assert.equal(snapC(29 * 60), 'C30');
  assert.equal(snapC(30 * 60), 'C30');
  assert.equal(snapC(30 * 60 + 1), 'C45');
  assert.equal(snapC(45 * 60), 'C45');
  assert.equal(snapC(46 * 60), 'C60');
  assert.equal(snapC(60 * 60), 'C60');
  assert.equal(snapC(73 * 60), 'C90');      // 011-R2 原文判例：73 分钟录在一盘 C90 上
  assert.equal(snapC(90 * 60), 'C90');
  assert.equal(snapC(91 * 60), 'C120');
  assert.equal(snapC(120 * 60), 'C120');
  assert.equal(snapC(120 * 60 + 30), 'C121');   // 超 120：真实数·向上取整
  assert.equal(snapC(247 * 60), 'C247');        // 011-R 原文：通宵局的荣光
});

test('68 同源特征管线·实带回归：storm=抢救（叙事同款）·silence 问询账·sig 列上桥·同带同章', () => {
  const FIX = new URL('../stage/fixtures/', import.meta.url);
  const load = (n: string) => buildTape(n,
    readFileSync(new URL(`${n}.curve.csv`, FIX), 'utf8'),
    readFileSync(new URL(`${n}.moments.csv`, FIX), 'utf8'));

  const storm = load('storm');
  // sig 列上桥回归（replay.js parseMoments 附加字段）：跳针簇必有非空错误签名
  assert.ok(storm.moments.some((m: any) => !m.special && m.sig), 'moments 须带 sig 列');
  const fs1 = extractFeatures(storm);
  assert.ok(fs1.fails > 0, 'storm 必有报错');
  assert.ok(fs1.tHighDwellS >= 120 && fs1.tHighDwellS <= 250, `高张力驻留实测带内（得 ${fs1.tHighDwellS.toFixed(0)}s）`);
  assert.ok(fs1.tEndMean <= 0.35, '尾窗张力落地（转晴长航收尾）');
  assert.equal(fs1.tSkeleton.length, SEAL_THRESHOLDS.skeletonN);
  const v1 = judgeSeal(fs1);
  assert.equal(v1.id, 'SALVAGE', 'storm＝高张力持续后终局解决——九死一生');
  // 纯函数律：同带两判逐位同章同理由
  assert.deepEqual(judgeSeal(extractFeatures(load('storm'))), v1);

  const fsil = extractFeatures(load('silence'));
  assert.equal(fsil.asks, 4, 'silence 四枚问询事件（ASK_CLEARED 特殊行不计事件账）');
  assert.equal(fsil.fails, 0);
  assert.equal(judgeSeal(fsil).id, 'ONE_TAKE');
});
