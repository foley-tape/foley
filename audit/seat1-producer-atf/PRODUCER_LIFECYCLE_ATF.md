# Producer 生命周期 ATF · 席一可执行验收单

签发依据：`FOLEY_ATF_RULING.md`（2026-07-16）

作者／测试著作权：席一（审计席）

收件：席二继任、席三

判准：是否可以安全合入 `main`，不是是否“看起来差不多”

## 0. 使用方式

本单由两层默认金测组成：

- `golden/producer-lifecycle.atf.test.ts`：纯状态机对抗测试。无进程、无网络、无真实时间。
- `golden/producer-lifecycle.integration.atf.test.ts`：极薄 serve 集成测试。只使用合成 PID、合成 transcript、tmp 目录和 Node SSE。

席二应把本 ATF 提交作为新 D2 分支的第一枚提交。它在实现到位前必须是红的；不得删除、跳过、降断言、加重试或把失败改成 `todo`。ATF 分支不单独合入 `main`，而是与使其转绿的实现一起合入。

执行：

```bash
npm run typecheck
npm run test:producer-atf
npm test
```

对旧 D2 负控：

```bash
FOLEY_ATF_REPO=/Users/shadow/tape0-seat-d2 \
  node --test golden/producer-lifecycle.integration.atf.test.ts
```

席二执行令：

1. 以本 ATF 提交为新 D2 分支第一枚提交；先跑出 M00/集成 RED 并留原始输出。
2. 不改验收文件，先实现 `stage/producer-lifecycle.mjs`，使纯状态机 M01–M09 全绿。
3. 再把 serve 降为 adapter：spool/PID/timer/持久层只产事实事件，禁止旁路 reducer 写 producer。
4. 实现仅在 `FOLEY_ATF=1` 生效的诊断、短时钟与 boot-hold seam；正常产品接口不变。
5. 跑 `npm run typecheck && npm run test:producer-atf && npm test`；任何 skip/todo/retry、tmp 外写入、遗留进程均视为 P0。
6. 呈审只交一枚实现提交，并按文末“时序六问”逐项指向测试 ID；席一此后按本单复跑，不再按轮临场加税。

## 1. 本单边界

本单只审 producer 生命周期：

- 代际
- 竞态与无闪
- 终态单调
- 持久与重启
- arm/disarm/换源闭环
- PID 身份
- 合成工装隔离
- producer 到 REC 的非空过投影

不在本单：

- OFF 后 `SoundBridge.start/live.prime/replayer.play` 续体复活：另立 Power-ATF。
- demo、ASK、POST、混音、视觉材质。
- 报告、LEDGER、历史措辞与证据排版。
- 真 Claude 日常验收。真 Claude 仅发布前一发烟测，不进入合并默认闸。

Producer ATF 全绿不自动洗掉 Power-ATF 的既有 P0。

## 2. 一等身份：三条时序轴

实现必须区分：

1. `incarnation`
   - 标识一枚 logical producer run；每次 `SessionStart` 都产生新 incarnation。
   - 同一 transcript、同一 Claude `sessionId`，甚至同一仍存活父进程的 resume／clear，也必须产生新 incarnation。
   - `SessionStart` 与对应的 `SessionEnd` 必须携带同一不可混淆 incarnation，或携带行为上等价的进程身份。
   - `sessionId` 不是 incarnation，不得代用。
   - `SessionEnd` 的有效身份为 `key + sessionId + incarnation + producerEpoch` 全匹配；任一不符均为旧／异物事件。

2. `producerEpoch`
   - 每个 transcript key 的持久、正安全整数、严格递增 SessionStart 序号，由 hook 在落 spool 前分配。
   - 同一 logical run 的 Start/End 携同一 producerEpoch；下一次 Start 即使来自同一父 PID，也必须更大。
   - reducer 只接受 `producerEpoch > current.producerEpoch` 的 Start；相等重放、相等冲突、较小迟到 Start 均严格 no-op。
   - `generation` 是 reducer 对“已接受新 Start”的内部计数，恰 +1；producerEpoch 是外部乱序裁决依据，两者不得互相冒充。
   - 同一父进程的 resume 依上游真实顺序 `SessionEnd(reason=resume)` 完成后才发生下一 `SessionStart(source=resume)`；现有 hook 输入没有上游 logical-run token，本单不要求在同一父内辨认“新 Start 之后才首次出现的旧 End”。跨父重叠 End 则必须靠父进程出生身份分槽正确关联。

