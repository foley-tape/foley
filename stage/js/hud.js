// dev 抽屉（?hud=1）——调带、倍速、跳带。不是面板的一部分：数字只许活在这里。
export function mountHud(replayer, tapeName) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.innerHTML = `
    <select id="hud-tape">
      ${['storm', 'smooth', 'busy', 'jam', 'silence'].map(t =>
        `<option ${t === tapeName ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <button id="hud-play">⏯</button>
    <select id="hud-speed">
      ${[1, 2, 4, 8, 16, 32].map(s => `<option value="${s}">${s}×</option>`).join('')}
    </select>
    <input id="hud-seek" type="range" min="0" max="1000" value="0">
    <span id="hud-read"></span>`;
  document.body.appendChild(el);

  const $ = id => el.querySelector(id);
  $('#hud-tape').onchange = e => {
    const u = new URL(location.href); u.searchParams.set('tape', e.target.value); location.href = u;
  };
  $('#hud-play').onclick = () => replayer.playing ? replayer.pause() : replayer.play();
  $('#hud-speed').onchange = e => { replayer.speed = Number(e.target.value); };
  $('#hud-seek').oninput = e => replayer.seek((e.target.value / 1000) * replayer.tape.duration);

  setInterval(() => {
    if (replayer.playing) $('#hud-seek').value = Math.round((replayer.stageT / replayer.tape.duration) * 1000);
    const s = replayer.stageT / 1000;
    $('#hud-read').textContent =
      `${s.toFixed(1)}s / ${(replayer.tape.duration / 1000).toFixed(0)}s`;
  }, 250);
}
