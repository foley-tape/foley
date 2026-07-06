# audit/ · 历次审计归档

对抗式审查（红队/夜班/浸泡）的报告与复现件，按次归档。源码零改——这里只是报告的家。

| 目录 | 审计 | 内容 |
|------|------|------|
| [night1/](night1/) | NIGHT-1 封版前红队（双队 A/B） | 预注册设计、审计报告 A/B、浸泡（soak）报告、红队复现脚本与输出、致军师交接包 |
| [night2/](night2/) | NIGHT-2 发布前审计（四队） | 锚点、审计正文（十大发现）、冷读者庭、SOAK-2 报告、晨间分诊（TRIAGE）、复现件（恶意带样本/探针）、截图 |

- NIGHT-2 报告自 `audit/night2` 分支取回（51494db，逐字节核同）；当轮热修的交接件在 [`docs/records/night2/hotfix/`](../docs/records/night2/hotfix/)。
- 夜审令原文见 [`docs/orders/`](../docs/orders/)：08（NIGHT-1）、18（AUDIT-FINAL，未开审）。
- 本地未跟踪的 `audit/b`、`audit/c` 为 NIGHT-1 时期浸泡工作目录残渣（空目录＋被 .gitignore 的日志），不入库。
