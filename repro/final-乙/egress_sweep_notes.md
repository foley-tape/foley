# 网络出站全仓 grep 结论（支撑 REPORT 第五节「唯一出站」）

命令（在 tape0-final-yi 锚 149ddea）：
```bash
git grep -nE '\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\.|EventSource|import\(|require\(|node:https?|node:net|node:dgram|node:dns|node:tls|https?://[a-z0-9]|createConnection|\.connect\s*\(' -- \
  cli stage sound engine adapters protocol scripts ':!*.md' ':!**/golden/**'
```

## 分类

**真运行时出站（发布码）——仅一处**
- `cli/records-fetch.ts:106` `const res = await fetch(r.url)`——首启唱片下载，征询门下（`--yes` 或 TTY `[y/N]` 默认否；非 TTY 无 `--yes` → `exit(3)`）。SHA-256 + 字节双验（:110-111），拒绝路径零网络。当前 manifest 为空（休眠）。参见 REPORT F7。

**浏览器侧 fetch（stage/js）——全为相对/本地端点**
- `hero-cuts.json` / `cut-params.json` / `css/stage.css` / `../sound-params.json` / `../sound/assets/*` / `../sound/records/catalog.json` / `../records/*`：同源相对静态件。
- `/dub/save` `/dub/save-bin` `/dub/render-audio` `/today/*.csv` `/live`（EventSource）：本地 serve 端点。
- 无任何外部主机 fetch。

**非出站的误报**
- `sound/graph.js` 大量 `.connect(...)`：WebAudio AudioNode 路由，非网络。
- `stage/js/deck.js:17`、`instruments.js:47`、`film.js:40` `http://www.w3.org/...`：SVG/XHTML 命名空间字符串，不 fetch。
- `sound/records/catalog.json`、`sound/assets/manifest.json`、`LICENSE-*`：provenance/来源属性数据串（freesound/freemusicarchive），非码。
- `stage/vendor/webm-muxer.mjs:583` `APP_NAME="https://github.com/Vanilagy/webm-muxer"`：写入 WebM 容器的库名 tag，非出站。
- `cli/probe.ts:532` `navigator.clipboard.writeText(...)`：用户点击复制 SP 配置到剪贴板，本地、非网络。

**dev-only 脚本（不入发布 / 维护者用）**
- `scripts/verify-probe.mjs:34` `new WebSocket(page.webSocketDebuggerUrl)`：连本地 Chrome DevTools 调试口（验证脚本）。
- `scripts/pack-records.mjs:34`：构造 GitHub Release URL 字符串（打包工具）。

## 结论
运行时出站唯一通道 = 征询门下的唱片下载，与 `package.json` 自述「纯本地、零遥测」及 `records-fetch.ts` 头注「除本命令经同意后的 fetch 外，仓库无任何网络调用」一致。**该承诺在锚点为真。**
