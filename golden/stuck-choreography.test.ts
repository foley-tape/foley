// 卡拍编舞·值班律金测（席三工单二·性能族·§5·夜审渲§丙.2／编舞值班律 LEDGER §二·五）：
// 风暴带的长 STUCK（storm.moments.csv 实测 ~600s 连续卡）驱动 deck.js 的卡拍编舞——船长案「192s 长卡
// 把节拍器演成『机器人坏了』」的回归面。修（编舞 v2·挣扎—歇·deck.js:162）须钉死：真卡住的带轴不是
// 节拍器，宏周期 4.6s 里两记前冲弹回、其余静伏憋着；收带盘半挣扎异相；断电即松（物理释放律 :131）。
//
// 口径：纯 node 借 `proto.thetaAt/onPacket/onMoment`（单源显示转角·M2.5 同源抽取 deck.js:158，
// 台上 render 与胶印合成器同吃这一支）以手搭 this 驱动——构造器吃 DOM，编舞函数是纯数学，借原型避 DOM。
// **只测不改 deck.js**（走带编舞属渲染域·测/改分离）。CPU<5% 真表属真机 P0 触发档（handover §5），不在此。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// deck.js 属渲染域（DOM 耦合·非提纯模块·无 .d.ts）；本测借原型三方法作纯数学驱动，import 类型就地忽略。
// @ts-ignore -- 运行时 .js 无声明文件（不新增 stage/js 类型文件·不越界渲染域）
import { ReelDeck } from '../stage/js/deck.js';

interface ChoreoProto {   // 借用面类型垫片（deck.js 运行时唯一真相·此仅供 .call 借用得类型）
  thetaAt(this: unknown, i: number, now: number): number;
  onPacket(this: unknown, pkt: unknown, isSeek: boolean): void;
  onMoment(this: unknown, m: { special?: string }): void;
}
const proto = ReelDeck.prototype as ChoreoProto;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
// deck.js thetaAt 内部常量（未导出·若 deck.js 改须同步——本测正是让此改动显形的回归闸）
const MACRO = 4600;              // ms，宏周期（deck.js:165）
const STUCK_SWING = 0.30;        // rad，前冲幅度（deck.js:15）
const STEP = 20;                 // ms 采样步

// 借原型：卡死态 this（reels/stuck/stuckTheta 是编舞读的全部字段）
function stuckSelf(base0 = 10, base1 = 20) {
  return { stuck: true, stuckTheta: [base0, base1], reels: [{ theta: base0 }, { theta: base1 }] };
}
const theta = (self: object, i: number, now: number) => proto.thetaAt.call(self, i, now);
const offsetSeries = (self: object, i: number, base: number, span: number) => {
  const out: number[] = [];
  for (let t = 0; t < span; t += STEP) out.push(theta(self, i, t) - base);
  return out;
};
const maxAbs = (a: number[]) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

// ── 风暴带接地：storm 确以长 STUCK 驱动此编舞（值班律之所以要紧）──
test('风暴带接地：storm.moments 含 STUCK_LOOP，且卡跨度 > 宏周期（长卡＝值班律适用场）', () => {
  const rows = readFileSync(join(root, 'stage', 'fixtures', 'storm.moments.csv'), 'utf8').trim().split('\n').slice(1);
  const recs = rows.map(r => r.split(',')).map(c => ({ t: Number(c[0]), special: c[7] }));
  const loops = recs.filter(r => r.special === 'STUCK_LOOP');
  const cleared = recs.filter(r => r.special === 'STUCK_CLEARED');
  assert.ok(loops.length > 0, 'storm 带确有 STUCK_LOOP（编舞被真带驱动）');
  assert.ok(cleared.length > 0, 'storm 带确有 STUCK_CLEARED');
  const span = Math.max(...cleared.map(r => r.t)) - Math.min(...loops.map(r => r.t));
  assert.ok(span > MACRO, `卡跨度 ${(span / 1000).toFixed(0)}s 远超宏周期——值班律必须成立`);
});

// ── 核心：挣扎—歇（refute 节拍器）──
test('静伏为主：一宏周期内静息(offset≈0)占比 ≥ 0.5——不是节拍器（refute 机器人坏了）', () => {
  const self = stuckSelf();
  const s = offsetSeries(self, 0, 10, MACRO);
  const quiet = s.filter(o => Math.abs(o) < 1e-9).length;
  assert.ok(quiet / s.length >= 0.5, `静伏占比 ${(quiet / s.length).toFixed(2)} 应≥0.5（连续挥摆即退化为节拍器）`);
});

