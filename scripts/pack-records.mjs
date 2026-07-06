// Releases 出厂音频打包（M2.4 §A.4/§0.3 npm 减重令 → M2.5 §C 终包：唱片＋床音织体一体，
// 音频不进 tarball/repo，真身挂 GitHub Releases，指纹在 manifest/catalog/PROVENANCE）。
// 用法：node scripts/pack-records.mjs [--repo owner/name] [--tag records-v1]
// 产出 dist-records/：mp3+wav 副本＋SHASUMS256.txt＋manifest-records.json / manifest-assets.json
//（条目分别粘回 records.manifest.json 的 records[] / assets[]）。
// 上传：gh release create <tag> dist-records/*（或 upload --clobber 更新）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const repo = arg('--repo', '<owner/repo>');
const tag = arg('--tag', 'records-v1');

const recDir = join(process.cwd(), 'sound', 'records');
const assetDir = join(process.cwd(), 'sound', 'assets');
const outDir = join(process.cwd(), 'dist-records');
const catalog = JSON.parse(readFileSync(join(recDir, 'catalog.json'), 'utf8'));
const assetManifest = JSON.parse(readFileSync(join(assetDir, 'manifest.json'), 'utf8'));
if (!catalog.records?.length) { console.error('catalog.json 无曲目——先跑 prep-records.mjs'); process.exit(2); }

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const shalines = [];
function packOne(dir, file, name, provenance) {
  const buf = readFileSync(join(dir, file));
  const sha = createHash('sha256').update(buf).digest('hex');
  copyFileSync(join(dir, file), join(outDir, file));
  shalines.push(`${sha}  ${file}`);
  console.log(`${file}  ${(buf.length / 1048576).toFixed(1)}MB  sha256=${sha.slice(0, 16)}…`);
  return {
    name, file, bytes: buf.length, sha256: sha,
    url: `https://github.com/${repo}/releases/download/${tag}/${file}`,
    provenance,
  };
}
const recEntries = catalog.records.map((r) => packOne(recDir, r.file, r.name, `PROVENANCE.md#${r.name}`));
const assetEntries = assetManifest.assets.map((a) => packOne(assetDir, a.file, a.name, 'sound/assets/LICENSES.md'));

writeFileSync(join(outDir, 'SHASUMS256.txt'), shalines.join('\n') + '\n');
writeFileSync(join(outDir, 'manifest-records.json'), JSON.stringify(recEntries, null, 2) + '\n');
writeFileSync(join(outDir, 'manifest-assets.json'), JSON.stringify(assetEntries, null, 2) + '\n');
console.log(`\ndist-records/ 就绪（唱片 ${recEntries.length}＋床音 ${assetEntries.length}＋SHASUMS256.txt）`);
console.log(`条目 → manifest-records.json / manifest-assets.json（分别粘回 records.manifest.json 的 records[] / assets[]，tag=${tag}）`);
console.log(`上传：gh release create ${tag} dist-records/*  或  gh release upload ${tag} dist-records/* --clobber`);
