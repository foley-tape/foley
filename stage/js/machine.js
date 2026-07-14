// 机器＝一张场景板（decree13 乙-1：整机一次布光渲染，这张图就是机器本体），
// 只有"会动的东西"作为薄层叠上，靠 css/plate.css 里的归一化坐标（源自 assets/plate.coords.json）精确对位。
//
// 单一数据源（decree13 乙-6 · 旧 task#18 顺势清零）：index 与 demo 同吃这一份 markup，
// 只差"自启 vs 等手势"一个开关——机器本体永不双写。
//
// 边界：CSS 只许布局定位 / 加性辉光透明度 / 颗粒暗角浮尘 shader；器件本体材质一律来自 plate.webp（decree12/13）。
// P0-1④（LEDGER）：暗场信箱的 min(100vw,160vh) 出小数 CSS 宽 → 板与动态层全体非整设备像素采样
// （"画面糊/像素乱"元凶之一）。把机器盒吸附到偶数设备像素。
function snapMachine(el) {
  const AR = 2560 / 1776;   // 高板默认取景框（渲染批步二·构图稿过闸契约）
  const fit = () => {
    const dpr = window.devicePixelRatio || 1;
    const target = Math.min(innerWidth, innerHeight * AR);
    const w = Math.round(target * dpr / 2) * 2 / dpr;
    const h = Math.round(w * (1776 / 2560) * dpr / 2) * 2 / dpr;
    el.style.width = w + 'px'; el.style.height = h + 'px';
    // 塔宽随段A（lib-plate width:100% 自适应·段B 高由 aspect-ratio 自撑）
    const tower = el.closest('#tower');
    if (tower) tower.style.width = w + 'px';
  };
  fit();
  window.addEventListener('resize', fit);
}

