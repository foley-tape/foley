// 舞台点火（M-S3 双模）：live 实流为默认；?tape=<name>（或 ?mode=replay）走 fixtures 回放。
import { loadTape, Replayer } from './replay.js';
import { LiveStream } from './live.js';
import { VuMeter, ChartRecorder, Lamps } from './instruments.js';
import { ReelDeck, Counter } from './deck.js';
import { mountLens } from './lens.js';
import { DubController } from './dub.js';
import { SoundBridge } from './soundbridge.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || (params.get('tape') ? 'replay' : 'live');
// §0.6.① URL 参数白名单：tapeName 流入 fetch(`fixtures/${name}…`) 与错误串，只许标识符/日期字符（防路径穿越与注入源）
const tapeName = ((params.get('tape') || 'storm').replace(/[^\w-]/g, '')) || 'storm';

async function boot() {
  // 器件量尺寸前，样式必须已上身（录像上下文里曾出现先量后穿的四分之一画布）
  if (document.readyState !== 'complete') {
    await new Promise(r => window.addEventListener('load', r, { once: true }));
  }
  // live 没有拼接与前史：给走纸一张白骨架
  const tape = mode === 'live' ? { splices: [], moments: [], duration: Infinity } : await loadTape(tapeName);
  const replayer = mode === 'live' ? null : new Replayer(tape);

  const vu = new VuMeter(document.getElementById('vu-svg'));
  const chart = new ChartRecorder(document.getElementById('chart-canvas'), tape);
  const lamps = new Lamps(
    document.getElementById('amber-tube'),
    document.getElementById('emerald'),
    document.getElementById('pilot'),
  );
  const deck = new ReelDeck(
    document.getElementById('reel-l'),
    document.getElementById('reel-r'),
    document.getElementById('tapeband'),
  );
  const counter = new Counter(
    document.getElementById('counter-housing'),
    document.getElementById('loupe'),
    deck,
  );

  const instruments = [vu, chart, lamps, deck, counter];

  // 镜头法：WebGL 颗粒/暗角/漂移上岗则撤下 CSS 静态替身
  const lens = mountLens(document.getElementById('lens'), document.getElementById('machine'));
  if (lens) {
    document.getElementById('grain').style.display = 'none';
    document.getElementById('vignette').style.display = 'none';
  }

  // room 按 phase/weather 着装；IDLE 连续 5min 入深睡，唤醒钨丝速。
  // 深睡归灯族，走真实时间（M2.2 §1）：睡意是机器对房间的陈述，不是带子的内容——
  // 回放倍速下机器不陪着快进打盹。
  const room = document.getElementById('room');
  // 首光·PLAY 呼吸示能（第五号手令 丁-E1／丙.3）：手势前唯一亮起；首个手势即房间醒（声＋光同醒），示能退场。
  window.addEventListener('pointerdown', () => {
    room.classList.remove('pre-gesture');
    document.getElementById('play-cue')?.classList.add('gone');
  }, { once: true });
  let idleSince = null;
  let lastPktSeen = null; // 声桥手势晚到时的起点状态（开机即从真态起，不等下一包）
  // 喂包本体：dub 演出直调它（预告片的房间戏剧照走）；常规喂包经闸门（下）
  const feedRaw = (pkt, isFirst) => {
    lastPktSeen = pkt;
    room.dataset.phase = pkt.phase;
    room.dataset.weather = pkt.weather;
    if (pkt.phase === 'IDLE') {
      if (idleSince === null) idleSince = performance.now();
      const deep = performance.now() - idleSince >= 300000;
      if (deep !== (room.dataset.sleep === 'deep')) {
        if (deep) room.dataset.sleep = 'deep'; else delete room.dataset.sleep;
        if (lens) lens.setDeep(deep);
      }
    } else if (idleSince !== null) {
      idleSince = null;
      delete room.dataset.sleep;
      if (lens) lens.setDeep(false);
    }
    instruments.forEach(i => i.onPacket(pkt, isFirst));
  };
  const feedMomentRaw = m => instruments.forEach(i => i.onMoment && i.onMoment(m));
  // dub 演出期间真流入闸：state 包取末态即可（恢复时接 lastPkt），
  // moments 有状态语义（卡碟/脱卡），欠着记账、恢复时按序补喂
  let dub = null;
  const feedPacket = (pkt, isFirst) => { if (dub?.eats()) return; feedRaw(pkt, isFirst); };
  const feedMoment = m => { if (dub?.eats()) { dub.noteMoment(m); return; } feedMomentRaw(m); };

  // 渲染环（与广播分离：广播走 20Hz 包流，渲染 30fps 封顶——
  // 体温法：数据 20Hz，渲染 60fps 是虚火；30fps 下重建照样平滑，恒迟不变）
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

  let live = null;
  if (mode === 'live') {
    live = new LiveStream();
    live.onPacket.push(feedPacket);
    live.onMoment.push(feedMoment);
    live.connect();          // 先订流（缓冲）
    await live.prime();      // 再吃今晨的纸
    live.flushBuffer();      // 水位去重后接实时
  } else {
    replayer.onPacket.push(feedPacket);
    replayer.onMoment.push(feedMoment);
    // 丙.2：转台开停→唱片随带停／续播（房间常在，只停唱片）。DUB 自管音景期间（eats）不插手，
    // 避免与 DUB 演出双动——单一引擎的档位切换由此一处收口。
    replayer.onPlayState = (playing) => {
      if (dub?.eats()) return;
      const s = window.__stage?.sound;
      if (playing) s?.resume?.(); else s?.pause?.();
    };
    // dev 抽屉：?hud=1 才现形，不属于面板；只属回放
    if (params.get('hud') === '1') {
      const { mountHud } = await import('./hud.js');
      mountHud(replayer, tapeName);
    }
    const seek = Number(params.get('seek') || 0);
    if (seek > 0) replayer.seek(seek * 1000);
    const speed = Number(params.get('speed') || 1);
    if (speed > 0) replayer.speed = speed;
    if (params.get('paused') !== '1') replayer.play();
    else replayer.seek(replayer.stageT); // 停机取景也要先上一包
  }

  // 声桥（轨甲·总线一元论，G8 开箱有声沿革升级）：live 与回放共用同一次 pointerdown 开机仪式
  // （浏览器手势律），桥作为总线普通订阅者 push 进 instruments——与画面平级吃同一路 feedRaw，
  // 对模式全盲；回放=磁带喂同一根总线，live=实流喂同一根总线（静音病结构性根除，RECON B3 销案）。
  // 自带诚实退路（唱片缺→房间层，织体缺→合成）；?sound=0 关。
  // 存在层无条件（第五号手令 乙·不变量二）：手势之后房间层呼吸，零条件于接线/遥测——
  // 声桥起床不问 wired。onSoundReady 供接线状态机在声桥就绪后补落针（见下）。
  let onSoundReady = null;
  if (params.get('sound') !== '0') {
    let sb = null;
    window.addEventListener('pointerdown', () => {
      if (sb) return;   // 丙.1 单一传动律：每页面单引擎实例——PLAY／暂停／DUB 是同一状态机上的档位，永不二次实例化音频图
      sb = new SoundBridge({ repoKey: mode === 'live' ? 'live:default' : `demo:${tapeName}`, seed: mode });
      const born = sb;
      instruments.push(sb);
      sb.start(lastPktSeen).then(() => {
        if (window.__stage) window.__stage.sound = born;
        onSoundReady?.();   // 到场即已接线的页面：声桥就绪即补入场落针（自愈）
      })
        .catch((err) => {
          instruments.splice(instruments.indexOf(born), 1);
          sb = null;
          console.warn('[sound] 声桥未起（视觉照走，下次点击再试）：', err);
        });
    });
  }

  // DUB 剪辑机构（M-T1）：预览与导出同吃 cuts 时刻表；机器提议，人来撕
  dub = new DubController({
    mode, tapeName, tape, replayer, live, chart, deck,
    feed: feedRaw, feedMoment: feedMomentRaw,
    keyEl: document.getElementById('dub-key'),
    tabsEl: document.getElementById('dub-lengths'),
    overlayEl: document.getElementById('dub-overlay'),
    chartCanvas: document.getElementById('chart-canvas'),
    railEl: document.getElementById('walnut-rail'),
  });

  window.__stage = { mode, replayer, live, tape, deck, counter, chart, lamps, dub }; // 调试把手（dev）

  // 收工吐卡的台面侧（轨乙①）：serve 尾随 spool 备好纸（SSE 'card' 通告），台上这台机器负责撕卡；
  // 开机先清欠账（/cards/pending——上一班收工时若没人开着页面，卡在这里补撕）。逐张串行，台上有戏不抢。
  if (mode === 'live' && params.get('cards') !== '0') {
    const cardQ = [];
    let cardBusy = false;
    const pump = async () => {
      if (cardBusy) return;
      cardBusy = true;
      try {
        while (cardQ.length > 0) {
          const sid = cardQ.shift();
          try { await dub.cutCard(sid); } catch (err) { console.warn('[card]', sid, err.message ?? err); }
        }
      } finally { cardBusy = false; }
    };
    const enqueue = (sid) => { if (sid && !cardQ.includes(sid)) { cardQ.push(sid); pump(); } };
    const sweep = () => fetch('/cards/pending').then(r => (r.ok ? r.json() : { pending: [] }))
      .then(j => (j.pending ?? []).forEach(enqueue)).catch(() => { /* 无卡房＝无欠账 */ });
    sweep();
    // SSE 与轮询双保险：live 子进程歇着时（新机器无会话）/live 503、SSE 断粮，
    // 且开机那次清账可能跑在备纸（蒸馏+回放）完成之前——15s 扫一遍工单兜底
    setInterval(sweep, 15000);
    live.es?.addEventListener('card', e => { try { enqueue(JSON.parse(e.data).sid); } catch { /* 坏包不撕 */ } });

    // —— 接线状态机（第五号手令 乙·P0-1 接线倒置修）——
    // wired 是**可查询状态**、不是一次性事件：页面加载即自查 /onboard/status（钩子在位＝已接线）自行推导；
    // SSE 'wired' 仅作会话中途 connect 的后续更新。到场即已接线／错过广播的迟到页面据此自愈——
    // 入场仪式（撤接线签＋一声落针宣告）不再是"恰好开着页面时那次广播"的俘虏，也永不沦为离场收据。
    // 落针需音频钟（手势后声桥才起）：判定接线后若声桥未起，交 onSoundReady 回调补落（见上）。
    let wired = false, needleRung = false;
    const ringNeedleIfReady = () => {
      if (needleRung || !wired) return;
      if (typeof window.__stage?.sound?.needleDrop !== 'function') return; // 声桥未起：手势 resolve 后回调再试
      needleRung = true;
      window.__stage.sound.needleDrop();
    };
    onSoundReady = ringNeedleIfReady;                  // 声桥起来即补落针（若已判定接线）
    const markWired = () => { wired = true; dismissWireTag(); ringNeedleIfReady(); };
    live.es?.addEventListener('wired', markWired);     // 会话中途 connect：撤签＋落针（页面此刻开着才收到）
    // 到场自愈：加载查一次状态。已接线→入场仪式；未接线→亮接线单（SSE 后续接线再自愈）。
    fetch('/onboard/status').then(r => (r.ok ? r.json() : null)).then(st => {
      if (st?.wired) markWired();
      else mountWireTag(st);
    }).catch(() => { /* 状态取不到：诚实沉默，不亮签不落针 */ });
  }
}

