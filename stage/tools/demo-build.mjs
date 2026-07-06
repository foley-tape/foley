// demo 静态站构建（M2.5 §B.1）：拼一个可直挂 GitHub Pages 的只读橱窗。
//
//   node stage/tools/demo-build.mjs [--out runs/demo-site]
//
// site/ 镜像仓库相对路径（零改写）：stage/{demo.html,css,js,fixtures(storm)}、
// sound/{core.js,graph.js,assets,records/catalog.json}、sound-params.json、
// records/still-life.mp3（出厂 CC0 一张，工厂缓存拷入）＋ index.html 重定向 ＋ 构建纪要。
// 橱窗纪律：无 serve、无写盘端点、无 vendor（导出件不随站）；示范带以过审版为准。
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = argOf('--out', join(repoRoot, 'runs', 'demo-site'));
rmSync(OUT, { recursive: true, force: true });

const cp = (rel, toRel = rel) => {
  const dst = join(OUT, toRel);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(join(repoRoot, rel), dst);
  return dst;
};

// 舞台（demo 所需件；不带 tools/vendor/hero——橱窗不是车间）
cp('stage/demo.html');
cp('stage/css/stage.css');
for (const f of ['replay.js', 'instruments.js', 'deck.js', 'lens.js', 'demo-boot.js', 'soundbridge.js']) {
  cp(`stage/js/${f}`);
}
cp('stage/fixtures/storm.curve.csv');
cp('stage/fixtures/storm.moments.csv');
// 声（单一事实源直吃）
cp('sound/core.js');
cp('sound/graph.js');
cp('sound/assets/manifest.json');
cp('sound/assets/LICENSES.md');
for (const f of ['l1-roomtone.wav', 'l1-filmstatic.wav', 'l1-crackle.wav']) cp(`sound/assets/${f}`);
cp('sound/records/catalog.json');
cp('sound-params.json');
// 出厂唱片一张（工厂缓存 → 站内；CC0 人类制造，页脚署名）
const recSrc = join(homedir(), '.foley', 'records', 'factory', 'still-life.mp3');
mkdirSync(join(OUT, 'records'), { recursive: true });
copyFileSync(recSrc, join(OUT, 'records', 'still-life.mp3'));

// 根入口：重定向到 stage/demo.html（保相对路径零改写）
writeFileSync(join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=stage/demo.html">` +
  `<title>Foley demo</title><a href="stage/demo.html">Foley demo</a>\n`);

// 构建纪要（素材诚实：示范带哈希＋唱片哈希＋审计指认）
const sha16 = p => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
writeFileSync(join(OUT, 'DEMO-NOTES.md'), `# demo 站构建纪要（M2.5 §B.1）

- 示范带：storm 蒸馏带（真实会话；发布前置审计=NIGHT 隐私回归 5/5＋两文件列级零自由文本，记录见 docs/records/m25/stage/示范带审计@M2.5.md）
  - curve  sha256/16 = ${sha16(join(OUT, 'stage/fixtures/storm.curve.csv'))}
  - moments sha256/16 = ${sha16(join(OUT, 'stage/fixtures/storm.moments.csv'))}
- 出厂唱片：Still Life · HoliznaCC0《Public Domain Lofi》（人类制造·CC0，血统条款）
  - mp3 sha256/16 = ${sha16(join(OUT, 'records/still-life.mp3'))}
- 橱窗纪律：无 serve/无写盘/无导出；唯一交互=POWER；横幅注明 "This is a recording"。
- 已知界限：画声两轨折叠常数不齐（400/1500），跨大接带处漂移 ~1.1s/道（轴主归一记案在册）；
  demo 默认取景 920s 起，首道大接带在 ~172s 之后。
- 构建时刻：${new Date().toISOString()}
`);
console.log('demo 站 →', OUT);
