#!/usr/bin/env node
// 审计校验带生成器（船长令 2026-07-11：一盘带短时间巡礼全部声音状态＋全器件动效，专供快速聆听校验）。
// 策展元数据即本段落表（增补包 §9：取景是内容决策，不埋常量）——重生成:node stage/tools/make-audit-tape.mjs
//
//   幕  时间(s)   状态                      听什么                          看什么
//   一  0–10     IDLE/CLEAR 全零           房间层最弱态底噪                 盘停·灯暗·纸静(待机法)
//   二  10–24    WORKING 爬坡 A0→.75       床层随 A/T 渐开                 盘惯性起转·辊带随动
//   三  24–46    前景族巡礼(每2.2s一枚)      拨弦/READ/铃/SAVE/SPAWN/挫弦/   VU 逐枚弹·魔眼开合·纸上事件桩
//                WRITE READ RUN SAVE       和弦/问询动机
//                SPAWN FAIL RESOLVE ASK
//   四  46–60    STORM 全开 A1.0           最重床+事件密集                  盘全速·VU 狂舞·风暴灯语
//   五  60–76    STUCK_LOOP→CLEARED        锁槽循环+跳针滑擦+闷啵嗒          卡拍挣扎—歇编舞(两盘异相)
//   六  76–90    RAIN·wow 0→.8→.3         音高摆(抖晃引擎)                盘轴抖·带面颤随 wow
//   七  90–104   张力心电图 T .1↔.9        床滤波/磨损随 T 大摆             记录仪满幅剧烈(④验收场地)
//   八  104–116  WAITING·pendingAsk=1     问询动机周期重奏                 ASK 灯持续呼吸
//   九  116–130  DONE 滑停                 床收撤·doneSilence·唱片停       盘滑停长尾·灯语收
//   十  130–142  复醒 A0→.9               **唱片重落针**(DONE 后复活)      盘再起转
//   十一 142–168  终章全家福 STORM 渐强      全家轮唱+和弦收幕→DONE          全器件合演→滑停谢幕
//
// 行距 100ms（同厂带）；needle=事件时刻脉冲衰减（VU 弹道/魔眼开合的粮）；slot=八位hex(旋律度数多样)。

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const FIX = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const DT = 100, DUR = 168_000, N = DUR / DT;

const lerp = (a, b, u) => a + (b - a) * Math.min(1, Math.max(0, u));
const seg = (t, a, b) => (t >= a && t < b) ? (t - a) / (b - a) : null;

// —— 时刻表（幕三巡礼/幕四密集/幕五卡碟/幕八问询/幕九十终章）——
const M = [];
let seq = 0;
const mo = (t, verb, outcome, special, slot) =>
  M.push({ t, verb: verb ?? 'OTHER', outcome: outcome ?? 'NA', special: special ?? '', slot: slot ?? '' });
// 幕三：前景族一枚一枚点名（间隔 2.2s·斜升度数）
const TOUR = [
  ['WRITE', 'OK', null, '10e3a2b1'], ['READ', 'OK', null, '2f4c81d0'], ['RUN', 'OK', null, '3a9b52c7'],
  ['SAVE', 'OK', null, '4d17e6f2'], ['SPAWN', 'OK', null, '5b28a9e4'], ['WRITE', 'FAIL', null, '6c39b1f5'],
  ['OTHER', 'NA', 'RESOLVE', '7d4ac2a6'], ['ASK', 'NA', null, '8e5bd3b7'],
];
TOUR.forEach((x, i) => mo(24_000 + i * 2_200, x[0], x[1], x[2], x[3]));
mo(43_600, 'OTHER', 'NA', 'RESOLVE', '9f6ce4c8');            // 清幕三的 ASK
// 幕四：风暴密集（0.9s 步·WRITE/RUN 交替）
for (let i = 0; i < 14; i++) mo(46_500 + i * 900, i % 2 ? 'RUN' : 'WRITE', 'OK', null, ((0x20 + i) * 0x1111).toString(16).padStart(8, '0'));
// 幕五：卡碟剧场
mo(60_000, 'OTHER', 'NA', 'STUCK_LOOP', 'aa11bb22');
mo(76_000, 'OTHER', 'NA', 'STUCK_CLEARED', 'aa11bb23');
mo(76_400, 'OTHER', 'NA', 'RESOLVE', 'aa11bb24');            // 解脱和弦
// 幕六/七：稀疏点缀（别抢 wow/T 的主角戏）
mo(83_000, 'READ', 'OK', null, 'b1c2d3e4');
mo(97_000, 'WRITE', 'OK', null, 'c2d3e4f5');
// 幕八：问询（pendingAsk 由 curve 列持续供，重奏由引擎自理）
mo(104_500, 'ASK', 'NA', null, 'd3e4f5a6');
mo(115_500, 'OTHER', 'NA', 'RESOLVE', 'e4f5a6b7');
// 幕九：滑停
mo(116_500, 'OTHER', 'NA', 'DONE', 'f5a6b7c8');
// 幕十一：全家轮唱（1.6s 步）＋收幕
const FIN = [['WRITE','OK',null],['READ','OK',null],['RUN','OK',null],['SAVE','OK',null],['SPAWN','OK',null],
  ['WRITE','FAIL',null],['ASK','NA',null],['OTHER','NA','RESOLVE'],['WRITE','OK',null],['RUN','OK',null],
  ['OTHER','NA','RESOLVE']];
