// 红队B 确定性双跑：本机内两跑逐字节一致 + 跨平台风险面清点。
// 晨间可在第二台机器/第二个 Node 版本跑同脚本，对比 hash 是否一致（验"跨平台确定性"主张）。
// 用法：node audit/b/repro/B_determinism.ts
import { replayText } from '../../../cli/replay.ts';
import { resolveParams } from '../../../engine/params.ts';
import { hashJson } from '../../../engine/params.ts';
import { readFileSync, existsSync } from 'node:fs';

const params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));
function fnv(s: string): string { // 与源码同款 FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

console.log('Node', process.version, process.platform, process.arch);
console.log('=== 5 带 replay 双跑：本机内逐字节一致 + curve/moments 指纹（供跨平台对比）===');
const bands = ['silence', 'smooth', 'busy', 'jam', 'storm'];
const fingerprints: Record<string, string> = {};
for (const b of bands) {
  const p = new URL(`../../../tapes/${b}.tape.jsonl`, import.meta.url);
  if (!existsSync(p)) { console.log(`  ${b}: 缺带`); continue; }
  const text = readFileSync(p, 'utf8');
  const meta = { engineSha: 'audit', paramsHash: hashJson(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8'))), tapeName: b, kind: b as never };
  const a = replayText(text, params, meta);
  const c = replayText(text, params, meta);
  const same = a.curveCsv === c.curveCsv && a.momentsCsv === c.momentsCsv;
  const fp = fnv(a.curveCsv) + '/' + fnv(a.momentsCsv);
  fingerprints[b] = fp;
  console.log(`  ${b}: 本机双跑一致=${same ? '✅' : '❌'}  指纹(curve/moments)=${fp}`);
}
console.log('\n复制此块到第二平台对比：');
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, fingerprints }, null, 0));

console.log('\n=== 跨平台风险面：非确定性来源清点 ===');
console.log('  引擎用到的超越函数（libm 实现跨平台不保证逐位一致）：');
console.log('   - Math.exp  ：tension(T=1−e^−S/S0)、decayStress(e^−dt/τ)、activity(1−e^−rate)、wow 平滑');
console.log('   - Math.log  ：magnitudeOf 对数归一（消费侧）、雨量无、Sfor 仅测试');
console.log('   - Math.pow  ：rep=min(repBase^k, repCap)（k 为小整数，pow 整数指数一般稳）');
console.log('  IEEE754 +−×÷ 与 √ 由标准保证逐位一致；exp/log/pow 属"正确舍入未强制"区。');
console.log('  → 主张"同带跨 Node 版本/平台逐字节一致"未被任何测试覆盖（金测试⑤仅同进程双跑）。');
console.log('  → 缓解：CSV 已量化到 6 位小数（f6）；若两平台差异 <5e-7 则量化后仍可能一致，但边界值会翻位。');
