# npm 发布离线演练 · tarball 肉身对账清单

> 生成：2026-07-07（M2.6 拆闸前必修后重跑），`npm pack --dry-run`。**只读演练，未发布。**
> 包：`foley@0.1.0` ｜ 压缩 **915.6 kB** ｜ 解包 3.6 MB ｜ **91 文件** ｜ shasum `4394b400eb41b61d0dd0c40847b62440af3e2b7e`
> 上一账（2026-07-06）：905.5 kB／85 文件／`6e162ee0…`。**账差对账**见下。

## 账差对账（85 → 89 → 91，全部白名单内预期件）

| 时点 | 文件数 | 差额解释 |
|---|---|---|
| 2026-07-06 记录 | 85 | 首次演练存档 |
| 双盲终审实测（锚 149ddea） | 89 | ＋`stage/golden/*.cuts.json` ×5（M2.5 §C 剪辑冻结件落仓；审计签「良性、有意随包」；与记录 85 间余 1 件账差属审计侧粗计，无泄漏义项） |
| **本次（M2.6 后）** | **91** | ＋`stage/js/mp4scrub.{js,d.ts}` ×2（G7 mp4 墙钟抹除件）；`stage/fixtures/storm.*` **同名换内容**为脱敏版（t 轴相对化，见下） |

## 安全对账（严防泄漏）

✅ **无** `tapes/`（含新入库的五卷**脱敏骨架**——`files` 白名单本就不含 tapes，装包用户拿不到测试夹具）
✅ **无** `docs/`、`golden/`（引擎金测试）、`audit/` ｜ **无** `.env`/`secret`/`.pem`/`id_rsa` ｜ **无** 音频二进制（`*.mp3`/`*.wav`）
✅ **G7 新尺**：随包的 `stage/fixtures/storm.{curve,moments}.csv` 已换**脱敏再生版**——t/emitT 为相对毫秒（0 起），sig/slot 等哈希经每带随机盐重算；原（绝对 epoch）版本不再随包也不再在库。
音频（唱片 mp3 18.3MB＋床音 wav 2.9MB）与重演示带（busy/jam/smooth/silence 共 14.5MB）经 `files` 负号排除 → 走 Releases / 不随包。

## 顶层目录小计（字节，pack 报表换算）

| 目录 | 字节 | 说明 |
|---|---|---|
| `stage/` | ≈3,161,900 | 含 `fixtures/storm.*`（3.0MB，hero 演示卷·脱敏版）＋器件 js/css/vendor muxer＋`golden/*.cuts.json` 冻结件＋`mp4scrub` |
| `cli/` | ≈169,400 | 命令行全套（含 records-fetch/assets-node 首启取件；distill 默认脱敏＋`--raw` 警示） |
| `sound/` | ≈121,700 | 声引擎代码＋唱片清单/PROVENANCE/LICENSES（**无 mp3/wav**） |
| `adapters/` | ≈46,100 | claude-jsonl 蒸馏器（`writeDistilled` 默认脱敏） |
| 根 json + README + LICENSE | ≈26,700 | params/verdict/sweep/sound-params ＋ README(.zh) ＋ LICENSE |
| `engine/` | ≈24,700 | 状态机/参数/判据 |
| `protocol/` | ≈2,600 | 协议冻结 |

**去掉 storm 演示卷（3.0MB）后纯代码 ≈ 700KB**——冷启动秒级达标（§0.3）。

## 完整 91 文件（字节倒序，节选头部；全量可 `npm pack --dry-run` 复现）

```
3005kB  stage/fixtures/storm.curve.csv     ← 唯一保留演示卷（README ?tape=storm）·脱敏版
  69kB  stage/vendor/mp4-muxer.mjs
  65kB  stage/vendor/webm-muxer.mjs
  42kB  sound/graph.js
  36kB  stage/js/dub.js（meta 已抹墙钟）
  35kB  cli/probe.ts
  30kB  stage/js/film.js（finalize 后挂 mp4scrub）
  ...（其余 84 件均 <24KB：cli/engine/adapters/sound/stage/protocol 代码 ＋ 唱片清单/许可 ＋ 5 只 cuts.json 冻结件 ＋ 根配置）
```

## files 白名单（package.json，权威）

入库：`cli engine adapters protocol sound stage` ＋ `params/verdict/sweep/sound-params.json` ＋ `README.md README.zh.md LICENSE`
负号排除：`!sound/records/*.mp3` `!sound/assets/*.wav`（→ Releases）｜ `!stage/tools` ｜ `!stage/fixtures/{busy,jam,smooth,silence}.*`（重演示带）

> 复现：`npm pack --dry-run`。当前 `private:true` 保险栓在场——拆闸只由船长亲手执行（GATE §6.2）。
