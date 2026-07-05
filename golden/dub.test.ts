// 剪辑正典金测试（FOLEY_DESIGN_DUB §1/§5.1，M-T1）。
// ㊿ cuts 确定性：同带＋同 cut-params → cuts.json 逐字节一致（对 stage/golden/ 冻结件，
//    且同进程双算逐字节自证——纯函数纪律的机器证词）。
// 51 文法不变量：PEAK 恒原速且成片 8–15s；段升序不相压不出带；桥段 ≤3；
//    成片总长 ≤ 目标＋容差、≥ 0.6×目标（短带 allowUnderrun 放宽的下限）。
// 影子指标（覆盖率/时长占比）为 informational，不在此处设卡——首采见 cut-golden.mjs 报表。

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

function cutsTextOf(name: string): { text: string; segments: { role: string; t0: number; t1: number; speed: number }[]; durationMs: number } {
  const curveRaw = readFileSync(join(stageRoot, 'fixtures', `${name}.curve.csv`), 'utf8');
  const momentsRaw = readFileSync(join(stageRoot, 'fixtures', `${name}.moments.csv`), 'utf8');
  const tape = buildTape(name, curveRaw, momentsRaw);
  const { segments } = proposeCuts(tape, params, params.solver.defaultS);
  const text = serializeCuts(cutsDocument({
    tapeName: name, tapeHash: sha16(curveRaw + '\n' + momentsRaw),
    paramsHash, targetS: params.solver.defaultS, segments,
  }));
  return { text, segments, durationMs: tape.duration };
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
  const ROLES = new Set(['OPEN', 'RAMP', 'PEAK', 'TURN', 'CLOSE', 'BRIDGE']);
  for (const name of TAPES) {
    const { segments, durationMs } = cutsTextOf(name);
    assert.ok(segments.length > 0, `${name}：活跃带不该空提议`);

    // 段序与边界：升序、不相压、不出带、整数毫秒
    let prevEnd = -1;
    for (const s of segments) {
      assert.ok(ROLES.has(s.role), `${name}：未知角色 ${s.role}`);
      assert.ok(Number.isInteger(s.t0) && Number.isInteger(s.t1) && Number.isInteger(s.speed), `${name}：非整数输出`);
      assert.ok(s.t0 >= 0 && s.t1 <= Math.round(durationMs) && s.t0 < s.t1, `${name}：段出带 [${s.t0},${s.t1}]`);
      assert.ok(s.t0 >= prevEnd, `${name}：段相压 @${s.t0}`);
      prevEnd = s.t1;
    }

    // PEAK：有且仅有一段，原速，成片 8–15s——高潮必须原速
    const peaks = segments.filter(s => s.role === 'PEAK');
    assert.equal(peaks.length, 1, `${name}：PEAK 应有且仅有一段`);
    assert.equal(peaks[0]!.speed, 1, `${name}：高潮必须原速`);
    const peakViewer = (peaks[0]!.t1 - peaks[0]!.t0) / 1000;
    assert.ok(peakViewer >= params.grammar.peak.minS && peakViewer <= params.grammar.peak.maxS,
      `${name}：PEAK 成片 ${peakViewer}s 出 8–15s 窗`);

    // 桥段 ≤3，速度按参数
    const bridges = segments.filter(s => s.role === 'BRIDGE');
    assert.ok(bridges.length <= params.grammar.bridge.maxCount, `${name}：桥段超编`);
    for (const b of bridges) assert.equal(b.speed, params.grammar.bridge.speed);

    // 成片总长：≤ 目标＋容差；≥0.6×目标（allowUnderrun 的诚实下限）
    const viewerMs = segments.reduce((t, s) => t + Math.round((s.t1 - s.t0) / s.speed), 0);
    const targetMs = params.solver.defaultS * 1000;
    assert.ok(viewerMs <= targetMs + 1000, `${name}：成片 ${viewerMs}ms 超目标`);
    assert.ok(viewerMs >= targetMs * 0.6, `${name}：成片 ${viewerMs}ms 短得离谱`);
  }
});
