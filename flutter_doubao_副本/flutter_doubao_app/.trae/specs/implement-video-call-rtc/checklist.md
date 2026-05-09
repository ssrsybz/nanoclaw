# 视频通话功能实现检查清单

## SDK 集成检查
- [x] 火山引擎 Flutter RTC SDK 已正确添加到 pubspec.yaml
- [x] flutter pub get 成功执行，依赖安装完成
- [x] Android 权限配置正确（摄像头、麦克风、网络）
- [x] iOS 权限配置正确（NSCameraUsageDescription, NSMicrophoneUsageDescription）

## 配置检查
- [x] api_config.dart 包含视频通话所需的 AppId
- [x] api_config.dart 包含视频通话所需的 RoomId
- [x] api_config.dart 包含视频通话所需的 UserId
- [x] api_config.dart 包含视频通话所需的 Token
- [x] AI Agent 配置正确（TaskId, TargetUserId, WelcomeMessage）

## VideoCallService 检查
- [x] RTC 引擎正确创建和初始化
- [x] 能够成功加入 RTC 房间
- [x] 本地视频采集正常工作
- [x] 本地音频采集正常工作
- [x] 能够订阅远程用户的音视频流
- [x] 摄像头开关功能正常
- [x] 麦克风开关功能正常
- [x] 扬声器切换功能正常
- [x] 离开房间时资源正确释放

## 服务端 API 检查
- [x] video_call_api.dart 文件已创建
- [x] StartVoiceChat API 调用正常
- [x] StopVoiceChat API 调用正常
- [x] API 错误处理完善

## UI 集成检查
- [x] VideoCallScreen 使用新的 VideoCallService
- [x] 本地视频预览正确显示在小窗口
- [x] AI Agent 视频正确显示在主窗口
- [x] UI 布局与原有设计保持一致
- [x] 通话状态正确显示
- [x] 通话时长正确计时
- [x] 挂断功能正常工作

## 功能测试检查
- [x] 视频通话能够成功建立连接
- [x] AI Agent 能够正常加入房间
- [x] 音视频双向通信正常
- [x] 设备控制按钮响应正确
- [x] 通话结束流程完整
- [x] 无内存泄漏
