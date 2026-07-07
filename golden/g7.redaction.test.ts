// G7 分享/导出脱敏闸回归（M2.6 P1-①/TR-1——AUDIT_FINAL 双队收敛真雷，甲-5/乙-F2/乙-F3）。
// 口径（架构师裁定，发行轨统一执行）：**默认形态即安全形态**——
//   ① distill 默认产全脱敏带（时间相对化＋非内建工具名加盐哈希＋sourceHash=redacted）；
//     「不脱敏」翻转为显式 --raw，且产原始带时 stderr 强制警示；
//   ② dub meta.json 不落墙钟（created-at／live-epoch 皆为工时指纹，抹除——源码卫兵盯键形态）；
//   ③ 导出 mp4 的 mvhd/tkhd/mdhd creation_time/modification_time 钉 0（纯函数直测＋film.js 挂钩卫兵）。
// 红队验收对应（M2.6 §0 三段闭环）：乙复跑 F2/F3 探针、甲复跑 5 号夹具指纹检查——本文件是蓝队侧回归，
// 真浏览器导出的 E2E 证词仍由乙的探针复跑签署。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeDistilled, parseDistilled } from '../adapters/claude-jsonl/index.ts';
import { resolveParams } from '../engine/params.ts';
import { scrubMp4Dates } from '../stage/js/mp4scrub.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const fixture = join(here, 'fixtures', 'unknown-tool.jsonl'); // 内建工具＋自定义 FrobnicateWidget＋绝对 2026 时戳＋一处 is_error
const params = resolveParams(JSON.parse(readFileSync(join(repoRoot, 'params.json'), 'utf8')));

// ─────────────────── ① 默认带：时间相对化＋工具名哈希＋sourceHash=redacted ───────────────────

