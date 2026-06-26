# Currency Safe — 分队 + 央行（历史 + 指针）

> **当前总排期请以此为准**：[IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)  
> **课堂规则**：[ROOM_RULES.md](./ROOM_RULES.md)

---

## 已完成（Phase 1–5）✅

| Phase | 内容 |
|-------|------|
| 1 | `room.teams[]`、`room.bank`、`teamDeployCounts`、`player.teamId` |
| 2 | 大厅分队 UI、Shuffle、加入选队 |
| 3 | 游戏内目标列表、队级 deploy、央行 `__BANK__` |
| 4 | 旧结算：基础 25%、失误 −1%、`applyTransfer` / `applyBankTransfer` |
| 5 | 观战、文档初版 |

**说明**：Phase 4 的 **25% 个人向结算** 将在新路线图 **Phase 1 + 3** 中替换为 **队库 + 集体攻坚奖池**。

---

## 进行中 / 待做（Phase 6+）

见 [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)：

| 新 Phase | 主题 |
|----------|------|
| 1 | 队库经济 `team.vaultBalance` |
| 2 | 关卡池 +mastermind +fragsort |
| 3 | 集体攻坚 25–40% 池 + 失误/20 |
| 4 | 央行闪灯（2min / 4min，3s+呼吸+3s） |
| 5 | 阅读情报 Bonus（2k–5k 扣款） |
| 6 | 分队榜 + 个人榜 |
| 7 | Firebase 全量同步 + QA |
| 8 | 动效打磨 |

---

## 课堂参数（新规则，取代下表旧收益行）

| 参数 | 练习 | 竞赛 |
|------|------|------|
| 每队每目标部署 | ∞ | 3 |
| 央行初始池 | RM 50,000 | RM 50,000 |
| 攻坚奖池上限 P | 25–40% 目标队库 | 同左 |
| 攻坚失误 | 份额 × (1 − n/20) | 同左 |
| 央行闪灯间隔 | 2 分钟 | 4 分钟 |
| Bonus 池 | RM 2k–5k + 时间/答错扣 | 同左 |

~~收益基础 25%~~ → 见 ROOM_RULES 集体攻坚与 Bonus 章节。
