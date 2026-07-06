# sound/records 授权登记（SOUND-R4 落仓：CC0-only＋血统条款，逐条核验）

> 采集：2026-07-06，Track-SOUND（船长终裁名单：Saturation／Still Life／Warm Fuzz）。
> 运行时零网络不破：构建期 vendor，本地读取；流媒体永禁；用户取回走 `cli records fetch` 明示征询。
> 授权页快照：`LICENSE-FMA-snapshot-2026-07-06.txt`（FMA 三曲页采集日原文：CC0 标注＋AI generated?=No＋存储直链）。
> 家谱三件套（血统条款执行件）：`PROVENANCE.md` 逐曲对应；CC0 1.0 法律全文：`LICENSE-CC0-snapshot-2026-07-06.txt`。

## 血统与授权双判读（vendor 决策依据）

- **血统（§0.1 宪法）**：三曲皆 FMA 平台字段 "AI generated? No"；作者 HoliznaCC0 为在册人类音乐人
  （Patreon/Buy Me A Coffee 在页，长期 CC0 发布成体系）。人类制造判定成立。
- **授权**：逐曲页面明示 "CC0 1.0 Universal License"（快照在案）——可分发、可商用、免署名，无残余理论风险
  （不涉生成模型训练数据之争）。
- 选曲终裁：**船长实听**（2026-07-06）；BPM 窗降为参考代理，歧义如实入 catalog.bpmNote。

## saturation.mp3
- 标题：Saturation（专辑 Public Domain Lofi）
- 作者：HoliznaCC0（人类制造，见 PROVENANCE 三件套）
- 来源：https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/saturation-lofi-calm-relaxed/
- 授权：CC0 1.0（https://creativecommons.org/publicdomain/zero/1.0/，采集日快照在案）
- 加工：无（320k/48kHz mp3 原件直存——不转码=保真＋授权物一致）
- 实测：60 BPM（歧义注记见 catalog）｜156.0s｜6240163B｜fnv 721006f9
- 船长注记：背景一层持续声（素材自带底，与机器磨损层叠加属预期），节奏非常好

## still-life.mp3
- 标题：Still Life（专辑 Public Domain Lofi）
- 作者：HoliznaCC0（人类制造，见 PROVENANCE 三件套）
- 来源：https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/still-life-lofi-chill-nostalgic/
- 授权：CC0 1.0（同上）
- 加工：无
- 实测：77 BPM｜134.9s｜5395363B｜fnv e3083d17
- 船长注记：比较干净

## warm-fuzz.mp3
- 标题：Warm Fuzz（专辑 Public Domain Lofi）
- 作者：HoliznaCC0（人类制造，见 PROVENANCE 三件套）
- 来源：https://freemusicarchive.org/music/holiznacc0/public-domain-lofi/warm-fuzz-lofi-retro/
- 授权：CC0 1.0（同上）
- 加工：无
- 实测：63 BPM（歧义注记见 catalog）｜172.6s｜6905485B｜fnv 8e2a36e5
- 船长注记：整体还可以

## 落选记录（选曲透明度）
《Public Domain Lofi》42 曲中其余曲目：船长实听判"打击乐多、鼓点密集、听起来一般"——暂时舍弃
（专辑在案，后续换盘/加盘可回访）。

## 沿革：R3 出厂四盘退厂（2026-07-06，血统条款 §0.1）
2-am-debug-loop／cursor-after-midnight／dust-on-the-morning-keys／terminal-rain（open-lofi，
**AI 生成 Suno v5**·CC0，作者 btahir）依血统条款退厂：授权判读当时成立且留痕不改（原登记全文见
git 97f558a:sound/records/LICENSES.md；CC0 快照 `LICENSE-CC0-snapshot-2026-07-06.txt` 系 open-lofi
LICENSE 采集件，沿革保留）；open-lofi 目录（含 seasonal-weather 27 首天气候选）移居
`docs/records-guide.md` AI 明示区，用户自治上架自便。

## dub 授权卫生（R3 §5 沿革）
预告片音轨默认**不含唱片**；唱片进 dub 仅限本目录内置 CC0 唱片或用户对自备唱片显式确认
（--with-record 旗标），meta 记录唱片来源。用户自备唱片（~/.foley/records/）只读、不复制、
不上传、不入 dub（除非显式确认）——磁带机吃磁带，授权归零。
