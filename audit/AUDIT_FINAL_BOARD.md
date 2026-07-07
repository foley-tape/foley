# AUDIT_FINAL_BOARD · 双盲终审交叉比对（§4，架构师主持）

> 锚点 `main = 149ddea`｜两队双盲独立作业后合并｜末次更新 2026-07-07。
> 全文报告：**甲**＝分支 `audit/final-jia`（@56b8d73）→ `audit/final-甲/REPORT.md`（§1 文档）＋`VISUAL_AUDIT.md`（§3 视觉）＋`repro/final-甲/`；**乙**＝分支 `audit/final-yi`（@cce0553）→ `audit/final-乙/REPORT.md`（§2 隐私安全）＋`repro/final-乙/`。
> 定级：`P0 阻断发布／P1 发布前必修／P2 v1.x／P3 冰箱`。命中标注：甲／乙／视觉／**几队命中**。

---

## 0. 一句话给船长（上报核心）

GATE 现读 **「5 绿·G2 就绪·0 红·0 阻·待人类扳机」**。双盲终审在此之上 surfaced 四件 GATE 未捕获的东西：

1. **一条双队收敛真雷（TR-1）**——`--redact` 之外的派生/导出物保留**绝对时间戳＋明文标识**（工作时段/仓库指纹），分享/默认边界**仅靠文案无技术闸**。甲（夹具角度）与乙（导出角度）**独立撞上同一根**，最高置信。
2. **乙-F1 令 G1「安全 P1 清零 ✅」名不副实**——一个未被 C1/C2/C3 覆盖的**未鉴权、跨源、单请求打崩 serve** 的 DoS（`decodeURIComponent` 在 try 外）。
3. **甲-2 令 G2/§6.1「npm test 105/105 全绿」仅在作者树成立**——6 条金测试读 gitignore 掉的 `tapes/*.tape.jsonl`；**公开镜像（§6.2 orphan-clean）与任何克隆者跑出 6 红**。
4. **乙-F5 纠正 G1 原则②的措辞**——`listen(127.0.0.1)` 断的是局域网，**不是** DNS-rebinding；GET 面零 Host 校验，「断 DNS-rebinding」注释名不副实。

**结论**：拆 G2 之前，**G1 应因 F1 重开、G2 的绿应加「环境依赖」注并补脱敏夹具、并新增一条 G7「分享/导出脱敏」前置闸（TR-1）**。其余为已 track 项（确认闭合）与新 P2/P3（视觉九条＋若干）。**两队零矛盾**；乙 §5 独立复验并**背书**了 GATE 已有的安全绿（redact 干净／写盘鉴权／127 绑定／XSS／许可证）——F1/F4/F5 是**新增缺口**，非推翻。

---

## 1. 真雷 · 双队收敛（最高置信，发布前必处置）

### TR-1【P1·发布前必处置】`--redact` 之外，时间戳＋明文标识指纹外泄，边界仅文案
- **两队独立命中**：
  - **甲-5**（文档/夹具角度）：蒸馏骨架 `tapes/*.tape.jsonl` 保留 `episodes[].startT/endT`（纪元毫秒真时）＋逐事件 `targetHash`；甲发现「若靠补交夹具修 npm-test（甲-2），会把这些指纹永久钉进 git」，并明标「交乙」。
  - **乙-F2**（导出容器角度）：导出 mp4 的 `mvhd/tkhd/mdhd.creation_time` = 出片墙钟秒级时间（vendored mp4-muxer 写入，film.js 不覆盖，导出后不抹）；实证探针钉住 `Date.now` 复现。旁证：仓库自带 demo mp4 的 creation_time **全为 0（已抹）**——即「有人知道该抹，但抹不在工具里」。
  - **乙-F3**（默认派生物角度）：默认 `.tape.jsonl` 的 `t/useT/resolveT` 是绝对 epoch＋`tool` 是明文 MCP 名（如 `mcp__AcmeCorp_ProjectZeus__deployProd`）＋`sourceHash` 是精确文件指纹；dub `meta.json` 的 `createdAt`/`liveEpoch`（当日开工时刻）——三处派生物都可反推工作时段/仓库身份/所用服务。
