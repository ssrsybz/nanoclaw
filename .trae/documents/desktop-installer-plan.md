# NanoClaw 桌面端安装包计划

## 项目背景

### 原始安装流程
```
启动 nanoclaw 自带的 claudecode 
    ↓
cc 安装 LLM
    ↓
启动 nano 的安装
    ↓
cc 提示配置 llm-api
    ↓
cc 提示配置 IM（WhatsApp/Telegram 等）
    ↓
cc 打包进 docker
    ↓
在 IM 上使用
```

### 目标
将 NanoClaw 转换为一个**桌面端安装包**，包含内置的 **IM 聊天窗口**，简化安装流程，让用户无需 Claude Code CLI 即可使用。

---

## 技术方案

### 1. 桌面框架选择

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Electron** | 成熟稳定、Node.js 原生支持、可直接复用后端代码 | 打包体积大（~150MB） |
| **Tauri** | 轻量（~10MB）、安全、使用系统 WebView | 需要 Rust 后端、需要重写部分逻辑 |

**推荐方案：Electron**
- 原因：项目已是 Node.js/TypeScript，可直接复用 `src/` 目录下的所有代码
- 打包工具：`electron-builder` 或 `electron-forge`

### 2. 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Electron 桌面应用                                  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    渲染进程（前端 UI）                            │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │ │
│  │  │  IM 聊天窗口  │ │  配置向导     │ │  设置面板                │ │ │
│  │  │  - 消息列表   │ │  - LLM 配置   │ │  - 群组管理              │ │ │
│  │  │  - 输入框     │ │  - 容器配置   │ │  - 任务调度              │ │ │
│  │  │  - 历史记录   │ │  - 安装进度   │ │  - 日志查看              │ │ │
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                              ↕ IPC 通信                               │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    主进程（后端服务）                             │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐ │ │
│  │  │  NanoClaw    │ │  Desktop     │ │  容器管理                │ │ │
│  │  │  核心引擎     │ │  Channel     │ │  - Docker/Apple Container│ │ │
│  │  │  (src/)      │ │  (内置 IM)   │ │  - 镜像构建              │ │ │
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. 核心组件

#### 3.1 内置 IM Channel（Desktop Channel）

创建一个新的 Channel 实现，直接在桌面应用内提供聊天功能：

```typescript
// src/channels/desktop.ts
export class DesktopChannel implements Channel {
  name = 'desktop';
  
  // 通过 Electron IPC 与渲染进程通信
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
}
```

**特点：**
- 无需外部 IM 账号
- 消息直接存储在本地 SQLite
- 支持多会话（类似多聊天窗口）
- 可选：支持连接外部 IM（保留原有功能）

#### 3.2 安装向导

替代原有 Claude Code CLI 的交互式安装：

```
步骤 1: 欢迎页面
    ↓
步骤 2: 检测系统环境（Node.js、Docker 等）
    ↓
步骤 3: 配置 LLM API（Claude 订阅或 Anthropic API Key）
    ↓
步骤 4: 构建容器镜像
    ↓
步骤 5: 创建主聊天窗口
    ↓
步骤 6: 完成，进入主界面
```

#### 3.3 前端 UI 组件

| 组件 | 功能 |
|------|------|
| **ChatWindow** | IM 聊天界面，消息列表 + 输入框 |
| **SetupWizard** | 首次安装引导 |
| **SettingsPanel** | 设置面板（LLM、群组、任务等） |
| **TrayIcon** | 系统托盘图标，快速访问 |
| **NotificationHandler** | 系统通知 |

---

## 目录结构

```
nanoclaw/
├── electron/                    # Electron 桌面应用
│   ├── main.ts                  # 主进程入口
│   ├── preload.ts               # 预加载脚本
│   ├── ipc/                     # IPC 处理器
│   │   ├── setup.ts             # 安装相关 IPC
│   │   ├── chat.ts              # 聊天相关 IPC
│   │   └── settings.ts          # 设置相关 IPC
│   └── utils/                   # 工具函数
│       ├── container.ts         # 容器管理
│       └── auto-launch.ts       # 开机自启
│
├── src/                         # 现有后端代码（保持不变）
│   ├── channels/
│   │   ├── desktop.ts           # 新增：内置桌面渠道
│   │   └── ...
│   └── ...
│
├── renderer/                    # 前端渲染进程
│   ├── index.html               # 入口 HTML
│   ├── styles/                  # 样式文件
│   ├── components/              # UI 组件
│   │   ├── ChatWindow.tsx
│   │   ├── SetupWizard.tsx
│   │   ├── SettingsPanel.tsx
│   │   └── ...
│   ├── hooks/                   # React Hooks
│   ├── stores/                  # 状态管理
│   └── App.tsx                  # 主应用组件
│
├── resources/                   # 打包资源
│   ├── icons/                   # 应用图标
│   └── installer/               # 安装程序配置
│
├── electron-builder.yml         # 打包配置
└── package.json                 # 更新依赖
```

---

## 实施步骤

### 阶段一：基础框架搭建

1. **添加 Electron 依赖**
   - 安装 `electron`、`electron-builder`
   - 创建 `electron/main.ts` 主进程
   - 创建 `electron/preload.ts` 预加载脚本

2. **创建基础 UI 框架**
   - 选择前端框架（React/Vue/Svelte）
   - 创建基础布局组件
   - 实现 IPC 通信层

3. **集成现有后端**
   - 在主进程中启动 NanoClaw 核心引擎
   - 确保容器功能正常工作

### 阶段二：内置 IM Channel

