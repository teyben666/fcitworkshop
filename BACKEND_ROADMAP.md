# Currency Safe — 自建后端排期

> WebSocket + Postgres（或 JSON 回退），配合 Cloudflare Tunnel 外网访问。

## 总览

| 阶段 | 主题 | 状态 |
|------|------|------|
| **B0–B4** | WS 骨架 / 房间 / 对局 / 经济 | ✅ |
| **B5** | Tunnel & QA 冒烟 | ✅ `npm run qa` |
| **B6** | 密码 / 写锁 / 归档 / PM2 / 重连 | ✅ |
| **B7** | Postgres / 清理 / 历史 UI / 令牌哈希 | ✅ |
| **B8** | 动效 & 新小游戏 | 📋 暂缓 |

## B7 已交付

| 项 | 说明 |
|----|------|
| **Postgres** | 设 `DATABASE_URL` 即用；未设则 `server/data/rooms.json` |
| **空闲清理** | 默认：lobby 空房 24h、ended 房 2h 后删除（可 env 配置） |
| **历史赛局 UI** | `history.html` + `GET /api/history` + `GET /api/history/:id/:endedAt` |
| **进房令牌** | SHA-256 哈希存储；房主「生成/刷新」仅显示一次明文 |

## 启动

```bash
cd server
npm install
npm start
```

### Postgres（推荐长期课堂）

```bash
# 仓库根目录
docker compose up -d

# Windows PowerShell
$env:DATABASE_URL="postgresql://currency:currency@localhost:5432/currency_safe"
cd server
npm start
```

schema 在首次启动时自动执行（`server/db/schema.sql`）。

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `DATABASE_URL` | — | 设置后用 Postgres |
| `JOIN_TOKEN_SALT` | 内置 dev 盐 | 生产务必改掉 |
| `ROOM_LOBBY_IDLE_MS` | 86400000 | 空 lobby 清理 |
| `ROOM_ENDED_RETAIN_MS` | 7200000 | ended 房保留 |
| `ROOM_CLEANUP_INTERVAL_MS` | 3600000 | 清理间隔 |

### 常开

```bash
pm2 start ecosystem.config.cjs
pm2 save
```

课前：`/health` → `"storage":"postgres"` 或 `"json"`。

## 架构

```
浏览器 → room-ws.js
       → server/index.js
       → RoomStore (内存缓存 + 异步落库)
       → db/postgres | db/json-store
       → match_history / history.html
```

## QA

```bash
cd server
npm run qa
```

手测清单：[B5_QA.md](./B5_QA.md)

## 规则

[ROOM_RULES.md](./ROOM_RULES.md)
