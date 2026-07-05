# FOLEY NIGHT-2 对抗式审计（发布前哨）· AUDIT_REPORT

> 审计分支 `audit/night2` @ 快照锚 `ba5e777`（取锚 2026-07-06 00:54 +0800）。源码零改动，仅新增 `audit/night2/**`。
> 并发：夜里 SOUND-R3 与 M-T2 双轨在同仓活跃；本报告全程只审锚定快照，晨间分诊须与夜间新提交去重（见 §末去重注记）。
> 严重度：**P0** 阻断发布 / **P1** 发布前应修 / **P2** v1.x / **P3** 冰箱。每条附：复现·证据·建议修法·为何现有金测试没抓住。
> 姊妹件：`COLD_READER.md`（§0 冷读者庭）、`SOAK2_REPORT.md`（§2 通宵值机，晨间生成）、`repro/`（失败测试即证据）。

---

## 卷首 · 十大发现

| # | 严重度 | 发现 | 一句话 |
|---|---|---|---|
| 1 | **P0/P1** | `?tape=` DOM-XSS | 带名经 `insertAdjacentHTML` 注入，真浏览器点燃 `<img onerror>`；同源可读本地会话曲线并外带 |
| 2 | **P1** | `npx foley` 三重破产 | 包未发布＋`private:true`＋bin 无 shebang；README Quickstart **每一行**当前为假（冷读 §一） |
| 3 | **P1** | 求解器天花板普遍化 | 出厂 4 档里 **90 在五带上永远 = 60**，busy/jam 连 60=50；文法 viewerMax 之和 ≈54s 封顶 |
| 4 | **P1** | probe 和弦/ASK 运行即报错 | 内联剥掉 `degreeHz as coreDegreeHz` 别名 → `ReferenceError`；"chord for resolution" 在主演示页静默失声；**probe≠ear 同源主张证伪** |
| 5 | **P1** | 邮箱/PII 漏进默认蒸馏带 | `normErr` 无邮箱规则，`alice@acme.com` 原样落 `.tape.jsonl`；README「outputs never stored」名不副实 |
| 6 | **P2** | 巨型单行崩蒸馏（违「禁 crash」） | 10MB token 过 `/[A-Za-z0-9_-]{16,}/` 爆栈；live tail 同路径，一行掀翻直播 |
| 7 | **P2** | 金测试覆盖盲区 | dub 金测试只跑 `defaultS=45`（天花板之下），且长度断言是上界——结构上抓不到 60/90 |
| 8 | **P2** | 三处发布元数据打架 | 无 LICENSE 文件却称 MIT；version `0.0.0` vs「sealed v0.1.0」；测试 68 vs README「38」 |
| 9 | **P2/P3** | `/dub/save` 无鉴权跨站写盘 | 任意网页可 `fetch` 触发本地写（限 runs/dubs、限 .png/.json、32MB 帽） |
| 10 | **P3** | README 主视觉开不了机 | deck（金色机器照）需本地服务且 README 未提；fresh clone 装完即 `git` 脏（bin chmod） |

**一句话总纲**：产品**内核**（引擎/蒸馏/求解器/机器耳）扎实、且比 README 说的更强；**发布门脸**（Quickstart、许可、版本、主视觉、国际化）几乎全是空头支票。最危险的一种发布——里子真，门脸假。第一批 `npx` 用户会全部死在 README 第 16 行之前，而少数翻进源码的会撞见一个 XSS 和一个静默失声的和弦。

---

## 红队A' · 隐私攻击者

### A1 · 邮箱/自然语言 PII 漏进**默认**蒸馏带的 errClass — P1
- **复现**：`node audit/night2/repro/normErr_probe.mjs`（单元，15 向量 2 漏）＋ end-to-end：
  ```
  node cli/index.ts distill /tmp/leak-raw.jsonl /tmp/leak.tape.jsonl
  grep errClass /tmp/leak.tape.jsonl
  → "errClass":"smtp rejected recipient alice.wonderland@acme-corp.com bounc"
  ```