// —— 接线签（轨乙③）：空转仪表盘的 60 秒接线向导 ——
// 器件法自查：面板照旧无字——说明字住在一张挂在胡桃木台沿的牛皮吊签上（纸可以有字，纸条的 FOLEY 边字同源）。
// live 且未接线才亮；点一下签收起（本次会话不再亮）；接线自证（SSE wired）到站即退场。
let wireTagEl = null;
function dismissWireTag() {
  if (!wireTagEl) return;
  wireTagEl.classList.add('slip');
  setTimeout(() => { wireTagEl?.remove(); wireTagEl = null; }, 700);
  try { sessionStorage.setItem('foley-wiretag', 'dismissed'); } catch { /* 私隐模式无仓 */ }
}
function mountWireTag(st) {
  if (!st || st.wired) return;   // 状态取不到不亮签；已接线不亮（到场自愈走落针，不走签）
  try {
    if (sessionStorage.getItem('foley-wiretag') === 'dismissed') return;
  } catch { /* 无仓照亮 */ }
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
  // X-1（NIGHT-2）：错误经 textContent 落地，不再 insertAdjacentHTML 拼串——
  // ?tape= 注入的 `<img src=x onerror=…>` 只作纯文本显示，不进 DOM 解析，XSS sink 根治。
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:auto 12px 12px;color:#a66;font:12px monospace;max-width:70ch;white-space:pre-wrap';
  pre.textContent = String(err);
  document.body.appendChild(pre);
});
