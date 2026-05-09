# 修复语音通话视频和挂断问题 Spec

## Why
语音通话界面中视频无法正确显示，且点击挂断按钮后出现黑屏而不是返回首页。需要修复视频播放组件的问题和挂断逻辑的问题。

## What Changes
- 修复 LoopVideoPlayer 组件中视频控制器初始化和显示问题
- 修复挂断后黑屏问题，确保正确返回聊天界面

## Impact
- Affected specs: 语音通话功能
- Affected code: 
  - `lib/src/widgets/loop_video_player.dart`
  - `lib/src/screens/chat_screen.dart` (VoiceCallScreen)

## ADDED Requirements

### Requirement: 视频正确显示
系统 SHALL 在语音通话界面正确显示循环播放的视频。

#### Scenario: 视频加载成功
- **WHEN** 视频文件存在于 assets 中
- **THEN** 视频正确初始化并显示在圆形容器中

#### Scenario: 视频加载失败
- **WHEN** 视频加载失败
- **THEN** 显示备用图标而不是空白

### Requirement: 挂断正确返回
系统 SHALL 在挂断后正确返回聊天界面，不出现黑屏。

#### Scenario: 用户点击挂断
- **WHEN** 用户点击红色挂断按钮
- **THEN** 正确结束通话并返回聊天界面

#### Scenario: 通话状态变为结束
- **WHEN** 通话状态变为 ended
- **THEN** 不重复执行 Navigator.pop

## MODIFIED Requirements
无

## REMOVED Requirements
无