3. `watchEpoch`
   - 标识当前 arm/watch 生命周期。
   - 每次 ARM、DISARM、换带、关闭监听都必须推进。
   - poll、grace timer、resolver 回调必须同时绑定 `incarnation + watchEpoch`。

旧 incarnation 的事件和旧 watchEpoch 的回调只能是严格 no-op。

三条时序量不得混用：只有 producerEpoch 更大的新 `SESSION_START` 更新 producerEpoch 并推进 `generation`；只有 `ARM/DISARM/CLOSE` 推进 `watchEpoch`。其余事件不得暗改任何一条。

## 3. 可执行状态机接口

席二须提供纯模块：

```text
stage/producer-lifecycle.mjs
```

导出：

```js
createProducerState(terminals = [])
reduceProducer(state, event)
producerView(state)
terminalRecords(state)
```

约束：

- `reduceProducer` 为纯函数，不读时钟、文件、PID 或网络。
- state 与 `terminalRecords()` 返回值必须可 JSON 序列化。
- reducer 不得原地修改输入 state。
- serve 是 adapter：负责 PID 检测、timer、spool、持久层，并把事实事件送入 reducer。
- serve 不得旁路 reducer 直接写公开 producer。

`producerView(state)` 至少返回：

```js
{
  producer: null | 'alive' | 'dead' | 'ended',
  phase: 'DETACHED' | 'UNKNOWN' | 'ALIVE' | 'GRACE' | 'ENDED' | 'DEAD',
  key: string | null,
  sessionId: string | null,
  incarnation: string | null,
  producerEpoch: number,
  generation: number,
  watchEpoch: number
}
```

`generation` 按 transcript key 独立计数：该 key 第一枚被接受的新 incarnation 为 1，之后每枚 producerEpoch 更大的新 incarnation 恰 +1。重复、冲突或较旧 start 不增加 generation。`createProducerState(terminals)` 遇同 key 多条记录时必须取最高 generation，不能依赖数组顺序；terminal 记录须包含 producerEpoch。

输入事件：

```js
{ type: 'ARM', key }
{ type: 'DISARM' }
{ type: 'CLOSE' }
{
  type: 'SESSION_START',
  key, sessionId, incarnation, producerEpoch
}
{ type: 'PID_VERIFIED', key, incarnation, watchEpoch }
{
  type: 'SESSION_END',
  key, sessionId, incarnation, producerEpoch,
  reason: string
}
{ type: 'PID_GONE', key, incarnation, watchEpoch }
{ type: 'GRACE_EXPIRED', key, incarnation, watchEpoch }
```

重复的同 identity `SESSION_START` 必须幂等；producerEpoch 相等但 identity 冲突、或 producerEpoch 更小的迟到 Start 均严格 no-op。只有 producerEpoch 更大的新 Start 才建立新代并使 generation 严格递增。

`SESSION_START` 只登记身份并进入 `UNKNOWN`，绝不能凭一条可能已陈旧的后台事实直接点亮 `ALIVE`。adapter 仅在当前 arm 下重新核对 PID 存活与命令指纹后，才发送 `PID_VERIFIED`。这样 off-key producer 在未监听期间死亡，也不会在日后 ARM 时被旧 `ALIVE` 误亮。

serve 集成测试的最小只读诊断 seam：

- `FOLEY_ATF=1` 时，GET `/transport` 与 `/live` 的具名 `transport` SSE 必须共用同一快照，并额外返回
  `producerAtf:{phase,incarnation,producerEpoch,generation,watchEpoch,lastEventId,bootHeld}`。
- 每枚 producer spool 行都必须有 `crypto.randomUUID()` 等价的唯一 UUIDv4 `eventId`；消费该行后 `lastEventId` 精确等于它，用来证明“无状态变化的旧事件”确已到达，timer/poll 不得改写。
- 无 `FOLEY_ATF=1` 时不得扩大正常接口。
- `FOLEY_PRODUCER_POLL_MS` 与 `FOLEY_PRODUCER_GRACE_MS` 只在 ATF 模式生效，供竞态测试使用可控短时钟；生产默认仍须满足猝死 ≤5 秒。
- `FOLEY_ATF_BOOT_HOLD=1` 时，HTTP/SSE 先可订阅但不得进入 `PLAYING`，且 GET/SSE 均持续报告 `bootHeld=true`；`POST /__atf/release` 返回 `204` 后置 `bootHeld=false` 并继续启动。该 seam 只用于截获重启后的首个 `PLAYING`，正常模式不得存在。

