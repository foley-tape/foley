// 美学对照包（SOUND-R3 §4.5 / §七.8 正式方法）：参考锚＋预设 A/B/C 盲选页，一键生成。
// 形容词迭代已退役——美学裁决走盲选：四页同带同唱片，只有机器处置不同；船长按听感排序，
// 排序即参数裁决（判读表见 runs/aesthetic-pack/README.md）。
// 锚 = 唱片直通（处置归零+机器层全静）：同素材消融锚——差异全来自机器，比外来实录更可比；
// 与主单"房间实录"的偏差如实注记候裁。
// 用法：node scripts/aesthetic-pack.mjs [tape=tapes/storm.tape.jsonl]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, copyFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const tape = process.argv[2] || 'tapes/storm.tape.jsonl';
const outRoot = join(process.cwd(), 'runs', 'aesthetic-pack');
if (existsSync(outRoot)) rmSync(outRoot, { recursive: true });
mkdirSync(outRoot, { recursive: true });

// 预设定义（record.* 为唱片处置域；bed.* 磨损域；数值全走 --sp）
const MUTE_MACHINE = [
  'bed.crackleDbLo=-120', 'bed.crackleDbHi=-120', 'bed.hissDbLo=-120', 'bed.hissDbHi=-120',
  'foreground.peakGain=0', 'foreground.failGain=0', 'foreground.pageGain=0',
  'foreground.bellGain=0', 'foreground.saveGain=0', 'foreground.spawnGain=0', 'call.gain=0.0001',
];
const PRESETS = {
  anchor: { label: '锚（唱片直通）', sp: ['record.wowCentsLo=0', 'record.wowCentsHi=0', 'record.wowTBoost=0', 'record.filterHzLo=8000', ...MUTE_MACHINE] },
  A: { label: 'A（出厂默认）', sp: [] },
  B: { label: 'B（处置浓：更旧的机器）', sp: ['record.wowCentsLo=4', 'record.wowCentsHi=22', 'record.filterHzLo=1200', 'bed.crackleDbHi=-24', 'bed.hissDbHi=-33'] },
  C: { label: 'C（处置淡：更新的机器）', sp: ['record.wowCentsLo=1', 'record.wowCentsHi=6', 'record.filterHzLo=3200', 'bed.crackleDbHi=-34', 'bed.hissDbHi=-42'] },
};

for (const [key, p] of Object.entries(PRESETS)) {
  const dir = join(outRoot, key);
  const args = ['cli/index.ts', 'probe', tape, '--kind', 'storm', '--anon', key, '--out', dir];
  for (const s of p.sp) args.push('--sp', s);
  execFileSync('node', args, { stdio: 'pipe' });
  console.log(`${p.label} → runs/aesthetic-pack/${key}/probe.html`);
}

writeFileSync(join(outRoot, 'README.md'), `# 美学对照包（SOUND-R3 §4.5）——盲选协议

四页同带（storm）同唱片（2-am-debug-loop 起），只有机器处置不同。**别看参数，只用耳朵。**

## 听法（蓝牙耳机=产品条件）
1. 每页点 ▶，听 60–90 秒（建议画布点到 1/3 处起听——有事件有张力）；
2. 顺序建议打乱（anchor→C→A→B 或任意）；每页之间歇 10 秒；
3. 排序四页：最想在工作时开着的 → 最不想的。

## 页面
- \`anchor/probe.html\` —— 锚：唱片直通（机器全静默、处置归零）。这就是"这张唱片本来的样子"。
  ⚠ 与主单"lo-fi 房间实录"锚的偏差：同素材消融锚可比性更强，实录锚候下轮 vendor（如需）。
- \`A/probe.html\` —— 出厂默认处置。
- \`B/probe.html\` —— 处置浓（wow 更醺、低通更下压、磨损更糙——"更旧的机器"）。
- \`C/probe.html\` —— 处置淡（微 wow、高频更开、磨损更淡——"更新的机器"）。

## 判读表（排序 → 裁决）
| 排序结果 | 说明 | 动作 |
|---|---|---|
| 锚最佳，A/B/C 皆逊 | 机器处置在做减法——处置强度全域回撤 | record.wow/filter/磨损 全部向 C 再淡一档 |
| A 最佳 | 出厂即口味 | 冻结现值 |
| B 最佳 | 醇度不够——机器该更旧 | 出厂值向 B 平移（美学轮定标） |
| C 最佳 | 处置过度——克制即味道 | 出厂值向 C 平移 |
| 锚垫底 | 机器处置在创造价值（理想态） | 记录在案，强化方向 |

## 已知限制（如实标注）
- tuner 抽屉（?tuner=1）里 l1AirRatio 建图时定，拖动需重开页；
- 页头 sound-params 哈希会随预设变（哈希不可逆，不破盲）；
- 唱片为 AI 生成（Suno v5 CC0，见 sound/records/LICENSES.md 直呈段）——若对来源有口味顾虑，本包结论仍成立（处置相对差异与素材来源正交）。
`);

// 收编：盲选包属交付面证物
console.log('\n盲选协议 → runs/aesthetic-pack/README.md（判读表在内；排序结果请回填 FEEDBACK-SOUND）');
