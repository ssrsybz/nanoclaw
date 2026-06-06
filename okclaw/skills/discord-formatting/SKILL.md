---
name: discord-formatting
nameZh: Discord 格式化
description: Format messages for Discord using Discord markdown syntax. Use when responding to Discord channels (JID starts with dc:).
skillType: operational
category: system
---

# Discord 格式化

当回复 Discord 频道时，使用 Discord Markdown 语法格式化消息。当 chatJid 以 `dc:` 开头时自动应用。

## 检测 Discord 上下文

当消息的 `chatJid` 以 `dc:` 开头时，说明当前对话来自 Discord 频道，需要使用 Discord 格式。

## Discord Markdown 语法

### 基本格式

| 语法 | 效果 | 示例 |
|------|------|------|
| `**粗体**` | 粗体 | `**重要**` |
| `*斜体*` | 斜体 | `*注意*` |
| `***粗斜体***` | 粗斜体 | `***强调***` |
| `__下划线__` | 下划线 | `__标题__` |
| `~~删除线~~` | 删除线 | `~~旧内容~~` |
| `||剧透||` | 剧透遮罩 | `||结局||` |

### 代码格式

行内代码：`code`

代码块（带语法高亮）：
````
```python
def hello():
    print("Hello, Discord!")
```
````

常用语言标识：`python`、`javascript`、`typescript`、`bash`、`json`、`sql`

### 引用与列表

```
> 单行引用
>>> 多行引用
第二行

- 无序列表项 1
1. 有序列表项 1
```

## @提及语法

| 用途 | 语法 | 说明 |
|------|------|------|
| 提及用户 | `<@userid>` | 替换 userid 为实际 ID |
| 提及频道 | `<#channelid>` | 替换 channelid 为实际 ID |
| 提及角色 | `<@&roleid>` | 替换 roleid 为实际 ID |
| @everyone | `@everyone` | 通知所有人 |
| @here | `@here` | 通知在线人员 |

## 消息长度限制与拆分

- 单条消息最大 **2,000** 字符，超过必须拆分
- 拆分策略：
  1. 按段落拆分，优先在空行处分割
  2. 代码块前后分割，确保每段代码完整
  3. 后续消息开头使用 `(续)` 提示
  4. 拆分后每条消息应能独立理解

## Embed 对象

用于富文本展示，适合状态报告、搜索结果等结构化信息。

### 基本结构

```json
{
  "embeds": [{
    "title": "任务完成",
    "description": "部署已完成",
    "color": 5763719,
    "fields": [
      { "name": "环境", "value": "生产环境", "inline": true },
      { "name": "版本", "value": "v2.1.0", "inline": true }
    ],
    "footer": { "text": "OKClaw" }
  }]
}
```

### Embed 字段

| 字段 | 说明 | 限制 |
|------|------|------|
| `title` | 标题 | 最多 256 字符 |
| `description` | 正文 | 最多 4096 字符 |
| `color` | 侧边颜色 | 十进制整数 |
| `fields` | 字段列表 | 最多 25 个 |
| `footer.text` | 页脚文字 | 最多 2048 字符 |

### 颜色参考

| 用途 | 十进制值 | 颜色 |
|------|----------|------|
| 成功/完成 | 5763719 | 绿色 |
| 警告 | 16776960 | 黄色 |
| 错误/失败 | 16711680 | 红色 |
| 信息 | 3447003 | 蓝色 |

## 常见模式

### 状态 Embed

```json
{
  "embeds": [{
    "title": "服务状态",
    "color": 5763719,
    "fields": [
      { "name": "状态", "value": "运行中", "inline": true },
      { "name": "运行时间", "value": "2h 30m", "inline": true },
      { "name": "内存", "value": "256MB", "inline": true }
    ]
  }]
}
```

### 错误消息

```json
{
  "embeds": [{
    "title": "错误",
    "description": "操作执行失败",
    "color": 16711680,
    "fields": [
      { "name": "错误代码", "value": "E001" },
      { "name": "详情", "value": "连接超时，请检查网络配置" }
    ]
  }]
}
```

### 代码审查

```
**代码审查：PR #42**
> `src/agent-runner.ts` (第 15-30 行)
- **[问题]** 变量 `result` 未使用，建议移除
- **[建议]** 错误处理可以更细粒度
- **[良好]** 函数拆分合理，命名清晰
```

## 注意事项

- Discord 不支持 Markdown 表格语法，使用 Embed fields 或代码块模拟
- Embed 的 `description` 仅支持基本格式
- 超长代码建议使用代码块而非 Embed
- 避免频繁发送大量短消息，合理合并内容