- **证据**：`normErr`（parse.ts:97）抹凭据/路径/hex/长token/数字，但**无邮箱规则**；邮箱含 `@ .` 打断了 `[a-z0-9_-]{16,}` 长 token 匹配，整串存活。redact 模式把 errClass 哈希（`e31d654ba`），故**只有默认带中招**。
- **为何金测试没抓**：`golden/privacy.redteam.test.ts` 的 SECRETS 夹具覆盖密码/pin/apiKey/URL 凭据/MCP名/CJK，**独缺邮箱与自然语言主机名**；且默认带断言只查「内联凭据与短口令」。网眼没有邮箱这一格。
- **牵连文档**：README「Privacy」段描述**默认**带即隐私保证——"event skeletons … **outputs never stored**"。但 errClass = 错误输出首行的 60 字符存储派生，且可含 PII。**这句承诺对默认带不成立**。
- **建议修法**：①`normErr` 增邮箱/IP/主机名规则（宁可过抹）；②更彻底——默认带即让 errClass 走 redact 同款哈希，明文 errClass 根本不落盘（见质疑架构师席 Q2）；③README 措辞校正为"错误**归一化聚类签名**（已尽力抹敏，非零明文保证）"。

### A2 · dub 导出链的时间/结构指纹（PNG 干净，sidecar 会说话）— P3
- **证据**：`runs/dubs/*.png` 的 PNG chunk 实检**只有 IHDR/IDAT/IEND，无 tEXt/eXIf/tIME**——单发 PNG 不泄元数据（像素即张力心电图，属主动导出，可接受）。但 `*.meta.json` 含 `createdAt`（ISO 墙钟＝撕纸时刻≈工时/时区指纹）＋ `tape` 名＋ `segments` 的**原始时间轴绝对 t0/t1**（如 `CLOSE t0:3964000` 泄露会话总长≈66min 与内部结构）＋ `tapeHash`（同带链接指纹）。
- **建议修法**：meta.json 的 `createdAt` 降到日期粒度或可选；分享指引明确"PNG 可单独分享；meta.json 含时间与时长结构"。
- **为何金测试没抓**：无导出物隐私回归测试。

### A3 · 资产合规与 redact 防退化 — 均**成立**（记录在案）
- **资产**：`sound/assets/LICENSES.md` 三条 L1（roomtone/filmstatic/crackle）均 CC0-1.0，逐条附 Freesound 出处、作者、内容哈希、加工链。**主张一致**。唯一存疑点是文案自述"Freesound HQ 预览 → afconvert…（CC0 对预览与原件同效）"——CC0 确对预览与原件同效，法理成立；建议保留采集日快照截图以备第三方质询（气味线索 §七.7 所指）。
- **redact 三向量防退化**：`golden/privacy.redteam.test.ts` 4/4 绿（密钥/MCP名/绝对时间/CJK）。M1.8 修复未退化。✅
- **路径泄漏**：`~/.foley/records` 唱片架命名未见漏进页面/日志（`/dub/save` 落 `runs/dubs/`，非 `.foley`）。

---

## 红队B' · 数学与确定性

### B1 · 求解器天花板是普遍病，出厂预设 60/90 部分/完全失效 — P1
- **复现**：`node audit/night2/repro/solver_sweep.mjs`（五带 × target 20→120 全扫）。
- **证据**（viewerS 实得，↓触顶后所有更大 target 同构）：

  | 带 | 天花板 | 60 | 90 | 90 与 60 |
  |---|---|---|---|---|
  | smooth | 53.7s@60 | 53.7 | 53.7 | **逐字节同构** |
  | busy | 48.0s@50 | 48.0(=50) | 48.0 | **同构** |
  | jam | 45.5s@50 | 45.5(=50) | 45.5 | **同构** |
  | storm | 51.5s@60 | 51.5 | 51.5 | **同构** |
  | silence | 35.5s@40 | 35.5 | 35.5 | **同构** |

