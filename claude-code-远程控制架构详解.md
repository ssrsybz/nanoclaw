# Claude Code 远程控制架构详解

## 手机端与电脑终端消息互通系统

本文档详细描述 Claude Code CLI 的远程控制系统架构，包括手机客户端、电脑终端服务、通信协议的完整设计。

---

## 目录

1. [系统概览](#系统概览)
2. [整体架构](#整体架构)
3. [手机端设计](#手机端设计)
4. [电脑终端服务设计](#电脑终端服务设计)
5. [云服务器中继设计](#云服务器中继设计)
6. [通信协议详解](#通信协议详解)
7. [消息流转机制](#消息流转机制)
8. [认证与安全](#认证与安全)
9. [断线重连与容错](#断线重连与容错)
10. [核心代码解析](#核心代码解析)

---

## 系统概览

### 功能描述

Claude Code 远程控制允许用户：

- 从手机端查看电脑终端的 AI 对话
- 从手机端发送消息给 AI
- 在手机端批准/拒绝权限请求
- 中断正在进行的操作
- 切换 AI 模型

### 支持平台

| 平台 | 应用商店 | 应用 ID |
|------|---------|---------|
| iOS | App Store | `com.anthropic.claude` (id6473753684) |
| Android | Google Play | `com.anthropic.claude` |

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Claude.ai 云服务                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ Session     │    │ Environment │    │ Session     │    │ Event       │  │
│  │ Ingress     │    │ API         │    │ Stream      │    │ Notifier    │  │
│  │ (WebSocket) │    │ (REST)      │    │ (SSE)       │    │ (Pub/Sub)   │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
└─────────┼──────────────────┼──────────────────┼──────────────────┼─────────┘
          │                  │                  │                  │
          │ WebSocket        │ REST API         │ SSE              │ Pub/Sub
          │                  │                  │                  │
┌─────────┴─────────┐        │        ┌─────────┴─────────┐        │
│   手机客户端       │        │        │   电脑终端        │        │
│   (iOS/Android)   │        │        │   (CLI Bridge)    │        │
│                   │        │        │                   │        │
│ ┌───────────────┐ │        │        │ ┌───────────────┐ │        │
│ │ Claude App    │ │        │        │ │ replBridge    │ │        │
│ │ - 对话界面    │ │        │        │ │ - 消息处理    │ │        │
│ │ - 权限弹窗    │ │        │        │ │ - 状态同步    │ │        │
│ │ - 设置面板    │ │        │        │ │ - 权限回调    │ │        │
│ └───────────────┘ │        │        │ └───────────────┘ │        │
│ ┌───────────────┐ │        │        │ ┌───────────────┐ │        │
│ │ Transport     │ │        │        │ │ Transport     │ │        │
│ │ - WebSocket   │ │        │        │ │ - SSE/WS      │ │        │
│ │ - HTTP POST   │ │        │        │ │ - CCRClient   │ │        │
│ └───────────────┘ │        │        │ └───────────────┘ │        │
└───────────────────┘        │        └───────────────────┘        │
                             │                                    │
                             └────────────────────────────────────┘
```

---

## 手机端设计

### 1. 应用入口

手机应用通过扫描二维码或直接选择已注册的环境来连接电脑终端。

```typescript
// commands/mobile/mobile.tsx
// 显示下载二维码

const PLATFORMS = {
  ios: {
    url: 'https://apps.apple.com/app/claude-by-anthropic/id6473753684'
  },
  android: {
    url: 'https://play.google.com/store/apps/details?id=com.anthropic.claude'
  }
}
```

### 2. 手机端架构

```
┌─────────────────────────────────────────────────────────┐
│                    手机客户端 (Native)                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │   UI 层         │  │   业务逻辑层     │              │
│  │                 │  │                 │              │
│  │ - Conversation  │  │ - SessionMgr    │              │
│  │   View          │  │ - MessageHandler│              │
│  │ - Permission    │  │ - PermissionCtrl│              │
│  │   Dialog        │  │ - StateSync     │              │
│  │ - Settings      │  │                 │              │
│  │   Panel         │  │                 │              │
│  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                        │
│           └──────────┬─────────┘                        │
│                      │                                  │
│           ┌──────────┴──────────┐                       │
│           │   通信层            │                       │
│           │                     │                       │
│           │ - WebSocket Client  │                       │
│           │ - HTTP Client       │                       │
│           │ - SSE Client        │                       │
│           │ - Auth Manager      │                       │
│           └─────────────────────┘                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3. 手机端功能模块

#### 3.1 会话管理

```typescript
// 手机端会话状态
interface MobileSession {
  sessionId: string           // 会话 ID
  environmentId: string       // 环境ID (电脑标识)
  title: string               // 会话标题
  status: 'active' | 'idle'   // 状态
  lastActivity: Date          // 最后活动时间
  messages: SDKMessage[]      // 消息列表
}
```

#### 3.2 消息类型处理

```typescript
// 手机端接收的消息类型
type MobileInboundMessage = 
  | { type: 'user', content: ContentBlock[] }      // 用户消息
  | { type: 'assistant', content: ContentBlock[] } // AI 回复
  | { type: 'system', subtype: 'local_command' }   // 系统消息
  | { type: 'stream_event', ... }                  // 流式输出

// 手机端发送的消息类型
type MobileOutboundMessage =
  | { type: 'user', content: string }              // 用户输入
  | { type: 'control_response', ... }              // 权限响应
  | { type: 'control_request', subtype: 'interrupt' } // 中断请求
```

#### 3.3 权限处理流程

```
┌─────────────┐                    ┌─────────────┐
│  电脑终端   │                    │  手机客户端  │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  1. 遇到权限敏感操作             │
       │     (文件读写、命令执行)         │
       │                                  │
       │  2. 发送 control_request         │
       │     {subtype: 'can_use_tool',    │
       │      tool_name: 'Bash',          │
       │      input: {...}}               │
       │ ────────────────────────────────>│
       │                                  │
       │                                  │ 3. 显示权限弹窗
       │                                  │    [允许] [拒绝]
       │                                  │
       │  4. 用户选择后发送               │
       │     control_response             │
       │     {behavior: 'allow'}          │
       │ <────────────────────────────────│
       │                                  │
       │  5. 继续执行或取消               │
       │                                  │
```

---

## 电脑终端服务设计

### 1. Bridge 核心架构

电脑终端的 Bridge 服务负责与云服务器通信，处理来自手机端的消息。

```
bridge/
├── replBridge.ts              # REPL 桥接主逻辑 (100KB)
├── remoteBridgeCore.ts        # 远程桥接核心
├── initReplBridge.ts          # 初始化入口
├── bridgeMessaging.ts         # 消息处理
├── replBridgeTransport.ts     # 传输层抽象
├── bridgeApi.ts               # API 客户端
├── bridgeEnabled.ts           # 启用检测
├── bridgeConfig.ts            # 配置管理
├── bridgeUI.ts                # UI 显示
├── createSession.ts           # 会话创建
├── sessionRunner.ts           # 会话运行
├── trustedDevice.ts           # 设备信任
├── jwtUtils.ts                # JWT 工具
├── workSecret.ts              # 工作密钥
└── types.ts                   # 类型定义
```

### 2. 核心组件详解

#### 2.1 replBridge.ts - 主桥接逻辑

```typescript
// 桥接状态
type BridgeState = 
  | 'idle'          // 空闲，等待连接
  | 'connecting'    // 连接中
  | 'connected'     // 已连接
  | 'reconnecting'  // 重连中
  | 'failed'        // 失败

// 桥接句柄
interface ReplBridgeHandle {
  // 发送消息到手机端
  writeMessages(messages: Message[]): Promise<void>
  
  // 状态
  state: BridgeState
  
  // 关闭连接
  close(): void
  
  // 刷新消息
  flush(): Promise<void>
}
```

#### 2.2 bridgeMessaging.ts - 消息处理

```typescript
/**
 * 处理入口消息
 * @param data - 原始消息字符串
 * @param recentPostedUUIDs - 已发送消息 UUID 集合 (防回显)
 * @param recentInboundUUIDs - 已接收消息 UUID 集合 (防重复)
 */
export function handleIngressMessage(
  data: string,
  recentPostedUUIDs: BoundedUUIDSet,
  recentInboundUUIDs: BoundedUUIDSet,
  onInboundMessage: (msg: SDKMessage) => void,
  onPermissionResponse: (response: SDKControlResponse) => void,
  onControlRequest: (request: SDKControlRequest) => void,
): void {
  const parsed = jsonParse(data)

  // 1. 权限响应 (手机端批准/拒绝)
  if (isSDKControlResponse(parsed)) {
    onPermissionResponse?.(parsed)
    return
  }

  // 2. 控制请求 (设置模型、中断等)
  if (isSDKControlRequest(parsed)) {
    onControlRequest?.(parsed)
    return
  }

  // 3. 用户消息 (从手机发送)
  if (parsed.type === 'user') {
    // 防止回显和重复
    if (recentPostedUUIDs.has(uuid) || recentInboundUUIDs.has(uuid)) {
      return
    }
    recentInboundUUIDs.add(uuid)
    onInboundMessage?.(parsed)
  }
}
```

#### 2.3 replBridgeTransport.ts - 传输层

```typescript
/**
 * 传输层抽象接口
 * 支持 v1 (WebSocket) 和 v2 (SSE + CCR) 两种协议
 */
export type ReplBridgeTransport = {
  // 发送消息
  write(message: StdoutMessage): Promise<void>
  writeBatch(messages: StdoutMessage[]): Promise<void>
  
  // 连接管理
  connect(): void
  close(): void
  isConnectedStatus(): boolean
  getStateLabel(): string
  
  // 事件回调
  setOnData(callback: (data: string) => void): void
  setOnClose(callback: (closeCode?: number) => void): void
  setOnConnect(callback: () => void): void
  
  // 状态上报
  reportState(state: SessionState): void
  reportMetadata(metadata: Record<string, unknown>): void
  reportDelivery(eventId: string, status: 'processing' | 'processed'): void
  
  // 序列号管理 (断线重连)
  getLastSequenceNum(): number
  
  // 刷新
  flush(): Promise<void>
}
```

### 3. 两种传输协议

#### 3.1 v1 协议 (传统)

```
┌─────────────┐                    ┌─────────────┐
│  电脑终端   │                    │  云服务器    │
│             │                    │             │
│  WebSocket  │<──── 读取 ────────>│ Session     │
│  Client     │                    │ Ingress     │
│             │                    │             │
│  HTTP POST  │───── 写入 ────────>│ API         │
│             │                    │             │
└─────────────┘                    └─────────────┘
```

#### 3.2 v2 协议 (CCR v2 - 推荐)

```
┌─────────────┐                    ┌─────────────┐
│  电脑终端   │                    │  云服务器    │
│             │                    │             │
│  SSE        │<──── 读取 ────────>│ /worker/    │
│  Transport  │     事件流         │ events/     │
│             │                    │ stream      │
│  CCRClient  │───── 写入 ────────>│             │
│             │     POST           │ /worker/    │
│             │                    │ events      │
│             │                    │             │
│  Heartbeat  │───── 心跳 ────────>│ /worker/    │
│  (20s)      │                    │ heartbeat   │
│             │                    │             │
└─────────────┘                    └─────────────┘
```

### 4. 会话生命周期

```
┌─────────────────────────────────────────────────────────────┐
│                      会话生命周期                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. 启动 Bridge                                             │
│     $ claude remote-control                                 │
│     │                                                       │
│     ▼                                                       │
│  2. 注册环境                                                 │
│     POST /v1/environments                                   │
│     → { environment_id, environment_secret }                │
│     │                                                       │
│     ▼                                                       │
│  3. 轮询等待工作                                             │
│     GET /v1/environments/{id}/work                          │
│     (阻塞直到手机端选择此环境)                               │
│     │                                                       │
│     ▼                                                       │
│  4. 建立传输连接                                             │
│     - WebSocket/SSE 连接                                    │
│     - 心跳启动                                              │
│     │                                                       │
│     ▼                                                       │
│  5. 消息循环                                                 │
│     - 接收手机消息 → 处理 → 发送响应                        │
│     - AI 输出 → 发送到手机                                  │
│     - 权限请求 → 等待手机响应                               │
│     │                                                       │
│     ▼                                                       │
│  6. 会话结束                                                 │
│     - 用户退出                                              │
│     - 超时                                                  │
│     - 错误                                                  │
│     │                                                       │
│     ▼                                                       │
│  7. 清理                                                     │
│     - 关闭连接                                              │
│     - 归档会话                                              │
│     - 注销环境                                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 云服务器中继设计

### 1. 核心 API 端点

```
Session Ingress API
├── /v1/code/sessions                    # 创建会话
├── /v1/code/sessions/{id}               # 会话操作
├── /v1/code/sessions/{id}/bridge        # 获取 Worker JWT
├── /v1/code/sessions/{id}/worker        # Worker 状态
│   ├── PUT    /worker                   # 更新状态
│   ├── POST   /worker/heartbeat         # 心跳
│   ├── POST   /worker/events            # 发送事件
│   ├── GET    /worker/events/stream     # SSE 事件流
│   └── POST   /worker/events/delivery   # 送达确认

Environments API (v1 传统)
├── POST   /v1/environments              # 注册环境
├── GET    /v1/environments/{id}/work    # 轮询工作
├── POST   /v1/environments/{id}/ack     # 确认工作
├── POST   /v1/environments/{id}/stop    # 停止工作
└── DELETE /v1/environments/{id}         # 注销环境
```

### 2. 消息存储与中继

```typescript
// 服务器端消息结构
interface StoredEvent {
  event_id: string           // 事件 ID
  sequence_num: number       // 序列号 (用于断线重连)
  event_type: string         // 事件类型
  source: 'user' | 'assistant' | 'system'
  payload: Record<string, unknown>  // 消息内容
  created_at: string         // 创建时间
  delivery_status: 'pending' | 'delivered' | 'processed'
}

// 中继流程
// 1. 手机端发送消息 → 服务器存储 → 推送给电脑终端
// 2. 电脑终端发送输出 → 服务器存储 → 推送给手机端
// 3. 断线重连时，根据 sequence_num 恢复消息
```

### 3. Epoch 机制

```typescript
// Epoch 用于检测冲突
// 当新的连接建立时，epoch 递增
// 旧连接收到 409 Conflict 后自动退出

interface WorkerState {
  worker_epoch: number       // 版本号
  worker_status: 'idle' | 'busy'
  last_heartbeat: Date
}

// 电脑终端收到 409 时
if (response.status === 409) {
  // 另一个实例已取代此连接
  // 退出以避免冲突
  process.exit(1)
}
```

---

## 通信协议详解

### 1. SDK 消息类型

```typescript
// 用户消息
interface SDKUserMessage {
  type: 'user'
  uuid: string
  content: string | ContentBlock[]
  session_id?: string
}

// AI 回复
interface SDKAssistantMessage {
  type: 'assistant'
  uuid: string
  content: ContentBlock[]
  session_id?: string
  message: {
    id: string              // API 消息 ID (msg_xxx)
  }
}

// 流式事件
interface SDKStreamEvent {
  type: 'stream_event'
  uuid: string
  session_id: string
  event: {
    type: 'content_block_delta'
    index: number
    delta: { type: 'text_delta', text: string }
  }
}

// 结果消息
interface SDKResultMessage {
  type: 'result'
  subtype: 'success' | 'error'
  session_id: string
  duration_ms: number
  total_cost_usd: number
  usage: Usage
}
```

### 2. 控制协议

```typescript
// 控制请求 (服务器 → 电脑终端)
type SDKControlRequest =
  | { subtype: 'initialize' }                          // 初始化
  | { subtype: 'set_model', model: string }            // 设置模型
  | { subtype: 'interrupt' }                           // 中断
  | { subtype: 'set_permission_mode', mode: string }   // 设置权限模式
  | { subtype: 'can_use_tool', tool_name: string, ... } // 权限请求

// 控制响应 (电脑终端 → 服务器)
type SDKControlResponse = {
  type: 'control_response'
  response: {
    subtype: 'success' | 'error'
    request_id: string
    response?: Record<string, unknown>  // 成功时的数据
    error?: string                       // 错误信息
  }
}
```

### 3. 权限协议详细

```typescript
// 权限请求
interface PermissionRequest {
  subtype: 'can_use_tool'
  request_id: string
  tool_name: string           // 工具名: 'Bash', 'Read', 'Write' 等
  input: Record<string, unknown>  // 工具输入
  title?: string              // 显示标题
  description?: string        // 操作描述
  tool_use_id: string         // 工具调用 ID
  agent_id?: string           // Agent ID (子代理)
}

// 权限响应
interface PermissionResponse {
  subtype: 'success'
  request_id: string
  response: {
    behavior: 'allow' | 'deny'  // 允许或拒绝
    update?: PermissionUpdate   // 权限更新 (记住选择)
  }
}
```

### 4. 消息序列图

```
手机端              云服务器              电脑终端
  │                   │                    │
  │  1. 用户输入       │                    │
  │  "帮我写个函数"   │                    │
  │ ─────────────────>│                    │
  │                   │  2. 存储并转发      │
  │                   │  {type: 'user'}    │
  │                   │ ──────────────────>│
  │                   │                    │
  │                   │                    │ 3. AI 处理
  │                   │                    │    调用 Claude API
  │                   │                    │
  │                   │  4. 流式输出       │
  │                   │  {type: 'stream_  │
  │                   │   event', ...}     │
  │                   │ <──────────────────│
  │                   │                    │
  │  5. 推送给手机    │                    │
  │  流式显示回复     │                    │
  │ <─────────────────│                    │
  │                   │                    │
  │                   │  6. 遇到权限请求   │
  │                   │  {subtype:         │
  │                   │   'can_use_tool'}  │
  │                   │ <──────────────────│
  │                   │                    │
  │  7. 显示权限弹窗  │                    │
  │  [允许] [拒绝]   │                    │
  │                   │                    │
  │  8. 用户选择      │                    │
  │  {behavior:       │                    │
  │   'allow'}        │                    │
  │ ─────────────────>│                    │
  │                   │  9. 转发响应       │
  │                   │ ──────────────────>│
  │                   │                    │
  │                   │                    │ 10. 继续执行
  │                   │                    │
  │                   │  11. 最终结果      │
  │                   │  {type: 'result'}  │
  │                   │ <──────────────────│
  │                   │                    │
  │  12. 显示结果     │                    │
  │ <─────────────────│                    │
  │                   │                    │
```

---

## 消息流转机制

### 1. 出站消息 (电脑 → 手机)

```typescript
// replBridge.ts 中的消息发送

async function writeMessages(messages: Message[]): Promise<void> {
  // 1. 过滤可桥接的消息
  const eligible = messages.filter(isEligibleBridgeMessage)
  
  // 2. 转换为 SDK 格式
  const sdkMessages = toSDKMessages(eligible)
  
  // 3. 通过传输层发送
  await transport.writeBatch(sdkMessages)
}

// 消息过滤规则
function isEligibleBridgeMessage(m: Message): boolean {
  // 虚拟消息不转发 (内部 REPL 调用)
  if (m.isVirtual) return false
  
  // 只转发用户消息、AI 回复、本地命令
  return (
    m.type === 'user' ||
    m.type === 'assistant' ||
    (m.type === 'system' && m.subtype === 'local_command')
  )
}
```

### 2. 入站消息 (手机 → 电脑)

```typescript
// 消息入口处理

function handleInboundMessage(msg: SDKMessage): void {
  // 1. 验证 UUID (防重复)
  if (recentInboundUUIDs.has(msg.uuid)) {
    return
  }
  recentInboundUUIDs.add(msg.uuid)
  
  // 2. 记录分析事件
  logEvent('tengu_bridge_message_received', {
    is_repl: true
  })
  
  // 3. 处理消息
  if (msg.type === 'user') {
    // 注入到 REPL 输入流
    injectUserMessage(msg)
  }
}
```

### 3. UUID 去重机制

```typescript
/**
 * 有界 UUID 集合
 * 使用环形缓冲区实现，固定内存使用
 */
export class BoundedUUIDSet {
  private readonly capacity: number
  private readonly ring: (string | undefined)[]
  private readonly set = new Set<string>()
  private writeIdx = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.ring = new Array<string | undefined>(capacity)
  }

  add(uuid: string): void {
    if (this.set.has(uuid)) return
    
    // 淘汰最老的条目
    const evicted = this.ring[this.writeIdx]
    if (evicted !== undefined) {
      this.set.delete(evicted)
    }
    
    // 添加新条目
    this.ring[this.writeIdx] = uuid
    this.set.add(uuid)
    this.writeIdx = (this.writeIdx + 1) % this.capacity
  }

  has(uuid: string): boolean {
    return this.set.has(uuid)
  }
}
```

---

## 认证与安全

### 1. OAuth 认证流程

```
┌─────────────┐                    ┌─────────────┐
│  电脑终端   │                    │  Claude.ai  │
│             │                    │             │
│  1. /login  │                    │             │
│ ────────────│───────────────────>│             │
│             │                    │             │
│             │  2. 浏览器授权     │             │
│             │ <─────────────────│             │
│             │                    │             │
│  3. 获取 OAuth Token            │             │
│ <───────────│───────────────────│             │
│             │                    │             │
│  4. 存储 Token 到 Keychain      │             │
│             │                    │             │
│  5. 启动 remote-control          │             │
│ ────────────│───────────────────>│             │
│             │                    │             │
│             │  6. 验证 Token     │             │
│             │                    │             │
│  7. 获取 Worker JWT             │             │
│ <───────────│───────────────────│             │
│             │                    │             │
└─────────────┘                    └─────────────┘
```

### 2. JWT 结构

```typescript
// Worker JWT 包含
interface WorkerJWT {
  session_id: string          // 会话 ID
  role: 'worker'              // 角色
  exp: number                 // 过期时间
  iat: number                 // 签发时间
}

// 使用
const headers = {
  'Authorization': `Bearer ${workerJWT}`,
  'anthropic-version': '2023-06-01'
}
```

### 3. 设备信任机制

```typescript
// trustedDevice.ts

// 获取设备信任 Token
export async function getTrustedDeviceToken(): Promise<string | null> {
  // 从安全存储读取
  return readFromKeychain('claude-trusted-device')
}

// 设备信任用于:
// - 跳过某些权限确认
// - 记住设备选择
// - 自动重连
```

---

## 断线重连与容错

### 1. 心跳机制

```typescript
// 默认心跳间隔: 20 秒
// 服务器 TTL: 60 秒
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000

// 心跳流程
async function sendHeartbeat(): Promise<void> {
  if (heartbeatInFlight) return
  heartbeatInFlight = true
  
  try {
    await request('post', '/worker/heartbeat', {
      session_id: sessionId,
      worker_epoch: workerEpoch
    })
    logForDebugging('Heartbeat sent')
  } finally {
    heartbeatInFlight = false
  }
}
```

### 2. 重连策略

```typescript
// SSE 传输层重连配置
const RECONNECT_BASE_DELAY_MS = 1000      // 基础延迟
const RECONNECT_MAX_DELAY_MS = 30_000     // 最大延迟
const RECONNECT_GIVE_UP_MS = 600_000      // 放弃时间 (10 分钟)

// 指数退避重连
function getReconnectDelay(attempt: number): number {
  const delay = Math.min(
    RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
    RECONNECT_MAX_DELAY_MS
  )
  // 添加抖动
  return delay + Math.random() * 1000
}
```

### 3. 序列号恢复

```typescript
// SSE 传输支持序列号
interface SSETransport {
  // 获取最后接收的序列号
  getLastSequenceNum(): number
  
  // 连接时发送 from_sequence_num
  connect(): void {
    const url = new URL(sseUrl)
    if (lastSequenceNum > 0) {
      url.searchParams.set('from_sequence_num', lastSequenceNum.toString())
    }
    // 开始 SSE 流
    startStream(url)
  }
}

// 服务器根据序列号恢复消息
// 避免重新发送整个会话历史
```

### 4. 错误处理

```typescript
// HTTP 状态码处理
const PERMANENT_HTTP_CODES = new Set([401, 403, 404])

// 401 Unauthorized
if (status === 401) {
  // 检查 Token 是否过期
  const exp = decodeJwtExpiry(token)
  if (exp * 1000 < Date.now()) {
    // Token 过期，尝试刷新
    await refreshOAuthToken()
  } else {
    // 其他认证错误，需要重新登录
    onStateChange?.('failed', '/login')
  }
}

// 409 Conflict
if (status === 409) {
  // 另一个实例已取代此连接
  // Epoch 不匹配，退出
  handleEpochMismatch()
}

// 429 Rate Limited
if (status === 429) {
  const retryAfter = response.headers['retry-after']
  await sleep(parseInt(retryAfter) * 1000)
}
```

---

## 核心代码解析

### 1. Bridge 初始化

```typescript
// initReplBridge.ts

export async function initReplBridge(
  options?: InitBridgeOptions
): Promise<ReplBridgeHandle | null> {
  // 1. 检查功能开关
  if (!(await isBridgeEnabledBlocking())) {
    return null
  }
  
  // 2. 检查 OAuth 登录
  if (!getBridgeAccessToken()) {
    onStateChange?.('failed', '/login')
    return null
  }
  
  // 3. 检查组织策略
  await waitForPolicyLimitsToLoad()
  if (!isPolicyAllowed('allow_remote_control')) {
    onStateChange?.('failed', "disabled by your organization's policy")
    return null
  }
  
  // 4. 刷新过期的 Token
  await checkAndRefreshOAuthTokenIfNeeded()
  
  // 5. 选择协议版本
  if (isEnvLessBridgeEnabled()) {
    // v2: 直接连接 Session Ingress
    return initEnvLessBridgeCore(params)
  } else {
    // v1: 通过 Environments API
    return initBridgeCore(params)
  }
}
```

### 2. 环境注册 (v1)

```typescript
// 注册环境
async function registerEnvironment(
  config: BridgeConfig
): Promise<{ environment_id: string, environment_secret: string }> {
  const response = await axios.post(
    `${apiBaseUrl}/v1/environments`,
    {
      machine_name: config.machineName,
      branch: config.branch,
      git_repo_url: config.gitRepoUrl,
      max_sessions: config.maxSessions,
      spawn_mode: config.spawnMode,
      worker_type: config.workerType,
      metadata: {
        dir: config.dir,
        bridge_id: config.bridgeId
      }
    },
    {
      headers: oauthHeaders(accessToken)
    }
  )
  
  return {
    environment_id: response.data.id,
    environment_secret: response.data.secret
  }
}
```

### 3. 会话创建 (v2)

```typescript
// remoteBridgeCore.ts

async function createSession(
  baseUrl: string,
  orgUUID: string,
  title: string
): Promise<{ sessionId: string, sessionUrl: string }> {
  // 创建会话
  const response = await axios.post(
    `${baseUrl}/v1/code/sessions`,
    {
      title: title,
      organization_uuid: orgUUID
    },
    {
      headers: oauthHeaders(accessToken)
    }
  )
  
  const sessionId = response.data.id
  const sessionUrl = response.data.url
  
  return { sessionId, sessionUrl }
}

// 获取 Worker JWT
async function bridgeSession(
  sessionUrl: string
): Promise<{ workerJwt: string, workerEpoch: number }> {
  const response = await axios.post(
    `${sessionUrl}/bridge`,
    {},
    {
      headers: oauthHeaders(accessToken)
    }
  )
  
  return {
    workerJwt: response.data.worker_jwt,
    workerEpoch: response.data.worker_epoch
  }
}
```

### 4. 传输层连接

```typescript
// replBridgeTransport.ts

export async function createV2ReplTransport(opts: {
  sessionUrl: string
  ingressToken: string
  sessionId: string
  initialSequenceNum?: number
  epoch?: number
}): Promise<ReplBridgeTransport> {
  
  // 1. 注册 Worker (如果没有 epoch)
  const epoch = opts.epoch ?? await registerWorker(sessionUrl, ingressToken)
  
  // 2. 构建 SSE URL
  const sseUrl = new URL(sessionUrl)
  sseUrl.pathname += '/worker/events/stream'
  
  // 3. 创建 SSE 传输
  const sse = new SSETransport(
    sseUrl,
    {},
    sessionId,
    undefined,
    opts.initialSequenceNum,
    getAuthHeaders
  )
  
  // 4. 创建 CCR 客户端
  const ccr = new CCRClient(sse, new URL(sessionUrl), {
    getAuthHeaders,
    heartbeatIntervalMs: 20_000,
    onEpochMismatch: () => {
      // Epoch 冲突，关闭连接
      ccr.close()
      sse.close()
      onCloseCb?.(4090)
    }
  })
  
  // 5. 返回传输接口
  return {
    write: msg => ccr.writeEvent(msg),
    writeBatch: async msgs => {
      for (const m of msgs) {
        await ccr.writeEvent(m)
      }
    },
    connect: () => {
      void sse.connect()
      void ccr.initialize(epoch).then(() => {
        onConnectCb?.()
      })
    },
    // ... 其他方法
  }
}
```

---

## 总结

### 架构要点

1. **双向通信**: 手机端和电脑终端通过云服务器中继消息
2. **两种协议**: v1 (WebSocket) 和 v2 (SSE + CCR)
3. **权限控制**: 手机端可远程批准权限请求
4. **断线重连**: 心跳、序列号、自动重连
5. **安全认证**: OAuth + JWT + Epoch 防冲突

### 关键文件

| 文件 | 功能 |
|------|------|
| `bridge/replBridge.ts` | 主桥接逻辑 |
| `bridge/bridgeMessaging.ts` | 消息协议处理 |
| `bridge/replBridgeTransport.ts` | 传输层抽象 |
| `bridge/remoteBridgeCore.ts` | v2 核心实现 |
| `bridge/initReplBridge.ts` | 初始化入口 |
| `cli/transports/ccrClient.ts` | CCR 客户端 |
| `cli/transports/SSETransport.ts` | SSE 传输 |
| `commands/mobile/mobile.tsx` | 手机端入口 |
