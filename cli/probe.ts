// cli probe <tape.tape.jsonl> [--out dir] [--kind ...] [--anon 标签] [--sp 键=值 ...] —— 声音相探针页（SOUND-R1 薄壳化）。
// --sp（EAR-5 起，试听诊断口）：点号路径覆写 sound-params 生成**试听变体**（如 --sp bed.hissDbLo=-120）。
//   变体不覆盖 probe-latest 固定入口（肌肉记忆只认正典参数）；页头哈希如实显示改后值。
// 回放蒸馏带 → 自包含 probe.html：针 + 曲线 + 床 + 前景。
// 薄壳纪律（SOUND-R1 §2 重构执照）：本文件只做①数据准备②页面 UI 壳。**声音一律不在此处**——
// 页内 <script> 逐字内嵌 sound/core.js（纯映射律）与 sound/graph.js（注册表音频图），
// 与 cli ear 的离线渲染跑同一份源码；"页里手抄同源律"的物种自此灭绝（EAR-4 失明土壤之一）。
// 内嵌方式：剥 import/export 模块语法后按行拼接（core 在前 graph 在后，作用域直连）。
// 禁令照旧：无网络、自包含、无导出分享；视觉保持素面（美学归 Track-STAGE 琥珀舞台）。
// 现实修正（沿革）：repoKey=hash(repo) 在蒸馏带不可得（隐私膜抹 cwd）→ replay 侧以 sourceHash 代。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename, relative } from 'node:path';
import { resolveParams, hashParams, hashJson } from '../engine/params.ts';
import { replayCore, loadVerdict, type TapeKind } from './replay.ts';
import { resolveSoundParams, degreeOf, buildTrack } from '../sound/index.ts';
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

/** sound/ 真源 → 页内嵌 JS：剥模块语法（import 行删除；export 前缀剥掉），语义原样。 */
function inlineSoundSource(): string {
  const strip = (src: string): string => src
    .split('\n')
    .filter((l) => !l.startsWith('import '))
    .map((l) => l.replace(/^export (function|const|class)/, '$1'))
    .join('\n');
  const core = strip(readFileSync(new URL('../sound/core.js', import.meta.url), 'utf8'));
  const graph = strip(readFileSync(new URL('../sound/graph.js', import.meta.url), 'utf8'));
  return `// ===== 内嵌真源 sound/core.js（构建时逐字拷贝，剥模块语法）=====\n${core}\n` +
    `// ===== 内嵌真源 sound/graph.js（同上；与 cli ear 离线渲染同一份代码）=====\n${graph}`;
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
  const soundRaw = JSON.parse(readFileSync(new URL('../sound-params.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  // --sp 试听覆写（可重复）：bed.hissDbLo=-120 → soundRaw.bed.hissDbLo = -120
  const spOverrides: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--sp' || !argv[i + 1]) continue;
    const [path, valStr] = argv[i + 1]!.split('=');
    const val = Number(valStr);
    if (!path || valStr === undefined || Number.isNaN(val)) {
      console.error(`--sp 需要 点号路径=数值（收到 "${argv[i + 1]}"）`); process.exit(2);
    }
    const keys = path.split('.');
    let node = soundRaw as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) node = node[k] as Record<string, unknown>;
    node[keys[keys.length - 1]!] = val;
    spOverrides.push(`${path}=${val}`);
  }
  const sp = resolveSoundParams(soundRaw);
  const soundHash = hashJson(soundRaw);
  const { verdict, hash: verdictHash } = loadVerdict();
  const core = replayCore(readFileSync(tapePath, 'utf8'), params, verdict.rain.floor);

  const snaps = core.snaps;
  // 压缩时间轴与状态轨迹：core.buildTrack（机器耳朵同一口径——听的与验的必须是同一条时间轴）
  const { track, comp, t0 } = buildTrack(snaps);
  const origRel: number[] = new Array(snaps.length);
  for (let i = 0; i < snaps.length; i++) origRel[i] = snaps[i]!.t - t0;
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
  // EAR-3：固定路径镜像——船长永远只开这一个地址，旧时间戳目录不再进 open 肌肉记忆。
  // --sp 试听变体不入镜像：固定入口只认正典参数
  if (spOverrides.length === 0) {
    const latestDir = join(process.cwd(), 'runs', 'probe-latest');
    mkdirSync(latestDir, { recursive: true });
    writeFileSync(join(latestDir, 'probe.html'), html, 'utf8');
  } else {
    process.stderr.write(`  ⚠ 试听变体（--sp ${spOverrides.join(' ')}）：不覆盖 probe-latest\n`);
  }
  const cnt = (c: number): number => sounds.filter((s) => s[1] === c).length;
  process.stderr.write(
    `探针 声音相(SOUND-R1) ${basename(tapePath)}${kind ? `（${kind}）` : ''} → ${relative(process.cwd(), outFile)}\n` +
    `  固定入口：runs/probe-latest/probe.html（旧标签页会被新页自动静音接管）\n` +
    `  sound-params ${soundHash}｜轨迹 ${track.length} 点｜前景 ${sounds.length}` +
    `（拨弦${cnt(0)}/闷弦${cnt(1)}/纸页${cnt(2)}/铃${cnt(3)}/卡座${cnt(4)}/声部${cnt(5)}｜和弦${cnt(6)}/跳针${cnt(7)}/ASK${cnt(8)}｜DONE${cnt(9)}）\n` +
    `  浏览器打开 probe.html 点『▶』（用户手势解锁音频）。?tuner=1 开调音抽屉。自包含、零网络。\n`,
  );
}

function r3(n: number): number { return Math.round(n * 1000) / 1000; }
function gitSha(): string { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return 'nogit'; } }

