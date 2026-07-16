# 工单 4 ATF · 负控记录

基线：`52d28cd`（D2 已签章合入后的 `main`）  
日期：2026-07-16  
命令：`npm run test:wo4-atf`

## 结果

```text
tests 4
pass 0
fail 4
skipped 0
todo 0
```

四枚红灯与工单 4 病灶逐项一致：

1. `ATF-W4-01`：空 `FOLEY_PROJECTS` 仍装上 `live`，实际 `kind:"live"`，未自动上厂带。
2. `ATF-W4-02`：`$FOLEY_HOME/onboard.json` 已有 `declinedAt`，但 `/onboard/status.declined` 为 `undefined`。
3. `ATF-W4-02B`：页面代码没有消费 `st?.declined`，仍会进入 `mountWireTag(st)`。
4. `ATF-W4-03`：空环境初始 transport 恒为 `loaded:"live"`；会话后至自愈路径不存在。

另：`npm run typecheck` 在同一验收提交上通过，证明 RED 来自缺失的产品行为，不是验收文件语法/类型错误。

此负控是开工锚，不是实现建议。席二应在不改验收文件的前提下使四枚断言转绿。
