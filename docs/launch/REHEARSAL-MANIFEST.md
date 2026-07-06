# npm 发布离线演练 · tarball 肉身对账清单

> 生成：2026-07-06，`npm pack`（`npm publish --dry-run` 同源）。**只读演练，未发布。**
> 包：`foley@0.1.0` ｜ 压缩 905.5 kB ｜ 解包 3.7 MB ｜ **85 文件** ｜ shasum `6e162ee08a44021bb77045dd656bcbec94a92f24`
> 演练 tgz 存会话 scratchpad（`foley-0.1.0-rehearsal.tgz`），未入库。

## 安全对账（严防泄漏）

✅ **无** `tapes/`（私有标准带，含密钥风险）｜ **无** `docs/`、`golden/`（测试）、`audit/` ｜ **无** `.env`/`secret`/`.pem`/`id_rsa` ｜ **无** 音频二进制（`*.mp3`/`*.wav`）。
音频（唱片 mp3 18.3MB＋床音 wav 2.9MB）与重演示带（busy/jam/smooth/silence 共 14.5MB）经 `files` 负号排除 → 走 Releases / 不随包。

## 顶层目录小计（字节）

| 目录 | 字节 | 说明 |
|---|---|---|
| `stage/` | 3,352,115 | 含 `fixtures/storm.*`（3.0MB，hero 演示，唯一保留的演示卷）＋器件 js/css/vendor muxer |
| `cli/` | 164,585 | 命令行全套（含 records-fetch/assets-node 首启取件） |
| `sound/` | 120,496 | 声引擎代码＋唱片清单/PROVENANCE/LICENSES（**无 mp3/wav**） |
| `adapters/` | 46,143 | claude-jsonl 蒸馏器 |
| `engine/` | 24,690 | 状态机/参数/判据 |
| 根 json + README + LICENSE | ~19,000 | params/verdict/sweep/sound-params ＋ README(.zh) ＋ LICENSE |
| `protocol/` | 2,609 | 协议冻结 |

**去掉 storm 演示卷（3.0MB）后纯代码 ≈ 700KB**——冷启动秒级达标（§0.3）。

## 完整 85 文件（字节倒序，节选头部；全量见演练 tgz `tar tzf`）

```
3014996  stage/fixtures/storm.curve.csv     ← 唯一保留演示卷（README ?tape=storm）
  69011  stage/vendor/mp4-muxer.mjs
  64944  stage/vendor/webm-muxer.mjs
  41519  sound/graph.js
  35845  stage/js/dub.js
  35166  cli/probe.ts
  29321  stage/js/film.js
  ...（其余 78 件均 <24KB：cli/engine/adapters/sound/stage/protocol 代码 ＋ 唱片清单/许可 ＋ 根配置）
```

## files 白名单（package.json，权威）

入库：`cli engine adapters protocol sound stage` ＋ `params/verdict/sweep/sound-params.json` ＋ `README.md README.zh.md LICENSE`
负号排除：`!sound/records/*.mp3` `!sound/assets/*.wav`（→ Releases）｜ `!stage/tools` ｜ `!stage/fixtures/{busy,jam,smooth,silence}.*`（重演示带）

> 复现：`npm pack` 后 `tar tzf foley-0.1.0.tgz`。当前 `private:true` 保险栓在场——`npm publish --dry-run` 需先临时摘 private（人类拆闸时正式摘）。
