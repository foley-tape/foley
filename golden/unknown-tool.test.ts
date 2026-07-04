// M0 金测试：未知工具 → OTHER 不 crash。附 as-built 断言（映射/outcome/坏行/幅度）。
// 蒸馏口径：distillFile → {records, meta}；m 由 momentOf 消费侧算。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { distillFile, momentOf } from '../adapters/claude-jsonl/index.ts';
import { resolveParams } from '../engine/params.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'unknown-tool.jsonl');
const params = resolveParams(JSON.parse(readFileSync(join(here, '..', 'params.json'), 'utf8')));

test('未知工具 → OTHER，且蒸馏不抛异常（金测试）', () => {
  const d = distillFile(fixture, params); // 不得抛
  const frob = d.records.find((r) => r.tool === 'FrobnicateWidget');
  assert.ok(frob, '未知工具应产出一条记录');
  assert.equal(frob!.verb, 'OTHER');
  assert.equal(d.meta.stats.unknownTools['FrobnicateWidget'], 1);
});

test('坏行被计数、跳过、不 crash', () => {
  const d = distillFile(fixture, params);
  assert.equal(d.meta.stats.badLines, 1, '恰有一行非法 JSON');
  assert.ok(d.meta.stats.parseCoverage < 1);
});

test('已知工具动词映射正确（as-built）', () => {
  const d = distillFile(fixture, params);
  const byVerb = (v: string) => d.records.filter((r) => r.verb === v && !r.special);
  assert.equal(byVerb('READ').length, 1, 'Read → READ');
  assert.equal(byVerb('WRITE').length, 1, 'Edit → WRITE');
  assert.equal(byVerb('SAVE').length, 1, 'Bash git commit → SAVE');
});

test('outcome：is_error→FAIL，正常→OK', () => {
  const d = distillFile(fixture, params);
  const edit = d.records.find((r) => r.verb === 'WRITE');
  assert.equal(edit!.outcome, 'FAIL', 'Edit is_error:true → FAIL');
  const read = d.records.find((r) => r.verb === 'READ');
  assert.equal(read!.outcome, 'OK');
});

test('标点：SESSION_START 首发，DONE 收尾', () => {
  const d = distillFile(fixture, params);
  assert.equal(d.records[0]!.special, 'SESSION_START');
  assert.ok(d.records.some((r) => r.special === 'DONE'));
});

test('幅度 m：READ 2KB 落在 (0,1)，对数归一（消费侧算）', () => {
  const d = distillFile(fixture, params);
  const read = d.records.find((r) => r.verb === 'READ')!;
  assert.equal(read.mKind, 'kb');
  const m = momentOf(read, params).m; // ln(1+2)/ln(1+100) ≈ 0.238
  assert.ok(m > 0.2 && m < 0.3, `m=${m}`);
});

test('失败读兜底幅度：FAIL 且实测≈0 → m=failDefault(0.3)（裁决①）', () => {
  const d = distillFile(fixture, params);
  const editFail = d.records.find((r) => r.verb === 'WRITE' && r.outcome === 'FAIL')!;
  const m = momentOf(editFail, params).m;
  assert.ok(m >= params.amplitude.failDefault - 1e-9, `失败操作 m=${m} 应≥failDefault`);
});
