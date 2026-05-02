# OKClaw

个人 Claude 助手。详见 [README.md](README.md) 了解设计理念和安装方式。详见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) 了解架构决策。

## 项目概述

单 Node.js 进程 + 技能化频道系统。频道（Web IM、Discord、飞书）启动时自动注册。消息路由到 Claude Agent SDK 直接在主进程中运行。每个群组拥有独立的文件系统和记忆。内置 React Web 前端支持浏览器对话。

> **注意：** 本版本不使用 Docker 容器。Agent 的 Bash 命令直接在宿主机执行。仅在可信的单用户环境中使用。

## 关键文件

| 文件 | 用途 |
|------|------|
| `src/index.ts` | 编排器：状态管理、消息循环、Agent 调用 |
| `src/agent-runner.ts` | Claude Agent SDK 直接调用 |
| `src/channels/registry.ts` | 频道注册表（启动时自动注册） |
| `src/channels/web.ts` | Web IM 频道（HTTP API + WebSocket + 文件上传） |
| `src/channels/feishu.ts` | 飞书（Lark）机器人频道 |
| `src/channels/discord.ts` | Discord 机器人频道 |
| `src/ipc.ts` | IPC 监听和任务处理 |
| `src/router.ts` | 消息格式化和出站路由 |
| `src/config.ts` | 触发词、路径、间隔等配置 |
| `src/db.ts` | SQLite 操作（群组、消息、工作空间、对话） |
| `src/file-parser.ts` | 文件解析（.docx、.xlsx、.pdf）用于附件功能 |
| `src/task-scheduler.ts` | 定时任务执行 |
| `src/group-queue.ts` | Agent 会话管理和并发控制 |
| `src/workspace.ts` | 工作空间 CRUD 操作 |
| `src/mcp-server.ts` | MCP 工具服务器（send_message、schedule_task 等） |
| `web/src/App.tsx` | 前端入口：WebSocket、路由、消息分发 |
| `web/src/store.ts` | Zustand 状态管理（工作空间、对话、消息） |
| `web/src/components/AssistantChat.tsx` | 聊天 UI：Markdown 渲染、文件上传、流式输出 |
| `web/src/components/WorkspaceSidebar.tsx` | 工作空间切换和对话列表 |
| `groups/{name}/CLAUDE.md` | 每个群组的独立记忆 |

## 密钥 / 凭证

LLM 凭证（模型、API Key、Base URL）由 `~/.claude/settings.json`（Claude CLI 配置）统一管理。项目 `.env` 仅存放非 LLM 密钥（如飞书机器人 Token）。部署时通过脚本将 LLM 配置同步到 `~/.claude/settings.json` 的 env 块即可。

## Web 前端

基于 Vite + React + TypeScript 的 SPA，位于 `web/`。构建后由后端服务在 3100 端口统一提供。主要功能：
- 多工作空间支持，含对话管理
- 文件附件上传（.docx、.xlsx、.pdf，最大 10MB）
- 通过 WebSocket 实时流式输出（文本、思考过程、工具调用）
- Markdown 渲染 + 语法高亮

```bash
npm run build        # 编译后端 + 构建前端
```

访问地址：http://localhost:3100

## 技能

OKClaw 有四种技能类型。详见 [CONTRIBUTING.md](CONTRIBUTING.md) 了解完整分类和规范。

- **功能技能** — 合并 `skill/*` 分支添加能力（如 `/add-telegram`、`/add-slack`）
- **工具技能** — 附带代码文件的 SKILL.md（如 `/claw`）
- **运维技能** — 纯指令工作流，始终在 `main` 分支（如 `/setup`、`/debug`）

| 技能 | 使用场景 |
|-------|-------------|
| `/setup` | 首次安装、认证、服务配置 |
| `/customize` | 添加频道、集成、修改行为 |
| `/debug` | Agent 问题排查、日志分析 |
| `/update-okclaw` | 将上游 OKClaw 更新同步到自定义安装 |
| `/qodo-pr-resolver` | 批量或交互式修复 Qodo PR Review 问题 |
| `/get-qodo-rules` | 在编码任务前加载组织和仓库级编码规则 |

## 贡献

提交 PR、添加技能或准备任何贡献前，**必须**阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。内容涵盖：接受的变更类型、四种技能规范、SKILL.md 格式要求、PR 要求和提交前检查清单。

## 开发

直接运行命令，不需要告诉用户手动执行。

```bash
npm run dev          # 启动开发服务（热重载）
npm run build        # 编译 TypeScript + 构建前端
npm run test         # 运行测试（vitest）
npm install          # 安装依赖
```

服务管理：
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.okclaw.plist
launchctl unload ~/Library/LaunchAgents/com.okclaw.plist
launchctl kickstart -k gui/$(id -u)/com.okclaw  # 重启

# Linux (systemd)
systemctl --user start okclaw
systemctl --user stop okclaw
systemctl --user restart okclaw
```

## 架构说明

### 无容器模式

本版本直接在主 Node.js 进程中运行 Claude Agent SDK：

- **安全取舍**：Agent 的 Bash 命令在宿主机直接执行，无隔离。仅在可信环境中使用。
- **简化部署**：不需要 Docker，安装依赖即可运行。
- **浏览器自动化**：需要本地安装 Chromium 以支持 `agent-browser` 功能。
- **并发控制**：通过 `MAX_CONCURRENT_AGENTS` 控制（默认：5）。

### LLM 配置

LLM 提供商（模型、API Key、Base URL）完全通过 Claude CLI 的 `~/.claude/settings.json` env 块配置。SDK 子进程继承此配置。项目 `.env` 不覆盖 LLM 设置，避免项目级和用户级 Claude 环境之间的冲突。

### 文件附件

Web IM 通过 `POST /api/upload`（multipart）支持文件上传。支持格式：`.docx`（mammoth）、`.xlsx`（SheetJS）、`.pdf`（pdf-parse）。文件保存到 `data/uploads/{workspaceId}/`，提取的文本自动注入到 Agent 提示词中。

### 数据存储

- `data/sessions/` — 每个群组/工作空间的 Claude Agent SDK 会话记录
- `data/uploads/` — 每个工作空间的上传文件
- `data/ipc/` — 跨进程通信的消息队列
- `store/okclaw.db` — SQLite 数据库（群组、消息、工作空间、对话、任务）
