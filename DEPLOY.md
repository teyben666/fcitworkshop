# Currency Safe — 部署指南（Phase 5 + 6）

## 文档索引

| 文档 | 用途 |
|------|------|
| [ROOM_RULES.md](./ROOM_RULES.md) | 教师 / 学生课堂规则（队库、攻坚、央行 Bonus） |
| [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) | **总实施排期**（Phase 0–8、验收、文件索引） |
| [MISSION_DESIGN.md](./MISSION_DESIGN.md) | 关卡玩法规格（颜色、碎片、阅读情报） |
| [TEAM_BANK_ROADMAP.md](./TEAM_BANK_ROADMAP.md) | 已完成分队/央行 + 指向新排期 |
| [UI_ROADMAP.md](./UI_ROADMAP.md) | HUD / i18n / 观战 UI |

---

## 静态站点

将以下文件部署到 **GitHub Pages / Netlify / Vercel** 等静态托管：

- `index.html`, `lobby.html`, `game.html`, `ended.html`, `spectator.html`
- `malaysia.png`
- `css/`, `js/`（含 `fx.js`）

## WebSocket 服务器（多设备课堂）

课堂多人同步使用自建 Node 服务，见 [BACKEND_ROADMAP.md](./BACKEND_ROADMAP.md)。

```bash
cd server
npm install
npm start
```

- 本机：http://localhost:8787  
- WebSocket：`wss://你的域名/ws`（Cloudflare Tunnel 指向 `localhost:8787`）  
- 健康检查：`/health`  

`js/server-config.js` 中 `enabled: false` 时回退 **localStorage**（同浏览器多标签演示）。

### 进程常开（PM2）

```bash
npm install -g pm2
cd server
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # Linux/macOS；Windows 可用任务计划程序
```

课前检查：`https://你的域名/health` 与 `pm2 status`。

自动化冒烟：`cd server && npm run qa`（需本机 `npm start` 已运行）。

赛后归档：`server/data/history/` 或 Postgres `match_history`；浏览 **`history.html`** 或 `GET /api/history`。

### Postgres（B7）

```bash
docker compose up -d
# PowerShell:
$env:DATABASE_URL="postgresql://currency:currency@localhost:5432/currency_safe"
cd server && npm start
```

未设置 `DATABASE_URL` 时仍用 JSON 文件（试讲够用）。

### 进房令牌

房主在大厅开启后进房令牌 → **生成/刷新** → 把一次性显示的令牌发给学员；服务器只存哈希。

### 空闲房间清理

默认每小时清理：空 lobby 超过 24h、已结束房间超过 2h。可用 `ROOM_LOBBY_IDLE_MS` / `ROOM_ENDED_RETAIN_MS` 调整。

### 验收（3+ 设备）

1. 设备 A 创建房间，记下房间码  
2. 设备 B/C 加入并选 Player  
3. Host 开始游戏 → 各端地图图钉、Activity 应在 1–2 秒内同步  
4. 互攻、转账后观战端排行榜与 Activity 更新  

## 断线重连

- `sessionStorage` 保存 `csClientId` + `csRoomId`  
- 刷新页面或重新打开链接 `lobby.html?room=AB12` 即可回房  
- WebSocket 模式下 `CurrencySafeRoom.reconnectRoom()` 自动拉取最新房间状态  

## 教师功能（Host 面板 · 大厅）

| 功能 | 说明 |
|------|------|
| 开始游戏 | 至少 2 名玩家（可勾选强制开始） |
| Shuffle 分队 | 打乱队员，每 4 人一队（保留州属） |
| 随机重分州属 | 分队不变，重新随机各队州 |
| 进房密码 | 房主可选开启，防陌生人扫 Tunnel 乱入 |
| 踢出玩家 | 移出指定 Player |
| 结束比赛 | 房间状态 `ended`，全员可导出成绩 |
| 导出 CSV | 排名 + Activity 摘要 |

## 课前测试清单

- [ ] Practice 试讲 30 分钟（2–4 人）
- [ ] Competitive 模拟赛 1 次（部署 3 次上限）
- [ ] 观战端三 Tab：地图 / 排行榜 / Activity
- [ ] 赛后 Host 导出 CSV
- [ ] （新规则上线后）队库入账、集体攻坚分池、央行闪灯 Bonus — 见 [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md) Phase 7 清单

## 开发项已关闭

- 校准网格：`showCalibrationGrid: false`
- 单人练习：保留 `currency_safe_world_map_ctf_singleplayer.html` 作离线试讲
