// 剪辑正典金测试（FOLEY_DESIGN_DUB §1/§5.1，M-T1）。
// ㊿ cuts 确定性：同带＋同 cut-params → cuts.json 逐字节一致（对 stage/golden/ 冻结件，
//    且同进程双算逐字节自证——纯函数纪律的机器证词）。
// 51 文法不变量：PEAK 恒原速且成片 8–15s；段升序不相压不出带；桥段 ≤3；
//    成片总长 ≤ 目标＋容差、≥ 0.6×目标（短带 allowUnderrun 放宽的下限）。
// 52 预设四档（M2.3 §1.1）：30/45/60/90 全档文法成立＋成片严格单调——60/90 欠交回归哨。
// 影子指标（效率/占比）为 informational，不在此处设卡——采数见 cut-golden.mjs 报表。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildTape } from '../stage/js/replay.js';
import { proposeCuts, cutsDocument, serializeCuts } from '../stage/js/cut.js';

const here = dirname(fileURLToPath(import.meta.url));
const stageRoot = join(here, '..', 'stage');
const TAPES = ['storm', 'smooth', 'busy', 'jam', 'silence'] as const;

const paramsRaw = readFileSync(join(stageRoot, 'cut-params.json'), 'utf8');
const params = JSON.parse(paramsRaw);
const sha16 = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 16);
const paramsHash = sha16(paramsRaw);

function cutsTextOf(name: string, targetS: number = params.solver.defaultS): { text: string; segments: { role: string; t0: number; t1: number; speed: number }[]; durationMs: number } {
  const curveRaw = readFileSync(join(stageRoot, 'fixtures', `${name}.curve.csv`), 'utf8');
  const momentsRaw = readFileSync(join(stageRoot, 'fixtures', `${name}.moments.csv`), 'utf8');
  const tape = buildTape(name, curveRaw, momentsRaw);
  const { segments } = proposeCuts(tape, params, targetS);
  const text = serializeCuts(cutsDocument({
    tapeName: name, tapeHash: sha16(curveRaw + '\n' + momentsRaw),
    paramsHash, targetS, segments,
  }));
  return { text, segments, durationMs: tape.duration };
}

// 段表结构断言（51/52 共用）：角色词表、升序不压不出带、整数毫秒、PEAK 唯一原速 8–15s、桥段编制；返回成片 ms
function assertGrammar(name: string, target: number, segments: { role: string; t0: number; t1: number; speed: number }[], durationMs: number): number {
  const ROLES = new Set(['OPEN', 'RAMP', 'PEAK', 'TURN', 'CLOSE', 'BRIDGE']);
  assert.ok(segments.length > 0, `${name}@${target}s：活跃带不该空提议`);
  let prevEnd = -1;
  for (const s of segments) {
    assert.ok(ROLES.has(s.role), `${name}@${target}s：未知角色 ${s.role}`);
    assert.ok(Number.isInteger(s.t0) && Number.isInteger(s.t1) && Number.isInteger(s.speed), `${name}@${target}s：非整数输出`);
    assert.ok(s.t0 >= 0 && s.t1 <= Math.round(durationMs) && s.t0 < s.t1, `${name}@${target}s：段出带 [${s.t0},${s.t1}]`);
    assert.ok(s.t0 >= prevEnd, `${name}@${target}s：段相压 @${s.t0}`);
    prevEnd = s.t1;
  }
  const peaks = segments.filter(s => s.role === 'PEAK');
  assert.equal(peaks.length, 1, `${name}@${target}s：PEAK 应有且仅有一段`);
  assert.equal(peaks[0]!.speed, 1, `${name}@${target}s：高潮必须原速`);
  const peakViewer = (peaks[0]!.t1 - peaks[0]!.t0) / 1000;
  assert.ok(peakViewer >= params.grammar.peak.minS && peakViewer <= params.grammar.peak.maxS,
    `${name}@${target}s：PEAK 成片 ${peakViewer}s 出 8–15s 窗`);
  const bridges = segments.filter(s => s.role === 'BRIDGE');
  assert.ok(bridges.length <= params.grammar.bridge.maxCount, `${name}@${target}s：桥段超编`);
  for (const b of bridges) assert.equal(b.speed, params.grammar.bridge.speed);
  // 上限带骨骼容差 8%：收缩到文法下限（锚段的骨）即停，小目标（30s）诚实超一点
  // 好过把 OPEN/CLOSE 砍进骨头（busy@30 实测 31.5s）
  const viewerMs = segments.reduce((t, s) => t + Math.round((s.t1 - s.t0) / s.speed), 0);
  assert.ok(viewerMs <= Math.round(target * 1000 * 1.08), `${name}@${target}s：成片 ${viewerMs}ms 超目标（含 8% 骨骼容差）`);
  return viewerMs;
}

test('㊿ cuts 确定性：五带对冻结件逐字节一致，双算自证', () => {
  for (const name of TAPES) {
    const golden = readFileSync(join(stageRoot, 'golden', `${name}.cuts.json`), 'utf8');
    const a = cutsTextOf(name);
    const b = cutsTextOf(name);
    assert.equal(a.text, b.text, `${name}：同带同参双算不一致——纯函数纪律破产`);
    assert.equal(a.text, golden, `${name}：与冻结件失配（改参改法需 cut-golden.mjs --freeze 重冻并记案）`);
  }
});

test('51 文法不变量：弧的骨相', () => {
  for (const name of TAPES) {
    const { segments, durationMs } = cutsTextOf(name);
    const viewerMs = assertGrammar(name, params.solver.defaultS, segments, durationMs);
    // 成片总长下限：≥0.6×目标（allowUnderrun 的诚实下限）
    assert.ok(viewerMs >= params.solver.defaultS * 1000 * 0.6, `${name}：成片 ${viewerMs}ms 短得离谱`);
  }
});

// 52 预设四档（M2.3 §1.1，60/90 欠交回归哨）：文法全档成立；成片随目标严格递增——
// 90 与 60 同件即欠交复发。富矿三带（storm/smooth/busy）加 0.6×目标下限；
// 文法弧线＋素材结构给 90 档定了诚实天花板（实测 66–72s），allowUnderrun 如实放行。
test('52 预设四档：文法不变量全档成立＋成片严格单调', () => {
  const RICH = new Set(['storm', 'smooth', 'busy']);
  for (const name of TAPES) {
    const viewers: number[] = [];
    for (const target of params.solver.targetsS as number[]) {
      const { segments, durationMs } = cutsTextOf(name, target);
      const viewerMs = assertGrammar(name, target, segments, durationMs);
      if (RICH.has(name)) assert.ok(viewerMs >= target * 1000 * 0.6, `${name}@${target}s：富矿带成片 ${viewerMs}ms 不足六成目标`);
      viewers.push(viewerMs);
    }
    for (let i = 1; i < viewers.length; i++) {
      assert.ok(viewers[i]! > viewers[i - 1]!,
        `${name}：${params.solver.targetsS[i]}s 档成片 ${viewers[i]}ms 未严格大于 ${params.solver.targetsS[i - 1]}s 档 ${viewers[i - 1]}ms——预设欠交复发`);
    }
  }
});
