// 默认 hermetic 浏览器接线闸（夜审 左耳 #9/§8.6 · 右耳 D-8 · 席三工单二·回归族）。
//
// 病：最高风险的「首手势接线／声桥／首分钟」只活在 audit/ 里的浏览器 repro，默认 npm test（纯 node
// 金测）从不跑它——回归悄悄溜过。旧 latecomer 还复制真实 ~/.claude 会话（读真实用户目录·不可复现）。
// 修：latecomer 密闭化（合成夹具 golden/fixtures/latecomer.session.jsonl 替真实 JSONL）后，由本金测
// 拉进默认 npm test。真浏览器跑，但源是合成的、serve 是 hermetic 的（latecomer 自建即用即删 HOME/
// CFG/PROJECTS）。chromium/playwright-core 缺席（clean env / CI 未装）即优雅 skip——**不破 pure-node
// 金测**（B4 干净检出照样全绿）。
//
// 首件＝latecomer（P0-1 接线倒置·迟到者三案）。同族浏览器接线 repro（如 P0-2 transport 暂停传动·
// 已密闭化）可照此一句加入：各 repro 自带密闭 serve 与合成源，闸只核 exit 0。
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const exe = process.env.CHROMIUM_EXE
  ?? `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const hasChromium = existsSync(exe);
const hasPlaywright = existsSync(join(root, 'audit', 'tools', 'node_modules', 'playwright-core'));
const skip = !hasChromium
  ? 'hermetic 浏览器闸跳过：chromium 缺席（clean env）'
  : !hasPlaywright
    ? 'hermetic 浏览器闸跳过：playwright-core 缺席（audit/tools 未装）'
    : false;

test('P0-1 接线倒置·迟到者三案（合成夹具·hermetic 浏览器闸）', { skip }, () => {
  // latecomer.mjs 内 PASS→exit 0；A/B/C 任一红→exit 1→execFileSync 抛→本测试红。
  try {
    execFileSync('node', ['audit/p0-1-wiring/repro/latecomer.mjs'], {
      cwd: root, stdio: 'pipe', timeout: 150_000,
      env: { ...process.env, FOLEY_GATE: '1' },   // 闸内不落工件（免 npm test 脏树）
    });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    const out = (err.stdout?.toString() ?? '') + (err.stderr?.toString() ?? '');
    throw new Error('latecomer 接线闸红（尾）：\n' + out.slice(-1600));
  }
});
