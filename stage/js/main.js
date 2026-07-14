// 舞台点火（第五号手令 丁-E2 卡带架）：landing＝空载磁带架；选带→服务端 transport 权威→广播回渲染。
// 持久台面（房间/器件/声桥）＋可换喂食源（demo/card 回放·live 实流）；换带走淡出→装带→淡入（rule 1），
// 绝不销毁音频图（免爆破）。前端按钮/灯/选中一律读后端 transport 字段（rule 4），选中态不在前端自持（rule 2）。
// 深链：?tape=X / ?mode=live 只作"上机指令"（boot 后 POST select，后端广播回来才渲染）；裸正门＝空载（rule 3）。
import { loadTape, Replayer, buildTape } from './replay.js';
import { LiveStream } from './live.js';
import { VuMeter, ChartRecorder, Lamps } from './instruments.js';
import { ReelDeck } from './deck.js';
import { mountLens } from './lens.js';
import { buildMachine } from './machine.js';
import { mountPerf } from './perf.js';
import { DubController } from './dub.js';
import { SoundBridge } from './soundbridge.js';
import { mountFlapBoard, mountTrackIndex } from './flapboard.js';
import { runPost, runPenSweep, postGate, TEST_END_MS } from './post.js';
import { mountSelector } from './selector.js';
import { mountCounter } from './counter.js';
import { mountTower } from './tower.js';

const params = new URLSearchParams(location.search);
const deepTape = (params.get('tape') || '').replace(/[^\w-]/g, '');  // 深链 demo
const deepLive = params.get('mode') === 'live';                       // 深链 live
const soundOff = params.get('sound') === '0';
const deepSpeed = Number(params.get('speed') || 1);

const token = () => document.querySelector('meta[name="dub-token"]')?.content || '';
const postTransport = (action, body) =>
  fetch(`/transport/${action}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dub-token': token() }, body: body ? JSON.stringify(body) : undefined })
    .then(r => (r.ok ? r.json() : null)).catch(() => null);
const fmtDur = (s) => {
  if (s == null) return '';
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
};
// P0-4 侧栏诚实版：真会话第三元素＝相对时间（何时收工）；厂盘无时可言仍报时长
const fmtRel = (ms) => {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 90) return '刚才';
  if (s < 3600) return `${Math.max(2, Math.round(s / 60))} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  if (s < 172800) return '昨天';
  return `${Math.round(s / 86400)} 天前`;
};

