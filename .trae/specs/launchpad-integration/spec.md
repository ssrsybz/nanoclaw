# OKClaw 启动台集成规格

## Why

用户需要一个启动台来管理 OKClaw 中开发的应用。macOS 系统更新后原生启动台被移除，需要参考开源 Swift 启动台项目的设计模式，用 Node.js 实现一个与 OKClaw 深度集成的启动台，复用 OKClaw 现有的 MCP 服务、IPC 服务、频道注册机制和前端架构，避免重复造轮子。

## What Changes

- 分析 Swift 启动台项目的核心 UI 代码和应用扫描功能
- 设计 Node.js 启动台模块，与 OKClaw 应用开发功能打通
- 利用 OKClaw 现有的 MCP 服务、IPC 服务、可插拔频道机制
- 复用 OKClaw Web 前端架构，扩展启动台 UI 组件
- 实现应用扫描、分类、搜索、启动等核心功能

## Impact

- Affected specs: OKClaw 核心架构、Web 频道、MCP 服务
- Affected code: 
  - `okclaw/src/channels/` - 新增启动台频道
  - `okclaw/src/mcp-server.ts` - 扩展 MCP 工具
  - `okclaw/web/src/components/` - 新增启动台 UI 组件
  - `启动台/` - 参考的 Swift 项目

## ADDED Requirements

### Requirement: Swift 项目分析

系统 SHALL 分析以下 Swift 启动台项目的核心实现：

1. **LaunchNext** - 功能最完善，需分析：
   - `AppStore.swift` - 状态管理模式
   - `AppInfo.swift` - 应用数据模型
   - `AppScanner` / `AppCacheManager` - 应用扫描与缓存
   - `LaunchpadView.swift` - 主界面布局
   - `CAGridView.swift` - 高性能网格渲染
   - `NativeLaunchpadImporter.swift` - 系统数据导入
   - `Gesture/` - 手势支持
   - `Search/` - 搜索引擎

2. **Launchy** - 全屏+浮动模式，需分析：
   - `AppDiscoveryService.swift` - 应用发现服务
   - `ApplicationDirectoryMonitor.swift` - 目录监控
   - `LaunchyGridConfiguration.swift` - 网格配置
   - `HotCornerMonitor.swift` - 热角触发

3. **QuickLaunch** - 轻量级实现，需分析：
   - `Services/AppScanner.swift` - 应用扫描
   - `Services/UsageTracker.swift` - 使用统计
   - `AppState.swift` - 状态管理
   - `Views/` - UI 组件

#### Scenario: 分析完成
- **WHEN** 完成所有 Swift 项目分析
- **THEN** 生成设计模式文档，包含：
  - 应用扫描模式总结
  - 状态管理模式总结
  - UI 组件模式总结
  - 性能优化技巧总结

### Requirement: OKClaw 架构复用

系统 SHALL 复用 OKClaw 现有架构：

1. **IPC 服务复用** (`src/ipc.ts`)
   - 使用文件系统 IPC 机制进行进程间通信
   - 支持消息发送、任务调度
   - 利用现有的 `startIpcWatcher` 和 `processTaskIpc`

2. **MCP 服务复用** (`src/mcp-server.ts`)
   - 扩展现有 MCP 工具集
   - 新增启动台相关工具：
     - `launchpad_scan_apps` - 扫描应用
     - `launchpad_launch_app` - 启动应用
     - `launchpad_list_apps` - 列出应用
     - `launchpad_organize` - 整理应用

3. **频道注册机制复用** (`src/channels/registry.ts`)
   - 使用 `registerChannel` 注册启动台频道
   - 实现 `Channel` 接口
   - 支持与 Web 频道类似的 HTTP + WebSocket 通信

4. **Web 前端复用** (`web/src/`)
   - 复用 React + TypeScript 架构
   - 复用 WebSocket 连接机制
   - 复用样式系统

#### Scenario: 架构复用完成
- **WHEN** 完成架构复用设计
- **THEN** 确认：
  - IPC 服务可用于启动台通信
  - MCP 工具可被 Agent 调用
  - 频道可独立注册和运行
  - 前端组件可复用现有基础设施