test('歇有其时：存在 ≥ 2000ms 连续静伏段（第二半宏周期整段憋着）', () => {
  const self = stuckSelf();
  let run = 0, best = 0;
  for (let t = 0; t < MACRO; t += STEP) {
    if (Math.abs(theta(self, 0, t) - 10) < 1e-9) { run += STEP; best = Math.max(best, run); } else run = 0;
  }
  assert.ok(best >= 2000, `最长连续静伏 ${best}ms 应≥2000（挣扎在前半·后半整段歇）`);
});

test('静息即咬死：静伏期 thetaAt 恰返 stuckTheta（零残余抖·贴住咬死）', () => {
  const self = stuckSelf(3.14, 2.72);
  // now=3680：reel0 f=0.80、reel1 f=0.90——皆落第二半静伏，thetaAt 须恰返锚点
  assert.equal(theta(self, 0, 3680), 3.14);
  assert.equal(theta(self, 1, 3680), 2.72);
});

test('有界不漂移：前冲峰值 ∈ (0, STUCK_SWING]·永不 NaN/失控', () => {
  const self = stuckSelf();
  const s0 = offsetSeries(self, 0, 10, MACRO);
  assert.ok(s0.every(Number.isFinite), '无 NaN');
  const pk = maxAbs(s0);
  assert.ok(pk > 0 && pk <= STUCK_SWING + 1e-6, `峰值 ${pk.toFixed(3)} 应∈(0, ${STUCK_SWING}]`);
});

test('周期性无累积：offset(now) ≡ offset(now+MACRO)——每宏周期复位·挣扎不越滚', () => {
  const self = stuckSelf();
  for (const now of [200, 460, 900, 1500, 2400, 3680]) {   // 覆盖活跃与静伏两相
    assert.ok(Math.abs((theta(self, 0, now) - 10) - (theta(self, 0, now + MACRO) - 10)) < 1e-9,
      `now=${now} 与 +MACRO 同相位·同 offset`);
  }
});

// ── 两盘异相＋半幅（不同步才像被同一条带拽着·deck.js:164）──
test('收带盘半挣扎：reel1 峰值 ≈ 0.5 × reel0 峰值', () => {
  const self = stuckSelf();
  const p0 = maxAbs(offsetSeries(self, 0, 10, MACRO));
  const p1 = maxAbs(offsetSeries(self, 1, 20, MACRO));
  assert.ok(Math.abs(p1 / p0 - 0.5) < 0.02, `半幅比 ${(p1 / p0).toFixed(3)} 应≈0.5`);
});

test('两盘异相：存在时刻一盘挣扎·另一盘静伏（i*460 相移·非同步节拍）', () => {
  const self = stuckSelf();
  let found = false;
  for (let t = 0; t < MACRO && !found; t += STEP) {
    const a0 = Math.abs(theta(self, 0, t) - 10) > 1e-9;
    const a1 = Math.abs(theta(self, 1, t) - 20) > 1e-9;
    if (a0 !== a1) found = true;            // 一动一静＝异相
  }
  assert.ok(found, '两盘存在一动一静的时刻（同步则永远同动同静）');
});

// ── 断电即松＋解卡（物理释放律·deck.js:131 / STUCK_CLEARED）──
test('断电即松：STUCK 中喂断电包(IDLE)→释放挣扎（防 CLEARED 缺席闩死到停机后·:131）', () => {
  const self = {
    reels: [{ theta: 0, omega: 1, ratio: 1 }, { theta: 0, omega: 1, ratio: 1.18 }],
    stuck: false, stuckTheta: null as number[] | null, lastStageT: 0, wowPhase: 0, wow: 0,
    pair: { push() {} },
  };
  proto.onMoment.call(self, { special: 'STUCK_LOOP' });
  assert.equal(self.stuck, true, 'STUCK_LOOP 入卡');
  proto.onPacket.call(self, { stageT: 100, A: 0, phase: 'IDLE', wow: 0 }, false);
  assert.equal(self.stuck, false, '断电(非 WORKING/WAITING) 即松');
});

test('STUCK_CLEARED 解卡：编舞退场·thetaAt 复归真实 theta', () => {
  const self = stuckSelf(5, 6);
  assert.notEqual(theta(self, 0, 460), 5);                 // 卡中·活跃相有前冲
  proto.onMoment.call(self as object, { special: 'STUCK_CLEARED' });
  assert.equal((self as { stuck: boolean }).stuck, false);
  assert.equal((self as { stuckTheta: unknown }).stuckTheta, null);
  self.reels[0]!.theta = 5;
  assert.equal(theta(self, 0, 460), 5, '解卡后返真实 theta·无残余编舞');
});
