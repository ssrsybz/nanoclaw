# 启动台功能更新日志

## 2026-05-26 - 智能启动能力

### 核心功能

启动台现在支持智能启动，能够：
1. **自动激活虚拟环境** - Python 项目启动前自动激活 venv
2. **在新终端窗口运行** - 需要交互的项目自动在新终端打开
3. **启动后打开浏览器** - Web 项目自动打开 localhost
4. **预启动脚本** - 支持执行初始化脚本

### MCP 工具增强

#### `launchpad_register_app` - 新增智能启动参数

```typescript
{
  name: string;           // 应用名称（必填）
  path: string;           // 项目路径（必填）
  kind: 'node-project' | 'python-project' | 'script' | 'macos-app';
  launch_command: string; // 启动命令（必填）

  // 智能启动配置（可选）
  terminal_mode: 'new-window' | 'new-tab' | 'none';  // 终端模式
  pre_launch_script: string;   // 启动前脚本
  open_browser: string;        // 启动后打开的 URL
  venv_path: string;           // Python 虚拟环境路径
}
```

**完整示例 - Hermes Agent**：

```typescript
// Agent 分析完 Hermes 项目后调用
launchpad_register_app({
  name: "Hermes Agent",
  path: "/Users/frank/projects/hermes",
  kind: "python-project",
  launch_command: "python hermes",
  terminal_mode: "new-window",  // 需要交互式终端
  venv_path: "/Users/frank/projects/hermes/venv"  // 自动激活虚拟环境
})
```

**完整示例 - Next.js Web 项目**：

```typescript
launchpad_register_app({
  name: "My Blog",
  path: "/Users/frank/projects/blog",
  kind: "node-project",
  launch_command: "npm run dev",
  terminal_mode: "new-window",  // 在新终端显示日志
  open_browser: "http://localhost:3000"  // 自动打开浏览器
})
```

### 工作流程

```
用户点击启动台图标
        ↓
启动台检查配置
        ↓
┌───────────────────────────────────┐
│ 1. 激活虚拟环境（如有）            │
│ 2. 加载 .env 文件（如有）          │
│ 3. 执行预启动脚本（如有）          │
│ 4. 在新终端窗口运行启动命令        │
│ 5. 等待服务启动                   │
│ 6. 打开浏览器（如有配置）          │
└───────────────────────────────────┘
        ↓
项目成功启动！
```

### 数据库新增字段

`launchpad_apps` 表新增列：

| 字段 | 类型 | 说明 |
|------|------|------|
| `terminal_mode` | TEXT | 终端模式：new-window/new-tab/none |
| `pre_launch_script` | TEXT | 启动前执行的脚本 |
| `post_launch_actions` | TEXT | 启动后动作（JSON 数组） |
| `dependencies` | TEXT | 依赖配置（JSON 对象） |
| `auto_detect` | INTEGER | 是否自动检测启动配置 |

### 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                      OKClaw Agent                               │
│  用户: "帮我启动 Hermes Agent"                                   │
│          ↓                                                      │
│  Agent 分析项目 → 检测启动方式 → 配置启动参数                     │
│          ↓                                                      │
│  调用 launchpad_register_app (包含完整启动配置)                  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      启动台                                      │
│  存储配置 → 用户点击图标 → 执行智能启动                           │
└─────────────────────────────────────────────────────────────────┘
```

**关键点**：OKClaw Agent 负责分析和配置，启动台负责执行。这样职责分离，启动台可以独立工作。

---

## 2026-05-26 - Agent 项目注册能力

### 核心功能

Agent 完成项目开发后，可以将项目注册到启动台，用户可以一键启动。

### 新增 MCP 工具

#### `launchpad_register_app` - 注册项目到启动台

Agent 使用此工具将开发完成的项目添加到启动台：

```typescript
// 参数说明
{
  name: string;           // 应用名称（必填）
  path: string;           // 项目路径（必填）
  kind: 'node-project' | 'python-project' | 'script' | 'macos-app' | 'url-scheme';
  launch_command: string; // 启动命令，如 'npm start'、'python3 main.py'（必填）
  working_directory?: string;  // 工作目录，默认为项目路径
  description?: string;   // 应用描述
  icon?: string;          // 图标路径
  name_zh?: string;       // 中文名称
}
```

**使用示例**：

```
Agent: 我已经完成了「待办事项管理工具」的开发，现在将它注册到启动台。

[调用 launchpad_register_app]
{
  name: "Todo Manager",
  name_zh: "待办管理",
  path: "/Users/frank/projects/todo-manager",
  kind: "node-project",
  launch_command: "npm start",
  description: "命令行待办事项管理工具"
}

