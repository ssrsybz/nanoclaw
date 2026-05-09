#!/bin/bash
# OKClaw 简化打包脚本（使用 pkg 打包成单文件可执行）
# 更适合服务型应用，无需创建 .app 包

set -e

APP_NAME="OKClaw"
APP_VERSION=$(node -p "require('./package.json').version")
BUILD_DIR="./build"
CURRENT_ARCH=$(uname -m)

echo "=========================================="
echo "  OKClaw 简化打包"
echo "  版本: ${APP_VERSION}"
echo "  架构: ${CURRENT_ARCH}"
echo "=========================================="

# 安装 pkg
if ! command -v pkg &> /dev/null; then
    echo "安装 pkg 工具..."
    npm install -g pkg
fi

# 构建
echo "构建项目..."
npm ci
npm run build

# 创建打包配置
cat > "${BUILD_DIR}/package.json" << 'PKG_CONFIG'
{
    "name": "okclaw",
    "bin": "dist/index.js",
    "pkg": {
        "assets": [
            "dist/**/*",
            "web/dist/**/*",
            "node_modules/better-sqlite3/**/*",
            "node_modules/@anthropic-ai/**/*",
            "node_modules/@modelcontextprotocol/**/*",
            "node_modules/ws/**/*",
            "node_modules/zod/**/*",
            "node_modules/mammoth/**/*",
            "node_modules/pdf-parse/**/*",
            "node_modules/xlsx/**/*",
            "node_modules/discord.js/**/*",
            "node_modules/@larksuiteoapi/**/*"
        ],
        "scripts": [
            "dist/**/*.js"
        ],
        "targets": ["node20-macos-${CURRENT_ARCH}"],
        "outputPath": "build"
    }
}
PKG_CONFIG

# 打包
echo "打包可执行文件..."
pkg . \
    --target "node20-macos-${CURRENT_ARCH}" \
    --output "${BUILD_DIR}/${APP_NAME}-${CURRENT_ARCH}" \
    --compress GZip

echo "创建分发包..."

# 创建安装脚本
cat > "${BUILD_DIR}/install.sh" << 'INSTALL_EOF'
#!/bin/bash
# OKClaw 安装脚本

INSTALL_DIR="/usr/local/bin"
APP_NAME="OKClaw"

echo "安装 ${APP_NAME} 到 ${INSTALL_DIR}..."

# 复制可执行文件
sudo cp ${APP_NAME}-* "${INSTALL_DIR}/${APP_NAME}"
sudo chmod +x "${INSTALL_DIR}/${APP_NAME}"

# 创建数据目录
mkdir -p ~/.okclaw/data/sessions
mkdir -p ~/.okclaw/data/uploads
mkdir -p ~/.okclaw/logs

# 创建配置文件
if [ ! -f ~/.okclaw/.env ]; then
    cp .env.example ~/.okclaw/.env
fi

echo ""
echo "安装完成!"
echo "运行 'okclaw' 启动服务"
echo "配置文件: ~/.okclaw/.env"
INSTALL_EOF

chmod +x "${BUILD_DIR}/install.sh"

# 创建压缩包
tar -czvf "${BUILD_DIR}/${APP_NAME}-${APP_VERSION}-macos-${CURRENT_ARCH}.tar.gz" \
    -C "${BUILD_DIR}" \
    "${APP_NAME}-${CURRENT_ARCH}" \
    install.sh \
    ../.env.example \
    ../README.md

echo ""
echo "=========================================="
echo "打包完成!"
echo "输出文件: ${BUILD_DIR}/${APP_NAME}-${APP_VERSION}-macos-${CURRENT_ARCH}.tar.gz"
echo "=========================================="
