#!/bin/bash
# OKClaw DMG 打包脚本
# 支持 macOS x64 (Intel) 和 arm64 (Apple Silicon)

set -e

# ============================================
# 配置区域
# ============================================
APP_NAME="OKClaw"
APP_VERSION=$(node -p "require('./package.json').version")
BUNDLE_ID="com.okclaw.app"

# 构建目录
BUILD_DIR="./build"
APP_DIR="${BUILD_DIR}/${APP_NAME}.app"
RESOURCES_DIR="${APP_DIR}/Contents/Resources"
MACOS_DIR="${APP_DIR}/Contents/MacOS"
FRAMEWORKS_DIR="${APP_DIR}/Contents/Frameworks"

# 输出文件
DMG_NAME="${APP_NAME}-${APP_VERSION}.dmg"
VOLUME_NAME="${APP_NAME}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
# 步骤 1: 环境检查
# ============================================
check_environment() {
    log_info "检查构建环境..."

    # 检查 Node.js 版本
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 20 ]; then
        log_error "需要 Node.js 20 或更高版本，当前版本: $(node -v)"
        exit 1
    fi

    # 检测架构
    CURRENT_ARCH=$(uname -m)
    log_info "当前架构: ${CURRENT_ARCH}"

    # 检查必要工具
    local missing_tools=()
    for tool in npm codesign hdiutil; do
        if ! command -v $tool &> /dev/null; then
            missing_tools+=($tool)
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "缺少必要工具: ${missing_tools[*]}"
        exit 1
    fi
}

# ============================================
# 步骤 2: 清理并创建目录结构
# ============================================
prepare_directories() {
    log_info "准备目录结构..."

    rm -rf "${BUILD_DIR}"
    mkdir -p "${BUILD_DIR}"
    mkdir -p "${APP_DIR}/Contents"
    mkdir -p "${MACOS_DIR}"
    mkdir -p "${RESOURCES_DIR}"
    mkdir -p "${FRAMEWORKS_DIR}"
}

# ============================================
# 步骤 3: 编译项目
# ============================================
build_project() {
    log_info "编译 TypeScript 和构建前端..."

    # 安装依赖（确保原生模块正确编译）
    npm ci

    # 重新编译原生模块（针对当前架构）
    log_info "重新编译原生模块..."
    npm rebuild better-sqlite3

    # 构建项目
    npm run build

    # 验证构建
    if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
        log_error "构建失败：dist 目录不存在"
        exit 1
    fi
}

# ============================================
# 步骤 4: 打包 Node.js 运行时
# ============================================
package_node_runtime() {
    log_info "打包 Node.js 运行时..."

    # 方法 1: 使用 pkg 打包成单文件（推荐）
    # 如果没有安装 pkg，先安装
    if ! command -v pkg &> /dev/null; then
        log_info "安装 pkg 工具..."
        npm install -g pkg
    fi

    # 创建入口文件包装器
    cat > "${BUILD_DIR}/entry.js" << 'ENTRY_EOF'
const path = require('path');
const fs = require('fs');

// 设置资源路径
const appPath = path.dirname(process.execPath);
const resourcesPath = path.join(path.dirname(appPath), 'Resources');

// 设置环境变量
process.env.OKCLAW_RESOURCES = resourcesPath;
process.env.NODE_ENV = 'production';

// 切换工作目录到 Resources/app
process.chdir(path.join(resourcesPath, 'app'));

// 加载主程序
require('./dist/index.js');
ENTRY_EOF

    # 创建 pkg 配置
    cat > "${BUILD_DIR}/pkg.config.json" << PKG_EOF
{
    "name": "okclaw",
    "version": "${APP_VERSION}",
    "entry": "./build/entry.js",
    "output": "./build/okclaw-bin",
    "targets": ["node${NODE_VERSION}-macos-${CURRENT_ARCH}"],
    "assets": [
        "dist/**/*",
        "web/dist/**/*",
        "node_modules/**/*",
        "data/**/*",
        "skills/**/*"
    ],
    "scripts": [
        "dist/**/*.js"
    ]
}
PKG_EOF

    # 使用 pkg 打包（更简单的方式：直接复制 Node.js 运行时）
    log_info "复制 Node.js 运行时到 Frameworks..."

    # 获取 Node.js 路径
    NODE_PATH=$(which node)
    NODE_DIR=$(dirname "$(dirname "$NODE_PATH")")

    # 复制 Node.js 框架（简化版：只复制可执行文件）
    cp "${NODE_PATH}" "${FRAMEWORKS_DIR}/node"

    # 使其可执行
    chmod +x "${FRAMEWORKS_DIR}/node"
}

