// 帧医生（LEDGER P0-1 验收器·?perf=1·诊断限定不入正常路径）：
// rAF 间隔账——>50ms 记长帧，滚动 60s 窗计数＋最坏帧；写角标丝印与 title（CDP/肉眼两读）。
// 机器闸阈值（起手值，船长手感终审）：60s 内长帧 ≤3、最坏 <250ms、且无"冻秒"（连续 1s 无帧）。
export function mountPerf() {
  if (!new URLSearchParams(location.search).has('perf')) return;
  const marks = [];          // [t, dur] 长帧账
  let last = performance.now(), worst = 0, frozen = 0, lastTag = 0;
  const tag = document.createElement('i');
  tag.id = 'perf-tag';
  tag.style.cssText = 'position:fixed;right:10px;bottom:8px;z-index:999;pointer-events:none;'
    + 'font:10px/1.4 ui-monospace,Menlo,monospace;color:#8F7B5A;letter-spacing:0.12em;opacity:0.85';
  document.body.appendChild(tag);
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = now - last; last = now;
    if (dt > 50) marks.push([now, dt]);
    if (dt > worst) worst = dt;
    if (dt > 1000) frozen++;                       // 冻秒：整整一秒没出过帧
    while (marks.length && marks[0][0] < now - 60000) marks.shift();
    if (now - lastTag > 500) {
      lastTag = now;
      const txt = `LONG ${marks.length}/60s · WORST ${worst | 0}ms · FROZEN ${frozen}`;
      tag.textContent = txt;
      document.title = 'PERF ' + txt;
    }
  }
  requestAnimationFrame(loop);
}
