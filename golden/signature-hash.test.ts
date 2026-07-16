// 工件签署绑哈希闸·自证（席三·诚约族 4/4·契约 docs/canon/SIGNATURE-HASH-CONTRACT.md §7 八用例）：
// 用合成签署文档＋合成 subject＋临时 git 仓驱 verifyEntry（不依赖真 B8 签署——B8 重签属审计席动作·契约
// §6，本测只证**闸逻辑**红/绿正确）。纯 node·只读。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
// @ts-ignore -- .mjs 闸无 .d.ts（脚本域）；verifyEntry 形状：(root, entry) => {id,valid,reasons[]}
import { verifyEntry } from '../scripts/check-signature-hashes.mjs';

type Entry = { id: string; doc: string; scope: string; subjects: string[] };
type Result = { id: string; valid: boolean; reasons: string[] };
const verify = (root: string, entry: Entry): Result => verifyEntry(root, entry) as Result;

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

test('① 完整有效 → 绿（七层全过）', () => {
  const s = setupValid();
  try { const v = verify(s.root, s.entry); assert.ok(v.valid, `应绿·实红：${v.reasons.join('; ')}`); } finally { s.cleanup(); }
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

test('⑤ signedCommit 改成短 SHA → 红；改成不存在的 40-hex → 红（§2 拒短·§4.4 须存在且祖先）', () => {
  const s = setupValid();
  try {
    const shortSha = structuredClone(s.block); shortSha.signedCommit = s.commit.slice(0, 12);
    s.writeDoc(shortSha);
    assert.equal(verify(s.root, s.entry).valid, false, '短 SHA 应红');
    const ghost = structuredClone(s.block); ghost.signedCommit = 'a'.repeat(40);   // 合格式但仓中无此 commit
    s.writeDoc(ghost);
    assert.equal(verify(s.root, s.entry).valid, false, '不存在的 commit 应红');
  } finally { s.cleanup(); }
});

test('⑥ subjects 少一件/多一件/换序 → 红（集合须与登记项一致·§4.2）', () => {
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
  } finally { s.cleanup(); }
});

test('⑦ 工作树只改 subject、未提交 → 红（磁盘不符机器块·§4.7）', () => {
  const s = setupValid();
  try {
    writeFileSync(join(s.root, s.subPath), 't,v\n0,0.9\n');   // 只改磁盘·不提交（HEAD 仍原·磁盘变）
    const v = verify(s.root, s.entry);
    assert.equal(v.valid, false, v.reasons.join('; '));
  } finally { s.cleanup(); }
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
