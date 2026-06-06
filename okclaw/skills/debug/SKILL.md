---
name: debug
nameZh: 调试排查
description: OKClaw 服务状态检查、日志分析、数据库排查、频道连接诊断、LLM 问题定位等全流程故障排查手册
skillType: operational
category: system
allowed-tools:
  - Read
  - Bash
  - Grep
  - Glob
  - mcp__okclaw__list_tasks
---

# 调试排查

此技能用于 OKClaw 服务的全面故障排查。按以下流程逐步诊断，从最基本的服务状态开始，逐步深入到日志、数据库、频道连接和 LLM 配置。

## 1. 检查服务运行状态

首先确认 OKClaw 进程是否在运行：

```bash
# 检查进程是否存活
pgrep -f "node dist/index.js" || pgrep -f "tsx src/index.ts"

# 检查端口 3100 是否被监听
lsof -i :3100 2>/dev/null || ss -tlnp 2>/dev/null | grep 3100

# 如果使用 launchd/systemd，检查服务状态
launchctl list 2>/dev/null | grep okclaw
systemctl --user status okclaw 2>/dev/null
```

**常见问题：**
- 进程不存在 → 查看启动报错，运行 `npm run dev` 观察输出
- 端口被占用 → `lsof -i :3100` 找到占用的进程，kill 或更换端口
- 服务反复重启 → 检查 `.env` 配置和 `~/.claude/settings.json`

## 2. 读取日志

OKClaw 使用内置 logger 输出到 stdout/stderr。日志级别：debug < info < warn < error < fatal。

```bash
# 如果通过 launchd 运行，查看日志
log show --predicate 'process == "node"' --last 30m 2>/dev/null | grep -i okclaw

# 如果通过 systemd 运行
journalctl --user -u okclaw --since "30 min ago" --no-pager

# 如果直接运行 npm run dev，日志直接在终端输出
# 设置日志级别：
# LOG_LEVEL=debug npm run dev   # 显示所有日志
# LOG_LEVEL=error npm run dev   # 仅显示错误
```

**日志级别说明：**
- `debug`（蓝色）— 详细调试信息
- `info`（绿色）— 正常运行信息
- `warn`（黄色）— 警告，服务仍可用但需关注
- `error`（红色）— 错误，功能受影响
- `fatal`（红底白字）— 致命错误，进程退出

**筛选技巧：**
```bash
# 只看错误和警告
LOG_LEVEL=warn npm run dev 2>&1 | grep -E "WARN|ERROR|FATAL"

# 搜索特定关键词
npm run dev 2>&1 | grep -i "channel\|agent\|scheduler"
```

## 3. 检查 SQLite 数据库

数据库位于 `store/okclaw.db`，使用 `better-sqlite3`。主要表结构：

| 表名 | 用途 |
|------|------|
| chats | 群组/对话元数据 |
| messages | 所有消息记录 |
| registered_groups | 已注册群组 |
| sessions | Agent 会话映射 |
| scheduled_tasks | 定时任务 |
| task_run_logs | 任务执行日志 |
| workspaces | 工作空间 |
| conversations | Web IM 对话 |
| conversation_messages | Web IM 消息 |
| router_state | 路由状态（时间戳等） |

```bash
# 查看数据库文件是否存在
ls -lh store/okclaw.db

# 使用 sqlite3 命令行工具查看
sqlite3 store/okclaw.db ".tables"
sqlite3 store/okclaw.db ".schema messages"

# 查看最近 20 条消息
sqlite3 store/okclaw.db "SELECT id, sender_name, substr(content, 1, 80), timestamp FROM messages ORDER BY timestamp DESC LIMIT 20;"

# 查看已注册群组
sqlite3 store/okclaw.db "SELECT jid, name, channel, folder FROM registered_groups;"

# 查看活跃的定时任务
sqlite3 store/okclaw.db "SELECT id, group_folder, substr(prompt, 1, 50), schedule_type, next_run, status FROM scheduled_tasks WHERE status = 'active';"

# 查看任务执行日志（最近失败的任务）
sqlite3 store/okclaw.db "SELECT task_id, run_at, status, substr(error, 1, 100) FROM task_run_logs WHERE status != 'success' ORDER BY run_at DESC LIMIT 10;"
```

**注意：** 如果 sqlite3 命令不可用，可用 Node.js 脚本替代：
```bash
node -e "const db = require('better-sqlite3')('store/okclaw.db'); console.log(db.prepare('SELECT * FROM registered_groups').all());"
```

## 4. 检查 Agent 会话

Agent 会话数据存储在 `data/sessions/` 目录中，每个群组/工作空间对应一个子目录。

```bash
# 查看会话目录
ls -la data/sessions/

# 查看特定群组的会话文件
ls -la data/sessions/<group-folder>/

# 检查会话数据库中的映射
sqlite3 store/okclaw.db "SELECT group_folder, session_id FROM sessions;"
```

**常见问题：**
- 会话目录不存在 → Agent 从未在该群组运行过
- 会话文件为空或损坏 → 删除该群组的会话目录，下次触发时会自动重建
- 会话数超过 MAX_CONCURRENT_AGENTS（默认 5）→ 等待空闲或调整环境变量

