---
name: feishu-formatting
nameZh: 飞书格式化
description: Format messages for Feishu (Lark) using rich text and interactive card syntax. Use when responding to Feishu conversations (JID starts with fs:).
skillType: operational
category: system
---

# 飞书格式化

当回复飞书（Lark）对话时，使用飞书富文本和交互卡片格式化消息。当 chatJid 以 `fs:` 开头时自动应用。

## 检测飞书上下文

当消息的 `chatJid` 以 `fs:` 开头时，说明当前对话来自飞书频道，需要使用飞书格式。

## 富文本消息格式

使用 `send_message` 工具发送飞书消息时，content 字段使用 JSON 格式：

### 纯文本消息

```json
{
  "msg_type": "text",
  "content": { "text": "这是一条纯文本消息" }
}
```

### 富文本消息

```json
{
  "msg_type": "post",
  "content": {
    "post": {
      "zh_cn": {
        "title": "消息标题",
        "content": [
          [
            { "tag": "text", "text": "普通文本 " },
            { "tag": "a", "text": "链接文本", "href": "https://example.com" }
          ],
          [{ "tag": "at", "user_id": "ou_xxxxxx" }]
        ]
      }
    }
  }
}
```

### 富文本标签参考

| 标签 | 用途 | 必需属性 |
|------|------|----------|
| `text` | 普通文本 | `text` |
| `a` | 超链接 | `text`, `href` |
| `at` | @提及用户 | `user_id` |
| `strong` | 加粗文本 | `text` |
| `em` | 斜体文本 | `text` |
| `code` | 行内代码 | `text` |
| `line_break` | 换行 | 无 |

## 交互卡片消息

```json
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": { "tag": "plain_text", "content": "卡片标题" },
      "template": "blue"
    },
    "elements": [
      { "tag": "div", "text": { "tag": "lark_md", "content": "卡片正文，支持 **加粗** 和 [链接](url)" } },
      {
        "tag": "action",
        "actions": [
          { "tag": "button", "text": { "tag": "plain_text", "content": "确认" }, "type": "primary", "value": { "action": "confirm" } }
        ]
      }
    ]
  }
}
```

### 卡片元素类型

| 元素 | tag 值 | 说明 |
|------|--------|------|
| 文本块 | `div` | 显示文本，支持 lark_md |
| 分割线 | `hr` | 水平分割线 |
| 备注 | `note` | 灰色小字备注 |
| 动作组 | `action` | 按钮等交互元素 |
| 列 | `column_set` | 多列布局 |

### 卡片标题颜色

可选值：`blue`、`wathet`、`turquoise`、`green`、`yellow`、`orange`、`red`、`carmine`、`violet`、`purple`、`indigo`、`grey`

## 消息长度限制与拆分

- 单条消息最大 **40,000** 字符
- 超过限制时，按逻辑段落拆分为多条消息
- 拆分策略：按段落或章节拆分，每段不超过 30,000 字符，后续消息标题加 "(续)"

## Markdown 兼容性

卡片 `lark_md` 支持的语法：

| 语法 | 支持 | 说明 |
|------|------|------|
| `**加粗**` | 是 | 加粗文本 |
| `[链接](url)` | 是 | 超链接 |
| `<at id=ou_xxx>` | 是 | @提及 |
| 代码块 | 否 | 使用 code 标签代替 |
| 标题 | 否 | 使用卡片 header 代替 |
| 列表 | 否 | 使用 `•` 符号模拟 |
| 表格 | 否 | 使用结构化卡片代替 |

## @提及语法

```
<at user_id="ou_xxxxxx">名字</at>
<at user_id="all">所有人</at>
```

## 常见模式

### 状态卡片

```json
{
  "msg_type": "interactive",
  "card": {
    "header": { "title": { "tag": "plain_text", "content": "任务状态" }, "template": "green" },
    "elements": [
      { "tag": "div", "text": { "tag": "lark_md", "content": "**状态**: 已完成\n**耗时**: 2m 30s\n**结果**: 成功" } }
    ]
  }
}
```

### 操作按钮

```json
{
  "tag": "action",
  "actions": [
    { "tag": "button", "text": { "tag": "plain_text", "content": "查看详情" }, "type": "primary", "url": "https://example.com/detail" },
    { "tag": "button", "text": { "tag": "plain_text", "content": "取消" }, "type": "default" }
  ]
}
```

## 注意事项

- 飞书不支持标准 Markdown 代码块，长代码应使用纯文本消息或截图
- 卡片按钮需要配置回调地址才能接收交互事件
- 发送消息前验证 JSON 格式正确
- 富文本 content 是二维数组，外层数组代表段落，内层数组代表行内元素