## 4. 状态与公开投影

| 内部状态 | 含义 | `/transport.producer` |
|---|---|---|
| `DETACHED` | 未 arm／已 disarm／已 close；后台 registry 仍可记 start/end 事实 | `null` |
| `UNKNOWN` | 已 arm，但 key 尚无 incarnation，或本代尚未在当前 watchEpoch fresh verify | `null` |
| `ALIVE` | 本代 PID 存活且身份可信 | `alive` |
| `GRACE` | PID 已消失，等待本代 SessionEnd | `alive` |
| `ENDED` | 本代善终，吸收终态 | `ended` |
| `DEAD` | 本代猝死，吸收终态 | `dead` |

`GRACE` 对外仍是 `alive`，这是“善终不闪 dead/null”的必要条件。

状态分两层：

- registry：按 key 保存 incarnation、generation 与 terminal；后台 start/end 即使 key 未 arm 也要更新，但后台 start 只登记为 `UNKNOWN`。
- projection：只投影 `armedKey`。后台事件不得偷做 ARM，也不得切换当前 key。

## 5. 状态转移正文

| 当前状态 | 事件 | 条件 | 新状态 |
|---|---|---|---|
| 任意 | `ARM(key)` | — | arm 指向 key，watchEpoch + 1；terminal 可直接投影，非终态一律先 `UNKNOWN`，等待本 epoch fresh verify |
| 任意 | `DISARM` | — | projection→`DETACHED`，watchEpoch + 1；旧 watcher 回调失效，registry 继续接收 start/end |
| 任意 | `CLOSE` | — | projection→`DETACHED`，watchEpoch + 1；既有 registry 保留，但 adapter 此后停止派发并清全部 timer/listener |
| 任意 registry | `SESSION_START` | producerEpoch 大于当前 | 接受新 incarnation；该 key generation 恰 +1，phase→`UNKNOWN`，并立即废除该 key 的旧 terminal；仅 armedKey 刷新 projection |
| 任意 | `SESSION_START` | producerEpoch 小于当前，或相等重放／冲突 | 严格 no-op |
| `UNKNOWN/GRACE` | `PID_VERIFIED` | armed key、本 incarnation、本 watchEpoch | `ALIVE` |
| `ALIVE` | `PID_GONE` | incarnation 与 watchEpoch 均为当前 | `GRACE` |
| `GRACE` | `SESSION_END` | 本代且 reason != resume | `ENDED` |
| `ALIVE/UNKNOWN` | `SESSION_END` | 本代且 reason != resume | `ENDED` |
| `DETACHED`／off-key registry | `SESSION_END` | 该 key 本代且 reason != resume | 后台 registry→`ENDED`，当前 projection 不变 |
| `GRACE` | `GRACE_EXPIRED` | 本代且当前 watchEpoch | `DEAD` |
| 任意 | `SESSION_END(reason=resume)` | — | 不产生终态 |
| `ENDED` | 旧 poll／timeout／重复 end | 同一代 | 保持 `ENDED` |
| `DEAD` | 迟到 end／旧 poll／timeout | 同一代 | 保持 `DEAD` |
| 任意 | 错 key／错 sessionId／错 producerEpoch／旧代事件／旧 watchEpoch 回调 | — | 严格 no-op，含 terminalRecords 不变 |
| `ENDED/DEAD` | 新 incarnation `SESSION_START` | — | 唯一废除旧终态的通道；先 `UNKNOWN`，fresh verify 后才 `ALIVE` |

`terminalRecords()` 只导出每个 key 的当前 terminal，字段至少含 `key/sessionId/incarnation/producerEpoch/generation/terminal`；新 incarnation start 后旧 terminal 必须立即停止导出。终态事实与 hook 的 producerEpoch 分配账必须持久化在 `FOLEY_HOME` 内。serve 重启时先 fold/rehydrate，再发布当前态；不得先发 `null/alive` 后补终态。活跃非终态的 generation 可由 spool replay 重建，不要求仅靠 terminal 文件单独保存 watermark。