### Requirement: 启动台频道实现

系统 SHALL 实现启动台频道 (`src/channels/launchpad.ts`)：

1. **应用扫描服务**
   - 支持配置扫描目录（用户应用目录、系统应用目录）
   - 递归扫描应用文件（.app、.okclaw 等）
   - 解析应用元数据（名称、图标、分类）
   - 支持增量扫描和实时监控

2. **应用数据模型**
   ```typescript
   interface LaunchItem {
     id: string;
     name: string;
     kind: 'app' | 'folder';
     path?: string;
     bundleId?: string;
     category?: string;
     icon?: string;
     children?: LaunchItem[];
     usageCount: number;
     hidden: boolean;
   }
   ```

3. **状态管理**
   - 应用列表状态
   - 搜索状态
   - 布局状态
   - 使用统计

4. **API 端点**
   - `GET /api/launchpad/apps` - 获取应用列表
   - `POST /api/launchpad/launch` - 启动应用
   - `PUT /api/launchpad/layout` - 保存布局
   - `GET /api/launchpad/search` - 搜索应用

#### Scenario: 应用扫描成功
- **WHEN** 用户请求扫描应用
- **THEN** 返回应用列表，包含名称、图标、路径等信息

#### Scenario: 应用启动成功
- **WHEN** 用户点击应用图标
- **THEN** 使用系统命令启动应用，记录使用次数

### Requirement: 启动台前端组件

系统 SHALL 实现启动台前端组件：

1. **GridView 组件** - 应用网格布局
   - 支持自定义行列数
   - 支持图标大小调整
   - 支持拖拽排序
   - 支持文件夹展开

2. **AppIcon 组件** - 应用图标
   - 显示应用图标和名称
   - 支持点击启动
   - 支持右键菜单
   - 支持抖动模式

3. **SearchBar 组件** - 搜索栏
   - 实时搜索过滤
   - 支持拼音搜索
   - 支持模糊匹配

4. **FolderView 组件** - 文件夹视图
   - 展开动画
   - 支持重命名
   - 支持解散

#### Scenario: UI 渲染正确
- **WHEN** 启动台打开
- **THEN** 显示应用网格，支持搜索和点击启动

### Requirement: 与 OKClaw 应用开发打通

系统 SHALL 与 OKClaw 应用开发功能集成：

1. **应用目录识别**
   - 识别 OKClaw 用户应用目录（如 `~/.okclaw/apps/`）
   - 支持自定义应用目录
   - 支持工作空间应用目录

2. **应用格式支持**
   - 支持 macOS .app 格式
   - 支持 OKClaw 自定义应用格式
   - 支持脚本应用
   - 支持 MCP 服务应用

3. **应用生命周期**
   - 应用安装检测
   - 应用更新检测
   - 应用卸载检测

#### Scenario: OKClaw 应用识别
- **WHEN** 用户在 OKClaw 中开发应用
- **THEN** 启动台自动检测并显示新应用

## MODIFIED Requirements

### Requirement: MCP 工具扩展

在现有 MCP 服务基础上，新增启动台相关工具：

```typescript
// 新增 MCP 工具
{
  name: 'launchpad_scan_apps',
  description: '扫描并返回应用列表',
  inputSchema: z.object({
    directories: z.array(z.string()).optional()
  })
},
{
  name: 'launchpad_launch_app',
  description: '启动指定应用',
  inputSchema: z.object({
    appId: z.string()
  })
},
{
  name: 'launchpad_organize',
  description: '自动整理应用到文件夹',
  inputSchema: z.object({
    byCategory: z.boolean().optional()
  })
}
```

### Requirement: IPC 消息类型扩展

在现有 IPC 消息类型基础上，新增：

```typescript
// 新增 IPC 消息类型
type: 'launchpad_refresh'    // 刷新应用列表
type: 'launchpad_app_launched' // 应用启动通知
type: 'launchpad_app_installed' // 应用安装通知
```

## REMOVED Requirements

无移除需求。所有功能为新增，不影响现有 OKClaw 功能。
