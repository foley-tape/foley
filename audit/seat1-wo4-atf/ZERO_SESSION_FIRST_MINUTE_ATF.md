# 工单 4 ATF · 零会话首分钟

签发：席一（对审席）· 2026-07-16  
执行：席二继任  
法源：`FOLEY_SEAT2_STATE.md` 工单 4＋`FOLEY_RULING_SEAT2_RELAY.md` D1/D4＋`FOLEY_ATF_RULING.md` §二.1/§三

## 结论式需求

干净环境打开机器时，不得先把“不存在的 live 会话”演成故障。机器应先自动装上一盘厂带；用户若已拒绝接线，页面不得再递接线单；会话文件稍后出现时，同一台已打开的机器应自动换到 live，不要求刷新页面或重启 serve。

本单只锁三项 P0：

1. 空会话厂带自举；
2. `declinedAt` 从账本到页面的完整尊重；
3. 会话后至后的 live 自动接管，兼治初始 `gone` 粘滞与空目录 `--latest` 裸失败。

工单 5 的“一击三事仲裁”、镜头、DUB、操作卡及品味渲染均不准随手带入。

## 可执行验收

命令：

```bash
npm run typecheck
npm run test:wo4-atf
npm test
```

验收文件：`golden/zero-session-first-minute.atf.test.ts`

### ATF-W4-01 · 空环境不是死 LIVE

给定隔离的空 `FOLEY_PROJECTS`、空 `FOLEY_HOME` 与空 Claude 配置，启动正常 serve：

- serve 保持存活；
- transport 自动进入 `PLAYING`；
- 上机件必须是 `/rack` 中 `kind:"demo"` 的厂带，`live:false`；
- 启动日志不得吐 `ENOENT`、原始堆栈或“空目录没有 JSONL”式用户故障。

厂带具体选哪盘由席二决定；验收不钉死 `storm`。

### ATF-W4-02 · declined 契约穿透

若 `$FOLEY_HOME/onboard.json` 已有合法 `declinedAt`：

- `GET /onboard/status` 必须明确返回 `declined:true`；
- 页面接线状态机必须消费该字段，禁止调用 `mountWireTag`。

`declined` 是状态 API 首日冻结字段；不得用 sessionStorage 假装替代持久拒绝。

### ATF-W4-03 · 先开机、后开工

在同一个 serve 纪元内：

1. 先以空 `FOLEY_PROJECTS` 起机并确认厂带在播；
2. 随后向该目录放入一卷合法会话 JSONL；
3. 无需重启 serve，live 子进程应被拉起，`/live` 可订阅；
4. transport 自动切换为 `loaded:"live"`、`live:true`、`PLAYING`；
5. `transport.epoch` 不变。

实现可用轮询、目录观察或可收尸的 supervisor；验收不指定内部形态。禁止靠页面刷新、第二个 serve 或测试专用直接改 transport 过关。

## 一次性真机烟测（不入默认回归）

在全新临时 HOME/Claude 项目目录跑 90 秒：

1. 打开裸首页，不创建会话：页面应显示 `FACTORY` 厂带，盘/纸有运动；
2. 只做一次明确通电手势：应听到房间层/厂带声音，能复述“机器正在播放厂带等开工”；
3. 预置 `declinedAt` 再开页：全程无接线单；
4. 保持页面不刷新，创建一卷会话：牌面自动转 `LIVE`，不残留 `SIGNAL LOST/SOURCE GONE`。

该烟测只在本批呈审与发布前跑，不进入 `npm test`。

## 合并门

- P0：上述三枚 ATF 任一红，禁止合入。
- P1：监控间隔、节能、目录轮转压力、多个新会话的仲裁，可在正确性成立后随批登记。
- P2：日志措辞、报告、LEDGER 回写不得阻塞本批。

席二不得修改、跳过、重试、降级本 ATF；若认为断言不合法，先把争议交回席一，不得在实现提交里改尺。
