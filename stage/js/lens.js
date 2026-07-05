// 镜头法（M-S2）：动态胶片颗粒 + 暗角 + 暗场抖动，一张 shader 全包（禁逐帧撒点）；
// 另掌 <2px/s 相机慢漂移。颗粒与漂移属镜头，走真实时间。

const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uT;
uniform float uBp; // 暗角呼吸周期（秒）；深睡时放慢（M2.1 §1.5）

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uT * 61.7) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // 颗粒：~1.6px 团粒，时间驱动（shader 噪声即抖动，暗场色带一并打散）
  float g = hash(floor(gl_FragCoord.xy / 1.6)) - 0.5;
  // 暗角：中心略偏构图重心；缓慢呼吸（暗角动化，幅 ±3%，周期 uBp）
  float breath = 1.0 + 0.03 * sin(uT * 6.2832 / uBp);
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
  const uBp = gl.getUniformLocation(prog, 'uBp');

  function resize() {
    // 体温法：半分辨率渲染、CSS 放大——frag 省四倍；颗粒随之变粗一档，
    // 反而更贴 3% 胶片粒的本意（镜头不该比机器锐利）
    canvas.width = Math.ceil(innerWidth / 2); canvas.height = Math.ceil(innerHeight / 2);
    canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  const t0 = performance.now();
  let lastDraw = -Infinity;
  let bp = 9, bpTarget = 9; // 呼吸周期：常态 9s，深睡 18s（缓慢过渡）
  function frame(now) {
    requestAnimationFrame(frame);
    // 体温法：镜头 30fps 封顶——胶片本来就是每秒二十几格的艺术
    if (now - lastDraw < 33) return;
    lastDraw = now;
    const t = (now - t0) / 1000;
    bp += (bpTarget - bp) * 0.01;
    gl.uniform1f(uT, t % 3600);
    gl.uniform1f(uBp, bp);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 相机慢漂移：利萨茹，峰速 ≈0.9px/s（<2px/s 铁律）
    const dx = 5.5 * Math.sin((t * Math.PI * 2) / 47);
    const dy = 4.0 * Math.sin((t * Math.PI * 2) / 61 + 1.1);
    machineEl.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
  }
  requestAnimationFrame(frame);
  return { setDeep(d) { bpTarget = d ? 18 : 9; } };
}
