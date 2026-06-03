# OKClaw

个人 Claude 助手。详见 [README.md](README.md) 了解设计理念和安装方式。详见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) 了解架构决策。

## 项目概述

单 Node.js 进程 + 技能化频道系统。频道（Web IM、Discord、飞书）启动时自动注册。消息路由到 Claude Agent SDK 直接在主进程中运行。每个群组拥有独立的文件系统和记忆。内置 React Web 前端支持浏览器对话。

> **注意：** 本版本不使用 Docker 容器。Agent 的 Bash 命令直接在宿主机执行。仅在可信的单用户环境中使用。

## 项目结构

```
okclaw/
├── src/                          # 后端源码
│   ├── index.ts                  # 主编排器：状态管理、消息循环、Agent 调用
│   ├── agent-runner.ts           # Claude Agent SDK 调用
│   ├── db.ts                     # SQLite 数据库操作
│   ├── config.ts                 # 配置（触发词、路径、间隔等）
│   ├── ipc.ts                    # IPC 监听和任务处理
│   ├── router.ts                 # 消息格式化和出站路由
│   ├── task-scheduler.ts         # 定时任务执行
│   ├── group-queue.ts            # Agent 会话管理和并发控制
│   ├── workspace.ts              # 工作空间 CRUD 操作
│   ├── mcp-server.ts             # MCP 工具服务器
│   ├── mcp-stdio.ts              # MCP 标准 IO 通信
│   ├── file-parser.ts            # 文件解析（.docx、.xlsx、.pdf）
│   ├── question-responder.ts     # 问题响应处理
│   ├── remote-control.ts         # 远程控制功能
│   ├── sender-allowlist.ts       # 发送者白名单
│   ├── timezone.ts               # 时区处理
│   ├── logger.ts                 # 日志工具
│   ├── types.ts                  # 类型定义
│   ├── env.ts                    # 环境变量
│   ├── tool-meta.ts              # 工具元数据
│   ├── builtin-skills.ts         # 内置技能
│   ├── group-folder.ts           # 群组文件夹管理
│   ├── formatting.test.ts        # 格式化测试
│   └── channels/                 # 消息频道
│       ├── index.ts              # 频道导出
│       ├── registry.ts           # 频道注册表
│       ├── web.ts                # Web IM 频道（HTTP + WebSocket）
│       ├── feishu.ts             # 飞书机器人频道
│       └── discord.ts            # Discord 机器人频道
│
├── web/                          # Web 前端（Vite + React）
│   ├── src/
│   │   ├── App.tsx               # 前端入口
│   │   ├── main.tsx              # React 入口
│   │   ├── store.ts              # Zustand 状态管理
│   │   ├── useChatRuntime.ts     # 聊天运行时 Hook
│   │   └── components/           # UI 组件
│   │       ├── AssistantChat.tsx         # 聊天界面
│   │       ├── WorkspaceSidebar.tsx      # 工作空间侧边栏
│   │       ├── LLMConfigPanel.tsx        # LLM 配置面板
│   │       ├── RemoteControlPanel.tsx    # 远程控制面板
│   │       ├── SkillsPanel.tsx           # 技能面板
│   │       ├── QuestionDialog.tsx        # 问题对话框
│   │       └── EditModal.tsx             # 编辑模态框
│   └── package.json
│
├── electron/                     # Electron 桌面应用
│   └── main.js                   # Electron 主进程
│
├── skills/                       # 技能目录
│   ├── debug/                    # 调试技能
│   ├── example/                  # 示例技能
│   ├── setup/                    # 安装技能
│   └── test-multi-question/      # 多问题测试技能
│
├── setup/                        # 安装脚本
│   ├── index.ts                  # 安装入口
│   ├── platform.ts               # 平台检测
│   ├── environment.ts            # 环境配置
│   ├── container.ts              # 容器配置
│   ├── service.ts                # 服务配置
│   ├── register.ts               # 注册脚本
│   ├── groups.ts                 # 群组配置
│   ├── mounts.ts                 # 挂载配置
│   ├── timezone.ts               # 时区配置
│   ├── verify.ts                 # 验证脚本
│   └── status.ts                 # 状态检查
│
├── scripts/                      # 构建脚本
│   ├── run-migrations.ts         # 运行数据库迁移
│   ├── build-mac.sh              # Mac 构建
│   ├── build-linux.sh            # Linux 构建
│   └── build-win.ps1             # Windows 构建
│
├── build/                        # 构建资源
│   └── pkg.config.json           # 打包配置
│
├── docs/                         # 文档
│   ├── README.md                 # 文档索引
│   ├── SPEC.md                   # 规格说明
│   ├── REQUIREMENTS.md           # 架构决策
│   ├── SECURITY.md               # 安全说明
│   ├── BUILD.md                  # 构建指南
│   ├── DEBUG_CHECKLIST.md        # 调试清单
│   └── *.md                      # 其他集成文档
│
├── data/                         # 运行时数据
│   ├── sessions/                 # Agent 会话记录
│   ├── uploads/                  # 上传文件
│   └── ipc/                      # IPC 消息队列
│
├── store/                        # 数据存储
│   └── okclaw.db                 # SQLite 数据库
│
├── groups/                       # 群组配置（每个群组独立记忆）
│   └── {name}/CLAUDE.md
│
├── dist/                         # 编译输出（TypeScript）
│
├── release/                      # 发布包输出
│
├── node_modules/                 # 依赖
│
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
├── vitest.config.ts              # 测试配置
├── eslint.config.js              # ESLint 配置
├── .env                          # 环境变量（非 LLM 密钥）
├── .env.example                  # 环境变量示例
└── CLAUDE.md                     # 本文件
```

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
- `store/messages.db` — SQLite 数据库（群组、消息、工作空间、对话、任务）

