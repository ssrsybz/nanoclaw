# 去除 Docker 容器依赖计划

## 目标

在单用户信任环境下运行 NanoClaw，去除容器依赖，直接在主进程中调用 Claude Agent SDK。

## 背景

当前架构：
- Agent 运行在 Docker 容器中，通过 `runContainerAgent()` 启动
- 容器提供安全隔离（Bash 命令在容器内执行）
- OneCLI Gateway 负责凭证注入
- IPC 文件系统用于主进程与容器间通信
- `container/` 目录包含 Dockerfile 和 agent-runner

新架构：
- Agent 直接在主进程中运行
- 移除 Docker 和 OneCLI 依赖
- 简化 IPC 为直接函数调用
- Agent 的 Bash 命令直接在宿主机执行（信任环境）

---

## Phase 1: 核心架构变更

### 1.1 创建新的 Agent Runner 模块

**新建文件**: `src/agent-runner.ts`

替换 `container-runner.ts`，直接调用 Claude Agent SDK：

```typescript
// 核心逻辑从 container/agent-runner/src/index.ts 迁移
// 使用 query() 函数直接在进程中运行
// 移除容器相关的挂载、IPC 文件等逻辑
```

主要改动：
- 移除 `ContainerInput` 中的容器特定字段
- 直接调用 `@anthropic-ai/claude-agent-sdk` 的 `query()` 函数
- 保留 MCP server 用于 send_message、schedule_task 等工具
- 会话管理使用本地文件系统路径

### 1.2 更新主入口文件

**修改文件**: `src/index.ts`

- 移除 `runContainerAgent` 导入，改用新的 `runAgentDirect`
- 移除 `ensureContainerRuntimeRunning()`、`cleanupOrphans()` 调用
- 移除 `writeTasksSnapshot`、`writeGroupsSnapshot`（不再需要传递给容器）
- 简化 `runAgent()` 函数

### 1.3 更新任务调度器

**修改文件**: `src/task-scheduler.ts`

- 移除 `runContainerAgent` 导入
- 使用新的直接执行方式

---

## Phase 2: 移除容器相关代码

### 2.1 删除文件

| 文件 | 原因 |
|------|------|
| `src/container-runner.ts` | 替换为 `agent-runner.ts` |
| `src/container-runtime.ts` | 不再需要 Docker |
| `src/mount-security.ts` | 不再需要挂载安全检查 |
| `src/container-runner.test.ts` | 测试文件移除 |
| `src/container-runtime.test.ts` | 测试文件移除 |
| `container/` 整个目录 | Dockerfile 和 agent-runner 不再需要 |

### 2.2 清理依赖

**修改文件**: `package.json`

移除依赖：
- `@onecli-sh/sdk` - OneCLI Gateway 不再需要

添加依赖：
- `@anthropic-ai/claude-agent-sdk` - 直接调用 SDK
- `@modelcontextprotocol/sdk` - MCP server 依赖
- `zod` - MCP 工具参数验证

### 2.3 清理配置

**修改文件**: `src/config.ts`

移除配置：
- `CONTAINER_IMAGE`
- `CONTAINER_TIMEOUT`
- `CONTAINER_MAX_OUTPUT_SIZE`
- `ONECLI_URL`
- `MAX_CONCURRENT_CONTAINERS`
- `MOUNT_ALLOWLIST_PATH`

保留配置：
- `GROUPS_DIR`, `DATA_DIR` - 组文件夹和数据目录
- `IDLE_TIMEOUT` - 可选保留或移除
- 其他消息处理相关配置

---

## Phase 3: 简化 IPC 和队列机制

### 3.1 简化 GroupQueue

**修改文件**: `src/group-queue.ts`

当前功能：
- 管理容器进程生命周期
- 通过 IPC 文件发送消息
- 管理并发容器数量

简化后：
- 移除 `ChildProcess` 相关逻辑
- 使用 Promise 管理活跃的 Agent 会话
- 保留消息队列和任务队列逻辑
- 移除 `closeStdin()` 方法（不再需要）
- 移除 `MAX_CONCURRENT_CONTAINERS` 限制（改为 `MAX_CONCURRENT_AGENTS`）

### 3.2 简化 IPC

**修改文件**: `src/ipc.ts`

当前功能：
- 监听容器写入的 IPC 文件
- 处理消息发送、任务调度等请求

简化后：
- MCP server 直接在进程内运行
- IPC 文件机制可以完全移除
- 或者保留用于外部工具集成（可选）

