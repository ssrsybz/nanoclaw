---
name: customize
nameZh: 自定义配置
description: 指导用户自定义 OKClaw — 添加频道、技能、MCP 工具、修改工作空间行为
skillType: operational
category: system
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

# 自定义配置

指导用户自定义 OKClaw 实例，包括添加频道、技能、MCP 工具和修改工作空间行为。

## 使用场景

当用户想要：
- 添加新的通信频道（Discord、飞书）
- 添加工作空间技能
- 添加 MCP 工具服务器
- 修改助手行为
- 更改助手名称
- 调整并发和超时设置

## 步骤

使用 AskUserQuestion 工具询问用户想要进行哪项自定义，然后按对应步骤执行。

### 1. 添加频道

#### 添加 Discord 频道

1. 在 `.env` 文件中设置以下环境变量：
   ```
   DISCORD_BOT_TOKEN=your_discord_bot_token
   ```
2. 前往 [Discord Developer Portal](https://discord.com/developers/applications) 创建应用和 Bot
3. 获取 Bot Token，填入 `.env`
4. 生成邀请链接，将 Bot 邀请到目标服务器
5. 重启 OKClaw 服务使配置生效

#### 添加飞书（Lark）频道

1. 在 `.env` 文件中设置以下环境变量：
   ```
   FEISHU_APP_ID=your_app_id
   FEISHU_APP_SECRET=your_app_secret
   ```
2. 前往 [飞书开放平台](https://open.feishu.cn/) 创建企业自建应用
3. 开启机器人能力，获取 App ID 和 App Secret
4. 配置事件订阅回调地址：`https://your-domain/api/feishu/event`
5. 订阅消息事件：`im.message.receive_v1`
6. 将凭证填入 `.env`，重启服务

### 2. 添加工作空间技能

1. 在项目根目录创建技能目录：
   ```
   .claude/skills/{skill-name}/SKILL.md
   ```
2. 编写 SKILL.md 文件，包含 YAML frontmatter 和指令内容：
   ```markdown
   ---
   name: my-skill
   nameZh: 我的技能
   description: 技能描述，说明何时使用
   skillType: operational
   category: utility
   ---

   # 我的技能

   具体操作指令...
   ```
3. 技能会自动被 Claude Code 识别和加载
4. 用户可通过 `/my-skill` 调用

### 3. 添加 MCP 服务器

1. 编辑项目根目录的 `.mcp.json` 文件：
   ```json
   {
     "mcpServers": {
       "my-server": {
         "command": "npx",
         "args": ["-y", "@my-org/mcp-server"],
         "env": {
           "API_KEY": "your_key"
         }
       }
     }
   }
   ```
2. 常用 MCP 服务器示例：
   - 文件系统：`@modelcontextprotocol/server-filesystem`
   - GitHub：`@modelcontextprotocol/server-github`
   - 数据库：`@modelcontextprotocol/server-sqlite`
3. 重启 OKClaw 服务使 MCP 服务器生效

### 4. 自定义助手行为

1. 编辑群组级 CLAUDE.md 文件：
   ```
   groups/{group-name}/CLAUDE.md
   ```
2. 在文件中添加行为指令，例如：
   - 角色设定："你是一位专业的技术顾问"
   - 输出格式要求："回答使用 Markdown 格式"
   - 限制条件："不要执行危险操作"
3. 每个群组拥有独立的 CLAUDE.md，互不影响

### 5. 修改助手名称

1. 在 `.env` 文件中设置：
   ```
   ASSISTANT_NAME=我的助手
   ```
2. 重启服务后，助手在所有频道中将使用新名称

### 6. 调整并发和超时

1. 在 `.env` 文件中设置：
   ```
   MAX_CONCURRENT_AGENTS=5
   AGENT_TIMEOUT=300000
   ```
2. 参数说明：
   - `MAX_CONCURRENT_AGENTS`：同时运行的 Agent 数量上限，默认 5
   - `AGENT_TIMEOUT`：单个 Agent 会话超时时间（毫秒），默认 300000（5 分钟）
3. 根据机器性能和负载调整，修改后重启服务

## 验证

完成自定义后，执行以下验证步骤：
1. 检查 `.env` 配置是否正确：`cat .env | grep -v '^#'`
2. 检查 `.mcp.json` 格式是否正确：`node -e "JSON.parse(require('fs').readFileSync('.mcp.json'))"`
3. 重启服务并测试新功能

## 注意事项

- 修改 `.env` 后必须重启服务才能生效
- 不要将 API Key 等敏感信息提交到版本控制
- 工作空间技能放在 `.claude/skills/` 下，系统技能放在 `skills/` 下
- CLAUDE.md 修改即时生效，无需重启
