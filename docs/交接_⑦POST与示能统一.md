# 转交文档 · ⑦示能统一＋POST 开机自检（压缩上下文后的开工圣经）
2026-07-12 签发 · 上一段上下文收官于：拓扑重建（板 v10）交付

## 〇、开工三动作（不可跳）
1. 通读 repo 根 `FOLEY_LEDGER.md`（唯一权威·工作法六条·发现栏必扫）。
2. 验环境：`curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4181/` 须 200；
   再 `curl http://127.0.0.1:4181/js/flapboard.js | head -c 40` **验喂码**（serve 僵尸事故在案：进程在监听死，
   Chrome 吃缓存旧页造成无报错假验收）。serve 死了就 `node stage/serve.mjs 4181`（注意端口参数，缺省是 4173）。
3. 金测基线：`npm test` 预期 **155 例 152 过**（3 例 = b4.factory 在案环境性，须干净检出才真；别练出对红的麻木——见复盘 R9）。

## 一、当前状态快照
- 分支 `track/decree5-p0-e1`，大量 stage/、art/ 改动**未提交**（纸面件已提交）。船长未下提交令，别顺手 commit。
- 板 = **plate v10**（`stage/assets/plate.webp`+`plate.coords.json`）：下半区三分法（短铭牌两行档案/双琴键/Solari×1.5 壳烙板）＋DUB 键（全四边面凹碟＋`— DUB —` 键床铭文）＋三扇 dead-front 暗面信号窗。
- 灯语 = 光机融合定稿：**CUE 氩蓝梯形呼吸 / WRAP 钨丝点火（过冲 1.12→稳态→余温红拖尾）/ LINE 红宝石恒基底 0.12**；
  字由 DOM 光生（`.df-text`，`--lit`/`--ember`），Lamps 类（instruments.js）是唯一写者。修正案在册：唯一信号亮红归 REC，≤0.15 红宝石属基底照度。
- 翻字牌 = flapboard.js（41 字环单向前滚/WAAPI 折叶/末翻 thunk 回弹 0→−180→−172→−180/90° 边光切变/12 格硬截/1150ms 帽/`?flapslow[=N]` 慢放口）。软落针钉末翻触底帧（0.72×D）。
- 一切"已交候船长眼"细目与证据路径见账本证据栏（P0×5→质感批→圈选批→底盘重构→①拆字→光机融合→微观整改→拓扑重建）。

## 二、⑦ 的任务书（BATCH3 乙-6 原文 + 后续修订合流）
**POST 开机自检**：手势解锁后 3–4 秒的零文字新手教程，兼 demo GIF 开场镜头：
- VU 满幅一甩归位（针 0→满→归）
- 记录仪笔全幅校准扫摆（④令明文"开机校准扫摆归⑦POST 收编"——penHead translateY 全程上下一遍）
- **三窗序亮**（原"三灯序眨"随光机融合升级）：CUE→WRAP→LINE 逐窗点字——这就是灯语教学第一课；WRAP 用真点火曲线（surge 注入），别做假淡入
- 魔眼开合一轮（⚠️**先做几何纠偏**，见下）
- 翻字牌空翻（哗啦一轮不改字——建议给 flapboard 加 `sweep()`：每格滚整环回原字，错峰同 set()）
- 双盘四分之一转起步
教学兜底链定稿：PLAY 唯一呼吸→光随指针→POST→机械拒绝→悬停铭牌→（终极）印刷说明卡。**禁一切现代教程弹窗**。

**示能统一**：全机交互件一种语言——hover=暖光晕（radial rgba(255,214,150,…)）、按下=键沉三件套（面暗/顶影/蚀刻沉）、cursor:pointer。
扫荡名单：#deck（走带甲板）、#song-keys 双键、#dub-key、#dub-lengths 纸签、货架卡带。逐件对齐现行琴键/DUB 键语法，别发明新的。

**前置硬项（发现栏原令）——魔眼几何纠偏**：暗核偏左上（船长直报）。修法：从 plate.webp 全分辨率量烙板魔眼管的真圆心（coords `eye` bbox 为近似，管内凹面中心以像素实测），把 `#magic-eye` 的 .eye-glow/.eye-pupil 锚点校到实测圆心（CSS 内偏移），**纠偏完成后再接 POST 开合动画**。

## 三、POST 工程设计（已想过的决策，直接用）
- 新模块 `stage/js/post.js`：时间轴编排器，直接调器件把手（POST 是仪式不是数据，不走包总线）：
  - VU：临时 `vu.source = () => 扫摆dB` 或直接驱动 `vu._move.step(target)`（VuMovement 二阶弹簧自带机械感——满幅一甩用它，免费的过冲回弹）；结束还原原 source。
  - 笔：`chart.penHead.style.transform = translateY(...)` 全幅上下（记得走 chart._penTy 去重路径或直接写后复位；纸不动、不写墨）。
  - 三窗：Lamps 把手在 `window.__stage.lamps`——CUE=askEnv 短暂置 1（配梯形自然亮）、WRAP=`lamps.surge=0.42; lamps.heat 由 phase 驱动`——更稳法：给 Lamps 加 `post(t)` 覆写通道，POST 期间 Lamps.render 读覆写值，免与真包打架。
  - 翻牌：`flap.sweep()`（新增，见上）。
  - 双盘：ReelDeck 吃包驱动——POST 期喂两枚合成包（needle/A 拉高 ¼ 转）或给 deck 加 `nudge(rad)` 把手。选后者干净。
