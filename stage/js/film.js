// 复制机（M-T2）：离线逐帧渲染管线 → WebCodecs AVC → MP4（VP9/WebM 兜底）。
//
// 同源纪律（铁律③）：物理与调度全部来自 DubSchedule ＋ 与台上完全相同的器件类
// （ChartRecorder / ReelDeck / Lamps / PacketPair）跑在一个隐藏件台（#film-rig）上——
// 胶印是同一场演出的另一种消费者，不是第二台机器。画面合成只做"把 DOM 的定妆
// 搬进画布"：静态机身一次性制版（foreignObject 矢量栅格），动态件（纸/针/轴/灯）
// 逐帧按台上同一套状态重画。
//
// 已知陷阱注记（设计案 §3 命令入注）：凡从 GPU 合成器取帧（WebGL 画布、DOM 截图类
// captureStream/getDisplayMedia），必须在渲染后等一次 rAF 再捕帧——GPU 合成完成前
// 取帧会得到陈旧缓冲。本管线的帧源是 CPU 侧 2D 合成（chart 位图 drawImage＋矢量重画），
// 不经 GPU 回读，无此陷阱；若未来把 WebGL 镜头层接进帧源，先 await rAF 再捕。
//
// 确定性诚实条款：cuts 与逐帧调度严格确定（虚拟钟步进、恒迟重建同 law）；像素因
// 字体/合成器栅格差异不保证跨机逐字节一致——如实标注，不伪称帧哈希确定性。
// 隐私：帧内只有器件读数与墨迹，永无会话文本。
import { PACKET_MS } from './replay.js';
import { ChartRecorder, PacketPair, Lamps } from './instruments.js';
import { ReelDeck } from './deck.js';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from '../vendor/mp4-muxer.mjs';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from '../vendor/webm-muxer.mjs';

const FPS = 30;
const FRAME_MS = 1000 / FPS;

// 介质预设（设计案 §3：动态颗粒吃码率，宁高勿糊）
export const PRESETS = {
  '1080p30': { w: 1920, h: 1080, bitrate: 12_000_000 },
  '720p30': { w: 1280, h: 720, bitrate: 6_000_000 },
};

// 天气/睡姿灯档（stage.css 同数——布景光的画布形）
const W_DIM = { CLEAR: [1, 0], OVERCAST: [0.92, 0.14], RAIN: [0.82, 0.30], STORM: [0.70, 0.46] };

const svgImage = (svgText, w, h) => new Promise((res, rej) => {
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = rej;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgText}</svg>`)}`;
});

// 机身系坐标：与 #machine 客户矩形做差——两者共享同一个漂移 transform，差值即无漂移
// 的机身内坐标（offset 家族对 SVG 元素不存在，此法对 HTML/SVG 一视同仁）。
function rectOf(el, root) {
  const b = el.getBoundingClientRect(), m = root.getBoundingClientRect();
  return { x: b.left - m.left, y: b.top - m.top, w: b.width, h: b.height };
}

export class FilmPrinter {
  constructor() {
    this.machine = document.getElementById('machine');
    this.room = document.getElementById('room');
  }

  // ———————————————————————— 编码器探测（§3 兜底链） ————————————————————————
  async probe(preset) {
    if (typeof VideoEncoder === 'undefined') return { kind: 'none', note: 'WebCodecs 缺席：本浏览器只出纸条' };
    const avc = {
      codec: 'avc1.4d0034', width: preset.w, height: preset.h,
      bitrate: preset.bitrate, framerate: FPS,
    };
    try {
      if ((await VideoEncoder.isConfigSupported(avc)).supported) return { kind: 'avc', config: avc };
    } catch { /* 探测即兜底 */ }
    const vp9 = { ...avc, codec: 'vp09.00.10.08' };
    try {
      if ((await VideoEncoder.isConfigSupported(vp9)).supported) return { kind: 'vp9', config: vp9 };
    } catch { /* 落到 none */ }
    return { kind: 'none', note: 'AVC/VP9 编码器皆缺席' };
  }

