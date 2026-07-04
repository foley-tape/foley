纯本地、零遥测。TAPE-0 只读你机器上已有的 `~/.claude/projects/**/*.jsonl`，不写任何配置、不发任何网络请求。

# TAPE-0（占位代号）

把一场 coding agent 会话翻译成一台"仪器"的实时状态。本仓库是 **v0 无头引擎**：一根针、一条张力曲线 T、三个音。美一个像素都不做。

> 本文档遵循 `TAPE0_SPEC_v0.1`。规范是唯一事实源；本 README 只做导航。

## 范围（v0）

无头引擎 ＋ 一根针 ＋ 三个音。越级施工是缺陷，不是惊喜。

- `protocol/` — 冻结的消息 schema（协议 v1，只增不改）
- `engine/` — 纯函数叙事引擎（零依赖、同构、时钟注入）｜**M1**
- `adapters/claude-jsonl/` — 全系统唯一认识 Claude Code 日志格式的地方 ｜**M0（本轮）**
- `cli/` — `scan` / `replay` / `live` / `probe`
- `stage-debug/` — 素面探针页 ｜**M2**
- `golden/` — 手工合成夹具 + 快照
- `tapes/`、`runs/` — **永不入库**（见 `.gitignore`）

## 运行（无构建步骤）

Node ≥ 20（本机 v26）原生剥离 TypeScript 类型，`.ts` 直接跑：

```sh
node cli/index.ts scan        # M0：扫描本地磁带，提名候选，出体检表
node cli/index.ts replay ...  # M1
node cli/index.ts live         # M1
node cli/index.ts probe        # M2
npm test                       # 金测试
```

## 隐私

磁带可能含密钥等敏感内容——只在本地使用，永不入库、永不外传。
