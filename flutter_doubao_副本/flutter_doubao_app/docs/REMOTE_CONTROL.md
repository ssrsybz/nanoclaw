# OKClaw Remote - 远程控制 App

这是 OKClaw 远程控制功能的 Flutter 客户端，用于在手机上远程控制电脑上的 Claude Code。

## 功能

- 📱 扫描二维码连接电脑
- 💬 查看对话消息
- ✉️ 发送消息给 AI
- 🔐 远程批准/拒绝权限请求
- 🔄 实时状态同步

## 构建方法

### 前置条件

- Flutter SDK (>=3.5.0)
- Android Studio / Xcode (用于 iOS)

### 安装依赖

```bash
cd flutter_doubao_app
flutter pub get
```

### 构建 Android APK

```bash
flutter build apk --release
```

输出文件: `build/app/outputs/flutter-apk/app-release.apk`

### 构建 iOS

```bash
flutter build ios --release
```

或在 Xcode 中打开 `ios/Runner.xcworkspace` 进行构建。

## 使用方法

1. **启动 OKClaw 服务**
   ```bash
   cd /path/to/okclaw/remote-control
   ./scripts/start-dev.sh
   ```

2. **打开 OKClaw Web 页面**
   - 访问 http://localhost:3100
   - 点击右下角 📱 按钮
   - 查看二维码

3. **在手机上使用 App**
   - 打开 OKClaw Remote App
   - 点击 AppBar 上的 📱 远程控制按钮
   - 扫描网页上的二维码
   - 连接成功后即可开始远程控制

## 项目结构

```
lib/src/
├── models/remote_control/       # 数据模型
│   ├── connection_config.dart   # 连接配置
│   ├── session_state.dart       # 会话状态、权限请求
│   └── message.dart             # 消息类型
│
├── services/remote_control/     # 服务层
│   ├── remote_control_service.dart  # 主要连接服务
│   └── qr_scanner_service.dart      # 二维码解析
│
├── providers/remote_control/    # 状态管理
│   └── remote_control_provider.dart
│
├── screens/remote_control/      # 界面
│   ├── qr_scanner_screen.dart   # 扫描页面
│   └── remote_control_screen.dart # 会话页面
│
└── widgets/remote_control/      # 组件
    ├── message_bubble.dart      # 消息气泡
    └── permission_dialog.dart   # 权限对话框
```

## 通信协议

App 与服务器通过 WebSocket 通信，消息格式参考 `claude-code-远程控制架构详解.md`。

### 主要消息类型

- `user` - 用户消息
- `assistant` - AI 回复
- `stream_event` - 流式输出
- `control_request` - 控制请求（权限请求等）
- `control_response` - 控制响应