export function buildMachine(el, opts = {}) {
  if (!el) return;
  snapMachine(el);
  el.innerHTML = `
    <img class="plate" src="assets/plate.webp"
         alt="a reel-to-reel tape machine" decoding="async" draggable="false">
    <!-- counter-dim 已随高板退役：读窗休眠即黑烘进板本体（设计三§三·dead-front） -->

    <!-- 架沿导航示能（渲染批·镜头即导航）：默认框底部一线（前唇+架沿）——点按=镜头下摇入带库 -->
    <button class="ov" id="lip-hint" aria-label="下摇看带库"></button>

    <!-- 带饼环（设计二§三·审计⑥见带令）：垫盘条之下·条窗洞透出可辨的带饼——scale 随会话/播放演进 -->
    <div class="ov" id="pack-l" aria-hidden="true"><img src="assets/pack_l.webp" alt="" draggable="false"></div>
    <div class="ov" id="pack-r" aria-hidden="true"><img src="assets/pack_r.webp" alt="" draggable="false"></div>
    <!-- 带盘＝定光胶片条（decree13 丁-②）：同场景同灯 N 帧自转雪碧图·deck.js 换帧；条未到时板上静盘兜底 -->
    <div class="ov reel" id="reel-l"></div>
    <div class="ov reel" id="reel-r"></div>
    <i class="ov" id="tapeband" aria-hidden="true"></i>
    <!-- 第三批③ 走带活层：带面流动条＋辊条×2（定光条叠板·placement 渲染打印铆定；
         带先辊后＝辊盘正确遮挡带端·免"带骑辊脸"的一线假） -->
    <div class="ov" id="band-run" aria-hidden="true"></div>
    <div class="ov" id="guide-l" aria-hidden="true"></div>
    <div class="ov" id="guide-r" aria-hidden="true"></div>
    <!-- 走带甲板命中区（诊断式播放/暂停·船长十分钟修的旧约）：点带盘区即切——不常驻按钮 -->
    <i class="ov" id="deck"></i>

    <!-- VU：表脸烘入板；指针＝CSS 元件·吃事件能量弹道（轴心落脸下缘·毂在脸上不脱毂） -->
    <div class="ov" id="vu-svg"><i class="vu-needle-shadow"></i><i class="vu-needle"></i></div>

    <!-- 走纸记录仪：墨＝live canvas（multiply 洇墨·放行④）；纸面光照＝板上自身烘焙光的重照层
         （extract_relight 自板裁取·multiply）——光来自渲染，前端不手画 -->
    <canvas class="ov" id="chart-canvas"></canvas>
    <i class="ov" id="paper-relight" aria-hidden="true"></i>
    <!-- ④ 钢笔回魂：伺服滑针总成（渲染件·针+触点+连杆+滑套）——translateY 随墨端＝墨笔硬锁；
         竖滑轨静件先铺、滑套恒骑其上（船长案"剧烈时臂座分离"→机构闭合）；检流计座＝伺服马达座。 -->
    <div class="ov" id="pen-rail" aria-hidden="true"><img src="assets/pen_rail.webp" alt="" draggable="false"></div>
    <div class="ov" id="pen-head" aria-hidden="true"><img src="assets/pen_head.webp" alt="" draggable="false"></div>
    <!-- ⑥ 伺服马达座（rec_pivot·户口册定职）：拍一下=滑针校准扫摆一趟（bbox=板上圆钮实测） -->
    <button class="ov" id="servo-knob" aria-label="伺服校准"></button>
    <canvas class="ov" id="dub-overlay"></canvas>

    <!-- 魔眼（⑦材质重构）：凹管烘入板；孔径内四层物理栈=磷光屏/扇叶暗影/阴极金属帽/真空玻璃壳，
         全部纯 CSS var 消费者——唯一写者 Lamps 只写 --act -->
    <div class="ov" id="magic-eye" style="--act:0"><i class="eye-aperture"><i class="eye-glow"></i><i class="eye-fan"></i><i class="eye-cathode"></i><i class="eye-glass"></i></i></div>

    <!-- 状态灯（光机融合案·Dead-front 暗面显字）：窗体烙板（熄灭=深烟玻近黑·死面纪律无光即无字）；
         激活=光字从窗内点亮——CUE 氩气蓝(递话)/WRAP 钨丝灼橙(收工·点火曲线)/LINE 暗房红宝石(线路基底照度)。
         Dymo B 案随光机融合废除（文字由光承载·无外贴介质） -->
    <!-- REC 灯加性层（接线审计②归层）：板上熄灭暗红罩·live 录制中此层呼吸——全机唯一信号红 -->
    <i class="ov" id="rec-lamp" aria-hidden="true"></i>
    <i class="ov df-text" id="amber-tube" style="--lit:0">CUE</i>
    <i class="ov df-text" id="emerald"   style="--lit:0;--ember:0">WRAP</i>
    <i class="ov df-text" id="pilot"     style="--lit:0">LINE</i>

    <!-- 主功能选择器（渲染批·设计三§四）：旋钮烘板（ON 姿态）·条帧 canvas 拧动＋pre-gesture
         呼吸示能（play-cue 处决后示能正门迁此：OFF 位旋钮=「拧我」）。selector.js 接管。 -->
    <div class="ov" id="selector"><canvas></canvas><i class="sel-glow" aria-hidden="true"></i></div>

    <!-- 计数轮（渲染批回归·设计三§三）：读窗烙板（休眠即黑）·四只数字鼓 canvas=鼓条换帧。
         棘爪律归 counter.js（落卡临界阻尼 ≤250ms/停必落卡位/同径同字/带惯性）；走带时亮（.lit）。 -->
    <div class="ov" id="counter" aria-hidden="true"><canvas></canvas><canvas></canvas><canvas></canvas><canvas></canvas></div>

    <!-- 走带牌（decree13 甲-4/乙-5/丁-⑥：现代胶囊拆除）：黄铜牌烘入板，带名/曲名＝蚀刻字层
         （唯一必须动态的字·不可烘死）；换曲＝板上机械拨杆的左右命中半区；模式/暂停不落字——
         由机器表达（盘停/灯语），np-mode 仅存 data 契约供引擎，不显。 -->
    <div class="ov" id="now-plate" data-mode="empty">
      <span class="np-status"><i class="np-tally"></i><b class="np-mode"></b><em class="np-tape"></em></span><i class="np-meta"></i>
    </div>
    <!-- 操作区（底盘重构·下半区三分法之中）：监听选曲＝两枚大机械琴键（设计二§一.2 语义改判：
         换的是画外唱机的唱片·机上带只录会话；键帽烙板·盲操体量）；
         命中区=键帽实域；键沉=顶缘影加深+山形蚀刻下沉 -->
    <div class="ov" id="song-keys">
      <button class="np-prev" aria-label="上一曲"></button><button class="np-next" aria-label="下一曲"></button>
    </div>

    <!-- Solari 翻字牌（底盘重构 ×1.5·下半区视觉核心）：壳体已烙入板（静件归板·sprite 层退役）；
         活字=flap-cells DOM（onRecordChange 唯一写者·留白=板上空白卡）；防尘玻璃罩=独立橱窗层压活字之上；
         曲单纸标签（甲案）=贴壳下唇的打字机墨纸条（印刷品域·开机即读） -->
    <div class="ov" id="flap-cells" aria-hidden="true"></div>
    <div class="ov" id="flap-glass" aria-hidden="true"><img src="assets/flap_glass.webp" alt="" draggable="false"></div>
    <div class="ov" id="track-index" aria-hidden="true"></div>

    <!-- DUB（本体烘入板：键＋纸长签）：此层只是键上的隐形命中区＋签排选位微光（辉光许可） -->
    <div class="ov" id="dub-group">
      <div id="dub-lengths">
        <button class="len-tab" data-s="30"></button>
        <button class="len-tab" data-s="45" data-on></button>
        <button class="len-tab" data-s="60"></button>
        <button class="len-tab" data-s="90"></button>
      </div>
      <button id="dub-key"></button>
    </div>

    <i class="ov" id="walnut-rail" aria-hidden="true"></i>

    <!-- 收边层（P0-1③ 结构修）：入机随动——镜头漂移挪的是"整机+收边"一张缓存纹理，
         四张混合层对板静止不动→合成器缓存生效；曾为 #room 直属时每次漂移都逼全幅重混合。 -->
    <div id="keylight" aria-hidden="true"></div>
    <div id="vignette" aria-hidden="true"></div>
    <div id="grain" aria-hidden="true"></div>
    <div id="grain-dark" aria-hidden="true"></div>
  `;
}
