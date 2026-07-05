// 模板契约测试（SOUND-R3 §4.1 立法；EAR-11 教训制度化）。
// probe.ts 页壳是模板串，tsc 不查——本测试静态断言模板内的跨界引用与类型面一致：
// ① bt.* ⊆ core.d.ts BedTargets 字段集（EAR-11 黄线案：v2 重构漏改 bt.s1 → rAF 首帧即抛）。
// ② engine.* ⊆ graph.d.ts SoundEngine 成员集。
// ③ sound/*.js 的 import 禁 as 别名（NIGHT-2 审计 coreDegreeHz 案：页壳剥 import 行逐字拼接，
//    别名在页内无定义——播放中首个拨弦即 ReferenceError、调度链断）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(here, '..', p), 'utf8');

/** 从 .d.ts 抽接口块的字段名（顶层 `name:` 与 `name(` 声明）。 */
function membersOf(dts: string, iface: string): Set<string> {
  const m = dts.match(new RegExp(`interface ${iface}[^{]*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(m, `${iface} 接口未找到`);
  const out = new Set<string>();
  for (const line of m![1]!.split('\n')) {
    const f = line.match(/^\s*(?:readonly\s+)?(\w+)\s*[?:(]/);
    if (f) out.add(f[1]!);
  }
  return out;
}

test('契约① probe 页壳 bt.* ⊆ BedTargets 字段集（模板串的 tsc 盲区执法）', () => {
  const probe = read('cli/probe.ts');
  const fields = membersOf(read('sound/core.d.ts'), 'BedTargets');
  const used = new Set([...probe.matchAll(/\bbt\.(\w+)/g)].map((m) => m[1]!));
  const orphans = [...used].filter((u) => !fields.has(u));
  assert.deepEqual(orphans, [], `页壳引用了 BedTargets 不存在的字段：${orphans.join(',')}（EAR-11 黄线案同型）`);
});

test('契约② probe 页壳 engine.* ⊆ SoundEngine 成员集', () => {
  const probe = read('cli/probe.ts');
  const members = membersOf(read('sound/graph.d.ts'), 'SoundEngine');
  const used = new Set([...probe.matchAll(/\bengine\.(\w+)/g)].map((m) => m[1]!));
  const orphans = [...used].filter((u) => !members.has(u));
  assert.deepEqual(orphans, [], `页壳引用了 SoundEngine 不存在的成员：${orphans.join(',')}`);
});

test('契约③ sound/*.js import 禁 as 别名（页壳剥 import 拼接的世界里别名=未定义符号）', () => {
  for (const f of ['sound/core.js', 'sound/graph.js', 'sound/assets.js']) {
    const src = read(f);
    for (const line of src.split('\n')) {
      if (!line.startsWith('import ')) continue;
      assert.ok(!/\bas\s+\w+/.test(line), `${f} 的 import 含 as 别名（NIGHT-2 coreDegreeHz 案同型）：${line.trim()}`);
    }
  }
});

test('契约④ 页壳内嵌调用的 sound 真源顶层符号必在真源中定义（拼接闭包自洽）', () => {
  const probe = read('cli/probe.ts');
  const inlined = ['sound/core.js', 'sound/assets.js', 'sound/graph.js'].map(read).join('\n');
  // 页壳模板里直接调用的真源 API（薄壳只许用这些口）
  for (const sym of ['bedTargets', 'buildEngine', 'assetsFromEmbedded', 'fnvBytes', 'sampleAt']) {
    assert.ok(probe.includes(sym), `页壳未用 ${sym}？——若已改名，同步本清单`);
    assert.ok(new RegExp(`(?:^|\\n)(?:export )?(?:function|const|class)\\s+${sym}\\b`).test(inlined),
      `${sym} 在内嵌真源中无顶层定义——页内将是 ReferenceError`);
  }
});
