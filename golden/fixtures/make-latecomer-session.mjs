// 合成「原始 Claude 会话 JSONL」发生器 —— latecomer 回归夹具的密闭化源（夜审 L#9/右耳 D-8）。
// 旧 latecomer.mjs 复制真实 ~/.claude 会话（读真实用户目录·不可复现·泄内容）；此发生器产一卷
// 确定性合成原始带替之：格式照 adapters/claude-jsonl/parse.ts（assistant.tool_use / user.tool_result
// 配对·ISO 时间戳），内容全固定（零随机·零真实数据），足以让引擎产张力曲线（有墨=有动）。
// 用法：node golden/fixtures/make-latecomer-session.mjs [out.jsonl]   （默认写 latecomer.session.jsonl）
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'latecomer.session.jsonl');

const SID = 'latecomer-synth-0001';
const CWD = '/tmp/foley-latecomer-synth';
const BASE = Date.parse('2026-07-15T02:00:00.000Z');   // 固定内参时钟（文件 mtime 才决定 live 资格）
const iso = (offSec) => new Date(BASE + offSec * 1000).toISOString();
let uuidN = 0, seq = 0;
const uuid = () => `synth-${(uuidN++).toString(36).padStart(6, '0')}`;
const lines = [];
const push = (o) => lines.push(JSON.stringify(o));

// 开场白（真人第一句·货架取名/开场白源；不以 '<' 起、非 Caveat）
push({ parentUuid: null, isSidechain: false, type: 'user', cwd: CWD, sessionId: SID, version: '2.1.209',
  message: { role: 'user', content: [{ type: 'text', text: '帮我把登录接口偶发的 500 排掉，先看日志再改。' }] },
  uuid: uuid(), timestamp: iso(0) });

// 一对 tool_use/tool_result；errClass 复用制造「同因连败」的风暴张力
function pair(offSec, name, input, latSec, isErr, resultText, errClass) {
  const id = `toolu_synth_${seq++}`;
  push({ parentUuid: null, isSidechain: false, type: 'assistant', cwd: CWD, sessionId: SID, version: '2.1.209',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
    uuid: uuid(), timestamp: iso(offSec) });
  const tur = isErr
    ? { stdout: '', stderr: resultText, interrupted: false, isImage: false, ...(errClass ? { errClass } : {}) }
    : { stdout: resultText, stderr: '', interrupted: false, isImage: false };
  push({ parentUuid: null, isSidechain: false, type: 'user', cwd: CWD, sessionId: SID, version: '2.1.209',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: !!isErr, content: resultText }] },
    toolUseResult: tur, uuid: uuid(), timestamp: iso(offSec + latSec) });
}

// —— 平稳开局（低张力·成功串）——
pair(20, 'Bash', { command: 'tail -n 200 /var/log/app/login.log' }, 3, false, 'HTTP 500 at /auth/login x37', null);
pair(48, 'Read', { file_path: '/srv/app/auth/login.py' }, 2, false, '  120 lines read', null);
pair(80, 'Grep', { pattern: 'timeout', path: '/srv/app/auth' }, 2, false, 'session.py:44: TIMEOUT=2', null);
pair(120, 'Edit', { file_path: '/srv/app/auth/session.py' }, 3, false, '1 edit applied', null);

// —— 风暴簇（同 errClass 连败·张力爬升——有墨的主料）——
const STORM_ERR = 'DBPoolTimeout';
for (let i = 0; i < 6; i++) {
  const t = 160 + i * 26;
  pair(t, 'Bash', { command: 'pytest tests/test_login.py -k timeout' }, 6, true,
    `E   sqlalchemy.exc.TimeoutError: QueuePool limit reached (attempt ${i + 1})`, STORM_ERR);
}

// —— 挣扎中的一记查证 ——
pair(330, 'Bash', { command: 'psql -c "show max_connections"' }, 4, false, 'max_connections = 20', null);
pair(370, 'Edit', { file_path: '/srv/app/db/pool.py' }, 3, false, 'pool_size 5 -> 20', null);

// —— 平复（RESOLVE·成功收束·张力回落）——
pair(410, 'Bash', { command: 'pytest tests/test_login.py -k timeout' }, 7, false, '6 passed in 5.2s', null);
pair(450, 'Bash', { command: 'pytest tests/test_login.py' }, 9, false, '48 passed in 21.7s', null);
pair(500, 'Edit', { file_path: '/srv/app/CHANGELOG.md' }, 2, false, '1 edit applied', null);

writeFileSync(out, lines.join('\n') + '\n');
console.log(`wrote ${lines.length} lines → ${out}`);
