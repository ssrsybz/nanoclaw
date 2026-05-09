# Tasks

- [x] Task 1: 修复摄像头初始化后画面不显示的问题
  - [x] SubTask 1.1: 检查 RTC SDK 文档，了解如何正确设置本地视频渲染
  - [x] SubTask 1.2: 修改 video_call_service.dart，确保视频采集启动后正确渲染
  - [x] SubTask 1.3: 添加 onVideoReady 回调通知 UI 更新状态

- [x] Task 2: 修复摄像头翻转功能无法切换后置摄像头的问题
  - [x] SubTask 2.1: 查找 RTC SDK 的 switchCamera 方法
  - [x] SubTask 2.2: 新增 switchCamera 方法，使用 CameraId.front/back 切换摄像头

- [x] Task 3: 修复挂断后黑屏不返回聊天界面的问题
  - [x] SubTask 3.1: 检查 endCall 方法的执行流程
  - [x] SubTask 3.2: 添加 _isEndingCall 标志防止重复调用
  - [x] SubTask 3.3: 使用 Navigator.of(context).pop() 并检查 mounted 状态

# Task Dependencies

- 无依赖，三个任务已全部完成
