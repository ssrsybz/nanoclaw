# Tasks

## Phase 1: Swift 项目分析

- [ ] Task 1: 分析 LaunchNext 项目核心实现
  - [ ] SubTask 1.1: 分析 AppStore.swift 状态管理模式
  - [ ] SubTask 1.2: 分析 AppInfo.swift 应用数据模型
  - [ ] SubTask 1.3: 分析 AppScanner 应用扫描逻辑
  - [ ] SubTask 1.4: 分析 CAGridView 高性能网格渲染
  - [ ] SubTask 1.5: 分析 Search/ 搜索引擎实现
  - [ ] SubTask 1.6: 分析 Gesture/ 手势支持实现

- [ ] Task 2: 分析 Launchy 项目核心实现
  - [ ] SubTask 2.1: 分析 AppDiscoveryService 应用发现服务
  - [ ] SubTask 2.2: 分析 ApplicationDirectoryMonitor 目录监控
  - [ ] SubTask 2.3: 分析 LaunchyGridConfiguration 网格配置
  - [ ] SubTask 2.4: 分析 HotCornerMonitor 热角触发

- [ ] Task 3: 分析 QuickLaunch 项目核心实现
  - [ ] SubTask 3.1: 分析 Services/AppScanner 应用扫描
  - [ ] SubTask 3.2: 分析 Services/UsageTracker 使用统计
  - [ ] SubTask 3.3: 分析 AppState 状态管理
  - [ ] SubTask 3.4: 分析 Views/ UI 组件结构

- [ ] Task 4: 总结 Swift 项目设计模式
  - [ ] SubTask 4.1: 编写应用扫描模式总结文档
  - [ ] SubTask 4.2: 编写状态管理模式总结文档
  - [ ] SubTask 4.3: 编写 UI 组件模式总结文档
  - [ ] SubTask 4.4: 编写性能优化技巧总结文档

## Phase 2: OKClaw 架构分析

- [ ] Task 5: 分析 OKClaw IPC 服务
  - [ ] SubTask 5.1: 理解 IPC 文件系统通信机制
  - [ ] SubTask 5.2: 分析 IPC 消息类型和处理流程
  - [ ] SubTask 5.3: 确定 IPC 服务复用方案

- [ ] Task 6: 分析 OKClaw MCP 服务
  - [ ] SubTask 6.1: 理解 MCP 工具定义格式
  - [ ] SubTask 6.2: 分析现有 MCP 工具实现
  - [ ] SubTask 6.3: 设计启动台 MCP 工具扩展

- [ ] Task 7: 分析 OKClaw 频道注册机制
  - [ ] SubTask 7.1: 理解 Channel 接口定义
  - [ ] SubTask 7.2: 分析 Web 频道实现
  - [ ] SubTask 7.3: 设计启动台频道接口

- [ ] Task 8: 分析 OKClaw Web 前端
  - [ ] SubTask 8.1: 分析 React 组件结构
  - [ ] SubTask 8.2: 分析 WebSocket 通信机制
  - [ ] SubTask 8.3: 分析样式系统和主题

## Phase 3: 启动台核心实现

- [ ] Task 9: 实现应用扫描服务
  - [ ] SubTask 9.1: 创建 AppScanner 类
  - [ ] SubTask 9.2: 实现目录递归扫描
  - [ ] SubTask 9.3: 实现应用元数据解析
  - [ ] SubTask 9.4: 实现增量扫描
  - [ ] SubTask 9.5: 实现目录监控

- [ ] Task 10: 实现应用数据模型
  - [ ] SubTask 10.1: 定义 LaunchItem 接口
  - [ ] SubTask 10.2: 定义 FolderInfo 接口
  - [ ] SubTask 10.3: 实现数据序列化/反序列化

- [ ] Task 11: 实现状态管理
  - [ ] SubTask 11.1: 创建 AppStore 类
  - [ ] SubTask 11.2: 实现应用列表状态
  - [ ] SubTask 11.3: 实现搜索状态
  - [ ] SubTask 11.4: 实现布局状态
  - [ ] SubTask 11.5: 实现使用统计

