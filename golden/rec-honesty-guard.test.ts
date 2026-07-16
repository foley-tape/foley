// REC 诚实·单一写者源守（席三·状态族/honesty3 整合闸·夜审「死 Claude 仍亮 REC」的结构面）：
//
// deriveMachineState 的**函数诚实**由 golden/derive.test.ts（3072 穷举·非法帧零命中）钉死——REC/琥珀/死相
// 在函数上不可能说谎（席二工单3·derive.test.ts 注「席三之闸可直接引用」）。本闸守**渲染消费侧不绕过它**：
//   ① REC 灯（body.rec-live）只能是 d.recording 的纯投影——无 add/remove 无条件点亮、无第二事实源；
//   ② 写 REC 的文件都是 deriveMachineState 的消费者（无旁路文件私点 REC——夜审 D-5「检测的是 tailer 不是
//      producer」之结构复发面）；
//   ③ derive 每一返回键都在渲染侧被消费（derive.js:38「不产无运行时消费者的死输出」的对偶：无出被丢成陈灯）。
//
// 静态源守（读 stage/js/·不执行）·**只读不改席二状态机码**（测/改分离）。新增 REC 写者/derive 出＝须过此审。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const jsDir = new URL('../stage/js/', import.meta.url);
const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));
const src = (f: string) => readFileSync(new URL(f, jsDir), 'utf8');
// 朴素去注释（源守用·非执行）：块注释＋行注释——避免 main.js 注释里的 "rec-live" 被误计为写者
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('① REC 单一写者：rec-live 全域只由 classList.toggle(_, d.recording) 点亮（无 add/remove 无条件·无异源）', () => {
  const writes: { file: string; method: string; arg: string }[] = [];
  for (const f of files) {
    for (const m of strip(src(f)).matchAll(/classList\s*\.\s*(add|remove|toggle)\s*\(\s*['"]rec-live['"]\s*(?:,\s*([^)]+?))?\s*\)/g)) {
      writes.push({ file: f, method: m[1]!, arg: (m[2] ?? '').trim() });
    }
  }
  assert.ok(writes.length >= 1, '至少一处 rec-live 写者（否则 REC 灯永灭＝另一种谎）');
  for (const w of writes) {
    assert.equal(w.method, 'toggle', `${w.file}: rec-live 须 toggle 二态——add/remove 即无条件点亮/熄灭·绕过 derive`);
    assert.equal(w.arg, 'd.recording', `${w.file}: rec-live 须由 d.recording 驱动·异源＝第二事实源（死 Claude 仍亮 REC 之温床）`);
  }
});

test('② REC 写者皆 derive 消费者：仅 main.js/demo-boot.js 写 REC·且都 import+调 deriveMachineState（无旁路私点）', () => {
  const recWriters = files.filter(f => /classList\s*\.\s*\w+\s*\(\s*['"]rec-live['"]/.test(strip(src(f)))).sort();
  assert.deepEqual(recWriters, ['demo-boot.js', 'main.js'], '仅两正门写 REC——新写者文件须过审入此白名单');
  for (const f of recWriters) {
    const code = src(f);
    assert.match(code, /import\s*\{[^}]*\bderiveMachineState\b[^}]*\}\s*from\s*['"]\.\/derive\.js['"]/, `${f}: 须 import deriveMachineState`);
    assert.match(strip(code), /\bderiveMachineState\s*\(/, `${f}: 须实调 deriveMachineState（非仅 import）`);
  }
});

test('③ derive 五出无孤儿：deriveMachineState 每返回键皆在 main.js 被 d.<键> 消费（无死输出·契约 R6 对偶）', () => {
  const derive = src('derive.js');
  const retBody = derive.slice(derive.indexOf('return {'));          // 全文件唯一 return（deriveMachineState）
  const keys = [...retBody.matchAll(/^ {4}(\w+)\s*[,:]/gm)].map(m => m[1]!);   // 顶层键（4 空格缩进·shorthand 或 key:）
  assert.ok(keys.length >= 5 && keys.includes('recording') && keys.includes('settled'), `抽到 derive 出键应含五：${keys.join(',')}`);
  const consumer = strip(src('main.js'));
  for (const k of keys) {
    assert.match(consumer, new RegExp(`\\bd\\.${k}\\b`), `derive 出 '${k}' 未在 main.js 被 d.${k} 消费——死输出/陈灯风险（契约 R6 对偶）`);
  }
});