# ============================================
# 步骤 5: 复制应用文件
# ============================================
copy_app_files() {
    log_info "复制应用文件..."

    # 创建应用资源目录
    local APP_RESOURCES="${RESOURCES_DIR}/app"
    mkdir -p "${APP_RESOURCES}"

    # 复制编译后的代码
    cp -r dist "${APP_RESOURCES}/"
    mkdir -p "${APP_RESOURCES}/web"
    cp -r store/public/* "${APP_RESOURCES}/web/"
    mkdir -p "${APP_RESOURCES}/data"
    cp -r skills "${APP_RESOURCES}/" 2>/dev/null || true

    # 复制必要的 node_modules
    log_info "复制 node_modules（这可能需要一些时间）..."
    cp -r node_modules "${APP_RESOURCES}/"

    # 复制配置文件
    cp package.json "${APP_RESOURCES}/"
    cp .env.example "${APP_RESOURCES}/.env"

    # 复制资源文件
    if [ -d "assets" ]; then
        cp -r assets "${RESOURCES_DIR}/"
    fi

    # 创建数据目录结构
    mkdir -p "${APP_RESOURCES}/data/sessions"
    mkdir -p "${APP_RESOURCES}/data/uploads"
    mkdir -p "${APP_RESOURCES}/logs"
}

# ============================================
# 步骤 6: 创建启动脚本
# ============================================
create_launcher() {
    log_info "创建启动脚本..."

    # 创建启动脚本
    cat > "${MACOS_DIR}/${APP_NAME}" << 'LAUNCHER_EOF'
#!/bin/bash
# OKClaw 启动脚本

# 获取应用路径
APP_PATH="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCES_PATH="${APP_PATH}/Contents/Resources"
FRAMEWORKS_PATH="${APP_PATH}/Contents/Frameworks"

# 设置环境变量
export OKCLAW_RESOURCES="${RESOURCES_PATH}"
export NODE_ENV="production"
export PATH="${FRAMEWORKS_PATH}:$PATH"

# 切换到应用目录
cd "${RESOURCES_PATH}/app"

# 启动 Node.js 服务
exec "${FRAMEWORKS_PATH}/node" dist/index.js "$@"
LAUNCHER_EOF

    chmod +x "${MACOS_DIR}/${APP_NAME}"
}

# ============================================
# 步骤 7: 创建 Info.plist
# ============================================
create_info_plist() {
    log_info "创建 Info.plist..."

    cat > "${APP_DIR}/Contents/Info.plist" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key>
    <string>zh_CN</string>
    <key>CFBundleExecutable</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${APP_VERSION}</string>
    <key>CFBundleVersion</key>
    <string>${APP_VERSION}</string>
    <key>LSMinimumSystemVersion</key>
    <string>10.15</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <true/>
    <key>NSPrincipalClass</key>
    <string>NSApplication</string>
</dict>
</plist>
PLIST_EOF
}

# ============================================
# 步骤 8: 创建 PkgInfo
# ============================================
create_pkg_info() {
    log_info "创建 PkgInfo..."
    echo -n "APPL????" > "${APP_DIR}/Contents/PkgInfo"
}

# ============================================
# 步骤 9: 创建应用图标
# ============================================
create_app_icon() {
    log_info "创建应用图标..."

    # 检查是否有现成的 icns 图标
    if [ -f "assets/icon.icns" ]; then
        cp "assets/icon.icns" "${RESOURCES_DIR}/AppIcon.icns"
        log_info "使用现有 icns 图标文件"
        return
    fi

    # 检查项目中的 PNG 图标
    local ICON_SOURCE=""
    if [ -f "assets/nanoclaw-icon.png" ]; then
        ICON_SOURCE="assets/nanoclaw-icon.png"
    elif [ -f "assets/icon.png" ]; then
        ICON_SOURCE="assets/icon.png"
    fi

    if [ -n "$ICON_SOURCE" ]; then
        log_info "从 PNG 创建 icns 图标: ${ICON_SOURCE}"

        local ICONSET_DIR="${BUILD_DIR}/icon.iconset"
        mkdir -p "${ICONSET_DIR}"

        # 生成各种尺寸的图标
        sips -z 16 16     "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_16x16.png"
        sips -z 32 32     "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_16x16@2x.png"
        sips -z 32 32     "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_32x32.png"
        sips -z 64 64     "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_32x32@2x.png"
        sips -z 128 128   "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_128x128.png"
        sips -z 256 256   "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_128x128@2x.png"
        sips -z 256 256   "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_256x256.png"
        sips -z 512 512   "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_256x256@2x.png"
        sips -z 512 512   "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_512x512.png"
        sips -z 1024 1024 "${ICON_SOURCE}" --out "${ICONSET_DIR}/icon_512x512@2x.png"

        # 创建 icns
        iconutil -c icns "${ICONSET_DIR}" -o "${RESOURCES_DIR}/AppIcon.icns"
        log_info "icns 图标创建完成"
        return
    fi

    log_warn "未找到图标文件，将使用默认图标"
}

# ============================================
# 步骤 10: 代码签名（可选）
# ============================================
sign_app() {
    log_info "检查代码签名..."

    # 检查是否有开发者证书
    local SIGNING_IDENTITY=$(security find-identity -v -p codesigning | grep "Developer ID Application" | head -1 | sed 's/.*\"\(.*\)\".*/\1/')

    if [ -z "$SIGNING_IDENTITY" ]; then
        log_warn "未找到 Developer ID 证书，跳过代码签名"
        log_warn "应用在其他 Mac 上运行时可能需要用户手动授权"
        return
    fi

    log_info "使用证书签名: ${SIGNING_IDENTITY}"

    # 签名所有二进制文件
    find "${APP_DIR}" -name "*.dylib" -exec codesign --force --sign "${SIGNING_IDENTITY}" {} \;
    find "${APP_DIR}" -name "*.node" -exec codesign --force --sign "${SIGNING_IDENTITY}" {} \;

    # 签名 Node.js 可执行文件
    codesign --force --sign "${SIGNING_IDENTITY}" "${FRAMEWORKS_DIR}/node"

    # 签名整个应用
    codesign --force --deep --sign "${SIGNING_IDENTITY}" "${APP_DIR}"

    log_info "代码签名完成"
}

