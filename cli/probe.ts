// cli probe <tape.tape.jsonl> [--out dir] [--kind ...] —— M2 素面探针页。
// 回放蒸馏带 → 自包含 probe.html：一根针 + 曲线 + 三音（拨弦/和弦/跳针）。
// M1.6 §7 语义：乐音（拨弦、和弦解决）量化到节拍网格、~0.1s lookahead『宁迟勿早』；
//   跳针音走直通道不量化；针按 20Hz 驱动、不走音频钟；声音对齐的视觉走 rAF（Tone.Draw 等效）。
// 现实修正：§7 指名 Tone.js，但 v0 硬禁『无网络请求』+ 引擎零运行时依赖；CDN 加载即网络请求、
//   擅自 vendor 300KB 库不妥 → 以原生 Web Audio 实现同语义，库替换待架构师裁（见 FEEDBACK）。
// 禁令照旧：无美学样式、无第四种声音、无导出/分享、不触配置、无网络。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, basename, relative } from 'node:path';
import { resolveParams, hashParams } from '../engine/params.ts';
import { replayCore, loadVerdict, type TapeKind } from './replay.ts';

/** 事件 → 声音类别。三音：pluck（活动）/ chord（解决）/ skip（跳针）。expiry 清除=沉默（§3.5）。 */
function soundClass(ev: { special?: string; verb: string; outcome: string }): string | null {
  if (ev.special === 'STUCK_LOOP') return 'skip';       // 跳针，直通道不量化
  if (ev.special === 'RESOLVE') return 'chord';         // 和弦解决，量化
  if (ev.special === 'STUCK_CLEARED') return null;      // ok型已由 RESOLVE 发声；expiry 设计性沉默
  if (ev.special) return null;                          // SESSION_START/DONE/ASK_CLEARED 无声
  if (ev.verb === 'ASK') return null;                   // ASK 动机=未来（不设第四音）
  if (ev.outcome === 'NA') return null;
  return 'pluck';                                       // OK/FAIL 拨弦，量化（音高由 outcome/m 定）
}

