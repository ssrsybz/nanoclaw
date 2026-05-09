# 语音聊天界面优化 Spec

## Why
当前语音聊天界面设计较为单调，中间仅显示一个静态图标，用户体验不够沉浸。同时 TTS 字幕显示区域存在显示不完整的问题，需要重新设计展示区域，让用户感觉像是在和真人进行聊天。

## What Changes
- 将语音通话界面中间的静态图标替换为循环播放的视频，营造真人聊天的沉浸感
- 重新设计 TTS 字幕显示区域，确保文字完整显示
- 优化整体界面布局，提升视觉体验

## Impact
- Affected specs: 语音通话功能
- Affected code: 
  - `lib/src/screens/chat_screen.dart` (VoiceCallScreen 组件)
  - `pubspec.yaml` (添加视频播放依赖)
  - 需要创建 assets 目录存放视频文件

## ADDED Requirements

### Requirement: 循环视频播放
系统 SHALL 在语音通话界面中央显示循环播放的视频，替代原有的静态图标。

#### Scenario: 视频循环播放
- **WHEN** 用户进入语音通话界面
- **THEN** 中央区域显示循环播放的视频，营造真人聊天的沉浸感

#### Scenario: 视频资源加载
- **WHEN** 视频文件存在于本地 assets 目录
- **THEN** 视频自动加载并开始循环播放

### Requirement: TTS 字幕完整显示
系统 SHALL 确保 TTS 字幕文字完整显示，不被截断。

#### Scenario: 长文本字幕显示
- **WHEN** AI 回复的文本较长
- **THEN** 字幕区域自动换行或滚动显示完整内容

#### Scenario: 用户说话文本显示
- **WHEN** 用户说话时
- **THEN** 用户说的话完整显示在界面上

### Requirement: 界面视觉优化
系统 SHALL 提供更美观的语音通话界面设计。

#### Scenario: 视频展示区域
- **WHEN** 视频播放时
- **THEN** 视频以合适的尺寸和形状展示，配合整体界面风格

## MODIFIED Requirements
无

## REMOVED Requirements
无