# ============================================
# 步骤 11: 创建 DMG
# ============================================
create_dmg() {
    log_info "创建 DMG 安装包..."

    local DMG_FINAL="${BUILD_DIR}/${DMG_NAME}"
    local DMG_TMP="${BUILD_DIR}/dmg-temp"

    # 创建临时目录用于 DMG 内容
    rm -rf "${DMG_TMP}"
    mkdir -p "${DMG_TMP}"

    # 复制 .app 到临时目录
    cp -R "${APP_DIR}" "${DMG_TMP}/"

    # 创建 Applications 符号链接（用于拖拽安装）
    ln -s /Applications "${DMG_TMP}/Applications"

    # 创建 DMG
    hdiutil create -srcfolder "${DMG_TMP}" \
        -volname "${VOLUME_NAME}" \
        -fs HFS+ \
        -format UDZO \
        -imagekey zlib-level=9 \
        "${DMG_FINAL}"

    # 清理临时目录
    rm -rf "${DMG_TMP}"

    log_info "DMG 创建完成: ${DMG_FINAL}"
}

# ============================================
# 步骤 12: 公证（可选）
# ============================================
notarize_dmg() {
    log_info "检查公证需求..."

    # 检查是否有 App Store Connect API Key
    if [ -z "$APPLE_API_KEY" ] || [ -z "$APPLE_API_ISSUER" ]; then
        log_warn "未设置 APPLE_API_KEY 和 APPLE_API_ISSUER 环境变量"
        log_warn "跳过公证步骤。用户首次运行时需要右键打开应用。"
        return
    fi

    log_info "提交公证请求..."

    local DMG_PATH="${BUILD_DIR}/${DMG_NAME}"

    # 提交公证
    xcrun notarytool submit "${DMG_PATH}" \
        --apple-id "${APPLE_ID}" \
        --password "${APPLE_APP_PASSWORD}" \
        --team-id "${APPLE_TEAM_ID}" \
        --wait

    # Staple 公证结果
    xcrun stapler staple "${DMG_PATH}"

    log_info "公证完成"
}

# ============================================
# 步骤 13: 清理和输出
# ============================================
finalize() {
    log_info "构建完成!"
    log_info "=========================================="
    log_info "应用版本: ${APP_VERSION}"
    log_info "应用位置: ${APP_DIR}"
    log_info "DMG 位置: ${BUILD_DIR}/${DMG_NAME}"
    log_info "=========================================="

    # 显示 DMG 大小
    if [ -f "${BUILD_DIR}/${DMG_NAME}" ]; then
        local DMG_SIZE=$(du -h "${BUILD_DIR}/${DMG_NAME}" | cut -f1)
        log_info "DMG 大小: ${DMG_SIZE}"
    fi
}

# ============================================
# 主流程
# ============================================
main() {
    log_info "开始构建 ${APP_NAME} v${APP_VERSION}..."

    check_environment
    prepare_directories
    build_project
    package_node_runtime
    copy_app_files
    create_launcher
    create_info_plist
    create_pkg_info
    create_app_icon
    sign_app
    create_dmg
    notarize_dmg
    finalize
}

# 运行主流程
main "$@"
