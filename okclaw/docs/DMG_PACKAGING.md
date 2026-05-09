# macOS DMG 打包指南

## 概述

将 Node.js 服务项目打包成 macOS DMG 安装包，需要解决以下核心问题：

1. **Node.js 运行时** - 用户机器可能没有安装 Node.js
2. **原生模块编译** - `better-sqlite3` 需要针对目标架构重新编译
3. **代码签名** - 未签名的应用会被 Gatekeeper 阻止
4. **公证** - macOS 10.15+ 要求应用经过公证
5. **跨架构支持** - Intel (x64) 和 Apple Silicon (arm64)

## 打包方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| DMG + .app | 用户体验好，支持拖拽安装 | 复杂，需要处理签名公证 | 桌面应用 |
| pkg 单文件 | 简单，体积小 | 无图形界面，需要命令行安装 | 服务/CLI 工具 |
| Homebrew | 自动更新，用户熟悉 | 需要维护 formula | 开发者工具 |

## 使用方法

### 方案一：完整 DMG 打包

```bash
cd okclaw
./scripts/build-dmg.sh
```

输出：`build/OKClaw-2.0.0.dmg`

### 方案二：简化 pkg 打包

```bash
cd okclaw
./scripts/build-pkg.sh
```

输出：`build/OKClaw-2.0.0-macos-arm64.tar.gz`

## 常见问题及解决方案

### 1. 原生模块架构不匹配

**问题**：`better-sqlite3` 在 Intel Mac 上编译的 `.node` 文件无法在 Apple Silicon 上运行。

**解决方案**：
```bash
# 针对目标架构重新编译
npm rebuild better-sqlite3 --target_arch=arm64
# 或在目标机器上运行
npm rebuild
```

打包脚本会自动检测当前架构并重新编译。

### 2. Node.js 运行时缺失

**问题**：用户机器没有安装 Node.js 或版本不兼容。

**解决方案**：
- 方案一：打包 Node.js 运行时到应用内（推荐）
- 方案二：使用 `pkg` 将应用打包成单文件可执行

### 3. Gatekeeper 阻止运行

**问题**：用户下载后无法打开，提示"无法验证开发者"。

**解决方案**：
```bash
# 用户临时解决方案（右键打开）
xattr -cr /Applications/OKClaw.app

# 开发者解决方案：代码签名
codesign --deep --force --verify --verbose \
    --sign "Developer ID Application: Your Name (TEAMID)" \
    /Applications/OKClaw.app
```

### 4. 公证失败

**问题**：应用在其他 Mac 上运行时被阻止。

**解决方案**：
```bash
# 1. 获取 App Store Connect API Key
# 2. 提交公证
xcrun notarytool submit build/OKClaw.dmg \
    --apple-id your@email.com \
    --password app-specific-password \
    --team-id YOURTEAMID \
    --wait

# 3. Staple 公证结果
xcrun stapler staple build/OKClaw.dmg
```

### 5. 跨架构构建

**问题**：需要在 Intel Mac 上构建 Apple Silicon 版本（或反过来）。

**解决方案**：
```bash
# 安装交叉编译工具
xcode-select --install

# 使用 pkg 支持多架构
pkg . --targets node20-macos-x64,node20-macos-arm64

# 或使用 Rosetta 在 Intel Mac 上构建 arm64
arch -x86_64 npm rebuild better-sqlite3  # Intel
arch -arm64e npm rebuild better-sqlite3  # Apple Silicon (需要 M1 Mac)
```

### 6. 文件权限问题

**问题**：应用无法写入数据目录。

**解决方案**：
- 数据目录放在 `~/Library/Application Support/OKClaw/`
- 首次运行时创建必要目录
- 避免写入应用包内部（会被 SIP 保护）

### 7. 环境变量丢失

**问题**：通过 GUI 启动时，环境变量未加载。

**解决方案**：
```bash
# 在 launchd plist 中设置环境变量
<key>EnvironmentVariables</key>
<dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
</dict>
```

## 目录结构

### DMG 内部结构

```
OKClaw.app/
├── Contents/
│   ├── Info.plist          # 应用元数据
│   ├── PkgInfo             # 类型标识
│   ├── MacOS/
│   │   └── OKClaw          # 启动脚本
│   ├── Resources/
│   │   ├── AppIcon.icns    # 应用图标
│   │   └── app/            # 应用文件
│   │       ├── dist/       # 编译后的 JS
│   │       ├── web/dist/   # 前端静态文件
│   │       ├── node_modules/
│   │       └── package.json
│   └── Frameworks/
│       └── node            # Node.js 运行时
```

### 用户数据目录

```
~/Library/Application Support/OKClaw/
├── .env                    # 用户配置
├── data/
│   ├── sessions/           # Agent 会话
│   └── uploads/            # 上传文件
└── logs/
    ├── stdout.log
    └── stderr.log
```

## 代码签名要求

### 证书类型

1. **Development Certificate** - 开发测试用
2. **Developer ID Application** - 分发给其他用户（推荐）
3. **Mac App Distribution** - App Store 分发

### 获取证书

1. 访问 [Apple Developer](https://developer.apple.com)
2. 在 Certificates 中创建 "Developer ID Application" 证书
3. 下载并安装到钥匙串

### 签名命令

```bash
# 查看可用证书
security find-identity -v -p codesigning

# 签名应用
codesign --deep --force --verify --verbose \
    --sign "Developer ID Application: Your Name (TEAMID)" \
    --options runtime \
    --entitlements entitlements.plist \
    build/OKClaw.app
```

## Entitlements

对于需要特殊权限的应用，创建 `entitlements.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- 网络访问 -->
    <key>com.apple.security.network.client</key>
    <true/>

    <!-- 网络服务 -->
    <key>com.apple.security.network.server</key>
    <true/>

    <!-- 文件读写 -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

## 自动化构建

### GitHub Actions 示例

```yaml
name: Build macOS DMG

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Create DMG
        run: ./scripts/build-dmg.sh
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_PASSWORD: ${{ secrets.APPLE_APP_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}

      - name: Upload DMG
        uses: actions/upload-artifact@v4
        with:
          name: OKClaw-DMG
          path: build/*.dmg
```

## 测试清单

- [ ] 在干净的 Mac（无 Node.js）上测试安装
- [ ] 测试 Intel 和 Apple Silicon 两种架构
- [ ] 测试首次启动和配置流程
- [ ] 验证数据目录权限
- [ ] 测试 launchd 服务启停
- [ ] 验证代码签名：`codesign -dv --verbose=4 /Applications/OKClaw.app`
- [ ] 验证公证：`spctl --assess --verbose /Applications/OKClaw.app`

## 相关资源

- [Apple Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [pkg - Node.js 打包工具](https://github.com/vercel/pkg)
- [create-dmg](https://github.com/create-dmg/create-dmg)