// ---------- probe.html（自包含：内联 CSS/JS + 内嵌数据/声参 + 内嵌 sound/ 真源；无外部 URL） ----------

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
  <b>TAPE-0 探针 · 声音相</b>
  <span class="muted">tape</span> <span id="mTape"></span>
  <span class="muted">engine</span> <span id="mEng"></span>
  <span class="muted">params</span> <span id="mPar"></span>
  <span class="muted">verdict</span> <span id="mVer"></span>
  <span class="muted">sound</span> <span id="mSnd"></span>
  <span class="muted">build</span> <span id="mBuild"></span>
  <span class="badge" id="mState">■ 未播放</span>
  <span class="muted" id="mHealth" title="实时音频线程健康（EAR-8）：欠载=爆音串的机器证据">载荷 —</span>
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
<div class="ctl" id="isoBoard">
  <span class="muted">隔离板（EAR-7 凶手排查｜勾=发声，全去勾=数字零——此时若仍有滋啦，噪声在你的声音链不在磁带里）：</span>
</div>
<div id="tunerHead">调音抽屉（dev）—— sound-params 实时哈希：<span id="tHash"></span> <button id="tCopy">复制 JSON</button></div>
<div id="tuner"></div>
<script id="d" type="application/json">${json}</script>
<script id="sp" type="application/json">${spJson}</script>
<script>
"use strict";
${inlineSoundSource()}

// ===== 薄壳（SOUND-R1）：以下只有 UI/transport/tuner/takeover——声音全部在上方内嵌真源里 =====
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

// hashJson 同源（stableStringify 排序、_ 键剔除 + FNV-1a）——治理锚（显示件，与 engine/params.ts 同律）
function stableStr(v){ if(v===null||typeof v!=='object')return JSON.stringify(v);
  if(Array.isArray(v))return '['+v.map(stableStr).join(',')+']';
  const ks=Object.keys(v).filter(k=>!k.startsWith('_')).sort();
  return '{'+ks.map(k=>JSON.stringify(k)+':'+stableStr(v[k])).join(',')+'}'; }
function hashJsonUi(o){ const s=stableStr(o); let h=0x811c9dc5;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0; }
  return h.toString(16).padStart(8,'0'); }

// ===== 音频：引擎只建一次（EAR-3 单实例语义在页内同样成立），transport 每次起播复位 =====
let ac=null, engine=null;
let capInfo={load:0,peak:0,underruns:0,updates:0};
function ensureAudio(){
  if(ac){ if(ac.state==='suspended') ac.resume(); return; }
  // EAR-8：latencyHint 'playback'——这是收听仪器不是演奏乐器，大缓冲换实时线程欠载免疫
  // （欠载爆音"滋滋啦啦"骑在当刻最响的层上、且与磁带版本无关——正是历轮"噪声一模一样"的候选机理）
  ac=new (window.AudioContext||window.webkitAudioContext)({ latencyHint:'playback' });
  engine=buildEngine(ac, SP, { repoKey: D.repoKey, seed: D.repoKey });
  for(const k of isoMutes) engine.setMute(k,true); // 起播前勾掉的层，建图即施加
  // 欠载记录仪（Chrome AudioRenderCapacity；不支持则显示 n/a）——船长页头可见，机器证据入 __probe
  try{
    const cap=ac.renderCapacity;
    if(cap&&cap.start){ cap.start({updateInterval:1});
      cap.addEventListener('update',ev=>{ capInfo.load=ev.averageLoad; capInfo.peak=ev.peakLoad;
        if(ev.underrunRatio>0) capInfo.underruns++; capInfo.updates++;
        document.getElementById('mHealth').textContent=
          '载荷 '+Math.round(ev.averageLoad*100)+'%｜欠载 '+capInfo.underruns+(capInfo.underruns>0?' ⚠':'');
      }); }
    else document.getElementById('mHealth').textContent='载荷 n/a';
  }catch(_e){ document.getElementById('mHealth').textContent='载荷 n/a'; }
}

