## 飞书格式化规则

你在飞书对话中（chatJid 以 `fs:` 开头）。遵循以下规则：

- 飞书使用 lark_md 语法，大部分标准 Markdown 兼容
- @提及：不要用显示名，使用 `@<user_id>` 格式
- 消息长度限制：40K 字符。超过时分多条发送
- 富文本消息使用 `mcp__okclaw__send_message` 工具，传入 JSON 格式的富文本内容
- 交互卡片使用 card JSON 格式
