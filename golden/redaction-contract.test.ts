// 脱敏契约冻结（M2.6 丙·ADDENDUM_002 增补三——接口先行）。
// 轨丙首日交付：脱敏是全系统「可分享形态」的单一大脑。轨乙的卡片脱敏一律**调用本契约编码**，
// 不得自造口径（增补三.1）；契约 v1 只增不改，破坏性变更须停工上报架构师（增补二.2 精神）。
//
// 契约中枢：redactResult(d: DistillResult, salt?: string): DistillResult
//   —— 见 adapters/claude-jsonl/distill.ts；全文契约见 docs/canon/REDACTION-CONTRACT.md。
// 本测=金夹具冻结：固定盐下 raw→distill→redact→serialize 必逐字节等于在库期望带。
//   redaction 逻辑任何漂移（多抹/漏抹/换算法/改盐式）即打破本测 → 强制走架构师复核，杜绝口径悄悄漂移。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { distillFile, redactResult, serializeTape, parseDistilled } from '../adapters/claude-jsonl/distill.ts';
import type { DistillResult } from '../adapters/claude-jsonl/parse.ts';
import { resolveParams } from '../engine/params.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const SALT = 'FOLEY-REDACT-CONTRACT-v1';                    // 契约固定盐（须与生成器/文档一致）
const rawFixture = join(here, 'fixtures', 'unknown-tool.jsonl');
const expectedPath = join(here, 'fixtures', 'redaction-contract.expected.jsonl');
const params = resolveParams(JSON.parse(readFileSync(join(repoRoot, 'params.json'), 'utf8')));

const redactedText = () => serializeTape(redactResult(distillFile(rawFixture, params), SALT));

describe('脱敏契约 v1 · 金夹具冻结', () => {
  test('冻结：固定盐下产出逐字节等于在库期望带（口径漂移即打破）', () => {
    const got = redactedText();
    const want = readFileSync(expectedPath, 'utf8');
    assert.equal(got, want,
      '脱敏产出与冻结金夹具不符——若为有意口径变更，须更新契约版本＋期望带并过架构师，不得默默改');
  });

  test('确定性：同盐双跑逐字节一致（金夹具可复现的前提）', () => {
    assert.equal(redactedText(), redactedText(), '同盐产出必须确定性');
  });

  test('盐真起效：换盐则加盐字段全变（证明非明文直落）', () => {
    const a = parseDistilled(serializeTape(redactResult(distillFile(rawFixture, params), 'SALT-A')));
    const b = parseDistilled(serializeTape(redactResult(distillFile(rawFixture, params), 'SALT-B')));
    // 自定义工具哈希、sig、targetHash、errClass 均须随盐变（字典反演的堵点）
    const custom = (d: DistillResult) => d.records.find((r) => r.tool && /^t[0-9a-f]+$/.test(r.tool))?.tool;
    assert.notEqual(custom(a), custom(b), '自定义工具名哈希须随盐变');
    const fail = (d: DistillResult) => d.records.find((r) => r.errClass)?.errClass;
    assert.notEqual(fail(a), fail(b), 'errClass 聚类哈希须随盐变');
  });

  test('不变式（契约条款·机器可查）：三向量全堵＋内建白名单保留', () => {
    const d = parseDistilled(redactedText());
    // 向量③ 时间相对化：首事件归 0，无绝对 epoch
    assert.equal(d.meta.stats.firstT, 0, '首事件时间须相对化为 0');
    assert.equal(d.meta.sourceHash, 'redacted', 'sourceHash 不得指纹化源文件');
    for (const r of d.records) assert.ok(r.t < 1e9, `记录 t 须为相对偏移，实测 ${r.t}`);
    for (const e of d.meta.episodes) assert.ok(e.startT < 1e9 && e.endT < 1e9, 'episodes 时间须相对化');
    // 向量② 工具名：内建保留、其余（含 MCP 自定义）加盐哈希
    assert.ok(d.records.some((r) => r.tool === 'Read' || r.tool === 'Bash' || r.tool === 'Edit'),
      '内建工具名须保留（无隐私）');
    assert.ok(!d.records.some((r) => r.tool === 'FrobnicateWidget'), '自定义工具名不得明文落带');
    assert.ok(d.records.some((r) => r.tool && /^t[0-9a-f]+$/.test(r.tool)), '自定义工具须以加盐哈希在场');
    // 向量① errClass：加盐聚类 id（零模板文本）
    for (const r of d.records) if (r.errClass) assert.match(r.errClass, /^e[0-9a-f]+$/, 'errClass 须为聚类哈希');
    // distiller 署名带 +redact（下游可辨形态）
    assert.match(String(d.meta.distiller), /\+redact$/, 'distiller 须署名 +redact');
  });

  test('源码卫兵：内建工具白名单不得私自增删（契约稳定面）', () => {
    const src = readFileSync(join(repoRoot, 'adapters', 'claude-jsonl', 'distill.ts'), 'utf8');
    for (const t of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Edit', 'Write', 'Bash', 'Task', 'Agent']) {
      assert.ok(src.includes(`'${t}'`), `内建白名单须含 ${t}（改白名单=改契约，须过架构师）`);
    }
  });
});
