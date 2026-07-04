// protocol v1 — 字段名即十年后的地基。改动需架构师签核，且只许新增。
// 冻结自 TAPE0_SPEC_v0.1 §7。此文件冻结后只增不改。

export type Verb = 'READ' | 'WRITE' | 'RUN' | 'SAVE' | 'ASK' | 'SPAWN' | 'OTHER';
export type Outcome = 'OK' | 'FAIL' | 'NA';
export type Phase = 'IDLE' | 'WORKING' | 'WAITING' | 'DONE';
export type Weather = 'CLEAR' | 'OVERCAST' | 'RAIN' | 'STORM';

export type Special =
  | 'SESSION_START'
  | 'DONE'
  | 'STUCK_LOOP'
  | 'STUCK_CLEARED' // 增项：卡碟解除（TAPE0 施工令 M1.5 §4.3，架构师签核，只增不改）
  | 'RESOLVE'
  | 'ASK_CLEARED';

export interface MomentEvent {
  kind: 'moment';
  t: number;
  seq: number;
  agent: string;
  verb: Verb;
  outcome: Outcome;
  m: number;
  tags: string[];
  special?: Special;
  sig?: string;
  k?: number;
}

export interface StatePacket {
  kind: 'state';
  t: number;
  agent: string;
  S: number;
  T: number;
  A: number;
  wow: number;
  needle: number;
  phase: Phase;
  weather: Weather;
  pendingAsk: boolean;
}

export interface LyricEvent {
  kind: 'lyric';
  t: number;
  agent: string;
  text: string;
}

export type Packet = MomentEvent | StatePacket | LyricEvent;