async function boot() {
  if (document.readyState !== 'complete') await new Promise(r => window.addEventListener('load', r, { once: true }));

  // 渲染批·页面接线：计数轮回归常显（棘爪律=counter.js·休眠即黑）；play-cue 处决（示能正门=选择器）
  buildMachine(document.getElementById('machine'));
  mountPerf();   // 帧医生（?perf=1·P0-1 验收器）   // decree13：机器＝场景板＋动态层（单一数据源 markup·index/demo 同吃）

  const room = document.getElementById('room');
  // 首手势即房间醒（示能=pre-gesture 的选择器呼吸微光·CSS 门随类退场）。
  window.addEventListener('pointerdown', () => {
    room.classList.remove('pre-gesture');
  }, { once: true });

  // ── 持久器件（换带不重建，只清账；声桥手势后 push） ──
  const vu = new VuMeter(document.getElementById('vu-svg'));
  // ?vufreeze=<dBFS> 诊断口：钉死总线读数（刻度对脸验收器：-20 时针必须砸在画上 0/红区界）
  if (params.has('vufreeze')) vu.source = () => Number(params.get('vufreeze'));
  // ② Solari 翻字牌机芯（曲名唯一显示面·被 onRecordChange 唯一驱动·手势前留白=板上空白卡）
  const flap = mountFlapBoard(document.getElementById('flap-cells'));
  // ② 甲案曲单纸标签：印刷品域——纸上的字开机即读，不需要手势（catalog=静态出版物）
  fetch('../sound/records/catalog.json').then((r) => r.json())
    .then((c) => mountTrackIndex(document.getElementById('track-index'), (c.records || []).map((x) => x.title)))
    .catch(() => {});
  const blankTape = { splices: [], moments: [], duration: Infinity };
  const chart = new ChartRecorder(document.getElementById('chart-canvas'), blankTape);
  const lamps = new Lamps(document.getElementById('amber-tube'), document.getElementById('emerald'), document.getElementById('pilot'));
  const deck = new ReelDeck(document.getElementById('reel-l'), document.getElementById('reel-r'), document.getElementById('tapeband'));
  // 计数轮回归（渲染批·设计三§三）：鼓条四轮·一只钟律吃盘转角·棘爪律在件内
  const counter = mountCounter(document.getElementById('counter'), deck);
  const instruments = [vu, chart, lamps, deck, ...(counter ? [counter] : [])];
  // 高塔导航（镜头即导航·RACK_SPEC 一.2）：滚轮/触摸/点架沿=下摇入带库；光随指针在带库层
  mountTower({ tower: document.getElementById('tower'), room, lipHint: document.getElementById('lip-hint'), lib: document.getElementById('lib-plate') });

  // 写者分离：lens 慢漂唯一写 #machine transform·tower 导航唯一写 #tower（双写者打架案）
  const lens = mountLens(document.getElementById('lens'), document.getElementById('machine'));
  if (lens) { document.getElementById('grain').style.display = 'none'; }   // decree13：暗角/暖调留给 CSS #vignette（multiply·恒在），lens 只叠颗粒浮尘

  // ── 房间喂包（E1 睡姿）＋总线 ──
  let idleSince = null, lastPktSeen = null;
  const feedRaw = (pkt, isFirst) => {
    lastPktSeen = pkt;
    room.dataset.phase = pkt.phase; room.dataset.weather = pkt.weather;
    if (pkt.phase === 'IDLE') {
      if (idleSince === null) idleSince = performance.now();
      const deep = performance.now() - idleSince >= 300000;
      if (deep !== (room.dataset.sleep === 'deep')) { if (deep) room.dataset.sleep = 'deep'; else delete room.dataset.sleep; if (lens) lens.setDeep(deep); }
    } else if (idleSince !== null) { idleSince = null; delete room.dataset.sleep; if (lens) lens.setDeep(false); }
    instruments.forEach(i => i.onPacket(pkt, isFirst));
  };
  const feedMomentRaw = m => instruments.forEach(i => i.onMoment && i.onMoment(m));
  let dub = null;
  const feedPacket = (pkt, isFirst) => { if (dub?.eats()) return; feedRaw(pkt, isFirst); };
  const feedMoment = m => { if (dub?.eats()) { dub.noteMoment(m); return; } feedMomentRaw(m); };

  // ── 渲染环（30fps 封顶；体温法） ──
  let lastRender = -Infinity;
  function render(now) {
    requestAnimationFrame(render);
    if (now - lastRender < 33) return;
    lastRender = now;
    instruments.forEach(i => i.render(now));
    if (dub) dub.render(now);
  }
  requestAnimationFrame(render);
  window.addEventListener('resize', () => { chart._resize(); dub && dub.onResize(); });

  // ── 声桥（持久·手势起·rule 1 淡入淡出；换带只换喂食源，永不销毁音频图 丙.1） ──
  let sb = null, onSoundReady = null;
  if (!soundOff) {
    window.addEventListener('pointerdown', () => {
      if (sb) return; // 丙.1 单引擎：永不二次实例化音频图
      sb = new SoundBridge({ repoKey: 'deck:default', seed: 'deck' });
      // ② 三连里的后两拍：哗啦翻动（onRecordChange 确认上桥才翻·§11 不预写）＋软落针（翻定即落·
      //    仅真人切曲——上桥/自愈换名只翻不落针，落针是给手的回答不是给机器的）
      sb.onRecordChange = (name, userSwitch) => {
        // POST 演出期让位（船长时序令）：台词并入幕三翻牌拍=揭幕滚真曲名——
        // §11 唯一写者不变，只延时不代笔；非演出期原样即翻。
        // 哗啦与翻牌同刻（刀四）：翻片级联是物理事件，不问缘由（上桥/切曲/揭幕同响）
        const apply = () => { born.solariCue?.(800); flap?.set(name, { onSettle: () => { if (userSwitch) born.needleDrop?.(); } }); };
        if (!postGate.defer(apply)) apply();
      };
      const born = sb; instruments.push(sb);
      sb.start(lastPktSeen).then(() => {
        if (window.__stage) window.__stage.sound = born;
        if (!params.has('vufreeze')) vu.source = () => born.vuDb();   // ⑤ 修宪：声起之刻 VU 换粮——总线真实包络（耳听即针指）
        onSoundReady?.();
      })
        .catch((err) => { instruments.splice(instruments.indexOf(born), 1); sb = null; console.warn('[sound] 声桥未起（视觉照走）：', err); });
    });
  }

  // ── 可换喂食源（demo/card 回放·live 实流） ──
  let liveActive = false, livePrimed = false, replayer = null;
  const live = new LiveStream();
  live.onPacket.push((pkt, first) => { if (liveActive) feedPacket(pkt, first); });
  live.onMoment.push((m) => { if (liveActive) feedMoment(m); });
  // 状态可诊（E5）：只在 live 上机时把连接健康态落 room[data-signal]
  live.onStatus.push((s) => { if (!liveActive) return; if (s === 'live') delete room.dataset.signal; else room.dataset.signal = s; });
  // ⑥ LINE 线路灯（机器级·不问上机与否）：SSE 证明即亮（live/gone 皆线路在——gone 是源没了不是线断了），
  // lost=断链即熄；connecting=未证不亮。
  lamps.linkUp = false;
  live.onStatus.push((s) => { lamps.linkUp = (s === 'live' || s === 'gone'); });
  live.connect(); live.flushBuffer();

  function stopSource() {
    liveActive = false;
    if (replayer) { replayer.pause(); replayer = null; }
    delete room.dataset.signal;
  }
  async function loadTapeData(item) {
    if (item.kind === 'demo') return await loadTape(item.id);
    const sid = item.id.slice(5);
    const [c, m] = await Promise.all([
      fetch(`/cards/${sid}/curve.csv`).then(r => r.ok ? r.text() : null),
      fetch(`/cards/${sid}/moments.csv`).then(r => r.ok ? r.text() : 't\n'),
    ]);
    if (!c) throw new Error('卡带无纸');
    return buildTape(sid, c, m);
  }
  function makeDub(o) {
    return new DubController({
      ...o, chart, deck, feed: feedRaw, feedMoment: feedMomentRaw,
      keyEl: document.getElementById('dub-key'), tabsEl: document.getElementById('dub-lengths'),
      overlayEl: document.getElementById('dub-overlay'), chartCanvas: document.getElementById('chart-canvas'),
      railEl: document.getElementById('walnut-rail'),
    });
  }
  async function mountSource(item) {
    counter?.reset();
    if (!item) { chart.reset(blankTape); dub = null; return; }   // EMPTY：房间层，无源无带
    if (item.kind === 'live') {
      chart.reset(blankTape);
      liveActive = true;
      if (!livePrimed) { try { await live.prime(); } catch { /* 无今晨 */ } livePrimed = true; }
      dub = makeDub({ mode: 'live', tapeName: 'today', tape: blankTape, replayer: null, live });
    } else {
      const tape = await loadTapeData(item);
      chart.reset(tape);
      replayer = new Replayer(tape);
      replayer.onPacket.push(feedPacket); replayer.onMoment.push(feedMoment);
      // 丙.2：转台开停→唱片随带停/续播；DUB 自管音景期间不插手
      replayer.onPlayState = (playing) => { if (dub?.eats()) return; if (playing) sb?.resume?.(); else sb?.pause?.(); };
      if (deepSpeed > 0) replayer.speed = deepSpeed;
      dub = makeDub({ mode: 'replay', tapeName: item.id, tape, replayer, live: null });
      replayer.play();
    }
  }

  // ── transport 绑定（rule 2/4：一切读后端字段） ──
  const rackIndex = new Map();
  let curLoaded = null, curPhase = 'EMPTY', controlsLocked = false;
  let serveEpoch = null;
  function applyTransport(t) {
    if (!t) return;
    // 纪元自愈（船长案"架上没看到 AUDIT"）：serve 重启＝新纪元——开着的旧标签页架单已陈旧，重载货架
    if (serveEpoch !== null && t.epoch !== serveEpoch) { serveEpoch = t.epoch; loadRack(); return; }
    serveEpoch = t.epoch;
    renderRackSelection(t);                          // rule 2：选中/在机标记读后端
    updateControls(t);                               // rule 4：键/相读后端
    if (t.phase === 'CUEING' && curPhase !== 'CUEING') sb?.fadeOut();   // rule 1：闭锁期淡出
    curPhase = t.phase;
    if (t.loaded !== curLoaded) {                    // 上机带变→换源（rule 1 装带→淡入）
      curLoaded = t.loaded;
      const item = t.loaded ? rackIndex.get(t.loaded) : null;
      stopSource();
      mountSource(item).then(() => sb?.fadeIn()).catch(err => { console.warn('[transport] 装带失败：', err); sb?.fadeIn(); });
    }
    if (replayer) {                                  // rule 4：回放转台随后端 phase 停/走
      if (t.phase === 'PAUSED' && replayer.playing) replayer.pause();
      else if (t.phase === 'PLAYING' && !replayer.playing) replayer.play();
    }
    if (t.live) lamps.pendingAsk = t.pendingAsk;     // rule 4：live ASK 待机读后端保活字段
  }
  live.es?.addEventListener('transport', e => { try { applyTransport(JSON.parse(e.data)); } catch { /* 坏包 */ } });

  // ── 卡带架 UI（左纵列货架） ──
  const rackEl = document.getElementById('rack-list');
  function renderRackSelection(t) {
    if (!rackEl) return;
    for (const el of rackEl.querySelectorAll('.cassette')) {
      el.classList.toggle('selected', el.dataset.id === t.selected);
      // RACK_SPEC 二.1：货架只列不在机上的带——上机即离架，退带归位；LIVE 的日常形态即此
      el.classList.toggle('in-machine', el.dataset.id === t.loaded);
    }
  }
  // RACK_SPEC 三.3 路径永不上架（路径属 doctor 诊断域）：展示题从首个路径样 token 处截断；
  // 原文至多归悬停铭牌（title）。剥空后由垫底链（仓名）扛大字。
  const stripPaths = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    const i = t.search(/(?:^|\s)\S*\//);
    return (i < 0 ? t : t.slice(0, i)).trim().replace(/[，,、;；:：]+$/, '');
  };
  async function loadRack() {
    const data = await fetch('/rack').then(r => r.ok ? r.json() : { rack: [] }).catch(() => ({ rack: [] }));
    if (rackEl) rackEl.innerHTML = '';
    rackIndex.clear();
    for (const item of data.rack) {
      rackIndex.set(item.id, item);
      if (!rackEl) continue;
      const el = document.createElement('button');
      el.className = `cassette kind-${item.kind}`;
      el.dataset.id = item.id;
      el.innerHTML = `<span class="hub"></span><span class="hub"></span>
        <b class="c-name"></b><span class="c-sum"></span><i class="c-dur"></i>`;
      // RACK_SPEC 三 层级倒置：真会话大字＝开场白（手写体·机器只引用不发明），小角标＝仓名；
      // 厂带照旧 印刷体名＋摘要（二.2 分区靠字体不靠分割线）。
      if (item.kind === 'card') {
        const title = stripPaths(item.summary) || item.name;   // 垫底链：开场白剥路径后空→仓名
        el.querySelector('.c-name').textContent = title;
        // 阶段一（船长点头 2026-07-13·文字服役）：FT 号上架——小角标行=仓名 · FT-####（数带不数卡）
        // FT 前置保号（编号=第 N 盘的身份·窄行截仓名不截号）
        const corner = [Number.isInteger(item.ft) ? `FT-${String(item.ft).padStart(4, '0')}` : '',
          title === item.name ? '' : item.name].filter(Boolean).join(' · ');
        el.querySelector('.c-sum').textContent = corner;
        // 章以文字图记：草章=铅笔灰（seal.draft 驱动·阈值立法锁定后自动转牛血红——无开关不追改已出屋）
        if (item.seal?.en) {
          el.classList.add('has-seal');
          const sm = document.createElement('em');
          sm.className = 'c-seal' + (item.seal.draft ? ' draft' : '');
          sm.textContent = item.seal.en;
          el.appendChild(sm);
        }
        // 悬停铭牌：开场白＋判章理由（阶段一法定件：悬停显判章理由）
        const tl = [item.summary, item.seal ? `〔${item.seal.en}·${item.seal.zh}〕${item.seal.reason}` : '']
          .filter(Boolean).join('\n');
        if (tl) el.title = tl;
      } else {
        el.querySelector('.c-name').textContent = item.name;
        el.querySelector('.c-sum').textContent = item.summary || '';
      }
      el.querySelector('.c-dur').textContent = item.kind === 'live' ? '● LIVE' : item.kind === 'card' ? fmtRel(item.mtime) : fmtDur(item.seconds);
      // rule 2：只请后端选中，不在前端自持选中态。点已上机的带＝退带（船长反馈：退带不直观·清屏生硬——
      // 改为点选中带退带，平滑淡出，不再要右侧 Eject 键）。
      el.addEventListener('click', () => {
        if (controlsLocked) return;
        if (item.id === curLoaded) postTransport('eject');
        else postTransport('select', { tape: item.id });
      });
      rackEl.appendChild(el);
    }
    if (data.transport) applyTransport(data.transport);
  }

  // ── 走带显示牌＋诊断式控制（船长十分钟修：去右侧常驻 play/eject 按钮，改机器诊断式）──
  const nowPlate = document.getElementById('now-plate');
  const npTape = nowPlate?.querySelector('.np-tape');
  const npMeta = nowPlate?.querySelector('.np-meta');
  function updateControls(t) {
    controlsLocked = t.locked || t.phase === 'CUEING';
    document.body.classList.toggle('tape-loaded', t.phase !== 'EMPTY'); // 上带→架化左抽屉·机器满台（rule 4 读后端相）
    if (nowPlate) {
      nowPlate.dataset.mode = t.phase === 'EMPTY' ? 'empty' : t.phase === 'PAUSED' ? 'paused' : (t.live ? 'live' : 'replay'); // 清晰区分 LIVE/回放
      // RACK_SPEC 二.1：在机之带归走带牌——LIVE 亦然（LIVE 不上架，名在牌上）。
      // ② 主牌标题法（裁决原文"主牌按标题法蚀刻开场白截断"）：真会话带蚀开场白剥路径截断
      //   （与货架大字同一把尺 stripPaths·CSS 34ch 裁溢出）；厂带/LIVE 仍印刷名。
      if (npTape) {
        const it = t.loaded ? rackIndex.get(t.loaded) : null;
        npTape.textContent = !t.loaded ? '' : t.live ? 'LIVE'
          : it?.kind === 'card' ? (stripPaths(it.summary) || it.name || '') : (it?.name ?? '');
        // 三.1 档案行（圈选②中性编号——C-编号属卡片宪法冻结域，解冻时一次换正）：
        // 真会话卡=NO.<卡序>·LEN·SESSION／厂带=FACTORY·LEN／LIVE=RECORDING；空机留白
        if (npMeta) {
          // ≥1h 走 H/M 制（会话卡 seconds=跨时·17 小时印成 LEN 1182:04 是仪表事故）
          const fmtLen = (s) => !(s && isFinite(s)) ? ''
            : s >= 3600 ? `LEN ${Math.floor(s / 3600)}H${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}M`
              : `LEN ${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
          let meta = '';
          if (t.loaded) {
            if (t.live) meta = 'LIVE · RECORDING';
            else if (it?.kind === 'card') {
              const no = [...rackIndex.values()].filter((x) => x.kind === 'card').indexOf(it) + 1;
              meta = [`NO.${String(no).padStart(2, '0')}`, fmtLen(it.seconds), 'SESSION'].filter(Boolean).join(' · ');
            } else meta = ['FACTORY', fmtLen(it?.seconds)].filter(Boolean).join(' · ');
          }
          if (npMeta.textContent !== meta) npMeta.textContent = meta;
        }
      }
    }
    const dubKey = document.getElementById('dub-key');
    if (dubKey) dubKey.classList.toggle('switch-locked', controlsLocked); // rule 1：切带期录音键锁
  }
  // 诊断式播放/暂停：上带后点走带甲板即切（不常驻按钮·船长反馈：播放键占位、频率低）
  document.getElementById('deck')?.addEventListener('click', () => {
    if (controlsLocked || curPhase === 'EMPTY' || curPhase === 'CUEING') return;
    postTransport(curPhase === 'PLAYING' ? 'pause' : 'play');
  });
  // 背景音乐上下曲（船长反馈：一直那首歌·选了三首）——切当前唱片，不动 transport。
  // §11 声资产上桥可诊（增补包 v2·随 P0-2）：牌上曲名唯一写者＝onRecordChange（真装上桥才蚀名）；
  // 切曲不预写——目标未载/载入失败时预写＝蚀一个不在桥上的名。未上桥＝曲名位留白，禁静默装健康。
  const bindRec = (sel, dir) => document.querySelector('#song-keys ' + sel)?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.__stage?.sound?.switchRecord?.(dir);
  });
  bindRec('.np-prev', -1); bindRec('.np-next', 1);
  // ⑥ 伺服校准钮（户口册定职）：拍一下马达座=滑针自检一趟；POST 演出期 penHead 已借走→静默让位
  document.getElementById('servo-knob')?.addEventListener('click', (e) => { e.stopPropagation(); sb?.servoCue?.(1.6); runPenSweep(chart); });   // 吱—嘀嘀与扫摆同刻（户口册#10）

  // ⑦POST 开机自检 × 主功能选择器（渲染批·两乐章制接线·设计三§四）：
  // 快拧直达 ON（点旋钮/一气拖到底/机身任意首手势=自动快拧）=压缩版整 POST；
  // 拖到 TEST 驻留 ≥400ms=电气自检独演（床第六态微嗡·带不走=transport 暂停）；
  // TEST→ON=尾章（电机降生·床诞生 400ms=起转后嗡起·transport 复走）。
  // ?post=0 素面；?postloop=1 循环；?vufreeze 在班时 VU 让位诊断口。
  const postH = { vu, chart, lamps, deck, flap, get sound() { return sb; } };
  const postOff = params.get('post') === '0';
  let postDone = false;
  const firePost = () => runPost(postH, { skipVu: params.has('vufreeze') })
    .then(() => { postDone = true; if (params.get('postloop') === '1') setTimeout(firePost, 1600); });
  let pausedForTest = false;
  const selector = mountSelector(document.getElementById('selector'), {
    sound: () => sb,
    onQuick: () => { if (!postOff && !postDone) firePost(); },
    onTest: () => {                                   // TEST 驻留：机器醒着，带不走（§四.3 合法驻留位）
      if (postOff || postDone) return;
      sb?.setTest?.(true);
      if (curPhase === 'PLAYING') { pausedForTest = true; postTransport('pause'); }
      runPost(postH, { until: TEST_END_MS, skipVu: params.has('vufreeze') });
    },
    onFinale: () => {                                 // TEST→ON 尾章：电机降生+床诞生（起转后 400ms 嗡起）
      sb?.setTest?.(false);
      if (pausedForTest) { pausedForTest = false; postTransport('play'); }
      if (postOff || postDone) return;
      runPost(postH, { from: TEST_END_MS, bedBirthMs: 400, skipVu: true }).then(() => { postDone = true; });
    },
  });
  if (postOff) selector?.setOn();                     // 素面：旋钮直接 ON 姿态（板同相）
  // 机身任意首手势=自动快拧+压缩版 POST；手势落在旋钮上则让位（正门自理·不消费路由）
  const gestureRoute = (e) => {
    if (e.target?.closest?.('#selector')) return;
    window.removeEventListener('pointerdown', gestureRoute);
    selector?.autoTwist();                            // 快拧与通电同刻（拧下去那一刻电已到——POST t0 不迟）
    if (!postOff && !postDone) firePost();
  };
  window.addEventListener('pointerdown', gestureRoute);

  // 调试把手（dev；换源后取当前引用）
  window.__stage = { live, deck, counter, chart, lamps, sound: sb, post: firePost, transport: () => curPhase,
    get replayer() { return replayer; }, get dub() { return dub; } };

  // ── 卡片吐卡＋接线（持久，第五号手令 乙/轨乙）──
  setupCardsAndWiring({ live, getDub: () => dub, setOnSoundReady: (fn) => { onSoundReady = fn; }, hasSound: () => !!sb });

  // —— 闸材料声轨抽头（014 乙镜像·?audiotap=1·诊断限定不入正常路径）：等声桥手势后上位，
  //    master 末端并联 MediaStreamDestination→MediaRecorder(opus)，__gateAudioB64 经 CDP 分片取走。
  if (params.has('audiotap')) {
    const poll = setInterval(() => {
      const snd = window.__stage?.sound, eng = snd?.engine, actx = snd?.ctx;
      if (!eng?.nodes?.master || !actx) return;
      clearInterval(poll);
      try {
        const dest = actx.createMediaStreamDestination();
        eng.nodes.master.connect(dest);
        const mr = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
        const chunks = [];
        mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        mr.start(1000);
        window.__tapStartEpoch = Date.now();
        window.__gateAudioB64 = () => new Promise(res => {
          mr.onstop = () => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(new Blob(chunks, { type: 'audio/webm' })); };
          mr.stop();
        });
        document.title = 'TAP-ON';
      } catch (err) { document.title = 'TAP-ERR ' + (err?.message ?? err); }
    }, 250);
  }

  // ── 启动：先架、后深链上机（rule 3 裸门空载） ──
  await loadRack();
  if (deepTape) postTransport('select', { tape: deepTape });
  else if (deepLive) postTransport('select', { tape: 'live' });
}

// —— 收工吐卡台面侧＋接线状态机（持久；第五号手令 乙 P0-1）——
function setupCardsAndWiring({ live, getDub, setOnSoundReady, hasSound }) {
  const cardQ = [];
  let cardBusy = false;
  const pump = async () => {
    if (cardBusy) return;
    cardBusy = true;
    try { while (cardQ.length > 0) { const sid = cardQ.shift(); const dub = getDub(); if (!dub) { cardQ.length = 0; break; } try { await dub.cutCard(sid); } catch (err) { console.warn('[card]', sid, err.message ?? err); } } }
    finally { cardBusy = false; }
  };
  const enqueue = (sid) => { if (sid && !cardQ.includes(sid) && getDub()) { cardQ.push(sid); pump(); } };
  const sweep = () => fetch('/cards/pending').then(r => (r.ok ? r.json() : { pending: [] })).then(j => (j.pending ?? []).forEach(enqueue)).catch(() => {});
  sweep(); setInterval(sweep, 15000);
  live.es?.addEventListener('card', e => { try { enqueue(JSON.parse(e.data).sid); } catch { /* 坏包 */ } });

  // 接线状态机（P0-1）：wired 为可查询态；到场自愈落针，永不作离场收据。
  let wired = false, needleRung = false;
  const ringNeedleIfReady = () => {
    if (needleRung || !wired) return;
    if (typeof window.__stage?.sound?.needleDrop !== 'function') return;
    needleRung = true; window.__stage.sound.needleDrop();
  };
  setOnSoundReady(ringNeedleIfReady);
  const markWired = () => { wired = true; dismissWireTag(); ringNeedleIfReady(); };
  live.es?.addEventListener('wired', markWired);
  fetch('/onboard/status').then(r => (r.ok ? r.json() : null)).then(st => { if (st?.wired) markWired(); else mountWireTag(st); }).catch(() => {});
}

// —— 接线签（轨乙③）——
let wireTagEl = null;
function dismissWireTag() {
  if (!wireTagEl) return;
  wireTagEl.classList.add('slip');
  setTimeout(() => { wireTagEl?.remove(); wireTagEl = null; }, 700);
  try { sessionStorage.setItem('foley-wiretag', 'dismissed'); } catch { /* 私隐 */ }
}
function mountWireTag(st) {
  if (!st || st.wired) return;
  try { if (sessionStorage.getItem('foley-wiretag') === 'dismissed') return; } catch { /* 无仓照亮 */ }
  const el = document.createElement('aside');
  el.id = 'wire-tag';
  el.innerHTML = `
    <i class="grommet"></i>
    <b>接 线 单</b>
    <ol>
      <li><em>终端跑一句</em>npx foley connect</li>
      <li><em>回 Claude Code</em>照常干活</li>
      <li><em>收工</em>机器自撕一张卡（默认脱敏）</li>
    </ol>
    <small>约 60 秒 · 点此签收起</small>`;
  el.addEventListener('click', dismissWireTag);
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('hung'));
  wireTagEl = el;
}

boot().catch(err => {
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;inset:auto 12px 12px;color:#a66;font:12px monospace;max-width:70ch;white-space:pre-wrap';
  pre.textContent = String(err);
  document.body.appendChild(pre);
});
