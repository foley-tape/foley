// 镜头法（M-S2）：动态胶片颗粒 + 暗角 + 暗场抖动，一张 shader 全包（禁逐帧撒点）；
// 另掌 <2px/s 相机慢漂移。颗粒与漂移属镜头，走真实时间。

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uT;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uT * 61.7) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // 颗粒：~1.6px 团粒，时间驱动（shader 噪声即抖动，暗场色带一并打散）
  float g = hash(floor(gl_FragCoord.xy / 1.6)) - 0.5;
  // 暗角：中心略偏构图重心；缓慢呼吸（暗角动化，周期 ~9s，幅 ±3%）
  float breath = 1.0 + 0.03 * sin(uT * 0.7);
  float d = distance(uv * vec2(uRes.x / uRes.y, 1.0), vec2(0.46 * uRes.x / uRes.y, 0.44)) * breath;
  float v = smoothstep(1.05, 0.42, d);
  // overlay 混合基准 0.5 为中性：暗角把基准压低，颗粒 3% 摆动
  float base = mix(0.30, 0.5, v);
  gl_FragColor = vec4(vec3(base + g * 0.035), 1.0);
}`;

const VERT = `attribute vec2 aP; void main(){ gl_Position = vec4(aP, 0.0, 1.0); }`;

export function mountLens(canvas, machineEl) {
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
  if (!gl) return false; // 回退：CSS 静态噪点/暗角继续服役

  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return false;
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aP = gl.getAttribLocation(prog, 'aP');
  gl.enableVertexAttribArray(aP);
  gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uT = gl.getUniformLocation(prog, 'uT');

  function resize() {
    canvas.width = innerWidth; canvas.height = innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  const t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    gl.uniform1f(uT, t % 3600);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 相机慢漂移：利萨茹，峰速 ≈0.9px/s（<2px/s 铁律）
    const dx = 5.5 * Math.sin((t * Math.PI * 2) / 47);
    const dy = 4.0 * Math.sin((t * Math.PI * 2) / 61 + 1.1);
    machineEl.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return true;
}
