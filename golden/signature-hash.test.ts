// 工件签署绑哈希闸·自证（席三·诚约族 4/4·契约 docs/canon/SIGNATURE-HASH-CONTRACT.md §7 用例＋加固负控）：
// 用合成签署文档＋合成 subject＋临时 git 仓驱 verifyEntry（不依赖真 B8 签署——B8 重签属审计席动作·契约
// §6，本测只证**闸逻辑**红/绿正确）。纯 node·只读。加固（船长令 2026-07-16）：法典缺席 loadRegistry 拒绿·
// 符号链接 subject（非普通文件）·现存非祖先 commit·双 subject 换序 三负控。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
// @ts-ignore -- .mjs 闸无 .d.ts（脚本域）；verifyEntry:(root,entry)=>{id,valid,reasons[]}·loadRegistry:(root)=>{registry?,err?}
import { verifyEntry, loadRegistry } from '../scripts/check-signature-hashes.mjs';

type Entry = { id: string; doc: string; scope: string; subjects: string[] };
type Result = { id: string; valid: boolean; reasons: string[] };
const verify = (root: string, entry: Entry): Result => verifyEntry(root, entry) as Result;
const load = (root: string): { registry?: Entry[]; err?: string } => loadRegistry(root) as { registry?: Entry[]; err?: string };