## 数据库查询指南

数据库文件：`store/messages.db`（SQLite）

### 核心表结构

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `workspaces` | 工作空间 | id, name, path, enabled_skills, created_at |
| `conversations` | 对话 | id, workspace_id, name, created_at, updated_at |
| `conversation_messages` | 对话消息 | id, conversation_id, role, content, created_at |
| `messages` | 群聊消息 | id, chat_jid, sender, sender_name, content, timestamp |
| `chats` | 聊天元数据 | jid, name, channel, is_group |
| `registered_groups` | 注册群组 | jid, name, folder, trigger_pattern |
| `scheduled_tasks` | 定时任务 | id, chat_jid, prompt, next_run, status |

### 常用查询命令

```bash
# 进入数据库
sqlite3 store/messages.db

# 设置输出格式
.headers on
.mode column
```

#### 工作空间查询

```sql
-- 查看所有工作空间
SELECT id, name, path, created_at FROM workspaces ORDER BY created_at DESC;

-- 查看工作空间数量
SELECT COUNT(*) as total FROM workspaces;

-- 查看特定工作空间的对话
SELECT id, name, created_at, updated_at 
FROM conversations 
WHERE workspace_id = '<workspace_id>' 
ORDER BY updated_at DESC LIMIT 10;
```

#### 对话查询

```sql
-- 查看所有对话（含工作空间名称）
SELECT c.id, c.name, w.name as workspace, c.updated_at 
FROM conversations c 
JOIN workspaces w ON c.workspace_id = w.id 
ORDER BY c.updated_at DESC LIMIT 20;

-- 查看对话的消息数量
SELECT c.id, c.name, COUNT(cm.id) as msg_count 
FROM conversations c 
LEFT JOIN conversation_messages cm ON c.id = cm.conversation_id 
GROUP BY c.id ORDER BY msg_count DESC LIMIT 10;

-- 查看特定对话的消息
SELECT role, substr(content, 1, 100) as preview, created_at 
FROM conversation_messages 
WHERE conversation_id = '<conversation_id>' 
ORDER BY created_at ASC;

-- 查看最近的消息
SELECT c.name as conversation, cm.role, substr(cm.content, 1, 50) as preview, cm.created_at 
FROM conversation_messages cm 
JOIN conversations c ON cm.conversation_id = c.id 
ORDER BY cm.created_at DESC LIMIT 20;
```

#### 群聊消息查询

