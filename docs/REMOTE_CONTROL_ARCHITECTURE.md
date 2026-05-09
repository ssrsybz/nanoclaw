# OKClaw 远程控制系统架构文档

## 概述

远程控制系统允许手机App远程控制电脑上的Claude Code，实现：
- 扫描二维码连接
- 查看对话消息
- 发送消息给AI
- 远程批准/拒绝权限请求

## 系统架构

```
手机 App ──(HTTP/SSE)──→ 云中继服务器 ──(HTTP/SSE)──→ Terminal服务 ──→ Claude Code
    │                        │                           │
    │   43.167.222.20       │     公网访问               │    本地 localhost:3002
    │   (腾讯云)             │                           │
    └───────────────────────┴───────────────────────────┘
```

## 模块详情

### 1. 云中继服务器 (Cloud Relay)

**部署位置**: 腾讯云服务器 `43.167.222.20`

**本地源码**: `/Users/frank/Downloads/3月工作/编程/okclaw/remote-control/cloud-relay/`

**服务器部署目录**: `/opt/okclaw-relay/`

**端口**: 80 (nginx代理) → 3000 (node服务)

**主要文件**:
```
remote-control/cloud-relay/
├── index.ts              # 服务入口
├── api/
│   ├── sessions.ts       # 会话管理API
│   ├── events.ts         # SSE事件流API
│   └── environments.ts   # 环境API
├── storage/
│   └── events.ts         # 事件存储
└── package.json
```

**API端点**:
- `GET /health` - 健康检查
- `POST /v1/code/sessions` - 创建会话
- `GET /v1/code/sessions/:sessionId` - 获取会话信息
- `POST /v1/code/sessions/:sessionId/bridge` - 获取Worker JWT
- `POST /v1/code/sessions/:sessionId/worker/events` - 发送事件
- `GET /v1/code/sessions/:sessionId/worker/events/stream` - SSE事件流

**SSH访问**:
```bash
sshpass -p 'afjlAFJL7177' ssh root@43.167.222.20
```

**PM2管理**:
```bash
npx pm2 list
npx pm2 logs cloud-relay
npx pm2 restart cloud-relay
```

---

### 2. Terminal服务 (本地)

**源码位置**: `/Users/frank/Downloads/3月工作/编程/okclaw/remote-control/terminal-service/`

**端口**: 3002

**主要文件**:
```
remote-control/terminal-service/
├── index.ts              # 服务入口
└── bridge/
    ├── index.ts          # 桥接逻辑
    └── transport.ts      # SSE传输
```

**API端点**:
- `GET /health` - 健康检查
- `POST /bridge/create` - 创建桥接
- `POST /bridge/:sessionId/send` - 发送消息
- `POST /bridge/:sessionId/close` - 关闭桥接

**启动方式**: 通过 `remote-control/scripts/start-dev.sh` 启动

---

### 3. 共享模块

**源码位置**: `/Users/frank/Downloads/3月工作/编程/okclaw/remote-control/shared/`

**主要文件**:
```
remote-control/shared/
├── auth/
│   ├── jwt.ts            # JWT签名和验证
│   ├── oauth.ts          # OAuth相关
│   └── device-trust.ts   # 设备信任
├── protocols/
│   ├── messages.ts       # 消息类型定义
│   ├── control.ts        # 控制协议
│   └── permission.ts     # 权限协议
├── types/
│   └── index.ts          # 类型定义
└── reconnect/
    └── index.ts          # 重连逻辑
```

---

### 4. Flutter手机App

**项目位置**: `/Users/frank/Downloads/3月工作/编程/okclaw/flutter_doubao_副本/flutter_doubao_app/`

**主要文件**:
```
lib/src/
├── models/remote_control/
│   ├── connection_config.dart   # 连接配置模型
│   ├── session_state.dart       # 会话状态
│   └── message.dart             # 消息类型
│
├── services/remote_control/
│   ├── remote_control_service.dart  # 主连接服务 (SSE)
│   └── qr_scanner_service.dart      # 二维码解析
│
├── providers/remote_control/
│   └── remote_control_provider.dart  # 状态管理
│
├── screens/remote_control/
│   ├── qr_scanner_screen.dart    # 扫描页面
│   └── remote_control_screen.dart # 会话页面
│
└── widgets/remote_control/
    ├── message_bubble.dart       # 消息气泡
    └── permission_dialog.dart    # 权限对话框
```