  // ———————————————————————— 件台：与台上同一套器件类 ————————————————————————
  _buildRig(srcTape) {
    const rig = document.createElement('div');
    rig.id = 'film-rig';
    // visibility:hidden（非 display:none）：布局照走，getBoundingClientRect 有尺寸
    rig.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;z-index:-1;';
    const cv = document.createElement('canvas');
    cv.style.cssText = 'width:560px;height:252px;display:block;';
    rig.appendChild(cv);
    const reelL = document.createElement('div'); reelL.style.cssText = 'width:300px;height:300px;';
    const reelR = document.createElement('div'); reelR.style.cssText = 'width:300px;height:300px;';
    const band = document.createElement('div');
    const tube = document.createElement('i'); const emerald = document.createElement('i'); const pilot = document.createElement('i');
    rig.append(reelL, reelR, band, tube, emerald, pilot);
    document.body.appendChild(rig);

    // dub 的纸轴上没有源接带（拼接在段界由 markSeam 亲手打），故给白骨架
    const chart = new ChartRecorder(cv, { splices: [], moments: [], duration: Infinity });
    const deck = new ReelDeck(reelL, reelR, band);
    const lamps = new Lamps(tube, emerald, pilot);
    lamps.lastNow = 0; // 虚拟钟从 0 起
    const pairN = new PacketPair(); // 针值重建（VU 的读数心脏；画针由合成器执笔）
    return { rig, chart, deck, lamps, pairN, tube, emerald, pilot, reelL, reelR };
  }

