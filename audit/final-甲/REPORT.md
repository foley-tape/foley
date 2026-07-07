# AUDIT-FINAL · 红队甲 · 文档与现实（§1）＋视觉线兼任（§3 见 VISUAL_AUDIT.md）

> 快照锚：`main @ 149ddea`（全程只审此锚）｜工作树 `tape0-final-jia`｜端口 8941｜双盲，未与乙交流。
> 气味线索起手（§1）：README／工具箱／白皮书对外每一句承诺 → 逐句核代码与实际行为。**清单是地板不是天花板**——本报告含"脱离线索自己嗅到的"独立发现节。
> 复现脚本：`repro/final-甲/`（失败测试即证据）。严重度：**P0 阻断发布／P1 发布前必修／P2 v1.x／P3 冰箱**。

---

## 卷首 · 十大发现（严重度排序）

| # | 严重度 | 发现一句话 | 命中队 |
|---|---|---|---|
| 1 | **P1** | `npx foley`（README 头号命令）在本快照无法解析到本包：`"private": true` 使真实 `npm publish` 被拒（打包本身健康、翻掉即可发），bin 指向 `.ts`，包名 "foley" 是常见词有被抢注风险——发布前须翻 private＋发布＋锁定名归属，否则 HN 首命令报错或跑到陌生人的包 | 甲 |
| 2 | **P1** | 干净克隆 `npm test` 6/105 红：6 条金测试读 gitignore 掉的 `tapes/*.tape.jsonl`，仓里只有派生的 `stage/fixtures/*.csv`——套件只在作者本机绿，与"95 golden tests／Engine sealed"徽标和"From source"流程冲突 | 甲 |
| 3 | **P1** | Node ≥23.6 是陡峭且未充分预警的门槛：quickstart 的 `npx foley` 只字未提，仅"From source"括号带过；Node 20/22 LTS 用户跑 `.ts` 入口直接 SyntaxError；未进"Honest limits" | 甲 |
| 4 | **P2** | DUB 导出"~9× realtime"缺依据：引擎自设影子指标目标是 **≥2×**（`film.js:516`），慢机达不到 9×，该具体数字无支撑 | 甲 |
| 5 | **P2** | 蒸馏夹具残留纪元时间戳＋targetHash（工作时段／仓库指纹）——若补交入库需先脱敏；蒸馏管线反演面 | **乙**收敛候选 |
| 6 | **P2** | README 内嵌 `still-6-asleep.png` 标"Asleep — one dim ember"，实图是**满亮面板**、无"暗处一粒余烬"——资产与文案／宪法睡态不符 | 甲＋视觉 |
| 7 | **P2** | 视觉：VU 表**缺曲面烟色玻璃罩＋反射高光**（材质法明文"烟色玻璃罩表头"只兑现到平面渐变盖片）——船长九条之一，违宪（部分兑现） | 视觉 |
| 8 | **P2** | 视觉：器件表头**无落地投影**（`.bezel` 只有内阴影，仅整机有 drop-shadow）→"阴影塌房""贴纸感" | 视觉 |
| 9 | **P2** | 视觉：DUB 键按下用 `transform 0.1s ease` 补间，**违动法"一切服从惯性／禁补间"**→"无阻尼感" | 视觉 |
| 10 | **P3** | `docs/assets/hero.gif` 12MB 在 git（与 .gitignore"重媒体不入库"注释张力）；好消息：`files` 白名单不含 `docs/`，**不进 npm tarball**，安装不受累 | 甲 |

> §3 视觉九条完整"违宪/缺口＋根因"表见 **VISUAL_AUDIT.md**（本报告只把最扎眼三条提进卷首 7/8/9）。

---

## 正文 · §1 文档逐句核验

### 甲-1【P1】`npx foley` 头号命令的真实性存疑（发布物料）
- **承诺**（README:17-20）：`npx foley` 一行起播；"live on `http://127.0.0.1:4173`"。
- **现实**：
  - `package.json:4` `"private": true`。**真实** `npm publish` 会被 npm 以 `EPRIVATE`（"marked as private"）拒绝——这是 npm 文档行为。**精度更正（实测）**：`npm publish --dry-run --ignore-scripts` **不强制** private 检查（本机 exit 0，正常打出 `foley-0.1.0.tgz`／89 文件／解包 3.8MB，docs/tapes 已正确排除）——即**打包健康**，翻掉 `private` 即可发。所以阻塞点是"private 未翻＋未发"，不是打包坏。
  - `bin.foley = cli/index.ts`（`package.json:58-59`）——把 `.ts` 当可执行入口。shebang 是 `#!/usr/bin/env node`（`cli/index.ts:1`），仅在 **Node ≥23.6**（默认剥类型）下可跑（见甲-3）。
  - 包名 `foley` 是常见英文词，npm 上极可能已被他人占用；未见任何"已发布到该名下"的证据。`npx foley` 对陌生用户 = 报错或**执行陌生人的同名包**（潜在安全面，乙或关注）。