export function runProbe(argv: string[]): void {
  const tapePath = argv.filter((a) => !a.startsWith('--'))[0];
  if (!tapePath) {
    console.error('用法: node cli/index.ts probe <tape.tape.jsonl> [--out runs/probe-<ts>/] [--kind ...]');
    console.error('  回放磁带 → 自包含 probe.html（针+曲线+三音）。M1.6-A §5：provisional 参数下照常进 M2。');
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
  const { verdict, hash: verdictHash } = loadVerdict();
  const core = replayCore(readFileSync(tapePath, 'utf8'), params, verdict.rain.floor);

  const snaps = core.snaps;
  const t0 = snaps.length ? snaps[0]!.t : 0;
  const WEATHER = ['CLEAR', 'OVERCAST', 'RAIN', 'STORM'];
  const PHASE = ['IDLE', 'WORKING', 'WAITING', 'DONE'];

  // 压缩时间轴：把大空档（含跨 episode 的多日跳变、长静默）压到 ≤GAP_CAP，
  // 否则探针会播大段死寂。origRel→comp 单调映射，声音按同映射对齐。
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

  // 针轨迹（压缩轴；抽稀 ≤12000 点）
  const stride = Math.max(1, Math.ceil(snaps.length / 12000));
  const track: [number, number, number, number, number, number][] = [];
  const pushSnap = (i: number): void => {
    const s = snaps[i]!;
    track.push([Math.round(comp[i]!), r3(s.needle), r3(s.T), r3(s.A), WEATHER.indexOf(s.weather), PHASE.indexOf(s.phase)]);
  };
  for (let i = 0; i < snaps.length; i += stride) pushSnap(i);
  if (snaps.length && (snaps.length - 1) % stride !== 0) pushSnap(snaps.length - 1);

  // 声音事件（发射时刻映射到压缩轴）
  const sounds: [number, string, number][] = [];
  for (const e of core.emitted) {
    const cls = soundClass(e.ev);
    if (!cls) continue;
    const pitch = e.ev.outcome === 'FAIL' ? 0 : 1; // 0=低(失败) 1=高(顺)
    sounds.push([Math.round(interp(e.emitT - t0)), cls, e.ev.special === 'RESOLVE' ? 2 : pitch]);
  }
  sounds.sort((a, b) => a[0] - b[0]);

  const durationMs = track.length ? track[track.length - 1]![0] : 0;
  const anon = !!anonLabel;
  const data = anon
    ? { // 匿名：只留 label，抹带名/卷号/日期/engine/params/verdict/统计（防推断）
        tape: anonLabel, kind: '', engineSha: '—', paramsHash: '—', verdictHash: '—',
        provisional: false, anon: true, durationMs, peakT: 0, stuck: 0, resolves: 0, track, sounds,
      }
    : {
        tape: basename(tapePath), kind: kind ?? '',
        engineSha: gitSha(), paramsHash: hashParams(paramsRaw), verdictHash,
        provisional: false, anon: false, durationMs, peakT: core.metrics.peakT,
        stuck: core.metrics.stuckEdges, resolves: core.metrics.resolves, track, sounds,
      };

  const html = buildProbeHtml(data);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = outIdx >= 0 && argv[outIdx + 1] ? argv[outIdx + 1]! : join(process.cwd(), 'runs', `probe-${ts}`);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'probe.html');
  writeFileSync(outFile, html, 'utf8');
  process.stderr.write(
    `探针 ${basename(tapePath)}${kind ? `（${kind}）` : ''} → ${relative(process.cwd(), outFile)}\n` +
    `  针轨迹 ${track.length} 点｜声音事件 ${sounds.length}（跳针${sounds.filter((s) => s[1] === 'skip').length}/和弦${sounds.filter((s) => s[1] === 'chord').length}/拨弦${sounds.filter((s) => s[1] === 'pluck').length}）｜时长 ${(durationMs / 1000).toFixed(0)}s\n` +
    `  浏览器打开 probe.html，点『▶ 播放』（需用户手势解锁音频）。自包含、无网络、无外部依赖。\n`,
  );
}

