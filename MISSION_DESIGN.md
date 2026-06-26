# Currency Safe — 任务关卡设计规格

> 注册表：`js/mission-games.js`  
> 渲染与 generator：`game.html` + `js/mission-*.js`

---

## 通用接口

每个 kind 需提供：

```js
function generate(kindId, fragment, ctx) {
  return {
    kind: "mastermind",
    solved: false,
    reveal: "",           // 本关揭示的密码子串
    mistakes: 0,
    // kind-specific state...
  };
}
```

- `fragment`：从目标密码切出的一段（与现网 `splitPassword` 一致）。
- `ctx`：`{ password, target, player, origin }`。
- 完成后 `solved: true`，三关 `reveal` 拼接为破解串。

---

## 已有（enabled）

### typing — 拦截转账码

- 打字关键词；失误扣 `mistakesLeft`。
- 竞赛种子影响词表。

### dial — 破译密语

- 转盘对齐；`spinCount` 影响评分（旧）/ 失误（新攻坚）。

### grid — 潜入网格

- 5×5 记忆迷宫；`shields` / `scansLeft` 影响评分（旧）/ 失误（新攻坚）。

---

## 待做：mastermind — 热力破解器

### 故事

核保险箱需 4 色排列；可试探注入，系统用圆点反馈。

### 规则

| 项 | 练习 | 竞赛 |
|----|------|------|
| 色板 | 8 色 | 8 色 |
| 密码 | 4 色不重复 | 同左 |
| 最大猜测行数 | 10 | 8 |

### 反馈（标准 Mastermind）

1. 先数 **位置+颜色都对** → 🟢 绿点  
2. 再数 **颜色对、位置错** → 🟡 黄点  
3. **不用红点** 表示「不在密码里」（避免与黄点信息重复）；可选：用了几种不在密码里的颜色作弱提示。

### 失误

- 每提交一行错误猜测（未全对）→ `mistakes += 1`。
- 用完行数未解 → 部署失败，可重新部署（计队次）。

### reveal

- 4 色映射为 4 字符（如 `RYGB` 或数字），与 `fragment` 对齐或覆盖为 fragment 展示。

### UI

- 4 空槽 + 8 色按钮 + 猜测历史表 + 圆点列。

---

## 待做：fragsort — 组合密钥

### 故事

5 张碎片卡片，角标为打乱序号 ③①⑤②④；按 ①→⑤ 拖拽排序后拼接密钥。

### 规则

| 项 | 说明 |
|----|------|
| 卡片数 | 5 |
| 正面 | 每片 2 字符乱码（或色块图标，低年级） |
| 角标 | ①～⑤ 打乱显示 |
| 确认 | 点「锁定顺序」后校验 |

### 失误

- 顺序错误 → `mistakes += 1`，震动提示，可继续拖。
- 可选：错 3 次自动显示第一片正确位置。

### reveal

- 按正确顺序拼接 10 字符（或取 `fragment` 长度）。

### UI

- 拖拽列表（touch + mouse）；大号 ①～⑤ 角标。

---

## 待做：intelread — 阅读情报（仅央行 Bonus）

**不进入** `pickMissionKindIds` 三关池；仅 `enterBankBonus()` 调用。

### 三步

1. **阅读**：4–5 句伪造敌方通知（打字机字体、咖啡渍背景）。
2. **提取**：3 道选择题 / 填空，指向文中细节。
3. **验证**：全对 → 按 Bonus 扣款规则结算进队库。

### 奖金 UI

- 顶部大字：`RM 3,200` 实时递减。
- 20s 宽限后每 5s −50；答错 −200。

### 题库

- `data/intel-briefings.json`：`{ id, lines[], questions[{ prompt, choices, answer }] }`。
- 随机抽一套；竞赛可用种子 `roomId|waveIndex|playerId`。

### 失误

- 答错计入 Bonus 扣款，不占用攻坚 20 次池。

---

## 池子配置目标

| kind | enabled | 模式 |
|------|---------|------|
| typing | true | solo, mp |
| dial | true | solo, mp |
| grid | true | solo, mp |
| mastermind | true（Phase 2） | solo, mp |
| fragsort | true（Phase 2） | solo, mp |
| intelread | — | **仅 bank bonus** |
| phishing, logtrace, … | false | 后续 |

`pickMissionKindIds` 要求 **enabled ≥ 3**；建议维持 **≥ 5** 以保随机多样性。

---

## 失误汇总（攻坚管线）

三关完成后：

```
totalMistakes = sum(game.mistakes for game in intel.games)
payout = share * max(0, 1 - totalMistakes / 20)
```

各关需在 `solve` / `fail` 时更新 `game.mistakes`。
