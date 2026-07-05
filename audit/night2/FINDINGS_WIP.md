# NIGHT-2 findings 流水（WIP，晨间整编入 AUDIT_REPORT.md）

## 已证（复现在 repro/）
- **A1 email 泄漏进默认蒸馏带 errClass**：normErr 无邮箱规则；`alice.wonderland@acme-corp.com` 原样落 `.tape.jsonl`。redact 模式哈希掉，故仅默认带中招。end-to-end 已证（repro/normErr_probe.mjs + /tmp/leak.tape.jsonl）。牵连 README「outputs never stored」名不副实（errClass=输出首行的存储派生）。P1。
- **C1 ?tape= DOM-XSS**：main.js:131 `insertAdjacentHTML(...${err})`，loadTape 失败抛 `找不到带子：${name}`，name=URL参。payload `zzz"><img src=x onerror=...>` 在真浏览器点燃（repro/xss_tape_param.mjs，XSS-FIRED:true）。同源可读 /today、/dayroll 本地会话曲线并 POST /dub/save 外带 → 本地会话数据外泄面。roadmap 有 hosted replays 会放大。P1（近 P0）。

## 待证/在查
- A2 dub 导出链：dub.meta.json 带 createdAt(ISO 墙钟→工时指纹) + tape 名 + segments 绝对 t0/t1（泄会话总时长与结构）。PNG=canvas.toDataURL 无 tEXt 元数据块但像素即张力心电图。tapeHash=sha16(curve+moments) 64bit 不可逆但可做同带链接指纹。
- A3 唱片架路径：/dub/save 文件名 `String(tape).replace(/[^\w.-]/g,'_')` → 路径穿越已被字符类堵（. 保留但无 /）；复核 replay 模式 tape 名来源。
- 资产合规：LICENSES.md 三条 CC0，声明「CC0 对预览与原件同效」——待核（Freesound 线索）。
- **B1 求解器天花板是普遍病（远超已知 60/90）**：五带全扫 target 20→120，每带在 ~48–54s 触顶后**所有更大 target 出同一段构**（repro/solver_sweep.mjs）。要害：出厂 `targetsS:[30,45,60,90]` 四档里，**90 在五带上永远 = 60**（零区别），busy/jam 上连 60 都已 = 50。根因精确定位：文法自身 viewerMax 上限之和 ≈ OPEN3+RAMP8+PEAK15+TURN4+CLOSE6+桥(3×96/16=18)=54s，任何超此 target 物理不可达，求解器 allowUnderrun 静默认输。金测试只冻 defaultS=45（在天花板下，恒可满足），且无「presets 各异」「target↑→时长↑」单调性断言。P1。
- B-det：cut.js 纯函数仅用 +−×÷/abs/min/max/floor/round/ceil，无 sin/exp/pow，位一致纪律属实；shadow 里的 `.sort` 只喂 informational 效率值，不入 segments，不破确定性。✅ 主张成立。
- tapeHash：sha16=SHA-256 截 64bit；同带同哈希（正确），生日碰撞 2^32 不实际；非 P 级，理论点记录。
- serve.mjs 静态件 normalize+startsWith(root) 守传统穿越——待压测。

## 又证
- **B2 probe 页和弦/ASK 前景合成 ReferenceError（内联剥别名）**：sound/graph.js `import {degreeHz as coreDegreeHz}`，cli/probe.ts inlineSoundSource 删 import 行连别名一起丢，probe.html 只有 `degreeHz` 定义却调 `coreDegreeHz`（2 处：750 和弦、770 ASK）。运行即抛（冷读 ride 两条 PAGEERROR 佐证）。**「probe=ear 同源」主张被内联变换证伪**——ear 走真模块别名解析故绿，probe 断。金测试没抓：ear/golden import graph.js 真模块（别名在），无一测评估内联后的 probe.html 脚本。repro/probe_coreDegreeHz.sh。P1。"chord for resolution" 是 README 三音之一，在主演示页静默失声。
- **C2 巨型单行崩蒸馏（违「禁 crash」）**：10MB 单 token 的 command/path 过 sanitizeToken 的 `/[A-Za-z0-9_-]{16,}/.test()` → RangeError 爆栈，整卷蒸馏挂（repro/malicious/hugeline）。同 regex 路径在 incremental.ts（live）亦走——一条病理行可掀翻 live tail 与 stage 子进程。normErr 同族 regex 对 10MB FAIL 首行亦然。parse.ts 亲口「坏行跳过禁 crash」只挡 JSON.parse，未挡 regex 爆栈。修：正则前 token 截长。P2。
- 恶意 JSONL 其余五例（空/垃圾/截断/异类型/坏数字）均优雅通过（禁 crash 成立）。✅
- **LUFS 量具 ✅ 属实**：−23dBFS/1kHz 读 −22.99 LUFS（偏 0.01dB），10dB 台阶精确，RLB 高通/K 加权方向皆对（repro/lufs_calib.mjs）。真 BS.1770，可信。
