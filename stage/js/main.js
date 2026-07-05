// 舞台点火：读 fixtures → 建三件器件 → 20Hz 广播 → rAF 渲染。
import { loadTape, Replayer } from './replay.js';
import { VuMeter, ChartRecorder, Lamps } from './instruments.js';

const params = new URLSearchParams(location.search);
const tapeName = params.get('tape') || 'storm';

async function boot() {
  // 器件量尺寸前，样式必须已上身（录像上下文里曾出现先量后穿的四分之一画布）
  if (document.readyState !== 'complete') {
    await new Promise(r => window.addEventListener('load', r, { once: true }));
  }
  const tape = await loadTape(tapeName);
  const replayer = new Replayer(tape);

  const vu = new VuMeter(document.getElementById('vu-svg'));
  const chart = new ChartRecorder(document.getElementById('chart-canvas'), tape);
  const lamps = new Lamps(
    document.getElementById('amber-tube'),
    document.getElementById('emerald'),
    document.getElementById('pilot'),
  );

  const instruments = [vu, chart, lamps];
  replayer.onPacket.push((pkt, isSeek) => instruments.forEach(i => i.onPacket(pkt, isSeek)));
  replayer.onMoment.push(m => instruments.forEach(i => i.onMoment && i.onMoment(m)));

  // 渲染环（与广播环分离：广播走 20Hz 舞台网格，渲染走显示器帧率）
  function render(now) {
    instruments.forEach(i => i.render(now));
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
  window.addEventListener('resize', () => chart._resize());

  // dev 抽屉：?hud=1 才现形，不属于面板
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

  window.__stage = { replayer, tape }; // 调试把手（dev）
}

boot().catch(err => {
  document.body.insertAdjacentHTML('beforeend',
    `<pre style="position:fixed;inset:auto 12px 12px;color:#a66;font:12px monospace">${err}</pre>`);
});
