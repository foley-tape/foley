// M0 金测试（§10）：未知工具 → OTHER 不 crash。
// 附带若干 as-built 断言（已知映射、outcome、坏行计数），为 M1 兜底。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseTapeFile } from '../adapters/claude-jsonl/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'unknown-tool.jsonl');

test('未知工具 → OTHER，且解析不抛异常（金测试）', () => {
  const res = parseTapeFile(fixture); // 不得抛
  const frob = res.moments.find((m) => m.sig && m.verb === 'OTHER' && !m.special);
  assert.ok(frob, '未知工具应产出一条 moment');
  assert.equal(frob!.verb, 'OTHER');
  assert.equal(res.stats.unknownTools['FrobnicateWidget'], 1);
});

test('坏行被计数、跳过、不 crash', () => {
  const res = parseTapeFile(fixture);
  assert.equal(res.stats.badLines, 1, '恰有一行非法 JSON');
  assert.ok(res.stats.parseCoverage < 1);
});

test('已知工具动词映射正确（as-built）', () => {
  const res = parseTapeFile(fixture);
  const byVerb = (v: string) => res.moments.filter((m) => m.verb === v && !m.special);
  assert.equal(byVerb('READ').length, 1, 'Read → READ');
  assert.equal(byVerb('WRITE').length, 1, 'Edit → WRITE');
  assert.equal(byVerb('SAVE').length, 1, 'Bash git commit → SAVE');
});

test('outcome：is_error→FAIL，正常→OK', () => {
  const res = parseTapeFile(fixture);
  const edit = res.moments.find((m) => m.verb === 'WRITE');
  assert.equal(edit!.outcome, 'FAIL', 'Edit is_error:true → FAIL');
  const read = res.moments.find((m) => m.verb === 'READ');
  assert.equal(read!.outcome, 'OK');
});

test('标点：SESSION_START 首发，DONE 收尾', () => {
  const res = parseTapeFile(fixture);
  assert.equal(res.moments[0]!.special, 'SESSION_START');
  assert.ok(res.moments.some((m) => m.special === 'DONE'));
});

test('幅度 m：READ 2KB 落在 (0,1)，对数归一', () => {
  const res = parseTapeFile(fixture);
  const read = res.moments.find((m) => m.verb === 'READ')!;
  // ln(1+2)/ln(1+100) ≈ 0.238
  assert.ok(read.m > 0.2 && read.m < 0.3, `m=${read.m}`);
});
