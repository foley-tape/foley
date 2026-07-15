# Foley 隐私诚约对照表 · 席一人肉版

> 日期：2026-07-15
> 分支：`seat/trust`
> 用途：把公开承诺逐句钉到代码行为与验收证据，交席三转成诚约闸。本文是发布对表，不改隐私正典。

## 冻结接口

- 默认：本地开场标题开启。
- 环境退出：启动 Foley 时设 `FOLEY_NO_LOCAL_TITLES=1`；只约束该进程，多实例共用同一 home 时应使用配置档。
- 配置退出：`$FOLEY_HOME/config.json`（缺省 `~/.foley/config.json`）写 `{"privacy":{"localTitles":false}}`；货架元数据每次读写都重验此档。
- 两个关闭入口为“或”关系；任一关闭即生效。
- 缺档按默认开启；档案存在但 JSON 损坏、字段类型错误或不可读时 fail-closed，关闭标题并明确告警。
- 关闭时：新卡不复制首句；全部有效卡目录（含无 `curve.csv` 的孤儿卡）里的旧 `rack.json.opening` 在成功返回货架前原子删除；卡房不可枚举或清除失败时，`/rack` 返回 500 而非假报成功。关闭态的 `name`/`summary` 展示字段回落仓名与性格章名；ID、时长、mtime、FT、C、seal 等非标题字段照常返回。重新开启后，若原始本地母带仍在，可重新生成标题。

## 承诺—行为—证据

| ID | 对外承诺 | 精确边界 | 代码事实源 | 人肉验收 / 建议机器闸 |
|---|---|---|---|---|
| PRIV-01 | 对话留在用户机器上 | Foley 会读本地 Claude JSONL；不上传会话内容 | `stage/serve.mjs` 的 `PROJECTS_DIR` / `openingLine`；产品网络只在 `cli/records-fetch.ts` | README/中文导航/发布工具箱口径一致；现有零遥测与下载确认测试继续守门 |
| PRIV-02 | 首条真人发言默认成为本地磁带标题 | 跳过 sidechain、命令包装与 Caveat；压平空白；最多 80 字符；进入 `$FOLEY_HOME/cards/<sid>/rack.json.opening`，再经本机 `/rack` 供本地 UI/DOM 标题展示 | `openingLine` → `writeRackMeta` / `ensureCardMeta` → `buildRack` → `stage/js/main.js` | `golden/rack-title.test.ts`：默认态磁盘与 `/rack` 均出现合成 sentinel |
| PRIV-03 | 用户可退出本地开场标题 | 退出不等于删除 Claude 原始母带；它停止新标题副本、遍历有效卡目录原子删除已缓存 opening，并令 `/rack` 的 name/summary 回落仓名＋章名；坏/不可读配置 fail-closed；配置档由多实例每次读写重验 | `localTitlesEnabled`、`purgeLocalTitleCache`、`writeJsonAtomicSync`、`writeRackMeta`、`ensureCardMeta`、`buildRack` | 同一测试覆盖 env、config、坏档/错类型/不可读、双 serve、孤儿卡、请求中热切换、清除失败不报 200、重启恢复自愈 |
| PRIV-04 | 蒸馏带不复制工具输入或对话正文 | 事件骨架保留动词、相对时刻、量级、哈希目标；默认带的 error class 变加盐聚类哈希；raw 带保留 best-effort 归一化后的明文 error class | `adapters/claude-jsonl/distill.ts`、`parse.ts`、`docs/canon/REDACTION-CONTRACT.md` | `golden/privacy.redteam.test.ts`、`golden/redaction-contract.test.ts`、`golden/g7.redaction.test.ts` |
| PRIV-05 | 默认蒸馏带与 MP4/DUB 导出链执行列明的脱敏与最小化 | 默认蒸馏相对化时间、加盐哈希并令 sourceHash=`redacted`；MP4 容器 creation/modification 清零；dub 边车不写显式 createdAt/liveEpoch，但本地 DUB 导出文件名仍带日期，Film DUB 的 `film.files` 还可能嵌入这些日期路径；DUB 另保留稳定不透明 tape ID（从货架会话卡导出时为 `card:<sid>`）与内容 hash，非绝对匿名 | `redactResult`、`stage/js/mp4scrub.js`、`stage/js/dub.js`、`stage/serve.mjs` 的 save/save-bin 命名 | 既有 G7 / dub / MP4 金测；席三须把文件名/路径日期残留与精确边界绑定进公开句 |
| PRIV-06 | 零遥测；机器不自行联网 | 产品唯一外网路径是用户明确执行并确认的出厂唱片下载；serve 与舞台的 HTTP 只走 loopback | `cli/records-fetch.ts`；serve 与舞台只用 loopback | 静态网络调用扫描＋records 拒绝/同意两路测试；措辞限定为“product-initiated external network path”，不把 loopback 或 npm 自身冒充产品外网行为 |
| PRIV-07 | `--raw` 是显式本机调试例外 | 保留绝对时间、明文工具名、精确 sourceHash 与 best-effort 归一化后的明文 errClass；stderr 警示，不应分享 | `cli/distill.ts` / `cli/index.ts` | 既有 G7 测试；公开文案必须把它写成默认脱敏的明确例外 |

