// 红队D 追补：SPEC §6.2 未决 RUN 滴灌 vs 实现；§5 ASK 15s 后备是否存在。
import { replayCore } from '../../../cli/replay.ts';
import { distillTape, serializeTape } from '../../../adapters/claude-jsonl/index.ts';
import { resolveParams } from '../../../engine/params.ts';
import { readFileSync } from 'node:fs';

const params = resolveParams(JSON.parse(readFileSync(new URL('../../../params.json', import.meta.url), 'utf8')));

console.log('=== 1) 未决 RUN 滴灌：SPEC §6.2「未决 RUN 超 30s 起微涨（它是不是挂了？）」===');
// 造两卷：A) RUN 挂起永不返回（resolveT=null）；B) RUN 90s 后才返回（resolveT 有值）。
function A(id: string, cmd: string, ts: string) { return JSON.stringify({ type: 'assistant', timestamp: ts, message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command: cmd } }] } }); }
function U(id: string, ts: string, code = 0) { return JSON.stringify({ type: 'user', timestamp: ts, toolUseResult: { code, durationMs: 1000, interrupted: false }, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: code !== 0, content: 'ok' }] } }); }

// A：一个永不返回的 RUN，其后 3 分钟只有心跳（另一条无关事件撑起时间轴）
const hang = [
  A('h1', 'sleep 9999', '2026-06-01T10:00:00.000Z'),
  // 无 h1 的 result —— 永远未决。后接一条 5 分钟后的无关事件把时间轴拉长。
  A('h2', 'echo tick', '2026-06-01T10:05:00.000Z'),
  U('h2', '2026-06-01T10:05:00.500Z'),
].join('\n') + '\n';
const coreHang = replayCore(serializeTape(distillTape(hang, params)), params, 0.5);
const peakHang = coreHang.metrics.peakT;

// B：一个 90s 才返回的 RUN
const slow = [
  A('s1', 'sleep 90', '2026-06-01T10:00:00.000Z'),
  U('s1', '2026-06-01T10:01:30.000Z'),
  A('s2', 'echo tick', '2026-06-01T10:05:00.000Z'),
  U('s2', '2026-06-01T10:05:00.500Z'),
].join('\n') + '\n';
const coreSlow = replayCore(serializeTape(distillTape(slow, params)), params, 0.5);
const peakSlow = coreSlow.metrics.peakT;

console.log(`  A) RUN 永不返回（resolveT=null）→ 峰值 T = ${peakHang.toFixed(4)}`);
console.log(`  B) RUN 90s 后返回（resolveT 有值）→ 峰值 T = ${peakSlow.toFixed(4)}`);
console.log(`  期望（SPEC §6.2）：永挂的 RUN 应"是不是挂了"式微涨，A 应 ≥ B。`);
console.log(`  实测：A ${peakHang > 0 ? '有涨' : '零涨'}，B ${peakSlow > 0 ? '有涨' : '零涨'} → ${peakHang >= peakSlow && peakHang > 0 ? '符合' : '❌ 反了：只有"已返回"的 RUN 滴灌，真正挂起的 RUN 零滴灌（drips 过滤 resolveT!==null）'}`);

console.log('\n=== 2) ASK 15s 后备启发式（SPEC §5）是否存在？ ===');
// tool_use 发出后 >15s 无结果、无新写入 → 推定 ASK。造此形。
const askish = [
  A('a1', 'ls', '2026-06-01T10:00:00.000Z'),
  // 无 a1 结果，20s 后才有下一事件 —— SPEC 说应推定 ASK。
  A('a2', 'ls', '2026-06-01T10:00:20.000Z'),
  U('a2', '2026-06-01T10:00:20.500Z'),
].join('\n') + '\n';
const d = distillTape(askish, params);
const hasAsk = d.records.some((r) => r.verb === 'ASK');
console.log(`  20s 无结果的 tool_use → 是否推定 ASK？ ${hasAsk ? '✅ 是' : '❌ 否（15s 后备未实现；仅显式 AskUserQuestion→ASK。askTimeoutSec 为死配置）'}`);
