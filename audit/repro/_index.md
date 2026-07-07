# audit/repro/ · 复现脚本canonical 兵器库

> 立于：轨丙（M2.6，第三号手令丁-轨丙「四 P1 复现脚本归档」＋第二号手令增补四.1）。
> 用途（增补四.1）：每颗雷的复现脚本以可执行文件**入库**，作「原审计会话签章」的兜底——
> **原会话若已不存，任何新审计终端跑同一脚本即可行使复验权**。脚本即那双眼睛的遗嘱。
> 组织：**扁平放置**（脚本假定 2 级深度的相对路径 `../..`＝仓库根；audit/repro/ 恰 2 级，原样即跑）。
> 来源：四 P1 脚本consolidated 自 `repro/final-{甲,乙}/`（原working 副本保留未动）；勘验两脚本收编自
> `track/recon:audit/recon/repro/`；B4 为本轨新增。

---

## 跑法通则

```bash
cd <仓库根>
node audit/repro/<脚本>.mjs          # node 类：自足或就地起 serve
bash audit/repro/<脚本>.sh           # shell 类：自 cd 仓库根
```

判据律：**未经复跑签「雷已排」不得销账**（M2.6 §0 三段闭环）。红队自备新鲜真实会话，禁 demo 带自证。

---

## 四颗 P1（M2.6 双盲终审，锚 6ab3218→HEAD 8c7a198；甲乙红队＋审计庭已 HEAD 复签「雷已排」戊-1）

### P1-① TR-1／G7 · 导出/分享默认脱敏（甲-5／乙-F2／乙-F3）
默认蒸馏带即安全形态：时间相对化＋非内建工具名加盐哈希＋sourceHash=redacted；mp4 墙钟钉 0；--raw 为显式逃生门＋stderr 警示。

| 脚本 | 证什么 | 修后期望 |
|------|--------|----------|
| `M2.6_regress_distill.mjs` | 默认 distill 强制脱敏；--raw 明文＋警示 | ✅ F3 回归过 |
| `M2.6_regress_mp4scrub.mjs` | scrubMp4Dates 把 mvhd/tkhd/mdhd 墙钟钉 0 | ✅ 三盒全零 |
| `mp4_creation_time_leak.mjs` | （原探针）vendored muxer 写墙钟入 mp4 | 修前：读出出片秒级墙钟 |
| `mp4_fresh_export_probe.mjs` | （原探针）活导出路径把墙钟写进容器 | 修前：mvhd.creation_time 非零 |
| `normErr_probe.mjs` | errClass 唯一自由文本字段的对抗向量穿透面 | CONFIRMED-CATCH／SURVIVOR 报告（残留边界如实在案） |

### P1-② F1 · serve 畸形 %-路径 DoS
`decodeURIComponent(url.pathname)` 曾在 try 外→ 单请求 `/%zz`、`/%` 令进程崩（未鉴权、跨源可达）。修：包死返 400＋unhandledRejection 兜底。

| 脚本 | 证什么 | 修后期望 |
|------|--------|----------|
| `serve_dos_malformed_percent.sh` | （原探针）畸形 %-路径打垮进程 | 修前：HTTP 000（崩） |
| `M2.6_regress_serve.sh` | F1 回归：畸形 %-路径弹 400 且进程存活（并含 F5，见 P1-④） | ✅ 400＋存活 |
| `serve_probe_notes.md` | 绑定面／F1／F5／写鉴权实测台账 | 阴性结论支撑 |

### P1-③ 甲-2 · 脱敏骨架夹具入库（干净克隆 npm test 全绿）
五卷 tapes 以脱敏骨架入库（原始真身 tapes/raw/ 永不入 git），干净克隆不再缺夹具。

| 脚本 | 证什么 | 修后期望 |
|------|--------|----------|
| `01-npm-test-on-clone.sh` | 自建无隐私临时工作树跑 test | 修前 6 红纯因缺夹具；入库后干净克隆全绿 |

### P1-④ F5 · GET 面 Host 白名单闸
绑 127.0.0.1 挡不住 DNS-rebinding 读；GET 全端点此前零 Host 校验。修：Host ∉ {localhost,127.0.0.1}:port → 403（缺省拒，一处兜全端点，先于一切路由）。

| 脚本 | 证什么 | 修后期望 |
|------|--------|----------|
| `M2.6_regress_serve.sh` | F5 回归：非白名单 Host 弹 403（最前端） | ✅ 非白 Host→403 |
| `serve_probe_notes.md` | F5 rebinding 读面实测 | 修前：`Host: evil`→200 |

---

## 勘验两脚本（收编自 track/recon·阶段〇 RECON）

浏览器 E2E 实屏勘验（**依赖 playwright-core ＋ 一个跑着的 serve@4173**；`recon.mjs` 内 SHOTS 为
track/recon 绝对路径，异地跑需改）。收编为遗嘱，记录 RECON 如何挖出 B3 live 静音双证与 B4。

| 脚本 | 证什么 |
|------|--------|
| `recon.mjs` | live 正门手势后 `__stage.sound=undefined`（B3 静音雷）＋busy 回放唱片上桥＋master RMS |
| `probe2.mjs` | 唱片在位复测：busy 回放＋手势→唱片层上桥＋RMS |

---

## B4（本轨新增·RECON 新雷·乙-②归轨丙）

serve 打包态出厂唱片/床音 factory 回退（repo 缺件→ ~/.foley/**/factory/；只读＋fence 前缀＋文件名白名单）。

| 脚本 | 证什么 | 期望 |
|------|--------|------|
| `b4_probe.mjs` | 自足：起 serve＋HOME 造 factory，探 /records/**、/sound/assets/** 回退＋白名单＋穿越 | ✅ 雷已排 6/0（修前 saturation.mp3→404） |
| 金测试 | `golden/b4.factory.test.ts` ×7（常设回归） | ✅ 全绿 |

---

## 附：非 P1 的相关审计证据（未收入本 bin，留 repro/final-*）

- `repro/final-甲/02-npx-foley-publishability.sh`（甲-1/甲-3 可发布性/Node 门槛）
- `repro/final-甲/03-doc-claims-hold.sh`（甲-4 README 承诺回归护栏）
- `audit/repro/egress_sweep_notes.md`（零静默网络红线 sweep——已收入，属安全不变式证据）
