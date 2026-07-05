// cli probe <tape.tape.jsonl> [--out dir] [--kind ...] [--anon 标签] —— v1 声音相探针页（M1.9 §1.4）。
// 回放蒸馏带 → 自包含 probe.html：针 + 曲线 + **床（连续层）** + **前景（离散层）**。
// 白皮书落点：
//   床 = 四 stem（S1 基底 / S2 律动 A 门控 / S3 张力 T 门控 / S4 磁带总线 filter+hiss+wow+shelf）；
//   前景 = §3.1 词汇表（乐音 5 + 呼唤 3 + DONE-静默）；习惯化 ×0.85^(n−1) 沉床不消失（呼唤豁免）；
//   乐音量化 1/8 @72BPM 宁迟勿早；呼唤直通；参数更新对齐 1/8 拍网格；一切连续参数过 slew。
//   映射律唯一事实源 = sound/ 纯核 + sound-params.json（与 cli/ear.ts 验收同源；页内嵌其 JSON 与哈希）。
//   ?tuner=1 调音抽屉（仅 dev）：边听边拧，哈希实时重算（治理锚）。
// 禁令照旧：无网络、自包含、无导出分享；视觉保持素面（美学归 Track-STAGE 琥珀舞台）。
// 现实修正（记 FEEDBACK）：repoKey=hash(repo) 在蒸馏带不可得（隐私膜抹 cwd）→ replay 侧以 sourceHash 代；
//   live 侧可用项目目录名（接线待 live-probe 相）。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename, relative } from 'node:path';
import { resolveParams, hashParams, hashJson } from '../engine/params.ts';
import { replayCore, loadVerdict, type TapeKind } from './replay.ts';
import { resolveSoundParams, degreeOf } from '../sound/index.ts';
import type { DerivedMoment } from '../engine/index.ts';

// 前景类别（页内以索引编码）：0 pluckOk / 1 pluckFail / 2 page / 3 bell / 4 save / 5 spawn
//                              / 6 resolve / 7 stuck / 8 ask / 9 done。呼唤级 = 6/7/8；9 走床终止式。
function soundClass(ev: DerivedMoment, resolveTimes: Set<number>, emitT: number): number | null {
  if (ev.special === 'STUCK_LOOP') return 7;
  if (ev.special === 'RESOLVE') return 6;
  if (ev.special === 'DONE') return 9;
  if (ev.special) return null;                 // SESSION_START/ASK_CLEARED/STUCK_CLEARED(expiry 沉默；ok 型由 RESOLVE 发声)
  if (ev.verb === 'ASK') return 8;             // askOpen（outcome NA）——半终止动机
  if (ev.outcome === 'FAIL') return 1;         // 低音区闷拨弦（音区分裂承载信息，盲听证明）
  if (ev.outcome !== 'OK') return null;
  switch (ev.verb) {
    case 'WRITE': return 0;                    // 拨弦：targetHash 选音（文件的主题曲）
    case 'READ': return 2;                     // 纸页翻动（最先被习惯化沉床）
    case 'RUN':                                // 打字机回车铃；test 触发 RESOLVE 时让位给和弦
      return ev.tags.includes('test') && resolveTimes.has(emitT) ? null : 3;
    case 'SAVE': return 4;                     // 卡座咔哒＋低音锚（和弦另由 RESOLVE 发）
    case 'SPAWN': return 5;                    // 新声部淡入一小节
    default: return null;                      // OTHER：词汇预算外，无声
  }
}

