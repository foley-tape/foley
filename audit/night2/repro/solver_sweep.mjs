// 红队B' — 求解器边界扫描：targetS 20→120，五带各扫，量 viewerMs 与段构。
// 复核庭已在册 60/90 天花板；此扫找同类：哪些 target 段坍缩相同、天花板落点、
// 桥段 stageMaxS×maxCount 与 speed 决定的理论上限。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTape } from '../../../stage/js/replay.js';
import { proposeCuts } from '../../../stage/js/cut.js';

const WT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const FIX = path.join(WT, 'stage/fixtures');
const params = JSON.parse(fs.readFileSync(path.join(WT, 'stage/cut-params.json'), 'utf8'));
const names = ['smooth', 'busy', 'jam', 'storm', 'silence'];

const viewerMs = (segs) => segs.reduce((t, s) => t + Math.round((s.t1 - s.t0) / s.speed), 0);
const sig = (segs) => segs.map(s => `${s.role[0]}${Math.round((s.t1 - s.t0) / s.speed / 1000)}`).join('');

// 桥段理论上限：maxCount 条 × stageMaxS/speed viewer 秒
const g = params.grammar;
const bridgeCeilS = g.bridge.maxCount * (g.bridge.stageMaxS / g.bridge.speed);
console.log(`# 求解器边界扫描\n`);
console.log(`桥段 viewer 理论上限 = maxCount(${g.bridge.maxCount}) × stageMaxS(${g.bridge.stageMaxS})/speed(${g.bridge.speed}) = ${bridgeCeilS}s viewer（全部桥段撑满也只这么多）\n`);

for (const name of names) {
  const cText = fs.readFileSync(path.join(FIX, `${name}.curve.csv`), 'utf8');
  const mText = fs.existsSync(path.join(FIX, `${name}.moments.csv`)) ? fs.readFileSync(path.join(FIX, `${name}.moments.csv`), 'utf8') : 't\n';
  const tape = buildTape(name, cText, mText);
  const durS = (tape.duration / 1000).toFixed(0);
  console.log(`## ${name}（走纸时长 ${durS}s active）`);
  console.log('| targetS | viewerS 实得 | 命中率 | 段签名 |');
  console.log('|---|---|---|---|');
  let prevSig = null, ceil = 0, ceilAt = null;
  for (let ts = 20; ts <= 120; ts += 10) {
    const cuts = proposeCuts(tape, params, ts);
    const vS = viewerMs(cuts.segments) / 1000;
    const s = sig(cuts.segments);
    const hit = (vS / ts * 100).toFixed(0) + '%';
    const collapse = s === prevSig ? ' ⟵ 与上一档同构（坍缩）' : '';
    console.log(`| ${ts} | ${vS.toFixed(1)} | ${hit} | ${s}${collapse} |`);
    if (vS > ceil) { ceil = vS; ceilAt = ts; }
    prevSig = s;
  }
  console.log(`\n**${name} 天花板 ≈ ${ceil.toFixed(1)}s（首现于 target=${ceilAt}）；target≥该点起再要长度也给不出**\n`);
}
