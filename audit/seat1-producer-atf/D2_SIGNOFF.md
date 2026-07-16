# D2 · 席一 ATF 复跑签章

签章：席一「信任与入口」· 2026-07-16  
呈审实现：`573f370`  
验收单基线：`e122f2e`（内容与席一原提交 `b21a1ad` 的两份 ATF 文件 SHA-256 完全一致）

## 准入结论

**PASS——D2 已达到安全合入 `main` 的条件。**

- P0：无。
- P1：沿用验收单已列后续批——`producerEpoch` 并发原子分配/崩溃恢复、End 身份兜底极端重叠、存活期持续 PID 指纹复验；均不阻本批。
- P2：RED 原始输出证据文件含少量尾随空格；仅证据文本格式，不影响运行正确性。

本轮没有新增治理条件；判定只依据已签发的 producer 生命周期 ATF 与安全合主线标准。

## 席一独立复跑

```text
npm run typecheck
PASS

npm run test:producer-atf
22/22 PASS
fail=0 · skipped=0 · todo=0

npm test
217/217 PASS
fail=0 · skipped=0 · todo=0
```

附加核对：

- 两份 ATF 验收文件相对 `e122f2e` 未改一字，SHA-256 对表一致。
- 实现提交边界为 `e122f2e..573f370` 一枚实现提交，工作树干净。
- producer 公开态只从纯 reducer 的 `producerView` 导出；serve 仅作 spool/PID/timer/持久层 adapter。
- `incarnation × producerEpoch × watchEpoch` 三轴分别承担身份、乱序与 watcher 失效，旧 End/旧回调无覆盖新代路径。
- ATF 工装写根受 tmp 隔离，测试后无 ATF 遗留进程。

## 合并记录

`main` 已由 `3fd00b1` 快进至 `573f370`。D2 至此闭环，批次二（工单 4）解锁。
