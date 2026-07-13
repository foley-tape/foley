// 镜头法（M-S2）：动态胶片颗粒 + 暗角 + 暗场抖动，一张 shader 全包（禁逐帧撒点）；
// 另掌 <2px/s 相机慢漂移。颗粒与漂移属镜头，走真实时间。

// decree13 乙-3 镜头层：颗粒 ＋ 浮尘（暗角/暖调交给 CSS #vignette·multiply·可无 GPU 验）。
// 此 shader 走 overlay·基准 0.5 中性——只叠颗粒抖动与几粒缓漂浮尘，不与 CSS 暗角重复压暗。
const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uT;
uniform float uBp;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + uT * 61.7) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float ar = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * ar, uv.y);
  // 颗粒：~1.6px 团粒，时间驱动（暗场色带一并打散）
  float g = hash(floor(gl_FragCoord.xy / 1.6)) - 0.5;
  // 浮尘：几粒缓慢利萨茹亮点（暗房里被暖光点亮的尘·overlay>0.5 局部提亮）
  float dust = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 dp = vec2((0.5 + 0.42 * sin(uT * 0.05 + fi * 1.7)) * ar, 0.5 + 0.40 * sin(uT * 0.037 + fi * 2.3));
    dust += smoothstep(0.013, 0.0, length(p - dp)) * (0.09 + 0.09 * sin(uT * 0.6 + fi));
  }
  gl_FragColor = vec4(vec3(0.5 + g * 0.035 + dust), 1.0);
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
  let interval = 66;        // P0-1③：常态 15fps；深睡 2fps（体温法——睡着的机器不该发热）
  function frame(now) {
    requestAnimationFrame(frame);
    // 体温法＋P0-1③：镜头 15fps——颗粒更"格"更胶片；全幅 overlay 混合每帧都是真 GPU 钱
    if (now - lastDraw < interval) return;
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
  return { setDeep(d) { bpTarget = d ? 18 : 9; interval = d ? 500 : 66; } };
}
