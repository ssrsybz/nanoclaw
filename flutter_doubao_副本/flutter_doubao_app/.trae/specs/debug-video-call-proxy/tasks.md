# Tasks

- [ ] Task 1: 获取火山引擎 API 访问密钥
  - [ ] SubTask 1.1: 登录火山引擎控制台
  - [ ] SubTask 1.2: 在 IAM 密钥管理中获取 AK/SK

- [ ] Task 2: 配置服务端代理
  - [ ] SubTask 2.1: 将 AK/SK 填入 Custom.json
  - [ ] SubTask 2.2: 重启服务端代理

- [ ] Task 3: 设置手机端口转发
  - [ ] SubTask 3.1: 运行 adb reverse tcp:3001 tcp:3001

- [ ] Task 4: 测试视频通话
  - [ ] SubTask 4.1: 在手机上启动视频通话
  - [ ] SubTask 4.2: 验证 AI Agent 加入房间

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]

# 重要说明

**为什么需要服务端代理？**

火山引擎的 `StartVoiceChat` API 需要使用 AK/SK 进行签名认证。由于 AK/SK 是敏感凭证，**绝对不能**暴露在客户端代码中，因此必须通过服务端代理来调用。

架构流程：
```
Flutter 客户端 → 服务端代理 (localhost:3001) → 火山引擎 OpenAPI
```

**两种部署方案**：

1. **本地服务端代理**（开发测试推荐）
   - 在 Mac 上运行 Node.js 服务端
   - 使用 `adb reverse` 让手机访问电脑的 localhost

2. **云端部署服务端**（生产环境推荐）
   - 将服务端部署到云服务器
   - 客户端直接访问云端地址
