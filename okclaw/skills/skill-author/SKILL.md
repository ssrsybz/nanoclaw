---
name: skill-author
nameZh: 技能编写
description: 指导用户编写 OKClaw 技能，包括 SKILL.md 格式、frontmatter 规范、最佳实践
skillType: operational
category: system
---

# 技能编写

指导用户编写符合 OKClaw 规范的技能，涵盖 SKILL.md 格式、frontmatter 字段、技能分类和最佳实践。

## 使用场景

当用户想要：
- 为 OKClaw 创建新技能
- 了解技能格式规范
- 将现有工作流封装为技能
- 向 OKClaw 贡献技能

## 技能类型

| 类型 | skillType | 说明 | 位置 |
|------|-----------|------|------|
| 内置技能 | builtin | 核心功能，随系统预装 | `skills/<name>/` |
| 运维技能 | operational | 纯指令工作流，无代码变更 | `skills/<name>/` |
| 工具技能 | utility | 附带代码文件的技能 | `.claude/skills/<name>/` |
| 功能技能 | feature | 通过合并分支添加能力 | `.claude/skills/<name>/`（指令），代码在 `skill/<name>` 分支 |
| 工作空间技能 | workspace | 用户自定义的本地技能 | `.claude/skills/<name>/` |

## SKILL.md 格式

SKILL.md 由两部分组成：YAML frontmatter 和 Markdown 指令正文。

### Frontmatter 字段

```yaml
---
name: my-skill          # 必填，小写字母+数字+连字符，最长64字符
nameZh: 我的技能         # 可选，中文名称
description: 技能描述     # 必填，Claude 根据此字段决定何时调用技能
skillType: operational   # 必填，取值：builtin | operational | utility | feature | workspace
category: system         # 可选，分类：system | channel | formatting | utility
allowed-tools:           # 可选，限制技能可用的工具列表
  - Read
  - Bash
---
```

### 字段验证规则

- `name`：必填，只允许小写字母、数字、连字符，长度 1-64，不可含空格
- `nameZh`：可选，中文显示名
- `description`：必填，清晰描述功能和使用时机，建议 20-100 字符
- `skillType`：必填，必须是上述五种类型之一
- `category`：可选，用于技能分组和筛选
- `allowed-tools`：可选，不设置则不限制工具使用

## 指令正文编写

正文是 Claude 执行技能时读取的完整操作手册，应包含：

### 推荐结构

```markdown
# 技能标题

简要说明技能的用途。

## 使用场景

列出触发此技能的情况。

## 步骤

### 1. 第一步标题

具体操作指令...

### 2. 第二步标题

具体操作指令...

## 注意事项

- 重要提醒
- 限制说明
```

### 编写要点

1. **操作性强**：每一步都要有明确的动作，避免模糊描述
2. **自包含**：技能被独立加载，不要假设上下文中有其他技能的内容
3. **幂等性**：重复执行不应产生副作用
4. **错误处理**：说明失败时的排查步骤

## 技能存放位置

- **系统技能**（所有用户共享）：`skills/<name>/SKILL.md`
- **工作空间技能**（用户自定义）：`.claude/skills/<name>/SKILL.md`
- **容器技能**（Agent 运行时）：`container/skills/<name>/SKILL.md`

选择依据：
- 通用技能放 `skills/`，随 OKClaw 发布
- 个人/团队定制技能放 `.claude/skills/`
- 仅影响 Agent 行为的放 `container/skills/`

## 最佳实践

1. **保持精简**：SKILL.md 不超过 500 行，详细内容拆分到参考文件
2. **描述要精准**：`description` 是 Claude 判断是否调用技能的依据，必须准确
3. **代码放单独文件**：不要在 Markdown 中内联大段代码，使用 `scripts/` 子目录
4. **使用 `${CLAUDE_SKILL_DIR}`**：引用技能目录中的文件时使用此变量
5. **测试完整流程**：在全新 clone 上端到端测试技能
6. **考虑错误场景**：说明网络失败、权限不足等异常情况的处理

## 本地测试

1. 创建技能文件到正确位置
2. 重启 Claude Code 或 OKClaw 服务
3. 通过 `/skill-name` 调用技能
4. 检查 Claude 是否正确加载和执行指令
5. 验证边界情况（参数缺失、操作失败等）

## 示例模板

```markdown
---
name: hello-world
nameZh: 你好世界
description: 演示技能编写的最小示例
skillType: operational
category: utility
---

# Hello World

一个简单的技能示例。

## 使用场景

当用户输入 `/hello-world` 时触发。

## 步骤

1. 向用户打招呼
2. 询问用户名称（使用 AskUserQuestion）
3. 返回个性化的问候消息

## 输出格式

使用 Markdown 格式输出问候语。
```
