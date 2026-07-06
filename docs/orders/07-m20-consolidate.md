<!-- 原名：TAPE0_ORDER_M20.md ｜ ARCHIVE-1 编年迁移，正文未改 -->
# TAPE-0 施工令 · M2.0 收摄与接线

> 双轨分工：§1 归 Track-FIX（管 root/cli/docs 围栏）；§2 归 Track-STAGE。§0 为两轨共同追认。
> 声音相不在本令内——船长×调音抽屉的耳朵回路继续自转，稳定后再进白皮书 §6 验收。

---

## 0. 追认与入宪

1. **M-S2 验收通过。**卷轴材质深度（带饼缠绕光泽环＋轴毂五金）入冰箱 v1.x 打磨项。
2. **手记·现实修正四 → 入宪为《素材诚实条款》**：一切性格照、屏录、发布素材必须回放真实磁带，不摆拍、不替磁带演它没有的戏。jam 定妆照候狩猎 v2 真卡碟带接任后重拍。
3. 手记·现实修正五（广播环改间隔钟，钟不随标签页睡）：**追认**。
4. **域名决议**：注册 `foleytape.com`（与 org 同名、复合词即可保护标识）；`foley.fm` 入观察清单，发布挣到之后再谈。
5. 命名迁移：远端迁至 `foley-tape/foley`；历史文档名（TAPE0_*）保留不改，零翻新税。

## 1. Track-FIX · 仓库收摄

### 1.1 docs/ 结构（项目记忆的唯一的家）
```
docs/
  canon/      # SPEC、WHITEPAPER_SENSES、琥珀宪法（自 SPEC 附录抽出成篇）
  orders/     # M15…M2.0 全部施工令 + NIGHT1
  records/    # 按里程碑归档：m15/ m16/ m17/ m18/ m19/ 各含当轮 交接+REPORT+手记 快照
  decisions/  # naming.md（命名决议全文）、priority-canon.md
```
船长桌面的手令堆按此归位入仓；入仓即受版本控制，Claude Code 原生可读，也是未来"这台机器是怎么造出来的"发布长文的底片库。

### 1.2 runs/ 清扫规约
- 命名统一 `<kind>-<tape>-<ts>/`（kind ∈ replay/sweep/probe/ear/soak）。
- 新命令 `foley runs prune --keep 3`：每 kind 保留最近 3 份，其余删除。runs/ 仍 gitignore。
- **晋升规则**：任何值得留的产物（定妆照、封版 REPORT、盲听包）晋升入 `docs/records/`，runs/ 里的一切默认可弃。

### 1.3 README 落地
以 `README_DRAFT.md` 为底稿落 `README.md`：插图三张（hero=deck-storm；loupe 微距；asleep 静场）从性格照截取入 `docs/assets/`；whitepaper 链接对齐 1.1 新路径；中文说明留 `README.zh.md` 占位链接。**上首屏的隐私段一字不删。**

### 1.4 悬账回收
- 狩猎 v2 结果随本轮 FEEDBACK 报状态（寻获入册／继续记缺）。
- 声音相当前 sound-params hash 与调音轮次数报备一行（不催收，只留痕）。

## 2. Track-STAGE · M-S3 接线

1. 舞台接 **live 实流**（Track-FIX 的真 20Hz 广播）：live 为默认模式，fixtures 保留为 replay 模式。
2. 验证两件事：墨线阶梯在 20Hz 下应自然消失；隐藏标签页下 live 钟照走。
3. live 版性格照择机补拍（素材诚实条款适用）。
4. 禁令照旧：不做导出/分享；数字仍只活在 loupe。

## 3. 地平线（知悉即可，勿抢跑）

1. **预告片设计轮**＝架构师下一份设计案（高光选段算法＋撕纸带交互＋配乐渲染），交案后开 v1.1 施工。
2. 声音相稳定 → 白皮书 §6 验收（盲听 v2 单卷冷听＋床-张力相关性机器判）。
3. 以上齐 → 发布物料轮（hero GIF、发帖文案、静态 demo 页——用打包示例带的只读舞台，装都不用装就能看）。

## 4. 交付清单
- [ ] docs/ 归位 + runs prune 命令 + README.md 落地 + org/repo 迁移
- [ ] 狩猎 v2 状态一行
- [ ] M-S3：live 接线 + 两项验证 + FEEDBACK-STAGE
- [ ] 两轨手记照旧

（完）
