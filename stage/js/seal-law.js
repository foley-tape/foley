// 性格章律（阶段〇·单源）：八枚章闭集＋优先序＋C-编号吸附＋同源特征管线。
//
// 法源：011-R2 定稿（丁·v1 章集八枚闭集只增不删；优先序＝收尾态＞戏剧＞形状＞规模；
// 戊.1 C-吸附阶梯）＋增补包 v2（修正二·定标期草章：判据全为**起手值**，候定标语料 ≥30 场
// 阈值立法；修正三·同源特征律：章判定器与指纹生成器共用本特征管线——一份蒸馏特征，
// 两个消费者，封面与章不得自相矛盾）。
//
// 纯函数纪律（011-R §九.1）：同一会话→同一特征→同一章，离线可复现、可单测；
// 输入＝buildTape() 的产物（舞台钟一只钟），不读盘、不看表、不掷骰。
// 时长语义：一切时长＝舞台秒（录制长度）——墙钟已被 TR-1 抹除，机器不知道现在几点
// （ALL-NIGHTER 因此改判 LONG PLAY，本文件不得引入任何墙钟判据）。

export const SEAL_LAW_VER = 1;   // 判据版本：变更→架上未撕卡重判（草章可浮动）；已出屋 Dub 永不追改（出屋侧执法）

// 八枚闭集，数组序＝优先序（粗混＞抢救＞一条过＞跳针＞长版＞即兴＞小样＞样片）。
// band＝词汇表 v1 分布目标（%）：兜底 30–40 ／ 类型各 5–15 ／ 稀有 1–5。
export const SEALS = [
  { id: 'ROUGH_MIX',     en: 'ROUGH MIX',     zh: '粗混',   band: [5, 15],  blurb: '收工时张力未解——给没打完的仗一个体面的章' },
  { id: 'SALVAGE',       en: 'SALVAGE',       zh: '抢救',   band: [5, 15],  blurb: '高张力持续后终局解决——九死一生' },
  { id: 'ONE_TAKE',      en: 'ONE TAKE',      zh: '一条过', band: [1, 5],   blurb: '报错至多一枚且峰值张力低——稀有，人人想集' },
  { id: 'LOCKED_GROOVE', en: 'LOCKED GROOVE', zh: '跳针',   band: [5, 15],  blurb: '同签名错误循环——永循同圈之坏纹' },
  { id: 'LONG_PLAY',     en: 'LONG PLAY',     zh: '长版',   band: [5, 15],  blurb: '密纹长片——时长语义，不宣称时段' },
  { id: 'JAM',           en: 'JAM',           zh: '即兴',   band: [5, 15],  blurb: '长航多文件未入风暴——快乐的漫游' },
  { id: 'DEMO',          en: 'DEMO',          zh: '小样',   band: [5, 15],  blurb: '十分钟内的速写' },
  { id: 'DAILIES',       en: 'DAILIES',       zh: '样片',   band: [30, 40], blurb: '寻常的一天，如实归档（兜底章·全函数律）' },
];

// 判据起手值（增补包 v2 修正二：定标期草章·阈值立法前皆可浮动；011-R2 原文数字者注明）。
export const SEAL_THRESHOLDS = {
  oneTakeMaxFails: 1,     // ONE TAKE：报错 ≤1（011-R2 原文）
  oneTakeMaxPeakT: 0.55,  // ONE TAKE：峰值 T 低（起手值）
  grooveMinRepeat: 3,     // LOCKED GROOVE：同签名错误重复 ≥3（011-R 原文·判据自 OVERDUB 承继）
  salvageHighT: 0.70,     // SALVAGE：高张力线（起手值）
  salvageDwellS: 120,     // SALVAGE：高张力累计驻留 ≥（秒·起手值）
  salvageEndT: 0.35,      // SALVAGE：终局解决＝尾窗张力落线下（起手值）
  roughEndT: 0.50,        // ROUGH MIX：收工张力未解＝尾窗张力 ≥（起手值）
  endWindowS: 30,         // 尾窗＝收尾态的量法（秒·起手值）
  jamMinS: 3600,          // JAM：≥60min（011-R 原文）
  jamMinFiles: 4,         // JAM：多文件＝独立目标槽 ≥（起手值·文件数代理）
  demoMaxS: 600,          // DEMO：≤10min（011-R 原文）
  longPlayMinS: 10800,    // LONG PLAY：≥180min（011-R2 原文）
  skeletonN: 128,         // 张力骨架采样点数（指纹消费者·阶段二）
};

