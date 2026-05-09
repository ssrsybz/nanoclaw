# 视频通话 AI Agent 接入规范

## Why

视频通话功能已实现，但 AI Agent 无法加入房间。原因是 `StartVoiceChat` OpenAPI 需要火山引擎 API 访问密钥（AK/SK）进行签名认证，而 AK/SK 是敏感信息，不能暴露在客户端代码中，因此必须通过服务端代理来调用。

## What Changes

- 理解火山引擎 RTC AIGC 架构：客户端 → 服务端代理 → 火山引擎 OpenAPI
- 配置正确的火山引擎 AK/SK 到服务端代理
- 确保服务端代理正确运行
- 设置手机到电脑的端口转发（如果使用本地服务端）

## Impact

- Affected specs: 服务端配置
- Affected code: 
  - `rtc-aigc-demo-main/Server/scenes/Custom.json`
  - `flutter_doubao_app/lib/src/services/api_config.dart`

## 架构说明

### 为什么需要服务端代理？

火山引擎的 `StartVoiceChat` OpenAPI 调用流程：

```
Flutter 客户端 → 服务端代理 → 火山引擎 OpenAPI (rtc.volcengineapi.com)
```

**关键点**：
1. `StartVoiceChat` API 需要使用 AK/SK 进行签名认证
2. AK/SK 是敏感凭证，**绝对不能**暴露在客户端代码中
3. 因此必须有一个服务端代理来处理签名逻辑

### 解决方案选项

#### 方案一：本地服务端代理（推荐用于开发测试）
- 在本地 Mac 上运行 Node.js 服务端
- 配置 AK/SK 到 `Custom.json`
- 使用 `adb reverse` 进行端口转发

#### 方案二：云端部署服务端
- 将服务端部署到云服务器（如火山引擎 ECS）
- 客户端直接访问云端服务端地址

## ADDED Requirements

### Requirement: 服务端代理配置

系统需要正确配置服务端代理以调用火山引擎 OpenAPI。

#### Scenario: 配置 AK/SK
- **WHEN** 用户有火山引擎 API 访问密钥
- **THEN** 应当将 AK/SK 配置到 `Server/scenes/Custom.json` 中

#### Scenario: 启动服务端
- **WHEN** 配置完成后
- **THEN** 应当运行 `node app.js` 启动服务端代理

#### Scenario: 设置端口转发（本地服务端）
- **WHEN** 手机需要访问电脑上的服务端
- **THEN** 应当运行 `adb reverse tcp:3001 tcp:3001`

## Configuration

当前配置文件 `Custom.json` 中的 AK/SK 是占位符：
```json
{
  "AccountConfig": {
    "accessKeyId": "YOUR_AK",
    "secretKey": "YOUR_SK"
  }
}
```

需要替换为真实的火山引擎 API 访问密钥。

## 获取 AK/SK

1. 登录火山引擎控制台
2. 访问 https://console.volcengine.com/iam/keymanage/
3. 创建或查看 API 访问密钥

## 服务端代理工作流程

1. 客户端调用 `getScenes` 获取 RTC 配置（AppId, RoomId, UserId, Token）
2. 客户端加入 RTC 房间
3. 客户端调用 `StartVoiceChat` 代理接口
4. 服务端代理使用 AK/SK 签名后调用火山引擎 OpenAPI
5. 火山引擎启动 AI Agent 并加入房间
