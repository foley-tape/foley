# Producer ATF 牙齿自证

日期：2026-07-16

负控目标：`/Users/shadow/tape0-seat-d2`（HEAD `6289478`，代码基底 `d9413d6`）

原则：负控在 tmp 沙箱副本运行；未执行目标仓内 serve，未写目标仓 `runs/`

## 1. 纯状态机入口

命令：

```bash
node --test golden/producer-lifecycle.atf.test.ts
```

结果：RED。

```text
ATF-M00 缺显式状态机：
stage/producer-lifecycle.mjs
```

这枚红灯证明旧 D2 仍是散装 timer/flag，没有满足 ATF 裁决的“显式状态机先行”。

纯测试本身另用一次性最小参考 reducer 做过自检：父 suite 加 `ATF-M01..M09` 共 `10/10 PASS`；参考件随后删除，不进入交付，也不充当生产实现。

## 2. serve 黑盒负控

命令：

```bash
FOLEY_ATF_REPO=/Users/shadow/tape0-seat-d2 \
  node --test golden/producer-lifecycle.integration.atf.test.ts
```

结果：9 枚业务 RED，2 枚健康／工装路径 PASS。

| 测试 | 结果 | 旧 D2 实测 | ATF 期望 |
|---|---|---|---|
| ATF-I01 同-session 历史 End | RED | B 猝死后 `ended` | `dead` |
| ATF-I02 dead 重启首帧 | RED | 无 boot-hold seam（早先负控亦已实测重启首 PLAYING 为 `null`） | 订阅先行，首 PLAYING=`dead` |
| ATF-I02E ended 重启首帧 | RED | 无 boot-hold seam，无法证明未瞬闪 | 订阅先行，首 PLAYING=`ended` |
| ATF-I03 End先到、PID后亡无闪 | PASS | SSE 去重轨迹 `alive→ended` | `alive→ended` |
| ATF-I04 迟到旧 End | RED | 缺 incarnation/lastEventId 诊断 seam；早先负控已实测 B 被熄成 `ended` | 指定旧 End 已消费且 B 全窗保持 `alive` |
| ATF-I05 live-output 隔离 | RED | `FOLEY_RUNS_DIR` 无输出，说明 serve 未尊重隔离根 | 输出只进 tmp |
| ATF-I06 hook 贯通 | RED | 合成父 PID／指纹可正确捕获，但 spool 无 incarnation/producerEpoch/eventId | 两父重叠 End 正确归属；同父真实 resume 新代；最终 ENDED |
| ATF-I07 grace 中换代 | RED | 缺 phase/incarnation 诊断 seam | B 上代后整窗不受 A resolver 污染 |
| ATF-I08 grace 中 eject | RED | 缺 phase/incarnation 诊断 seam | 首 EMPTY 后整窗保持 EMPTY/null |
| ATF-I09 adapter UNKNOWN | RED | 缺 UNKNOWN/incarnation 诊断 seam | pid:null／错指纹越过 deadline 仍 UNKNOWN/null |
| ATF-I10 工装沙箱自证 | PASS | 可写根均在 tmp，目标代码仅从沙箱执行 | 同左；进程组收尸 |

总输出：

```text
tests 12
pass 2
fail 10
```

Node 的父级 suite 也计一枚 fail，因此业务红断言为 9 枚。

## 3. 判别力结论

- 能咬出四轮已经确认的核心病：同-session 代际、重启首帧不可证、隔离越界、hook 身份缺失。
- 没有误杀旧 D2 已正确的善终 grace 路径。
- 没有靠真 Claude、浏览器或高频 GET 猜“无闪”；完整轨迹来自刺激前订阅的 transport SSE。
- 合成父进程有硬 timeout；serve/live 与 hook 工装按独立进程组收尸。负控后以 `ps` 复核，无本轮遗留进程。
- 验收器自身所有可写根均在 tmp，明显比被测生产链简单。

## 4. 基线健康

- `npm run typecheck`：PASS。
- 排除新 ATF 后，旧金测 `177/180` 通过。
- 仅 3 枚既有 `B4 factory` 环境前提失败：当前开发树存在 vendored records mp3，而该组测试明确要求在无 vendored mp3 的干净检出／CI 中运行。其余旧金测无新增失败。
