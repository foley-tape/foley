# 工单 4 · 席一 ATF 复跑签章

签章：席一「信任与入口」· 2026-07-16  
呈审实现：`2a2ecc2`  
验收单：`23c602d`

## 准入结论

**PASS——工单 4 已达到安全合入 `main` 的条件。**

- P0：无。
- P1：歇场旧带的起机策略、多个新会话同时落地的仲裁、目录轮转/值守压力、EventSource 与目录值守的固定 2 秒间隔，按验收单留后续批。
- P2：RED 原始输出存在少量尾随空格；呈审报告关于空房 `?mode=live` 的一句描述与现有“显式深链尊重用户 live 意图”代码路径不完全一致，均不影响裸首页工单目标与运行正确性。

本轮没有增加验收条件；判定只依据 `ZERO_SESSION_FIRST_MINUTE_ATF.md` 的三项 P0 与一次性真机烟测。

## 席一独立复跑

```text
npm run typecheck
PASS

npm run test:wo4-atf
4/4 PASS
fail=0 · skipped=0 · todo=0

npm test
221/221 PASS
fail=0 · skipped=0 · todo=0
```

验收尺核对：

- `23c602d..2a2ecc2` 未修改 `package.json` 中的 ATF 命令、席一验收文档或 `golden/zero-session-first-minute.atf.test.ts`。
- 实现为验收单之上一枚提交，工作树干净。

## 席一独立真机烟测

运行：

```text
node stage/tools/verify/wo4_smoke.mjs \
  /Users/shadow/Desktop/至架构师/10_2026-07-16_席一_工单4复跑烟测
```

结果：**14/14 PASS**。

- 空会话房自动装 `STORM` 厂带，`PLAYING` 且 `live:false`；
- 走带牌为 `FACTORY`，盘面两帧确有运动；
- 一次通电手势后声桥上位，成片 RMS `-34.669771 dB`；
- 预置 `declinedAt` 后全程无接线单；
- 页面不刷新，投会话后自动转 `LIVE`；
- 同一 serve 纪元内链路恢复为 `live`，无 SIGNAL LOST/SOURCE GONE 残留；
- 全程零页面错误，serve stderr 无 ENOENT 或裸堆栈。

## 合并记录

`main` 已由 `52d28cd` 快进至 `2a2ecc2`。工单 4 至此闭环。