FIN.forEach((x, i) => mo(142_500 + i * 1_600, x[0], x[1], x[2], ((0x60 + i) * 0x1357).toString(16).padStart(8, '0')));
mo(163_000, 'OTHER', 'NA', 'DONE', 'ffee0011');

// —— 九列曲线 ——
const rows = [];
let needle = 0;
const events = M.filter(m => !['STUCK_CLEARED'].includes(m.special)).map(m => m.t);
for (let i = 0; i < N; i++) {
  const t = i * DT;
  let S = 0, T = 0, A = 0, wow = 0, phase = 'IDLE', weather = 'CLEAR', ask = 0;
  let u;
  if ((u = seg(t, 0, 10_000)) !== null) { /* 幕一 全零 */ }
  else if ((u = seg(t, 10_000, 24_000)) !== null) { phase = 'WORKING'; A = lerp(0, 0.75, u); S = lerp(0, 0.5, u); T = lerp(0, 0.3, u); }
  else if ((u = seg(t, 24_000, 46_000)) !== null) { phase = 'WORKING'; weather = 'OVERCAST'; A = 0.6; S = 0.55; T = 0.4 + 0.06 * Math.sin(u * 19); ask = (t >= 39_400 && t < 43_600) ? 1 : 0; }
  else if ((u = seg(t, 46_000, 60_000)) !== null) { phase = 'WORKING'; weather = 'STORM'; A = 1.0; S = 0.9; T = lerp(0.6, 0.88, u) + 0.05 * Math.sin(u * 40); wow = 0.15; }
  else if ((u = seg(t, 60_000, 76_000)) !== null) { phase = 'WORKING'; weather = 'STORM'; A = 0.85; S = 0.8; T = 0.72 + 0.04 * ((i % 9) / 9 - 0.5); wow = 0.3; }
  else if ((u = seg(t, 76_000, 90_000)) !== null) { phase = 'WORKING'; weather = 'RAIN'; A = 0.7; S = 0.6; T = 0.45; wow = u < 0.55 ? lerp(0, 0.8, u / 0.55) : lerp(0.8, 0.3, (u - 0.55) / 0.45); }
  else if ((u = seg(t, 90_000, 104_000)) !== null) {
    phase = 'WORKING'; weather = 'OVERCAST'; A = 0.65; S = 0.6; wow = 0.1;
    const c = Math.floor(u * 7), cu = u * 7 - c;                    // 七小节心电图：锯齿/阶跃/斜坡轮着来
    T = c % 3 === 0 ? (cu < 0.5 ? lerp(0.1, 0.9, cu * 2) : lerp(0.9, 0.1, (cu - 0.5) * 2))
      : c % 3 === 1 ? (cu < 0.5 ? 0.15 : 0.85)
      : 0.5 + 0.4 * Math.sin(cu * Math.PI * 2);
  }
  else if ((u = seg(t, 104_000, 116_000)) !== null) { phase = 'WAITING'; weather = 'OVERCAST'; A = 0.25; S = 0.3; T = 0.35; ask = 1; }
  else if ((u = seg(t, 116_000, 130_000)) !== null) { phase = 'DONE'; A = 0; S = lerp(0.3, 0, u * 3); T = lerp(0.35, 0.05, u * 2); }
  else if ((u = seg(t, 130_000, 142_000)) !== null) { phase = 'WORKING'; weather = 'CLEAR'; A = lerp(0, 0.9, u); S = lerp(0, 0.7, u); T = lerp(0.1, 0.55, u); }
  else if ((u = seg(t, 142_000, 163_000)) !== null) { phase = 'WORKING'; weather = 'STORM'; A = lerp(0.9, 1.0, u); S = lerp(0.7, 0.95, u); T = lerp(0.55, 0.9, u) + 0.05 * Math.sin(u * 34); wow = 0.18; }
  else { phase = 'DONE'; A = 0; S = 0; T = lerp(0.9, 0.05, (t - 163_000) / 5_000); }
  // needle：事件时刻脉冲 + 指数衰减（VU 弹道/魔眼开合的粮食）
  for (const et of events) if (t >= et && t < et + DT) needle = Math.min(1, 0.55 + 0.4 * ((et * 7 % 10) / 10));
  needle *= 0.86;
  if (phase === 'IDLE' || phase === 'DONE') needle *= 0.7;
  rows.push(`${t},${S.toFixed(6)},${Math.max(0, Math.min(1, T)).toFixed(6)},${A.toFixed(6)},${wow.toFixed(6)},${needle.toFixed(6)},${phase},${weather},${ask}`);
}

writeFileSync(join(FIX, 'audit.curve.csv'), 't,S,T,A,wow,needle,phase,weather,pendingAsk\n' + rows.join('\n') + '\n');
writeFileSync(join(FIX, 'audit.moments.csv'), 't,emitT,seq,verb,outcome,m,tags,special,sig,k,clearedBy,slot\n' +
  M.sort((a, b) => a.t - b.t).map(m => `${m.t},${m.t},${seq++},${m.verb},${m.outcome},0.500000,,${m.special},,,,${m.slot}`).join('\n') + '\n');
console.log(`audit tape: ${N} rows / ${M.length} moments / ${DUR / 1000}s -> stage/fixtures/audit.{curve,moments}.csv`);