`CLOSE` 对 reducer 表示“本 adapter 实例已脱离并令旧 callback 失效”；纯 state 仍可被新 adapter 实例复用并再次 ARM。真实已 close 的旧 adapter 不得继续派发事件。

升级遗留的“只有 End、没有可匹配 Start 身份账”不得临时伪造 incarnation／producerEpoch；producer 生命周期安全忽略该 End。原有出卡/蒸馏语义可在 producer reducer 之外独立处理。

## 6. P0 对抗断言

以下任一失败、跳过、超时或重试后才绿，均阻止合并。

### ATF-M01 · 同-session 真代际

A 与 B 使用同 transcript、同 `sessionId`、不同 incarnation：

```text
A start → A verified/alive → A ended
→ B start/UNKNOWN（旧 terminal 当场失效）
→ B fresh verified/alive
```

A 的历史／迟到 Start、End、PID_GONE、GRACE_EXPIRED 均不得改变 B。较旧 A Start 与 B 同 producerEpoch 的冲突 Start 都须 no-op。B 无本代 end 而 PID 消失，必须到 `dead`，不得误判 `ended`。

### ATF-M02 · 三轴分离与 stale resolver/timer

A 进入 GRACE；A 的 grace 到期前 B start。推进超过 A 的全部 deadline 后，B 仍为 alive。旧 A callback 不得写 B。另须覆盖同-key rearm 与 `A→B→A`：每次 ARM 只令 watchEpoch 恰 +1、generation 不变，旧 A epoch 永久失效。

### ATF-M03 · 善终无闪

两种顺序都必须通过：

```text
SessionEnd → PID 消失
PID 消失 → grace 内 SessionEnd
```

公开去重轨迹只能是：

```text
alive → ended
```

不得出现 `dead` 或 `null`。

### ATF-M04 · 猝死与时限

本代 PID 消失且 grace 内无本代 end：

- grace 内公开仍为 alive。
- 从实际 PID 消失起不超过 5 秒进入 dead。
- 轨迹不得经过 ended/null。
- 到 dead 后迟到 end 不得洗成 ended。

### ATF-M05 · 终态吸收与唯一复活

- `ENDED + 旧 timeout/PID_GONE/end` 仍为 ENDED。
- `DEAD + 迟到 end/timeout` 仍为 DEAD。
- transcript 新活动、link 恢复、退带重上均不得复活。
- `resume End` 在 UNKNOWN/ALIVE/GRACE 均须是完整 state 与 terminalRecords 的严格 no-op。
- 只有新 incarnation 的 `SESSION_START` 可以废除旧终态；仍须 fresh verify 才能复活为 ALIVE。

### ATF-M06 · 持久与重启

`ended` 与 `dead` 分别经过真实 serve 重启、重新 arm 后，首个 PLAYING 快照仍须是原终态。不得退成 null/alive；否则 REC 会重亮。持久记录乱序时取最高 generation；下一新代必须从最高代恰 +1，并令旧 terminal 不再导出，二次 rehydrate 也不得复活旧终态。

### ATF-M07 · 闭环

- GRACE 中 DISARM/EJECT 后，等待超过旧 deadline，公开态仍为 null。
- 切到另一 key 后，旧 key 的任何事件不得污染当前 key。
- 未 arm／已 disarm 时，start/end 仍须更新对应 key 的后台 registry；后台 start 只能留下 UNKNOWN 身份，重新 ARM 后必须 fresh verify 才能 alive。
- `ARM(B)` 当步即投影 `B/UNKNOWN/null`，不得等 B start 才停止显示 A。
- `close()` 针对当前 ALIVE/GRACE watcher 验收；关闭后其同-key/incarnation 旧 callback 必须严格 no-op。

### ATF-M08 · UNKNOWN

- `pid:null` → UNKNOWN/null。
- 初始 PID 指纹不匹配／已转租 → UNKNOWN/null。
- UNKNOWN 不得因“安静”自行变 dead。
- UNKNOWN 不得遗留死亡 timer。
- UNKNOWN 的本代非-resume End 必须进入 ENDED；resume End 仍保持 UNKNOWN。
- 当前 arm 的 `PID_VERIFIED` 才能令 UNKNOWN→ALIVE；旧 epoch verify 必须 no-op。

### ATF-M09 · 状态×事件×代际矩阵

对六个 reachable phase 逐一执行：

