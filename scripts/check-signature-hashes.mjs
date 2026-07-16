#!/usr/bin/env node
// 工件签署绑哈希闸（席三·诚约族 4/4·逐字机器化 docs/canon/SIGNATURE-HASH-CONTRACT.md v1）。
//
// 席一 item6 冻结契约「交席三逐字机器化」。本闸**只读验证**：不改签署、不回填哈希、不自动生成 PASS
// （契约 §7）。加入 prepublishOnly，不入默认 npm test（跨席红态归 CI 档·工作法法13）。
//
// 一份签署有效 ⟺ 契约 §4 七层全过：文档存机器块唯一且 JSON 可解析／登记项 id·scope·subjects.path 逐字
// 对齐／verdict=PASS／signedCommit 存在且为 HEAD 祖先／每 subject 的 signedCommit:path 与 HEAD:path 的
// blob 字节数+SHA-256 等于机器块／磁盘文件为普通文件其字节数+SHA-256 仍等于机器块。任一层不符即失效。
// 从 Git blob 直接取数（§4·避换行/过滤误当原件）。
//
// 用法：node scripts/check-signature-hashes.mjs [--root <repoRoot>]（--root 供对审/测试指别处工作树）。
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute } from 'node:path';

// ── v1 受管登记表（契约 §5·逐字镜像；新增登记项须先改契约 §5 表再改此处·不得通配推定）──
export const REGISTRY = [
  {
    id: 'B8_CAPTAIN_SIX_VECTOR',
    doc: 'audit/B8_captain第六带_六向量扫描签署.md',
    scope: 'redaction-six-vector/v1',
    subjects: ['stage/fixtures/captain.curve.csv', 'stage/fixtures/captain.moments.csv'],
  },
];
const SCHEMA = 'foley-signature/v1';
const ALLOWED_KEYS = ['schema', 'id', 'scope', 'verdict', 'signer', 'signedAt', 'signedCommit', 'subjects'];
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] }); }
function gitText(root, args) { return git(root, args).toString('utf8').trim(); }

// 提取受管文档内**恰一个**机器块的 JSON（契约 §2）——严格 begin/end 与 ```json 围栏
function extractBlock(docText) {
  const begins = [...docText.matchAll(/<!--\s*FOLEY-SIGNATURE:BEGIN\s*-->/g)];
  const ends = [...docText.matchAll(/<!--\s*FOLEY-SIGNATURE:END\s*-->/g)];
  if (begins.length !== 1 || ends.length !== 1) return { err: `机器块须恰一个（见 BEGIN×${begins.length} END×${ends.length}）` };
  const inner = docText.slice(begins[0].index + begins[0][0].length, ends[0].index);
  const fence = inner.match(/```json\s*([\s\S]*?)```/);
  if (!fence) return { err: '机器块内无 ```json 围栏' };
  let json;
  try { json = JSON.parse(fence[1]); } catch (e) { return { err: `机器块 JSON 不可解析：${e.message}` }; }
  return { json };
}

// 机器块字段纪律（契约 §2）——返回 reasons[]（空=过）
function checkFormat(b, entry) {
  const r = [];
  const keys = Object.keys(b);
  if (keys.length !== ALLOWED_KEYS.length || !ALLOWED_KEYS.every(k => keys.includes(k)))
    r.push(`顶层键须恰为 ${ALLOWED_KEYS.join('/')}；实得 ${keys.join('/')}`);
  if (b.schema !== SCHEMA) r.push(`schema 须 "${SCHEMA}"`);
  if (b.id !== entry.id) r.push(`id 须逐字 "${entry.id}"`);
  if (b.scope !== entry.scope) r.push(`scope 须逐字 "${entry.scope}"`);
  if (b.verdict !== 'PASS') r.push('verdict 须 "PASS"');
  if (typeof b.signer !== 'string' || !b.signer.trim()) r.push('signer 须非空席位标识');
  if (typeof b.signedAt !== 'string' || !ISO_UTC.test(b.signedAt)) r.push('signedAt 须 UTC ISO-8601');
  if (typeof b.signedCommit !== 'string' || !HEX40.test(b.signedCommit)) r.push('signedCommit 须完整 40 位小写十六进制（拒短 SHA/分支/HEAD）');
  if (!Array.isArray(b.subjects) || b.subjects.length === 0) { r.push('subjects 不得为空'); return r; }
  const paths = b.subjects.map(s => s && s.path);
  for (const s of b.subjects) {
    if (!s || typeof s.path !== 'string' || !s.path) { r.push('subject.path 缺失'); continue; }
    if (isAbsolute(s.path) || s.path.split('/').some(seg => seg === '' || seg === '.' || seg === '..'))
      r.push(`subject.path 须仓内相对无空段/./..：${s.path}`);
    if (!Number.isSafeInteger(s.bytes) || s.bytes < 0) r.push(`subject.bytes 须非负安全整数：${s.path}`);
    if (typeof s.sha256 !== 'string' || !HEX64.test(s.sha256)) r.push(`subject.sha256 须完整 64 位小写十六进制：${s.path}`);
  }
  const sorted = [...paths].sort();
  if (new Set(paths).size !== paths.length) r.push('subjects.path 须唯一');
  if (JSON.stringify(paths) !== JSON.stringify(sorted)) r.push('subjects.path 须按字典序排列');
  // 登记项 subjects.path 集合须与机器块完全一致（§4.2）
  if (JSON.stringify(sorted) !== JSON.stringify([...entry.subjects].sort()))
    r.push(`subjects.path 集合须与登记项完全一致：登记 ${entry.subjects.join(',')} · 机器块 ${sorted.join(',')}`);
  return r;
}