// 同源特征管线（修正三）：tape＝buildTape() 产物。章今天吃，指纹阶段二吃同一份。
// 011-R2 §二指纹五源中的带内四源在此（张力曲线→骨架/报错数→尖峰暴烈/时长→带粗/
// 文件数→纹理密度·代理＝独立目标槽）；模型→色调属母带侧元数据，不在带内，由出卡侧另供。
export function extractFeatures(tape, th = SEAL_THRESHOLDS) {
  const { curve, st, moments } = tape;
  const durMs = tape.duration, durS = durMs / 1000;

  let tPeak = 0, highDwellMs = 0, storm = false;
  for (let i = 0; i < curve.n; i++) {
    const T = curve.T[i];
    if (T > tPeak) tPeak = T;
    if (i + 1 < curve.n && T >= th.salvageHighT) highDwellMs += st[i + 1] - st[i];
    if (curve.weather[i] === 3) storm = true;   // WEATHERS[3] = STORM
  }
  // 尾窗张力（收尾态的量法）：舞台尾 endWindowS 秒内 T 均值
  const endFrom = durMs - th.endWindowS * 1000;
  let endSum = 0, endN = 0;
  for (let i = curve.n - 1; i >= 0 && st[i] >= endFrom; i--) { endSum += curve.T[i]; endN++; }
  const tEndMean = endN ? endSum / endN : 0;
  // 张力骨架（等舞台距采样·线性插值·指纹消费者）
  const skeletonN = th.skeletonN;
  const tSkeleton = new Float64Array(skeletonN);
  for (let k = 0, i = 0; k < skeletonN; k++) {
    const tau = (durMs * k) / (skeletonN - 1);
    while (i + 1 < curve.n && st[i + 1] <= tau) i++;
    const span = i + 1 < curve.n ? st[i + 1] - st[i] : 0;
    const f = span > 0 ? (tau - st[i]) / span : 0;
    tSkeleton[k] = curve.T[i] + (i + 1 < curve.n ? (curve.T[i + 1] - curve.T[i]) * f : 0);
  }

  // 时刻账（special 行＝状态边沿不计事件账；011-R 判据"错误"＝outcome FAIL）
  const bySig = new Map(), slots = new Set();
  let fails = 0, stuckEdges = 0, cleared = 0, resolves = 0, asks = 0, done = 0;
  for (const m of moments) {
    if (m.special) {
      if (m.special === 'STUCK_LOOP') stuckEdges++;
      else if (m.special === 'STUCK_CLEARED') cleared++;
      else if (m.special === 'RESOLVE') resolves++;
      else if (m.special === 'DONE') done++;
      continue;
    }
    if (m.slot) slots.add(m.slot);
    if (m.verb === 'ASK') asks++;
    if (m.outcome === 'FAIL') {
      fails++;
      if (m.sig) bySig.set(m.sig, (bySig.get(m.sig) || 0) + 1);
    }
  }
  let maxSameSigRepeat = 0;
  for (const n of bySig.values()) if (n > maxSameSigRepeat) maxSameSigRepeat = n;

  return {
    durS, tPeak, tEndMean, tHighDwellS: highDwellMs / 1000, tSkeleton, storm,
    fails, distinctSigs: bySig.size, maxSameSigRepeat, files: slots.size,
    stuckEdges, cleared, resolves, asks, done, moments: moments.length,
  };
}

