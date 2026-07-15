// 席二工单 3 金测 · D2 修法：deriveMachineState＝状态契约 v1.3 的可执行执法。
// 上半：真值表关键行逐行钉证（docs/状态契约_模式灯语真值表.md §四·含 v1.3 琥珀收紧＋settled）；
// 下半：**穷举全组合空间**（3×4×4×4×4×2×2=3072 组合·加 done 轴）断言非法帧清单零命中——
//       席三之闸可直接引用：非法帧（含 asking⟹recording）在函数上不可能，不是碰巧没出现。
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error 纯 JS 导出（两页同法件·无 d.ts——形状由本金测钉死）
import { deriveMachineState } from '../stage/js/derive.js';

type S = { power: string; phase: string; sourceKind: string; link: string; producer: string | null; pendingAsk: boolean; done: boolean };
const st = (o: Partial<S> = {}): S => ({ power: 'on', phase: 'PLAYING', sourceKind: 'live', link: 'live', producer: 'alive', pendingAsk: false, done: false, ...o });

test('契约真值表·关键行逐行（v1.3）', () => {
  // 行 1：OFF——一切灭，唯静
  let d = deriveMachineState(st({ power: 'off' }));
  assert.deepEqual([d.recording, d.asking, d.linkLit, d.signalCue, d.settled], [false, false, 0, null, false], '行1 OFF 全灭');
  // 行 2：TEST——REC/琥珀灭·LINE 基底在·带不走
  d = deriveMachineState(st({ power: 'test', phase: 'PAUSED' }));
  assert.deepEqual([d.recording, d.asking, d.linkLit, d.signalCue], [false, false, 0.12, null], '行2 TEST');
  // 行 3：ON·live·PLAYING·链活·producer 活——REC 呼吸
  d = deriveMachineState(st());
  assert.deepEqual([d.recording, d.linkLit, d.signalCue], [true, 0.12, null], '行3 正常录制');
  // 行 4：＋pendingAsk——琥珀呼吸整程（live 恒 PLAYING·asking⟹recording 恰成立）
  d = deriveMachineState(st({ pendingAsk: true }));
  assert.deepEqual([d.recording, d.asking], [true, true], '行4 ASK 等待期');
  // 行 5：lost——REC 灭·LINE 熄·Signal Lost
  d = deriveMachineState(st({ link: 'lost', pendingAsk: true }));
  assert.deepEqual([d.recording, d.asking, d.linkLit, d.signalCue], [false, false, 0, 'lost'], '行5 断链（断链不许替死人问话）');
  // 行 6：gone——REC 灭·LINE **亮**（v1.2：源没了线没断）·Source Gone
  d = deriveMachineState(st({ link: 'gone' }));
  assert.deepEqual([d.recording, d.linkLit, d.signalCue], [false, 0.12, 'gone'], '行6 源亡（LINE 照亮=v1.2 修表）');
  // 行 7：producer=dead——REC 灭·死相 dead（Source Gone 族）
  d = deriveMachineState(st({ producer: 'dead' }));
  assert.deepEqual([d.recording, d.asking, d.signalCue], [false, false, 'dead'], '行7 猝死');
  // 行 7b：producer=ended——REC 灭·**无死相**（善终不是死）·＋pendingAsk 仍不许琥珀（v1.3）
  d = deriveMachineState(st({ producer: 'ended', pendingAsk: true }));
  assert.deepEqual([d.recording, d.asking, d.signalCue], [false, false, null], '行7b 善终（ended 不许问话）');
  // 行 8：PAUSED＋pendingAsk——REC 灭·**琥珀灭**（v1.3：asking⟹recording·暂停即无琥珀）
  d = deriveMachineState(st({ phase: 'PAUSED', pendingAsk: true }));
  assert.deepEqual([d.recording, d.asking], [false, false], '行8 暂停（暂停即无琥珀）');
  // 行 9：回放带＋pendingAsk——REC 灭·**琥珀灭**（v1.3：非 live 无琥珀）·无 cue
  d = deriveMachineState(st({ sourceKind: 'session', producer: null, pendingAsk: true }));
  assert.deepEqual([d.recording, d.asking, d.signalCue], [false, false, null], '行9 回放（非 live 无琥珀）');
  // 行 10：空载
  d = deriveMachineState(st({ sourceKind: 'none', phase: 'EMPTY', producer: null }));
  assert.deepEqual([d.recording, d.signalCue], [false, null], '行10 空载');
  // settled（done 轴·R5）：done=true∧power≠off ⇒ 常亮；power=off ⇒ 熄；不受 link/producer 覆盖
  assert.equal(deriveMachineState(st({ done: true })).settled, true, 'settled：done∧on');
  assert.equal(deriveMachineState(st({ done: true, power: 'off' })).settled, false, 'settled：OFF 熄');
  assert.equal(deriveMachineState(st({ done: true, link: 'gone', producer: 'dead' })).settled, true, 'settled：不受 link/producer 覆盖（完成是历史事实）');
  assert.equal(deriveMachineState(st({ done: false })).settled, false, 'settled：未 done 灭');
});