- current、foreign incarnation、错 key、错 sessionId、stale watchEpoch；
- 当前合法 End／verify／gone／expire；
- 新 incarnation start；
- ARM／DISARM／CLOSE。

矩阵覆盖六 phase 的 duplicate／older／equal-conflict Start、foreign identity、错 key/session、stale watchEpoch、所有 current 合法事件、新 Start，以及各 phase 的 ARM/DISARM/CLOSE；同时锁定 phase、公开 producer、producerEpoch、generation、watchEpoch、terminalRecords、输入不可变与 JSON round-trip。

### ATF-I01 · serve 同-session 负控

黑盒复现历史 end 污染：B 猝死必须 dead。该案须在旧 `d9413d6` 上因 `ended != dead` 确定为红，证明 ATF 咬得到已知病。

### ATF-I02 · serve dead 重启

`alive → dead → 重启 serve` 后，用 `FOLEY_ATF_BOOT_HOLD=1` 令 HTTP/SSE 先就绪、稳定报告 `bootHeld=true` 且不进入 PLAYING。订阅成功后才 release；首个 `phase=PLAYING` 快照必须已经是 dead，不能先发 null/alive 再补。旧 `d9413d6` 不具该 seam，负控红只证明它不满足新首帧可观测契约；已知 `null` 首帧病证另见负控记录。

### ATF-I02E · serve ended 重启

与 I02 同法，`alive → ended → 重启 serve` 的首个 PLAYING 必须已经是 ended。dead 与 ended 两种 terminal 都须经过真实 serve 重启，不能只在纯 reducer 自证。

### ATF-I03 · serve SSE 善终无闪

刺激前订阅 `/live` 的具名 `transport` SSE，记录有序数组。集成层确定性覆盖 `End→PID亡`，去重轨迹严格为 `alive → ended`，结论后继续等待超过旧 timer。`PID亡→grace内End` 的另一顺序由纯状态机 M03 覆盖；不得用猜测 poll 相位的固定 sleep 冒充。

### ATF-I04 · 同-session 迟到旧 End

ATF 诊断口先以 B Start 的唯一 `eventId` 证明 B 已被 serve 精确消费且处于 ALIVE；刺激前订阅 SSE，再投递带另一唯一 eventId 的 A 迟到 End。等待 `lastEventId` 精确等于该 End，随后整窗必须始终为 B/ALIVE，不得只看最终态。

### 集成横切 · 非空过 REC 投影

I01（猝死）与 I03（善终）两条终态主案必须先证明：

```text
producer=alive
完整录制语境下 recording=true
```

结案再证明 dead/ended 令 `recording=false`。未先亮过即判空过 FAIL。

### ATF-I05 · 工装隔离

默认闸只使用合成 producer。以下全部进入同一个 tmp 根：

```text
HOME
CLAUDE_CONFIG_DIR
FOLEY_HOME
FOLEY_PROJECTS
FOLEY_RUNS_DIR
TMPDIR
```

必须满足：

- 不启动 `claude`。
- 不写真实 `~/.claude`、`~/.foley`。
- 不写工作仓 `runs/`。
- 所有子进程在 finally 中退出。
- serve 必须尊重 `FOLEY_RUNS_DIR`；测试在 PATH 首位放置会留痕并失败的 `claude` trap，整案 trap 必须零击发。
- 本 ATF 即默认 producer 验收器，不再靠正则扫描旧 `producer_probe` 自证隔离。

### ATF-I06 · 生产接线

默认全量闸还必须保留：

- connect 同时安装 `SessionStart + SessionEnd`。
- hook 的 start/end spool 事件携带唯一 eventId、incarnation 与 producerEpoch。
- 同一枚持续存活的合成 producer 父进程驱动一组 start/end，两行 incarnation＋producerEpoch 必须相同；spool 的 PID/命令指纹必须确实指向该父进程。
- 两父重叠案：A Start 后 B Start（同 key/session），B 已 ALIVE 后 A 父才发 End。A End 的 spool 身份仍须绑定 A；serve 以该 eventId 消费后 B 全窗保持 ALIVE。hook 身份账必须按 producer 父进程出生身份分槽，不能只存 `key→current`。
- 同父真实 resume 顺序：B 的 `SessionEnd(reason=resume)` 先绑定旧 B 身份且不产生终态；随后同一父进程 `SessionStart(source=resume)` 必须得到新 incarnation 与更大 producerEpoch；最终 End 绑定新身份并令 serve ENDED。
- 本案所有 hook eventId 必须非空且两两唯一。
- 合成父进程与其 hook 子进程均有硬 timeout；不得让同步子进程永久卡闸。

