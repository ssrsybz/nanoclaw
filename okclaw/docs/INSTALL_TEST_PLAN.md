# OKClaw 新 Mac 安装验证测试方案

本文档定义了在新 Mac 电脑上安装 OKClaw 后的完整验证流程。

---

## 一、环境预检

### 1.1 系统要求检查

| 检查项 | 命令 | 预期结果 |
|--------|------|----------|
| macOS 版本 | `sw_vers` | macOS 12+ |
| CPU 架构 | `uname -m` | arm64 (M系列) 或 x86_64 (Intel) |
| 可用内存 | `sysctl hw.memsize` | ≥ 8GB |
| 磁盘空间 | `df -h ~` | ≥ 5GB 可用 |

### 1.2 开发工具检查

```bash
# Xcode 命令行工具
xcode-select -p
# 预期: /Library/Developer/CommandLineTools 或 /Applications/Xcode.app/...

# Homebrew (可选但推荐)
brew --version
# 预期: Homebrew 4.x

# Git
git --version
# 预期: git version 2.x
```

### 1.3 Node.js 环境检查

```bash
# Node.js 版本
node --version
# 预期: v20.x.x 或更高

# npm 版本
npm --version
# 预期: 10.x 或更高

# 如果未安装，使用 nvm 安装:
# curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
# nvm install 20
# nvm use 20
```

---

## 二、安装流程测试

### 2.1 获取代码

```bash
# 方式一: GitHub CLI (推荐)
gh repo fork qwibitai/okclaw --clone
cd okclaw

# 方式二: 直接克隆
git clone https://github.com/qwibitai/okclaw.git
cd okclaw
```

**验证点:**
- [ ] 代码克隆成功，无权限错误
- [ ] 目录结构完整，包含 `src/`、`web/`、`package.json` 等

### 2.2 运行安装脚本

```bash
chmod +x setup.sh
./setup.sh
```

**验证输出:**
```
=== OKCLAW SETUP: BOOTSTRAP ===
PLATFORM: macos
IS_WSL: false
IS_ROOT: false
NODE_VERSION: 20.x.x
NODE_OK: true
DEPS_OK: true
NATIVE_OK: true
HAS_BUILD_TOOLS: true
STATUS: success
=== END ===
```

**检查点:**
- [ ] `STATUS: success` 显示
- [ ] `NODE_OK: true`
- [ ] `DEPS_OK: true`
- [ ] `NATIVE_OK: true` (better-sqlite3 原生模块)

### 2.3 手动安装验证 (备选)

如果脚本失败，手动执行:

```bash
npm install
npm run build
```

**验证点:**
- [ ] `node_modules/` 目录生成
- [ ] `better-sqlite3` 编译成功 (无 node-gyp 错误)
- [ ] `dist/` 目录生成，包含编译后的 JS 文件

---

## 三、配置验证

### 3.1 LLM 凭证配置

检查 Claude CLI 配置文件:

```bash
cat ~/.claude/settings.json
```

**必需字段:**
```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "ANTHROPIC_MODEL": "claude-sonnet-4-6"
  }
}
```

**验证点:**
- [ ] `ANTHROPIC_API_KEY` 已配置
- [ ] API Key 格式正确 (以 `sk-ant-` 开头)

### 3.2 项目环境变量

```bash
cat .env
```

**检查非 LLM 密钥 (如使用飞书):**
```env
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
```

---

## 四、服务启动测试

### 4.1 开发模式启动

```bash
npm run dev
```

**预期日志:**
```
[OKClaw] Starting...
[OKClaw] Database initialized: store/okclaw.db
[OKClaw] Web server listening on http://localhost:3100
[OKClaw] Channels registered: web-im
[OKClaw] Ready.
```

**验证点:**
- [ ] 服务启动无报错
- [ ] 数据库文件 `store/okclaw.db` 自动创建
- [ ] 监听端口 3100

### 4.2 端口占用检查

```bash
lsof -i :3100
```

**预期:**
```
COMMAND   PID   USER   FD   TYPE   DEVICE SIZE/OFF NODE NAME
node    12345  frank   22u  IPv6   0t0t0t0   TCP    *:3100 (LISTEN)
```

### 4.3 后台服务模式

```bash
./start.sh start
./start.sh status
./start.sh logs
./start.sh stop
```

**验证点:**
- [ ] `start` 后台启动成功
- [ ] `status` 显示运行中
- [ ] `logs` 能查看实时日志
- [ ] `stop` 正常停止服务

---

## 五、Web 界面功能测试

### 5.1 页面访问

1. 打开浏览器访问 `http://localhost:3100`
2. 检查页面加载

**验证点:**
- [ ] 页面正常渲染，无 JS 错误 (检查控制台)
- [ ] 显示聊天界面
- [ ] 左侧显示默认工作空间

### 5.2 基础对话功能

1. 在输入框输入 `@Andy 你好`
2. 发送消息
3. 等待 AI 回复

**验证点:**
- [ ] 消息发送成功，显示在对话区
- [ ] AI 流式返回内容
- [ ] Markdown 渲染正常

### 5.3 工作空间管理

1. 点击左侧 "+" 创建新工作空间
2. 输入名称如 "测试空间"
3. 切换工作空间

**验证点:**
- [ ] 新工作空间创建成功
- [ ] 不同工作空间对话隔离
- [ ] 切换后历史对话保留

### 5.4 文件上传功能

1. 准备测试文件:
   - `test.docx` (Word 文档)
   - `test.xlsx` (Excel 表格)
   - `test.pdf` (PDF 文档)

2. 点击上传按钮，选择文件
3. 发送 `@Andy 总结这个文件的内容`