- [ ] Task 12: 实现启动台频道
  - [ ] SubTask 12.1: 创建 LaunchpadChannel 类
  - [ ] SubTask 12.2: 实现 Channel 接口
  - [ ] SubTask 12.3: 实现 HTTP API 端点
  - [ ] SubTask 12.4: 实现 WebSocket 通信
  - [ ] SubTask 12.5: 注册频道到 registry

## Phase 4: MCP 工具扩展

- [ ] Task 13: 扩展 MCP 服务
  - [ ] SubTask 13.1: 添加 launchpad_scan_apps 工具
  - [ ] SubTask 13.2: 添加 launchpad_launch_app 工具
  - [ ] SubTask 13.3: 添加 launchpad_list_apps 工具
  - [ ] SubTask 13.4: 添加 launchpad_organize 工具

- [ ] Task 14: 扩展 IPC 消息类型
  - [ ] SubTask 14.1: 添加 launchpad_refresh 消息处理
  - [ ] SubTask 14.2: 添加 launchpad_app_launched 消息处理
  - [ ] SubTask 14.3: 添加 launchpad_app_installed 消息处理

## Phase 5: 前端组件实现

- [ ] Task 15: 实现 GridView 组件
  - [ ] SubTask 15.1: 创建基础网格布局
  - [ ] SubTask 15.2: 实现自定义行列数
  - [ ] SubTask 15.3: 实现图标大小调整
  - [ ] SubTask 15.4: 实现拖拽排序
  - [ ] SubTask 15.5: 实现文件夹展开

- [ ] Task 16: 实现 AppIcon 组件
  - [ ] SubTask 16.1: 创建应用图标显示
  - [ ] SubTask 16.2: 实现点击启动
  - [ ] SubTask 16.3: 实现右键菜单
  - [ ] SubTask 16.4: 实现抖动模式

- [ ] Task 17: 实现 SearchBar 组件
  - [ ] SubTask 17.1: 创建搜索输入框
  - [ ] SubTask 17.2: 实现实时过滤
  - [ ] SubTask 17.3: 实现拼音搜索
  - [ ] SubTask 17.4: 实现模糊匹配

- [ ] Task 18: 实现 FolderView 组件
  - [ ] SubTask 18.1: 创建文件夹视图
  - [ ] SubTask 18.2: 实现展开动画
  - [ ] SubTask 18.3: 实现重命名
  - [ ] SubTask 18.4: 实现解散功能

## Phase 6: OKClaw 集成

- [ ] Task 19: 与 OKClaw 应用开发打通
  - [ ] SubTask 19.1: 识别 OKClaw 应用目录
  - [ ] SubTask 19.2: 支持 OKClaw 应用格式
  - [ ] SubTask 19.3: 实现应用生命周期检测

- [ ] Task 20: 测试与验证
  - [ ] SubTask 20.1: 测试应用扫描功能
  - [ ] SubTask 20.2: 测试应用启动功能
  - [ ] SubTask 20.3: 测试搜索功能
  - [ ] SubTask 20.4: 测试与 OKClaw 集成

# Task Dependencies

- [Task 4] depends on [Task 1, Task 2, Task 3]
- [Task 8] depends on [Task 5, Task 6, Task 7]
- [Task 9] depends on [Task 4]
- [Task 11] depends on [Task 10]
- [Task 12] depends on [Task 9, Task 11, Task 7]
- [Task 13] depends on [Task 6]
- [Task 14] depends on [Task 5]
- [Task 15] depends on [Task 8]
- [Task 16] depends on [Task 15]
- [Task 17] depends on [Task 15]
- [Task 18] depends on [Task 15]
- [Task 19] depends on [Task 12, Task 13]
- [Task 20] depends on [Task 19, Task 15, Task 16, Task 17, Task 18]

# Parallelizable Work

以下任务可并行执行：
- Phase 1 所有任务可并行
- Phase 2 所有任务可并行
- Task 15, 16, 17, 18 可并行
- Task 13, 14 可并行
