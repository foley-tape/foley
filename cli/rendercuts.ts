// renderCuts —— M-T3 钩子（SOUND-R3 §5 预提请转正式）：cuts + tape → 预告片音轨 PCM。
// 语义：段内恒速调度（各段独立引擎渲染——接带处的状态跳变正是剪刀的诚实声音）；
// 接带处叠接带音（种子化"噗"+10ms 交叉淡化防爆点）；结尾正格终止＋尾静默 ≥2s
// （withRecord 时为 tape-stop 版：唱片降速滑停；默认为床终止式 doneCadence）。
//
// dub 授权卫生（R3 §5 铁律 10）：音轨默认只含机器声＋foley＋接带音——唱片不入；
// 唱片进 dub 仅限（a）内置 CC0 出厂唱片（--with-record）或（b）用户对自备唱片显式确认。
// meta 记录唱片来源（名字/fnv/许可/出处）——分享物的法律干净度不容含糊。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { resolveParams } from '../engine/params.ts';
import { replayCore, loadVerdict, type TapeKind } from './replay.ts';
import { resolveSoundParams, buildTrack, degreeOf, type SoundParams, type TrackRow } from '../sound/index.ts';
import { buildEngine, seedOf, mulberry32 } from '../sound/graph.js';
import { OfflineCtx } from '../sound/offline.ts';
import { earAssets, earRecords, EAR_SR } from './ear.ts';
import { loadRecordsNode } from './records-node.ts';
import type { DerivedMoment } from '../engine/index.ts';

export interface CutSegment { role: string; t0: number; t1: number; speed: number }
export interface RenderCutsResult {
  pcm: Float32Array; sr: number;
  meta: {
    segments: number; durationSec: number; withRecord: boolean;
    records: { name: string; fnv: string; license: string; source: string }[];
  };
}

// probe.ts 同法的前景分类（此处只需映射既有类别；probe 侧仍是正典）
function soundClassOf(ev: DerivedMoment, resolveTimes: Set<number>, emitT: number): number | null {
  if (ev.special === 'STUCK_LOOP') return 7;
  if (ev.special === 'RESOLVE') return 6;
  if (ev.special === 'DONE') return 9;
  if (ev.special) return null;
  if (ev.verb === 'ASK') return 8;
  if (ev.outcome === 'FAIL') return 1;
  if (ev.outcome !== 'OK') return null;
  switch (ev.verb) {
    case 'WRITE': return 0;
    case 'READ': return 2;
    case 'RUN': return ev.tags.includes('test') && resolveTimes.has(emitT) ? null : 3;
    case 'SAVE': return 4;
    case 'SPAWN': return 5;
    default: return null;
  }
}

/** 接带音：种子化噪声"噗"（磁带接头过磁头）——低通包络脉冲 70ms，直接样本域生成。 */
function spliceBurst(sr: number, seedStr: string): Float32Array {
  const rng = mulberry32(seedOf('splice:' + seedStr));
  const n = Math.floor(sr * 0.07);
  const x = new Float32Array(n);
  let lp = 0;
  const a = Math.exp(-2 * Math.PI * 900 / sr); // ~900Hz 低通的"噗"体
  for (let i = 0; i < n; i++) {
    const env = Math.sin(Math.PI * (i / n)) ** 2 * (1 - i / n * 0.4);
    lp = a * lp + (1 - a) * (rng() * 2 - 1);
    x[i] = lp * env * 0.5;
  }
  return x;
}

