// 声音相模块入口（SOUND-R1 重构）。
// 实现三分：core.js 纯映射律（Node/浏览器逐字同源，probe 页内嵌真源——手抄同源律从此灭绝）、
// graph.js 音频图注册表＋方案 B（渲染的唯一真身，probe 页与离线机器耳朵跑同一份）、
// offline.ts 离线渲染语义（机器耳朵的耳膜，仅 Node）。
// 本文件只做 TS 门面：老进口（cli/、golden/）路径与命名一律不变。

export {
  resolveSoundParams, clamp01, dbToLin, linToDb,
  bedTargets, recordTargets, bedEnergyDb, bedRmsDb,
  habituationGain, quantizeUpSec, degreeOf, rootMidiOf, midiToHz, degreeHz, askMotifHz,
  WEATHER_IDX, PHASE_IDX, buildTrack, sampleAt, pearson,
} from './core.js';
export type { SoundParams, BedState, BedTargets, RecordTargets, TrackRow } from './core.js';
