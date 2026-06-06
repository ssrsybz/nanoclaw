---
name: web-formatting
nameZh: Web 格式化
description: Format messages for the OKClaw Web IM interface. Use when responding in Web conversations (JID starts with web:).
skillType: operational
category: system
---

# Web 格式化

当回复 OKClaw Web IM 界面时，使用完整 Markdown 语法格式化消息。当 chatJid 以 `web:` 开头时自动应用。

## 检测 Web 上下文

当消息的 `chatJid` 以 `web:` 开头时，说明当前对话来自 Web IM 界面，可使用完整 Markdown 格式。

## 完整 Markdown 支持

Web IM 界面基于 React + Markdown 渲染，支持标准 Markdown 语法。

### 文本格式

```markdown
**粗体**  *斜体*  ~~删除线~~  `行内代码`
```

### 标题与结构

```markdown
# 一级标题
## 二级标题
### 三级标题

> 引用文本

---

- [x] 已完成任务
- [ ] 待完成任务
```

### 代码块（带语法高亮）

````
```typescript
interface Config {
  model: string;
  apiKey: string;
  maxTokens?: number;
}
```
````

常用语言标识：`javascript`、`typescript`、`python`、`bash`、`json`、`sql`、`yaml`

终端输出或日志使用 `bash`：

````
```bash
$ npm run build
Building project...
Done in 3.2s
```
````

### 链接、图片与列表

```markdown
[链接文本](https://example.com)
![图片描述](https://example.com/image.png)

- 无序列表项 1
  - 嵌套列表项

1. 有序列表项 1
2. 有序列表项 2
```

### 表格

```markdown
| 列 A | 列 B | 列 C |
|------|------|------|
| 数据1 | 数据2 | 数据3 |
| 数据4 | 数据5 | 数据6 |
```

## 文件附件处理

Web IM 支持文件上传（`.docx`、`.xlsx`、`.pdf`，最大 10MB）。上传后：
1. 保存到 `data/uploads/{workspaceId}/` 目录
2. 内容自动解析并注入到 Agent 提示词
3. Agent 可直接引用文件内容

回复中引用文件时：说明文件来源，提取关键信息展示，表格数据使用 Markdown 表格格式化。

## 流式输出

Web 界面通过 WebSocket 实时流式显示输出。格式建议：
- 长回复使用标题分段，便于流式渲染时快速定位
- 代码块完整输出，不要分段
- 复杂分析先给结论，再展开细节

## AskUserQuestion 交互

在 Web 界面中使用 AskUserQuestion 工具实现交互式对话，显示为表单或选择题。使用建议：
- 提供清晰的选项和说明
- 每次只问一个问题
- 为选项添加简短描述

## 常见模式

### 报告格式

```markdown
# 任务报告

## 概要
简要说明任务结果。

## 详情

### 执行步骤
1. 步骤一
2. 步骤二

### 结果
| 指标 | 值 |
|------|-----|
| 耗时 | 2m 30s |
| 状态 | 成功 |
```

### 代码审查

```markdown
# 代码审查：`src/agent-runner.ts`

## 问题
### 1. 未使用的变量（第 15 行）
`const result = await run();` — `result` 未被引用，建议移除。

## 建议
- 错误处理可以更细粒度
- 考虑添加超时机制

## 评价
代码结构清晰，函数拆分合理。
```

### 操作确认

```markdown
## 确认操作
即将执行以下操作：
1. 重启服务
2. 清除缓存
3. 重新构建

请确认是否继续。
```

## 注意事项

- Web 界面支持完整 Markdown，无需简化格式
- 长内容使用标题和分割线组织结构
- 表格列数不宜过多（建议不超过 5 列）
- 代码块始终指定语言标识以获得语法高亮
- 文件附件内容已自动注入提示词，无需再次读取
- 利用流式输出特性，优先展示重要结论
