# 批次三 · 工单 5/6 席一复跑签章

签章：席一「信任与入口」· 2026-07-16  
呈审实现：`dad77e6`  
合入前基线：`efffb94`

## 准入结论

**PASS——工单 5、工单 6 已达到安全合入 `main` 的条件。**

- P0：无。
- P1：首触吞器以 `pointerup` 后 60ms 拆除；桌面真 Chrome 已覆盖并通过，移动 Safari/触屏设备的延迟合成 `click` 与多点触控留跨引擎回归批，不阻本次桌面主路径合入。
- P2：呈审报告写“新卫兵 5 例”，实际新增为 4 个 `node:test` 用例（全量由 221 增至 225）；首版幕二值守因滚轮点位无效已在呈审材料中明确作废并以修正版替代。两项均为报告/证据口径，不影响运行正确性。

本轮只判定工单 5/6 是否可安全合主线，没有扩写治理条件。

## 席一独立复跑

```text
npm run typecheck
PASS

npm test
225/225 PASS
fail=0 · cancelled=0 · skipped=0 · todo=0

node stage/tools/verify/gesture_lens_probe.mjs
13/13 PASS
```

gesture probe 的关键真行为结果：

- 首击 `#deck` 只通电，不并发暂停；第二击恢复甲板暂停语义；
- 首击架沿不下摇，`towerY=0.0`；
- 首击货架条目不换带；
- 旋钮正门通电后，首个甲板点击不被误吞；
- 真滚轮下摇至 `towerY=-900.0`，Escape 在 2.5 秒内回到 `0.00`；
- 回程后继续值守 3 秒，`towerY` 保持 `0.00`。

## 代码对审

- 提交边界为 `efffb94..dad77e6` 一枚提交，呈审工作树干净，`git diff --check` 通过。
- 首手势仲裁只改 `stage/js/main.js`：捕获层一次性吞本击派生的 `click`/`touchstart`，旋钮与已通电路径明确豁免。
- `#tower` 的 transform 仍只有 `stage/js/tower.js` 一个写者；Escape 直达 `go(0)`。
- 新增源码卫兵与真 Chrome 探针均无 skip、todo 或 only。

## 合并记录

`main` 已由 `efffb94` 快进至 `dad77e6`。批次三工单 5/6 至此闭环。
