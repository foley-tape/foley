# B8 案结·captain 夹具六向量扫描签署（第六带转正）
签署：老终端（退役前五件套第一件）· 2026-07-13 · 船长令：「六向量扫描过了才能以第六带名义合法入库，排在一切提交之前。」

## 对象
`stage/fixtures/captain.{curve,moments}.csv`（13MB＋56KB·B8 案遗物·乙-③曾判默认删除·终裁在船长）

## 扫描（尺=REDACTION-CONTRACT v1 三向量＋连带条款，展开为六向量逐验）
| # | 向量 | 判据 | 实测 | 结论 |
|---|---|---|---|---|
| ① | 绝对时间戳 | t 列须相对首事件（无 epoch/日历指纹） | curve 首 t=21222ms·末 t=166,644,150ms（46.3h 相对时长）；moments t/emitT 同尺 | **过** |
| ② | 明文工具名 | 不得含内建白名单外明文 | 无工具名列——verb 全枚举 {OTHER,READ,RUN,SAVE,WRITE} | **过** |
| ③ | 错误明文 | 无 errClass/错误文本残留 | 无该列；outcome 枚举 {OK,FAIL,NA}；clearedBy 枚举 'ok' | **过** |
| ④ | 未盐哈希 | sig/slot 须加盐哈希形态 | sig 907 行全 `s`+hex（违例 0）；slot 全 hex（违例 0） | **过** |
| ⑤ | 源文件指纹 | 无 sourceHash 泄源 | 两文件均无该列（replay 派生物不携 meta） | **过** |
| ⑥ | 自由文本残留 | 无路径/URL/邮箱/密钥形/业务词 | grep `/Users/`,`/home/`,`http`,`@`,`sk-`,`ghp_`,`Bearer` 两文件命中 0；tags 全空；m 纯数值 | **过** |

## 判决
六向量全过——**captain 夹具以「第六带」名义合法入库**（形态＝stage/fixtures 回放派生 CSV，与 tapes/ 五卷 .tape.jsonl 骨架同尺不同形；诚实边界照抄契约 §6：最小化非零明文保证，46.3h 会话时长本身是仅存的弱指纹，船长知情裁入）。
本签署即入库凭据；后续任何再蒸馏/替换须重扫重签。