export function renderCuts(
  segments: CutSegment[], tapeText: string, opts: { withRecord?: boolean; recordIndex?: number; kind?: TapeKind } = {},
): RenderCutsResult {
  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const soundRaw = JSON.parse(readFileSync(new URL('../sound-params.json', import.meta.url), 'utf8'));
  const sp: SoundParams = resolveSoundParams(soundRaw);
  const { verdict } = loadVerdict();
  const core = replayCore(tapeText, params, verdict.rain.floor);
  const { track, comp, t0 } = buildTrack(core.snaps);
  const durMs = track.length ? track[track.length - 1]![0]! : 0;

  // 原始相对 ms → 压缩轴 ms（probe.ts interp 同法）
  const origRel: number[] = new Array(core.snaps.length);
  for (let i = 0; i < core.snaps.length; i++) origRel[i] = core.snaps[i]!.t - t0;
  const interp = (x: number): number => {
    const last = core.snaps.length - 1;
    if (last < 0) return 0;
    if (x <= origRel[0]!) return comp[0]!;
    if (x >= origRel[last]!) return comp[last]!;
    let lo = 0, hi = last;
    while (lo < hi) { const md = (lo + hi) >> 1; if (origRel[md]! < x) lo = md + 1; else hi = md; }
    const i = Math.max(1, lo); const a = origRel[i - 1]!, b = origRel[i]!;
    const f = b > a ? (x - a) / (b - a) : 0;
    return comp[i - 1]! + f * (comp[i]! - comp[i - 1]!);
  };
  const resolveTimes = new Set(core.emitted.filter((e) => e.ev.special === 'RESOLVE').map((e) => e.emitT));
  const events = core.emitted
    .map((e) => ({ compMs: interp(e.emitT - t0), cls: soundClassOf(e.ev, resolveTimes, e.emitT), slot: e.ev.slot, T: 0.5 }))
    .filter((e) => e.cls !== null) as { compMs: number; cls: number; slot?: string; T: number }[];

  const withRecord = !!opts.withRecord;
  const records = withRecord ? earRecords() : null;
  const sr = EAR_SR;
  const chunks: Float32Array[] = [];
  const spliceSeedBase = segments.map((s) => `${s.role}:${s.t0}-${s.t1}`).join('|');

  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;
    const c0 = interp(seg.t0), c1 = interp(seg.t1);
    const isLast = si === segments.length - 1;
    const segAudioSec = Math.max(0.5, (c1 - c0) / 1000 / seg.speed);
    // 尾段多渲：正格终止（tape-stop/doneCadence）＋静默 ≥2s
    const tailSec = isLast ? (withRecord ? sp.record.tapeStopSec : 1.6) + 2.2 : 0;
    const ctx = new OfflineCtx(sr);
    const eng = buildEngine(ctx, sp, {
      repoKey: `dub:${core.d.meta.sourceHash}`, seed: `dub:${si}`,
      assets: earAssets(), records, recordIndex: opts.recordIndex || 0,
    });
    eng.startTransport(0.03, seg.speed, track, durMs, c0);
    eng.scheduleGridUntil(segAudioSec + tailSec + 0.2);
    for (const ev of events) {
      if (ev.compMs < c0 || ev.compMs >= c1) continue;
      const at = 0.03 + (ev.compMs - c0) / 1000 / seg.speed;
      eng.trigger(ev.cls, at, degreeOf(ev.slot, sp), ev.cls === 7 ? 2.5 : ev.T);
    }
    if (isLast) {
      const at9 = 0.03 + segAudioSec;
      eng.trigger(9, at9, 0, 0); // 正格终止：唱片在位=tape-stop 滑停；无唱片=doneCadence
      // 终止式落完即落总闸（停止即静默的结构保证）——预告片收尾=按停止键，
      // 不赌 CLOSE 段恰在带尾相位 DONE（手造/短带 cuts 同样真静默）
      eng.stop(at9 + (withRecord ? sp.record.tapeStopSec : 1.5) + 0.25);
    }
    chunks.push(ctx.render(segAudioSec + tailSec));
  }

  // 拼接：接带处 10ms 交叉淡化＋叠接带音
  const XF = Math.floor(sr * 0.01);
  let total = chunks.reduce((s, c) => s + c.length, 0) - XF * (chunks.length - 1);
  const pcm = new Float32Array(Math.max(total, 0));
  let w = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    if (i === 0) { pcm.set(c, 0); w = c.length; continue; }
    const start = w - XF;
    for (let k = 0; k < XF; k++) {
      const f = k / XF;
      pcm[start + k] = pcm[start + k]! * (1 - f) + c[k]! * f;
    }
    pcm.set(c.subarray(XF), w);
    w = start + c.length;
    const splice = spliceBurst(sr, `${spliceSeedBase}:${i}`);
    for (let k = 0; k < splice.length && start + k < pcm.length; k++) pcm[start + k] = Math.max(-1, Math.min(1, pcm[start + k]! + splice[k]!));
  }

  const catalog = loadRecordsNode().catalog;
  return {
    pcm, sr,
    meta: {
      segments: segments.length, durationSec: pcm.length / sr, withRecord,
      records: withRecord
        ? catalog.records.filter((_, i) => i === (opts.recordIndex || 0)).map((r) => ({ name: r.name, fnv: r.fnv, license: r.license, source: r.source }))
        : [],
    },
  };
}

/** PCM16 WAV 编码（mono）。 */
export function encodeWav(pcm: Float32Array, sr: number): Buffer {
  const n = pcm.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i]! * 32767))), 44 + i * 2);
  return buf;
}

export function runRenderCuts(argv: string[]): void {
  const pos = argv.filter((a) => !a.startsWith('--'));
  const tapePath = pos[0], cutsPath = pos[1];
  if (!tapePath || !cutsPath) {
    console.error('用法: node cli/index.ts render-cuts <tape.tape.jsonl> <cuts.json> [--with-record] [--record-index N] [--out dir]');
    console.error('  dub 授权卫生：默认音轨只含机器声＋foley＋接带音；--with-record 才含内置 CC0 唱片（meta 记来源）。');
    process.exit(2);
  }
  const cuts = JSON.parse(readFileSync(cutsPath!, 'utf8')) as { segments: CutSegment[] };
  const riIdx = argv.indexOf('--record-index');
  const res = renderCuts(cuts.segments, readFileSync(tapePath!, 'utf8'), {
    withRecord: argv.includes('--with-record'),
    recordIndex: riIdx >= 0 ? parseInt(argv[riIdx + 1] || '0') : 0,
  });
  const outIdx = argv.indexOf('--out');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1]! : join(process.cwd(), 'runs', `rendercuts-${basename(tapePath!).replace(/\..*$/, '')}-${ts}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'cuts-audio.wav'), encodeWav(res.pcm, res.sr));
  writeFileSync(join(outDir, 'cuts-audio.meta.json'), JSON.stringify(res.meta, null, 2) + '\n');
  console.log(`render-cuts：${res.meta.segments} 段 → ${res.meta.durationSec.toFixed(1)}s @${res.sr}Hz → ${outDir}/cuts-audio.wav`);
  console.log(`  唱片：${res.meta.withRecord ? res.meta.records.map((r) => `${r.name}(${r.license})`).join('、') : '不含（授权卫生默认）'}`);
}
