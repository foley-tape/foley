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

- `js/replay.js` —— 回放核心：舞台时间轴（空洞折叠＋接带痕）、20Hz 包广播（间隔钟，不惧藏页）、moments 直通
- `js/instruments.js` —— VU 针／走纸／灯组；渲染端只做两包线性重建，禁缓动
- `js/deck.js` —— 走带甲板（M-S2）：双带轴（转速=A、抖=wow、角动量、STUCK 卡拍）＋机械计数轮（悬停微距，数字唯一的活处）
- `js/lens.js` —— 镜头法（M-S2）：WebGL 颗粒/暗角呼吸/防色带一张 shader；相机 <2px/s 慢漂移
- `js/main.js` / `js/hud.js` —— 点火与 dev 抽屉
- `fixtures/` —— 五带副本，封版（v0.1.0）后产物（tapes/ 原件永不触碰）