### 3.3 移除 OneCLI 相关代码

**修改文件**: `src/index.ts`

- 移除 `OneCLI` 导入和初始化
- 移除 `ensureOneCLIAgent()` 函数
- API key 直接从 `.env` 读取

---

## Phase 4: 更新 MCP Server

### 4.1 内嵌 MCP Server

当前：MCP server 在容器内作为独立进程运行
新架构：MCP server 在主进程内运行

**修改方式**：
- 将 `container/agent-runner/src/ipc-mcp-stdio.ts` 的逻辑移到主进程
- 或者使用进程内 MCP server，直接调用主进程函数

### 4.2 工具函数直接调用

当前流程：
1. Agent 调用 `send_message` MCP 工具
2. MCP server 写入 IPC 文件
3. 主进程监听 IPC 文件并发送消息

新流程：
1. Agent 调用 `send_message` 工具
2. 直接调用 `channel.sendMessage()`
3. 消息发送完成

---

## Phase 5: 更新测试

### 5.1 移除容器相关测试

- `src/container-runner.test.ts` - 删除
- `src/container-runtime.test.ts` - 删除

### 5.2 更新其他测试

- 更新 mock 逻辑，不再 mock 容器
- 测试直接调用 SDK 的逻辑

---

## Phase 6: 文档和脚本更新

### 6.1 更新 README.md

- 移除 Docker 安装要求
- 简化安装步骤
- 更新架构说明

### 6.2 移除容器构建脚本

- 删除 `container/build.sh`
- 更新 `package.json` 中的 scripts

### 6.3 更新 CLAUDE.md

- 移除容器相关说明
- 更新架构描述

---

## 文件变更清单

### 新建文件

| 文件 | 描述 |
|------|------|
| `src/agent-runner.ts` | 直接调用 SDK 的 Agent runner |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/index.ts` | 移除容器逻辑，使用新 runner |
| `src/task-scheduler.ts` | 使用新 runner |
| `src/group-queue.ts` | 简化进程管理 |
| `src/ipc.ts` | 简化或移除 |
| `src/config.ts` | 移除容器配置 |
| `package.json` | 更新依赖 |
| `README.md` | 更新文档 |
| `CLAUDE.md` | 更新项目说明 |

### 删除文件

| 文件/目录 | 原因 |
|-----------|------|
| `src/container-runner.ts` | 不再需要 |
| `src/container-runtime.ts` | 不再需要 |
| `src/mount-security.ts` | 不再需要 |
| `src/container-runner.test.ts` | 测试文件 |
| `src/container-runtime.test.ts` | 测试文件 |
| `container/` | 整个目录删除 |

---

## 风险和注意事项

### 安全风险

⚠️ **Agent 的 Bash 命令将直接在宿主机执行**

- 原来在容器内执行，无法影响宿主机
- 现在可以执行任何命令（包括 `rm -rf`）
- 适用于：单用户、信任 Agent 的环境
- 不适用于：多用户、生产环境

### 功能变更

| 功能 | 原架构 | 新架构 |
|------|--------|--------|
| Bash 安全隔离 | 容器内执行 | 宿主机直接执行 |
| 多组隔离 | 容器级隔离 | 文件夹级隔离 |
| 浏览器自动化 | 容器内 Chromium | 需要本地安装 |
| 并发限制 | 容器数量限制 | Agent 数量限制 |
| 凭证管理 | OneCLI Gateway | .env 文件 |

### 浏览器自动化

需要额外处理：
- 原来容器内置 Chromium 和 agent-browser
- 现在需要用户自行安装 Chromium
- 或者移除浏览器自动化功能

---

## 实施顺序

1. **Phase 1** - 创建新的 agent-runner.ts（核心）
2. **Phase 2** - 更新 index.ts 和 task-scheduler.ts
3. **Phase 3** - 清理 GroupQueue 和 IPC
4. **Phase 4** - 移除容器相关文件
5. **Phase 5** - 更新配置和依赖
6. **Phase 6** - 更新文档和测试

预计工作量：2-3 天

---

## 待确认问题

1. **是否保留浏览器自动化功能？**
   - 如果保留，需要处理 Chromium 依赖
   - 如果移除，可以进一步简化

2. **是否保留 IPC 机制？**
   - 完全移除更简洁
   - 保留可用于外部工具集成

3. **MCP server 实现方式？**
   - 进程内直接调用（最简单）
   - 独立进程 stdio 通信（更隔离）
