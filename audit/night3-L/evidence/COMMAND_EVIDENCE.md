# NIGHT-3 左耳 · 命令证据摘要

采样日：2026-07-15（Asia/Shanghai）  
代码锚：`6766d93e3fe214dff8d3e57fb610652fead93fac`

## 公开入口

从不位于源码树内的 `/` 执行：

```bash
npm_config_cache='/Users/shadow/night3-L/audit/night3-L/evidence/npm-cache-clean' npx --yes foley --help
```

结果：退出码 `1`；npm registry 返回 `E404 Not Found`，`foley@*` 不存在或不可访问。

补证：

```bash
npm view foley version --registry=https://registry.npmjs.org
```

结果同为 `E404`。`package.json:4` 同时仍为 `"private": true`。

注意：在源码 worktree 内运行 `npx --no-install foley 4200 --no-open` 能起机，只证明本地源码入口，不证明 README 的公开安装路径。

## 测试与发布闸

```bash
npm test
```

结果：`174` tests，`174` pass，`0` fail，`0` skipped；耗时约 `9.3s`。

```bash
npm run typecheck
```

结果：退出码 `0`。

```bash
node scripts/sync-readme.mjs --check
```

结果：退出码 `1`；`README.md` 的 test-count 仍为 `128`，当前应为 `174`。因此即使人工移除 `private:true`，现有 `prepublishOnly` 仍会在发布前失败。

## 打包体积

```bash
npm pack --dry-run --json
```

结果：压缩 `19,766,664` bytes，解包 `33,257,850` bytes，`137` 个文件。最大单件为 `stage/fixtures/captain.curve.csv`，`13,312,383` bytes。

这与 `docs/launch/GATE.md:115` 记录的 `915.6kB / 91 文件` 已不相符。

## 运行态

- 源码本地入口：`npx --no-install foley 4200 --no-open`。
- 零会话隔离入口：`4201`，独立 `FOLEY_HOME`、`CLAUDE_CONFIG_DIR`、`FOLEY_PROJECTS`，终端明确回答 `n`。
- 量化运行态、晚到者、声桥与落墨：见 `ground-verdict.json`。
- 杀 live 子进程、杀 serve、同标签恢复、浏览器外网 offline：见 `failure-verdict.json`。
- 直属真实 Claude Code 2.1.209（safe mode、禁 tools、合成短 prompt）终止后的机器状态：见 `claude-kill-verdict.json`。
- 合成隐私哨兵的持久化与 `/rack` 回显：见 `privacy-verdict.json`。
- captain 两件夹具的当前 SHA-256 绑定六向量复扫：见 `privacy-six-vector.json`；6/6 通过，但 46.3h 相对时长仍是弱指纹。

## 性能口径诚实边界

serve 与 live 子进程的短时 shell 采样均低于 `0.5% CPU`，但该口径不含浏览器渲染、GPU 与 WebAudio，不能签署宪法 `<5%`。现有 `?perf=1` 只记 rAF 间隔与长帧（`stage/js/perf.js:1-27`），也不是 CPU/能耗证明。