**验证点:**
- [ ] 文件上传成功
- [ ] AI 能解析并总结文件内容

---

## 六、频道集成测试

### 6.1 Web IM 频道 (默认)

**测试步骤:**
1. 访问 `http://localhost:3100`
2. 发送消息验证 WebSocket 连接

**验证点:**
- [ ] WebSocket 连接正常 (检查 Network 面板)
- [ ] 消息实时推送
- [ ] 流式输出正常显示

### 6.2 Discord 频道 (可选)

**前置条件:**
- Discord Bot Token 已配置
- Bot 已加入测试服务器

**测试步骤:**
1. 在 Discord 频道发送 `@Andy 你好`
2. 验证 Bot 回复

**验证点:**
- [ ] Bot 在线
- [ ] 触发词响应正常
- [ ] 消息收发正常

### 6.3 飞书频道 (可选)

**前置条件:**
- 飞书应用已创建
- App ID 和 Secret 已配置

**测试步骤:**
1. 在飞书群聊 @机器人 发送消息
2. 验证机器人回复

---

## 七、定时任务测试

### 7.1 创建定时任务

在主频道发送:
```
@Andy 每分钟输出当前时间，共执行3次
```

**验证点:**
- [ ] 任务创建成功
- [ ] 按时执行
- [ ] 执行次数符合预期

### 7.2 查看任务列表

```
@Andy 列出所有定时任务
```

**验证点:**
- [ ] 显示任务列表
- [ ] 包含任务详情 (时间、状态)

### 7.3 删除任务

```
@Andy 删除刚才的定时任务
```

**验证点:**
- [ ] 任务删除成功
- [ ] 不再执行

---

## 八、Agent 能力测试

### 8.1 文件操作

```
@Andy 创建一个 test.txt 文件，写入 "Hello OKClaw"
```

**验证点:**
- [ ] 文件创建成功
- [ ] 内容写入正确
- [ ] 文件路径在 `groups/` 目录下

### 8.2 Web 搜索

```
@Andy 搜索今天的科技新闻
```

**验证点:**
- [ ] 搜索功能正常
- [ ] 返回相关结果

### 8.3 代码执行

```
@Andy 执行 echo "test" 命令
```

**验证点:**
- [ ] 命令执行成功
- [ ] 返回输出结果
- [ ] 安全提示显示 (直接执行模式)

---

## 九、数据持久化测试

### 9.1 数据库检查

```bash
sqlite3 store/okclaw.db ".tables"
```

**预期表:**
- `groups`
- `messages`
- `workspaces`
- `conversations`
- `tasks`

### 9.2 消息持久化

1. 发送几条消息
2. 重启服务
3. 检查历史消息

**验证点:**
- [ ] 消息保存在数据库
- [ ] 重启后历史可查看

### 9.3 工作空间持久化

1. 创建新工作空间
2. 重启服务
3. 检查工作空间列表

**验证点:**
- [ ] 工作空间配置保留
- [ ] 对话历史保留

---

## 十、异常场景测试

### 10.1 端口冲突

```bash
# 启动两个实例
npm run dev &
npm run dev
```

**验证点:**
- [ ] 第二个实例报错提示端口占用
- [ ] 或自动选择其他端口

### 10.2 API Key 无效

1. 临时修改为无效 Key
2. 发送消息

**验证点:**
- [ ] 返回认证错误
- [ ] 错误信息友好

### 10.3 网络断开

1. 断开网络
2. 发送需要联网的消息

**验证点:**
- [ ] 合理的错误提示
- [ ] 服务不崩溃

### 10.4 大文件上传

1. 上传超过 10MB 的文件

**验证点:**
- [ ] 拒绝上传
- [ ] 显示大小限制提示

---

## 十一、性能基准测试

### 11.1 启动时间

```bash
time npm run dev
```

**预期:** < 5 秒完成启动

### 11.2 内存占用

```bash
ps aux | grep node
```

**预期:** < 200MB (空闲状态)

### 11.3 响应延迟

从发送消息到收到第一个 token 的时间

**预期:** < 3 秒

---

## 十二、日志检查

### 12.1 查看日志

```bash
tail -f logs/okclaw.log
```

**检查项:**
- [ ] 无未捕获异常
- [ ] 无频繁错误重试
- [ ] 时间戳格式正确

### 12.2 错误日志

```bash
grep -i error logs/okclaw.log
```

**验证点:**
- [ ] 无致命错误
- [ ] 警告信息合理

---

## 测试检查清单

### 必须通过项 (阻断性)

- [ ] Node.js 20+ 安装正确
- [ ] `npm install` 成功
- [ ] `better-sqlite3` 编译成功
- [ ] 服务启动无报错
- [ ] Web 界面可访问
- [ ] 基础对话功能正常
- [ ] LLM 凭证配置正确

### 重要功能项

- [ ] 工作空间创建/切换
- [ ] 文件上传解析
- [ ] 定时任务执行
- [ ] 消息持久化

### 可选功能项

- [ ] Discord 频道
- [ ] 飞书频道
- [ ] Web 搜索

---

## 常见问题排查

### Q1: better-sqlite3 编译失败

```bash
# 重新安装编译工具
xcode-select --install
npm rebuild better-sqlite3
```

### Q2: 端口被占用

```bash
# 查找并终止占用进程
lsof -i :3100
kill -9 <PID>
```

### Q3: API 认证失败

```bash
# 验证 Key 格式
echo $ANTHROPIC_API_KEY
# 检查 settings.json
cat ~/.claude/settings.json
```

### Q4: WebSocket 连接失败

检查浏览器控制台，确认:
- URL 使用 `ws://` 而非 `wss://` (本地开发)
- 防火墙未阻止 3100 端口
