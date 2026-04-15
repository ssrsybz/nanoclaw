<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoClaw" width="400">
</p>

<p align="center">
  个人 AI 助手。轻量、可定制、代码量小到足以完全理解。
</p>

<p align="center">
  <a href="README.md">English</a>&nbsp; • &nbsp;
  <a href="README_ja.md">日本語</a>&nbsp; • &nbsp;
  <a href="https://nanoclaw.dev">nanoclaw.dev</a>&nbsp; • &nbsp;
  <a href="https://discord.gg/VDdww8qS42"><img src="https://img.shields.io/discord/1470188214710046894?label=Discord&logo=discord&v=2" alt="Discord" valign="middle"></a>&nbsp; • &nbsp;
  <a href="repo-tokens"><img src="repo-tokens/badge.svg" alt="34.9k tokens, 17% of context window" valign="middle"></a>
</p>

---

## 为什么做 NanoClaw

[OpenClaw](https://github.com/openclaw/openclaw) 是一个很棒的项目，但我无法安心把我不理解的复杂软件完全接入我的生活。OpenClaw 有近 50 万行代码、53 个配置文件、70+ 依赖。它的安全是应用层面的（白名单、配对码），而非真正的操作系统级隔离。所有东西跑在一个 Node 进程里，共享内存。

NanoClaw 提供相同的核心功能，但代码量小到你能完全理解：一个进程，几个文件。Claude Agent 直接在主进程中运行，无需容器。

## 快速开始

```bash
gh repo fork qwibitai/nanoclaw --clone
cd nanoclaw
npm install
npm run build
npm run dev
```

<details>
<summary>没有 GitHub CLI</summary>

1. 在 GitHub 上 Fork [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw)
2. `git clone https://github.com/<your-username>/nanoclaw.git`
3. `cd nanoclaw`
4. `npm install && npm run build && npm run dev`

</details>

然后打开浏览器访问 `http://localhost:5173`，开始对话。

或者运行 `/setup`，Claude Code 会处理一切：依赖安装、认证配置和服务设置。

> **注意：** 以 `/` 开头的命令（如 `/setup`、`/add-whatsapp`）是 [Claude Code 技能](https://code.claude.com/docs/en/skills)，在 `claude` CLI 提示符中输入，不是普通终端命令。未安装 Claude Code 可在 [claude.com/product/claude-code](https://claude.com/product/claude-code) 获取。

## 设计理念

**小到能理解。** 一个进程，几个源文件，没有微服务。想了解整个 NanoClaw 代码库？直接让 Claude Code 带你过一遍。

**为个人用户设计。** NanoClaw 不是臃肿的框架，而是贴合每个用户需求的软件。你 Fork 一份，让 Claude Code 按你的需要修改。

**定制 = 改代码。** 没有配置膨胀。想要不同行为？修改代码。代码量足够小，改起来很安全。

**AI 原生。**
- 没有安装向导——Claude Code 引导你完成设置。
- 没有监控面板——问 Claude 正在发生什么。
- 没有调试工具——描述问题，Claude 帮你修。

**技能优于功能。** 不把功能（如 Telegram 支持）加进核心代码库，而是通过 [Claude Code 技能](https://code.claude.com/docs/en/skills)如 `/add-telegram` 来转换你的 Fork。最终你得到干净的代码，只做你需要的事。

## 功能特性

- **多频道消息** — 通过 Web IM、WhatsApp、Telegram、Discord、Slack、Gmail 与助手对话。用 `/add-whatsapp`、`/add-telegram` 等技能添加频道。支持同时运行多个。
- **Web 前端** — 内置浏览器聊天界面，支持多工作空间、对话管理、文件上传（Word/Excel/PDF）和实时流式输出。
- **文件附件** — 上传 .docx、.xlsx、.pdf 文件，自动提取文本内容供 Agent 分析。
- **独立群组上下文** — 每个群组有自己的 `CLAUDE.md` 记忆和独立文件系统。
- **主频道** — 你的私聊频道（自我对话），用于管理控制；其他群组完全隔离。
- **定时任务** — 定期运行的 Claude 任务，可以主动给你发消息。
- **Web 访问** — 搜索和获取网页内容。
- **Agent 协作** — 启动专业化 Agent 团队协作处理复杂任务。

## 使用方式

用触发词（默认：`@Andy`）与助手对话：

```
@Andy 每个工作日早上9点发送销售管道概况
@Andy 每周五回顾过去一周的 git 历史，有偏差就更新 README
@Andy 每周一早上8点，从 Hacker News 和 TechCrunch 汇编 AI 发展新闻并发给我
```

在主频道（你的自我对话）中管理群组和任务：
```
@Andy 列出所有群组的定时任务
@Andy 暂停周一简报任务
@Andy 加入家庭聊天群组
```

## 自定义

NanoClaw 不使用配置文件。直接告诉 Claude Code 你想要什么：

- "把触发词改成 @Bob"
- "以后回复要更短更直接"
- "我说早上好的时候加个自定义问候语"
- "每周存储对话摘要"

或运行 `/customize` 进行引导式修改。

代码量足够小，Claude 可以安全地修改它。

## 贡献

**不要加功能。加技能。**

如果你想添加 Telegram 支持，不要创建把 Telegram 加进核心代码库的 PR。而是 Fork NanoClaw，在分支上做代码改动，然后开 PR。我们会从你的 PR 创建 `skill/telegram` 分支，其他用户可以合并到自己的 Fork。

用户然后在 Fork 上运行 `/add-telegram`，得到干净的代码，只做他们需要的，而不是一个试图支持所有用例的臃肿系统。

### 技能需求（RFS）

我们希望看到的技能：

**通信频道**
- `/add-signal` — 添加 Signal 频道

## 系统要求

- macOS、Linux 或 Windows（通过 WSL2）
- Node.js 20+
- [Claude Code](https://claude.ai/download)

## 架构

```
频道 --> SQLite --> 消息轮询 --> Agent (Claude Agent SDK) --> 响应
```

单 Node.js 进程。频道通过技能添加，启动时自动注册——编排器连接所有有凭证的频道。Agent 直接在主进程中通过 Claude Agent SDK 执行。每群组独立消息队列，支持全局并发控制。通过文件系统 IPC。

完整架构细节见[文档站](https://docs.nanoclaw.dev/concepts/architecture)。

核心文件：
- `src/index.ts` — 编排器：状态、消息循环、Agent 调用
- `src/agent-runner.ts` — Claude Agent SDK 直接调用
- `src/channels/registry.ts` — 频道注册表（启动时自动注册）
- `src/ipc.ts` — IPC 监听和任务处理
- `src/router.ts` — 消息格式化和出站路由
- `src/group-queue.ts` — 每群组队列 + 全局并发限制
- `src/task-scheduler.ts` — 定时任务执行
- `src/db.ts` — SQLite 操作（消息、群组、会话、状态）
- `src/file-parser.ts` — 文件解析（.docx、.xlsx、.pdf）
- `web/src/` — React Web 前端
- `groups/*/CLAUDE.md` — 每群组记忆

## 常见问题

**能用在 Linux 或 Windows 上吗？**

可以。NanoClaw 是纯 Node.js，在 macOS、Linux 和 Windows（WSL2）上都能运行。直接 `/setup` 即可。

**安全吗？**

Agent 直接在主进程运行，拥有完整的工具权限。建议仅在可信环境中使用，代码量小到你可以审计每一行。详见[安全文档](https://docs.nanoclaw.dev/concepts/security)。

**为什么不用配置文件？**

我们不想要配置膨胀。每个用户应该定制自己的 NanoClaw，让代码做你想要的事，而不是配置一个通用系统。如果你偏好配置文件，可以让 Claude 加上。

**能用第三方或开源模型吗？**

可以。在 `~/.claude/settings.json` 的 env 块中设置：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-api-endpoint.com",
    "ANTHROPIC_API_KEY": "your-key-here",
    "ANTHROPIC_MODEL": "model-name"
  }
}
```

支持的选项：
- [Ollama](https://ollama.ai) 本地模型（配合 API 代理）
- [Together AI](https://together.ai)、[Fireworks](https://fireworks.ai) 等平台的开源模型
- 任何兼容 Anthropic API 格式的自定义部署

**遇到问题怎么排查？**

问 Claude Code。"为什么定时任务没运行？" "最近的日志有什么？" "这条消息为什么没得到回复？" 这就是 NanoClaw 的 AI 原生方式。

**什么样的变更会被接受？**

只有安全修复、Bug 修复和明确的改进会被接受到基础代码中。

其他所有内容（新功能、系统兼容、硬件支持、增强）都应该作为技能贡献。

这保持了基础系统的精简，让每个用户可以按需定制，不继承不需要的功能。

## 社区

有问题或想法？[加入 Discord](https://discord.gg/VDdww8qS42)。

## 更新日志

详见 [CHANGELOG.md](CHANGELOG.md) 或文档站的[完整发布历史](https://docs.nanoclaw.dev/changelog)。

## 许可证

MIT