  // ———————————————————————— 制版：静态机身一次性矢量栅格 ————————————————————————
  // k＝合成像素尺（outH/innerHeight）：制版期一次栅到位图，逐帧只做位图搬运——
  // SVG Image 每次 drawImage 都重走矢量光栅，逐帧矢量＝百毫秒级的隐性刑期（实测教训）。
  async _buildPlates(k = 1) {
    const M = this.machine;
    const mRect = { x: M.offsetLeft, y: M.offsetTop, w: M.offsetWidth, h: M.offsetHeight };
    const css = await fetch('css/stage.css').then(r => r.text());
    const clone = M.cloneNode(true);
    // 动态件出版面——只藏画、不拆骨：remove 会塌缩布局（bezel 压成饼、flex 兄弟挪位，
    // 版面与实机坐标就此分家——M-T2 首印的两枚"暗药丸"教训）；visibility 保盒不保画。
    clone.querySelectorAll('.reel svg, #vu-svg, #loupe, #dub-overlay, #dub-strip-rest').forEach(el => { el.style.visibility = 'hidden'; });
    clone.querySelectorAll('#amber-tube, .gem').forEach(el => el.style.setProperty('--lit', '0'));
    clone.style.transform = 'none';
    clone.style.left = `${mRect.x}px`; clone.style.top = `${mRect.y}px`; clone.style.width = `${mRect.w}px`;
    const vw = window.innerWidth, vh = window.innerHeight;
    const html = `<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${vw}px;height:${vh}px;position:relative"><style>${css}</style>${clone.outerHTML}</div></foreignObject>`;
    const plate = await svgImage(html, vw, vh);

    // VU 三明治：底（背光＋刻度＋字）→ 针（合成器执笔）→ 面（玻璃两片）——与 DOM 同序
    const vuSvg = document.getElementById('vu-svg');
    const vuRect = rectOf(vuSvg, M);
    const under = vuSvg.cloneNode(true);
    under.querySelector('#needle-group')?.remove();
    [...under.querySelectorAll('rect')].slice(-2).forEach(r => r.remove()); // 玻璃两片留给面层
    // 面层只留 defs＋最后两片玻璃 rect（与 DOM 同序：针在玻璃下）
    const over = vuSvg.cloneNode(true);
    [...over.children].forEach(ch => {
      if (ch.tagName === 'defs') return;
      over.removeChild(ch);
    });
    const glassRects = [...vuSvg.querySelectorAll(':scope > rect')].slice(-2);
    for (const g of glassRects) over.appendChild(g.cloneNode(true));
    const vuUnderImg = await svgImage(under.innerHTML, 300, 200);
    const vuOverImg = await svgImage(over.innerHTML, 300, 200);

    // 轴盘整只矢量件（磁带饼随转——径向渐变的微移即带饼真转）
    const reelImgsRaw = [];
    for (const id of ['reel-l', 'reel-r']) {
      const svg = document.querySelector(`#${id} svg`);
      reelImgsRaw.push(await svgImage(svg.innerHTML, 300, 300));
    }

    // 一次性栅格化（k 尺）：合成环里 ctx 已带 k 变换，位图按 CSS 尺寸绘即净得 1:1 设备像素
    const rast = (img, w, h) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c;
    };
    return {
      plate: rast(plate, vw, vh),
      vuUnder: rast(vuUnderImg, vuRect.w, vuRect.h),
      vuOver: rast(vuOverImg, vuRect.w, vuRect.h),
      reelImgs: reelImgsRaw.map(im => rast(im, 300, 300)),
      mRect, vuRect,
    };
  }

  // ———————————————————————— 帧合成 ————————————————————————
  _makeGrainTile() {
    const g = document.createElement('canvas'); g.width = 224; g.height = 224;
    const gc = g.getContext('2d');
    const im = gc.createImageData(224, 224);
    for (let i = 0; i < im.data.length; i += 4) {
      const v = 108 + (Math.random() * 76 | 0); // 均值 ~128 的窄幅噪声（overlay 中性点）
      im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255;
    }
    gc.putImageData(im, 0, 0);
    return g;
  }

  _composeFrame(ctx, S, tau) {
    const { rigR, plates, geo, env } = S;
    const { w, h, scale, offX } = geo;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#060402'; ctx.fillRect(0, 0, w, h);
    ctx.setTransform(scale, 0, 0, scale, offX, 0);
    const vw = window.innerWidth, vh = window.innerHeight;

    // 画外那盏灯（布景层：基层＋暖层；天气骑在光上，只压暗）
    const dim = env.wDim * env.idleDim, warm = env.wWarm * env.idleDim;
    let kg = ctx.createRadialGradient(vw * 0.06, -vh * 0.10, 0, vw * 0.06, -vh * 0.10, vw * 0.72);
    kg.addColorStop(0, `rgba(255,200,124,${0.22 * dim})`);
    kg.addColorStop(0.36, `rgba(255,176,90,${0.07 * dim})`);
    kg.addColorStop(0.62, 'rgba(255,176,90,0)');
    ctx.fillStyle = kg; ctx.fillRect(-offX / scale, 0, vw + (2 * offX) / scale + (geo.padR ?? 0), vh);
    kg = ctx.createRadialGradient(vw * 0.06, -vh * 0.10, 0, vw * 0.06, -vh * 0.10, vw * 0.68);
    kg.addColorStop(0, `rgba(255,148,72,${0.10 * warm})`);
    kg.addColorStop(0.34, `rgba(255,120,50,${0.04 * warm})`);
    kg.addColorStop(0.60, 'rgba(255,120,50,0)');
    ctx.fillStyle = kg; ctx.fillRect(-offX / scale, 0, vw + (2 * offX) / scale, vh);

    const { mRect, vuRect } = plates;
    const chartR = S.chartRect;

    // 机身版先落（canvas 在版里是透明洞，洞下露的是 bezel 自己的暗底——
    // M-T2 首印"走纸窗全黑"教训：纸必须印在版上，烟玻璃再复描回来）
    ctx.drawImage(plates.plate, 0, 0, vw, vh);

    // 纸位图印进窗，纸槽阴影＋烟玻璃两层复描（stage.css 同数）
    const cx0 = mRect.x + chartR.x, cy0 = mRect.y + chartR.y;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx0, cy0, chartR.w, chartR.h, 6);
    ctx.clip();
    ctx.drawImage(S.rig.chart.canvas, cx0, cy0, chartR.w, chartR.h);
    let sg = ctx.createLinearGradient(0, cy0, 0, cy0 + chartR.h); // .paper-shade
    sg.addColorStop(0, 'rgba(20,12,6,0.35)'); sg.addColorStop(0.12, 'rgba(20,12,6,0)');
    sg.addColorStop(0.88, 'rgba(20,12,6,0)'); sg.addColorStop(1, 'rgba(20,12,6,0.4)');
    ctx.fillStyle = sg; ctx.fillRect(cx0, cy0, chartR.w, chartR.h);
    sg = ctx.createLinearGradient(cx0, cy0, cx0 + chartR.w, cy0 + chartR.h); // .glass 斜层
    sg.addColorStop(0, 'rgba(255,246,226,0.09)'); sg.addColorStop(0.22, 'rgba(255,246,226,0.02)');
    sg.addColorStop(0.42, 'rgba(0,0,0,0)'); sg.addColorStop(0.78, 'rgba(12,8,4,0.14)'); sg.addColorStop(1, 'rgba(12,8,4,0.30)');
    ctx.fillStyle = sg; ctx.fillRect(cx0, cy0, chartR.w, chartR.h);
    ctx.fillStyle = 'rgba(14,9,4,0.13)'; ctx.fillRect(cx0, cy0, chartR.w, chartR.h); // .glass 压烟层
    ctx.restore();

    // 轴：与台上 render 同一套数（theta/wobble 由 ReelDeck 亲算，此处读回执笔）
    for (let i = 0; i < 2; i++) {
      const el = i === 0 ? S.rig.reelL : S.rig.reelR;
      const r = S.rig.deck.reels[i];
      const wob = (S.rig.deck.wow || 0) * 1.6;
      const wx = wob * Math.cos(r.theta * 1.7), wy = wob * Math.sin(r.theta * 2.3);
      const rr = S.reelRects[i];
      ctx.save();
      ctx.translate(mRect.x + rr.x + 150 + wx, mRect.y + rr.y + 150 + wy);
      ctx.rotate(r.theta); // 与台上 render 同式（deg = theta·180/π 的弧度原值）
      ctx.drawImage(plates.reelImgs[i], -150, -150, 300, 300);
      ctx.restore();
    }
    // 带面微颤
    const bandR = S.bandRect;
    ctx.globalAlpha = Math.max(0, 0.9 - (S.rig.deck.wow || 0) * 0.25);
    const bg2 = ctx.createLinearGradient(0, mRect.y + bandR.y, 0, mRect.y + bandR.y + 3);
    bg2.addColorStop(0, '#241812'); bg2.addColorStop(1, '#0F0A06');
    ctx.fillStyle = bg2;
    ctx.fillRect(mRect.x + bandR.x, mRect.y + bandR.y, bandR.w, 3);
    ctx.globalAlpha = 1;

    // VU 三明治：底 → 针 → 玻璃
    const vx = mRect.x + vuRect.x, vy = mRect.y + vuRect.y;
    const sx = vuRect.w / 300, sy = vuRect.h / 200;
    ctx.drawImage(plates.vuUnder, vx, vy, vuRect.w, vuRect.h);
    const nv = Math.max(0, Math.min(1, S.rig.pairN.value('needle', tau)));
    ctx.save();
    ctx.translate(vx, vy); ctx.scale(sx, sy);
    ctx.translate(150, 168); ctx.rotate(((-47 + nv * 94) * Math.PI) / 180);
    ctx.fillStyle = '#241A10';
    ctx.beginPath(); ctx.moveTo(-1.5, 0); ctx.lineTo(0, -122); ctx.lineTo(1.5, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5A4A34'; ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.drawImage(plates.vuOver, vx, vy, vuRect.w, vuRect.h);

    // 灯：琥珀管（钨丝包络读台上同类的 --lit）＋双宝石
    const lit = parseFloat(S.rig.tube.style.getPropertyValue('--lit')) || 0;
    if (lit > 0.004) {
      const tr = S.tubeRect;
      const cx = mRect.x + tr.x + tr.w / 2, cy = mRect.y + tr.y + tr.h * 0.55;
      let ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, tr.h * 0.62);
      ag.addColorStop(0, `rgba(255,206,85,${0.95 * lit})`);
      ag.addColorStop(0.45, `rgba(255,176,0,${0.85 * lit})`);
      ag.addColorStop(1, 'rgba(179,111,0,0)');
      ctx.save();
      ctx.beginPath(); ctx.roundRect(mRect.x + tr.x + 3, mRect.y + tr.y + 4, tr.w - 6, tr.h - 8, 10);
      ctx.clip(); ctx.fillStyle = ag; ctx.fillRect(cx - tr.w, cy - tr.h, tr.w * 2, tr.h * 2);
      ctx.restore();
      ag = ctx.createRadialGradient(cx, cy, 0, cx, cy, tr.h * 0.9); // 体内光外溢
      ag.addColorStop(0, `rgba(255,176,0,${0.5 * lit})`);
      ag.addColorStop(0.7, 'rgba(255,176,0,0)');
      ctx.fillStyle = ag; ctx.fillRect(cx - tr.w * 3, cy - tr.h, tr.w * 6, tr.h * 2);
    }
    for (const [el, rect, tone] of [
      [S.rig.emerald, S.emRect, ['168,223,160', '79,140,74']],
      [S.rig.pilot, S.piRect, ['255,247,226', '242,230,204']],
    ]) {
      const g = parseFloat(el.style.getPropertyValue('--lit')) || 0;
      if (g < 0.004) continue;
      const cx = mRect.x + rect.x + rect.w / 2, cy = mRect.y + rect.y + rect.h / 2;
      const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 11);
      gg.addColorStop(0, `rgba(${tone[0]},${0.9 * g})`);
      gg.addColorStop(0.35, `rgba(${tone[1]},${0.7 * g})`);
      gg.addColorStop(1, `rgba(${tone[1]},0)`);
      ctx.fillStyle = gg;
      ctx.fillRect(cx - 12, cy - 12, 24, 24);
    }

    // 暗角（布景静态）＋颗粒（镜头动态＝预生成粒池轮转；GIF 走静态单帧化法）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = S.vignettePat ?? (S.vignettePat = (() => {
      const vg = ctx.createRadialGradient(w * 0.44, h * 0.40, Math.min(w, h) * 0.42, w * 0.44, h * 0.40, Math.max(w, h) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.74)');
      return vg;
    })());
    ctx.fillRect(0, 0, w, h);
    const pat = S.staticGrain
      ? (S.staticPat ?? (S.staticPat = this._grainPattern(ctx, S.staticGrain)))
      : S.grainPats[S.frameK & 7];
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = pat; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  _grainPattern(ctx, tile) {
    const p = ctx.createPattern(tile, 'repeat');
    if (p.setTransform) p.setTransform(new DOMMatrix().scale(2)); // 半分辨率颗粒：粗一档更贴胶片粒
    return p;
  }

  // 通用逐帧步进：print（mp4）与 printGif 同一条腿
  async _renderRange(S, { fromMs, toMs, fps, perFrame, onProgress }) {
    const frameMs = 1000 / fps;
    const total = Math.max(1, Math.ceil((toMs - fromMs) / frameMs));
    for (let k = 0; k < total; k++) {
      const tau = fromMs + k * frameMs;
      // 发包到 τ（50ms 网格；虚拟钟=发包刻，恒迟重建照 law 插值）
      while (S.gridT <= tau && S.gridT < S.sched.durMs + PACKET_MS) {
        const i = S.sched.segIndexAt(S.gridT, S.segIdx);
        if (i !== S.segIdx) { if (S.segIdx >= 0) S.rig.chart.markSeam(); S.segIdx = i; }
        const clockT = S.gridT;
        S.rig.chart.pair._clock = () => clockT;
        S.rig.deck.pair._clock = () => clockT;
        S.rig.pairN._clock = () => clockT;
        const pkt = { ...S.sched.packetAt(S.gridT, S.segIdx), stageT: PACKET_MS + S.gridT };
        S.rig.chart.onPacket(pkt, false);
        S.rig.deck.onPacket(pkt, false);
        S.rig.lamps.onPacket(pkt, false);
        S.rig.pairN.push(pkt, false);
        while (S.ei < S.sched.events.length && S.sched.events[S.ei].dubT <= S.gridT) {
          S.rig.lamps.onMoment(S.sched.events[S.ei].m); S.ei++;
        }
        // 布景灯档目标（画布形的 room 着装）
        const [wd, ww] = W_DIM[pkt.weather] ?? W_DIM.CLEAR;
        S.envTarget = { wDim: wd, wWarm: ww, idleDim: pkt.phase === 'IDLE' ? 0.55 : 1 };
        S.lastPhase = pkt.phase;
        S.gridT += PACKET_MS;
      }
      // 器件渲染到 τ（渲染即重建：恒迟一包，与台上同 law）。
      // deck 不必 render：合成器直读 theta/omega/wow 执笔（render 只写 DOM 转角，胶印无此耳目）
      S.rig.chart.render(tau);
      S.rig.lamps.render(tau);
      // 布景灯一阶趋近（WORKING 唤醒走钨丝速）
      const tauEnv = S.lastPhase === 'WORKING' ? 150 : 1100;
      const a = 1 - Math.exp(-frameMs / tauEnv);
      for (const key of ['wDim', 'wWarm', 'idleDim']) S.env[key] += (S.envTarget[key] - S.env[key]) * a;

      S.frameK = k;
      this._composeFrame(S.ctx, S, tau);
      await perFrame(k, tau, total);
      if (onProgress && (k & 15) === 0) onProgress(k / total);
      if ((k & 31) === 31) await new Promise(r => setTimeout(r, 0)); // 让路 UI/编码器
    }
    return total;
  }

  _newState(sched, srcTape, preset) {
    const rig = this._buildRig(srcTape);
    const geo = {
      w: preset.w, h: preset.h,
      scale: preset.h / window.innerHeight,
      offX: (preset.w - window.innerWidth * (preset.h / window.innerHeight)) / 2,
    };
    const out = new OffscreenCanvas(preset.w, preset.h);
    const ctx = out.getContext('2d', { alpha: false });
    const M = this.machine;
    const grainTiles = Array.from({ length: 8 }, () => this._makeGrainTile()); // 粒池：动态颗粒零逐帧分配
    return {
      sched, rig, geo,
      ctx, out,
      grainPats: grainTiles.map(t => this._grainPattern(ctx, t)),
      frameK: 0,
      gridT: 0, segIdx: -1, ei: 0,
      env: { wDim: 1, wWarm: 0, idleDim: 1 },
      envTarget: { wDim: 1, wWarm: 0, idleDim: 1 },
      lastPhase: 'IDLE',
      chartRect: rectOf(document.getElementById('chart-canvas'), M),
      reelRects: [rectOf(document.getElementById('reel-l'), M), rectOf(document.getElementById('reel-r'), M)],
      bandRect: rectOf(document.getElementById('tapeband'), M),
      tubeRect: rectOf(document.getElementById('amber-tube'), M),
      emRect: rectOf(document.getElementById('emerald'), M),
      piRect: rectOf(document.getElementById('pilot'), M),
    };
  }

  // ———————————————————————— 主口：胶印一支 mp4（附 PEAK 海报帧） ————————————————————————
  async print({ sched, srcTape, presetName = '1080p30', onProgress }) {
    const preset = PRESETS[presetName] ?? PRESETS['1080p30'];
    // 合成走视口空间：窗口被折叠（0×0 视口）时几何全灭——诚实拒印好过无声出废片
    if (window.innerWidth < 100 || window.innerHeight < 100) {
      throw new Error(`视口不可用（${window.innerWidth}×${window.innerHeight}）——窗口被折叠？`);
    }
    const probed = await this.probe(preset);
    if (probed.kind === 'none') throw new Error(probed.note);

    const S = this._newState(sched, srcTape, preset);
    S.plates = await this._buildPlates(S.geo.scale);

    // 编码→封装（mp4-muxer / webm-muxer，vendor 件，登记见 stage/vendor/LICENSES.md）
    const isAvc = probed.kind === 'avc';
    const target = isAvc ? new Mp4Target() : new WebmTarget();
    const muxer = isAvc
      ? new Mp4Muxer({ target, video: { codec: 'avc', width: preset.w, height: preset.h }, fastStart: 'in-memory' })
      : new WebmMuxer({ target, video: { codec: 'V_VP9', width: preset.w, height: preset.h } });
    let encErr = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { encErr = e; },
    });
    enc.configure(probed.config);

    // 海报帧＝PEAK 中点（无 PEAK 的手动剪取全片中点）
    const pi = sched.segs.findIndex(s => s.role === 'PEAK');
    const posterTau = pi >= 0
      ? sched.starts[pi] + (sched.segs[pi].t1 - sched.segs[pi].t0) / sched.segs[pi].speed / 2
      : sched.durMs / 2;
    let posterBlob = null;

    const wall0 = performance.now();
    const frameUs = Math.round(1e6 / FPS);
    const frames = await this._renderRange(S, {
      fromMs: 0, toMs: sched.durMs, fps: FPS, onProgress,
      perFrame: async (k, tau) => {
        if (encErr) throw encErr;
        const vf = new VideoFrame(S.out, { timestamp: k * frameUs, duration: frameUs });
        enc.encode(vf, { keyFrame: k % 150 === 0 });
        vf.close();
        if (posterBlob === null && tau >= posterTau) {
          posterBlob = await S.out.convertToBlob({ type: 'image/png' });
        }
        while (enc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 2)); // 背压
      },
    });
    await enc.flush();
    muxer.finalize();
    const wallMs = performance.now() - wall0;
    S.rig.rig.remove();

    const blob = new Blob([target.buffer], { type: isAvc ? 'video/mp4' : 'video/webm' });
    return {
      blob, posterBlob,
      stats: {
        codec: probed.config.codec, container: isAvc ? 'mp4' : 'webm',
        preset: presetName, frames, contentMs: Math.round(sched.durMs),
        wallMs: Math.round(wallMs),
        realtimeX: +(sched.durMs / wallMs).toFixed(2), // 渲染速度影子：目标 ≥2×
        audio: 'none（M-T3 候声音过耳合龙）',
        pixelDeterminism: 'cuts/调度严格确定；像素不保证跨机逐字节（确定性诚实条款）',
      },
    };
  }

  // ———————————————————————— GIF 次级出口（静态颗粒单帧化法，≤8s） ————————————————————————
  async printGif({ sched, srcTape, seconds = 8, w = 640, fps = 12, onProgress }) {
    const { GIFEncoder, quantize, applyPalette } = await import('../vendor/gifenc.mjs');
    const h = Math.round((w * 9) / 16 / 2) * 2;
    const preset = { w, h, bitrate: 0 };
    const S = this._newState(sched, srcTape, preset);
    S.plates = await this._buildPlates(S.geo.scale);
    S.staticGrain = this._makeGrainTile(); // 静态颗粒单帧化：整支 GIF 同一张粒，调色板不被噪声吃光

    // 窗口：PEAK 居中 ±s/2，出界回夹
    const pi = sched.segs.findIndex(s => s.role === 'PEAK');
    const mid = pi >= 0
      ? sched.starts[pi] + (sched.segs[pi].t1 - sched.segs[pi].t0) / sched.segs[pi].speed / 2
      : sched.durMs / 2;
    const span = Math.min(seconds * 1000, sched.durMs);
    const fromMs = Math.max(0, Math.min(mid - span / 2, sched.durMs - span));

    const gif = GIFEncoder();
    let palette = null;
    const delay = Math.round(1000 / fps);
    await this._renderRange(S, {
      fromMs, toMs: fromMs + span, fps, onProgress,
      perFrame: async () => {
        const { data } = S.ctx.getImageData(0, 0, w, h);
        if (!palette) palette = quantize(data, 256);
        gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay });
      },
    });
    gif.finish();
    S.rig.rig.remove();
    return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), fromMs, spanMs: span };
  }
}