- **代码路径本身是通的**：本机 `node cli/index.ts scan` 正常列出 82 卷会话（`repro/final-甲/`）——阻塞点纯在**发布态与 Node 门槛**，非代码坏。
- **裁量**：P1 发布前必修——发布前必须确认①`private` 翻 false 并成功 `npm publish`；②npm "foley" 名归属己方；否则 HN 首命令即死。修复成本低，但**必须显式验证**，不能假设。

### 甲-2【P1】干净克隆 `npm test` 6/105 红（隐私夹具泄进测试）
- **承诺**：README:78"Engine sealed — deterministic, calibrated on real session tapes, 95 golden tests"；README:29"From source: git clone … npm install … npx foley"。
- **现实**（`repro/final-甲/01-npm-test-on-clone.sh`）：
  - 全新工作树（无 `tapes/`）→ `ℹ tests 105 / pass 99 / **fail 6**`。6 条：⑭ sweep 确定性、㉛ storm 床包络、㊵ G1、㊶ G2、㊷ G3、58 renderCuts——全部 `ENOENT: tapes/{storm,smooth,silence,…}.tape.jsonl`。
  - `.gitignore` 同时排除 `tapes/` 与 `*.tape.jsonl`（隐私：真实会话带含密钥风险）。仓里入库的只有**派生**的 `stage/fixtures/*.curve.csv`／`*.moments.csv`，**没有**原始 `.tape.jsonl`，也**没有**生成器／`pretest` 钩子。
  - 把作者本机 `tapes/` 拷进工作树后 → **105/105 全绿**：证明 6 红纯因缺 gitignore 掉的夹具，**非真 bug**。
  - `prepublishOnly = sync-readme --check && npm test`（`package.json:47`）——**只在作者本机（恰有私有带）能过**；CI／任何干净检出会红。
- **"95"不是谎**：`sync-readme.mjs` 用正则数 `test()/it()` 定义（=95），node:test 运行时含子测试（=105），二者口径不同；`sync-readme --check` 绿。问题**不是数字错，是"克隆即绿"为假**。
- **裁量**：P1。HN 常见动作就是 clone+test 然后截图。修法：把 5 个夹具以**已蒸馏骨架**形式入库（它们无对话原文，仅 verb/hash/时间戳——见甲-5 的脱敏顾虑），或加 `pretest` 合成。

### 甲-3【P1】Node ≥23.6 门槛陡峭且未充分预警
- **承诺**：README quickstart 直接 `npx foley`，不提 Node 版本；"Honest limits"（README:84-89）四条无此条；仅"From source"（README:29）括号"Node ≥ 23.6"。
- **现实**：`package.json:32-33` `engines.node >=23.6`；全部源码是带类型标注的 `.ts`，须 Node 原生剥类型（**默认仅 23.6+**；22.6–23.5 需 `--experimental-strip-types`，<22.6 完全不支持）。Node 23.6 发布于 2025 年初，**新过现行 LTS（20/22）**。LTS 用户 `npx foley` 得到晦涩 SyntaxError。本机 Node v26 恰好越过门槛，故一切正常——**这正是"作者机器上一切都好"的盲区**。
- **裁量**：P1／P2。要么把 Node 门槛提到 quickstart 与 Honest limits 显要处（诚实优先），要么发布前将 bin 预编译成 `.js` 拓宽支持面（工程优先，护住"npx 一行"的承诺）。属"第四条该说未说的诚实限定"。

### 甲-4【P2】DUB "~9× realtime" 无支撑
- **承诺**：README:81"DUB … local MP4 (WebCodecs, **~9× realtime**)"。
- **现实**：`film.js:516` 引擎自算的速度影子 `realtimeX = filmMs/wallMs`，注释目标 **"≥2×"**。README 的 9× 与引擎自设 2× 不一致，且 9× 无实测锚（随机器差异极大）。属"数字对不上／交付了但和描述不一样"。
- **裁量**：P2。改成"≥2×（因机而异）"或补一条实测锚。

### 甲-5【P2｜乙收敛候选】蒸馏夹具残留时间／哈希指纹
- 观察：`tapes/silence.tape.jsonl` 首行 meta 含 `episodes[].startT/endT`（纪元毫秒真时）与逐事件 `targetHash`——即便蒸馏去了对话原文，**工作时段与仓库/文件指纹仍在**。
- 对甲的意义：甲-2 若靠"补交夹具入库"修，会把这些指纹**永久钉进 git**——需先零化时间戳/换合成 targetHash。
- **交乙**：`?tapeHash` 反演、导出物工作时段指纹是乙的靶区（§2）；此点甲乙可能收敛=真雷。甲不越界深挖，标记待乙。