const f2 = (x) => (Math.round(x * 100) / 100).toString();

// 八枚谓词（与 SEALS 同序）：每枚答〔中没中，为什么〕——why 即阶段一悬停判章理由的粮。
function checksOf(f, th) {
  return [
    { id: 'ROUGH_MIX', hit: f.tEndMean >= th.roughEndT,
      why: `尾窗T̄=${f2(f.tEndMean)}${f.tEndMean >= th.roughEndT ? '≥' : '<'}${th.roughEndT}（收工张力${f.tEndMean >= th.roughEndT ? '未解' : '已落'}）` },
    { id: 'SALVAGE', hit: f.tHighDwellS >= th.salvageDwellS && f.tEndMean <= th.salvageEndT,
      why: `高张力(≥${th.salvageHighT})驻留${Math.round(f.tHighDwellS)}s${f.tHighDwellS >= th.salvageDwellS ? '≥' : '<'}${th.salvageDwellS}s·尾窗T̄=${f2(f.tEndMean)}${f.tEndMean <= th.salvageEndT ? '≤' : '>'}${th.salvageEndT}` },
    { id: 'ONE_TAKE', hit: f.fails <= th.oneTakeMaxFails && f.tPeak <= th.oneTakeMaxPeakT,
      why: `报错${f.fails}${f.fails <= th.oneTakeMaxFails ? '≤' : '>'}${th.oneTakeMaxFails}·峰值T=${f2(f.tPeak)}${f.tPeak <= th.oneTakeMaxPeakT ? '≤' : '>'}${th.oneTakeMaxPeakT}` },
    { id: 'LOCKED_GROOVE', hit: f.maxSameSigRepeat >= th.grooveMinRepeat,
      why: `最大同签名错误重复${f.maxSameSigRepeat}${f.maxSameSigRepeat >= th.grooveMinRepeat ? '≥' : '<'}${th.grooveMinRepeat}` },
    { id: 'LONG_PLAY', hit: f.durS >= th.longPlayMinS,
      why: `时长${Math.round(f.durS / 60)}min${f.durS >= th.longPlayMinS ? '≥' : '<'}${th.longPlayMinS / 60}min` },
    { id: 'JAM', hit: f.durS >= th.jamMinS && f.files >= th.jamMinFiles && !f.storm,
      why: `时长${Math.round(f.durS / 60)}min·目标槽${f.files}·${f.storm ? '入过风暴' : '未入风暴'}` },
    { id: 'DEMO', hit: f.durS <= th.demoMaxS,
      why: `时长${Math.round(f.durS / 60)}min${f.durS <= th.demoMaxS ? '≤' : '>'}${th.demoMaxS / 60}min` },
    { id: 'DAILIES', hit: true, why: '寻常的一天，如实归档（兜底章）' },
  ];
}

// 判章（全函数律：每带必得且仅得一枚——DAILIES 兜底保总律）。
// 返回 { id,en,zh,reason,checks }；reason＝中章理由，checks＝八枚全体（悬停/报告用）。
export function judgeSeal(features, th = SEAL_THRESHOLDS) {
  const checks = checksOf(features, th);
  const winner = checks.find((c) => c.hit);
  const seal = SEALS.find((s) => s.id === winner.id);
  return { id: seal.id, en: seal.en, zh: seal.zh, reason: winner.why, checks };
}

// C-编号吸附阶梯（011-R2 戊.1）：C30/C45/C60/C90/C120；超 120 印真实分钟数（时代诚实：
// 73 分钟录在一盘 C90 上；C247＝通宵局的荣光）。向上取整——壳必须装得下录音。
export const C_LADDER = [30, 45, 60, 90, 120];
export function snapC(durS) {
  const min = Math.max(1, Math.ceil(durS / 60));
  for (const c of C_LADDER) if (min <= c) return `C${c}`;
  return `C${min}`;
}
