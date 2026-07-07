#!/usr/bin/env node
// M2.6 回归（乙独立复射）· F3/TR-1：默认蒸馏带是否强制脱敏。对齐 main(6ab3218) 后跑。
// 判据：默认 distill → 时间相对化(firstT=0)＋MCP 工具名哈希＋sourceHash=redacted；
//       --raw(=redact:false) 仍产明文（显式逃生门，CLI 另有 stderr 强警示，见下 spawn）。
import { writeDistilled, loadDistilled } from '../../adapters/claude-jsonl/distill.ts';
import { resolveParams } from '../../engine/params.ts';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const params = resolveParams(JSON.parse(readFileSync(new URL('../../params.json', import.meta.url), 'utf8')));
const MCP = 'mcp__AcmeCorp_ProjectZeus__deployProd';
const raw = [
  JSON.stringify({ type: 'assistant', timestamp: '2026-06-01T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: MCP, input: { arg: 1 } }] } }),
  JSON.stringify({ type: 'user', timestamp: '2026-06-01T10:00:01.000Z', toolUseResult: { code: 0 }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', is_error: false, content: 'ok' }] } }),
].join('\n') + '\n';

const dir = mkdtempSync(join(tmpdir(), 'foley-regress-'));
const rawPath = join(dir, 'raw.jsonl'); writeFileSync(rawPath, raw);
let fail = 0;

// —— 默认蒸馏（G7：默认即脱敏；无第4参）——
const outDef = join(dir, 'default.tape.jsonl');
writeDistilled(rawPath, outDef, params);
const defTxt = readFileSync(outDef, 'utf8');
const defD = loadDistilled(outDef);
console.log('── F3 · 默认蒸馏带（应为脱敏形态）──');
for (const [n, ok] of [
  ['无绝对日历日期 2026-06-01', !defTxt.includes('2026-06-01')],
  ['无绝对 epoch-ms(1780…)', !/1780\d{9}/.test(defTxt)],
  ['firstT 归 0（时间相对化）', defD.meta.stats.firstT === 0],
  ['明文 MCP 工具名无影（哈希）', !['AcmeCorp', 'ProjectZeus', 'deployProd', MCP].some(s => defTxt.includes(s))],
  ['sourceHash=redacted（防跨带关联）', defD.meta.sourceHash === 'redacted'],
]) { console.log(`  ${ok ? '✓' : '✗'} ${n}`); if (!ok) fail = 1; }

// —— --raw 逃生门：应仍含明文（故意），CLI 端另有 stderr 强警示 ——
const outRaw = join(dir, 'raw.tape.jsonl');
writeDistilled(rawPath, outRaw, params, false);
const rawTxt = readFileSync(outRaw, 'utf8');
// 注：蒸馏带的时间是**绝对 epoch-ms 整数**（如 1780308000000），非 ISO 串——故查 epoch-ms 而非 '2026-…'
const rawLeaks = rawTxt.includes(MCP) && /1780\d{9}/.test(rawTxt);
console.log('── F3 · --raw 逃生门语义（应含明文＝故意本机调试）──');
console.log(`  ${rawLeaks ? '✓' : '✗'} redact=false 确含明文 MCP＋绝对 epoch-ms 时间（逃生门语义正确）`);
if (!rawLeaks) fail = 1;

// —— CLI 层：默认无警示、--raw 有 stderr 强警示 ——
const cliDef = spawnSync('node', ['cli/index.ts', 'distill', rawPath, join(dir, 'c1.tape.jsonl')], { cwd: new URL('../../', import.meta.url).pathname, encoding: 'utf8' });
const cliRaw = spawnSync('node', ['cli/index.ts', 'distill', rawPath, join(dir, 'c2.tape.jsonl'), '--raw'], { cwd: new URL('../../', import.meta.url).pathname, encoding: 'utf8' });
const rawWarned = /⚠|绝对时间|勿外传/.test(cliRaw.stderr || '');
const defQuiet = !/⚠|勿外传/.test(cliDef.stderr || '');
console.log('── F3 · CLI 警示 ──');
console.log(`  ${defQuiet ? '✓' : '✗'} 默认 distill 无危险警示（默认即安全）`);
console.log(`  ${rawWarned ? '✓' : '✗'} --raw distill 触发 stderr 强警示`);
if (!rawWarned || !defQuiet) fail = 1;

rmSync(dir, { recursive: true, force: true });
console.log(fail ? '\n❌ F3 有未修项' : '\n✅ F3 回归过：默认带强制脱敏，--raw 为显式且被警示的逃生门');
process.exit(fail ? 1 : 0);
