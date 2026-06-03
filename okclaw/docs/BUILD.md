# OKClaw 桌面应用打包指南

本指南说明如何在各平台打包 OKClaw 桌面应用。

## 前置要求

- Node.js 20+
- npm

## 快速开始

### Linux

```bash
# 1. 克隆或复制项目到 Linux 机器
# 2. 运行打包脚本
./scripts/build-linux.sh
```

生成的安装包位于 `release/` 目录：
- `OKClaw-2.0.0.AppImage` - 通用格式，可直接运行
- `okclaw_2.0.0_amd64.deb` - Debian/Ubuntu 安装包
- `okclaw-2.0.0.tar.gz` - 压缩包

### macOS

```bash
# 运行打包脚本
./scripts/build-mac.sh
```

生成的安装包：
- `OKClaw-2.0.0.dmg` - macOS 磁盘镜像
- `OKClaw-2.0.0-arm64.dmg` - Apple Silicon 版本
- `OKClaw-2.0.0-x64.dmg` - Intel 版本

### Windows (PowerShell)

```powershell
# 运行打包脚本
.\scripts\build-win.ps1
```

生成的安装包：
- `OKClaw Setup 2.0.0.exe` - NSIS 安装程序
- `OKClaw 2.0.0.exe` - 便携版

## 代码签名（可选但推荐）

### macOS 代码签名

需要 Apple Developer 账号。

```bash
# 设置环境变量
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
export APPLE_ID=your_apple_id@email.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx

# 运行打包
./scripts/build-mac.sh
```

### Windows 代码签名

需要代码签名证书 (.pfx)。

```powershell
# 设置环境变量
$env:WIN_CSC_LINK = "C:\path\to\certificate.pfx"
$env:WIN_CSC_KEY_PASSWORD = "your_password"

# 运行打包
.\scripts\build-win.ps1
```

### Linux

Linux 分发不需要代码签名。

## 手动构建

如果需要手动构建：

```bash
# 安装依赖
npm install

# 构建项目
npm run build

# 打包指定平台
npx electron-builder --linux   # Linux
npx electron-builder --mac     # macOS
npx electron-builder --win     # Windows

# 打包所有平台（需要在对应平台运行）
npx electron-builder -mwl
```

## 输出目录

所有安装包生成在 `release/` 目录。

## 常见问题

### Linux 打包失败：缺少 rpm 工具

```bash
# Debian/Ubuntu
sudo apt-get install rpm fakeroot

# RHEL/CentOS/Fedora
sudo dnf install rpm-build fakeroot
```

### macOS 打包失败：权限问题

确保有写入权限，或在系统偏好设置中允许终端完全磁盘访问权限。

### Windows 打包失败：缺少 Windows SDK

安装 Visual Studio Build Tools，选择 "Windows SDK" 组件。

## 文件结构

```
okclaw/
├── electron/
│   └── main.js          # Electron 主进程
├── scripts/
│   ├── build-linux.sh   # Linux 打包脚本
│   ├── build-mac.sh     # macOS 打包脚本
│   └── build-win.ps1    # Windows 打包脚本
├── build/
│   └── icon.png         # 应用图标
├── dist/                 # 后端编译输出
├── web/dist/             # 前端编译输出
└── release/              # 打包输出目录（自动创建）
```