- **时序防打架**：POST 运行期缓存进包（feedPacket 前加 gate），POST 毕回放缓存——或更简单：POST 只在 EMPTY/首手势后、live 自动装带的 CUEING 窗口里跑（冷启首选带竞态发现栏：手势→声桥起桥本来就要 2.5s——POST 的 3-4 秒恰好盖住这个尴尬窗口，双赢）。
- 诊断口：`?post=0` 跳过（录证据/回归验收要素面）；`?postloop=1` 循环放（调参用）。**新口必登记 docs/诊断口.md**。
- demo 页：POWER 按下后同一场 POST（两页同法）。
- 帧医生随检：POST 加层后跑 `?perf=1` 60s，LONG 必须 0（值班律）。

## 四、坑谱（这一段上下文用血换的，⑦ 直接相关）
1. **验收姿势**：强制值（setProperty）会被活包络写者覆写/竞态假阴——死面/灯类验收用免手势页或钳住写者（`lamps.onPacket=()=>{}`）；快门要避开梯形呼吸暗相。
2. 手势→选带 <2.5s 拍死起桥声桥；验声必带 `--autoplay-policy=no-user-gesture-required`。
3. **朴素像素检测器全线不可信**（盲窗/阈值/降采样三次翻车）：验收=DOM 反解定位+全分辨率裁片+**目验**；数字只做辅助。
4. Chrome 采集环：scratch profile+9223+防节流 flags（gate_record 惯例）；scratchpad 会被系统轮转清空——**验收脚本用完即弃，重要的该进 repo stage/tools/**（复盘 R6，⑦ 里就照做）。
5. Blender 侧（若需渲染）：布尔切平面=N-gon 着色崩溃，凹槽一律位移网格；薄件顶面必须出母面（两起埋葬事故）；镜像机位下文字用纹理管线且源图预翻转；渲 sprite 时 rec_tip/rec_arm 是隐形影子柱须 hide_render；灯的光斑亚像素会被 AA 吃（超采样→页坐标回贴旧框→缩回）。
6. CSS 双表战争：stage.css 的旧 ID 级规则会压过 plate.css 的 .ov 类（琥珀管尸体案）——新层遇怪异定位先 `getBoundingClientRect` 对坐标，再 grep 两张表同名选择器。
7. 帧医生/样式写纪律：值不变零写（_put/去重门先例），POST 动画结束必须归还静止零写状态。

## 五、复盘（本段上下文的自省——船长与架构师都没点名的）
R1 **局部预览闸缺失**：板级重渲 ~6min×8 次，其中至少 3 次只为验证单件小改（铭文埋没/玻璃吞没/反书）。该立"peek 渲染"惯例：改动件 bbox 局部裁渲 64spp 半分钟先过目，再上 640spp 全板。⑦ 若需渲染，先 peek。
R2 **场景自检断言缺失**：两起"埋葬事故"（顶面没出母面）纯属可断言错误——build 函数里加几条 assert（proud 件面高>母面）成本近零。
R3 **验收器具漂泊**：still.mjs/verify 脚本在 scratchpad 死了三回、重写三回。器具当入 `stage/tools/verify/`（audit/tools 有先例）。
R4 **证据堆平铺**：~/Desktop/至架构师/ 已 60+ 文件平铺，船长翻找成本渐高——建议按批次建子目录归档（老证据移入 `归档_YYMMDD/`），新批次一目录。
R5 **coords→CSS 手搬**：placement 打印后人肉抄进 CSS，抄错无守护。坐标单源（队列 3）落地前，至少写个 diff 脚本对 coords.json 与 plate.css 数值。
R6 **B4 常红麻木化**：每轮"152/155 过（3 例在案）"——红灯常亮训练出忽视红灯的手。金测该按环境探测 skip-with-reason，让套件恢复"绿=真绿"。
R7 **纹理工艺分散**：vu_texture/paper/dub_legend 各写各的受光唇/漆面参数——工艺语法（唇色/槽影/漆面亮度）该抽公共配方，免同机不同味。
R8 **双页接线三处复制**：flap/曲单/onRecordChange 在 main.js 与 demo-boot.js 各抄一份——第三处复制出现时抽 boot 共件。
R9 **交互无声**：琴键/DUB 键按下是哑巴（视觉键沉无声）——机械件该有极轻按键声（声资产纪律内提案，归声音线排期，非 ⑦ 私自加）。
R10 **REC 视觉语言分叉（有意保留）**：REC 仍是宝石而三灯已窗化——REC 是机器的血，独一档，属设计决定非遗漏；写此备忘免后人"顺手统一"。
R11 **doctor 未收编新诊断口**：`foley doctor` 不知道 ?perf/?vufreeze/?flapslow 等口的存在——顺手项：doctor 末尾打印注册表摘要（⑥户口册批一起做更顺）。
R12 **LIVE 档案行无时长**：`LIVE · RECORDING` 可加流逝时长（微件，候船长要不要）。

## 六、⑦ 完工定义
魔眼纠偏帧（前后对照）＋POST 全场录制（真 Chrome 带声 mp4·手势→3-4s 仪式→交还正常态）＋示能扫荡清单逐件截图＋帧医生 60s LONG=0＋金测/tsc 绿＋两页同法证＋诊断口登记＋**账本证据栏回写＋MEMORY 更新**。总验收线不变：船长十分钟一句话「运行态的机器像活物，且我能说出每件东西是干嘛的」。⑦ 之后只剩 ⑥杂症＋器件户口册。