- **共性根因**：隐私正典把「安全形态」定义为 `--redact`（它经金测试验证**确实干净**——乙 §5 背书），但**默认、导出、meta 三条路径全在 redact 之外**，且阻止分享的只有 prose。§0 的一万个开发者只走默认路。
- **为何是真雷而非各自 P2**：单看甲-5/乙-F2/乙-F3 各为 P2；但**两队从三个不同角度独立收敛到同一根**——按令 §4「双队独立收敛→真雷（最高置信，发布前必处置）」，**升级为发布前必处置**。
- **处置（择一，供架构师裁）**：①分享/导出路**默认即脱敏**，把「不脱敏」变成需显式开关；②导出前强制相对化时间＋哈希工具名＋抹 mp4 三 box（`mvhd/tkhd/mdhd` creation_time 钉 0，与仓库 demo 已抹口径一致）；③至少产默认带时 stderr 警示「含绝对时间＋明文工具名，分享前 `--redact`」。并加金测试断言「导出 mp4 creation_time==0」「默认带外传前提示」。

---

## 2. 挑战现有绿闸的发现（发布前必修）

### F1【P1】未鉴权跨源单请求打崩 serve —— 挑战 G1「安全 P1 清零 ✅」｜乙
- 畸形 `%`-序列 `GET /%zz`／裸 `/%` → `serve.mjs:240` `decodeURIComponent` 在 244 行 try **之外** → 异步处理器内同步抛 = 未处理 rejection → Node（v26 实测）**终止进程**。崩点在所有写盘鉴权之前，GET 静态路径本无闸。
- 可达性：任意网站 `fetch('http://127.0.0.1:PORT/%zz',{mode:'no-cors'})` 直达；DNS-rebinding 与「点一条 `127.0.0.1:PORT/%zz` 链接」绕 PNA 恒生效。打断 live 广播/在制 dub，需手动重启（可用性打击，非 RCE/取数）。
- **对 G1 的意义**：G1 现绿依据是 C1/C2/C3/A1 全修＋22 条回归。F1 是**这套之外**的崩溃向量——G1「P1 清零」**不成立**。修复一行级（`decodeURIComponent` 包 try/catch 返 400，或加进程级 `unhandledRejection` 兜底）＋回归断言「serve 收畸形 %-路径返 4xx 不崩」。
- 复现：`bash /Users/shadow/tape0-final-yi/repro/final-乙/serve_dos_malformed_percent.sh`（退出 0＋崩栈定位 `serve.mjs:240`）。

### 甲-2【P1】干净克隆 npm test 6/105 红 —— 挑战 G2/§6.1「105/105 全绿」｜甲
- 全新工作树（无 `tapes/`）→ `tests 105 / pass 99 / **fail 6**`（⑭ sweep／㉛ storm 床包络／㊵ G1／㊶ G2／㊷ G3／58 renderCuts，全 `ENOENT tapes/*.tape.jsonl`）。补入 gitignored `tapes/` → **105/105**，证根因纯缺夹具、非真 bug。
- **对 G2 的意义**：GATE §6.1「prepublishOnly … npm test 105/105」是在**含私有 tapes/ 的作者树**测得——发布从作者树走故 prepublishOnly 过。但 §6.2 步 3 的**公开镜像**用 `git checkout --orphan public-main`（gitignored 的 tapes/ 不入 orphan 提交）→ **镜像 npm test = 6 红**；任何克隆公开镜像者亦 6 红，直接打脸「Engine sealed / 95 golden tests」。npm tarball 排除 `golden/`，故 `npm i foley` 用户不受累——**面收窄为公开镜像/克隆的测试红**，但正是 §0「一万开发者 clone+test 截图」的靶心。
- 处置：把 5 个夹具以**脱敏合成骨架**入库（须先零化时间戳/换合成 targetHash——见 TR-1），或加 `pretest` 生成，使 clean checkout 绿。
- 复现：`bash /Users/shadow/tape0-final-jia/repro/final-甲/01-npm-test-on-clone.sh`（干净 6 红↔补带 105 全绿）。

