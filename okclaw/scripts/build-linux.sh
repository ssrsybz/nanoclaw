#!/bin/bash
# Linux 打包脚本
# 在 Linux 机器上运行此脚本来生成安装包

set -e

echo "=== OKClaw Linux Build Script ==="

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "Error: Node.js 20+ is required. Current version: $(node -v)"
    exit 1
fi

# 检查依赖工具
check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo "Installing $1..."
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y $1
        elif command -v yum &> /dev/null; then
            sudo yum install -y $1
        elif command -v dnf &> /dev/null; then
            sudo dnf install -y $1
        else
            echo "Please install $1 manually"
            exit 1
        fi
    fi
}

# Electron 打包需要的工具
check_tool rpm
check_tool fakeroot

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

# 打包 Linux 版本
echo ""
echo "=== Building Linux packages ==="
npx electron-builder --linux

echo ""
echo "=== Build complete ==="
echo "Output files are in: $PROJECT_DIR/release/"

# 列出生成的文件
ls -lh release/