export function runProbe(argv: string[]): void {
  const tapePath = argv.filter((a) => !a.startsWith('--'))[0];
  if (!tapePath) {
    console.error('用法: node cli/index.ts probe <tape.tape.jsonl> [--out runs/probe-<ts>/] [--kind ...] [--anon 标签]');
    console.error('  回放磁带 → 自包含 probe.html（针+曲线+床+前景）。?tuner=1 开调音抽屉。');
    process.exit(2);
    return;
  }
  const kindIdx = argv.indexOf('--kind');
  const kind = (kindIdx >= 0 ? argv[kindIdx + 1] : undefined) as TapeKind | undefined;
  const outIdx = argv.indexOf('--out');
  const anonIdx = argv.indexOf('--anon');
  const anonLabel = anonIdx >= 0 ? argv[anonIdx + 1] : undefined; // 盲听匿名：清带名/卷号/日期/统计

  const paramsRaw = JSON.parse(readFileSync(new URL('../params.json', import.meta.url), 'utf8'));
  const params = resolveParams(paramsRaw);
  const soundRaw = JSON.parse(readFileSync(new URL('../sound-params.json', import.meta.url), 'utf8'));
  const sp = resolveSoundParams(soundRaw);
  const soundHash = hashJson(soundRaw);
  const { verdict, hash: verdictHash } = loadVerdict();
  const core = replayCore(readFileSync(tapePath, 'utf8'), params, verdict.rain.floor);

  const snaps = core.snaps;
  const t0 = snaps.length ? snaps[0]!.t : 0;
  const WEATHER = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM'];
  const PHASE = ['IDLE', 'WORKING', 'WAITING', 'DONE'];

  // 压缩时间轴：大空档压到 ≤GAP_CAP（探针不播死寂）；声音与状态同映射对齐
  const GAP_CAP = 1500;
  const origRel: number[] = new Array(snaps.length);
  const comp: number[] = new Array(snaps.length);
  for (let i = 0; i < snaps.length; i++) {
    origRel[i] = snaps[i]!.t - t0;
    comp[i] = i === 0 ? 0 : comp[i - 1]! + Math.min(snaps[i]!.t - snaps[i - 1]!.t, GAP_CAP);
  }
  const interp = (x: number): number => {
    if (snaps.length === 0) return 0;
    const last = snaps.length - 1;
    if (x <= origRel[0]!) return comp[0]!;
    if (x >= origRel[last]!) return comp[last]!;
    let lo = 0, hi = last;
    while (lo < hi) { const md = (lo + hi) >> 1; if (origRel[md]! < x) lo = md + 1; else hi = md; }
    const i = Math.max(1, lo); const a = origRel[i - 1]!, b = origRel[i]!;
    const f = b > a ? (x - a) / (b - a) : 0;
    return comp[i - 1]! + f * (comp[i]! - comp[i - 1]!);
  };

  // 状态轨迹（压缩轴；抽稀 ≤12000 点）：[comp, needle, T, A, wx, ph, wow, ask]
  const stride = Math.max(1, Math.ceil(snaps.length / 12000));
  const track: number[][] = [];
  const pushSnap = (i: number): void => {
    const s = snaps[i]!;
    track.push([Math.round(comp[i]!), r3(s.needle), r3(s.T), r3(s.A),
      WEATHER.indexOf(s.weather), PHASE.indexOf(s.phase), r3(s.wow), s.pendingAsk ? 1 : 0]);
  };
  for (let i = 0; i < snaps.length; i += stride) pushSnap(i);
  if (snaps.length && (snaps.length - 1) % stride !== 0) pushSnap(snaps.length - 1);

  const Tat = (t: number): number => {
    let lo = 0, hi = snaps.length - 1, best = 0;
    while (lo <= hi) { const md = (lo + hi) >> 1; if (snaps[md]!.t <= t) { best = md; lo = md + 1; } else hi = md - 1; }
    return snaps.length ? snaps[best]!.T : 0;
  };

  // 声音事件：[comp, cls, degree, vel]。degree=slot 选音；vel=当刻 T（力度/亮度 ∝ T，F1）
  const resolveTimes = new Set(core.emitted.filter((e) => e.ev.special === 'RESOLVE').map((e) => e.emitT));
  const sounds: number[][] = [];
  for (const e of core.emitted) {
    const cls = soundClass(e.ev, resolveTimes, e.emitT);
    if (cls === null) continue;
    sounds.push([Math.round(interp(e.emitT - t0)), cls, degreeOf(e.ev.slot, sp), r3(Tat(e.emitT))]);
  }
  sounds.sort((a, b) => a[0]! - b[0]!);

  const durationMs = track.length ? track[track.length - 1]![0]! : 0;
  const anon = !!anonLabel;
  const repoKey = anon ? anonLabel! : core.d.meta.sourceHash; // 每仓库一调的 replay 近似（见文件头现实修正）
  const data = anon
    ? { tape: anonLabel, kind: '', engineSha: '—', paramsHash: '—', verdictHash: '—', soundHash,
        buildTs: new Date().toISOString().slice(0, 16).replace('T', ' '),
        anon: true, durationMs, peakT: 0, stuck: 0, resolves: 0, repoKey, track, sounds }
    : { tape: basename(tapePath), kind: kind ?? '', engineSha: gitSha(), paramsHash: hashParams(paramsRaw),
        verdictHash, soundHash, buildTs: new Date().toISOString().slice(0, 16).replace('T', ' '),
        anon: false, durationMs, peakT: core.metrics.peakT,
        stuck: core.metrics.stuckEdges, resolves: core.metrics.resolves, repoKey, track, sounds };

  const html = buildProbeHtml(data, soundRaw);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const tapeBase = basename(tapePath).replace(/\.tape\.jsonl$/, '').replace(/\.jsonl$/, ''); // M2.0 §1.2 命名规约
  const outDir = outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1]! : join(process.cwd(), 'runs', `probe-${tapeBase}-${ts}`);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'probe.html');
  writeFileSync(outFile, html, 'utf8');
  // EAR-3：固定路径镜像——船长永远只开这一个地址，旧时间戳目录不再进 open 肌肉记忆
  const latestDir = join(process.cwd(), 'runs', 'probe-latest');
  mkdirSync(latestDir, { recursive: true });
  writeFileSync(join(latestDir, 'probe.html'), html, 'utf8');
  const cnt = (c: number): number => sounds.filter((s) => s[1] === c).length;
  process.stderr.write(
    `探针 v1声音相 ${basename(tapePath)}${kind ? `（${kind}）` : ''} → ${relative(process.cwd(), outFile)}\n` +
    `  固定入口：runs/probe-latest/probe.html（旧标签页会被新页自动静音接管）\n` +
    `  sound-params ${soundHash}｜轨迹 ${track.length} 点｜前景 ${sounds.length}` +
    `（拨弦${cnt(0)}/闷弦${cnt(1)}/纸页${cnt(2)}/铃${cnt(3)}/卡座${cnt(4)}/声部${cnt(5)}｜和弦${cnt(6)}/跳针${cnt(7)}/ASK${cnt(8)}｜DONE${cnt(9)}）\n` +
    `  浏览器打开 probe.html 点『▶』（用户手势解锁音频）。?tuner=1 开调音抽屉。自包含、零网络。\n`,
  );
}

function r3(n: number): number { return Math.round(n * 1000) / 1000; }
function gitSha(): string { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return 'nogit'; } }

// ---------- probe.html（自包含：内联 CSS/JS + 内嵌数据/声参；无外部 URL） ----------

