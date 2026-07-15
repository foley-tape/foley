# NIGHT-3 左耳 · PID / 端口收摊

只收直属且已登记的进程；全程未使用 `pkill`。

| 用途 | 已登记 PID | 收摊 |
|---|---|---|
| 主运行态（首轮） | npx `80462`；serve `80463`；live `80510` | 已结束 |
| 主运行态（复起） | npx `271`；serve `273`；live `286` | 已结束 |
| ground probe | serve `5102` | 复现器 `finally` 收摊 |
| failure probe | serve/live `6198/6199`；复起 serve `6216`,`6227` | 复现器逐 PID 收摊 |
| privacy probe | serve `6711`,`35266` | 两次复现均由 `finally` 收摊；第二次补成 synthetic JSONL 全链 |
| 零会话新手态 | npx `95951`；serve `95992` | 对 serve 发 `SIGTERM`；父进程随之退出 |
| 杀 Claude 实测 | Claude `29181`；npx `29895`,`29935`；serve `29946`；live `29963` | Claude 与 serve 分别按确切 PID `SIGTERM`；其余直属进程随父退出 |

最终核验：

```bash
lsof -nP -iTCP:4200-4249 -sTCP:LISTEN
```

无输出；4200–4249 无监听者。浏览器审计标签亦已 finalize/关闭。
