// 轨甲金测试：流式声桥（livebridge）——命门的机器代理回归门（DECREE-003 丁-轨甲）。
// 断言对象=离线渲染波形（OfflineCtx，与机器耳同一耳膜），不是账本（门规）。
// 大脑时钟可注入：这里用模拟钟喂"到达流"（20Hz 包＋时刻事件），一次性渲染后量 RMS/onset——
// live 通路首次获得与回放同级的确定性判据。人耳终审权仍在船长/审计庭（验收最高法）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { resolveSoundParams } from '../sound/index.ts';
import { buildEngine, type RecordClip } from '../sound/graph.js';
import { createLiveBridge, type LivePacket } from '../sound/livebridge.js';
import { OfflineCtx, rmsDb } from '../sound/offline.ts';
import { EAR_SR } from '../cli/ear.ts';

const here = dirname(fileURLToPath(import.meta.url));
const sp = resolveSoundParams(JSON.parse(readFileSync(join(here, '..', 'sound-params.json'), 'utf8')));

const pkt = (o: Partial<LivePacket> = {}): LivePacket => ({
  needle: 0.4, T: 0.5, A: 0.6, wow: 0.2, phase: 'WORKING', weather: 'CLEAR', pendingAsk: false, ...o,
});

/** 模拟到达流工装：sim 钟 + 桥；feeder 在 [0,durSec) 每 stepSec 喂一包（状态可逐步覆写）。 */
function rig(records: RecordClip[] | null = null) {
  const ctx = new OfflineCtx(EAR_SR);
  const eng = buildEngine(ctx, sp, { repoKey: 'golden:live', seed: 'golden', records: records ?? undefined });
  let simT = 0;
  const bridge = createLiveBridge(eng, sp, { clock: () => simT });
  return {
    ctx, eng, bridge,
    at(t: number) { simT = t; },
    feed(fromSec: number, toSec: number, stepSec: number, state: Partial<LivePacket> = {}) {
      const steps = Math.round((toSec - fromSec) / stepSec); // 整数步进：浮点累加会在长跑里掉包
      for (let i = 0; i < steps; i++) { simT = fromSec + i * stepSec; bridge.onPacket(pkt(state)); }
    },
  };
}

/** 波形 onset：[fromSec,toSec] 内首个 |x|>thr 的时刻（秒）；无则 -1。 */
function onsetAt(x: Float32Array, sr: number, fromSec: number, toSec: number, thr: number): number {
  const a = Math.floor(fromSec * sr), b = Math.min(Math.ceil(toSec * sr), x.length);
  for (let i = a; i < b; i++) if (Math.abs(x[i]!) > thr) return i / sr;
  return -1;
}

test('LIVE-1 命门：流式包喂 60s，master 全程有声（第一分钟＋长程两窗 RMS 超阈；资产缺席=合成退路）', () => {
  const r = rig();
  // 20Hz WORKING 流 60s；每 5s 一记 WRITE-OK（习惯化有地板，永不沉死）
  for (let i = 0; i < 1200; i++) {
    const t = 0.05 + i * 0.05;
    r.at(t); r.bridge.onPacket(pkt());
    if (i > 0 && i % 100 === 0) r.bridge.onMoment({ t: t * 1000, verb: 'WRITE', outcome: 'OK', tags: [], slot: 'abc123' });
  }
  const wav = r.ctx.render(60);
  const early = rmsDb(wav, EAR_SR, 2, 10);
  const late = rmsDb(wav, EAR_SR, 45, 58);
  assert.ok(early > -40, `第一分钟窗 [2,10] 应有声（房间层），实测 ${early.toFixed(1)} dBFS`);
  assert.ok(late > -40, `长程窗 [45,58] 应仍有声（前瞻窗由包流持续再武装），实测 ${late.toFixed(1)} dBFS`);
  const s = r.bridge.stats();
  assert.equal(s.packets, 1200, '20Hz×60s 包帐');
  assert.ok(s.rows <= 8192, '行帐有界');
});

test('LIVE-2 两条通道：乐音级量化到下一网格（宁迟勿早）；呼唤级 ASK 直通不量化', () => {
  const r = rig();
  // 只留前景：床全 mute（隔离板既有法），裸听 pluck/motif 的 onset
  for (const m of ['l1', 'crackle', 'l2', 's2', 's3', 'hiss'] as const) r.eng.setMute(m, true);
  r.feed(0.05, 22, 0.1);
  // WRITE-OK 到达 sim 10.05（fire at 10.07）：网格 0.4167s、锚 audio0=0.12 → 量化落 10.12
  r.at(10.05); r.bridge.onMoment({ t: 10050, verb: 'WRITE', outcome: 'OK', tags: [], slot: 'deadbeef' });
  // ASK 到达 sim 20.30：呼唤级直通（下一网格线在 20.537——onset 必须早于它）
  r.at(20.30); r.bridge.onMoment({ t: 20300, verb: 'ASK', outcome: 'NA', tags: [] });
  r.at(21.9); r.bridge.pump();
  const wav = r.ctx.render(22);
  const grid = 60 / sp.bpm / 2; // 0.41667s
  const audio0 = r.bridge.stats().audio0;
  const q = audio0 + Math.ceil((10.07 - audio0) / grid - 1e-9) * grid;
  const pluckOn = onsetAt(wav, EAR_SR, 9.5, 11.5, 0.004);
  assert.ok(pluckOn >= 10.07, `宁迟勿早：pluck onset ${pluckOn.toFixed(3)} 不得早于到达 10.07`);
  assert.ok(Math.abs(pluckOn - q) < 0.02, `pluck 应落网格线 ${q.toFixed(3)}，实测 ${pluckOn.toFixed(3)}`);
  const askOn = onsetAt(wav, EAR_SR, 20.0, 21.5, 0.004);
  assert.ok(askOn >= 20.31 && askOn < 20.45, `ASK 直通应即刻出声（20.32 起），实测 ${askOn.toFixed(3)}`);
  assert.ok(askOn < audio0 + Math.ceil((20.32 - audio0) / grid) * grid - 0.05, 'ASK 不得被量化推到网格线');
});