test('G7·① writeDistilled 默认即脱敏：相对时间、非内建工具哈希、sourceHash=redacted（盘上形态）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'g7-'));
  try {
    const out = join(dir, 'default.tape.jsonl');
    writeDistilled(fixture, out, params); // 不传 redact —— 测的就是默认
    const d = parseDistilled(readFileSync(out, 'utf8')); // 以盘上真身为准
    assert.equal(d.meta.sourceHash, 'redacted', 'sourceHash 不得指纹化源文件');
    assert.equal(d.meta.stats.firstT, 0, '首事件应相对化为 0');
    for (const r of d.records) {
      assert.ok(r.t < 1e9, `t 应为相对偏移（去日历/时钟指纹），实测 ${r.t}`);
      assert.notEqual(r.tool, 'FrobnicateWidget', '非内建工具名不得明文落带');
      if (r.errClass) assert.match(r.errClass, /^e[0-9a-f]+$/, `errClass 应为聚类哈希，实测 ${r.errClass}`);
    }
    assert.ok(d.records.some((r) => r.tool && /^t[0-9a-f]+$/.test(r.tool)), '自定义工具应以加盐哈希形态在场');
    assert.ok(d.records.some((r) => r.tool === 'Read' || r.tool === 'Bash'), '内建工具名保留（无隐私，可读性留给自己人）');
    for (const e of d.meta.episodes) {
      assert.ok(e.startT < 1e9 && e.endT < 1e9, `episodes.startT/endT 应相对化（甲-5 指纹），实测 [${e.startT},${e.endT}]`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('G7·① CLI 默认产脱敏带；--raw 出原始且 stderr 强制警示', () => {
  const dir = mkdtempSync(join(tmpdir(), 'g7cli-'));
  try {
    // 默认：脱敏
    const outDef = join(dir, 'def.tape.jsonl');
    const r1 = spawnSync('node', ['cli/index.ts', 'distill', fixture, outDef], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(r1.status, 0, `distill 默认应成功：${r1.stderr}`);
    assert.equal(parseDistilled(readFileSync(outDef, 'utf8')).meta.sourceHash, 'redacted');
    // --raw：原始 + 警示
    const outRaw = join(dir, 'raw.tape.jsonl');
    const r2 = spawnSync('node', ['cli/index.ts', 'distill', fixture, outRaw, '--raw'], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(r2.status, 0, `distill --raw 应成功：${r2.stderr}`);
    const dRaw = parseDistilled(readFileSync(outRaw, 'utf8'));
    assert.notEqual(dRaw.meta.sourceHash, 'redacted', '--raw 保留源指纹（这正是它的警示点）');
    assert.ok(dRaw.records.some((r) => r.tool === 'FrobnicateWidget'), '--raw 保留明文工具名');
    assert.ok(dRaw.records.every((r) => r.t > 1e12), '--raw 保留绝对 epoch');
    assert.match(String(r2.stderr), /绝对时间|工作时段|勿外传/, '--raw 必打隐私警示（TR-1 处置③）');
    assert.ok(!/绝对时间戳/.test(String(r1.stderr)), '默认路不该打 --raw 的警示');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ─────────────────── ③ 导出 mp4：mvhd/tkhd/mdhd 墙钟钉 0（乙-F2） ───────────────────

// 合成盒树：ftyp + moov[ mvhd(v0) + trak[ tkhd(v0) + mdia[ mdhd(v1) ] ] ] + free
// （v0=u32×2、v1=u64×2 两种版式都要吃到；free 盒当"邻居字节不许动"的对照）
function u32(n: number): number[] { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]; }
function box(type: string, ...payload: number[][]): number[] {
  const body = payload.flat();
  return [...u32(8 + body.length), ...[...type].map((c) => c.charCodeAt(0)), ...body];
}
const T0 = 0x66112233; // 显眼的非零墙钟

function syntheticMp4(): Uint8Array {
  const mvhd = box('mvhd', [0, 0, 0, 0], u32(T0), u32(T0 + 1), u32(1000), u32(90000)); // v0: creation, modification, timescale, duration
  const tkhd = box('tkhd', [0, 0, 0, 7], u32(T0), u32(T0 + 2), u32(1), u32(0), u32(90000));
  const mdhd = box('mdhd', [1, 0, 0, 0], u32(0), u32(T0), u32(0), u32(T0 + 3), u32(48000)); // v1: u64 creation, u64 modification, timescale
  const mdia = box('mdia', mdhd);
  const trak = box('trak', tkhd, mdia);
  const moov = box('moov', mvhd, trak);
  const ftyp = box('ftyp', [...'isom'].map((c) => c.charCodeAt(0)), u32(512));
  const free = box('free', [0x77, 0x77, 0x77, 0x77]);
  return new Uint8Array([...ftyp, ...moov, ...free]);
}

test('G7·③ scrubMp4Dates：mvhd/tkhd/mdhd 的 creation/modification（v0 与 v1）全部钉 0，邻字节不动', () => {
  const u8 = syntheticMp4();
  const before = Array.from(u8);
  const n = scrubMp4Dates(u8);
  assert.equal(n, 3, 'mvhd+tkhd+mdhd 三盒都要抹到');
  const dv = new DataView(u8.buffer);
  // 逐字节对照：只允许 12 处时间字段变零（mvhd 8B + tkhd 8B + mdhd 16B = 32 字节）
  let changed = 0;
  for (let i = 0; i < u8.length; i++) {
    if (u8[i] !== before[i]) { assert.equal(u8[i], 0, `变动字节只许变零 @${i}`); changed++; }
  }
  assert.ok(changed > 0 && changed <= 32, `变动应限于时间字段（≤32B），实测 ${changed}B`);
  // 语义抽查：mvhd timescale（时间字段之后）幸存
  const moovOff = 16 + 4; // ftyp(16) + moov 头(8) → mvhd 起点 = 16+8
  const mvhdPayload = 16 + 8 + 8; // mvhd 盒头后
  void moovOff;
  assert.equal(dv.getUint32(mvhdPayload + 4), 0, 'mvhd creation 归零');
  assert.equal(dv.getUint32(mvhdPayload + 8), 0, 'mvhd modification 归零');
  assert.equal(dv.getUint32(mvhdPayload + 12), 1000, 'mvhd timescale 不许动');
  // 幂等：再抹一遍无第二次变动
  const once = Array.from(u8);
  scrubMp4Dates(u8);
  assert.deepEqual(Array.from(u8), once, '幂等');
});

test('G7·③ scrubMp4Dates：坏盒/截断/垃圾输入不抛、不越界', () => {
  assert.doesNotThrow(() => scrubMp4Dates(new Uint8Array(0)));
  assert.doesNotThrow(() => scrubMp4Dates(new Uint8Array([0, 0, 0, 99, 109, 111, 111, 118]))); // 声称 99B 实际 8B
  const junk = new Uint8Array(64).fill(0xab);
  assert.doesNotThrow(() => scrubMp4Dates(junk));
});

// ─────────────────── ②③ 源码卫兵：挂钩不许摘、墙钟不许回潮 ───────────────────

test('G7·②③ 源码卫兵：film.js 必挂 scrubMp4Dates；dub.js meta 不得再落 created-at/live-epoch 键', () => {
  const film = readFileSync(join(repoRoot, 'stage', 'js', 'film.js'), 'utf8');
  assert.match(film, /scrubMp4Dates\s*\(/, 'film.js finalize 后的抹钟挂钩不许摘（乙-F2 复发即此处）');
  const dub = readFileSync(join(repoRoot, 'stage', 'js', 'dub.js'), 'utf8');
  assert.ok(!/createdAt\s*:/.test(dub), 'dub meta 不得再写 createdAt 键（出片墙钟=工时指纹，乙-F3）');
  assert.ok(!/liveEpoch\s*:/.test(dub), 'dub meta 不得把 liveEpoch 落盘（当日开工时刻，乙-F3）——在场消费走内存');
});
