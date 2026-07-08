// 类型面（livebridge.js 的 .d.ts，形制同 core/graph）：流式声桥大脑。
import type { SoundParams } from './core.js';
import type { SoundEngine } from './graph.js';

/** 到达的连续状态包（协议 StatePacket 的声侧消费面；stageT 等其余字段渲染器不读）。 */
export interface LivePacket {
  needle: number;
  T: number;
  A: number;
  wow: number;
  phase: string;
  weather: string;
  pendingAsk: boolean;
}

/** 到达的时刻事件（协议 MomentEvent 的声侧消费面；tags 双容：live 数组／CSV 竖线串）。 */
export interface LiveMoment {
  t: number;
  verb?: string;
  outcome?: string;
  special?: string | null;
  tags?: string[] | string;
  slot?: string;
}

export interface LiveBridge {
  onPacket(pkt: LivePacket): void;
  onMoment(m: LiveMoment): void;
  pump(): void;
  stats(): { audio0: number; rows: number; packets: number; moments: number; fired: number; held: number };
}

export interface LiveBridgeOpts {
  clock?: () => number;
  lookaheadSec?: number;
}

export function createLiveBridge(eng: SoundEngine, SP: SoundParams, opts?: LiveBridgeOpts): LiveBridge;