- **根因（精确定位）**：文法各段 viewerMax 之和封顶——OPEN≈3 + RAMP 8 + PEAK 15 + TURN 4 + CLOSE 6 + 桥(maxCount 3 × stageMaxS 96 / speed 16 = 18) ≈ **54s**。任何 target > 54s 物理不可达，`solver.allowUnderrun` 令其静默认输，返回同一条撑满的弧。出厂 `targetsS:[30,45,60,90]` 里 **90 永远等于 60**，在 busy/jam 上连 60 都退化成 50。
- **为何金测试没抓**：`golden/dub.test.ts:30` 只以 `defaultS=45` 提议（在天花板之下，恒可满足）；长度断言 `viewerMs <= target+1000`（上界）＋ `>= target*0.6`（宽下界），**从不检 60/90，也无「不同 preset 出不同 cuts」「target↑⇒时长↑」单调性**。
- **建议修法**：要么删掉 60/90 预设（诚实：本机器最长约 50s 高光）；要么抬升文法上限（更多/更长桥段、PEAK maxS 提高）并让金测试对每个出厂 preset 断言可达性与互异性。这是**产品诚实 bug，非算术 bug**（见分歧席）。

### B2 · probe 页和弦/ASK 前景合成 `ReferenceError`，probe≠ear — P1
- **复现**：`bash audit/night2/repro/probe_coreDegreeHz.sh`（从零生成 probe.html，静态断言 2 调用 0 定义）＋运行时旁证 `shots/coldread-console.log` 两条 `coreDegreeHz is not defined`。
- **证据**：`sound/graph.js:35` `import { degreeHz as coreDegreeHz } from './core.js'`；`cli/probe.ts:inlineSoundSource` 删所有 `import ` 行（连别名一起丢），probe.html 只有 `function degreeHz`（175 行）却在 750（和弦 triangle）、770（ASK sine）调 `coreDegreeHz` → 抛。
- **牵连主张**：`cli/probe.ts:55` 与设计案"DUB 演出=齿孔提议=预览同源"、"与 cli ear 离线渲染同一份代码"——**被内联变换证伪**：ear 走真模块（别名解析）故 G1–G7 全绿，probe（浏览器主演示页）断。README 三音之一"a chord for resolution"在 probe 静默失声。
- **为何金测试没抓**：ear/golden `import graph.js` 作真 ESM（别名在），**无一测评估内联后的 probe.html 脚本**；任何 `X as Y` 形式的 import 经此变换都会静默断裂（本仓当前仅此一处别名，故仅此一处爆）。
- **建议修法**：①`inlineSoundSource` 对 `import {a as b}` 生成 `const b = a;` 垫片，或直接改写别名 import；②去掉 graph.js 里的别名（`degreeHz` 直接用）；③加一测：headless 载入生成的 probe.html，播放含和弦/ASK 的带，断言零 pageerror（即今夜 soak harness 的缩微版）。

### B-det · 位一致纪律 — **成立**
- cut.js 纯函数仅用 `+ − × ÷ abs min max floor round ceil`，**无 sin/exp/pow**；`shadowOf` 内的 `.sort` 只喂 informational 效率值、不入 segments，不破确定性。dub 金测试双算逐字节一致（dub.test.ts:43）。主张属实。✅

### B-lufs · 机器耳 LUFS 量具 — **准，可信**
- **复现**：`node audit/night2/repro/lufs_calib.mjs`。−23 dBFS/1kHz 正弦读 **−22.99 LUFS**（偏 0.01dB）；−33/−43 完美 10dB 台阶；100Hz 被 RLB 高通压 −1.82dB、白噪被 K 加权抬 +3.14dB，方向皆对。真 BS.1770（两级 biquad@48k＋门控），G7 响度门可信。✅

### B-hash · tapeHash — 理论点
- `sha16` = SHA-256 截 64bit。同带同哈希（正确语义）；生日碰撞 2^32 dubs 不实际。非 P 级。

---

## 红队C' · 恶意输入

### C1 · `?tape=` DOM-XSS — P0/P1（见分歧席定级）
- **复现**：`node audit/night2/repro/xss_tape_param.mjs 8934`（对 `serve.mjs --replay-only` 实测）。
  ```
  ?tape=zzz"><img src=x onerror="window.__xss()">
  → pre.innerHTML: Error: 找不到带子：zzz"&gt;<img src="x" onerror="window.__xss()">
  → XSS-FIRED: true（onerror 在真浏览器执行）
  ```
