// demo 点火（M2.5 §B.1）：只读舞台＋内置示范带（真实 storm 蒸馏带，审计过审入页）。
// 橱窗不是车间：无 live、无 DUB、无写盘、无 HUD；唯一交互=POWER（声音的既有仪式：
// 浏览器音频本就要一次人手，开机键正是那次人手该落的地方）。
import { loadTape, Replayer, sampleAt } from './replay.js';
import { VuMeter, ChartRecorder, Lamps } from './instruments.js';
import { ReelDeck, Counter } from './deck.js';
import { mountLens } from './lens.js';
import { SoundBridge } from './soundbridge.js';

const SEEK_S = 920; // 默认取景：风暴前奏——24s 后即 944s 跳针簇，随后高原（demo 的一幕戏）

async function boot() {
  if (document.readyState !== 'complete') {
    await new Promise(r => window.addEventListener('load', r, { once: true }));
  }
  const tape = await loadTape('storm');
  const replayer = new Replayer(tape);

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

  const lens = mountLens(document.getElementById('lens'), document.getElementById('machine'));
  if (lens) {
    document.getElementById('grain').style.display = 'none';
    document.getElementById('vignette').style.display = 'none';
  }

  const room = document.getElementById('room');
  const feed = (pkt, isFirst) => {
    room.dataset.phase = pkt.phase;
    room.dataset.weather = pkt.weather;
    instruments.forEach(i => i.onPacket(pkt, isFirst));
  };
  replayer.onPacket.push(feed);
  replayer.onMoment.push(m => instruments.forEach(i => i.onMoment && i.onMoment(m)));

  let lastRender = -Infinity;
  function render(now) {
    requestAnimationFrame(render);
    if (now - lastRender < 33) return;
    lastRender = now;
    instruments.forEach(i => i.render(now));
  }
  requestAnimationFrame(render);
  window.addEventListener('resize', () => chart._resize());

  replayer.seek(SEEK_S * 1000); // 停机取景：先上一包，机器带妆待命

  // POWER：一次人手，声画同启（总线一元论：声桥是回放总线的普通订阅者——画与声吃
  // 同一路包流，橱窗与正页同一条代码路径；唱片异步上桥，先房间层后音乐）
  const bridge = new SoundBridge({ repoKey: 'demo:storm', seed: 'demo' });
  replayer.onPacket.push(pkt => bridge.onPacket(pkt));
  replayer.onMoment.push(m => bridge.onMoment(m));
  const powerBtn = document.getElementById('power');
  let on = false;
  powerBtn.addEventListener('click', async () => {
    if (on) return;
    on = true;
    powerBtn.setAttribute('data-on', '');
    powerBtn.textContent = 'PLAYING';
    try {
      await bridge.start(sampleAt(tape, SEEK_S * 1000));
    } catch (err) {
      console.warn('[demo] 声桥未起（画照走）：', err.message ?? err);
      powerBtn.textContent = 'SILENT';
    }
    replayer.play();
  });

  window.__demo = { replayer, tape, bridge, chart, deck }; // 冒烟把手
}

boot().catch(err => {
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:auto 12px 12px;color:#a66;font:12px monospace;max-width:70ch;white-space:pre-wrap';
  pre.textContent = String(err);
  document.body.appendChild(pre);
});
