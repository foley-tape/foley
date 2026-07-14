// demo 点火（M2.5 §B.1）：只读舞台＋内置示范带（真实 storm 蒸馏带，审计过审入页）。
// 橱窗不是车间：无 live、无 DUB、无写盘、无 HUD；唯一交互=POWER（声音的既有仪式：
// 浏览器音频本就要一次人手，开机键正是那次人手该落的地方）。
import { loadTape, Replayer, sampleAt } from './replay.js';
import { VuMeter, ChartRecorder, Lamps } from './instruments.js';
import { ReelDeck } from './deck.js';
import { mountLens } from './lens.js';
import { buildMachine } from './machine.js';
import { mountPerf } from './perf.js';
import { SoundBridge } from './soundbridge.js';
import { mountFlapBoard, mountTrackIndex } from './flapboard.js';
import { runPost, runPenSweep, postGate } from './post.js';
import { mountSelector } from './selector.js';
import { mountCounter } from './counter.js';
import { mountTower } from './tower.js';

// §9 策展令（队列1）：取景是内容决策——哪盘带、哪一幕，读 fixtures/curation.json（舞台秒，
// 与 replayer.seek 同钟）。册缺席跌落内置取景（离线场景），跌落必自白不装健康。
const FALLBACK_SCENE = { tape: 'storm', seekS: 920 };