- **证据**：`main.js:130` `boot().catch(err => insertAdjacentHTML('beforeend', `<pre …>${err}</pre>`))`；`loadTape` 失败抛 `找不到带子：${name}`，`name = params.get('tape')`。攻击者带名→未转义→活 DOM。
- **危害升级**：该页同源可 `fetch('/today/curve.csv')`、`/dayroll/*`（**本地会话的张力曲线**）并 `POST /dub/save`——XSS 即**本地会话数据外泄面**。roadmap「hosted replays」一旦上线，链接可远程投递，直升 P0。
- **为何金测试没抓**：无 DOM/XSS 测试；金测试全在 Node 侧跑纯函数，不载页面。
- **建议修法**：错误落 `textContent` 而非 innerHTML；带名先 `encodeURIComponent`/白名单校验；对 `?tape=` 只接受 `[\w-]+` 与日期格式。

### C2 · 巨型单行崩蒸馏，违「禁 crash」— P2
- **复现**：`audit/night2/repro/malicious/`（6 例）；`hugeline.jsonl`（10MB 单 command）：
  ```
  RangeError: Maximum call stack size exceeded
    at sanitizeToken (parse.ts:117)  ← /[A-Za-z0-9_-]{16,}/.test(t)
    at targetHashOf (parse.ts:128) → distillTape (358)
  ```
- **证据**：`sanitizeToken` 对 10MB token 跑量词正则爆栈。同 regex 家族在 `normErr`（10MB FAIL 首行）与 `incremental.ts`（live 逐行）同样路径——**一条病理行可掀翻 live tail 与 stage 子进程**。`parse.ts` 亲口「坏行跳过、禁 crash」只挡 `JSON.parse`，未挡下游 regex。
- **其余 5 例**（空/垃圾/截断/异类型/坏负数）均优雅通过——禁 crash 对**结构性**坏行成立，对**超大 token** 失守。
- **为何金测试没抓**：unknown-tool/隐私红队夹具都是小样本；无超长输入 fuzz。
- **建议修法**：`sanitizeToken`/`normErr` 正则前 `t.length` 截断（如 `t.slice(0,4096)`）；蒸馏对单行字节设上限并当坏行跳过。

### C3 · `/dub/save` 无鉴权、可跨站触发的本地写 — P2/P3
- **证据**：`serve.mjs:101` 对 `POST /dub/save` 不校验 content-type，直接 `JSON.parse` 落盘。恶意网页可用默认 `text/plain` 简单请求 `fetch` 触发（跨源读不到响应，但**写副作用照发生**）——CSRF-到-本地磁盘。文件名 `String(tape).replace(/[^\w.-]/g,'_')` 已中和 `/`（路径穿越实测**被堵**：`../../../../tmp/PWNED` → `.._.._.._.._tmp_PWNED`，落 runs/dubs 内），扩展名恒 `.png/.meta.json`，32MB 帽在。危害限于 runs/dubs 灌垃圾。
- **建议修法**：`/dub/save` 校验 `Origin`/同源、或加一次性 token；拒非 `application/json`。

### C-trav · 静态件路径穿越 — **被堵**（记录）
- `serve.mjs:142` `normalize(decodeURIComponent)` + `join(root,·)` + `startsWith(root)`。五种穿越（`../`、`%2f`、`%2e%2e`、`fixtures/../`）实测**全 404 无泄漏**。✅

---

## 红队D' · 合规对账

