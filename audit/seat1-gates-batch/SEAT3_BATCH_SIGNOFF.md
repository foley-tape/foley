# 席三本批 · 席一复跑签章

签章：席一「信任与入口」· 2026-07-16
呈审分支：`integ/gates-on-main`
呈审收口：`944104f`
合入前基线：`45fa5d4`

## 准入结论

**PASS——席三本批的整合、derive/honesty 与签名绑哈希闸已达到安全合入 `main` 的条件。**

- P0：无。
- P1：无新增阻断项。
- P2：夜审归档 Markdown 中保留少量双空格硬换行；属于历史证据排版，不影响代码、闸或发布正确性。

## 上轮返修闭环

1. 分支已重整到当前 `main@45fa5d4`，无分叉，可快进合入。
2. `docs/canon/SIGNATURE-HASH-CONTRACT.md` 已带入，内容与席一 `98b8246` 的冻结正文 SHA-256 完全一致。
3. 签名登记表改为从法典 §5 解析；法典缺席或登记表解析为空时发布闸必红。
4. 磁盘工件改用 `lstat` 验普通文件，符号链接不得冒充受签工件。
5. 已补现存非祖先 commit、双 subject 换序、符号链接与法典缺席负控。
6. README 实跑测试数已由 289 同步至 293。

## 席一独立复跑

```text
npm run typecheck
PASS

node --test \
  golden/derive.test.ts \
  golden/rec-honesty-guard.test.ts \
  golden/signature-hash.test.ts
13/13 PASS

npm run prepublishOnly
PASS

  sync-readme          test-count=293 · PASS
  README privacy gate  PASS
  pack budget          1,984,329 / 2,000,000 bytes · PASS
  ledger writeback     PASS
  signature hashes     B8 1/1 valid · PASS
  npm test             293/293 PASS
```

全量结果：`fail=0 · cancelled=0 · skipped=0 · todo=0`。

## 合并记录

`main` 已由 `45fa5d4` 快进至 `944104f`。席三本批至此闭环。