async function boot() {
  if (document.readyState !== 'complete') {
    await new Promise(r => window.addEventListener('load', r, { once: true }));
  }
  buildMachine(document.getElementById('machine'));
  mountPerf();   // 帧医生（?perf=1·P0-1 验收器）   // decree13：机器＝场景板＋动态层（单一数据源 markup）

  let curation = null;
  try {
    const r = await fetch('fixtures/curation.json');
    if (r.ok) curation = await r.json();
  } catch { /* 网络缺席走跌落 */ }
  if (!curation?.demo) console.warn('[demo] 策展册缺席——跌落内置取景', FALLBACK_SCENE);
  const TAPE = curation?.demo?.tape ?? FALLBACK_SCENE.tape;
  const SEEK_S = curation?.demo?.seekS ?? FALLBACK_SCENE.seekS;

  const tape = await loadTape(TAPE);
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
  // 计数轮回归（渲染批·两页同法）：鼓条四轮·一只钟律吃盘转角
  const counter = mountCounter(document.getElementById('counter'), deck);
  const instruments = [vu, chart, lamps, deck, ...(counter ? [counter] : [])];
  const room0 = document.getElementById('room');
  mountTower({ tower: document.getElementById('tower'), room: room0, lipHint: document.getElementById('lip-hint'), lib: document.getElementById('lib-plate') });

  const lens = mountLens(document.getElementById('lens'), document.getElementById('machine'));   // 写者分离（同 index）
  if (lens) {
    document.getElementById('grain').style.display = 'none';   // decree13：暗角/暖调留给 CSS #vignette（恒在），lens 只叠颗粒浮尘
  }

  const room = room0;
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
  // 机器闸诊断口（?autoplay=1·不入正常路径）：无声起播＋自泵渲染＋墨账写 title。
  // ⚠️headless 虚拟时两坑（勘定 2026-07-10）：① rAF 不走——须 setInterval 自泵；
  // ② 2D canvas 后续绘制不再向合成器上屏——截图恒为 canvas 首帧，墨线只能以 getImageData 验真
  //   （scrpx==pingpx 已证 canvas 本体正确；真浏览器 rAF/上屏均正常，无此二坑）。
  if (new URLSearchParams(location.search).has('autoplay')) {
    replayer.play();
    setInterval(() => {
      const n = performance.now();
      instruments.forEach(i => i.render(n));
      let ink = 'ERR';
      try {
        const d = chart.ctx.getImageData(0, 0, chart.canvas.width, chart.canvas.height).data;
        let k = 0;
        for (let i = 0; i < d.length; i += 4) { if (d[i] - d[i + 1] > 38 && d[i] > 90) k++; }
        ink = String(k);
      } catch (e) { /* keep ERR */ }
      document.title = `dbg st=${(replayer.stageT / 1000).toFixed(1)} pos=${chart.pos.toFixed(1)} inkScreen=${ink}`;
    }, 66);
  }

  // POWER：一次人手，声画同启（总线一元论：声桥是回放总线的普通订阅者——画与声吃
  // 同一路包流，橱窗与正页同一条代码路径；唱片异步上桥，先房间层后音乐）
  const bridge = new SoundBridge({ repoKey: 'demo:' + TAPE, seed: 'demo' });
  replayer.onPacket.push(pkt => bridge.onPacket(pkt));
  replayer.onMoment.push(m => bridge.onMoment(m));
  // ② 翻字牌（两页同法）：曲名唯一显示面·onRecordChange 唯一驱动；换曲键橱窗同约
  const flap = mountFlapBoard(document.getElementById('flap-cells'));
  fetch('../sound/records/catalog.json').then((r) => r.json())
    .then((c) => mountTrackIndex(document.getElementById('track-index'), (c.records || []).map((x) => x.title)))
    .catch(() => {});
  bridge.onRecordChange = (name, userSwitch) => {
    // POST 演出期让位（两页同法）：揭幕并入幕三翻牌拍；哗啦与翻牌同刻（刀四·物理不问缘由）
    const apply = () => { bridge.solariCue?.(800); flap?.set(name, { onSettle: () => { if (userSwitch) bridge.needleDrop?.(); } }); };
    if (!postGate.defer(apply)) apply();
  };
  document.querySelector('#song-keys .np-prev')?.addEventListener('click', (e) => { e.stopPropagation(); bridge.switchRecord(-1); });
  document.querySelector('#song-keys .np-next')?.addEventListener('click', (e) => { e.stopPropagation(); bridge.switchRecord(1); });
  // ⑥ 伺服校准钮（两页同法）
  document.getElementById('servo-knob')?.addEventListener('click', (e) => { e.stopPropagation(); bridge?.servoCue?.(1.6); runPenSweep(chart); });
  const powerBtn = document.getElementById('power');
  let on = false;
  // 主功能选择器（两页同法·demo 简装）：点/拧旋钮=POWER 同义门（快拧开机·TEST 驻留归正页体验）
  const selector = mountSelector(document.getElementById('selector'), {
    sound: () => bridge,
    onQuick: () => powerBtn.click(),
    onTest: () => powerBtn.click(),
    onFinale: () => {},
  });
  powerBtn.addEventListener('click', async () => {
    if (on) return;
    on = true;
    powerBtn.setAttribute('data-on', '');
    powerBtn.textContent = 'PLAYING';
    // ⑦POST（两页同法）：POWER=开机=快拧直达 ON（选择器条动画同刻），同一场自检礼
    selector?.autoTwist();
    if (new URLSearchParams(location.search).get('post') !== '0') runPost({ vu, chart, lamps, deck, flap, sound: bridge });
    try {
      await bridge.start(sampleAt(tape, SEEK_S * 1000));
      vu.source = () => bridge.vuDb();   // ⑤ 修宪：声起之刻 VU 换粮——总线真实包络（两页同法）
    } catch (err) {
      console.warn('[demo] 声桥未起（画照走）：', err.message ?? err);
      powerBtn.textContent = 'SILENT';
    }
    replayer.play();
  });

  // —— 闸材料声轨抽头（014 乙·?audiotap=1·诊断限定不入正常路径）：master 总线末端接
  //    MediaStreamDestination→MediaRecorder(opus)，window.__gateAudioB64() 经 CDP 取走——
  //    与录屏帧合成 60s 带声闸材料；此录音即"声音回归签"（重建后声桥接点的复核疫苗）。
  if (new URLSearchParams(location.search).has('audiotap')) {
    const poll = setInterval(() => {
      const eng = bridge.engine, actx = bridge.ctx;
      if (!eng?.nodes?.master || !actx) return;
      clearInterval(poll);
      try {
        const dest = actx.createMediaStreamDestination();
        eng.nodes.master.connect(dest);                      // 抽头并联：不动原 master→destination 通路
        const mr = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
        const chunks = [];
        mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        mr.start(1000);
        window.__tapStartEpoch = Date.now();
        window.__gateAudioB64 = () => new Promise(res => {
          mr.onstop = () => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result.split(',')[1]);
            fr.readAsDataURL(new Blob(chunks, { type: 'audio/webm' }));
          };
          mr.stop();
        });
        document.title = 'TAP-ON';
      } catch (err) { document.title = 'TAP-ERR ' + (err?.message ?? err); }
    }, 200);
  }

  window.__demo = { replayer, tape, bridge, chart, deck }; // 冒烟把手
}

boot().catch(err => {
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:auto 12px 12px;color:#a66;font:12px monospace;max-width:70ch;white-space:pre-wrap';
  pre.textContent = String(err);
  document.body.appendChild(pre);
});
