# Claude Code 远程控制系统

手机端与电脑终端消息互通系统，允许用户从手机远程控制 Claude Code CLI。

## 目录结构

```
remote-control/
├── shared/              # 共享模块 - 所有服务共用
│   ├── types/          # TypeScript 类型定义
│   ├── protocols/      # 通信协议 (消息、控制、权限)
│   ├── auth/           # 认证安全 (JWT、OAuth、设备信任)
│   └── reconnect/      # 断线重连机制
│
├── terminal-service/    # 电脑终端服务
│   ├── bridge/         # REPL 桥接逻辑
│   └── transport/      # 传输层 (SSE/WebSocket)
│
├── cloud-relay/         # 云服务器中继
│   ├── api/            # REST API 端点
│   │   ├── sessions.ts      # 会话管理
│   │   ├── environments.ts  # 环境注册
│   │   └── events.ts        # 事件流 (SSE)
│   └── storage/        # 事件存储
│
├── mobile-client/       # 手机端应用 (React Native)
│   ├── services/       # 业务服务
│   │   ├── SessionManager.ts    # 会话管理
│   │   ├── MessageHandler.ts    # 消息处理
│   │   ├── PermissionController.ts # 权限控制
│   │   └── Transport.ts         # 网络传输
│   └── components/     # UI 组件
│
└── scripts/             # 工具脚本
    ├── start-dev.sh    # 启动开发环境
    └── debug-proxy.sh  # HTTP/WebSocket 调试代理
```

## 快速启动

```bash
# 1. 安装依赖
npm install

# 2. 启动所有服务
./scripts/start-dev.sh
```

## 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Cloud Relay | 3000 | 云服务器中继，消息转发 |
| Terminal Service | 3002 | 电脑终端桥接服务 |
| Debug Proxy | 8888 | 调试代理 (可选) |

## 架构图

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   手机客户端    │────▶│   云服务器中继   │◀────│   电脑终端服务  │
│ (mobile-client) │     │  (cloud-relay)  │     │(terminal-service)│
│                 │     │                 │     │                 │
│ - 查看对话      │     │ - 消息存储      │     │ - REPL 桥接     │
│ - 发送消息      │     │ - 权限中继      │     │ - 状态同步      │
│ - 批准权限      │     │ - 事件推送      │     │ - 权限回调      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 详细文档

参见: [claude-code-远程控制架构详解.md](../claude-code-远程控制架构详解.md)
