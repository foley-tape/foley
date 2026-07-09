// 舞台点火（第五号手令 丁-E2 卡带架）：landing＝空载磁带架；选带→服务端 transport 权威→广播回渲染。
// 持久台面（房间/器件/声桥）＋可换喂食源（demo/card 回放·live 实流）；换带走淡出→装带→淡入（rule 1），
// 绝不销毁音频图（免爆破）。前端按钮/灯/选中一律读后端 transport 字段（rule 4），选中态不在前端自持（rule 2）。
// 深链：?tape=X / ?mode=live 只作"上机指令"（boot 后 POST select，后端广播回来才渲染）；裸正门＝空载（rule 3）。
import { loadTape, Replayer, buildTape } from './replay.js';
import { LiveStream } from './live.js';
import { VuMeter, ChartRecorder, Lamps } from './instruments.js';
import { ReelDeck, Counter } from './deck.js';
import { mountLens } from './lens.js';
import { DubController } from './dub.js';
import { SoundBridge } from './soundbridge.js';

const params = new URLSearchParams(location.search);
const deepTape = (params.get('tape') || '').replace(/[^\w-]/g, '');  // 深链 demo
const deepLive = params.get('mode') === 'live';                       // 深链 live
const soundOff = params.get('sound') === '0';
const deepSpeed = Number(params.get('speed') || 1);

