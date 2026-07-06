// 舞台点火（M-S3 双模）：live 实流为默认；?tape=<name>（或 ?mode=replay）走 fixtures 回放。
import { loadTape, Replayer } from './replay.js';
import { LiveStream } from './live.js';
import { VuMeter, ChartRecorder, Lamps } from './instruments.js';
import { ReelDeck, Counter } from './deck.js';
import { mountLens } from './lens.js';
import { DubController } from './dub.js';

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
  let idleSince = null;
  // 喂包本体：dub 演出直调它（预告片的房间戏剧照走）；常规喂包经闸门（下）
  const feedRaw = (pkt, isFirst) => {
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
}

boot().catch(err => {
  // X-1（NIGHT-2）：错误经 textContent 落地，不再 insertAdjacentHTML 拼串——
  // ?tape= 注入的 `<img src=x onerror=…>` 只作纯文本显示，不进 DOM 解析，XSS sink 根治。
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:auto 12px 12px;color:#a66;font:12px monospace;max-width:70ch;white-space:pre-wrap';
  pre.textContent = String(err);
  document.body.appendChild(pre);
});
