---
name: setup
nameZh: 安装配置
description: OKClaw 首次安装、依赖安装、LLM 配置、项目构建、服务启动与验证的完整指南
skillType: operational
category: system
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - AskUserQuestion
---

# 安装配置

此技能引导用户完成 OKClaw 的首次安装和配置。按以下步骤顺序执行，每一步确认成功后再进入下一步。

## 1. 检查 Node.js 版本

OKClaw 需要 Node.js >= 20。

```bash
node --version
```

- 如果版本 >= 20 → 继续
- 如果版本 < 20 或未安装 → 引导用户安装：
  - macOS: `brew install node@20` 或从 https://nodejs.org 下载
  - Linux: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs`
  - 推荐使用 nvm: `nvm install 20 && nvm use 20`

同时检查 npm 是否可用：`npm --version`

## 2. 安装项目依赖

```bash
cd <项目根目录>
npm install
```

如果安装失败：
- 网络问题 → 设置镜像: `npm config set registry https://registry.npmmirror.com`
- `better-sqlite3` 编译失败 → 确保安装了构建工具: `xcode-select --install`（macOS）或 `sudo apt install build-essential`（Linux）
- 权限问题 → 不要使用 `sudo npm install`，检查目录权限

## 3. 配置 LLM 提供商

LLM 配置是 OKClaw 运行的必要条件。使用 AskUserQuestion 询问用户选择哪种 LLM 提供商：

**选项：**
1. **Anthropic Claude API** — 官方 Claude API，只需 API Key
2. **第三方 LLM** — 火山引擎/Kimi、OpenRouter 等 Anthropic 兼容 API，需要 API Key + Base URL + 模型名

### 3a. Anthropic Claude API

询问用户（纯文本，非 AskUserQuestion）：
> "请提供您的 Anthropic API Key（以 sk-ant- 开头）："

收到后，检查 `~/.claude/settings.json` 是否存在并更新 env 块：
```json
{
  "env": {
    "ANTHROPIC_API_KEY": "用户提供的关键"
  }
}
```

### 3b. 第三方 LLM

依次询问三个信息（每次一个，等待回答后再问下一个）：
1. "请提供 API Base URL（例如 https://ark.cn-beijing.volces.com/api/coding）："
2. "请提供 API Key："
3. "请提供模型名称（例如 kimi-k2.5）："

收到后更新 `~/.claude/settings.json` 的 env 块：
```json
{
  "env": {
    "ANTHROPIC_API_KEY": "用户提供的Key",
    "ANTHROPIC_BASE_URL": "用户提供的URL",
    "MODEL": "用户提供的模型名"
  }
}
```

### 验证 LLM 配置

```bash
# 检查 Claude CLI 是否可用
which claude && claude --version

# 如果未安装，引导安装
# npm install -g @anthropic-ai/claude-code

# 测试 LLM 连接
echo "你好" | claude --print 2>&1 | head -3
```

如果用户希望使用 `/configure-llm` 技能进行更详细的配置（包括修改 config.ts 和 agent-runner.ts），可引导用户稍后运行该技能。

## 4. 构建项目

```bash
npm run build
```

此命令会：
1. 编译 TypeScript（`tsc`）→ 输出到 `dist/`
2. 构建前端（`cd web && npm run build`）→ 输出到 `web/dist/`

如果构建失败：
- TypeScript 错误 → 检查 `src/` 下的类型问题
- 前端构建失败 → 先 `cd web && npm install`，再重试
- 如果前端无关紧要，可仅编译后端：`npx tsc`

## 5. 启动服务

### 开发模式（推荐首次使用）

```bash
npm run dev
```

使用 `tsx` 直接运行 TypeScript，支持修改后自动重启（需配合 nodemon 等工具）。日志直接输出到终端。

### 生产模式

```bash
npm start
```

运行编译后的 `dist/index.js`。确保先执行了 `npm run build`。

## 6. 验证服务运行

```bash
# 检查进程是否启动
pgrep -f "tsx src/index.ts" || pgrep -f "node dist/index.js"

# 检查端口 3100 是否监听
lsof -i :3100 2>/dev/null

# 测试 Web API
curl -s http://localhost:3100/api/workspaces | head -20

# 浏览器访问
# 打开 http://localhost:3100
```

启动成功时应看到类似日志：
```
[HH:MM:SS] INFO: Registered channels: web
[HH:MM:SS] INFO: OKClaw started on port 3100
```

## 7. 配置开机自启（可选）

询问用户是否需要配置开机自启：

### macOS (launchd)

创建 `~/Library/LaunchAgents/com.okclaw.plist`，内容如下：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.okclaw</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>/绝对路径/okclaw/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key><string>/绝对路径/okclaw</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/绝对路径/okclaw/logs/stdout.log</string>
  <key>StandardErrorPath</key><string>/绝对路径/okclaw/logs/stderr.log</string>
</dict>
</plist>
```

```bash
mkdir -p logs
launchctl load ~/Library/LaunchAgents/com.okclaw.plist
```

### Linux (systemd)

创建 `~/.config/systemd/user/okclaw.service`：

```ini
[Unit]
Description=OKClaw
After=network.target

[Service]
Type=simple
WorkingDirectory=/绝对路径/okclaw
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable okclaw
systemctl --user start okclaw
```

## 8. 后续步骤

服务运行后，引导用户完成以下配置：

1. **添加频道** — 运行 `/customize` 技能添加 Discord、飞书等频道
2. **创建工作空间** — 在 Web UI 中创建工作空间，开始对话
3. **配置触发词** — 默认触发词为 `@Andy`，可在 `.env` 中设置 `ASSISTANT_NAME` 修改
4. **设置定时任务** — 通过对话让 Agent 创建定时任务（cron 或 interval）

## 幂等性

此技能是幂等的：
- 多次运行不会破坏已有配置
- 已存在的 `.env` 条目会被更新而非覆盖
- `npm install` 和 `npm run build` 可安全重复执行
- 如果服务已在运行，会跳过启动步骤