const token = () => document.querySelector('meta[name="dub-token"]')?.content || '';
const postTransport = (action, body) =>
  fetch(`/transport/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dub-token': token() }, body: body ? JSON.stringify(body) : undefined })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
const fmtDur = (s) => {
  if (s == null) return '';
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};

async function boot() {
  if (document.readyState !== 'complete') await new Promise(r => window.addEventListener('load', r, { once: true }));

  const room = document.getElementById('room');
  // 首光·PLAY 呼吸示能（第五号手令 丁-E1／丙.3）：手势前唯一亮起；首个手势即房间醒，示能退场。
  window.addEventListener('pointerdown', () => {
    room.classList.remove('pre-gesture');
    document.getElementById('play-cue')?.classList.add('gone');
  }, { once: true });

  // ── 持久器件（换带不重建，只清账；声桥手势后 push） ──
  const vu = new VuMeter(document.getElementById('vu-svg'));
  const blankTape = { splices: [], moments: [], duration: Infinity };
  const chart = new ChartRecorder(document.getElementById('chart-canvas'), blankTape);
  const lamps = new Lamps(document.getElementById('amber-tube'), document.getElementById('emerald'), document.getElementById('pilot'));
  const deck = new ReelDeck(document.getElementById('reel-l'), document.getElementById('reel-r'), document.getElementById('tapeband'));
  const counter = new Counter(document.getElementById('counter-housing'), document.getElementById('loupe'), deck);
  const instruments = [vu, chart, lamps, deck, counter];

  const lens = mountLens(document.getElementById('lens'), document.getElementById('machine'));
  if (lens) { document.getElementById('grain').style.display = 'none'; document.getElementById('vignette').style.display = 'none'; }

  // ── 房间喂包（E1 睡姿）＋总线 ──
  let idleSince = null, lastPktSeen = null;
  const feedRaw = (pkt, isFirst) => {
    lastPktSeen = pkt;
    room.dataset.phase = pkt.phase; room.dataset.weather = pkt.weather;
    if (pkt.phase === 'IDLE') {
      if (idleSince === null) idleSince = performance.now();
      const deep = performance.now() - idleSince >= 300000;
      if (deep !== (room.dataset.sleep === 'deep')) { if (deep) room.dataset.sleep = 'deep'; else delete room.dataset.sleep; if (lens) lens.setDeep(deep); }
    } else if (idleSince !== null) { idleSince = null; delete room.dataset.sleep; if (lens) lens.setDeep(false); }
    instruments.forEach(i => i.onPacket(pkt, isFirst));
  };
  const feedMomentRaw = m => instruments.forEach(i => i.onMoment && i.onMoment(m));
  let dub = null;
  const feedPacket = (pkt, isFirst) => { if (dub?.eats()) return; feedRaw(pkt, isFirst); };
  const feedMoment = m => { if (dub?.eats()) { dub.noteMoment(m); return; } feedMomentRaw(m); };

  // ── 渲染环（30fps 封顶；体温法） ──
  let lastRender = -Infinity;
  function render(now) {
    requestAnimationFrame(render);
    if (now - lastRender < 33) return;
    lastRender = now;
    instruments.forEach(i => i.render(now));
    if (dub) dub.render(now);
  }
  requestAnimationFrame(render);
  window.addEventListener('resize', () => { chart._resize(); dub && dub.onResize(); });

  // ── 声桥（持久·手势起·rule 1 淡入淡出；换带只换喂食源，永不销毁音频图 丙.1） ──
  let sb = null, onSoundReady = null;
  if (!soundOff) {
    window.addEventListener('pointerdown', () => {
      if (sb) return; // 丙.1 单引擎：永不二次实例化音频图
      sb = new SoundBridge({ repoKey: 'deck:default', seed: 'deck' });
      const born = sb; instruments.push(sb);
      sb.start(lastPktSeen).then(() => { if (window.__stage) window.__stage.sound = born; onSoundReady?.(); })
        .catch((err) => { instruments.splice(instruments.indexOf(born), 1); sb = null; console.warn('[sound] 声桥未起（视觉照走）：', err); });
    });
  }

  // ── 可换喂食源（demo/card 回放·live 实流） ──
  let liveActive = false, livePrimed = false, replayer = null;
  const live = new LiveStream();
  live.onPacket.push((pkt, first) => { if (liveActive) feedPacket(pkt, first); });
  live.onMoment.push((m) => { if (liveActive) feedMoment(m); });
  // 状态可诊（E5）：只在 live 上机时把连接健康态落 room[data-signal]
  live.onStatus.push((s) => { if (!liveActive) return; if (s === 'live') delete room.dataset.signal; else room.dataset.signal = s; });
  live.connect(); live.flushBuffer();

  function stopSource() {
    liveActive = false;
    if (replayer) { replayer.pause(); replayer = null; }
    delete room.dataset.signal;
  }
  async function loadTapeData(item) {
    if (item.kind === 'demo') return await loadTape(item.id);
    const sid = item.id.slice(5);
    const [c, m] = await Promise.all([
      fetch(`/cards/${sid}/curve.csv`).then(r => r.ok ? r.text() : null),
      fetch(`/cards/${sid}/moments.csv`).then(r => r.ok ? r.text() : 't\n'),
    ]);
    if (!c) throw new Error('卡带无纸');
    return buildTape(sid, c, m);
  }
  function makeDub(o) {
    return new DubController({
      ...o, chart, deck, feed: feedRaw, feedMoment: feedMomentRaw,
      keyEl: document.getElementById('dub-key'), tabsEl: document.getElementById('dub-lengths'),
      overlayEl: document.getElementById('dub-overlay'), chartCanvas: document.getElementById('chart-canvas'),
      railEl: document.getElementById('walnut-rail'),
    });
  }
  async function mountSource(item) {
    counter.reset();
    if (!item) { chart.reset(blankTape); dub = null; return; }   // EMPTY：房间层，无源无带
    if (item.kind === 'live') {
      chart.reset(blankTape);
      liveActive = true;
      if (!livePrimed) { try { await live.prime(); } catch { /* 无今晨 */ } livePrimed = true; }
      dub = makeDub({ mode: 'live', tapeName: 'today', tape: blankTape, replayer: null, live });
    } else {
      const tape = await loadTapeData(item);
      chart.reset(tape);
      replayer = new Replayer(tape);
      replayer.onPacket.push(feedPacket); replayer.onMoment.push(feedMoment);
      // 丙.2：转台开停→唱片随带停/续播；DUB 自管音景期间不插手
      replayer.onPlayState = (playing) => { if (dub?.eats()) return; if (playing) sb?.resume?.(); else sb?.pause?.(); };
      if (deepSpeed > 0) replayer.speed = deepSpeed;
      dub = makeDub({ mode: 'replay', tapeName: item.id, tape, replayer, live: null });
      replayer.play();
    }
  }

  // ── transport 绑定（rule 2/4：一切读后端字段） ──
  const rackIndex = new Map();
  let curLoaded = null, curPhase = 'EMPTY', controlsLocked = false;
  function applyTransport(t) {
    if (!t) return;
    renderRackSelection(t.selected);                 // rule 2：选中标记读后端
    updateControls(t);                               // rule 4：键/相读后端
    if (t.phase === 'CUEING' && curPhase !== 'CUEING') sb?.fadeOut();   // rule 1：闭锁期淡出
    curPhase = t.phase;
    if (t.loaded !== curLoaded) {                    // 上机带变→换源（rule 1 装带→淡入）
      curLoaded = t.loaded;
      const item = t.loaded ? rackIndex.get(t.loaded) : null;
      stopSource();
      mountSource(item).then(() => sb?.fadeIn()).catch(err => { console.warn('[transport] 装带失败：', err); sb?.fadeIn(); });
    }
    if (replayer) {                                  // rule 4：回放转台随后端 phase 停/走
      if (t.phase === 'PAUSED' && replayer.playing) replayer.pause();
      else if (t.phase === 'PLAYING' && !replayer.playing) replayer.play();
    }
    if (t.live) lamps.pendingAsk = t.pendingAsk;     // rule 4：live ASK 待机读后端保活字段
  }
  live.es?.addEventListener('transport', e => { try { applyTransport(JSON.parse(e.data)); } catch { /* 坏包 */ } });

  // ── 卡带架 UI（左纵列货架） ──
  const rackEl = document.getElementById('rack-list');
  function renderRackSelection(sel) {
    if (!rackEl) return;
    for (const el of rackEl.querySelectorAll('.cassette')) el.classList.toggle('selected', el.dataset.id === sel);
  }
  async function loadRack() {
    const data = await fetch('/rack').then(r => r.ok ? r.json() : { rack: [] }).catch(() => ({ rack: [] }));
    if (rackEl) rackEl.innerHTML = '';
    rackIndex.clear();
    for (const item of data.rack) {
      rackIndex.set(item.id, item);
      if (!rackEl) continue;
      const el = document.createElement('button');
      el.className = `cassette kind-${item.kind}`;
      el.dataset.id = item.id;
      el.innerHTML = `<span class="hub"></span><span class="hub"></span>
        <b class="c-name"></b><span class="c-sum"></span><i class="c-dur"></i>`;
      el.querySelector('.c-name').textContent = item.name;
      el.querySelector('.c-sum').textContent = item.summary || '';
      el.querySelector('.c-dur').textContent = item.kind === 'live' ? '● LIVE' : fmtDur(item.seconds);
      // rule 2：只请后端选中，不在前端自持选中态
      el.addEventListener('click', () => { if (!controlsLocked) postTransport('select', { tape: item.id }); });
      rackEl.appendChild(el);
    }
    if (data.transport) applyTransport(data.transport);
  }

  // ── 控制面板（右·play/pause/eject 读后端态 rule 4） ──
  const btnPlay = document.getElementById('ctl-play'), btnEject = document.getElementById('ctl-eject'), panel = document.getElementById('control-panel');
  function updateControls(t) {
    controlsLocked = t.locked || t.phase === 'CUEING';
    panel?.setAttribute('data-phase', t.phase);
    if (btnPlay) { btnPlay.disabled = controlsLocked || t.phase === 'EMPTY'; btnPlay.dataset.state = t.phase === 'PLAYING' ? 'playing' : t.phase === 'PAUSED' ? 'paused' : 'idle'; }
    if (btnEject) btnEject.disabled = controlsLocked || t.phase === 'EMPTY';
    const dubKey = document.getElementById('dub-key');
    if (dubKey) dubKey.classList.toggle('switch-locked', controlsLocked); // rule 1：切带期录音键锁
  }
  btnPlay?.addEventListener('click', () => { if (!controlsLocked && curPhase !== 'EMPTY') postTransport(curPhase === 'PLAYING' ? 'pause' : 'play'); });
  btnEject?.addEventListener('click', () => { if (!controlsLocked && curPhase !== 'EMPTY') postTransport('eject'); });

  // 调试把手（dev；换源后取当前引用）
  window.__stage = { live, deck, counter, chart, lamps, sound: sb, transport: () => curPhase,
    get replayer() { return replayer; }, get dub() { return dub; } };

  // ── 卡片吐卡＋接线（持久，第五号手令 乙/轨乙）──
  setupCardsAndWiring({ live, getDub: () => dub, setOnSoundReady: (fn) => { onSoundReady = fn; }, hasSound: () => !!sb });

  // ── 启动：先架、后深链上机（rule 3 裸门空载） ──
  await loadRack();
  if (deepTape) postTransport('select', { tape: deepTape });
  else if (deepLive) postTransport('select', { tape: 'live' });
}

// —— 收工吐卡台面侧＋接线状态机（持久；第五号手令 乙 P0-1）——
function setupCardsAndWiring({ live, getDub, setOnSoundReady, hasSound }) {
  const cardQ = [];
  let cardBusy = false;
  const pump = async () => {
    if (cardBusy) return;
    cardBusy = true;
    try { while (cardQ.length > 0) { const sid = cardQ.shift(); const dub = getDub(); if (!dub) { cardQ.length = 0; break; } try { await dub.cutCard(sid); } catch (err) { console.warn('[card]', sid, err.message ?? err); } } }
    finally { cardBusy = false; }
  };
  const enqueue = (sid) => { if (sid && !cardQ.includes(sid) && getDub()) { cardQ.push(sid); pump(); } };
  const sweep = () => fetch('/cards/pending').then(r => (r.ok ? r.json() : { pending: [] })).then(j => (j.pending ?? []).forEach(enqueue)).catch(() => {});
  sweep(); setInterval(sweep, 15000);
  live.es?.addEventListener('card', e => { try { enqueue(JSON.parse(e.data).sid); } catch { /* 坏包 */ } });

  // 接线状态机（P0-1）：wired 为可查询态；到场自愈落针，永不作离场收据。
  let wired = false, needleRung = false;
  const ringNeedleIfReady = () => {
    if (needleRung || !wired) return;
    if (typeof window.__stage?.sound?.needleDrop !== 'function') return;
    needleRung = true; window.__stage.sound.needleDrop();
  };
  setOnSoundReady(ringNeedleIfReady);
  const markWired = () => { wired = true; dismissWireTag(); ringNeedleIfReady(); };
  live.es?.addEventListener('wired', markWired);
  fetch('/onboard/status').then(r => (r.ok ? r.json() : null)).then(st => { if (st?.wired) markWired(); else mountWireTag(st); }).catch(() => {});
}

// —— 接线签（轨乙③）——
let wireTagEl = null;
function dismissWireTag() {
  if (!wireTagEl) return;
  wireTagEl.classList.add('slip');
  setTimeout(() => { wireTagEl?.remove(); wireTagEl = null; }, 700);
  try { sessionStorage.setItem('foley-wiretag', 'dismissed'); } catch { /* 私隐 */ }
}
function mountWireTag(st) {
  if (!st || st.wired) return;
  try { if (sessionStorage.getItem('foley-wiretag') === 'dismissed') return; } catch { /* 无仓照亮 */ }
  const el = document.createElement('aside');
  el.id = 'wire-tag';
  el.innerHTML = `
    <i class="grommet"></i>
    <b>接 线 单</b>
    <ol>
      <li><em>终端跑一句</em>npx foley connect</li>
      <li><em>回 Claude Code</em>照常干活</li>
      <li><em>收工</em>机器自撕一张卡（默认脱敏）</li>
    </ol>
    <small>约 60 秒 · 点此签收起</small>`;
  el.addEventListener('click', dismissWireTag);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('hung'));
  wireTagEl = el;
}

boot().catch(err => {
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:auto 12px 12px;color:#a66;font:12px monospace;max-width:70ch;white-space:pre-wrap';
  pre.textContent = String(err);
  document.body.appendChild(pre);
});
