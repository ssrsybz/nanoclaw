# 视频录制功能规范

## Why

用户需要一个视频录制功能，可以录制自己的前置摄像头视频和声音，同时与AI进行实时对话。AI充当听众角色，引导用户进行内容输出。录制完成后自动保存到相册，并在列表页展示录制记录和AI生成的总结。

## What Changes

- 新增视频录制入口（在首页添加功能按钮）
- 创建视频录制服务，复用RTC房间功能
- 实现前置摄像头视频流录制
- 实现用户声音录制（不录制RTC中AI的音视频）
- 实现录制UI界面，包含录制控制按钮
- 实现录制完成后自动保存到相册
- 实现录制列表页面，展示历史录制记录
- 实现AI总结功能，生成视频内容摘要
- 实现被打断机制（来电、退出等异常情况处理）
- 实现自动保存机制（防止数据丢失）

## Impact

- Affected specs: 视频通话服务、RTC配置、UI界面
- Affected code:
  - `lib/src/screens/chat_screen.dart` (添加入口按钮)
  - `lib/src/services/video_recording_service.dart` (新建)
  - `lib/src/screens/video_recording_screen.dart` (新建)
  - `lib/src/screens/recording_list_screen.dart` (新建)
  - `lib/src/models/recording_record.dart` (新建)
  - `lib/src/providers/recording_provider.dart` (新建)
  - `pubspec.yaml` (添加依赖)

## ADDED Requirements

### Requirement: 视频录制入口

系统应当在首页提供视频录制功能的入口按钮。

#### Scenario: 用户点击录制入口
- **WHEN** 用户在首页点击视频录制按钮
- **THEN** 系统应当进入视频录制页面，并初始化RTC连接

### Requirement: 视频录制服务

系统应当提供视频录制服务，复用现有的RTC房间功能。

#### Scenario: 初始化录制服务
- **WHEN** 用户进入视频录制页面
- **THEN** 系统应当：
  1. 请求摄像头和麦克风权限
  2. 连接到RTC房间
  3. 启动AI Agent作为听众
  4. 准备好视频录制

#### Scenario: 开始录制
- **WHEN** 用户点击开始录制按钮
- **THEN** 系统应当：
  1. 开始录制前置摄像头视频流
  2. 开始录制用户声音
  3. 不录制RTC中AI的音视频
  4. 保持与AI的实时对话

### Requirement: AI听众功能

系统应当让AI在录制过程中充当听众角色。

#### Scenario: AI引导用户
- **WHEN** 用户在录制过程中说话
- **THEN** AI应当能够：
  1. 听到用户的声音
  2. 理解用户的内容
  3. 提供引导性的反馈
  4. 帮助用户进行内容输出

### Requirement: 录制UI界面

系统应当提供录制控制界面。

#### Scenario: 录制控制
- **WHEN** 用户在录制页面
- **THEN** 应当显示：
  1. 前置摄像头预览（主画面）
  2. 录制时长计时器
  3. 开始/停止录制按钮
  4. 结束通话按钮
  5. AI状态指示器

### Requirement: 保存到相册

系统应当在录制完成后自动保存视频到相册。

#### Scenario: 录制完成保存
- **WHEN** 用户停止录制或通话结束
- **THEN** 系统应当：
  1. 将录制的视频保存到相册
  2. 显示保存成功提示
  3. 生成录制记录

### Requirement: 录制列表页面

系统应当提供录制历史列表页面。

#### Scenario: 查看录制列表
- **WHEN** 用户进入录制列表页面
- **THEN** 应当显示：
  1. 所有历史录制记录
  2. 每条记录的缩略图
  3. 录制时长
  4. AI生成的总结内容
  5. 录制时间

### Requirement: AI总结功能

系统应当为每条录制生成内容总结。

#### Scenario: 生成总结
- **WHEN** 录制完成并保存后
- **THEN** 系统应当：
  1. 分析录制内容
  2. 生成简洁的总结
  3. 将总结与录制记录关联

### Requirement: 被打断机制

系统应当处理录制过程中的异常中断。

#### Scenario: 来电打断
- **WHEN** 录制过程中有来电
- **THEN** 系统应当：
  1. 自动暂停录制
  2. 保存已录制的内容
  3. 显示恢复选项

#### Scenario: 应用退出
- **WHEN** 用户在录制过程中退出应用
- **THEN** 系统应当：
  1. 自动保存已录制的内容
  2. 下次启动时提示恢复

### Requirement: 自动保存机制

系统应当定期自动保存录制内容，防止数据丢失。

#### Scenario: 定期保存
- **WHEN** 录制进行中
- **THEN** 系统应当每隔一定时间自动保存临时文件

## MODIFIED Requirements

### Requirement: 首页UI调整

首页需要添加视频录制功能入口。

**原有实现**：首页只有语音通话和视频通话两个入口

**新实现**：
- 添加视频录制入口按钮
- 调整入口按钮布局

## Technical Notes

### 视频录制技术方案

1. **视频采集**：使用RTC SDK的本地视频流，通过`RTCVideoSink`获取原始视频帧
2. **音频采集**：使用RTC SDK的本地音频流，或单独使用录音器采集
3. **视频编码**：使用Flutter的`video_compress`或原生编码器
4. **文件保存**：使用`image_gallery_saver`保存到相册
5. **临时存储**：使用`path_provider`获取临时目录

### AI总结技术方案

1. 使用现有的LLM API（火山引擎）生成总结
2. 将录制过程中的对话文本发送给LLM
3. LLM生成简洁的内容摘要

### 依赖包

```yaml
dependencies:
  image_gallery_saver: ^2.0.3
  video_compress: ^3.1.2
  camera: ^0.11.0
```
