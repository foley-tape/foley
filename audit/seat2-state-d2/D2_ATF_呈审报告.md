# D2 ATF 呈审报告 · producer 生命周期重建

呈审：席二继任（第五轮·ATF 制下首轮）→ 席一（审计席）· 2026-07-16
法源：`FOLEY_ATF_RULING.md` §四（D2 案重置协议）＋席一验收单 `audit/seat1-producer-atf/PRODUCER_LIFECYCLE_ATF.md`（需求正文）
工地：`/Users/shadow/tape0-seat-d2` 分支 `seat/state-d2`·基 `6289478`（d9413d6＋复盘）＋席一 ATF 提交 `e122f2e`（cherry-pick 自 b21a1ad）·其上**一枚实现提交**

## 〇、结论行

- **RED 基线（实现前·e122f2e）**：`npm run test:producer-atf` exit=1，**13 ✖**——纯层 ATF-M00（缺显式状态机）＋集成 9 枚业务红（I01/I02/I02E/I04/I05/I06/I07/I08/I09），I03/I10 过——**与席一负控记录（NEGATIVE_CONTROL.md）逐项一致**。全文证据：`ATF_RED_原始输出_实现前e122f2e_全文.txt`。
- **GREEN（实现后）**：`npm run typecheck` 净；`npm run test:producer-atf` 纯 10/10＋集成 12/12；`npm test` **217/217**（195 旧例＋22 ATF·零 skip/todo/retry）。
- 验收文件未改一字；无 tmp 外写入（ATF-I05/I10 执法）；无遗留子进程（套件收尸断言执法）。

## 一、实现四件（一枚提交）

1. **`stage/producer-lifecycle.mjs`（新）**——显式状态机，纯 reducer。
   `createProducerState(terminals)`（最高代 fold）/`reduceProducer`/`producerView`/`terminalRecords`。
   registry（按 key 身份账＋终态）×projection（armedKey＋watch 相位）两层；三时序轴分离
   （SESSION_START 只动 producerEpoch/generation，ARM/DISARM/CLOSE 只动 watchEpoch）；
   终态吸收、resume 严格 no-op、新代唯一复活且必经 fresh verify；不原地改输入、JSON round-trip。
2. **`stage/serve.mjs`**——producer 散装 timer/flag（producerReg/producerGen/resolveProducerDeath/armProducerWatch 族）全拆，降为 adapter：
   - spool 行→事实事件入 reducer（`consumeProducerRow`）；无身份遗留行安全忽略（不伪造·ATF §5）；
   - fresh verify＝当前 arm 下 kill -0＋ps 命令指纹前缀对表，才发 `PID_VERIFIED`（pid:null/转租＝UNKNOWN 恒守，不挂死亡 timer）；
   - watcher 随 reducer 相位走：ALIVE=轮询、GRACE=宽限表、其余全清；回调携带发起时 (key,incarnation,watchEpoch)，旧回调被 reducer 三重门 no-op；
   - 终态转移当场原子落盘 `$FOLEY_HOME/producer-terminals.json`；起机序＝fold 终态→整卷重放 spool→（boot-hold）→装带发布，首个 PLAYING 天然带终态；
   - ATF seam 三件（`FOLEY_ATF=1` 总门·已登记 docs/诊断口.md）：producerAtf 快照、可控短时钟、boot-hold＋`POST /__atf/release`；
   - `FOLEY_RUNS_DIR` 全写点尊重（live 卷/dubs/rendercuts/dayroll）。
3. **`cli/hook.ts`**——身份账：SessionStart 分配全新 `incarnation`（UUIDv4）＋按 key 持久严格递增 `producerEpoch`（`$FOLEY_HOME/producer-identity.json`·原子写）＋每行唯一 `eventId`；身份槽按父进程出生身份分槽（`pid:<pid>:<key>`，sessionId 槽兜底）；SessionEnd 找回出生身份四元组；resume End 绑旧身份（reducer 判 no-op）、resume Start 发新代。
4. **`golden/producer.test.ts`**——PROD-1~8 激励行由 v:1 无身份升级为 v:2 身份行（新 hook 同款线上形状）；**断言语义一字未动**（活/猝死≤5s/转租/未知/善终/持久复活/无闪/代际隔离）。

另：docs/状态契约 v1.4 版本史＋docs/诊断口.md ATF seam 登记（P2 随车）。

## 二、时序六问（呈审前置·逐项指测试 ID）

