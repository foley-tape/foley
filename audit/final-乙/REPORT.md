# FOLEY AUDIT-FINAL · 红队乙报告

**靶区**：§2 隐私与安全的最后死角 ＋ §0 最高律令
**锚定**：`main = 149ddea33746978aabe4f1db3e458d322c7aed32`｜工作树 `tape0-final-yi`（分支 `audit/final-yi`）｜端口 8942
**纪律**：只读审计；全程双盲（未看甲分支/甲目录/甲报告，未与甲交流）；只写 `audit/final-乙/` 与 `repro/final-乙/`。
**方法**：读源 → 对抗构造 → 失败测试即证据。所有 CONFIRMED 项均有可跑复现（见 `repro/final-乙/`，末节列清单）。

---

## 一、发现总表（严重度排序）

| # | severity | 一句话 | 命中理由 | 状态 |
|---|----------|--------|----------|------|
| **F1** | **P1** | 单个未鉴权、跨源的 `GET /%zz` 打垮整个 stage serve（`decodeURIComponent` 在 try 外，未处理 rejection → 进程崩） | 任意用户所访网站一发 no-cors fetch 即令本地 serve 崩溃（live 广播/在制 dub 全断）；崩点在 GET 鉴权之前 | CONFIRMED 复现 |
| **F2** | **P2** | 导出 mp4 的 `mvhd/tkhd/mdhd.creation_time` = 绝对墙钟出片时间（vendored mp4-muxer 写入，film.js 不覆盖） | 蒸馏管线竭力抹掉的「工作时段指纹」在**用户主动分享**的 mp4 里以秒级精度复活，无任何提示 | CONFIRMED 复现 |
| **F3** | **P2** | 「非脱敏可分享性」系统裂缝：默认 `.tape.jsonl`＋dub `meta.json` 含绝对时间/明文MCP工具名/errClass主机名——边界只靠一句文案 | 三处派生物（默认带、meta.json、导出 meta）都可反推工作时段/仓库身份，而阻止分享的只有 prose 警告，无技术闸 | CONFIRMED 源证 |
| **F4** | **P3** | `normErr` 让裸主机名/域名穿过落进默认带 errClass（路径规则要 `/`~`c:\`，点分主机名无一命中） | 默认带唯一自由文本字段泄漏内网命名/私有域→仓库身份；且非文档承认的边界 | CONFIRMED 复现 |
| **F5** | **P3** | GET 端点零 Host 头校验：`127.0.0.1` 绑定**挡不住** DNS-rebinding 读面 | 同端口 rebind 可同源读 `/today/{curve,moments}.csv`（极小化活动包络）；serve 注释「断 DNS-rebinding」名不副实 | CONFIRMED 复现 |
| **F6** | **P3** | `normErr` 的 ASCII-only 设计使 CJK/西里尔等非 ASCII PII/口令原样穿过 | 文档承认的边界，但本项目主用户群为中文——README「outputs never stored」对他们实质更弱 | CONFIRMED 复现 |
| **F7** | **P3** | 首启唱片下载征询文案钉死「GitHub Releases」，代码却 `fetch(manifest.url)` 取任意 URL（无 host 锁） | 文案与行为可背离；当前 manifest 为空（休眠），且征询前展示真实 URL，故仅 P3 | 源证（休眠） |
| **F8** | **P3** | `stage/tools` 开发依赖（playwright / ffmpeg-static 装期 postinstall 出网） | 经 `files: "!stage/tools"` 排除出 npm 包，用户安装零运行时依赖，仅殃及维护者拍摄环境 | 源证（不入发布） |

> 清单是地板不是天花板。F1 是我脱离线索自嗅到的头号雷（气味清单未列此崩溃向量）；F2/F3 是把「导出物指纹」线索追到容器与边界层的产物。**十条对抗密钥/XSS/写盘鉴权/绑定面在锚点均已被既有金测试焊死——阴性结论见第五节，值得架构师同等重视。**

---

## 二、正文（逐条：现象 / 根因 / 复现 / 影响 / 定级理由 / 建议）

### F1 · [P1] 未鉴权跨源单请求打垮 serve（malformed percent → 进程崩）

**现象**：对运行中的 stage serve 发一个畸形 %-序列的 GET（如 `GET /%zz` 或裸 `GET /%`），整个 serve 进程立刻崩溃退出；此后所有请求 `HTTP=000`（端口已关）。replay-only 与默认 live 两模式都中招。

**根因**：`stage/serve.mjs:240`
```js
let path = normalize(decodeURIComponent(url.pathname));   // ← 在 try 之外
...
try { let body = await readFile(file); ... }               // try 从 244 行才开始
```
`decodeURIComponent('/%zz')` 抛 `URIError: URI malformed`。此行位于 `createServer(async (req,res)=>{...})` 异步处理器内、且在 244 行的 try 之外——异步函数里的同步抛 = **未处理的 promise rejection**。Node（v15+ 默认 `--unhandled-rejections=throw`，实测 v26）遇未处理 rejection **终止进程**。崩点在所有 `/dub/*` 写盘鉴权之前，GET 静态路径本就无 Origin/令牌闸。

**复现**：`bash repro/final-乙/serve_dos_malformed_percent.sh` → 退出码 0，附崩溃栈定位 `serve.mjs:240`。实测崩栈：
```
URIError: URI malformed
    at decodeURIComponent (<anonymous>)
    at Server.<anonymous> (file://.../stage/serve.mjs:240:24)
```

**影响 / 可达性**：
- **跨源直达**：任意网站可 `fetch('http://127.0.0.1:8942/%zz',{mode:'no-cors'})`——no-cors 简单 GET 会真实送达本地 serve，服务器在产出任何响应前即崩，攻击者无需读响应。
- **绕 PNA**：现代 Chrome 的 Private Network Access 可能对 public→localhost 加 preflight，削弱纯跨源 fetch 路；但 **DNS-rebinding**（rebind 后同源）与**用户点一条 `http://127.0.0.1:8942/%zz` 链接**两条路都绕过 PNA，恒生效。
- 崩溃打断 live 20Hz 广播与任何在制 dub；用户须手动重启。属可用性打击（非 RCE/取数），可恢复。
- （已证伪并撤回：spawned `cli live` 子进程**不会**被遗留——父崩后子进程 stdout 管断随即自退。故本条不含子进程孤儿主张。）

**定级理由（P1 发布前必修）**：未鉴权 + 跨源可达 + 单请求打垮整机 + 正中 §0「一万个开发者怎么弄坏它」——是评论区最易演示的羞辱点。非 P0 因仅可用性、可重启、无数据损毁。**修复一行级**（`decodeURIComponent` 包 try/catch 返 400，或把 240–243 移入既有 try，或加进程级 `unhandledRejection` 兜底）。建议同时把 240 行的解码失败与 244 行的 readFile 失败统一走 400/404，勿静默。

---

### F2 · [P2] 导出 mp4 内嵌绝对墙钟 creation_time（工作时段指纹随片外传）

**现象**：stage 的「胶片/hero」导出走 `stage/js/film.js` → vendored `stage/vendor/mp4-muxer.mjs`。每件 mp4 的容器头 `mvhd/tkhd/mdhd` 的 `creation_time` 字段 = **出片那一刻的墙钟时间（精确到秒）**。

**根因**：
- `stage/vendor/mp4-muxer.mjs:1208`：`__privateAdd(this, _creationTime, Math.floor(Date.now()/1e3) + TIMESTAMP_OFFSET)`（`TIMESTAMP_OFFSET=2082844800`，即 1904 mp4 纪元）。该值写入 `moov→mvhd/trak→tkhd/mdia→mdhd`（177–279 行）。
- `stage/js/film.js:430` 构造 `new Mp4Muxer({target, video, audio, fastStart})`——**未传任何 creationTime 覆盖**（mp4-muxer 5.2.2 也未暴露此项），且导出后无抹除后处理。视频/音频**分片**时戳是相对零起点（`k*frameUs`、`off/sr`，见 464/489 行）——干净；**唯容器级 creation_time 是绝对墙钟**。

**复现**：`node repro/final-乙/mp4_fresh_export_probe.mjs`（钉住 `Date.now` 为已知值，驱 mp4-muxer 产真 mp4，读回 mvhd）→
```
stub Date.now  = 2026-07-07T13:45:07.000Z
mvhd creation  = 2026-07-07T13:45:07.000Z   ✗ 泄漏确认
```
旁证：`node repro/final-乙/mp4_creation_time_leak.mjs` 扫仓库自带 demo mp4——17 件 creation_time 全为 0（已抹）。**即：仓库对外发布的 demo 是被抹过的，而工具给用户的活导出不抹**（demo 的抹除来源未知：或屏录/或外部 `ffmpeg -map_metadata -1`，不能反证活路径）。

**影响**：mp4 是**设计上要分享**的产物（不像默认带有「勿外传」警告）。收片者 `ffprobe`/`mp4dump` 一眼读出精确出片时间——正是蒸馏对 `t/useT/resolveT` 做相对化、redact 把 `firstT` 归零所要消灭的「工作时段指纹」。隐私模型止于「带」的边界，指纹却在「导出」边界重新进场。

**定级理由（P2 v1.x）**：真泄漏、命中「反推工作时段指纹」且走无警告的分享路——本可判 P1。压到 P2 因：(a) mp4 creation_time 近乎所有视频文件都有，收片者惊讶度低；(b) 泄的是**出片**时刻而非全会话时钟；(c) 修复需 patch vendored 件或对导出 buffer 后处理抹三处 box。**建议**：导出时把 creationTime 钉为 0 或固定纪元（与仓库 demo 已抹的口径一致），并纳入金测试断言「导出 mp4 creation_time==0」。

---

### F3 · [P2] 「非脱敏可分享性」系统裂缝：边界只靠文案

一个主题，三处派生物都可反推**工作时段 / 仓库身份 / 所用 MCP 服务**，而阻止外传的只有一句 prose，无技术闸：

1. **默认 `.tape.jsonl`（`--redact` 之外）**——`adapters/claude-jsonl/parse.ts:distillTape` 产出：
   - `t/useT/resolveT` 是**绝对 epoch-ms**（`Date.parse(ISO)`，330/346 行）；只有 `redactResult`（`distill.ts:29`）才相对化。
   - `tool` 是**明文工具名**，含 MCP 自定义名（如 `mcp__AcmeCorp_ProjectZeus__deployProd`）；只有 redact 才加盐哈希。→ 泄漏用户接了哪些公司/项目/服务。
   - `meta.sourceHash = fnv1a(整卷原始 JSONL)`——是精确文件指纹（确认 oracle）；redact 置 `'redacted'`。
2. **dub `meta.json` 边纸（`stage/js/dub.js:694`、hero `:183`）**——`createdAt: new Date().toISOString()`（绝对时间，含日期），live 模式另加 `liveEpoch = live.t0`（当日首包绝对 epoch = 当日**开工时刻**指纹）。落 `runs/dubs/*.meta.json`，随目录/边纸外传即泄。
3. **导出 mp4 creation_time**——见 F2。

**共性根因**：隐私正典把「安全形态」= `--redact`，把默认带定义为「本地抽检用」，并以 `distill.ts:26` 一句「仍不建议外传未审带」收口。但**没有任何代码阻止**用户 `distill`（默认不 redact）后把 `.tape.jsonl`/`meta.json`/`.mp4` 直接发出去；也无「分享前先 redact」的引导闸。`redact` 形态本身经金测试验证是干净的（见第五节），裂缝在**默认与分享之间的边界仅是文案**。

**复现**：源证（上列文件行）；F2 的 mp4 探针为其一物证。

**定级理由（P2）**：单个泄漏各自 P3，但「可分享边界只靠 prose」是需架构师拍板的**决策级**裂缝——命中「反推会话内容/仓库身份/工作时段」三问。**建议**（择一）：分享/导出默认走 redact；或导出前强制相对化时间＋哈希工具名＋抹 mp4 creation_time；或至少在产默认带时 stderr 打「此带含绝对时间与明文工具名，分享前请 `--redact`」。

---

### F4 · [P3] `normErr` 让裸主机名/域名穿过（默认带 errClass 仓库身份泄漏）

**现象**：默认带唯一自由文本字段 `errClass`（错误首行归一化）会放行**点分主机名/裸域名**。

**根因**：`parse.ts:98 normErr` 的路径规则要 `/`（`\.{0,2}\/[\w./@\\-]+`）、`~`、或 `c:\`；而 `api.staging.internal`、`secret-admin.evil-internal.co` 这类**无斜杠、无数字、每段 <16 字符**的主机名，逐条规则皆不命中（长 token 要 ≥16；「4–15 混合」要含数字），于是原样落盘。

**复现**：`node repro/final-乙/normErr_probe.mjs`（18 向量）→ 标准 ASCII 凭据（AWS/Bearer/GH/邮箱/家目录/连接串/`-p`/`key=val`/IPv4/UUID）**全被抹**（防御生效）；穿过者中两条**非文档边界**：
```
SURVIVOR [⚠ 非文档边界] 内网主机名: "api.staging.internal" 存活
SURVIVOR [⚠ 非文档边界] scheme-less URL: "secret-admin.evil-internal.co" 存活
```

**影响**：泄内网命名规律/私有域 → 反推仓库/组织身份。限**默认带**（`--redact` 把整个 errClass 哈希为 `e<hash>`，穿过者全灭）；且 errClass **不进** stage/导出（moments.csv 无此列），故只在用户外传原始 `.tape.jsonl` 时暴露。

**定级理由（P3）**：需「用户外传未 redact 带」才现，但属**未文档承认**的抹敏缺口（区别于 F6 的 CJK 已知边界）。**建议**：`normErr` 增一条主机名/域名规则（`\b[a-z0-9-]+(\.[a-z0-9-]+){2,}\b → HOST`），或在报告里把「裸主机名」并入已知边界明示。

---

### F5 · [P3] GET 端点零 Host 校验：`127.0.0.1` 绑定挡不住 DNS-rebinding 读

**现象**：serve 对写端点有 Origin 白名单 + 令牌双闸，但 **GET 端点**（`/today/{curve,moments}.csv`、`/dayroll/*`、静态件）**无任何 Origin/Host 校验**。

**根因**：`serve.mjs:255` `.listen(port,'127.0.0.1')` 注释称「断局域网/DNS-rebinding 直写面」。绑 127.0.0.1 确实断**局域网**（实测 LAN IP `192.168.1.4:8942` 拒；lsof 证 socket 仅 `127.0.0.1`），但**绑定面对 DNS-rebinding 无效**——rebind 正是让攻击者域名解析到 127.0.0.1。挡住 rebind 写的是 `writeAuthed` 的 Origin 白名单（`:32`），**不是**绑定；而 GET 无此闸，也**全局无 Host 头校验**。

**复现**：`GET /` 带 `Host: evil.attacker.com` → **HTTP 200**（源样服务，证无 Host 闸）。见 `repro/final-乙/serve_probe_notes.md`。

**影响**：同端口 rebind（受害者需以 `http://evil:8942` 为初始源，有钓鱼门槛）后可同源 GET 读 `/today/{curve,moments}.csv`。所幸这两卷是**极小化包络**（列 `t,emitT,seq,verb,outcome,m,tags,special,sig,k,clearedBy,slot` / 曲线态；**无原文、无 errClass**），只泄活动节奏/类型。

**定级理由（P3）**：读面泄漏、数据已极小化、且有钓鱼前置。**建议**：加标准 DNS-rebind 防御——校验 `Host` ∈ {`localhost:port`,`127.0.0.1:port`}，非白即 403（一处兜全端点，含 F1 崩点之外的所有 GET）；并订正 `:255` 注释（绑定≠防 rebind）。

---

### F6 · [P3] `normErr` ASCII-only：非 ASCII PII/口令原样穿过

**现象/根因**：`normErr` 全部规则基于 `[a-z]`（且首行先 `.toLowerCase()`）。CJK 人名、西里尔口令、中文业务词等落在正则外，原样进 errClass。

**复现**：`normErr_probe.mjs` → `张伟`、`月亮宝贝门牌`、`солнцеключ` 均存活（脚本内已标「已知边界」）。golden `night2.security.test.ts:36` 亦注明「中文业务词属设计边界，不在断言内」。

**定级理由（P3，文档已承认）**：单列是为**指出其对本项目的实质权重**——README/README.zh 面向中文用户，作者亦中文；这些用户的错误信息最可能含本地化 PII/口令，而「outputs never stored」的兑现点（errClass 抹敏，见 `privacy.redteam.test.ts:98`）对他们**明显更弱**。属「承诺 vs 现实」的分层裂缝，见第四节。**建议**：要么补非 ASCII 抹敏（如对 errClass 里非 ASCII run 整体替 `NONASCII`），要么在 README 显式限定「errClass 抹敏为 ASCII 凭据模式」。

---

### F7 · [P3] 首启下载：征询文案钉死 GitHub，代码取任意 manifest URL

**现象/根因**：`cli/records-fetch.ts:78` 文案「将从 GitHub Releases（tag …）取回」，但 `:106` `fetch(r.url)` 的 `r.url` 直取自 manifest 记录，**无 host 白名单**。若 manifest（或被篡改的 manifest）带非 GitHub URL，文案即与行为背离；`fetch` 亦无超时/重定向次数控制（默认跟随最多 20 跳，理论 SSRF 面，但落在用户本机、且征询已展示真实 URL）。

**现状**：`sound/records/records.manifest.json` **当前为空**（`records:[]`，「候船长终裁名单」），此路**休眠**。且哈希/字节双验（`:110-111`）、拒绝路径零网络、非 TTY 无 `--yes` 直接 `exit(3)`——征询与验证机制本身**扎实**（见第五节）。

**定级理由（P3）**：休眠 + 征询前展示真实 URL + 双验。**建议**：manifest URL 加 `https://github.com/` 前缀断言（或允许列表），使文案成为可执法的不变量；`fetch` 加超时与 `redirect:'error'`。

---

### F8 · [P3] `stage/tools` 开发依赖（装期出网 postinstall）

**现象**：`stage/tools/package.json` devDeps = playwright / ffmpeg-static / mp4-muxer / webm-muxer / gifenc / typescript / @types/node（lock 共 31 包）。`ffmpeg-static` 与 `playwright` 装期经 postinstall 下载平台二进制（出网 + 供应链信任）。

**根因/现状**：经根 `package.json` 的 `"files": ["!stage/tools", ...]` **排除出 npm 发布**；根包运行时依赖仅 `undici-types`（纯类型，无运行时码）。故此供应链面**只殃及维护者**拍摄环境，**用户 `npm i foley` 零运行时依赖、零此面**。vendored 三件（gifenc/mp4-muxer/webm-muxer）版本与 `stage/vendor/LICENSES.md` 及 `licenses/` 原文一致，MIT，无 phone-home（webm 的 `APP_NAME=github…` 是写入容器的库名 tag，非出站）。

**定级理由（P3，不入发布）**：**建议**仅记录在案——发布前 `npm pack --dry-run` 确认 `stage/tools` 确被排除；`ffmpeg-static`/`playwright` 的装期出网在 README 维护者章节已提示（`stage/tools/package.json.description`）。

---

## 三、脱离线索·我自己嗅到的（off-leash）

气味清单（§2）列了 XSS/路径穿越/DUB_TOKEN/绑定面/蒸馏/导出指纹/下载/依赖。以下是我**追出清单之外或把线索追到更深层**的产物：

- **F1（清单未列）**：清单在「serve 与页壳」只点 XSS 与写盘鉴权；我顺手测畸形输入的**健壮性**，撞见 `decodeURIComponent` 在 try 外的**崩溃向量**——一个纯可用性、未鉴权、跨源可达的 DoS。这是本报告头号雷，完全在气味清单之外。
- **F2/F3（把「导出指纹」追到容器与边界层）**：清单问「导出物能否反推工作时段」；我把它追到 vendored muxer 的 mvhd `creation_time`（活路径实证泄漏）、并上升为「默认 vs 分享边界只靠文案」的系统裂缝——从单点指纹到边界机制。
- **F5（把「绑定面」追成「绑定≠防 rebind」）**：清单问「127.0.0.1 是否真只绑本地」；答案是「是，但绑定挡不住 DNS-rebinding，而 GET 面零 Host 校验」——把一个二元问题追成防御机制的错位。
- **确认 `?sp=` 在发布 stage 内无消费者**：气味清单点了 `?sp=`，我全仓 grep 未见任何 `?sp=` 读点（`?record=` 在 `probe.ts` 仅做字符串比对+parseInt，无 DOM/fetch 汇聚）。据实报「无此面」。

## 四、质疑架构师席

1. **隐私模型的「边界断层」**：正典把安全性押在 `--redact` 分享形态（它确实干净），却把默认带、meta.json、mp4 导出留在「本地/文案警告」的模糊地带。**问**：既然分享是产品核心动作（撕纸条、出片、hero 发布），为何不让**分享路默认即脱敏**、把 `--redact` 变成「不脱敏」才需显式开关？现状是「安全需要用户记得加 flag」，而 §0 的一万个开发者只会走默认路。
2. **「outputs never stored」的兑现点太窄**：`privacy.redteam.test.ts` 与 `night2.security.test.ts` 把这句承诺兑现在「errClass 抹敏」上——但 errClass 抹敏是 **ASCII-only**（F6）且**放行裸主机名**（F4）。对中文用户群，这句承诺的实际强度与英文用户不对等。**问**：README 是否该把承诺限定为「ASCII 凭据模式」，或补齐非 ASCII/主机名抹敏，让承诺对全体用户为真？
3. **仓库自带 demo 的 mp4 creation_time 全为 0，用户活导出却非 0（F2）**：这说明**有人知道**该时戳值得抹（发布物被抹过），但抹除**不在工具里**。**问**：为何抹除是维护者的手工步骤而非导出管线的一部分？把它焊进导出＋金测试，是与「素材诚实/零遥测」定位一致的一步。
4. **serve 注释的自我背书**（F1/F5）：`:27` 称三闸叠加、`:255` 称「断 DNS-rebinding」——注释把绑定面当成了 rebind 防御，而真正的 rebind 写防御是 Origin 白名单、读面则**根本没防**。**问**：注释即契约；建议让注释与实际防御边界一一对齐（绑定断 LAN、Origin 断跨源写、缺失项 = Host 校验断 rebind 读）。

## 五、防御确认为实（阴性结论也是结论）

以下在锚点 149ddea **实测扎实**，架构师可据此不重复投入：

- **零运行时依赖**：根包仅 `undici-types`（纯类型定义，无运行时码）；`typescript`/`@types/node` 为 devDeps。供应链面极小。
- **唯一网络出站 = 征询门下的唱片下载**：全仓 grep（`repro/final-乙/egress_sweep_notes.md`）确认仅 `records-fetch.ts:106` 一处 `fetch`，且 SHA-256＋字节双验、拒绝零网络、非 TTY 无 `--yes` 拒动网；其余「网络」命中皆为 WebAudio `.connect()`、SVG 命名空间、provenance 数据串、或 dev 脚本（verify-probe 连本地 Chrome 调试口）。浏览器侧 fetch 全为相对/本地端点。
- **serve 写盘鉴权**：每启动随机令牌 `randomBytes(18).base64url` 注入同源 `<head>` + Origin 白名单双闸——跨站/rebind **写**被挡（golden `night2.security.test.ts` 覆盖 W-1/跨源/save-bin 白名单/穿越折叠）；`safeStem` 折叠 `..`、KIND 白名单，路径穿越无门。
- **绑定面**：socket 实测仅 `127.0.0.1`（lsof 证），LAN IP 直连被拒。
- **`--redact` 分享带**：加盐 `fnv1a` 哈希工具名/errClass/sig/targetHash、时间相对化、`sourceHash='redacted'`——七类密钥＋MCP名＋绝对时戳全灭（`privacy.redteam.test.ts` 常设在册）。
- **页壳 XSS/穿越**：`?tape=` 经 `[^\w-]` 白名单、boot 错误经 `textContent`、其余参数皆比对/数值/白名单；`innerHTML` 汇聚点用静态或应用自有 DOM（hud 的 tapeName 仅用于比对不注入）。C1/C3 修复未回归。
- **vendored 三件许可证合规**：MIT，`LICENSES.md`＋`licenses/` 原文齐备，无 phone-home。
- **`normErr`/`sanitizeToken` 长度守卫（C2）**：10MB 单行秒回、有界，未牺牲 8KB 内抹敏（`night2.security.test.ts` 覆盖）。

## 六、复现清单（`repro/final-乙/`）

| 脚本 | 对应 | 跑法 | 判读 |
|------|------|------|------|
| `serve_dos_malformed_percent.sh` | F1 | `bash …` | 退出 0 = 复现（附崩栈）；serve 崩后 HTTP=000 |
| `mp4_fresh_export_probe.mjs` | F2 | `node …` | 退出 1 = 泄漏（新鲜 mp4 creation_time==stub 墙钟） |
| `mp4_creation_time_leak.mjs` | F2 旁证 | `node …` | 扫仓库 mp4；本仓 demo 全 0（已抹）——对照活路径 |
| `normErr_probe.mjs` | F4/F6 | `node …` | 退出 1 = 有非文档边界穿过；打印每向量抹/穿 |
| `egress_sweep_notes.md` | 第五节 | 阅 | 全仓网络出站 grep 结论 |
| `serve_probe_notes.md` | F1/F5 | 阅 | Host 校验缺失、绑定面、写鉴权实测记录 |

（可转回归：F1 建议加 `golden` 断言「serve 收畸形 %-路径返 4xx 不崩」；F2 建议加「导出 mp4 creation_time==0」。）
