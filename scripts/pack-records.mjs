// Releases 资产打包（M2.4 §A.4/§0.3 npm 减重令：唱片不进 tarball，音频资产挂 GitHub Releases）。
// 用法：node scripts/pack-records.mjs [--repo owner/name] [--tag records-v1]
// 产出 dist-records/：mp3 副本＋SHASUMS256.txt＋manifest-records.json（清单条目，粘回
// sound/records/records.manifest.json 的 records[]）。上传：gh release create <tag> dist-records/*.mp3
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const repo = arg('--repo', '<owner/repo>');
const tag = arg('--tag', 'records-v1');

const srcDir = join(process.cwd(), 'sound', 'records');
const outDir = join(process.cwd(), 'dist-records');
const catalog = JSON.parse(readFileSync(join(srcDir, 'catalog.json'), 'utf8'));
if (!catalog.records?.length) { console.error('catalog.json 无曲目——先跑 prep-records.mjs'); process.exit(2); }

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const entries = [];
const shalines = [];
for (const r of catalog.records) {
  const p = join(srcDir, r.file);
  const buf = readFileSync(p);
  const sha = createHash('sha256').update(buf).digest('hex');
  copyFileSync(p, join(outDir, r.file));
  shalines.push(`${sha}  ${r.file}`);
  entries.push({
    name: r.name, file: r.file, bytes: buf.length, sha256: sha,
    url: `https://github.com/${repo}/releases/download/${tag}/${r.file}`,
    provenance: `PROVENANCE.md#${r.name}`,
  });
  console.log(`${r.file}  ${(buf.length / 1048576).toFixed(1)}MB  sha256=${sha.slice(0, 16)}…`);
}
writeFileSync(join(outDir, 'SHASUMS256.txt'), shalines.join('\n') + '\n');
writeFileSync(join(outDir, 'manifest-records.json'), JSON.stringify(entries, null, 2) + '\n');
console.log(`\ndist-records/ 就绪（${entries.length} 曲＋SHASUMS256.txt）`);
console.log(`清单条目 → dist-records/manifest-records.json（粘回 records.manifest.json 的 records[]，tag=${tag}）`);
console.log(`上传：gh release create ${tag} dist-records/*.mp3 dist-records/SHASUMS256.txt --title "出厂唱片 ${tag}"`);