export function verifyEntry(root, entry) {
  const reasons = [];
  const docPath = join(root, entry.doc);
  let docText;
  try { docText = readFileSync(docPath, 'utf8'); } catch { return { id: entry.id, valid: false, reasons: [`受管文档不存在：${entry.doc}`] }; }
  const { json: b, err } = extractBlock(docText);
  if (err) return { id: entry.id, valid: false, reasons: [err] };
  reasons.push(...checkFormat(b, entry));
  if (reasons.length) return { id: entry.id, valid: false, reasons };  // 格式先过再验哈希

  // signedCommit 存在且为 HEAD 祖先（§4.4）
  let headSha;
  try { headSha = gitText(root, ['rev-parse', 'HEAD']); } catch { return { id: entry.id, valid: false, reasons: ['非 git 工作树·无法验 commit'] }; }
  try { const t = gitText(root, ['cat-file', '-t', b.signedCommit]); if (t !== 'commit') reasons.push('signedCommit 非 commit 对象'); }
  catch { reasons.push(`signedCommit 不存在于仓中：${b.signedCommit}`); }
  if (!reasons.length) {
    try { execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', b.signedCommit, headSha], { stdio: 'ignore' }); }
    catch { reasons.push(`signedCommit 非当前 HEAD 祖先（变基/重写即须重签）：${b.signedCommit}`); }
  }
  if (reasons.length) return { id: entry.id, valid: false, reasons };

  // 逐 subject：signedCommit:path / HEAD:path / 磁盘 三处 blob 字节数+SHA-256 皆须等于机器块（§4.5-7）
  for (const s of b.subjects) {
    const blobAt = (ref) => {
      const bytes = Number(gitText(root, ['cat-file', '-s', `${ref}:${s.path}`]));
      const hash = sha256(git(root, ['cat-file', 'blob', `${ref}:${s.path}`]));
      return { bytes, hash };
    };
    let sc, hd;
    try { sc = blobAt(b.signedCommit); } catch { reasons.push(`signedCommit 树中无 ${s.path}`); continue; }
    if (sc.bytes !== s.bytes || sc.hash !== s.sha256) reasons.push(`signedCommit:${s.path} 字节/哈希不符机器块`);
    try { hd = blobAt('HEAD'); } catch { reasons.push(`HEAD 树中无 ${s.path}（工件被删/移·须重签）`); continue; }
    if (hd.bytes !== s.bytes || hd.hash !== s.sha256) reasons.push(`HEAD:${s.path} 字节/哈希不符机器块（工件已换·须重签）`);
    // 磁盘（§4.7）：普通文件·字节+哈希仍等于机器块
    try {
      const st = statSync(join(root, s.path));
      if (!st.isFile()) { reasons.push(`磁盘 ${s.path} 非普通文件`); continue; }
      const disk = readFileSync(join(root, s.path));
      if (disk.length !== s.bytes || sha256(disk) !== s.sha256) reasons.push(`磁盘 ${s.path} 字节/哈希不符（未提交改动·须重签）`);
    } catch { reasons.push(`磁盘 ${s.path} 读取失败`); }
  }
  return { id: entry.id, valid: reasons.length === 0, reasons };
}

// ── main：跑全登记表；任一失效即红（契约 §6：B8 未重签前 PENDING·此闸应红）──
function main() {
  const rootArg = process.argv.indexOf('--root');
  const root = rootArg >= 0 ? process.argv[rootArg + 1] : process.cwd();
  let bad = 0;
  for (const entry of REGISTRY) {
    const v = verifyEntry(root, entry);
    if (v.valid) { console.log(`✓ ${v.id} 签署有效（工件身份绑定成立）`); }
    else { bad++; console.error(`✗ ${v.id} 签署失效：`); for (const r of v.reasons) console.error(`    · ${r}`); }
  }
  if (bad) { console.error(`\n${bad}/${REGISTRY.length} 项签署失效——发布诚约闸红（契约 §6：重签由完成扫描的审计席明确提交，闸不自动回填）。`); process.exit(1); }
  console.log(`\n✓ 全部 ${REGISTRY.length} 项工件签署绑哈希有效。`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