### F5【P2】GET 面零 Host 校验，绑定挡不住 DNS-rebinding —— 纠正 G1 原则②｜乙
- `serve.mjs:255 listen(127.0.0.1)` 注释称「断局域网/DNS-rebinding 直写面」。绑定**确实断局域网**（乙 lsof 实证 socket 仅 127.0.0.1、LAN 直连拒），但**对 rebinding 无效**（rebind 正是解析到 127.0.0.1）；挡 rebind **写**的是 Origin 白名单，**读**面（`/today/{curve,moments}.csv`）**全局无 Host 校验**（`GET / Host: evil.com` → 200）。
- **对 G1 的意义**：G1 §2 原则②把「绑定」当成了 rebind 防御——**措辞名不副实**。读面泄漏已极小化（curve/moments 无原文无 errClass，仅活动节奏）＋有钓鱼前置，故 P2。处置：加 Host 白名单闸（`Host ∈ {localhost:port,127.0.0.1:port}` 非白 403，一处兜全 GET，含 F1 崩点外的所有端点）＋订正 `:255` 注释。

---

## 3. 已 track 项（GATE 已在案，本次为确认/闭合，非新雷）

| ID | 发现 | GATE 关系 | 本次结论 |
|---|---|---|---|
| 甲-1 | `npx foley` 需 private 翻＋发布＋名归属 | **G2 有意保险栓**；§6.2 runbook；名 `foley` registry **E404 可用**（无抢注） | 确认闭合；风险由 §6.2「publish 前置于镜像」管住。残留仅：README 头位仍 foreground `npx foley`（发布前工作、pre-publish 拉 E404）——按 runbook 时序即真 |
| 甲-3 | Node ≥23.6 门槛 | **cold#5 已处置**（engines/README 从源码段标注） | 确认；残留 P3：未进 Honest-limits／npx quickstart 显要处（文案增补） |
| 甲-10 | hero.gif 12MB 在 git | **GATE §7.2 已在案**（README 必需·不入 tarball·check-media 宜加白名单豁免） | 确认；本次实测证不入 tarball |
| 乙-F6 | normErr ASCII-only，非 ASCII PII 穿过 | **GATE §2 残留已记**（中文业务词属设计边界） | 确认；乙升权重：README「never stored」对中文用户群实质更弱（文案该限定「ASCII 凭据模式」或补非 ASCII 抹敏） |
| 乙-F8 | stage/tools 装期出网 postinstall | **G2 files 排除已在案** | 确认不入发布；仅殃及维护者环境 |

---

## 4. 新增单队发现（逐条定级，深度探针）

