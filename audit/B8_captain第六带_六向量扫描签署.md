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

---

## 重签 · 席三 · 2026-07-16（当前切片·item6 契约机器化）

> 席一 item6 冻结契约（`docs/canon/SIGNATURE-HASH-CONTRACT.md` §6）裁定：2026-07-13 旧正文扫的是约 13MB
> captain 原件、未记 SHA-256/commit，**不是当前切片的有效签署**；当前 `captain.*` 已降采样（curve 152,465B·
> moments 1,301B·席一工单2 `3fd00b1` 减包），属不同工件，须对当前两件重扫重签，**不倒填旧判词**（禁伪签）。

对**当前**两件重跑六向量（尺同 REDACTION-CONTRACT v1）：

| # | 向量 | 当前实测（curve 152,465B / moments 1,301B·21 事件） | 结论 |
|---|---|---|---|
| ① | 绝对时间戳 | curve t 相对首事件 0→219,988ms；moments t/emitT 同尺·非 epoch | **过** |
| ② | 明文工具名 | verb 枚举 {OTHER,READ,RUN,WRITE}·无工具名列 | **过** |
| ③ | 错误明文 | outcome 枚举 {OK,FAIL,NA}·无 errClass/文本列 | **过** |
| ④ | 未盐哈希 | sig 全 `s`+hex（违例 0）·slot 全 hex（违例 0） | **过** |
| ⑤ | 源文件指纹 | 两文件均无 sourceHash 列 | **过** |
| ⑥ | 自由文本残留 | `/Users/ /home/ http @ sk- ghp_ Bearer` 命中 0（两文件）·tags 全空·其余列皆有界枚举（phase{WORKING}/weather{CLEAR,OVERCAST,RAIN}）或数值 | **过** |

六向量全过——当前切片以「第六带」名义合法续用。诚实边界同旧：46.3h 会话时长为仅存弱指纹，船长知情裁入。签署提交位于 `signedCommit`（工件所在树）之后（契约 §3 标准次序）。

<!-- FOLEY-SIGNATURE:BEGIN -->
```json
{
  "schema": "foley-signature/v1",
  "id": "B8_CAPTAIN_SIX_VECTOR",
  "scope": "redaction-six-vector/v1",
  "verdict": "PASS",
  "signer": "seat3",
  "signedAt": "2026-07-16T12:08:19Z",
  "signedCommit": "3fd00b13df19a225cc7525510383860bb48888a9",
  "subjects": [
    {
      "path": "stage/fixtures/captain.curve.csv",
      "bytes": 152465,
      "sha256": "b96a6ce8fe32f4d4172d62203ce1bbb5baefb1d2729022a06b6bc6a3336ef340"
    },
    {
      "path": "stage/fixtures/captain.moments.csv",
      "bytes": 1301,
      "sha256": "27a60a58d1248579ea3e74786d6829bb3da83a76d58687b2b19732209ace2061"
    }
  ]
}
```
<!-- FOLEY-SIGNATURE:END -->