// ===== 双时钟播放（针走墙钟；声音走音频钟；调度与量化全在 graph.js）=====
let playing=false, perf0=0, audio0=0, speed=12, si=0, raf=0;
function playMs(){ return (performance.now()-perf0)*speed; }
document.getElementById('speed').oninput=e=>{ speed=+e.target.value; document.getElementById('speedV').textContent=speed+'×';
  if(engine&&playing&&engine.transport) engine.transport.speed=speed; };

function schedule(){ if(!playing) return;
  engine.scheduleGridUntil(ac.currentTime+0.14);           // ~140ms 前瞻（床+S2+ASK 重复，graph.js）
  const horizon=playMs()+140*speed;
  while(si<sounds.length && sounds[si][0]<=horizon){
    const [rel,cls,deg,vel]=sounds[si];
    const atE=Math.max(ac.currentTime, audio0+rel/1000/speed);
    engine.trigger(cls, atE, deg, vel);                    // 习惯化/量化/duck/DONE 全在 graph.js
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
function frame(){ const pm=Math.min(playMs(),dur); const s=sampleAt(track,pm);
  drawNeedle(s[1],s[4]); drawCurve(pm);
  document.getElementById('prog').textContent=(pm/1000).toFixed(0)+'s / '+(dur/1000).toFixed(0)+'s';
  document.getElementById('wx').textContent=WX[s[4]];
  const bt=bedTargets({T:s[2],A:s[3],wow:s[6],phase:PHASE_IDX[s[5]]||'WORKING',weather:'CLEAR',pendingAsk:s[7]===1},SP);
  document.getElementById('bed').textContent=(bt.silence?'静默':bt.hover?'悬停':'S1 '+bt.s1.toFixed(2)+' S2 '+bt.s2.toFixed(2)+' S3 '+bt.s3.toFixed(2));
  if(playing && pm<dur) raf=requestAnimationFrame(frame); else if(pm>=dur) stopPlay(); }

function start(){ if(playing) return;
  // EAR-6 修：接管语义从"后开的页永久独占"改为"谁按▶谁发声"——被接管页按播放即夺回
  // （A/B 对照两页都开着时，旧语义把先开的页锁死：按▶无声、状态牌又不起眼——船长"什么声音都没有"的元凶）
  if(takenOver){ takenOver=false; try{ CHAN&&CHAN.postMessage({type:'takeover',id:TABID}); }catch(_e){}
    if(engine) engine.unmuteMaster(ac.currentTime); }
  ensureAudio(); playing=true; setState('▶ 播放中');
  perf0=performance.now(); audio0=ac.currentTime+0.05; si=0;
  engine.startTransport(audio0, speed, track, dur);        // 复位：习惯化/静默闩/bedBus/首拍 imm 就位（EAR-2）
  schedule(); raf=requestAnimationFrame(frame); }
function stopPlay(){ playing=false; cancelAnimationFrame(raf);
  if(!takenOver) setState('■ 已停止');
  if(!engine) return;
  // 停 = 注册表遍历：撤单+快速归零+300ms 自动化硬闸（graph.js stopAll）；一次性源当场枪毙
  engine.stop(ac.currentTime);
  // EAR-3 浏览器兜底带（个别引擎钉参数不衰减）：300ms 后直接置零——若已重新起播则让位
  setTimeout(()=>{ if(!playing&&engine) engine.hardMute(); },300);
}
document.getElementById('play').onclick=start;
document.getElementById('stop').onclick=stopPlay;
(function(){ const s=track.length?sampleAt(track,0):[0,0,0,0,0,0,0,0]; drawNeedle(s[1],s[4]); drawCurve(0); })();

// ===== 隔离板（EAR-7）：层禁声走引擎（engine.setMute），不动 SP/哈希；起播前的勾选先记账后施加 =====
const isoMutes=new Set();
(function(){ const board=document.getElementById('isoBoard');
  const LAYERS=[['s1','S1 基底(pad)'],['s2','S2 律动'],['s3','S3 张力弦'],['hiss','S4 底噪hiss'],['room','房间感'],['fg','前景+呼唤']];
  for(const [key,label] of LAYERS){
    const lab=document.createElement('label'); lab.style.cssText='display:flex;gap:4px;align-items:center';
    const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=true;
    cb.onchange=()=>{ if(cb.checked) isoMutes.delete(key); else isoMutes.add(key);
      if(engine){ engine.setMute(key,!cb.checked);
        if(playing) engine.applyBedNow(Math.min(playMs(),dur)); } };
    lab.append(cb,document.createTextNode(label)); board.append(lab);
  }
})();

// ===== 单实例接管（EAR-3）：新探针页广播接管，旧页收到即静音——多标签叠噪结构性根治 =====
// file:// 下 BroadcastChannel 不保证跨页，故 try/catch 降级；http(localhost) 下全效。
const TABID=Math.random().toString(36).slice(2);
let takenOver=false;
function setState(txt,warn){ const b=document.getElementById('mState'); b.textContent=txt; b.style.color=warn?'#e0b050':''; }
function onTaken(){ if(takenOver) return; takenOver=true; stopPlay();
  if(engine) engine.muteMaster(ac.currentTime);
  setState('⛔ 已被其他探针页接管（按 ▶ 夺回发声权）',true); }
let CHAN=null;
try{ CHAN=new BroadcastChannel('foley-probe');
  CHAN.onmessage=e=>{ if(e.data&&e.data.type==='takeover'&&e.data.id!==TABID) onTaken(); };
  CHAN.postMessage({type:'takeover',id:TABID});
}catch(_e){ /* file:// 降级：靠 build 时间戳与状态牌人工辨旧页 */ }
// dev 诊断口（自动化验证用；后台标签 rAF 被掐时以此读真状态）。
// gains 为 .value 账本口径——仅 dev 展示，永不作验收依据（EAR-4 教训；验收=cli ear 渲染波形）
window.__probe={ isPlaying:()=>playing, acState:()=>ac?ac.state:'none', acTime:()=>ac?ac.currentTime:-1,
  playMs:()=>playing?playMs():-1, scheduled:()=>si, gridAt:()=>engine?engine.lastGridAt:-1, takenOver:()=>takenOver,
  gains:()=>engine?engine.debugGains():null, master:()=>engine?engine.nodes.master.gain.value:-1,
  health:()=>({...capInfo, baseLatency:ac?ac.baseLatency:-1, sampleRate:ac?ac.sampleRate:-1}) };

// ===== 调音抽屉（?tuner=1，仅 dev；拧 SP → 实时生效 + 哈希重算） =====
if(new URLSearchParams(location.search).get('tuner')==='1'){
  document.getElementById('tunerHead').style.display='block';
  const panel=document.getElementById('tuner'); panel.style.display='block';
  const fields=[
    ['bed','trimDb',-24,6],
    ['bed','breathDepth',0.05,0.20],
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
  const refreshHash=()=>{ hEl.textContent=hashJsonUi(SP)+(hashJsonUi(SP)===D.soundHash?'（=出厂）':'（已改）'); };
  for(const [sec,key,lo,hi] of fields){
    const lab=document.createElement('label');
    const k=document.createElement('span'); k.className='k'; k.textContent=sec+'.'+key;
    const inp=document.createElement('input'); inp.type='range'; inp.min=lo; inp.max=hi; inp.step=(hi-lo)/200;
    inp.value=SP[sec][key];
    const v=document.createElement('span'); v.className='v'; v.textContent=(+SP[sec][key]).toFixed(3).replace(/\\.?0+$/,'');
    inp.oninput=()=>{ SP[sec][key]=+inp.value; v.textContent=(+inp.value).toFixed(3).replace(/\\.?0+$/,''); refreshHash();
      // EAR-3：拖动立即生效（播放中即时重算当前床目标并即刻施加；网格调度照旧接管后续）
      if(engine && playing) engine.applyBedNow(Math.min(playMs(),dur)); };
    lab.append(k,inp,v); panel.append(lab);
  }
  refreshHash();
  document.getElementById('tCopy').onclick=()=>{ navigator.clipboard.writeText(JSON.stringify(SP,null,2)); };
}
</script>
</body></html>
`;
}