| ID | 定级 | 发现 | 命中 |
|---|---|---|---|
| 甲-4 | P2 | DUB「~9× realtime」无支撑（引擎自设影子目标 ≥2×，`film.js:516`） | 甲 |
| 甲-6 | P2 | `still-6-asleep.png` 标「Asleep — one dim ember」实为满亮面板（资产/文案不符宪法睡态） | 甲＋视觉 |
| 乙-F4 | P3 | normErr 放行裸主机名/域名（`api.staging.internal` 等，默认带仓库身份泄漏）——非文档承认边界 | 乙 |
| 乙-F7 | P3 | records-fetch 取任意 manifest URL 无 host 锁（当前 manifest 空·休眠；征询前展 URL·双验扎实） | 乙 |
| 视-5/6 | **P2** | VU **缺曲面烟色玻璃罩＋反射高光**（材质法明文「烟色玻璃罩表头」只兑现到平面渐变盖片）——船长九条头牌，**违宪** | 视觉 |
| 视-2 | **P2** | 表头**无落地投影**（`.bezel` 只内阴影，仅整机有 drop-shadow）→「阴影塌房」——**违光法** | 视觉 |
| 视-9 | **P2** | DUB 键 `transform 0.1s ease` 补间——**违动法「禁补间」**「无阻尼」 | 视觉 |
| 视-4 | P2 | 纸面高光静态烘焙、不随 `#keylight`/weather 联动——「纸无光学反应」违光法 | 视觉 |
| 视-8 | P2 | 丝印 `text-shadow:0 1px 0 亮色`=浮雕而非蚀刻＋字距 0.30em 偏松——违字法 | 视觉 |
| 视-1 | P3 | 整体发虚：`lens.js:57` 半分辨率镜头层经 overlay 铺满整机（纸/VU 本身满 dpr）——宪法缺口（无清晰度地板） | 视觉 |
| 视-3/7 | P3 | 坐标纸纯几何无印刷微差／ASK 熄灭态近平面无圆柱形体——宪法缺口 | 视觉 |

> 视觉九条完整「违宪/缺口＋代码根因」见甲 `VISUAL_AUDIT.md`。修法归 STAGE 轨；#5/#2/#9 三条**违宪明文**建议列 v1.x 首批（HN 审美挑剔者最易一眼点破）。

---

## 5. 防御确认为实（甲乙共同背书，架构师可不重复投入）

乙 §5 独立复验、与甲「已核验为真」节**互证**，以下在锚点扎实：
- **零运行时依赖**（根包仅 `undici-types` 纯类型）；**唯一外网出站 = 征询门下唱片下载**（`records-fetch.ts:106`，SHA-256＋字节双验、拒绝零网络、非 TTY 拒动网）。
- **serve 写盘鉴权**：每启动随机令牌＋Origin 白名单双闸；`safeStem` 折叠 `..`＋KIND 白名单，路径穿越无门（`night2.security.test.ts` 覆盖）。
- **绑定面**：socket 实测仅 127.0.0.1，LAN 拒（**但见 F5：绑定≠防 rebind**）。
- **`--redact` 分享带**：加盐哈希工具名/errClass/sig/targetHash＋时间相对化＋`sourceHash=redacted`——七类密钥＋MCP 名＋绝对时戳全灭（`privacy.redteam.test.ts` 常设）。**（但见 TR-1：redact 之外的默认/导出路径不享此保护。）**
- **页壳 XSS/穿越**：`?tape=` 白名单、boot 错误 `textContent`、C1/C3 未回归；`?sp=` 全仓无消费者（乙据实报「无此面」）。
- **发布打包泄漏面干净**：本次实测 tarball 无 tapes/音频/密钥/docs/测试；`stage/fixtures` 仅 storm.* 随包（合 §6.1 意图）。

---

## 6. 给 GATE 的净结论（详见 AUDIT_FINAL_GATE_PATCH.md）

- **G1 安全 P1 清零**：✅ → **🔴 重开**（乙-F1 未鉴权跨源 DoS；F5 纠正原则②注释）。
- **G2 发布打包**：🟡 就绪 → **🟡＋注**（甲-2：绿仅作者树成立，公开镜像/克隆=6 红；补脱敏夹具/pretest 后方可；REHEARSAL-MANIFEST 已过期需重跑 pack 审计）。
- **新增 G7 分享/导出脱敏闸**：🔴（TR-1 真雷；redact 之外指纹外泄，发布前必处置）。
- 记分牌草案：**从「5 绿·0 红·0 阻·待扳机」→「G1/G7 红·G2 待补·拆闸前须清 3 项 P1」**。

（交叉比对完；两队零矛盾；真雷 1／挑战绿闸 2／纠正 1／已 track 5／新 P2-P3 若干。GATE 补丁提案见同目录 `AUDIT_FINAL_GATE_PATCH.md`。）