### ATF-I07 · grace 中换代

A 已进入 GRACE 后先订阅 SSE，再令 B start；测试以 ATF 只读诊断口确认 B 已消费并处于 ALIVE，再推进超过 A 的全部 deadline。从 B 首个 ALIVE 起整窗必须保持 B/alive。

### ATF-I08 · grace 中 eject/disarm

A 已进入 GRACE 后先订阅 SSE，再执行真实 `/transport/eject`；推进超过旧 deadline，从首个 EMPTY 起整窗必须保持 `EMPTY + producer=null`。随后重插同一 live 带，必须回到旧身份的 `UNKNOWN/null` 等 fresh verify，不得冒出 timer 暗写的 DEAD terminal。

### ATF-I09 · adapter UNKNOWN

黑盒覆盖：

- `pid:null` 的 Start 被消费后为 `UNKNOWN/null`，越过 death deadline 仍不得 dead。
- 存活 PID 但命令指纹不符时同样为 `UNKNOWN/null`，不得误发 `PID_VERIFIED`，也不得挂死亡 timer。

### ATF-I10 · 工装自证

- 被测仓只复制到 tmp 沙箱后执行。
- 沙箱路径与源仓 realpath 不同。
- I05＋I10 合看，live 产物流只允许出现在 `FOLEY_RUNS_DIR`；沙箱 `repoRoot/runs` 必须为空。
- serve 与合成 producer 均以独立进程组启动；finally 和顶层兜底都整组 TERM→KILL，并确认进程组消失后才删 tmp。

## 7. 禁止的假绿

- 只查最终态，不记完整有序轨迹。
- 用 `Set` 代替序列。
- 用不同 `sess-A/sess-B` 冒充同-session resume。
- 刺激后才订阅。
- 杀前不证明 alive／REC 真亮。
- A 的旧 resolver 尚未成熟就 cleanup。
- 重启测试实际复用旧 serve 或旧端口。
- serve 已进入 PLAYING 后才订阅，却宣称抓到“首帧”。
- boot endpoint 空回 204，却没有稳定 `bootHeld=true` 握手。
- 用自增计数冒充指定 spool 行已消费；必须回显精确 eventId。
- 后台 Start 直接记 ALIVE，日后 ARM 不做 fresh PID verify。
- 只按“到达顺序”给 generation，不用 producerEpoch 拦迟到旧 Start。
- 新 incarnation 已开始却仍导出旧 terminal。
- oracle 调用被测实现自身计算期望。
- 用固定 sleep 猜被测物状态；只有测试已显式钉死 poll/grace 时，才允许用 tail sleep 推进超过已知 deadline。
- 验收器写入真实 transcript 或仓内日带。
- 只杀 serve 父 PID、不收 live/hook 后代进程。
- PASS 条件仅为 `after != dead` 或 `REC=false`。

## 8. 合并政策

P0：

- 本单所有纯状态机与 serve 集成断言一次通过。
- 默认 `npm test` 与 typecheck 通过。
- 无 skip/todo/retry。
- 无 tmp 外写入与遗留子进程。

P1（允许随车入下一批）：

- 真 Claude 发布前单发烟测。
- poll/grace 在 5 秒帽内的进一步提速。
- 运行期间持续 PID 指纹复验的强化。
- 并发 SessionStart 的 producerEpoch 原子分配／崩溃恢复压力案。
- 无 `FOLEY_ATF=1` 时诊断字段、boot endpoint、短时钟变量均不暴露的额外黑盒卫兵。
- 验收输出可读性与耗时优化。
- 工装 helper 收束；不得以减行数为由降低断言。

P2：

- 报告、LEDGER、旧轮证据、措辞和历史数字。

## 9. 时序六问

席二呈审前须逐项回答并指向测试 ID：

1. 竞态：事件的另一种顺序是什么？
2. 代际：旧事件／旧回调凭什么不能覆盖新对象？
3. 持久：进程重启后哪个事实仍成立？
4. 闭环：退带、换源、关闭后谁取消 timer 和 listener？
5. 隔离：测试到底能写到哪些绝对路径？
6. 验证器：它是否明显比被测物简单？
