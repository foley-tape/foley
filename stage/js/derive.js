// deriveMachineState —— 状态契约（docs/状态契约_模式灯语真值表.md v1.3）的可执行正文。
// 席二工单 3 立法 · D2 修法收紧：四源（transport 广播/连接态机/selector 档位/producer 心跳）
// ＋done 输入归一为导出态，页面一切状态性渲染只读本函数输出——非法帧（OFF∧REC 红、
// 非 live∧琥珀、琥珀先于红 等）自此在类型上不可能。纯函数·零 DOM·两页同法；
// 金测穷举全组合空间执法（golden/derive.test.ts）。
//
// inputs：
//   power       'off'|'test'|'on'          selector 档位（POST 演出借用不经此——R7 灯语借用在 Lamps 内部）
//   phase       'EMPTY'|'CUEING'|'PLAYING'|'PAUSED'   transport 广播（serve 权威）
//   sourceKind  'live'|'session'|'factory'|'none'     上机带血统（transport.loaded 派生）
//   link        'connecting'|'live'|'lost'|'gone'     live 连接态机（仅 live 带有意义）
//   producer    null|'alive'|'dead'|'ended'           生产者心跳四值（v1.1）
//   pendingAsk  boolean                                transport 保活字段（rule 4 唯一读点）
//   done        boolean                                引擎 DONE 态（页侧包相位）——settled 唯一输入源（v1.3）
export function deriveMachineState(S) {
  const power = S.power ?? 'on';
  const live = S.sourceKind === 'live';
  const producerGone = S.producer === 'dead' || S.producer === 'ended';   // 猝死与善终都不再录（R1 v1.1）

  // R1 红灯八闸：五因子缺一即灭——OFF/TEST 永灭·断链灭·猝死/善终灭
  const recording = power === 'on' && live && S.phase === 'PLAYING' && S.link === 'live' && !producerGone;

  return {
    recording,
    // R2 琥珀单义（v1.3）：asking ⟹ recording——琥珀不先于红；
    // 非 live/ended/未录/断链/断电 全零（等一个死人/画外人/未开录的问题都是谎言）
    asking: recording && !!S.pendingAsk,
    // R3 LINE 基底（v1.2）：线路灯——gone=源没了线没断，照亮；lost=链断，熄；OFF 熄
    linkLit: power !== 'off' && (!live || S.link === 'live' || S.link === 'connecting' || S.link === 'gone') ? 0.12 : 0,
    // R4 死相三词＋非法帧执法：OFF/TEST 无 cue；非 live 带恒 null；ended 无死相（善终不是死）
    signalCue: !live || power !== 'on' ? null
      : S.link === 'lost' ? 'lost'
        : S.link === 'gone' ? 'gone'
          : S.producer === 'dead' ? 'dead'
            : null,
    // R5 绿宝石（v1.3 实装）：历史事实（场成了）·power 门·不受 link/producer 覆盖
    settled: power !== 'off' && !!S.done,
    // R6 走带（D2 退役 transportRun 输出·席一复审 #4）：盘走/停无独立灯态，单写者＝replayer.play/pause
    //（随 transport phase·main.js applyTransport）＋断电 stopMachine；derive 不产无运行时消费者的死输出。
  };
}