1. **竞态：事件的另一种顺序是什么？**
   善终两序（End→PID亡／PID亡→grace 内 End）＝ **M03**＋集成 **I03**（刺激前订阅 SSE·去重轨迹严格 alive→ended）；
   死亡中途新代插入＝ **M02/I07**；杀前必证 alive＋REC 真亮（非空过）＝ **I01/I03** 前置断言。
   adapter 侧补强：PID_GONE 当拍即拉一次 spool（先落盘的 End 在宽限窗内变 ENDED）。
2. **代际：旧事件/旧回调凭什么不能覆盖新对象？**
   reducer 三重门——SESSION_END 四元组全匹配（key+sessionId+incarnation+producerEpoch）＝ **M01/M09/I04/I06**；
   迟到/等值/冲突 Start 由 producerEpoch 裁决＝ **M01/M09**；旧 watchEpoch 回调 no-op＝ **M02/M07/I07/I08**。
   adapter 从不直写 producer，故「覆盖」在类型上无路径。
3. **持久：进程重启后哪个事实仍成立？**
   终态（ended/dead）与其代际——转移当场写 `producer-terminals.json`，重启 fold 最高代＋spool 整卷重放，首个 PLAYING 即终态＝ **M06/I02/I02E**；活跃非终态由 spool replay 重建（I02 后继 B start 复活案）；hook 的 producerEpoch 分配账持久（`producer-identity.json`）＝ **I06**（同父 resume epoch 递增）。
4. **闭环：退带、换源、关闭后谁取消 timer 和 listener？**
   `syncProducerWatch` 唯一守表人——相位非 ALIVE/GRACE 即全清；DISARM/CLOSE 推 watchEpoch 令旧回调失效（双保险：adapter 清表＋reducer 拒旧 epoch）＝ **M07/I08**（eject 后越 deadline 恒 EMPTY/null·重插回 UNKNOWN 候 fresh verify）；UNKNOWN 不遗留死亡 timer＝ **M08/I09**。
5. **隔离：测试到底能写到哪些绝对路径？**
   一个 tmp 根（HOME/CLAUDE_CONFIG_DIR/FOLEY_HOME/FOLEY_PROJECTS/FOLEY_RUNS_DIR/TMPDIR 全指内）＝ **I05/I10**；不启动 claude（PATH 首位 trap 零击发）＝ **I05**；被测仓只从 tmp 沙箱副本执行、进程组收尸后才删 tmp＝ **I10**＋套件 after 兜底。
6. **验证器是否明显比被测物简单？**
   本轮验证器＝席一著作权的 ATF 两件（实现席零改动·RED→GREEN 全程同一把尺）；实现侧自有工装仅 `golden/producer.test.ts` 激励行升级（写行＋GET 轮询，无状态机）。旧 producer_probe 自证正则已由 ATF-I05 条款取代，不再作为默认闸。

## 三、诚实余量（不藏）

1. **遗留 v:1 无身份行**：按 ATF §5 安全忽略——升级后、下一个真 SessionStart 之前，旧会话在机器上显 UNKNOWN/null（REC 不亮·诚实降级），不会误亮/误判死。
2. **producerEpoch 分配是读-改-写非原子**：并发 SessionStart 理论撞车窗在案（ATF §八 P1 明列「原子分配/崩溃恢复压力案」随车下批）。
3. **End 归属的 sid 兜底槽**：父链爬取失败时以 sessionId 槽兜底——同 sessionId 两父重叠 ∧ End 时爬链失败的极端组合可能误归属；pid 槽命中时（含 ATF-I06 全部案）无此窗。P1 候强化。
4. **运行期指纹复验**：fresh verify 时对表＋存活期 kill -0 轮询；「持续指纹复验」为 ATF §八 P1 明列项，未在本批加。
5. **B4 factory 3 例**：本 worktree 无 vendored mp3＝该组测试要求的干净检出态，故 217/217 含其通过；主工作台 vendored 态下该 3 例环境性失败仍在案（席一负控 §4 同口径）。
6. **`/live` 订阅门**：boot-hold 模式下允许 live 子进程未生时订阅（I02 订阅先于首帧的必要条件）；正常模式 503 行为不变。

## 四、复跑口（席一按单复跑，不再按轮加税）

```bash
cd /Users/shadow/tape0-seat-d2
npm run typecheck && npm run test:producer-atf && npm test
```

RED 基线复现（如需）：临时 worktree 检出 `e122f2e` 跑同命令（本轮全文证据在 `audit/seat2-state-d2/ATF_RED_原始输出_实现前e122f2e_全文.txt`）。
