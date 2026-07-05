# stage —— 琥珀舞台（Track-STAGE）

M-S1 第一张脸：暗场面板 ＋ 回放流客户端 ＋ 三件器件（VU 针 / 走纸记录仪 / 琥珀管）。
宪法：SPEC 附录 B《琥珀宪法 v1.1》；接线图：白皮书 §5 音画绑定表。

## 起法

```sh
node stage/serve.mjs        # → http://localhost:4173/?tape=storm
```

- `?tape=storm|smooth|busy|jam|silence` 选带（fixtures 为五带 curve/moments 副本）
- `?hud=1` dev 抽屉（调带/倍速/跳带）；`?seek=930`（秒）、`?speed=8`、`?paused=1`
- 运行时零网络、零依赖；无声（声音归 Track-FIX 声音相）

## 布局

- `js/replay.js` —— 回放核心：舞台时间轴（空洞折叠＋接带痕）、20Hz 包广播、moments 直通
- `js/instruments.js` —— 三器件＋灯组；渲染端只做两包线性重建，禁缓动
- `js/main.js` / `js/hud.js` —— 点火与 dev 抽屉
- `fixtures/` —— 五带副本（tapes/ 原件永不触碰）
