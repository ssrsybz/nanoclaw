#!/bin/bash
# Claude Remote Control 开发环境启动脚本

set -e

echo "🚀 Starting Claude Remote Control Development Environment..."

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Node.js 版本
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${YELLOW}Warning: Node.js version should be >= 18${NC}"
fi

# 切换到脚本所在目录的项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing dependencies...${NC}"
    npm install
fi

# 构建共享模块
echo -e "${BLUE}Building shared modules...${NC}"
npm run build --workspace=shared 2>/dev/null || true

# 启动服务
echo -e "${GREEN}Starting services...${NC}"

# 启动云服务器中继 (端口 3000)
echo -e "${BLUE}Starting Cloud Relay on port 3000...${NC}"
npm run dev:cloud &
CLOUD_PID=$!

# 等待云服务器启动
sleep 2

# 启动终端服务 (端口 3002)
echo -e "${BLUE}Starting Terminal Service on port 3002...${NC}"
npm run dev:terminal &
TERMINAL_PID=$!

# 显示状态
echo ""
echo -e "${GREEN}✓ Development environment started!${NC}"
echo ""
echo "Services:"
echo "  - Cloud Relay:     http://localhost:3000"
echo "  - Terminal Service: http://localhost:3002"
echo ""
echo "Press Ctrl+C to stop all services"

# 等待所有后台进程
wait