### 甲-6【P2】"Asleep — one dim ember" 静帧不是睡态
- README:42 `![Asleep — the deck at rest, one dim ember](docs/assets/still-6-asleep.png)`。实图（我肉眼看过）：面板**满亮**、双表清晰、无"暗处一粒余烬"。宪法睡态="待机整机睡在暗处只留一粒暗灯"（`#room[data-sleep="deep"] --idle-dim:0.34`）。文案／宪法与资产不符。
- **裁量**：P2。换一张真睡态帧，或改文案。HN 观者点开期待"睡眠美学"却见满亮面板。

### 甲-10【P3】hero.gif 12MB 在 git
- `docs/assets/hero.gif` 12MB 入库，与 `.gitignore`"重媒体不入库（§0.5）"注释存在张力。**但** `package.json:files` 白名单不含 `docs/` → **不进 npm tarball**，安装体积不受累；仅增加 clone 体积。night2 已知项，冰箱。

---

## 独立发现节（脱离线索自己嗅到的）

- **独-A【架构烟味】隐私 gitignore 的夹具当测试输入**：`sound.test.ts` 直接 `readFileSync('tapes/xxx.tape.jsonl')`（如 `:73/:404`），把因隐私而 gitignore 的文件当金测试地基——这是甲-2 的根，也是一处设计味：测试应只依赖入库的合成夹具，不该伸手去够隐私目录。
- **独-B【半分辨率镜头层】**（详见 VISUAL_AUDIT §1）：`lens.js:57` WebGL 镜头层按 `innerWidth/2` 半分辨率渲染，经 `mix-blend-mode:overlay` 铺满整机——纸/VU 本身满 dpr（`instruments.js:114`）却被这层半分辨率 overlay 整体拖软。这是"整体发虚"的工程根因，从代码嗅到、非清单给的。
- **独-C【发布闸的单点依赖】**：`prepublishOnly` 同时绑 `sync-readme --check`＋`npm test`，两者都只在作者本机绿（私有带在场）。发布闸实质=作者本机状态，**无 CI 复核**——任何交接/换机即暴露甲-2。

---

## 已核验为真的承诺（公允记账＋回归护栏）

审计不只抓裂缝；以下 README 承诺我逐一核过、**成立**（脚本见 `repro/final-甲/03-doc-claims-hold.sh`）：

| 承诺 | 核验 |
|---|---|
| replay `<tape>` → REPORT.md + curve.csv + moments.csv | `replay.ts:446-448` 三件齐出 ✓ |
| records 下载"hash-verified" | `records-fetch.ts:109-111` 验 SHA-256＋体积再落盘，不符拒收 ✓ |
| "the single network call it can ever make"（唯一外网） | 全仓 CLI 侧唯一外部 `fetch` 在 `records-fetch.ts:106`；stage 其余 fetch 全同源 localhost ✓ |
| `--redact` 全脱敏分享带 | `cli/distill.ts:10` + `adapters/claude-jsonl/distill.ts:29 redactResult` 存在 ✓ |
| "standing privacy gate in the test suite" | `golden/privacy.redteam.test.ts` + `night2.security.test.ts` 在册 ✓（乙将压测其强度） |
| "Claude Code only" | `adapters/` 仅 `claude-jsonl` 一家 ✓ |
| 无参 `npx foley` 起 deck @ 4173 | `cli/index.ts:39-48` 默认端口 4173 ✓ |
| 版本 v0.1.0 一致 | `package.json:3` = README 注入值 ✓ |
| PROVENANCE 三件套 | 三曲各有 来源链接／许可证快照／作者身份＋人类制造声明；`LICENSE-FMA/CC0-snapshot-*.txt`、`catalog.json`、`records.manifest.json` 均在盘 ✓ |
| "95 golden tests" 数字 | `sync-readme --check` 绿，脚本口径自洽（非捏造）✓ |

---

## 质疑架构师席

1. **`private:true` 是有意"只 git clone、永不上 npm"，还是发布前忘了翻？** 若前者，README `npx foley` 头号命令是空头支票，须显著标注或改口径；若后者，发布前必做 `npm publish` 并锁定 "foley" 名归属。**这一条不定，卷首 #1 无法拆闸。**
2. **Node ≥23.6 的门槛，HN 发布可接受吗？** 越过它的用户在缩小。要么诚实前置到 quickstart（掉转化），要么 bin 预编译成 `.js`（护"一行起播"）。二选一请架构师裁。
3. **甲-2 的修法取向**：补交蒸馏夹具入库（要先脱敏时间戳/哈希，见甲-5）还是 `pretest` 合成？前者简单但把指纹钉进 git，后者干净但加构建步。
4. **发布闸无 CI**（独-C）：是否发布前接一条最小 CI（干净检出跑 test），把甲-2/甲-1 挡在自己门口而非 HN 门口？

（甲 §1 报告完；§3 视觉见 VISUAL_AUDIT.md；复现见 repro/final-甲/）
