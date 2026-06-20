# Claude Agent SDK 官方教程（中文）

> 本目录是 **Claude Agent SDK 官方文档** 的中文整理版，全部内容来自 Anthropic 官方站点：
> <https://code.claude.com/docs/zh-CN/agent-sdk/overview>
>
> Claude Agent SDK 让你可以把 Claude Code 当作一个库来调用，构建能够自主读取文件、运行命令、搜索网络、编辑代码的生产级 AI 代理，支持 **Python** 和 **TypeScript** 两种语言。

---

## 目录索引

### 🚀 入门

- [01 · Agent SDK 概览](./01-Agent SDK 概览.md) — 使用 Claude Code 作为库构建生产级 AI 代理
- [02 · 快速入门](./02-快速入门.md) — 用 Python 或 TypeScript 快速构建可自主工作的代理

### 🧩 核心概念

- [03 · 代理循环的工作原理](./03-代理循环的工作原理.md) — 消息生命周期、工具执行、上下文窗口与架构
- [04 · 在 SDK 中使用 Claude Code 功能](./04-在SDK中使用Claude Code功能.md) — 加载项目指令、Skills、Hooks 等到 SDK 代理

### 📥 输入和输出

- [05 · 实时流式输出](./05-实时流式输出.md) — 以文本和工具调用的形式实时获取响应
- [06 · 流式输入与单次模式](./06-流式输入与单次模式.md) — 两种输入模式的区别与适用场景
- [07 · 获取结构化输出](./07-获取结构化输出.md) — 用 JSON Schema、Zod、Pydantic 返回经过校验的 JSON
- [08 · 处理审批与用户输入](./08-处理审批与用户输入.md) — 将审批请求和澄清问题呈现给用户并返回决定

### 🛠 使用工具扩展

- [09 · 为 Claude 提供自定义工具](./09-为Claude提供自定义工具.md) — 用进程内 MCP 服务器定义自定义工具
- [10 · 通过 MCP 连接外部工具](./10-通过MCP连接外部工具.md) — 配置 MCP 服务器扩展代理能力
- [11 · 使用工具搜索扩展到大量工具](./11-使用工具搜索扩展到大量工具.md) — 按需发现并加载工具，扩展到上千个工具
- [12 · SDK 中的 Agent Skills](./12-SDK中的Agent Skills.md) — 用 Skills 扩展 Claude 的专门能力
- [13 · SDK 中的插件](./13-SDK中的插件.md) — 通过插件加载 Skills、代理、Hooks 和 MCP 服务器
- [14 · SDK 中的子代理](./14-SDK中的子代理.md) — 定义并调用子代理，隔离上下文、并行执行
- [15 · SDK 中的斜杠命令](./15-SDK中的斜杠命令.md) — 通过 SDK 使用斜杠命令控制会话
- [16 · 待办列表](./16-待办列表.md) — 使用待办列表进行任务管理

### ⚙️ 自定义行为

- [17 · 修改系统提示词](./17-修改系统提示词.md) — 在预设与自定义系统提示词之间选择
- [18 · 配置权限](./18-配置权限.md) — 用权限模式、Hooks 和允许/拒绝规则控制工具使用
- [19 · 使用 Hooks 拦截和控制代理行为](./19-使用Hooks拦截和控制代理行为.md) — 在关键执行点拦截并自定义代理行为
- [20 · 使用检查点回退文件更改](./20-使用检查点回退文件更改.md) — 跟踪并恢复文件到任意历史状态

### 📊 控制和可观测性

- [21 · 跟踪成本和使用情况](./21-跟踪成本和使用情况.md) — 跟踪令牌使用、估算成本、配置提示缓存
- [22 · 使用 OpenTelemetry 实现可观测性](./22-使用OpenTelemetry实现可观测性.md) — 导出 traces、metrics、events 到可观测性后端
- [23 · 使用会话](./23-使用会话.md) — 会话如何持久化历史，continue / resume / fork 的用法
- [24 · 将会话持久化到外部存储](./24-将会话持久化到外部存储.md) — 把会话镜像到 S3、Redis 或自定义后端

### ☁️ 部署

- [25 · 托管 Agent SDK](./25-托管Agent SDK.md) — 子进程架构、会话持久化、扩缩容、多租户隔离
- [26 · 安全部署 AI 代理](./26-安全部署AI代理.md) — 隔离、凭据管理、网络控制
- [27 · 迁移到 Claude Agent SDK](./27-迁移到Claude Agent SDK.md) — 从旧的 TypeScript/Python SDK 迁移

### 📚 SDK 参考

- [28 · Agent SDK 参考 - Python](./28-Agent SDK参考 - Python.md) — Python SDK 完整 API 参考
- [29 · Agent SDK 参考 - TypeScript](./29-Agent SDK参考 - TypeScript.md) — TypeScript SDK 完整 API 参考
- [30 · TypeScript SDK V2 会话 API（已移除）](./30-TypeScript SDK V2会话API（已移除）.md) — 已移除的 V2 会话 API 参考

---

## 说明

- 每篇文章顶部都标注了 **原文链接**，方便对照官方最新版本。
- 文档按官方侧边栏的章节顺序编号（`01` ~ `30`），方便按顺序学习。
- 如官方文档有更新，可重新抓取 `.md` 源（在原 URL 后追加 `.md` 即可获取 Markdown 原文）覆盖本目录。
