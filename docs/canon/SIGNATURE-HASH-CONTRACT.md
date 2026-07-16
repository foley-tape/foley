# 工件签署绑哈希契约 · v1

签发：席一「信任与入口」· 2026-07-16
状态：**冻结；交席三逐字机器化**
首案：B8 captain 第六带六向量签署

## 1. 法条

凡签署声称“某个文件或文件组已经过扫描、可以继续沿用该结论”，签署必须同时绑定：

1. 被签工件的仓内相对路径；
2. 每件工件的精确字节数；
3. 每件工件的完整 SHA-256；
4. 承载这些精确字节的完整 Git commit；
5. 扫描范围、签署人、签署时间与 `PASS` 判词。

**缺 SHA-256 或缺 commit 的签署，对当前工件一律无效。** 文件名、近似大小、截图、自然语言“未改”声明均不能代替摘要。

本契约约束的是“工件身份”，不是密码学身份认证；签署人的审计责任仍由席位制度承担。

## 2. 机器块唯一格式

每份受管签署文档必须恰有一个当前有效机器块。机器块位于以下标记之间，内容是严格 JSON：

````markdown
<!-- FOLEY-SIGNATURE:BEGIN -->
```json
{
  "schema": "foley-signature/v1",
  "id": "B8_CAPTAIN_SIX_VECTOR",
  "scope": "redaction-six-vector/v1",
  "verdict": "PASS",
  "signer": "seat3",
  "signedAt": "YYYY-MM-DDTHH:mm:ssZ",
  "signedCommit": "完整40位小写Git SHA-1",
  "subjects": [
    {
      "path": "stage/fixtures/captain.curve.csv",
      "bytes": 0,
      "sha256": "完整64位小写SHA-256"
    },
    {
      "path": "stage/fixtures/captain.moments.csv",
      "bytes": 0,
      "sha256": "完整64位小写SHA-256"
    }
  ]
}
```
<!-- FOLEY-SIGNATURE:END -->
````

格式纪律：

- JSON 顶层只允许示例中的八个键；不得以自由文本扩展机器语义。
- `schema`、`id`、`scope`、`verdict` 必须与登记表逐字一致。
- `signedCommit` 必须是完整 40 位小写十六进制，不接受短 SHA、分支名或 `HEAD`。
- `subjects` 不得为空；路径必须唯一、按字典序排列、为仓内相对路径，不得含绝对路径、空段、`.` 或 `..`。
- `bytes` 必须是非负安全整数；`sha256` 必须是完整 64 位小写十六进制。
- `signedAt` 使用 UTC ISO-8601；`signer` 为非空席位标识。
- 签署文档的解释性正文可以扩写，但正文不得覆盖机器块的判词。

## 3. commit 语义

`signedCommit` 指向**被扫描工件已经提交、签署文档尚可随后提交**的那棵树。标准次序：

1. 先提交被签工件；
2. 审计席从该提交的 Git blob 与当前磁盘各自计算字节数和 SHA-256；
3. 执行规定扫描；
4. 将机器块写入签署文档并另起签署提交。

因此签署提交通常位于 `signedCommit` 之后。闸必须确认 `signedCommit` 是当前 `HEAD` 的祖先。

变基、cherry-pick 或重写历史导致 commit 改变时，即使文件字节偶然相同，原签也不再满足 commit 绑定，必须重新签署。不得把旧签的日期、签署人或判词复制到新 commit 上冒充原签延续。

## 4. 有效性判定

一份签署只有在以下条件全部成立时才有效：

1. 受管文档存在且机器块恰有一个，JSON 可解析；
2. 登记项、机器块 `id/scope` 与 `subjects.path` 集合完全一致；
3. `verdict === "PASS"`；
4. `signedCommit` 存在，且为当前 `HEAD` 的祖先；
5. 对每个 subject，`signedCommit:path` 的 blob 字节数与 SHA-256 等于机器块；
6. 当前 `HEAD:path` 的 blob 字节数与 SHA-256仍等于机器块；
7. 当前磁盘文件存在、为普通文件，其字节数与 SHA-256仍等于机器块。

任一层不符即签署失效。尤其：

- 工件被替换、降采样、重生成或只改一个字节：失效；
- 工件在工作树中有未提交改动：磁盘哈希不符，失效；
- 只改机器块使其追上新文件、却没有重新执行扫描：属于伪签；
- 历史正文写着“后续替换须重签”，但没有机器块：仍属无效签署。

闸应从 Git blob 直接取数，避免把换行转换或工作树过滤误当原件：

```bash
git cat-file -s "$signedCommit:$path"
git show "$signedCommit:$path" | shasum -a 256
git cat-file -s "HEAD:$path"
git show "HEAD:$path" | shasum -a 256
wc -c < "$path"
shasum -a 256 "$path"
```

## 5. v1 受管登记表

| id | 签署文档 | scope | 必须完整覆盖的 subjects |
|---|---|---|---|
| `B8_CAPTAIN_SIX_VECTOR` | `audit/B8_captain第六带_六向量扫描签署.md` | `redaction-six-vector/v1` | `stage/fixtures/captain.curve.csv`、`stage/fixtures/captain.moments.csv` |

席三之闸不得靠 `*签署*.md` 通配推定受管范围。新增登记项属于本契约修订，须先改本表，再加闸。

本版不追溯宣布所有历史行为验收报告无效；只有登记表中的“可被替换工件签署”受本闸强制约束。

## 6. B8 旧债裁定

2026-07-13 的 B8 正文扫描的是约 13MB 的 captain 原件，并未记录 SHA-256 或 commit。当前仓内 `captain.curve.csv` 已降采样为约 152KB，属于不同工件。

裁定：

- 旧 B8 正文保留历史证据价值，但**不是当前切片的有效签署**；
- 禁止把当前切片的哈希倒填进 2026-07-13 判词，伪造成旧签当时已经绑定；
- 席三须对当前两件 captain 文件重新执行六向量扫描，生成新机器块并签署；
- 在新签完成前，`B8_CAPTAIN_SIX_VECTOR` 状态为 `PENDING`，发布诚约闸应红。

## 7. 交席三机器化清单

建议闸名：`scripts/check-signature-hashes.mjs`，加入 `prepublishOnly`，不加入默认 `npm test`。

必须具备的自证用例：

1. 当前签署完整有效 → 绿；
2. 删除机器块 → 红；
3. SHA-256 改一位 → 红；
4. subject 文件改一字节 → 红；
5. `signedCommit` 改成非祖先或短 SHA → 红；
6. subjects 少一件、多一件或路径换序 → 红；
7. 工作树只改 subject、未提交 → 红；
8. 恢复合法机器块与原件 → 再绿。

闸只读，不得自动改签署、自动回填哈希或自动生成 `PASS`。重签必须由完成扫描的审计席明确提交。

## 8. 修订纪律

v1 的机器块字段、commit 语义与失效条件冻结。需要支持 Git SHA-256、目录树签署或外部 Release 工件时，升 schema 版本，不得静默扩解释。
