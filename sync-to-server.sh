#!/bin/bash

# NanoClaw 服务器同步脚本
# 用于将本地代码同步到服务器并自动构建

# ============ 配置 ============
SERVER_USER="admin1"
SERVER_HOST="192.168.203.75"
SERVER_PATH="/home/admin1/OKclaw"
SERVER_PASS="1"
LOCAL_PATH="/Users/h3glove/projeck/nanoclaw"

# ============ 颜色输出 ============
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============ 检查依赖 ============
if ! command -v sshpass &> /dev/null; then
    log_error "缺少 sshpass，正在安装..."
    brew install sshpass 2>/dev/null || brew install esolitos/ipa/sshpass 2>/dev/null || { log_error "无法安装 sshpass，请手动安装"; exit 1; }
fi

# ============ 检查本地修改 ============
log_info "检查本地修改..."
cd "$LOCAL_PATH" || exit 1

# 检查是否有未提交的修改
if [[ -n $(git status --porcelain) ]]; then
    log_warn "检测到未提交的修改"
    git status --short

    read -p "是否自动提交这些修改? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "正在提交修改..."
        git add -A
        BRANCH_NAME=$(git branch --show-current)
        git commit -m "Auto commit: $(date '+%Y-%m-%d %H:%M:%S')"
        log_info "已提交到本地 $BRANCH_NAME 分支"
    else
        log_warn "取消提交，仅同步现有代码"
    fi
else
    log_info "没有未提交的修改"
fi

# ============ 同步代码到服务器 ============
log_info "正在同步代码到服务器 ${SERVER_USER}@${SERVER_HOST}..."

sshpass -p "$SERVER_PASS" rsync -avz --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.superpowers' \
    --exclude='dist' \
    --exclude='*.log' \
    --exclude='.DS_Store' \
    --exclude='nanoclaw.bundle' \
    --exclude='sync-to-server.sh' \
    --exclude='send-test.mjs' \
    --exclude='data/' \
    --exclude='store/' \
    --exclude='uploads/' \
    --exclude='*.db' \
    --exclude='*.db-journal' \
    --exclude='.env' \
    --exclude='.env.*' \
    "$LOCAL_PATH/" \
    "${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/"

if [ $? -eq 0 ]; then
    log_info "代码同步成功！"
else
    log_error "代码同步失败！"
    exit 1
fi

# ============ 在服务器上构建 ============
log_info "正在服务器上安装依赖并构建..."

sshpass -p "$SERVER_PASS" ssh "${SERVER_USER}@${SERVER_HOST}" << 'ENDSSH'
set -e

cd /home/admin1/OKclaw || exit 1

echo ">>> 安装后端依赖..."
if [ -f "package.json" ]; then
    npm install
fi

echo ">>> 构建前端..."
if [ -d "web" ]; then
    cd web
    npm install
    npm run build
    cd ..
fi

echo ">>> 重启服务..."
if command -v pm2 &> /dev/null; then
    pm2 restart nanoclaw 2>/dev/null || echo "pm2 中没有 nanoclaw 进程，跳过"
elif command -v systemctl &> /dev/null; then
    systemctl --user restart nanoclaw 2>/dev/null || echo "systemctl 中没有 nanoclaw 服务，跳过"
else
    echo "未检测到 pm2 或 systemctl，请手动重启服务"
fi

echo ">>> 完成！"
ENDSSH

if [ $? -eq 0 ]; then
    log_info "========== 同步 + 构建 + 重启 完成 =========="
else
    log_error "执行失败！请检查服务器日志"
    exit 1
fi
