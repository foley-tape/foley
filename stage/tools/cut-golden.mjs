// cuts 确定性金测试（FOLEY_DESIGN_DUB §1/§5.1）：同带＋同 cut-params → cuts.json 逐字节一致。
// 附带影子首采（informational）：覆盖率 ≥0.6、选中时长占比 ≤15%（短带放宽）。
//
//   node stage/tools/cut-golden.mjs             # 五带比对（CI 姿态，失配退 1）
//   node stage/tools/cut-golden.mjs --freeze    # 冻结当前输出为金（改参改法后重冻并记案）
//   node stage/tools/cut-golden.mjs --print storm
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTape } from '../js/replay.js';
import { proposeCuts, cutsDocument, serializeCuts } from '../js/cut.js';

const stageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const goldenDir = join(stageRoot, 'golden');
const TAPES = ['storm', 'smooth', 'busy', 'jam', 'silence'];
const sha16 = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16);

const freeze = process.argv.includes('--freeze');
const printIdx = process.argv.indexOf('--print');
const printTape = printIdx >= 0 ? process.argv[printIdx + 1] : null;

const paramsRaw = readFileSync(join(stageRoot, 'cut-params.json'));
const params = JSON.parse(paramsRaw.toString());
const paramsHash = sha16(paramsRaw);

mkdirSync(goldenDir, { recursive: true });
let fail = 0;
const rows = [];
for (const name of TAPES) {
  const curveRaw = readFileSync(join(stageRoot, 'fixtures', `${name}.curve.csv`), 'utf8');
  const momentsRaw = readFileSync(join(stageRoot, 'fixtures', `${name}.moments.csv`), 'utf8');
  const tape = buildTape(name, curveRaw, momentsRaw);
  const { segments, analysis } = proposeCuts(tape, params, params.solver.defaultS);
  const text = serializeCuts(cutsDocument({
    tapeName: name, tapeHash: sha16(curveRaw + '\n' + momentsRaw), // 带=曲线+时刻两件套（与 dub.js 同式）
    paramsHash, targetS: params.solver.defaultS, segments,
  }));

  const goldenPath = join(goldenDir, `${name}.cuts.json`);
  if (freeze) {
    writeFileSync(goldenPath, text);
    console.log(`冻结 ${name}.cuts.json（${segments.length} 段）`);
  } else if (!existsSync(goldenPath)) {
    console.log(`✗ ${name}：无金件（先 --freeze）`); fail++;
  } else {
    const want = readFileSync(goldenPath, 'utf8');
    if (want === text) console.log(`✓ ${name} 逐字节一致`);
    else { console.log(`✗ ${name} 失配`); fail++; }
  }

  rows.push({
    name,
    segs: segments.length,
    viewer: (analysis.viewerMs / 1000).toFixed(1),
    stage: (analysis.selectedStageMs / 1000).toFixed(0),
    coverage: analysis.coverage.toFixed(3),
    excess: analysis.excessCoverage.toFixed(3),
    eff: analysis.efficiency.toFixed(3),
    share: analysis.durationShare.toFixed(3),
    activeS: Math.round(analysis.activeMs / 1000),
  });

  if (printTape === name) {
    console.log(serializeCuts(cutsDocument({ tapeName: name, tapeHash: sha16(curveRaw), paramsHash, targetS: params.solver.defaultS, segments })));
  }
}

console.log(`\nparamsHash=${paramsHash}  影子首采（informational：coverage≥${params.shadow.coverageMin}，share≤${params.shadow.durationShareMax}，短带放宽；盈余口径并采候裁）`);
console.log('带名      段数  成片s  选中舞台s  raw覆盖  盈余覆盖  选择效率  时长占比  活跃s');
for (const r of rows) {
  const covFlag = +r.coverage >= params.shadow.coverageMin ? ' ' : '!';
  const exFlag = +r.excess >= params.shadow.coverageMin ? ' ' : '!';
  const shareFlag = +r.share <= params.shadow.durationShareMax ? ' ' : '!';
  console.log(`${r.name.padEnd(8)}  ${String(r.segs).padStart(2)}   ${r.viewer.padStart(5)}   ${r.stage.padStart(6)}   ${r.coverage}${covFlag}  ${r.excess}${exFlag}   ${r.eff}    ${r.share}${shareFlag}   ${r.activeS}`);
}
if (!freeze && fail > 0) process.exit(1);