function r3(n: number): number { return Math.round(n * 1000) / 1000; }
function gitSha(): string { try { return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch { return 'nogit'; } }

// ---------- probe.html（自包含：内联 CSS/JS + 内嵌数据；无外部 URL） ----------

function buildProbeHtml(data: unknown): string {
  const json = JSON.stringify(data);
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
  .badge{padding:1px 7px;border:1px solid #333;border-radius:10px}
  .prov{color:#e0b050;border-color:#5a4a1a}
</style></head><body>
<header>
  <b>TAPE-0 探针</b>
  <span class="muted">tape</span> <span id="mTape"></span>
  <span class="muted">engine</span> <span id="mEng"></span>
  <span class="muted">params</span> <span id="mPar"></span>
  <span class="muted">verdict</span> <span id="mVer"></span>
  <span class="badge prov" id="mProv">provisional 参数（M1.6-A §5）</span>
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
  <span class="muted">｜三音</span><span class="muted">拨弦=活动 · 和弦=解决(量化) · 跳针=卡碟(直通)</span>
</div>
<script id="d" type="application/json">${json}</script>
<script>
"use strict";
const D = JSON.parse(document.getElementById('d').textContent);
document.getElementById('mTape').textContent = D.tape + (D.kind?(' ('+D.kind+')'):'');
document.getElementById('mEng').textContent = D.engineSha;
document.getElementById('mPar').textContent = D.paramsHash;
document.getElementById('mVer').textContent = D.verdictHash;
if(!D.provisional) document.getElementById('mProv').style.display='none';

const WX=['CLEAR','OVERCAST','RAIN','STORM'];
const WXC=['#2a6','#7a3','#59c','#c53']; // 晴/多云/雨/暴雨 —— 仅功能色，非美学
const nc=document.getElementById('needle'), ncx=nc.getContext('2d');
const cc=document.getElementById('curve'), ccx=cc.getContext('2d');
const track=D.track, sounds=D.sounds, dur=D.durationMs;

// ---------- 音频：三音 + 节拍量化调度（§7 宁迟勿早） ----------
let ac=null; const BPM=120, GRID=60/BPM/2; // 8分音网格 0.25s
const LOOKAHEAD=0.1;                        // §7 默认 lookAhead ~0.1s
function ensureAudio(){ if(!ac) ac=new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==='suspended') ac.resume(); }
function quantizeUp(at){ return Math.ceil(at/GRID)*GRID; }        // 对齐到下一网格线：永不提前
function pluck(at,hi){ const o=ac.createOscillator(),g=ac.createGain(); o.type='triangle';
  o.frequency.value=hi?440:220; o.connect(g); g.connect(ac.destination);
  g.gain.setValueAtTime(0.0001,at); g.gain.exponentialRampToValueAtTime(hi?0.22:0.3,at+0.005);
  g.gain.exponentialRampToValueAtTime(0.0001,at+0.18); o.start(at); o.stop(at+0.2); }
function chord(at){ [523.25,659.25,783.99].forEach((f,i)=>{ const o=ac.createOscillator(),g=ac.createGain();
  o.type='sine'; o.frequency.value=f; o.connect(g); g.connect(ac.destination);
  g.gain.setValueAtTime(0.0001,at); g.gain.exponentialRampToValueAtTime(0.16,at+0.02+i*0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,at+0.9); o.start(at); o.stop(at+0.95); }); }
function skip(at){ // 跳针：短促噪声脉冲（直通道，不量化）
  const n=ac.sampleRate*0.08, b=ac.createBuffer(1,n,ac.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  const s=ac.createBufferSource(),g=ac.createGain(),f=ac.createBiquadFilter();
  f.type='bandpass'; f.frequency.value=1600; s.buffer=b; s.connect(f); f.connect(g); g.connect(ac.destination);
  g.gain.setValueAtTime(0.35,at); g.gain.exponentialRampToValueAtTime(0.0001,at+0.09); s.start(at); }

// ---------- 双时钟：针走 20Hz 墙钟；声音走音频钟 ----------
let playing=false, perf0=0, audio0=0, speed=12, si=0, needleTimer=null, raf=0;
function playMs(){ return (performance.now()-perf0)*speed; }              // 针用（不走音频钟）
document.getElementById('speed').oninput=e=>{ speed=+e.target.value; document.getElementById('speedV').textContent=speed+'×'; };

function schedule(){ // 每 25ms 前瞻 100ms：把落入窗口的乐音量化排程；跳针直通
  if(!playing) return;
  const pm=playMs(), horizon=pm+LOOKAHEAD*1000*speed;
  while(si<sounds.length && sounds[si][0]<=horizon){
    const [rel,cls]=sounds[si];
    const at=audio0+(rel-pm)/1000/speed;                                  // 该事件的音频时刻
    const when=Math.max(ac.currentTime, at);
    if(cls==='skip') skip(when);                                          // 直通道
    else if(cls==='chord') chord(quantizeUp(when));                       // 量化
    else pluck(quantizeUp(when), sounds[si][2]===1);                      // 量化
    si++;
  }
  if(playing) setTimeout(schedule,25);
}

function sampleAt(pm){ // 二分找 ≤pm 的针值
  let lo=0,hi=track.length-1,best=0;
  while(lo<=hi){ const md=(lo+hi)>>1; if(track[md][0]<=pm){best=md;lo=md+1;} else hi=md-1; }
  return track[best];
}
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
  if(playing && pm<dur) raf=requestAnimationFrame(frame); else if(pm>=dur) stop(); }
function start(){ if(playing) return; ensureAudio(); playing=true; perf0=performance.now(); audio0=ac.currentTime; si=0;
  schedule(); raf=requestAnimationFrame(frame); }
function stop(){ playing=false; cancelAnimationFrame(raf); }
document.getElementById('play').onclick=start;
document.getElementById('stop').onclick=stop;
// 初绘（静止）
(function(){ const s=track.length?sampleAt(0):[0,0,0,0,0,0]; drawNeedle(s[1],s[4]); drawCurve(0); })();
</script>
</body></html>
`;
}
