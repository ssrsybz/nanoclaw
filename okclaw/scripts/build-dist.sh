#!/bin/bash
# OKClaw 分发包构建脚本
# 创建可分发的 tarball，用户需要自行安装 Node.js 20+

set -e

APP_NAME="OKClaw"
APP_VERSION=$(node -p "require('./package.json').version")
BUILD_DIR="./build"
CURRENT_ARCH=$(uname -m)
DIST_NAME="${APP_NAME}-${APP_VERSION}-macos-${CURRENT_ARCH}"

echo "=========================================="
echo "  OKClaw 分发包构建"
echo "  版本: ${APP_VERSION}"
echo "  架构: ${CURRENT_ARCH}"
echo "=========================================="

# 清理
rm -rf "${BUILD_DIR}/${DIST_NAME}"
mkdir -p "${BUILD_DIR}/${DIST_NAME}"

# 构建
echo "[1/5] 构建项目..."
npm run build

# 复制文件
echo "[2/5] 复制应用文件..."
cp -r dist "${BUILD_DIR}/${DIST_NAME}/"
mkdir -p "${BUILD_DIR}/${DIST_NAME}/web"
cp -r store/public/* "${BUILD_DIR}/${DIST_NAME}/web/"
cp -r node_modules "${BUILD_DIR}/${DIST_NAME}/"
cp -r skills "${BUILD_DIR}/${DIST_NAME}/" 2>/dev/null || true
mkdir -p "${BUILD_DIR}/${DIST_NAME}/data"
cp -r data/* "${BUILD_DIR}/${DIST_NAME}/data/" 2>/dev/null || true

# 复制配置文件
echo "[3/5] 复制配置文件..."
cp package.json "${BUILD_DIR}/${DIST_NAME}/"
cp package-lock.json "${BUILD_DIR}/${DIST_NAME}/"
cp .env.example "${BUILD_DIR}/${DIST_NAME}/.env"
cp README.md "${BUILD_DIR}/${DIST_NAME}/" 2>/dev/null || true
cp README_zh.md "${BUILD_DIR}/${DIST_NAME}/" 2>/dev/null || true

# 创建数据目录结构
mkdir -p "${BUILD_DIR}/${DIST_NAME}/data/sessions"
mkdir -p "${BUILD_DIR}/${DIST_NAME}/data/uploads"
mkdir -p "${BUILD_DIR}/${DIST_NAME}/logs"

# 创建启动脚本
echo "[4/5] 创建启动脚本..."
cat > "${BUILD_DIR}/${DIST_NAME}/start.sh" << 'START_EOF'
#!/bin/bash
# OKClaw 启动脚本

cd "$(dirname "$0")"

# 检查 Node.js 版本
NODE_VERSION=$(node -v 2>/dev/null | cut -d'v' -f2 | cut -d'.' -f1)
if [ -z "$NODE_VERSION" ] || [ "$NODE_VERSION" -lt 20 ]; then
    echo "错误: 需要 Node.js 20 或更高版本"
    echo "当前版本: $(node -v 2>/dev/null || echo '未安装')"
    echo ""
    echo "安装 Node.js:"
    echo "  brew install node"
    echo "  或访问 https://nodejs.org"
    exit 1
fi

# 设置环境
export NODE_ENV=production

# 启动服务
echo "启动 OKClaw..."
echo "Web 界面: http://localhost:3100"
echo ""
exec node dist/index.js "$@"
START_EOF

chmod +x "${BUILD_DIR}/${DIST_NAME}/start.sh"

# 创建安装脚本
cat > "${BUILD_DIR}/${DIST_NAME}/install.sh" << 'INSTALL_EOF'
#!/bin/bash
# OKClaw 安装脚本

INSTALL_DIR="${HOME}/.okclaw"

echo "=========================================="
echo "  OKClaw 安装"
echo "=========================================="

# 创建安装目录
mkdir -p "${INSTALL_DIR}"

# 复制文件
echo "复制文件到 ${INSTALL_DIR}..."
cp -r dist "${INSTALL_DIR}/"
cp -r web "${INSTALL_DIR}/"
cp -r node_modules "${INSTALL_DIR}/"
cp -r skills "${INSTALL_DIR}/" 2>/dev/null || true
cp -r data "${INSTALL_DIR}/"
cp package.json "${INSTALL_DIR}/"

# 创建配置文件
if [ ! -f "${INSTALL_DIR}/.env" ]; then
    cp .env "${INSTALL_DIR}/.env"
    echo "已创建配置文件: ${INSTALL_DIR}/.env"
fi

# 创建启动脚本
cat > "${HOME}/.local/bin/okclaw" << 'LAUNCH_EOF'
#!/bin/bash
cd ~/.okclaw
export NODE_ENV=production
node dist/index.js "$@"
LAUNCH_EOF

mkdir -p "${HOME}/.local/bin"
chmod +x "${HOME}/.local/bin/okclaw"

echo ""
echo "=========================================="
echo "  安装完成!"
echo "=========================================="
echo ""
echo "启动服务: okclaw"
echo "或直接运行: ${INSTALL_DIR}/start.sh"
echo ""
echo "Web 界面: http://localhost:3100"
echo "配置文件: ${INSTALL_DIR}/.env"
INSTALL_EOF

chmod +x "${BUILD_DIR}/${DIST_NAME}/install.sh"

# 打包
echo "[5/5] 创建压缩包..."
cd "${BUILD_DIR}"
tar -czvf "${DIST_NAME}.tar.gz" "${DIST_NAME}"

# 计算大小
SIZE=$(du -h "${DIST_NAME}.tar.gz" | cut -f1)

echo ""
echo "=========================================="
echo "  构建完成!"
echo "=========================================="
echo "输出文件: ${BUILD_DIR}/${DIST_NAME}.tar.gz"
echo "文件大小: ${SIZE}"
echo ""
echo "使用方法:"
echo "  1. 解压: tar -xzf ${DIST_NAME}.tar.gz"
echo "  2. 进入目录: cd ${DIST_NAME}"
echo "  3. 启动: ./start.sh"
