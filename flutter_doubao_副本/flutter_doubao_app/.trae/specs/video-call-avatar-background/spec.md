# 视频通话界面周超形象背景 Spec

## Why
当前视频通话界面设计较为单调，需要将周超形象视频集成到视频通话界面中，提升用户体验和品牌形象。

## What Changes
- 在 VideoCallScreen 中添加周超形象视频作为主要背景
- 视频使用磨砂玻璃效果，高度占界面的80%
- 视频循环播放，无需根据语音状态控制

## Impact
- Affected specs: 视频通话功能
- Affected code: 
  - `lib/src/screens/chat_screen.dart` (VideoCallScreen 组件)
  - `lib/src/widgets/loop_video_player.dart` (可能需要扩展)
  - `pubspec.yaml` (确认视频资源已配置)

## ADDED Requirements

### Requirement: 周超形象视频背景
系统 SHALL 在视频通话界面展示周超形象视频作为背景。

#### Scenario: 视频展示
- **WHEN** 用户进入视频通话界面
- **THEN** 界面展示周超形象视频，视频循环播放

#### Scenario: 视频尺寸
- **GIVEN** 视频原始比例为正方形
- **WHEN** 视频在界面展示
- **THEN** 视频高度占界面高度的80%，宽度按比例缩放
- **AND** 视频使用磨砂玻璃效果

### Requirement: 磨砂玻璃效果
系统 SHALL 为视频背景添加磨砂玻璃视觉效果。

#### Scenario: 视觉效果
- **WHEN** 视频展示时
- **THEN** 视频具有磨砂玻璃模糊效果，增强视觉层次感

### Requirement: 视频循环播放
系统 SHALL 确保视频持续循环播放。

#### Scenario: 循环播放
- **WHEN** 视频播放完成
- **THEN** 自动重新开始播放，无间断

## MODIFIED Requirements
无

## REMOVED Requirements
无