function buildProbeHtml(data: unknown, soundRaw: unknown): string {
  const json = JSON.stringify(data);
  const spJson = JSON.stringify(soundRaw);
  return `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TAPE-0 探针 · ${(data as { tape: string }).tape}</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#0b0b0c;color:#c9c9cc;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
  header{padding:10px 14px;border-bottom:1px solid #222;display:flex;gap:14px;align-items:baseline;flex-wrap:wrap}
  header b{color:#e8e8ea} .muted{color:#6b6b70}
  .wrap{display:flex;flex-wrap:wrap;gap:16px;padding:16px}
  canvas{background:#111214;border:1px solid #222;border-radius:4px;max-width:100%}
  .ctl{display:flex;gap:10px;align-items:center;padding:0 16px 16px;flex-wrap:wrap}
  button{font:inherit;background:#1a1b1e;color:#d6d6d9;border:1px solid #333;border-radius:4px;padding:6px 12px;cursor:pointer}
  button:hover{border-color:#555} input[type=range]{width:140px}
  #tuner{display:none;border-top:1px solid #222;padding:12px 16px;columns:3;column-gap:24px}
  #tuner label{display:flex;gap:8px;align-items:center;break-inside:avoid;margin:2px 0}
  #tuner label span.k{width:150px;color:#9a9aa0} #tuner input[type=range]{width:110px}
  #tuner .v{width:56px;text-align:right;color:#e8e8ea}
  #tunerHead{padding:8px 16px;border-top:1px solid #222;color:#e0b050;display:none}
</style></head><body>
<header>
  <b>TAPE-0 探针 · v1 声音相</b>
  <span class="muted">tape</span> <span id="mTape"></span>
  <span class="muted">engine</span> <span id="mEng"></span>
  <span class="muted">params</span> <span id="mPar"></span>
  <span class="muted">verdict</span> <span id="mVer"></span>
  <span class="muted">sound</span> <span id="mSnd"></span>
  <span class="muted">build</span> <span id="mBuild"></span>
  <span class="badge" id="mState">■ 未播放</span>
</header>
<div class="wrap">
  <canvas id="needle" width="260" height="260"></canvas>
  <canvas id="curve" width="720" height="260"></canvas>
</div>
<div class="ctl">
  <button id="play">▶ 播放</button>
  <button id="stop">■ 停</button>
  <span class="muted">速度</span><input id="speed" type="range" min="1" max="60" value="12"><span id="speedV">12×</span>
  <span class="muted">｜进度</span><span id="prog">0s</span>
  <span class="muted">｜天气</span><span id="wx">CLEAR</span>
  <span class="muted">｜床</span><span id="bed">—</span>
  <span class="muted">｜词汇：拨弦=改动(槽选音) 闷弦=失败 纸页=读 铃=跑 卡座=存 ｜呼唤：和弦=解决 跳针=卡碟 动机=ASK ｜DONE=静默</span>
</div>
<div id="tunerHead">调音抽屉（dev）—— sound-params 实时哈希：<span id="tHash"></span> <button id="tCopy">复制 JSON</button></div>
<div id="tuner"></div>
<script id="d" type="application/json">${json}</script>
<script id="sp" type="application/json">${spJson}</script>
<script>
"use strict";
const D = JSON.parse(document.getElementById('d').textContent);
let SP = JSON.parse(document.getElementById('sp').textContent);
document.getElementById('mTape').textContent = D.tape + (D.kind?(' ('+D.kind+')'):'');
document.getElementById('mEng').textContent = D.engineSha;
document.getElementById('mPar').textContent = D.paramsHash;
document.getElementById('mVer').textContent = D.verdictHash;
document.getElementById('mSnd').textContent = D.soundHash;
document.getElementById('mBuild').textContent = D.buildTs;

const WX=['CLEAR','OVERCAST','RAIN','STORM'];
const WXC=['#2a6','#7a3','#59c','#c53'];
const nc=document.getElementById('needle'), ncx=nc.getContext('2d');
const cc=document.getElementById('curve'), ccx=cc.getContext('2d');
const track=D.track, sounds=D.sounds, dur=D.durationMs;

// ===== 纯核同源律（与 sound/index.ts 一致；tuner 拧 SP 即拧此处） =====
const clamp01=x=>x<0?0:x>1?1:x, dbLin=db=>Math.pow(10,db/20);
function bedTargets(T,A,wow,ph,ask){ const b=SP.bed;
  T=clamp01(T);A=clamp01(A);wow=clamp01(wow);
  const idle=ph===0, silence=ph===3;
  const trim=dbLin(b.trimDb); // 床总闸（EAR-1）：与 sound/ 纯核同律
  const s2gate=clamp01((A-b.s2GateA)/(1-b.s2GateA)), s3gate=clamp01((T-b.s3GateT)/(1-b.s3GateT));
  return { s1: trim*(silence?0:(idle?b.s1IdleGain:b.s1Gain)),
    s2: trim*((silence||idle)?0:b.s2Gain*s2gate), s3: trim*(silence?0:b.s3Gain*s3gate),
    hiss: trim*(silence?0:dbLin(b.hissDbLo+(b.hissDbHi-b.hissDbLo)*T)),
    fHz: b.filterHzHi+(b.filterHzLo-b.filterHzHi)*T,
    shelfDb: b.hfShelfDbLo+(b.hfShelfDbHi-b.hfShelfDbLo)*T,
    wowCents: b.wowCentsLo+(b.wowCentsHi-b.wowCentsLo)*wow,
    susProb: T, density: b.s2DensityLo+(b.s2DensityHi-b.s2DensityLo)*A,
    hover: !!ask, silence };
}
function habGain(n){ if(n<=1)return 1; return Math.max(SP.foreground.habituationFloorRatio, Math.pow(SP.foreground.habituationFactor,n-1)); }
function rootMidiOf(key){ let h=0; for(let i=0;i<key.length;i++) h=((h<<5)-h+key.charCodeAt(i))|0; return SP.scale.rootMidiBase+(Math.abs(h)%SP.scale.rootMidiSpan); }
const midiHz=m=>440*Math.pow(2,(m-69)/12);
function degHz(deg,oct){ return midiHz(ROOT+SP.scale.pentatonic[deg%SP.scale.pentatonic.length]+12*oct); }
function askHz(){ let hz=degHz(4,3); while(hz<SP.call.askBandHzLo)hz*=2; while(hz>SP.call.askBandHzHi)hz/=2; return Math.max(hz,SP.call.askBandHzLo); }
const ROOT=rootMidiOf(D.repoKey);
const beat=()=>60/SP.bpm, grid=()=>beat()/2, bar=()=>beat()*4;

// hashJson 同源（stableStringify 排序、_ 键剔除 + FNV-1a）——治理锚
function stableStr(v){ if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stableStr).join(',')+']';
  const ks=Object.keys(v).filter(k=>!k.startsWith('_')).sort();
  return '{'+ks.map(k=>JSON.stringify(k)+':'+stableStr(v[k])).join(',')+'}'; }
function hashJson(o){ const s=stableStr(o); let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0; }
  return h.toString(16).padStart(8,'0'); }

// ===== 音频图 =====
let ac=null, G={};
function ensureAudio(){ if(ac) { if(ac.state==='suspended') ac.resume(); return; }
  ac=new (window.AudioContext||window.webkitAudioContext)();
  // S4 磁带总线：wow(调制延迟) → 低通 → 高频搁架 → 总闸 → 出
  G.master=ac.createGain(); G.master.gain.value=0.9;
  G.shelf=ac.createBiquadFilter(); G.shelf.type='highshelf'; G.shelf.frequency.value=4500;
  G.lp=ac.createBiquadFilter(); G.lp.type='lowpass'; G.lp.frequency.value=SP.bed.filterHzHi; G.lp.Q.value=0.4;
  G.wowDelay=ac.createDelay(0.1); G.wowDelay.delayTime.value=0.03;
  G.wowLfo1=ac.createOscillator(); G.wowLfo1.frequency.value=0.9;   // 互质双 LFO：走带不稳不精确重复
  G.wowLfo2=ac.createOscillator(); G.wowLfo2.frequency.value=1.31;
  // EAR-2 修：GainNode 默认增益=1.0——LFO 曾以满幅(±1s!)疯狂调制延迟线，
  // 整个床被搅成"机器故障声"。调制深度必须从 0 起，由 applyBed 按 wowCents 给。
  G.wowAmt1=ac.createGain(); G.wowAmt1.gain.value=0;
  G.wowAmt2=ac.createGain(); G.wowAmt2.gain.value=0;
  G.wowLfo1.connect(G.wowAmt1); G.wowAmt1.connect(G.wowDelay.delayTime);
  G.wowLfo2.connect(G.wowAmt2); G.wowAmt2.connect(G.wowDelay.delayTime);
  G.wowLfo1.start(); G.wowLfo2.start();
  G.bedBus=ac.createGain();      // 床（受呼唤前置微静默 duck）
  G.fgBus=ac.createGain();       // 前景
  G.bedBus.connect(G.wowDelay); G.wowDelay.connect(G.lp);
  G.fgBus.connect(G.lp);         // 前景同过磁带总线（同一台机器出的声）
  G.lp.connect(G.shelf); G.shelf.connect(G.master); G.master.connect(ac.destination);
  // S1 基底：暖 pad。EAR-3 移调：主能量上移到 ROOT/ROOT+12（约 110–420Hz）——
  // 笔记本扬声器 ~200Hz 以下陡衰，pad 写在 55–110Hz 时"背景音乐"物理上不可闻，床只剩 hiss。
  G.s1=ac.createGain(); G.s1.gain.value=0; G.s1.connect(G.bedBus);
  const padF=ac.createBiquadFilter(); padF.type='lowpass'; padF.frequency.value=1200; padF.connect(G.s1);
  const o1=ac.createOscillator(),o2=ac.createOscillator(),o1g=ac.createGain(),o2g=ac.createGain();
  o1.type='triangle'; o2.type='triangle';
  o1.frequency.value=midiHz(ROOT); o2.frequency.value=midiHz(ROOT+12)*1.002;
  o1g.gain.value=0.8; o2g.gain.value=0.5;
  o1.connect(o1g); o1g.connect(padF); o2.connect(o2g); o2g.connect(padF); o1.start(); o2.start();
  const b1=ac.createOscillator(),bg1=ac.createGain(),b2=ac.createOscillator(),bg2=ac.createGain();
  b1.frequency.value=1/7.3; b2.frequency.value=1/11.9;                 // Eno 互质
  bg1.gain.value=0.15; bg2.gain.value=0.1;
  b1.connect(bg1); bg1.connect(G.s1.gain); b2.connect(bg2); bg2.connect(G.s1.gain);
  b1.start(); b2.start();
  // EAR-2 修：房间噪从 0 起、进 applyBed 统一管（曾绕过 trimDb 总闸——船长拖总闸无效的元凶之一）
  G.room=noiseSrc(); G.roomG=ac.createGain(); G.roomG.gain.value=0;
  const roomF=ac.createBiquadFilter(); roomF.type='lowpass'; roomF.frequency.value=400;
  G.room.connect(roomF); roomF.connect(G.roomG); G.roomG.connect(G.bedBus);
  // S3 张力弦（EAR-1：triangle 主体压蜂鸣；EAR-3：加 ROOT+12 高声部——张力在笔记本喇叭上也要可闻，
  // 暗色靠滤波保持，不靠把音写进听不见的频段）
  G.s3=ac.createGain(); G.s3.gain.value=0; G.s3.connect(G.bedBus);
  G.s3F=ac.createBiquadFilter(); G.s3F.type='lowpass'; G.s3F.frequency.value=900; G.s3F.Q.value=0.3; G.s3F.connect(G.s3);
  G.v1=ac.createOscillator(); G.v1.type='triangle'; G.v1g=ac.createGain(); G.v1g.gain.value=0.6;
  G.v2=ac.createOscillator(); G.v2.type='triangle'; G.v2g=ac.createGain(); G.v2g.gain.value=0.42;
  const vHi=ac.createOscillator(); vHi.type='triangle'; const vHiG=ac.createGain(); vHiG.gain.value=0.3;
  const vSaw=ac.createOscillator(); vSaw.type='sawtooth'; const vSawG=ac.createGain(); vSawG.gain.value=0.08;
  G.v1.frequency.value=midiHz(ROOT); G.v2.frequency.value=midiHz(ROOT+7); vHi.frequency.value=midiHz(ROOT+12)*0.999; vSaw.frequency.value=midiHz(ROOT)*0.999;
  G.v1.connect(G.v1g); G.v1g.connect(G.s3F); G.v2.connect(G.v2g); G.v2g.connect(G.s3F);
  vHi.connect(vHiG); vHiG.connect(G.s3F); vSaw.connect(vSawG); vSawG.connect(G.s3F);
  G.v1.start(); G.v2.start(); vHi.start(); vSaw.start();
  // S4 hiss（EAR-1 修：裸白噪高通=排气声 → 带限 2.2k–7.5k + 缓 Q，磁带底噪的柔和高频滚降）
  G.hiss=noiseSrc(); G.hissG=ac.createGain(); G.hissG.gain.value=0;
  const hf=ac.createBiquadFilter(); hf.type='highpass'; hf.frequency.value=2200; hf.Q.value=0.5;
  const hlp=ac.createBiquadFilter(); hlp.type='lowpass'; hlp.frequency.value=7500; hlp.Q.value=0.4;
  G.hiss.connect(hf); hf.connect(hlp); hlp.connect(G.hissG); G.hissG.connect(G.bedBus);
  // S2 律动增益（事件由调度器触发）
  G.s2=ac.createGain(); G.s2.gain.value=0; G.s2.connect(G.bedBus);
}
function noiseSrc(){ const n=ac.sampleRate*2, b=ac.createBuffer(1,n,ac.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=Math.random()*2-1;
  const s=ac.createBufferSource(); s.buffer=b; s.loop=true; s.start(); return s; }

// ---- 床参数施加（slew：setTargetAtTime；调用对齐 1/8 网格） ----
let lastPh=-1, doneSilentUntil=-1, wxLatch=0;
function applyBed(bt,at,imm){ const fast=SP.bed.slewMsFast/1000, slow=SP.bed.slewMsSlow/1000;
  // imm=true（起播首拍）：立即就位，不从上一次残留态滑过来（EAR-2）
  const set=(param,v,tc)=>{ if(imm){ param.cancelScheduledValues(at); param.setValueAtTime(v,at); } else param.setTargetAtTime(v,at,tc); };
  set(G.s1.gain,bt.s1,slow);
  set(G.s2.gain,bt.s2,fast);
  set(G.s3.gain,bt.s3,fast);
  set(G.hissG.gain,bt.hiss,slow);
  // 房间噪归队（EAR-2）：吃 trim、吃 DONE 静默、随天气档微调——与 stem 同一纪律
  const room=(0.002+0.0015*wxLatch)*dbLin(SP.bed.trimDb)*(bt.silence?0:1);
  set(G.roomG.gain,room,slow);
  set(G.lp.frequency,bt.fHz,slow);
  set(G.shelf.gain,bt.shelfDb,slow);
  const wowAmt=0.03*(Math.pow(2,bt.wowCents/1200)-1);
  set(G.wowAmt1.gain,wowAmt*0.7,slow);
  set(G.wowAmt2.gain,wowAmt*0.4,slow);
  // WAITING 悬停：属方向延音（半终止；整张床替琥珀管呼吸）
  const f1=bt.hover?midiHz(ROOT+7):midiHz(ROOT), f2=bt.hover?midiHz(ROOT+14):midiHz(ROOT+7);
  set(G.v1.frequency,f1,fast); set(G.v2.frequency,f2,fast);
}

// ---- 前景合成（力度/亮度 ∝ vel=当刻 T，F1） ----
function envG(at,peak,att,dec){ const g=ac.createGain(); g.connect(G.fgBus);
  g.gain.setValueAtTime(0.0001,at); g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0012),at+att);
  g.gain.exponentialRampToValueAtTime(0.0001,at+att+dec); return g; }
function pluck(at,deg,vel,fail,hab){ const o=ac.createOscillator(); o.type='triangle';
  o.frequency.value=degHz(deg, fail?0:2);
  const f=ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=fail?700:(900+3600*vel);
  const peak=(fail?SP.foreground.failGain:SP.foreground.peakGain*(0.55+0.45*vel))*hab;
  const g=envG(at,peak,0.006,fail?0.22:0.16); o.connect(f); f.connect(g); o.start(at); o.stop(at+0.4); }
function page(at,hab){ const n=noiseBurst(at,0.07); const f=ac.createBiquadFilter(); f.type='bandpass'; f.frequency.value=650; f.Q.value=0.8;
  n.connect(f); f.connect(envG(at,SP.foreground.pageGain*hab,0.01,0.06)); }
function bell(at,vel,hab){ [1240,1860].forEach((fr,i)=>{ const o=ac.createOscillator(); o.type='sine'; o.frequency.value=fr;
  o.connect(envG(at,SP.foreground.bellGain*(0.6+0.4*vel)*hab*(i?0.5:1),0.004,0.35)); o.start(at); o.stop(at+0.4); }); }
function saveClick(at,hab){ noiseBurst(at,0.02).connect(envG(at,SP.foreground.saveGain*hab,0.002,0.03));
  const o=ac.createOscillator(); o.type='sine'; o.frequency.value=midiHz(ROOT-12);
  o.connect(envG(at,SP.foreground.saveGain*0.8*hab,0.01,0.3)); o.start(at); o.stop(at+0.35); }
function spawnVoice(at,deg,hab){ const o=ac.createOscillator(); o.type='sine'; o.frequency.value=degHz(deg,1);
  const g=ac.createGain(); g.connect(G.fgBus); g.gain.setValueAtTime(0.0001,at);
  g.gain.linearRampToValueAtTime(SP.foreground.spawnGain*hab,at+bar()); g.gain.linearRampToValueAtTime(0.0001,at+bar()*2);
  o.connect(g); o.start(at); o.stop(at+bar()*2+0.1); }
function noiseBurst(at,len){ const n=Math.ceil(ac.sampleRate*len), b=ac.createBuffer(1,n,ac.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  const s=ac.createBufferSource(); s.buffer=b; s.start(at); return s; }
// 呼唤级（豁免习惯化；前置微静默 duck 床）
function duck(at){ G.bedBus.gain.cancelScheduledValues(at); G.bedBus.gain.setTargetAtTime(0.55,at-0.12<ac.currentTime?at:at-0.12,0.03);
  G.bedBus.gain.setTargetAtTime(1.0,at+0.25,0.2); }
function chordResolve(at){ duck(at); const g=SP.call.gain;
  [[0,0],[4,0.015],[7,0.03]].forEach(([semi,dt])=>{ const o=ac.createOscillator(); o.type='sine';
    o.frequency.value=midiHz(ROOT+semi+12);
    o.connect(envG(at+dt,g*0.5,0.02,0.9)); o.start(at+dt); o.stop(at+dt+1); });
  const o5=ac.createOscillator(); o5.type='sine'; o5.frequency.value=midiHz(ROOT+7); // 正格：属→主的属残响
  o5.connect(envG(Math.max(ac.currentTime,at-0.18),g*0.25,0.01,0.15)); o5.start(Math.max(ac.currentTime,at-0.18)); o5.stop(at+0.2);
}
function skip(at){ duck(at); const n=noiseBurst(at,0.08); const f=ac.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1600;
  n.connect(f); f.connect(envG(at,SP.call.gain,0.003,0.09)); }
function askMotif(at){ duck(at); const hz=askHz();
  [[hz,0,0.28],[hz*9/8,0.22,0.6]].forEach(([fr,dt,len])=>{ const o=ac.createOscillator(); o.type='sine'; o.frequency.value=fr;
    o.connect(envG(at+dt,SP.call.gain*0.7,0.02,len)); o.start(at+dt); o.stop(at+dt+len+0.1); });
}
function doneCadence(at){ // 正格终止 → 真静默 ≥4s（洗碗机时刻）
  const o1=ac.createOscillator(),o2=ac.createOscillator();
  o1.type='sine'; o2.type='sine'; o1.frequency.value=midiHz(ROOT+7); o2.frequency.value=midiHz(ROOT);
  o1.connect(envG(at,0.2,0.02,0.3)); o2.connect(envG(at+0.35,0.24,0.02,0.8));
  o1.start(at); o1.stop(at+0.4); o2.start(at+0.35); o2.stop(at+1.3);
  doneSilentUntil=at+0.35+SP.bed.doneSilenceSec;
}

// ---- 习惯化（滚动 60s 听者时间窗；呼唤/DONE 豁免） ----
const habLog=new Map();
function habFor(cls,at){ if(cls>=6) return 1;
  const w=SP.foreground.habituationWindowSec, arr=(habLog.get(cls)||[]).filter(t=>at-t<=w);
  arr.push(at); habLog.set(cls,arr); return habGain(arr.length); }

// ===== 双时钟播放（针走墙钟；声音走音频钟；乐音量化宁迟勿早） =====
let playing=false, perf0=0, audio0=0, speed=12, si=0, raf=0, lastGridAt=0, lastBarAt=0, lastAskRepeat=-1;
function playMs(){ return (performance.now()-perf0)*speed; }
document.getElementById('speed').oninput=e=>{ speed=+e.target.value; document.getElementById('speedV').textContent=speed+'×'; };
function quantizeUp(at){ const g=grid(), rel=at-audio0; return audio0+Math.ceil(rel/g-1e-9)*g; }
function sampleAt(pm){ let lo=0,hi=track.length-1,best=0;
  while(lo<=hi){ const md=(lo+hi)>>1; if(track[md][0]<=pm){best=md;lo=md+1;} else hi=md-1; } return track[best]; }

function schedule(){ if(!playing) return;
  const pm=playMs(), horizon=pm+140*speed;             // ~140ms 前瞻
  // 1/8 网格：床参数更新 + 律动触发（S2）
  while(lastGridAt<=ac.currentTime+0.14){
    const at=lastGridAt, gpm=(at-audio0)*1000*speed;
    const s=sampleAt(Math.min(gpm,dur));
    const bt=bedTargets(s[2],s[3],s[6],s[5],s[7]);
    if(at>doneSilentUntil) applyBed(bt,at); else if(bt.silence===false && at<=doneSilentUntil){/* 静默期不复活 */}
    // 小节边界：weather 档位切换（既有教义）+ 悬挂音选声（比例 ∝ T，确定性伪随机可复听）
    if(at>=lastBarAt+bar()-1e-6){ lastBarAt=at; wxLatch=s[4]; // 房间噪的天气档由 applyBed 统一施加（EAR-2）
      if(!bt.hover){ const bi=Math.round((at-audio0)/bar());
        const sus=(Math.abs(Math.sin(bi*311.7))%1)<bt.susProb;
        G.v2.frequency.setTargetAtTime(midiHz(ROOT+(sus?5:7)),at,SP.bed.slewMsSlow/1000); } }
    // S2 boom-bap：概率 ∝ density，力度轻
    if(bt.s2>0 && at>doneSilentUntil){ const gi=Math.round((at-audio0)/grid());
      const strong=(gi%4===0), r=Math.abs(Math.sin(gi*127.1))%1;   // 确定性伪随机（可复听）
      if(r<bt.density*(strong?0.9:0.35)){
        if(strong){ const k=ac.createOscillator(); k.frequency.setValueAtTime(85,at); k.frequency.exponentialRampToValueAtTime(42,at+0.09);
          const kg=ac.createGain(); kg.connect(G.s2); kg.gain.setValueAtTime(0.7,at); kg.gain.exponentialRampToValueAtTime(0.001,at+0.18);
          k.connect(kg); k.start(at); k.stop(at+0.2); }
        else { const h=noiseBurst(at,0.03); const hf2=ac.createBiquadFilter(); hf2.type='highpass'; hf2.frequency.value=6500;
          const hg=ac.createGain(); hg.connect(G.s2); hg.gain.setValueAtTime(0.25,at); hg.gain.exponentialRampToValueAtTime(0.001,at+0.04);
          h.connect(hf2); hf2.connect(hg); h.start(at); } } }
    // ASK 礼貌性重复（90s 一次，音量不升级）
    const sNow=sampleAt(Math.min(gpm,dur));
    if(sNow[7]===1 && (at-lastAskRepeat)>=SP.call.askRepeatSec){ lastAskRepeat=at; if(at>audio0+1) askMotif(at); }
    lastGridAt+=grid();
  }
  // 前景事件
  while(si<sounds.length && sounds[si][0]<=horizon){
    const [rel,cls,deg,vel]=sounds[si];
    const atE=Math.max(ac.currentTime, audio0+rel/1000/speed);
    const hab=habFor(cls,atE);
    if(cls===6) chordResolve(atE);
    else if(cls===7) skip(atE);
    else if(cls===8){ lastAskRepeat=atE; askMotif(atE); }
    else if(cls===9) doneCadence(atE);
    else { const q=quantizeUp(atE);
      if(cls===0) pluck(q,deg,vel,false,hab);
      else if(cls===1) pluck(q,deg,vel,true,hab);
      else if(cls===2) page(q,hab);
      else if(cls===3) bell(q,vel,hab);
      else if(cls===4) saveClick(q,hab);
      else if(cls===5) spawnVoice(q,deg,hab); }
    si++;
  }
  if(playing) setTimeout(schedule,25);
}

// ---- 画（素面照旧） ----
function drawNeedle(v,wx){ const w=nc.width,h=nc.height,cx=w/2,cy=h*0.62,R=100;
  ncx.clearRect(0,0,w,h);
  ncx.strokeStyle='#333'; ncx.lineWidth=10; ncx.beginPath(); ncx.arc(cx,cy,R,Math.PI,2*Math.PI); ncx.stroke();
  ncx.strokeStyle=WXC[wx]; ncx.beginPath(); ncx.arc(cx,cy,R,Math.PI,Math.PI+Math.PI*v); ncx.stroke();
  const a=Math.PI+Math.PI*v; ncx.strokeStyle='#e8e8ea'; ncx.lineWidth=3; ncx.beginPath(); ncx.moveTo(cx,cy);
  ncx.lineTo(cx+Math.cos(a)*(R-14),cy+Math.sin(a)*(R-14)); ncx.stroke();
  ncx.fillStyle='#e8e8ea'; ncx.font='22px ui-monospace,monospace'; ncx.textAlign='center';
  ncx.fillText('T '+v.toFixed(2),cx,cy+42); ncx.fillStyle='#6b6b70'; ncx.font='11px ui-monospace,monospace';
  ncx.fillText('针 needle',cx,cy+60); }
function drawCurve(pm){ const w=cc.width,h=cc.height; ccx.clearRect(0,0,w,h);
  ccx.strokeStyle='#222'; [0.25,0.5,0.75].forEach(y=>{ ccx.beginPath(); ccx.moveTo(0,h-y*h); ccx.lineTo(w,h-y*h); ccx.stroke(); });
  const span=Math.max(dur,1);
  ccx.beginPath();
  for(let i=0;i<track.length;i++){ const x=track[i][0]/span*w, y=h-track[i][2]*h; i?ccx.lineTo(x,y):ccx.moveTo(x,y); }
  ccx.strokeStyle='#59c'; ccx.lineWidth=1.5; ccx.stroke();
  const px=pm/span*w; ccx.strokeStyle='#e0b050'; ccx.lineWidth=1; ccx.beginPath(); ccx.moveTo(px,0); ccx.lineTo(px,h); ccx.stroke();
  ccx.fillStyle='#6b6b70'; ccx.font='11px ui-monospace,monospace'; ccx.textAlign='left';
  ccx.fillText(D.anon?'T 曲线':('T 曲线 · 峰值 '+D.peakT.toFixed(3)+' · 跳针×'+D.stuck+' · 和弦×'+D.resolves),6,14); }
function frame(){ const pm=Math.min(playMs(),dur); const s=sampleAt(pm);
  drawNeedle(s[1],s[4]); drawCurve(pm);
  document.getElementById('prog').textContent=(pm/1000).toFixed(0)+'s / '+(dur/1000).toFixed(0)+'s';
  document.getElementById('wx').textContent=WX[s[4]];
  const bt=bedTargets(s[2],s[3],s[6],s[5],s[7]);
  document.getElementById('bed').textContent=(bt.silence?'静默':bt.hover?'悬停':'S1 '+bt.s1.toFixed(2)+' S2 '+bt.s2.toFixed(2)+' S3 '+bt.s3.toFixed(2));
  if(playing && pm<dur) raf=requestAnimationFrame(frame); else if(pm>=dur) stop(); }
function start(){ if(playing||takenOver) return; ensureAudio(); playing=true; setState('▶ 播放中'); perf0=performance.now(); audio0=ac.currentTime+0.05; si=0;
  habLog.clear(); doneSilentUntil=-1; lastGridAt=audio0; lastBarAt=audio0; lastAskRepeat=-1e9; wxLatch=0;
  G.bedBus.gain.cancelScheduledValues(ac.currentTime); G.bedBus.gain.setValueAtTime(1,ac.currentTime);
  // 起播首拍：床参数按 t=0 状态立即就位（EAR-2：不从残留/默认态滑过来）
  const s0=track.length?sampleAt(0):[0,0,0,0,0,0,0,0];
  applyBed(bedTargets(s0[2],s0[3],s0[6],s0[5],s0[7]),ac.currentTime,true);
  schedule(); raf=requestAnimationFrame(frame); }
function stop(){ playing=false; cancelAnimationFrame(raf);
  if(!takenOver) setState('■ 已停止');
  if(!ac) return;
  const at=ac.currentTime;
  // EAR-3 修：调度器把床参数预排到未来 ~150ms——停键只压零不撤单，停后最后一条预排指令
  // 会把床拉回来永远嗡着（"曲线停了声音不停"）。停 = 撤销一切未来自动化 + 快速归零。
  ['s1','s2','s3','hissG','roomG'].forEach(k=>{ G[k].gain.cancelScheduledValues(at); G[k].gain.setTargetAtTime(0,at,0.05); });
  [G.bedBus.gain,G.lp.frequency,G.shelf.gain,G.wowAmt1.gain,G.wowAmt2.gain,G.v1.frequency,G.v2.frequency]
    .forEach(p=>p.cancelScheduledValues(at));
  G.wowAmt1.gain.setTargetAtTime(0,at,0.05); G.wowAmt2.gain.setTargetAtTime(0,at,0.05);
  G.bedBus.gain.setTargetAtTime(1,at,0.05);
  // 硬闸兜底（EAR-3 实测：个别 stem 的自动化在 cancel+setTarget 后仍被引擎钉住不衰减——
  // 不与自动化语义辩经，300ms 淡出窗过后直接置零，停就是停）
  setTimeout(()=>{ if(playing||!ac) return; const t2=ac.currentTime;
    ['s1','s2','s3','hissG','roomG','wowAmt1','wowAmt2'].forEach(k=>{ G[k].gain.cancelScheduledValues(t2); G[k].gain.value=0; });
  },300); }
document.getElementById('play').onclick=start;
document.getElementById('stop').onclick=stop;
(function(){ const s=track.length?sampleAt(0):[0,0,0,0,0,0,0,0]; drawNeedle(s[1],s[4]); drawCurve(0); })();
// ===== 单实例接管（EAR-3）：新探针页广播接管，旧页收到即静音——多标签叠噪结构性根治 =====
// file:// 下 BroadcastChannel 不保证跨页，故 try/catch 降级；http(localhost) 下全效。
const TABID=Math.random().toString(36).slice(2);
let takenOver=false;
function setState(txt,warn){ const b=document.getElementById('mState'); b.textContent=txt; b.style.color=warn?'#e0b050':''; }
function onTaken(){ if(takenOver) return; takenOver=true; stop();
  if(ac) G.master.gain.setTargetAtTime(0,ac.currentTime,0.05);
  setState('⛔ 已被新探针接管（本页静音）',true);
  document.getElementById('play').disabled=true; }
let CHAN=null;
try{ CHAN=new BroadcastChannel('foley-probe');
  CHAN.onmessage=e=>{ if(e.data&&e.data.type==='takeover'&&e.data.id!==TABID) onTaken(); };
  CHAN.postMessage({type:'takeover',id:TABID});
}catch(_e){ /* file:// 降级：靠 build 时间戳与状态牌人工辨旧页 */ }
// dev 诊断口（自动化验证用；后台标签 rAF 被掐时以此读真状态）
window.__probe={ isPlaying:()=>playing, acState:()=>ac?ac.state:'none', acTime:()=>ac?ac.currentTime:-1,
  playMs:()=>playing?playMs():-1, scheduled:()=>si, gridAt:()=>lastGridAt, takenOver:()=>takenOver,
  gains:()=>ac?{s1:G.s1.gain.value,s2:G.s2.gain.value,s3:G.s3.gain.value,hiss:G.hissG.gain.value,room:G.roomG.gain.value}:null };

// ===== 调音抽屉（?tuner=1，仅 dev；拧 SP → 实时生效 + 哈希重算） =====
if(new URLSearchParams(location.search).get('tuner')==='1'){
  document.getElementById('tunerHead').style.display='block';
  const panel=document.getElementById('tuner'); panel.style.display='block';
  const fields=[
    ['bed','trimDb',-24,6],
    ['bed','s1Gain',0,0.3],['bed','s1IdleGain',0,0.1],['bed','s2Gain',0,0.3],['bed','s2GateA',0,1],
    ['bed','s3Gain',0,0.4],['bed','s3GateT',0,1],['bed','filterHzLo',300,4000],['bed','filterHzHi',2000,12000],
    ['bed','hissDbLo',-80,-40],['bed','hissDbHi',-60,-20],['bed','wowCentsLo',0,10],['bed','wowCentsHi',5,50],
    ['bed','hfShelfDbHi',-12,0],['bed','slewMsFast',50,1000],['bed','slewMsSlow',200,2000],['bed','doneSilenceSec',1,10],
    ['foreground','peakGain',0,0.6],['foreground','failGain',0,0.6],['foreground','pageGain',0,0.3],
    ['foreground','bellGain',0,0.4],['foreground','saveGain',0,0.5],['foreground','spawnGain',0,0.4],
    ['foreground','habituationFactor',0.5,1],['foreground','habituationWindowSec',10,180],['foreground','habituationFloorRatio',0,0.6],
    ['call','gain',0,0.8],['call','askRepeatSec',30,300],
  ];
  const hEl=document.getElementById('tHash');
  const refreshHash=()=>{ hEl.textContent=hashJson(SP)+(hashJson(SP)===D.soundHash?'（=出厂）':'（已改）'); };
  for(const [sec,key,lo,hi] of fields){
    const lab=document.createElement('label');
    const k=document.createElement('span'); k.className='k'; k.textContent=sec+'.'+key;
    const inp=document.createElement('input'); inp.type='range'; inp.min=lo; inp.max=hi; inp.step=(hi-lo)/200;
    inp.value=SP[sec][key];
    const v=document.createElement('span'); v.className='v'; v.textContent=(+SP[sec][key]).toFixed(3).replace(/\\.?0+$/,'');
    inp.oninput=()=>{ SP[sec][key]=+inp.value; v.textContent=(+inp.value).toFixed(3).replace(/\\.?0+$/,''); refreshHash();
      // EAR-3：拖动立即生效（曾要等下一个 1/8 拍网格才应用，慢滑 slew 再拖 0.25–0.8s——
      // 拖动像"没变化"。播放中即时重算当前床目标并即刻施加；网格调度照旧接管后续。
      if(ac && playing){ const s=sampleAt(Math.min(playMs(),dur)); applyBed(bedTargets(s[2],s[3],s[6],s[5],s[7]),ac.currentTime,true); } };
    lab.append(k,inp,v); panel.append(lab);
  }
  refreshHash();
  document.getElementById('tCopy').onclick=()=>{ navigator.clipboard.writeText(JSON.stringify(SP,null,2)); };
}
</script>
</body></html>
`;
}