const g = (root: string, args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');

// 造一枚「完整有效」的合成签署：临时 git 仓＋提交 subject＋写机器块。返回把手供各用例改坏。
function setupValid() {
  const root = mkdtempSync(join(tmpdir(), 'sig-'));
  g(root, ['init', '-q']);
  g(root, ['config', 'user.email', 't@t']); g(root, ['config', 'user.name', 't']);
  g(root, ['config', 'commit.gpgsign', 'false']);
  const subPath = 'stage/fixtures/x.csv';
  execFileSync('mkdir', ['-p', join(root, 'stage', 'fixtures')]);
  writeFileSync(join(root, subPath), 't,v\n0,0.5\n');
  g(root, ['add', '-A']); g(root, ['commit', '-q', '-m', 'subject']);
  const commit = g(root, ['rev-parse', 'HEAD']);
  const bytes = Number(g(root, ['cat-file', '-s', `${commit}:${subPath}`]));
  const sha = sha256(execFileSync('git', ['-C', root, 'cat-file', 'blob', `${commit}:${subPath}`]));
  const entry: Entry = { id: 'X_SIG', doc: 'sign.md', scope: 'test/v1', subjects: [subPath] };
  const block = {
    schema: 'foley-signature/v1', id: 'X_SIG', scope: 'test/v1', verdict: 'PASS',
    signer: 'seat3', signedAt: '2026-07-16T00:00:00Z', signedCommit: commit,
    subjects: [{ path: subPath, bytes, sha256: sha }],
  };
  const writeDoc = (b: unknown) => writeFileSync(join(root, 'sign.md'),
    `# 签署\n\n<!-- FOLEY-SIGNATURE:BEGIN -->\n\`\`\`json\n${JSON.stringify(b, null, 2)}\n\`\`\`\n<!-- FOLEY-SIGNATURE:END -->\n`);
  writeDoc(block);
  return { root, entry, block, subPath, commit, writeDoc, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('① 完整有效 → 绿（七层全过）＋法典缺席 loadRegistry 拒绿·在场则从 §5 解析登记表', () => {
  const s = setupValid();
  try {
    const v = verify(s.root, s.entry);
    assert.ok(v.valid, `应绿·实红：${v.reasons.join('; ')}`);
    // 加固：本合成仓无签名契约正文（法典）→ loadRegistry 拒绿（不得在法典缺席时冒充「无失效」放行）
    assert.ok(load(s.root).err, '法典缺席时 loadRegistry 须报错·闸拒绿');
    // 写合成法典 §5 表 → loadRegistry 从 §5 解析出受管登记表（非硬编码）
    execFileSync('mkdir', ['-p', join(s.root, 'docs', 'canon')]);
    writeFileSync(join(s.root, 'docs/canon/SIGNATURE-HASH-CONTRACT.md'),
      '# 契约\n\n## 5. 受管登记表\n\n| id | 签署文档 | scope | subjects |\n|---|---|---|---|\n| `X_SIG` | `sign.md` | `test/v1` | `stage/fixtures/x.csv` |\n\n## 6. 尾\n');
    const reg = load(s.root);
    assert.ok(!reg.err && reg.registry?.length === 1 && reg.registry[0]!.id === 'X_SIG', `法典在场→§5 解析登记表：${reg.err ?? JSON.stringify(reg.registry)}`);
    assert.deepEqual(reg.registry![0]!.subjects, ['stage/fixtures/x.csv'], 'subjects 由 §5 「、」分隔解析');
  } finally { s.cleanup(); }
});

test('② 删除机器块 → 红', () => {
  const s = setupValid();
  try {
    writeFileSync(join(s.root, 'sign.md'), '# 签署\n\n（无机器块）\n');
    assert.equal(verify(s.root, s.entry).valid, false);
  } finally { s.cleanup(); }
});

test('③ SHA-256 改一位 → 红', () => {
  const s = setupValid();
  try {
    const bad = structuredClone(s.block);
    const h = bad.subjects[0]!.sha256; bad.subjects[0]!.sha256 = (h[0] === 'a' ? 'b' : 'a') + h.slice(1);
    s.writeDoc(bad);
    assert.equal(verify(s.root, s.entry).valid, false);
  } finally { s.cleanup(); }
});

test('④ subject 文件改一字节并提交 → 红（HEAD:path 不符机器块·§4.6）', () => {
  const s = setupValid();
  try {
    writeFileSync(join(s.root, s.subPath), 't,v\n0,0.6\n');   // 改内容
    g(s.root, ['add', '-A']); g(s.root, ['commit', '-q', '-m', 'tamper']);
    const v = verify(s.root, s.entry);
    assert.equal(v.valid, false, v.reasons.join('; '));
  } finally { s.cleanup(); }
});

test('⑤ signedCommit 短 SHA/不存在 40-hex/**现存非祖先 commit** → 皆红（§2 拒短·§4.4 须存在且 HEAD 祖先）', () => {
  const s = setupValid();
  try {
    const shortSha = structuredClone(s.block); shortSha.signedCommit = s.commit.slice(0, 12);
    s.writeDoc(shortSha);
    assert.equal(verify(s.root, s.entry).valid, false, '短 SHA 应红');
    const ghost = structuredClone(s.block); ghost.signedCommit = 'a'.repeat(40);   // 合格式但仓中无此 commit
    s.writeDoc(ghost);
    assert.equal(verify(s.root, s.entry).valid, false, '不存在的 commit 应红');
    // 现存非祖先：造子提交 C2 再 reset --hard 回 C1（C2 存在于对象库但非 HEAD 祖先·工件仍原·sign.md 未跟踪存活）
    g(s.root, ['commit', '-q', '--allow-empty', '-m', 'C2']);
    const c2 = g(s.root, ['rev-parse', 'HEAD']);
    g(s.root, ['reset', '-q', '--hard', s.commit]);
    assert.equal(g(s.root, ['cat-file', '-t', c2]), 'commit', '前置：C2 确存在于对象库');
    const nonAnc = structuredClone(s.block); nonAnc.signedCommit = c2; s.writeDoc(nonAnc);
    assert.equal(verify(s.root, s.entry).valid, false, '现存但非 HEAD 祖先的 commit 应红（变基/重写即须重签）');
  } finally { s.cleanup(); }
});

test('⑥ subjects 多一件/空/**双 subject 换序（非字典序）** → 皆红（§2 须按字典序·§4.2 集合一致）', () => {
  const s = setupValid();
  try {
    const more = structuredClone(s.block);
    more.subjects.push({ path: 'stage/fixtures/y.csv', bytes: 1, sha256: 'e'.repeat(64) });
    more.subjects.sort((a, b) => a.path < b.path ? -1 : 1);
    s.writeDoc(more);
    assert.equal(verify(s.root, s.entry).valid, false, '多一件应红');
    const none = structuredClone(s.block); none.subjects = [];
    s.writeDoc(none);
    assert.equal(verify(s.root, s.entry).valid, false, '空 subjects 应红');
    // 双 subject 换序：两件路径合法、集合与登记一致，唯**顺序非字典序** → §2 排序执法红（隔离换序为唯一因）
    const reorder = structuredClone(s.block);
    reorder.subjects = [
      { path: 'stage/fixtures/x.csv', bytes: s.block.subjects[0]!.bytes, sha256: s.block.subjects[0]!.sha256 },
      { path: 'stage/fixtures/a.csv', bytes: 1, sha256: 'b'.repeat(64) },   // a.csv 应排在 x.csv 前·此处倒置
    ];
    const twoEntry: Entry = { ...s.entry, subjects: ['stage/fixtures/a.csv', 'stage/fixtures/x.csv'] };
    s.writeDoc(reorder);
    const v = verify(s.root, twoEntry);
    assert.equal(v.valid, false, '换序应红');
    assert.ok(v.reasons.some(r => r.includes('字典序')), `红因须含「字典序」·实得：${v.reasons.join('; ')}`);
  } finally { s.cleanup(); }
});

test('⑦ 工作树只改 subject 未提交 → 红（磁盘不符·§4.7）；**符号链接 subject** → 红（非普通文件·lstat 不跟随）', () => {
  const s = setupValid();
  try {
    writeFileSync(join(s.root, s.subPath), 't,v\n0,0.9\n');   // 只改磁盘·不提交（HEAD 仍原·磁盘变）
    assert.equal(verify(s.root, s.entry).valid, false, '未提交磁盘改动应红');
  } finally { s.cleanup(); }
  // 符号链接：git blob 仍是原文件（signedCommit/HEAD 过），但磁盘处为 symlink——lstat 见 symlink 即非普通文件拒
  const s2 = setupValid();
  try {
    rmSync(join(s2.root, s2.subPath));
    symlinkSync(join(s2.root, 'sign.md'), join(s2.root, s2.subPath));   // 指向仓内任意真文件·lstat 仍见 symlink
    const v = verify(s2.root, s2.entry);
    assert.equal(v.valid, false, '符号链接 subject 应红');
    assert.ok(v.reasons.some(r => r.includes('普通文件')), `红因须含「普通文件」·实得：${v.reasons.join('; ')}`);
  } finally { s2.cleanup(); }
});

test('⑧ 恢复合法机器块与原件 → 再绿', () => {
  const s = setupValid();
  try {
    // 先坏（改 SHA）再证红，再复原机器块，证复绿
    const bad = structuredClone(s.block); bad.subjects[0]!.sha256 = 'f'.repeat(64); s.writeDoc(bad);
    assert.equal(verify(s.root, s.entry).valid, false);
    s.writeDoc(s.block);
    assert.ok(verify(s.root, s.entry).valid, '恢复后应复绿');
  } finally { s.cleanup(); }
});
