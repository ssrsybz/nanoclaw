---
name: example
nameZh: 示例技能
description: 展示 OKClaw 技能系统的完整格式和用法，作为创建新技能的模板参考
skillType: operational
category: system
allowed-tools:
  - Read
  - Bash
---

# 示例技能

此技能展示 OKClaw 技能系统的完整格式。你可以将它作为创建新技能的模板。

## 技能的调用方式

在 Claude Code 的输入框中输入 `/example` 然后发送消息，系统会自动加载此技能的指令并注入到当前对话的上下文中。Claude 会读取 SKILL.md 的全部内容，然后按照其中的指令执行操作。

## SKILL.md 文件格式

每个技能由一个 `SKILL.md` 文件定义，包含两部分：

### 1. YAML Frontmatter

位于文件开头，用 `---` 包围的 YAML 块。定义技能的元数据：

```yaml
---
name: my-skill          # 技能标识，小写字母+连字符，最长64字符
nameZh: 我的技能         # 中文名称（可选）
description: 技能的用途描述  # 必填，Claude 根据此描述决定何时调用该技能
skillType: operational   # 技能类型：operational（运维）、feature（功能）、utility（工具）
category: system         # 分类：system、channel、integration 等
allowed-tools:           # 限制该技能可使用的工具（可选，不填则不限制）
  - Read
  - Bash
---
```

**字段说明：**
- `name`（必填）：技能的唯一标识，对应目录名和斜杠命令名
- `nameZh`（可选）：中文名称，便于识别
- `description`（必填）：功能描述，Claude 使用此字段判断是否应该调用该技能
- `skillType`（必填）：`operational` 纯指令、`feature` 需合并分支、`utility` 附带代码文件
- `category`（必填）：分类标签，用于技能列表的组织
- `allowed-tools`（可选）：限定技能执行时可使用的工具列表

### 2. 正文（操作手册）

Frontmatter 之后的所有 Markdown 内容就是技能的正文。这是 Claude 执行该技能时遵循的操作手册。正文应当包含：
- 具体的操作步骤和命令
- 判断条件和分支逻辑
- 预期输出和验证方法
- 常见问题的处理方式

## 技能的存放位置

OKClaw 的技能文件存放在 `skills/` 目录下，每个技能一个子目录：

```
skills/
  example/
    SKILL.md          # 技能定义文件（必须）
  debug/
    SKILL.md
  setup/
    SKILL.md
  my-custom-skill/
    SKILL.md
    scripts/          # 可选：附属代码文件（utility 类型技能）
      helper.sh
```

## 创建自定义技能

1. 在 `skills/` 下创建新目录，目录名即技能的 `/命令名`
2. 在其中创建 `SKILL.md`，按上述格式填写 frontmatter 和正文
3. 重启 OKClaw 或重新加载技能，新技能即可通过 `/命令名` 调用

**注意事项：**
- SKILL.md 应保持在 500 行以内，详细内容拆分到单独文件
- 正文中的指令要具体、可操作，避免模糊描述
- 代码放在独立文件中，通过 `${CLAUDE_SKILL_DIR}` 引用
- 运维技能（operational）始终在 main 分支，不需要合并代码
