# 恶意 JSONL 再生

小样本已随附。巨型行（C2 崩溃证据）不入库，一行再生：

```
node -e 'const fs=require("fs");const big="A".repeat(10*1024*1024);fs.writeFileSync("hugeline.jsonl",JSON.stringify({type:"assistant",timestamp:"2026-07-06T00:00:00Z",message:{role:"assistant",content:[{type:"tool_use",id:"h",name:"Bash",input:{command:big}}]}})+"\n")'
node ../../../../cli/index.ts distill hugeline.jsonl /tmp/x.tape.jsonl   # → RangeError 爆栈（parse.ts:117 sanitizeToken）
```
