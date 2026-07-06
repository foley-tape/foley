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
const tapeCache = new Map();
for (const name of TAPES) {
  const curveRaw = readFileSync(join(stageRoot, 'fixtures', `${name}.curve.csv`), 'utf8');
  const momentsRaw = readFileSync(join(stageRoot, 'fixtures', `${name}.moments.csv`), 'utf8');
  const tape = buildTape(name, curveRaw, momentsRaw);
  tapeCache.set(name, tape);
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

// 影子改判（M2.3 §0.2）：选择效率=正式影子（阈值候两轮数据）；raw 覆盖率=记述值
// （量带子浓度性格，不设卡）；盈余覆盖率=体检表描述子；时长占比照旧 ≤0.15。
console.log(`\nparamsHash=${paramsHash}  影子（M2.3 §0.2 改判：效率=正式影子候阈值｜raw=记述｜盈余=体检｜share≤${params.shadow.durationShareMax}）`);
console.log('带名      段数  成片s  选中舞台s  raw记述  盈余体检  选择效率  时长占比  活跃s');
for (const r of rows) {
  const shareFlag = +r.share <= params.shadow.durationShareMax ? ' ' : '!';
  console.log(`${r.name.padEnd(8)}  ${String(r.segs).padStart(2)}   ${r.viewer.padStart(5)}   ${r.stage.padStart(6)}   ${r.coverage}   ${r.excess}    ${r.eff}    ${r.share}${shareFlag}   ${r.activeS}`);
}

// 四档预设一览（M2.3 §1.1 欠交修的实证面；金件只冻 defaultS，其余档由 dub.test 52 盯守）
console.log('\n四档成片（s）  30 ／ 45 ／ 60 ／ 90');
for (const name of TAPES) {
  const vals = [30, 45, 60, 90].map(t =>
    (proposeCuts(tapeCache.get(name), params, t).analysis.viewerMs / 1000).toFixed(1));
  console.log(`${name.padEnd(8)}  ${vals.map(v => v.padStart(5)).join(' ／ ')}`);
}
if (!freeze && fail > 0) process.exit(1);