**构建命令**:
```bash
cd /Users/frank/Downloads/3月工作/编程/okclaw/flutter_doubao_副本/flutter_doubao_app
/Users/frank/flutter/bin/flutter build apk --release
```

**APK输出**: `build/app/outputs/flutter-apk/app-release.apk`

**安装命令**:
```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
```

---

### 5. Web前端集成

**源码位置**: `/Users/frank/Downloads/3月工作/编程/okclaw/okclaw/web/src/components/RemoteControlPanel.tsx`

**功能**:
- 显示二维码供手机扫描
- 步骤引导用户使用
- 服务状态检查

**API路由** (在 `okclaw/src/channels/web.ts`):
- `GET /api/remote-control/config` - 获取配置（含云服务器地址）
- `GET /api/remote-control/status` - 服务状态检查

---

## 配置信息

### 云服务器配置

```typescript
// okclaw/src/channels/web.ts 中的配置
cloudRelayUrl: 'http://43.167.222.20'
terminalServiceUrl: 'http://localhost:3002'
```

### 云服务器环境变量

```bash
BASE_URL=http://43.167.222.20
```

### 服务器Nginx配置

**配置文件**: `/etc/nginx/conf.d/cloud-relay.conf`

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 消息流转

### 连接流程

```
1. 手机扫描二维码获取配置
2. POST /v1/code/sessions → 创建会话，获取sessionId和sessionUrl
3. POST /v1/code/sessions/:sessionId/bridge → 获取worker_jwt和worker_epoch
4. GET /v1/code/sessions/:sessionId/worker/events/stream → 建立SSE连接
```

### 发送消息

```
手机 → POST /v1/code/sessions/:sessionId/worker/events → 云中继 → Terminal服务 → Claude Code
```

### 接收消息

```
Claude Code → Terminal服务 → 云中继SSE推送 → 手机App
```

---

## Debug命令

### 检查云中继服务状态

```bash
curl -s http://43.167.222.20/health
```

### 检查本地服务状态

```bash
curl -s http://localhost:3100/api/remote-control/status | jq .
```

### 创建测试会话

```bash
curl -X POST http://43.167.222.20/v1/code/sessions \
  -H "Content-Type: application/json" \
  -d '{"title": "Test"}'
```

### 查看云服务器日志

```bash
sshpass -p 'afjlAFJL7177' ssh root@43.167.222.20 'npx pm2 logs cloud-relay --lines 50 --nostream'
```

### 查看本地terminal服务日志

```bash
# 查看运行中的进程
lsof -i:3002

# 如果通过脚本启动，查看输出
```

### 查看手机App日志

```bash
adb logcat -s flutter
```

---

## 已知问题

### 1. 消息未转发到Claude Code

**现象**: 手机发送消息后，没有收到AI回复

**可能原因**:
- Terminal服务未正确桥接到Claude Code
- 消息未从云中继转发到Terminal服务

**排查步骤**:
1. 检查terminal服务是否运行: `lsof -i:3002`
2. 检查云中继事件是否存储: 查看云服务器日志
3. 检查消息是否从云中继推送到Terminal服务

### 2. SSE连接断开

**排查**: 检查心跳机制是否正常工作

---

## 启动脚本

**位置**: `/Users/frank/Downloads/3月工作/编程/okclaw/remote-control/scripts/start-dev.sh`

**功能**: 启动本地开发环境（cloud-relay + terminal-service）

---

## 后续TODO

1. [ ] 完善Terminal服务到Claude Code的消息桥接
2. [ ] 实现消息从Claude Code返回到手机App的完整链路
3. [ ] 添加消息持久化（目前使用内存存储）
4. [ ] 实现权限请求的完整流程
