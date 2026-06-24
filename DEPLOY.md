# Currency Safe — 部署指南（Phase 5 + 6）

## 静态站点

将以下文件部署到 **GitHub Pages / Netlify / Vercel** 等静态托管：

- `index.html`, `lobby.html`, `game.html`, `ended.html`, `spectator.html`
- `malaysia.png`
- `css/`, `js/`（含 `fx.js`）

## Firebase Realtime Database（多设备课堂）

### 1. 创建 Firebase 项目

1. 打开 [Firebase Console](https://console.firebase.google.com/)
2. 新建项目 → 启用 **Realtime Database**（测试模式可先开，课堂前改规则）
3. 项目设置 → 你的应用 → Web → 复制配置对象

### 2. 本地配置

编辑 `js/firebase-config.js`：

```javascript
window.CURRENCY_SAFE_FIREBASE = {
    enabled: true,
    apiKey: "AIza...",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "...",
    appId: "..."
};
```

`enabled: false` 时自动使用 **localStorage**（同浏览器多标签演示）。

### 3. 数据库规则（课堂示例）

在 Firebase Console → Realtime Database → Rules：

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

> 正式公开课建议配合 Firebase Auth 或 Cloud Functions 收紧写入权限。当前原型为课堂快速上线，客户端校验 Host / Player 角色。

### 4. 验收（3+ 设备）

1. 设备 A 创建房间，记下房间码
2. 设备 B/C 加入并选 Player
3. Host 开始游戏 → 各端地图图钉、Activity 应在 1–2 秒内同步
4. 互攻、转账后观战端排行榜与 Activity 更新

## 断线重连

- `sessionStorage` 保存 `csClientId` + `csRoomId`
- 刷新页面或重新打开链接 `lobby.html?room=AB12` 即可回房
- Firebase 模式下 `CurrencySafeRoom.reconnectRoom()` 自动拉取最新房间状态

## 教师功能（Host 面板 · 大厅）

| 功能 | 说明 |
|------|------|
| 开始游戏 | 至少 2 名玩家（可勾选强制开始） |
| Shuffle | 打乱顺序 / 可选随机州属 |
| 踢出玩家 | 移出指定 Player |
| 结束比赛 | 房间状态 `ended`，全员可导出成绩 |
| 导出 CSV | 排名 + Activity 摘要 |

## 课前测试清单

- [ ] Practice 试讲 30 分钟（2–4 人）
- [ ] Competitive 模拟赛 1 次（部署 3 次上限）
- [ ] 观战端三 Tab：地图 / 排行榜 / Activity
- [ ] 赛后 Host 导出 CSV

## 开发项已关闭

- 校准网格：`showCalibrationGrid: false`
- 单人练习：保留 `currency_safe_world_map_ctf_singleplayer.html` 作离线试讲
