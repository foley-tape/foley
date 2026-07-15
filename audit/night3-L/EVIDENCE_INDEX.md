# NIGHT-3 左耳 · 证据索引

## 可复跑判决

- [`evidence/ground-verdict.json`](evidence/ground-verdict.json)：真实会话晚到者、首手势、单声桥、RMS、落墨、二次手势不重建。
- [`evidence/failure-verdict.json`](evidence/failure-verdict.json)：杀 live、杀 serve、同标签恢复、浏览器外网 offline 的诚实结果。
- [`evidence/claude-kill-verdict.json`](evidence/claude-kill-verdict.json)：直属真实 Claude 进程终止后，Foley 仍保持 REC/live 的反例。
- [`evidence/privacy-verdict.json`](evidence/privacy-verdict.json)：只含合成哨兵；证明首条真人发言片段落 `rack.json` 且经 `/rack` 回显。
- [`evidence/privacy-six-vector.json`](evidence/privacy-six-vector.json)：当前 captain 两件夹具的独立六向量复扫，含文件 SHA-256 与诚实边界。
- [`evidence/COMMAND_EVIDENCE.md`](evidence/COMMAND_EVIDENCE.md)：公开 npx、金测、typecheck、README 发布闸、pack 体积摘要。
- [`evidence/PID_CLEANUP.md`](evidence/PID_CLEANUP.md)：直属进程登记、逐 PID 收摊与最终端口核验。

## 复现器

- [`repro/ground_probe.mjs`](repro/ground_probe.mjs)
- [`repro/failure_probe.mjs`](repro/failure_probe.mjs)
- [`repro/privacy_probe.mjs`](repro/privacy_probe.mjs)

三件都只写本审计目录；进程为直属子进程并按 PID 收摊。

## 视觉证据

- [`shots/03-novice-first-load.png`](shots/03-novice-first-load.png)：零会话、终端已拒绝接线后的首屏；LIVE 在机、`SIGNAL LOST`、接线签仍出现。
- [`shots/04-novice-after-gesture.png`](shots/04-novice-after-gesture.png)：首手势后仍无会话源。
- [`shots/08-kill-claude-still-live.png`](shots/08-kill-claude-still-live.png)：真实 Claude 已退出至少 6.5s 后，机器仍无告警且 REC 亮。
- [`evidence/ground-latecomer.png`](evidence/ground-latecomer.png)：真实会话晚到者运行态。
- [`evidence/failure-source-gone.png`](evidence/failure-source-gone.png)：live 子进程退出。
- [`evidence/failure-serve-lost.png`](evidence/failure-serve-lost.png)：serve 退出后的丢线态。
- [`evidence/failure-serve-recovered.png`](evidence/failure-serve-recovered.png)：同一标签页恢复。
- [`evidence/failure-browser-offline.png`](evidence/failure-browser-offline.png)：浏览器外网 offline 不影响 loopback 的诚实对照。

含真实开场白的探索截图未保留；隐私证据已改用合成哨兵。
