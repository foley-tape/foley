# serve 实测记录（支撑 F1 / F5 与第五节写鉴权/绑定面阴性结论）

锚 149ddea，`node stage/serve.mjs <port> [--replay-only]`。

## 绑定面（第五节：真只绑 127.0.0.1）
```
lsof -nP -iTCP -sTCP:LISTEN -a -p <pid>
 → node ... TCP 127.0.0.1:8942 (LISTEN)         # 仅回环
curl http://192.168.1.4:8942/   → HTTP=000       # LAN IP 直连被拒（GOOD）
```
`0.0.0.0:8942` 得 200 只是 macOS 把 0.0.0.0 目的地路由到回环，非真暴露。

## F5：GET 端点零 Host 校验（127.0.0.1 绑定挡不住 DNS-rebinding 读）
```
curl -H 'Host: evil.attacker.com' http://127.0.0.1:8942/            → HTTP=200   # 无 Host 闸
curl -H 'Host: evil.attacker.com' http://127.0.0.1:8942/today/curve.csv → 404 （replay-only 无 liveOutDir；live 模式会源样服务）
```
写端点有 `writeAuthed`（Origin 白名单 + 令牌），但 GET 面（`/today/*`、`/dayroll/*`、静态）与全局均无 Host 校验。绑定断 LAN，但 rebind 让攻击者域名解析到 127.0.0.1，绑定无效——真正该加的是 Host ∈ {localhost:port,127.0.0.1:port} 断言。

## F1：畸形 %-路径打垮进程（未鉴权、跨源可达）
```
# 合法编码不触发：
curl 'http://127.0.0.1:8942/%25'                 → 404（%25 解成 %，decodeURIComponent 不抛）
# 真畸形触发：
curl --path-as-is -g 'http://127.0.0.1:8942/%zz' → 000（崩）
curl 'http://127.0.0.1:8942/%'（裸%）            → 000（崩）
# 带跨源 Origin 仍崩（GET 路径崩点在 Origin 检查之前）：
curl -H 'Origin: http://evil.example' … '/%zz'   → 000（崩）
```
崩后 socket 关闭，后续任何请求 HTTP=000；replay-only 与默认 live 两模式皆崩。崩栈定位 `serve.mjs:240 decodeURIComponent`。
（已证伪：live 模式 spawned `cli live` 子进程父崩后随即自退，**不**遗留孤儿。）

## 写盘鉴权（第五节阴性：扎实）
```
POST /dub/save 无令牌            → 403
POST /dub/save 跨站 Origin+令牌  → 403（golden night2.security.test.ts 覆盖）
授权（同源+令牌）               → 200，落 runs/dubs/
save-bin kind 非白名单          → 落 .bin（不穿越/不注入）
save-bin tape=../../../x        → 折叠，留 runs/dubs/
```
令牌 = `randomBytes(18).toString('base64url')`（24 字符），每启动随机，注入同源 `<head>`；跨站 JS 读不到同源 DOM/HTML → 拿不到令牌。
