# 02 · 选项书：DOM-XSS（C1）＋ 写盘无鉴权（C3）

> 二者是**一条攻击链**：C1 拿到同源脚本执行，C3 是它外带落盘的出口。故合并一书。均候架构师裁。

## 现场

- **C1** `stage/js/main.js:131`：`boot()` 失败时
  ```js
  document.body.insertAdjacentHTML('beforeend', `<pre …>${err}</pre>`);
  ```
  `?tape=` 坏名进入 `err` 文本，`<img onerror=…>` 已被 repro 真浏览器点燃（`audit-night2/repro/xss_tape_param.mjs`）。同源可读 `/today`、`/dayroll` 本地会话曲线。**hosted replays 上线即从 P1 升 P0。**
- **C3** `stage/serve.mjs:101`（`/dub/save`）与 `:130`（`/dub/save-bin`，M-T2 新增）：两个 POST 端点仅限长（32MB／512MB），**无任何来源校验**，写盘限 `runs/dubs/`。
- **暗角（审计未点名，本会话新发现）** `serve.mjs:181`：`listen(port)` 未绑定地址 → **默认监听全部网卡**。局域网内任意机器可直接 POST 写盘，无需 XSS。

**链条**：坏 `?tape=` → XSS 同源执行 → 读会话曲线 → POST `/dub/save` 外带。或者跳过 XSS，局域网直接打 C3。

## 选项

### C1 DOM-XSS

| 选项 | 做法 | 代价 | 效果 |
|---|---|---|---|
| **X-1 sink 根治（推荐·必做）** | main.js:131 改建 `<pre>` 后 `el.textContent = String(err)` | 3 行，零风险 | C1 根治，错误照常可见 |
| X-2 入口白名单 | `?tape=` 收紧为 `[\w.-]+`，坏名早拒 | 1 行 | 纵深；**独用治标**——err 还有别的污染源 |
| X-3 CSP 响应头 | 静态响应加 `Content-Security-Policy: default-src 'self'` | 需盘点 stage 有无内联脚本/样式，可能要调 | hosted replays 上线的硬前提 |

### C3 写盘鉴权

| 选项 | 做法 | 代价 | 效果 |
|---|---|---|---|
| **W-1 Origin 校验（推荐·最便宜）** | 两端点校验 `Origin`/`Sec-Fetch-Site` 须本站，**缺失或跨站即 403**（白名单缺省拒） | ~10 行 | 堵跨站写盘；浏览器强制带 Origin，他站伪造不了 |
| W-2 启动 nonce | serve 启动生成随机 token，页面同源取用，POST 需 `X-Dub-Token` 头 | ~30 行 | 比 W-1 强：同源 XSS 后外带也要先偷 token；自定义头强制 preflight |
| **W-3 绑回环（推荐·一行）** | `listen(port, '127.0.0.1')` | 1 行 | 关掉局域网直写面；叠 W-1 再防 DNS rebinding |

## 建议组合

**X-1 ＋ W-1 ＋ W-3**，合计 <20 行，斩断整条链。X-3、W-2 留给 hosted replays 立项时做。

**关键陷阱**：W-1 若写成「有 Origin 才校验」会被绕过——`text/plain` 简单请求不触发 preflight，攻击者可发不带 Origin 的请求。**必须白名单缺省拒**（缺 Origin 也 403）。