- **参数账 hash 链闭合**：四本账 `params.json`(hashParams)、`verdict.json`(hashJson)、`sound-params.json`(hashJson)、`stage/cut-params.json`(sha16@dub) 各自被对应产物盖章上报（replay REPORT.md 头 / probe.html 头 / EAR_MACHINE.md / cuts doc）。链闭合。✅
- **白皮书 v1.1 未执法红字清点**：4 处**诚实自标** `未执法`——①DONE 渲染静默（候补门）；②weather→场景听感无机器判据；③前景峰 −18/呼唤 −14/真峰 ≤−1dBTP（无仪器）。响度 G7 已 active。**自曝纪律完好**（非隐瞒），符合"现实修正"诚实条款。建议发布说明书如实列这 4 项为 v1 已知未执法。
- **交付即合并法抽查**：FEEDBACK 明标「合并」的 `0c3813c`、`9fb3e82` 真可 `git cat-file -e` checkout。✅
- **金测试质检**：抽样 dub/engine/sound 断言——**有意义、非同义反复**（查确定性、整数输出、段不相压、PEAK 唯一且原速、桥段编制、覆盖率量纲）。唯一系统性缺陷是**覆盖范围**（见 B1/B2/A1 的"金测试没抓"三连）：只测 defaultS、无 preset 互异性、无 probe 页脚本评估、无邮箱向量、无超长 fuzz。断言质量高，靶面有洞。

---

## 分歧席（我与我自己的争议）

1. **C1 该定 P0 还是 P1？** 反方：仅 localhost，需受害者在跑 foley 时点攻击链接，尚无托管部署。正方：同源可静默读本地会话曲线并外带，是"读你全部会话"叙事的最坏坐实。**裁决取 P1，附 P0 升级条款**：一旦 roadmap「hosted replays」落地立即 P0。
2. **A1（邮箱）算真漏还是可接受？** 反方：默认带本地文件，README 叫你分享用 `--redact`。正方：README「Privacy」段把**默认**带作为卖点承诺（outputs never stored），邮箱确实存活，承诺与实现有差。**裁决 P1**：漏的不是"分享路径"，是"印在纸上的承诺"。
3. **B1 是 bug 还是设计上限？** 文法封顶本身是**有意**的（高光片不该 90s）。真正的 bug 是**出厂了永远做不到的 60/90 预设**。所以它是产品诚实 bug，不是数学 bug——修法可以是"删预设"而非"改算法"。

## 质疑架构师席（只有架构师能裁的假设）

- **Q1 · 内联同源假设已破**：probe 经 `inlineSoundSource` 剥别名而断（B2）。**M-T2 复制机（mp4 导出）若同法内联 graph.js，将继承同一别名 bug**——请架构师全局审这套"剥模块语法"变换，或改为真 bundler。"预览=导出=演出同源"当前是口号不是保证。
- **Q2 · errClass 为何默认明文？** 它是默认带里唯一的自由文本、也是"骨架 vs 内容"之间唯一的活口（A1）。挑战：默认即哈希（默认带 == redact 的 errClass 口径），彻底不留明文错误首行。保留明文的**产品理由**是什么？调试？那可否仅在 `--debug` 下留？
- **Q3 · `targetsS:[30,45,60,90]` 谁定的、可达过吗？** 文法 viewerMax 之和 ≈54s，60/90 从来物理不可达（B1）。是预设错还是文法帽错？哪个是正典？
- **Q4 · 带 4 条未执法条款发 v1 可否？** 白皮书诚实自标响度/场景/真峰未执法。这几项该不该 gate 发布，还是明说"v1 已知未执法、v1.x 补仪器"？

---

## 与夜间双轨提交的去重注记（晨间分诊填）

本报告审 `ba5e777`。若晨间 `git log ba5e777..main` 显示 SOUND-R3/M-T2 已改动下列文件，相应发现需复核是否已并行修复：
- B2/Q1 → `cli/probe.ts`、`sound/graph.js`、`sound/core.js`（M-T2 若动导出内联）
- B1/D → `stage/js/cut.js`、`stage/cut-params.json`、`golden/dub.test.ts`
- C1 → `stage/js/main.js`；C3 → `stage/serve.mjs`
- A1 → `adapters/claude-jsonl/parse.ts`、`golden/privacy.redteam.test.ts`

*（正文完。§0 见 COLD_READER.md；§2 见 SOAK2_REPORT.md；证据见 repro/ 与 shots/。）*