test('LIVE-3 唱片全程：热装即上桥；DONE 滑停真静默；非 DONE 相到达=复活重落针', () => {
  // 合成测试唱片：220Hz 正弦 3s（lufs 记 targetLufs——定标增益=1，波形裸可辨）
  const n = EAR_SR * 3, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / EAR_SR);
  const clip: RecordClip = { name: 'test-tone', title: 'Test Tone', x, sr: EAR_SR, lufs: sp.record.targetLufs, seconds: 3 };
  const r = rig([clip]);
  // 只留唱片路：床与前景全 mute——静默/复活的断言不被房间层污染
  for (const m of ['l1', 'crackle', 'l2', 's2', 's3', 'hiss', 'fg'] as const) r.eng.setMute(m, true);
  r.feed(0.05, 12, 0.1);                                 // WORKING：唱片在放
  r.at(12.0); r.bridge.onMoment({ t: 12000, special: 'DONE' }); // DONE：tape-stop（滑停 1.6s 后源硬停）
  r.feed(12.1, 18, 0.1, { phase: 'DONE' });
  r.feed(18.0, 26, 0.1);                                 // 新一章开工：WORKING 到达应复活唱片
  const wav = r.ctx.render(26);
  const playing = rmsDb(wav, EAR_SR, 5, 10);
  const stopped = rmsDb(wav, EAR_SR, 15.5, 17.5);
  const revived = rmsDb(wav, EAR_SR, 21, 25);
  assert.ok(playing > -30, `唱片应在放，实测 ${playing.toFixed(1)} dBFS`);
  assert.ok(stopped < -70, `DONE 滑停后应真静默，实测 ${stopped.toFixed(1)} dBFS`);
  assert.ok(revived > -30, `复活后唱片应重新出声，实测 ${revived.toFixed(1)} dBFS`);
  const ri = r.eng.recordInfo;
  assert.ok(ri && !ri.tapeStopped, '复活后 tapeStopped 应复位');
  assert.equal(ri!.name, 'test-tone');
});

test('LIVE-4 前景让位律：test 型 RUN-OK 与同刻 RESOLVE 双发只响和弦（两种到达序皆然）', () => {
  const r = rig();
  r.at(1.0); r.bridge.onPacket(pkt());
  // 序 A：RUN 先到（押后窗）→ RESOLVE 到 → 铃让位
  r.at(1.1); r.bridge.onMoment({ t: 500, verb: 'RUN', outcome: 'OK', tags: ['test'] });
  assert.equal(r.bridge.stats().fired, 0, 'test 型 RUN-OK 应押后候和弦');
  r.at(1.15); r.bridge.onMoment({ t: 500, special: 'RESOLVE' });
  assert.equal(r.bridge.stats().fired, 1, '和弦即发');
  r.at(2.0); r.bridge.pump();
  assert.equal(r.bridge.stats().fired, 1, '被让位的铃不得复鸣');
  // 序 B：RESOLVE 先到 → 同刻 RUN 即弃
  r.at(3.0); r.bridge.onMoment({ t: 700, special: 'RESOLVE' });
  r.at(3.02); r.bridge.onMoment({ t: 700, verb: 'RUN', outcome: 'OK', tags: ['test'] });
  r.at(4.0); r.bridge.pump();
  assert.equal(r.bridge.stats().fired, 2, 'RESOLVE 先到：同刻 test-RUN 无声');
  // 非 test RUN 不受让位律
  r.at(5.0); r.bridge.onMoment({ t: 900, verb: 'RUN', outcome: 'OK', tags: ['build'] });
  assert.equal(r.bridge.stats().fired, 3);
  assert.equal(r.bridge.stats().held, 0, '押后帐清空');
});

test('LIVE-5 行帐有界：长跑 450s（9000 包）修剪在 [KEEP, CAP] 窗内', () => {
  const r = rig();
  r.feed(0, 450, 0.05);
  const s = r.bridge.stats();
  assert.equal(s.packets, 9000);
  assert.ok(s.rows <= 8192 && s.rows >= 4096, `行帐应被修剪（4096≤rows≤8192），实测 ${s.rows}`);
});
