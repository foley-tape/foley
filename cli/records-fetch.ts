// 出厂音频征询取回（M2.4 §A.4 落仓管道 → M2.5 §C 终形：唱片＋床音织体一体；
// §0.2 零静默网络红线的唯一例外通道）。
// 红线原文：机器永不自行联网；唯一例外＝首启【明示征询】的出厂唱片下载
// （展示目标 URL／体积／SHA-256，同意才取，验哈希落盘；拒绝则房间层运行并提示唱片架路径）。
// 本文件是该例外的全部实现——除本命令经同意后的 fetch 外，仓库无任何网络调用。
// 落盘：唱片 → ~/.foley/records/factory/（records-node 回退位）；
//       床音 → ~/.foley/assets/factory/（assets-node 回退位；缺件时 fallback 合成织体同构顶上）。
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

export interface ManifestEntry { name: string; file: string; bytes: number; sha256: string; url: string; provenance: string }
export interface RecordsManifest {
  releaseTag: string;
  records: ManifestEntry[];
  assets?: ManifestEntry[]; // 床音织体（M2.5 §C）——缺件不碍起播（fallback 织体），取回后真采样上位
}

const MANIFEST_URL = new URL('../sound/records/records.manifest.json', import.meta.url);
const FACTORY_DIR = join(homedir(), '.foley', 'records', 'factory');
const ASSETS_FACTORY_DIR = join(homedir(), '.foley', 'assets', 'factory');
const SHELF_HINT = `唱片架：~/.foley/records/（用户自治，只读/不复制/不上传）`;

function loadManifest(): RecordsManifest {
  const m = JSON.parse(readFileSync(MANIFEST_URL, 'utf8')) as RecordsManifest;
  return { releaseTag: m.releaseTag, records: m.records || [], assets: m.assets || [] };
}

function sha256Hex(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

function localState(m: RecordsManifest) {
  const recVendor = new URL('../sound/records/', import.meta.url).pathname;
  const assetVendor = new URL('../sound/assets/', import.meta.url).pathname;
  const probe = (r: ManifestEntry, vendorDir: string, cacheDir: string, kind: '唱片' | '床音') => {
    const vendored = existsSync(join(vendorDir, r.file));
    const cached = existsSync(join(cacheDir, r.file));
    return { ...r, kind, cacheDir, vendored, cached, present: vendored || cached };
  };
  return [
    ...m.records.map((r) => probe(r, recVendor, FACTORY_DIR, '唱片')),
    ...(m.assets || []).map((a) => probe(a, assetVendor, ASSETS_FACTORY_DIR, '床音')),
  ];
}

export async function runRecordsFetch(args: string[]): Promise<void> {
  const verb = args[0] || 'status';
  const m = loadManifest();

  if (verb === 'status') {
    if (!m.records.length) {
      console.log('唱片清单为空（records.manifest.json 候船长终裁名单——名单一到，pack-records 填清单，当日落仓）。');
      console.log(`机器现以 repo vendored 件或房间层运行。${SHELF_HINT}`);
      return;
    }
    for (const r of localState(m)) {
      console.log(`${r.present ? '✓' : '✗'} [${r.kind}] ${r.file}  ${(r.bytes / 1048576).toFixed(1)}MB  ${r.vendored ? 'vendored' : r.cached ? 'factory 缓存' : '未取回'}`);
    }
    return;
  }

  if (verb !== 'fetch') {
    console.error('用法: node cli/index.ts records <status|fetch> [--yes]');
    process.exit(2);
  }

  const need = localState(m).filter((r) => !r.present);
  if (!m.records.length && !(m.assets || []).length) { console.log('清单为空——无可取回（候船长终裁名单）。'); return; }
  if (!need.length) { console.log('出厂音频齐备（vendored 或 factory 缓存），无需联网。'); return; }

  // —— 明示征询（§0.2 文案：URL/体积/SHA-256 全直呈；同意才动网络） ——
  const nRec = need.filter((r) => r.kind === '唱片').length, nAst = need.length - nRec;
  const totalMb = (need.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(1);
  console.log(`\n首启出厂音频征询（零静默网络红线：机器永不自行联网，本次下载需你明示同意）`);
  console.log(`将从 GitHub Releases（tag ${m.releaseTag}）取回：唱片 ${nRec} 张＋床音织体 ${nAst} 件，共 ${totalMb}MB：`);
  for (const r of need) {
    console.log(`  [${r.kind}] ${r.file}  ${(r.bytes / 1048576).toFixed(1)}MB`);
    console.log(`    URL: ${r.url}`);
    console.log(`    SHA-256: ${r.sha256}`);
  }
  console.log(`同意 → 逐件下载并校验 SHA-256，唱片落 ${FACTORY_DIR}，床音落 ${ASSETS_FACTORY_DIR}`);
  console.log(`拒绝 → 机器照常起播：无唱片走房间层，无床音走合成织体（同构退路）。${SHELF_HINT}\n`);

  let ok = args.includes('--yes');
  if (!ok) {
    if (!process.stdin.isTTY) {
      console.error('非交互环境且未带 --yes：不下载（绝不静默联网）。同意请显式重跑：records fetch --yes');
      process.exit(3);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const a = (await rl.question('下载？ [y/N] ')).trim().toLowerCase();
    rl.close();
    ok = a === 'y' || a === 'yes';
  }
  if (!ok) {
    console.log(`已拒绝——机器以房间层运行。${SHELF_HINT}`);
    return;
  }

  for (const r of need) {
    mkdirSync(r.cacheDir, { recursive: true });
    process.stdout.write(`取回 [${r.kind}] ${r.file} … `);
    const res = await fetch(r.url);
    if (!res.ok) throw new Error(`下载失败 ${res.status}：${r.url}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    const h = sha256Hex(buf);
    if (h !== r.sha256) throw new Error(`SHA-256 不符：${r.file}（清单 ${r.sha256} ≠ 实际 ${h}）——拒收，未落盘`);
    if (buf.length !== r.bytes) throw new Error(`体积不符：${r.file}（清单 ${r.bytes} ≠ 实际 ${buf.length}）——拒收，未落盘`);
    writeFileSync(join(r.cacheDir, r.file), buf);
    console.log(`✓ ${(buf.length / 1048576).toFixed(1)}MB sha256 验讫`);
  }
  console.log(`\n落盘完毕（装载器自动回退至 factory 缓存；fnv 一致性仍由 catalog/manifest 逐件执法）`);
}