## 对外表面检查

| 表面 | 本工单状态 |
|---|---|
| `README.md` Privacy | 已改为 PRIV-01～07 的诚实口径 |
| `README.zh.md` 隐私导航 | 已同步本地标题、退出开关与出屋默认脱敏 |
| `docs/launch/LAUNCH_KIT.md` | 已清除“transcripts never stored/shown”“原文永不落盘”等过度承诺 |
| `foley connect` 接线单 | 已在用户同意面披露本地标题与环境退出位 |

## 交席三事项

1. 把 PRIV-01～07 作为稳定 Claim ID 接入诚约闸；README 任何隐私句变动必须重新对表。
2. `docs/launch/GATE.md` 仍把旧“never stored”修复记为绿灯，且其 `--raw` 闸未列明明文 best-effort errClass；`docs/decisions/priority-canon.md` 仍写“原始 JSONL 只在蒸馏器读一次／对话永不落盘”。这些都属席三治理面，本席不越界改，须由席三销旧账并补字段。
3. `docs/canon/REDACTION-CONTRACT.md` 要求出屋派生物统一经 `redactResult`、新字段回轨丙；现有 DUB meta 独立构造 `tape`/`tapeHash`/`film.files`。本席只如实披露残留，不越界改正典或导出链，席三须接管这处正典—实现缺口。
4. 机器闸至少同时断言 API 响应与磁盘 `rack.json`，避免“页面藏了、缓存仍留”的假退出。

## 本席验收结果

- 验收基线：`6766d93e3fe214dff8d3e57fb610652fead93fac`；Darwin 25.5.0 arm64 / macOS 26.5.2；Node v26.0.0；npm 11.12.1。
- 依赖未重装、lockfile 未修改；本 worktree 验收时临时复用主工作树的 `node_modules`，收尾删除该软链。
- `node --test golden/rack-title.test.ts`：6/6 PASS（默认/env/config、孤儿卡、请求中热切换、双 serve、坏档/错类型/不可读配置、损坏缓存清除失败 500、重启自愈、FOLEY_HOME sentinel 零命中）。
- `node --test golden/cards.test.ts`：12/12 PASS（默认新卡写本地标题；运行中 config 退出后的新卡不读/不落首句；旧缓存清除；蒸馏产物无首句）。
- 定向合计：18/18 PASS，0 fail / 0 skipped。
- `npm test`：180/180 PASS，0 fail / 0 skipped（8 suites，9.57s）。
- `npm run typecheck`、`node --check stage/serve.mjs`、`node --check golden/rack-title.test.ts`、`git diff --check`：PASS。
- 对 `README.md`、`README.zh.md`、`LAUNCH_KIT.md` 与可见 CLI 文案做负向扫描：旧绝对承诺、错误 `records` 下载命令及“首启自动征询”零命中。

## 诚实边界

- 标题退出不会删除 Claude Code 自己保存的原始会话；Foley 也不拥有该母带的删除权。
- 标题重新开启后，只要原始母带仍在，Foley 可按同一标题法重新生成本地标题。
- 本工单不改变脱敏正典、不改页面状态机、不改 CI；席三负责把本表机械化。