test('非法帧穷举执法：全组合空间零命中（席三之闸的地基·v1.3 含 asking⟹recording＋settled）', () => {
  const powers = ['off', 'test', 'on'];
  const phases = ['EMPTY', 'CUEING', 'PLAYING', 'PAUSED'];
  const sources = ['live', 'session', 'factory', 'none'];
  const links = ['connecting', 'live', 'lost', 'gone'];
  const producers = [null, 'alive', 'dead', 'ended'];
  let n = 0;
  for (const power of powers) for (const phase of phases) for (const sourceKind of sources)
    for (const link of links) for (const producer of producers) for (const pendingAsk of [false, true]) for (const done of [false, true]) {
      const d = deriveMachineState({ power, phase, sourceKind, link, producer, pendingAsk, done });
      n++;
      const ctx = JSON.stringify({ power, phase, sourceKind, link, producer, pendingAsk, done });
      // 非法帧清单（契约 §四）：
      if (power !== 'on') {
        assert.equal(d.recording, false, `OFF/TEST∧REC 亮：${ctx}`);
        assert.equal(d.signalCue, null, `OFF/TEST∧cue：${ctx}`);
      }
      if (power === 'off') { assert.equal(d.linkLit, 0, `OFF∧LINE 亮：${ctx}`); assert.equal(d.settled, false, `OFF∧settled 亮：${ctx}`); }
      if (link === 'lost' || link === 'gone') {
        if (sourceKind === 'live') assert.equal(d.recording, false, `lost/gone∧REC 亮：${ctx}`);
      }
      if (producer === 'dead' || producer === 'ended') {
        if (sourceKind === 'live') assert.equal(d.recording, false, `dead/ended∧REC 亮：${ctx}`);
      }
      if (sourceKind !== 'live') {
        assert.equal(d.recording, false, `回放/空载∧REC 亮：${ctx}`);
        assert.equal(d.signalCue, null, `非 live∧cue：${ctx}`);
        assert.equal(d.asking, false, `非 live∧琥珀亮（v1.3）：${ctx}`);
      }
      // v1.3 琥珀收紧：asking ⟹ recording（主执法·涵盖 ended/非 live/未录/断链/断电）
      if (d.asking) assert.equal(d.recording, true, `琥珀先于红（asking⟹recording 违例）：${ctx}`);
      if (producer === 'ended' || producer === 'dead') assert.equal(d.asking, false, `死人/善终问话：${ctx}`);
      if (producer === 'ended') assert.notEqual(d.signalCue, 'dead', `善终打死相：${ctx}`);
      // settled 公式全域执法（R5）
      assert.equal(d.settled, power !== 'off' && done, `settled 公式：${ctx}`);
    }
  assert.equal(n, 3072, '穷举帐（加 done 轴）');
});
