# 视频通话 Bug 修复规范

## Why

视频通话功能存在三个 bug：
1. 进入房间后摄像头画面不显示，需要翻转两次才能看到
2. 点击反转摄像头无法切换到后置摄像头
3. 点击挂断按钮后黑屏，应该回到聊天界面

## What Changes

- 修复摄像头初始化后画面不显示的问题
- 修复摄像头翻转功能无法切换后置摄像头的问题
- 修复挂断后黑屏不返回聊天界面的问题

## Impact

- Affected code:
  - `flutter_doubao_app/lib/src/services/video_call_service.dart`
  - `flutter_doubao_app/lib/src/screens/chat_screen.dart`

## ADDED Requirements

### Requirement: 摄像头初始化显示

系统应在进入视频通话房间后立即显示本地摄像头画面。

#### Scenario: 进入房间显示摄像头
- **WHEN** 用户进入视频通话房间并授权摄像头权限
- **THEN** 本地摄像头画面应立即显示在屏幕右上角的小窗口中

### Requirement: 摄像头翻转功能

系统应支持前后摄像头切换。

#### Scenario: 切换前后摄像头
- **WHEN** 用户点击翻转摄像头按钮
- **THEN** 应在前后摄像头之间切换

### Requirement: 挂断返回聊天界面

系统应在挂断视频通话后返回聊天界面。

#### Scenario: 挂断返回
- **WHEN** 用户点击红色挂断按钮
- **THEN** 应结束通话并返回聊天界面，而不是黑屏

## Bug 分析

### Bug 1: 摄像头画面不显示

可能原因：
- `RTCSurfaceView` 需要在 `startVideoCapture` 之后设置渲染
- 可能需要调用 `setLocalVideoCanvas` 或类似方法

### Bug 2: 无法切换后置摄像头

可能原因：
- `toggleCamera` 方法只是停止/启动视频采集，没有调用 `switchCamera`
- 需要使用 RTC SDK 提供的 `switchCamera` 方法

### Bug 3: 挂断后黑屏

可能原因：
- `endCall` 方法可能没有正确清理资源
- `Navigator.pop(context)` 可能没有正确执行
- 可能是 `dispose` 方法中的异步操作导致的问题