```sql
-- 查看所有注册群组
SELECT jid, name, folder, trigger_pattern FROM registered_groups;

-- 查看群聊列表
SELECT jid, name, channel, is_group FROM chats WHERE is_group = 1 ORDER BY last_message_time DESC;

-- 查看特定群的最近消息
SELECT sender_name, substr(content, 1, 100) as preview, timestamp 
FROM messages 
WHERE chat_jid = '<jid>' AND is_bot_message = 0 
ORDER BY timestamp DESC LIMIT 20;

-- 统计各群消息数量
SELECT chat_jid, COUNT(*) as msg_count 
FROM messages 
GROUP BY chat_jid ORDER BY msg_count DESC;
```

#### 定时任务查询

```sql
-- 查看活跃定时任务
SELECT id, chat_jid, prompt, next_run, status 
FROM scheduled_tasks 
WHERE status = 'active' 
ORDER BY next_run;

-- 查看任务执行日志
SELECT task_id, run_at, status, duration_ms 
FROM task_run_logs 
ORDER BY run_at DESC LIMIT 20;
```

### 快速诊断脚本

```bash
# 一行命令查看系统状态
sqlite3 store/messages.db "SELECT 'workspaces' as table_name, COUNT(*) as count FROM workspaces UNION ALL SELECT 'conversations', COUNT(*) FROM conversations UNION ALL SELECT 'messages', COUNT(*) FROM conversation_messages UNION ALL SELECT 'groups', COUNT(*) FROM registered_groups;"

# 查看最近活动
sqlite3 store/messages.db "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 5;"

# 查看最近的错误日志（如果有）
sqlite3 store/messages.db "SELECT * FROM task_run_logs WHERE status = 'error' ORDER BY run_at DESC LIMIT 10;"
```

### 高级查询

```sql
-- 搜索消息内容（全文搜索）
SELECT c.name, cm.role, substr(cm.content, 1, 200) as content, cm.created_at 
FROM conversation_messages cm 
JOIN conversations c ON cm.conversation_id = c.id 
WHERE cm.content LIKE '%关键词%' 
ORDER BY cm.created_at DESC LIMIT 20;

-- 查看用户活动统计
SELECT role, COUNT(*) as count, 
       SUM(length(content)) as total_chars 
FROM conversation_messages 
GROUP BY role;

-- 查看每日消息量趋势
SELECT date(created_at) as date, COUNT(*) as count 
FROM conversation_messages 
GROUP BY date(created_at) 
ORDER BY date DESC LIMIT 30;

-- 查看对话的平均消息长度
SELECT c.name, 
       COUNT(cm.id) as msg_count, 
       AVG(length(cm.content)) as avg_length 
FROM conversations c 
JOIN conversation_messages cm ON c.id = cm.conversation_id 
GROUP BY c.id 
ORDER BY msg_count DESC LIMIT 10;

-- 查看使用特定模型的对话
SELECT DISTINCT c.name, cm.model 
FROM conversation_messages cm 
JOIN conversations c ON cm.conversation_id = c.id 
WHERE cm.model IS NOT NULL;

-- 查看带附件的消息
SELECT c.name, cm.role, cm.attachment, cm.created_at 
FROM conversation_messages cm 
JOIN conversations c ON cm.conversation_id = c.id 
WHERE cm.attachment IS NOT NULL 
ORDER BY cm.created_at DESC LIMIT 20;
```

### 实用别名（可选添加到 ~/.zshrc 或 ~/.bashrc）

```bash
# OKClaw 数据库快捷命令
alias okdb='sqlite3 ~/path/to/okclaw/store/messages.db'
alias okdb-stats='sqlite3 ~/path/to/okclaw/store/messages.db "SELECT \"workspaces\" as t, COUNT(*) FROM workspaces UNION ALL SELECT \"conversations\", COUNT(*) FROM conversations UNION ALL SELECT \"messages\", COUNT(*) FROM conversation_messages UNION ALL SELECT \"groups\", COUNT(*) FROM registered_groups;"'
alias okdb-recent='sqlite3 ~/path/to/okclaw/store/messages.db "SELECT c.name, substr(cm.content,1,50), cm.created_at FROM conversation_messages cm JOIN conversations c ON cm.conversation_id=c.id ORDER BY cm.created_at DESC LIMIT 10;"'
```
