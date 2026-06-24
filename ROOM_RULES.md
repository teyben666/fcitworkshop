# Currency Safe — 课堂规则（ROOM RULES）

## 模式

### Practice 练习模式
- 密码轮换：20 分钟
- 每目标部署次数：不限
- 适合试讲与熟悉三关

### Competitive 竞赛模式
- 密码轮换：12 分钟
- 每目标部署次数：最多 3 次
- 适合正式比赛与排名

## 身份

| 身份 | 权限 |
|------|------|
| **Player** | 选州、互攻、三关闯关、转账 |
| **Spectator** | 观战排行榜与 Activity，不可操作 |
| **Host** | 选模式、Shuffle、开始游戏 |

## 对战规则（真人互攻）

- **无 AI 队伍**，地图上均为真人 Player
- 至少 **2 名玩家** 才能开始
- 点击地图上其他玩家金库选择攻击目标
- 完成三关后可破解对方金库并模拟转账

## Shuffle

- **Shuffle 分队**：打乱玩家列表顺序
- 可选 **随机分配州属**：Shuffle 时一并重新分配马来西亚州

## Phase 1 原型说明

- 房间数据存在浏览器 `localStorage`
- 同一电脑多标签可模拟多人
- 多设备同房需等待 Phase 5（Firebase 同步）

## Phase 2 真人互攻（已实现）

- 攻击目标为房间内其他 **真人玩家**金库（非 AI）
- 对手密码来自对方真实设置，**不会**在本地被随机生成
- **破解**与**转账**通过房间 API 原子同步余额
- 被转账方会收到警报；密码被轮换时会收到提示
- **竞赛模式**：每目标最多部署 3 次截获任务；**练习模式**不限
- 观战者可查看 Activity 与转账记录

## Phase 3 Shuffle + 模式（已实现）

- Fisher–Yates 打乱玩家顺序；可选无重复随机州属（玩家数 ≤ 15 州时）
- 大厅地图预览随 Shuffle 更新图钉
- 练习：`missionStats` 仅练习模式记录；竞赛：排行榜余额排序锁定

## Phase 4 观战（已实现）

- 三 Tab：地图（只读）/ 排行榜 / Activity
- Activity 事件：`target_selected`、`mission_deployed`、`level_complete`、`level_fail`、`password_rotated`、`password_expired`、`vault_breach`、`transfer` 等