## 5. 验证频道连接

OKClaw 支持三种频道：Web IM、Discord、飞书。启动时会自动注册可用的频道。

```bash
# 检查频道注册情况——查看启动日志中的 "Registered channels" 信息
# 启动时应看到类似: "Registered channels: web, discord, feishu"

# Web IM 频道
# 默认端口 3100，检查 HTTP 和 WebSocket
curl -s http://localhost:3100/api/workspaces | head -20
# WebSocket 端点: ws://localhost:3100

# Discord 频道
# 检查 DISCORD_BOT_TOKEN 是否配置
grep DISCORD .env 2>/dev/null
# 如果已配置但未连接，检查 token 是否有效
# 查看 Discord Developer Portal 中 bot 是否在线

# 飞书频道
# 检查飞书相关环境变量
grep -E "FEISHU|LARK" .env 2>/dev/null
# 验证飞书 webhook 是否可达
```

**频道启动失败排查：**
- Web IM → 端口被占用或前端构建缺失
- Discord → Token 无效、Bot 未上线、缺少 GUILD_MESSAGES intent
- 飞书 → App ID/Secret 错误、事件订阅未配置、权限不足

## 6. 诊断 LLM 问题

LLM 配置由 `~/.claude/settings.json` 统一管理，项目 `.env` 不覆盖 LLM 设置。

```bash
# 检查 Claude Code 是否可用
which claude
claude --version

# 检查 settings.json 中的 LLM 配置
cat ~/.claude/settings.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('env',{}), indent=2))"

# 关键 LLM 环境变量：
# ANTHROPIC_API_KEY — API 密钥
# ANTHROPIC_BASE_URL — 第三方 API 地址（使用官方 API 时留空）
# MODEL — 模型名称（默认 claude-sonnet-4-5-20250929）
```

**LLM 常见错误：**
- `401 Unauthorized` → API Key 无效或已过期
- `404 Not Found` → 模型名称错误，检查 MODEL 变量
- `Connection refused` → ANTHROPIC_BASE_URL 配置错误或服务不可达
- `Rate limit exceeded` → 请求过于频繁，降低并发或等待
- `Claude Code not found` → 未安装 Claude CLI 或 CLAUDE_CODE_PATH 未设置

**验证 LLM 配置：**
```bash
# 使用 Claude CLI 测试连接
echo "Hello, 测试连接" | claude --print 2>&1 | head -5

# 如果使用第三方 LLM，验证 API 端点
curl -s -H "x-api-key: YOUR_KEY" -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"YOUR_MODEL","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}' \
  YOUR_BASE_URL/v1/messages | head -20
```

## 7. 检查定时任务

```bash
# 查看所有定时任务
sqlite3 store/okclaw.db "SELECT id, group_folder, schedule_type, schedule_value, next_run, status FROM scheduled_tasks;"

# 查看最近的任务执行日志
sqlite3 store/okclaw.db "SELECT task_id, run_at, duration_ms, status, substr(error, 1, 100) FROM task_run_logs ORDER BY run_at DESC LIMIT 10;"

# 检查调度器是否在运行（查看日志中的 scheduler 相关信息）
# 调度器轮询间隔由 SCHEDULER_POLL_INTERVAL 控制，默认 60 秒
```

**定时任务常见问题：**
- 任务状态为 `paused` → 被 Agent 暂停，需手动恢复
- `next_run` 为空 → cron 表达式解析失败，检查 `schedule_value` 格式
- 任务一直不执行 → 调度器未启动或群组未注册
- 执行超时 → 检查 `AGENT_TIMEOUT`（默认 30 分钟）

## 8. 常见错误模式与修复

| 错误模式 | 可能原因 | 修复方式 |
|----------|----------|----------|
| 启动即崩溃 | `.env` 缺失或格式错误 | 检查 `.env` 语法，确保无多余空格和引号 |
| `Database not initialized` | 数据库文件损坏 | 删除 `store/okclaw.db`，重启自动重建 |
| Agent 无响应 | LLM 配置错误 | 按第 6 步检查 API Key 和 Base URL |
| 消息发送失败 | 频道连接断开 | 按第 5 步检查频道配置，重启服务 |
| 内存持续增长 | Agent 会话泄漏 | 检查 `data/sessions/` 大小，清理旧会话 |
| WebSocket 断连 | 前端网络问题 | 刷新浏览器页面，检查代理设置 |
| `Claude Code not found` | CLI 未安装或不在 PATH | 安装 Claude Code CLI 或设置 `CLAUDE_CODE_PATH` |
| `EADDRINUSE` | 端口 3100 被占用 | `lsof -i :3100` 查找占用进程并 kill |
| 文件上传失败 | `data/uploads/` 权限问题 | `chmod 755 data/uploads/` |

## 诊断流程总结

1. 检查进程和端口 → 2. 查看日志 → 3. 检查数据库 → 4. 检查会话 → 5. 检查频道 → 6. 检查 LLM → 7. 检查定时任务

根据用户描述的问题，从对应步骤开始排查。如果不确定问题所在，从第 1 步开始顺序执行。
