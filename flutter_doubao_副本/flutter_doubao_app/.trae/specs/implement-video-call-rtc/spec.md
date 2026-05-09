# 视频通话功能实现规范

## Why

当前项目中的视频通话功能 (`VideoCallService`) 只是一个模拟实现，没有真正连接到火山引擎 RTC 服务。需要参考官方 demo `rtc-aigc-demo` 实现真正的视频通话功能，让用户能够与 AI 进行视频交互。

## What Changes

- 集成火山引擎 Flutter RTC SDK
- 重写 `VideoCallService` 实现真正的 RTC 连接
- 添加服务端代理支持（用于启动/停止 AI Agent）
- 实现视频流的采集和渲染
- 保持原有 UI 界面不变

## Impact

- Affected specs: 视频通话服务、RTC 配置、服务端 API
- Affected code: 
  - `lib/src/services/video_call_service.dart`
  - `lib/src/services/api_config.dart`
  - `lib/src/screens/chat_screen.dart` (VideoCallScreen)
  - `pubspec.yaml`

## ADDED Requirements

### Requirement: RTC SDK 集成

系统应当集成火山引擎 Flutter RTC SDK，支持实时音视频通信。

#### Scenario: SDK 初始化
- **WHEN** 应用启动或进入视频通话页面
- **THEN** SDK 应当正确初始化并获取设备权限

### Requirement: 视频通话连接

系统应当能够连接到火山引擎 RTC 房间并与 AI Agent 进行视频通话。

#### Scenario: 成功连接
- **WHEN** 用户点击视频通话按钮
- **THEN** 系统应当：
  1. 加入 RTC 房间
  2. 启动本地视频采集
  3. 启动本地音频采集
  4. 调用服务端 API 启动 AI Agent
  5. 订阅 AI Agent 的音视频流

#### Scenario: 连接失败
- **WHEN** 连接过程中发生错误
- **THEN** 系统应当显示错误信息并允许用户重试

### Requirement: 视频渲染

系统应当正确渲染本地和远程视频流。

#### Scenario: 本地视频预览
- **WHEN** 用户进入视频通话页面
- **THEN** 应当在右上角小窗口显示本地摄像头画面

#### Scenario: AI 视频显示
- **WHEN** AI Agent 加入房间并发布视频流
- **THEN** 应当在主窗口显示 AI 的视频画面

### Requirement: 设备控制

系统应当支持控制摄像头、麦克风和扬声器。

#### Scenario: 切换摄像头开关
- **WHEN** 用户点击摄像头按钮
- **THEN** 应当开启/关闭本地视频采集

#### Scenario: 切换麦克风开关
- **WHEN** 用户点击麦克风按钮
- **THEN** 应当开启/关闭本地音频采集

#### Scenario: 切换扬声器
- **WHEN** 用户点击扬声器按钮
- **THEN** 应当切换音频播放设备（扬声器/听筒）

### Requirement: 服务端 API 支持

系统需要服务端代理来调用火山引擎 OpenAPI 启动/停止 AI Agent。

#### Scenario: 启动 AI Agent
- **WHEN** 用户加入 RTC 房间成功
- **THEN** 应当调用服务端 API 启动 AI Agent

#### Scenario: 停止 AI Agent
- **WHEN** 用户结束通话
- **THEN** 应当调用服务端 API 停止 AI Agent

### Requirement: 配置管理

系统应当支持从配置文件读取 RTC 相关配置。

#### Scenario: 读取配置
- **WHEN** 应用初始化视频通话
- **THEN** 应当使用配置文件中的 AppId、RoomId、UserId、Token 等参数

## MODIFIED Requirements

### Requirement: VideoCallService 重构

原有的模拟实现需要替换为真正的 RTC 实现。

**原有实现**：使用 Timer 模拟通话状态，无实际音视频功能

**新实现**：
- 使用火山引擎 RTC SDK 进行实时音视频通信
- 支持视频采集和渲染
- 支持与 AI Agent 交互
- 保持相同的 API 接口（`initializeCall`, `endCall`, `toggleCamera`, `toggleMicrophone`, `toggleSpeaker`）

## Configuration

根据 `docs/ai视频通话调试.md` 中的配置：

```json
{
  "AppId": "6993cc3b72a09501747d2a16",
  "RoomId": "ChatRoom01",
  "UserId": "Huoshan01",
  "Token": "0016993cc3b72a09501747d2a16SQCyXXIESjKZacpsomkKAENoYXRSb29tMDEJAEh1b3NoYW4wMQYAAADKbKJpAQDKbKJpAgDKbKJpAwDKbKJpBADKbKJpBQDKbKJpIACYplXu4pJYSEqVUhA/M1VdUPnLpZcOm5vRk7tJkW/xHg=="
}
```

AI Agent 配置：
```json
{
  "AppId": "6993cc3b72a09501747d2a16",
  "RoomId": "ChatRoom01",
  "TaskId": "ChatTask01",
  "AgentConfig": {
    "TargetUserId": ["Huoshan01"],
    "WelcomeMessage": "你好，我是周超，有什么需要帮忙的吗？",
    "UserId": "ChatBot01",
    "EnableConversationStateCallback": true
  }
}
```
