# Tasks

- [x] Task 1: 添加火山引擎 Flutter RTC SDK 依赖
  - [x] SubTask 1.1: 在 pubspec.yaml 中添加 volc_engine_rtc 依赖
  - [x] SubTask 1.2: 运行 flutter pub get 安装依赖
  - [x] SubTask 1.3: 配置 Android 和 iOS 的必要权限

- [x] Task 2: 更新 API 配置
  - [x] SubTask 2.1: 在 api_config.dart 中添加视频通话相关的配置项（AppId, RoomId, UserId, Token）
  - [x] SubTask 2.2: 添加 AI Agent 配置（TaskId, AgentConfig）

- [x] Task 3: 重写 VideoCallService 实现 RTC 功能
  - [x] SubTask 3.1: 创建 RTC 引擎实例
  - [x] SubTask 3.2: 实现加入房间功能
  - [x] SubTask 3.3: 实现视频采集和渲染
  - [x] SubTask 3.4: 实现音频采集
  - [x] SubTask 3.5: 实现设备控制（摄像头、麦克风、扬声器）
  - [x] SubTask 3.6: 实现离开房间和资源清理

- [x] Task 4: 创建服务端代理服务
  - [x] SubTask 4.1: 创建 video_call_api.dart 用于调用服务端 API
  - [x] SubTask 4.2: 实现 StartVoiceChat API 调用
  - [x] SubTask 4.3: 实现 StopVoiceChat API 调用

- [x] Task 5: 更新 VideoCallScreen UI 集成
  - [x] SubTask 5.1: 更新 VideoCallScreen 使用新的 VideoCallService
  - [x] SubTask 5.2: 添加本地视频预览渲染
  - [x] SubTask 5.3: 添加远程视频（AI Agent）渲染
  - [x] SubTask 5.4: 保持原有 UI 布局和样式

- [x] Task 6: 测试和验证
  - [x] SubTask 6.1: 测试视频通话连接
  - [x] SubTask 6.2: 测试设备控制功能
  - [x] SubTask 6.3: 测试通话结束和资源清理

# Task Dependencies

- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1, Task 2]
- [Task 4] depends on [Task 2]
- [Task 5] depends on [Task 3, Task 4]
- [Task 6] depends on [Task 5]