结果: ✅ 已将项目 "Todo Manager" 注册到启动台
- ID: agent-abc12345
- 启动命令: npm start
- 工作目录: /Users/frank/projects/todo-manager
```

#### `launchpad_update_app` - 更新应用配置

修改已注册应用的启动命令、工作目录等设置：

```typescript
{
  name?: string;          // 应用名称（模糊匹配）
  app_id?: string;        // 应用 ID
  launch_command?: string;    // 新的启动命令
  working_directory?: string; // 新的工作目录
  description?: string;   // 新的描述
  name_zh?: string;       // 中文名称
  pinned?: boolean;       // 是否收藏
  hidden?: boolean;       // 是否隐藏
}
```

### 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                     Agent 开发项目流程                            │
├─────────────────────────────────────────────────────────────────┤
│  1. 用户: 帮我开发一个天气查询工具                                   │
│                          ↓                                       │
│  2. Agent: 创建项目、编写代码、测试                                 │
│                          ↓                                       │
│  3. Agent: 调用 launchpad_register_app 注册到启动台               │
│                          ↓                                       │
│  4. 用户: 从启动台点击图标启动项目                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 启动命令自动检测

Scanner 会自动检测项目的启动方式：

| 项目类型 | 检测方式 | 默认启动命令 |
|---------|---------|-------------|
| Node.js | package.json scripts | `npm run dev` 或 `npm start` |
| Python | main.py/app.py | `python3 main.py` |
| Makefile | Makefile 存在 | `make run` |
| 脚本 | shebang 或扩展名 | 直接执行 |

---

## 2026-05-26 - 应用管理完善

### 新增功能

#### 1. 右键菜单
- 在应用图标上右键可以打开上下文菜单
- 菜单选项包括：
  - 添加/取消收藏
  - 编辑应用信息
  - 打开文件夹（仅文件夹）
  - 删除文件夹（仅文件夹）
  - 移除应用

#### 2. 收藏功能
- 可以将常用应用添加到收藏栏
- 收藏的应用显示在主界面顶部
- 收藏的应用带有📌标记
- API 端点：
  - `POST /api/launchpad/apps/:id/pin` - 收藏应用
  - `POST /api/launchpad/apps/:id/unpin` - 取消收藏
  - `GET /api/launchpad/pinned` - 获取收藏列表

#### 3. 文件夹管理
- 可以选择多个应用创建文件夹
- 点击"选择应用"按钮进入选择模式
- 至少选择 2 个应用后可以创建文件夹
- 点击文件夹可以查看内部应用
- 删除文件夹会将应用移回主界面
- API 端点：
  - `POST /api/launchpad/folders` - 创建文件夹
  - `POST /api/launchpad/folders/:id/add` - 向文件夹添加应用
  - `POST /api/launchpad/folders/:id/remove` - 从文件夹移除应用
  - `DELETE /api/launchpad/folders/:id` - 删除文件夹

#### 4. 应用编辑
- 可以编辑应用的名称、中文名称、分类
- 通过右键菜单 -> 编辑打开编辑弹窗

#### 5. 应用排序
- API 端点：`POST /api/launchpad/reorder`
- 支持批量更新应用的页面索引和网格位置

### 数据库变更
- `launchpad_apps` 表新增 `parent_id` 列，用于文件夹归属关系

### 前端改进
- 新增右键上下文菜单组件
- 新增创建文件夹弹窗
- 新增应用编辑弹窗
- 新增选择模式（用于多选创建文件夹）
- 收藏栏固定显示在主界面顶部
- 改进图标显示，支持收藏徽章

### 快捷键
- `Escape` - 关闭弹窗/退出选择模式/返回主界面/关闭启动台
- `Cmd/Ctrl + /` - 聚焦搜索框

---

## 参考实现

参考了以下 macOS 启动台项目的实现思路：

### LaunchNext
- CLI 支持：`list`, `snapshot`, `search`, `create-folder`, `move`
- 文件夹创建：通过 CLI 命令将应用组合成文件夹
- 布局管理：支持应用的拖拽排序

### BetterLaunchpad
- 收藏管理：使用 UserDefaults 存储收藏列表
- 简洁的收藏切换逻辑

---

## 后续计划

1. **拖拽排序** - 支持拖动图标重新排列位置
2. **应用商店** - 从开源社区下载安装应用
3. **更新检测** - 检测应用是否有新版本
4. **CLI 命令** - 通过命令行操作启动台
5. **图标缓存** - 提高图标加载速度
