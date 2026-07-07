#!/usr/bin/env bash
# 甲-2【P1】复现：干净克隆 npm test 6/105 红，源于 gitignore 掉的 tapes/*.tape.jsonl。
# 证据律：脚本自建一个"无隐私带"的临时工作树（模拟 git clone），跑 test 看 6 红；
#         再把作者本机 tapes/ 拷进去，看 105/105 全绿——证明 6 红纯因缺夹具，非真 bug。
#
# 用法：bash repro/final-甲/01-npm-test-on-clone.sh
# 锚：main @ 149ddea
set -u
ANCHOR=149ddea
MAIN=/Users/shadow/tape0
TMP=$(mktemp -d)
CLONE="$TMP/clone"

echo "== ① 自建无隐私带的干净检出（模拟 git clone @${ANCHOR}）=="
git -C "$MAIN" worktree add -q --detach "$CLONE" "$ANCHOR"
ln -s "$MAIN/node_modules" "$CLONE/node_modules"
echo "   tapes/ 存在？ $([ -d "$CLONE/tapes" ] && echo 是 || echo 否（如真实克隆）)"

echo "== ② 干净检出跑 npm test（预期 fail=6）=="
( cd "$CLONE" && npm test 2>&1 | grep -E "ℹ (tests|pass|fail)" )
echo "   失败测试名："
( cd "$CLONE" && npm test 2>&1 | grep -E "^✖" | grep -v "failing tests" | head )

echo "== ③ 拷入作者本机 tapes/ 后重跑（预期 fail=0）=="
mkdir -p "$CLONE/tapes" && cp "$MAIN"/tapes/*.tape.jsonl "$CLONE/tapes/" 2>/dev/null
( cd "$CLONE" && npm test 2>&1 | grep -E "ℹ (tests|pass|fail)" )

echo "== 结论：6 红 ⇔ 缺 gitignore 掉的 tapes/*.tape.jsonl；有带即 105/105 全绿 =="
echo "   根因：sound.test.ts:73/:404 直接 readFileSync('tapes/…tape.jsonl')；"
echo "         .gitignore 排除 tapes/ 与 *.tape.jsonl；仓里只有派生 stage/fixtures/*.csv；无 pretest 生成器。"

echo "== 清理临时工作树 =="
git -C "$MAIN" worktree remove --force "$CLONE" 2>/dev/null
rm -rf "$TMP"