4. **实现 Desktop Channel**
   - 创建 `src/channels/desktop.ts`
   - 实现 Channel 接口
   - 通过 IPC 与渲染进程通信

5. **创建聊天 UI**
   - 消息列表组件
   - 输入框组件
   - 消息格式化（Markdown 支持）

### 阶段三：安装向导

6. **实现安装向导**
   - 环境检测页面
   - LLM 配置页面
   - 容器构建页面
   - 进度显示

7. **首次启动流程**
   - 检测是否首次运行
   - 自动启动安装向导
   - 保存配置状态

### 阶段四：设置面板

8. **实现设置功能**
   - LLM 配置管理
   - 群组管理
   - 任务调度管理
   - 日志查看

### 阶段五：打包发布

9. **配置打包**
   - macOS: DMG / PKG
   - Windows: NSIS / MSI
   - Linux: AppImage / deb / rpm

10. **测试与优化**
    - 多平台测试
    - 性能优化
    - 错误处理完善

---

## 依赖更新

```json
{
  "devDependencies": {
    "electron": "^28.0.0",
    "electron-builder": "^24.9.1",
    "@types/electron": "^1.6.10"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.7"
  }
}
```

---

## 关键技术点

### 1. 容器运行时检测与安装

```typescript
// electron/utils/container.ts
async function ensureContainerRuntime(): Promise<RuntimeType> {
  // 检测 Docker Desktop
  if (await isDockerRunning()) return 'docker';
  
  // macOS: 检测 Apple Container
  if (process.platform === 'darwin') {
    if (await isAppleContainerAvailable()) return 'apple-container';
  }
  
  // 引导安装
  await promptInstallDocker();
  return 'docker';
}
```

### 2. IPC 通信设计

```typescript
// IPC 通道定义
const IPC_CHANNELS = {
  // 聊天相关
  'chat:send': (message: string) => void,
  'chat:receive': (message: NewMessage) => void,
  'chat:history': (messages: NewMessage[]) => void,
  
  // 设置相关
  'settings:get': () => Settings,
  'settings:set': (settings: Partial<Settings>) => void,
  
  // 安装相关
  'setup:status': (status: SetupStatus) => void,
  'setup:progress': (progress: number) => void,
};
```

### 3. 桌面 Channel 实现

```typescript
// src/channels/desktop.ts
import { BrowserWindow } from 'electron';
import { Channel, ChannelOpts } from '../types.js';
import { registerChannel } from './registry.js';

export class DesktopChannel implements Channel {
  name = 'desktop';
  private window: BrowserWindow;
  
  constructor(opts: ChannelOpts) {
    // 存储回调
    this.onMessage = opts.onMessage;
    this.onChatMetadata = opts.onChatMetadata;
  }
  
  async connect(): Promise<void> {
    // 发送历史消息到渲染进程
    const history = await this.loadHistory();
    this.window.webContents.send('chat:history', history);
  }
  
  async sendMessage(jid: string, text: string): Promise<void> {
    // 发送消息到渲染进程显示
    this.window.webContents.send('chat:receive', {
      id: generateId(),
      chat_jid: jid,
      content: text,
      timestamp: new Date().toISOString(),
      is_from_me: true,
    });
  }
  
  // 从渲染进程接收用户输入
  handleUserInput(text: string): void {
    this.onMessage('desktop:main', {
      id: generateId(),
      chat_jid: 'desktop:main',
      sender: 'user',
      sender_name: 'You',
      content: text,
      timestamp: new Date().toISOString(),
      is_from_me: true,
    });
  }
}

registerChannel('desktop', (opts) => new DesktopChannel(opts));
```

---

## 用户安装流程（改进后）

```
下载安装包（DMG/EXE/AppImage）
    ↓
安装应用
    ↓
首次启动 → 自动打开安装向导
    ↓
向导检测系统环境
    ├── Docker 未安装 → 引导安装
    └── Docker 已安装 → 继续
    ↓
配置 LLM API
    ├── Claude 订阅 → 输入 OAuth Token
    └── API Key → 输入 Anthropic API Key
    ↓
自动构建容器镜像
    ↓
创建主聊天窗口
    ↓
完成 → 进入主界面，开始使用
```

---

## 可选增强功能

1. **多窗口支持**：支持多个独立聊天会话
2. **主题切换**：深色/浅色模式
3. **快捷键**：全局快捷键唤醒
4. **系统托盘**：最小化到托盘
5. **自动更新**：内置自动更新机制
6. **外部 IM 集成**：保留连接 WhatsApp/Telegram 等的能力

---

## 时间估算

| 阶段 | 工作内容 | 预计时间 |
|------|----------|----------|
| 阶段一 | 基础框架搭建 | 2-3 天 |
| 阶段二 | 内置 IM Channel | 2-3 天 |
| 阶段三 | 安装向导 | 2-3 天 |
| 阶段四 | 设置面板 | 2-3 天 |
| 阶段五 | 打包发布 | 1-2 天 |
| **总计** | | **9-14 天** |

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Docker 安装复杂 | 提供详细的安装指南和自动检测 |
| 打包体积过大 | 使用 electron-builder 压缩，移除不必要的依赖 |
| 跨平台兼容性 | 在 Windows/macOS/Linux 上充分测试 |
| 容器权限问题 | 提供清晰的权限配置指南 |

---

## 下一步行动

1. 确认技术方案（Electron vs Tauri）
2. 确认前端框架（React/Vue/Svelte）
3. 开始阶段一：基础框架搭建
