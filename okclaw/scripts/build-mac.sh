#!/bin/bash
# macOS 打包脚本
# 在 macOS 机器上运行此脚本来生成安装包

set -e

echo "=== OKClaw macOS Build Script ==="

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Error: Node.js 20+ is required. Current version: $(node -v)"
    exit 1
fi

# 进入项目目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "Project directory: $PROJECT_DIR"

# 安装依赖
echo ""
echo "=== Installing dependencies ==="
npm install

# 构建项目
echo ""
echo "=== Building project ==="
npm run build

# 打包 macOS 版本
echo ""
echo "=== Building macOS packages ==="
npx electron-builder --mac

echo ""
echo "=== Build complete ==="
echo "Output files are in: $PROJECT_DIR/release/"

# 列出生成的文件
ls -lh release/

# 提示代码签名
echo ""
echo "=== Code Signing (Optional) ==="
echo "For distribution, you need to sign the app with your Apple Developer certificate."
echo "Set these environment variables before running:"
echo "  CSC_LINK=/path/to/certificate.p12"
echo "  CSC_KEY_PASSWORD=your_password"
echo "  APPLE_ID=your_apple_id"
echo "  APPLE_APP_SPECIFIC_PASSWORD=your_app_specific_password"
