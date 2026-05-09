# Tasks

- [x] Task 1: 确认视频资源配置
  - [x] SubTask 1.1: 检查 pubspec.yaml 中 assets 配置是否包含周超形象.mp4
  - [x] SubTask 1.2: 确认视频文件存在于 assets/videos/ 目录

- [x] Task 2: 创建磨砂玻璃视频播放组件
  - [x] SubTask 2.1: 创建 BlurVideoPlayer 组件，支持磨砂玻璃效果
  - [x] SubTask 2.2: 实现视频高度占界面80%的布局
  - [x] SubTask 2.3: 添加 BackdropFilter 实现模糊效果

- [x] Task 3: 修改 VideoCallScreen 界面
  - [x] SubTask 3.1: 将周超形象视频作为背景添加到 VideoCallScreen
  - [x] SubTask 3.2: 调整本地视频窗口位置和大小
  - [x] SubTask 3.3: 确保控制按钮在视频上层正确显示

- [x] Task 4: 测试验证
  - [x] SubTask 4.1: 验证视频循环播放正常
  - [x] SubTask 4.2: 验证磨砂玻璃效果显示正确
  - [x] SubTask 4.3: 验证界面布局在不同屏幕尺寸下正常

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 2
- Task 4 依赖 Task 3
