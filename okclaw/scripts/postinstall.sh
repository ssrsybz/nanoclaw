#!/bin/bash
# OKClaw 安装后配置脚本
# 在用户将应用拖入 Applications 后运行

set -e

APP_NAME="OKClaw"
APP_PATH="/Applications/${APP_NAME}.app"
RESOURCES_PATH="${APP_PATH}/Contents/Resources"
APP_RESOURCES="${RESOURCES_PATH}/app"

echo "=========================================="
echo "   OKClaw 安装后配置"
echo "=========================================="

# 检查应用是否存在
if [ ! -d "$APP_PATH" ]; then
    echo "错误: 未找到 ${APP_PATH}"
    echo "请先将 OKClaw 拖入 Applications 文件夹"
    exit 1
fi

# 创建数据目录
echo "创建数据目录..."
mkdir -p ~/Library/Application\ Support/${APP_NAME}/data/sessions
mkdir -p ~/Library/Application\ Support/${APP_NAME}/data/uploads
mkdir -p ~/Library/Application\ Support/${APP_NAME}/logs

# 创建配置文件
echo "创建配置文件..."
CONFIG_DIR="${HOME}/Library/Application Support/${APP_NAME}"

# 复制示例配置
if [ -f "${APP_RESOURCES}/.env.example" ]; then
    if [ ! -f "${CONFIG_DIR}/.env" ]; then
        cp "${APP_RESOURCES}/.env.example" "${CONFIG_DIR}/.env"
        echo "已创建配置文件: ${CONFIG_DIR}/.env"
    fi
fi

# 创建 launchd 服务（可选）
echo ""
echo "是否要创建开机启动服务？(y/n)"
read -r answer

if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    LAUNCHAGENT_PLIST="${HOME}/Library/LaunchAgents/com.okclaw.plist"

    cat > "$LAUNCHAGENT_PLIST" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.okclaw</string>
    <key>ProgramArguments</key>
    <array>
        <string>${APP_PATH}/Contents/MacOS/${APP_NAME}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${HOME}/Library/Application Support/${APP_NAME}/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${HOME}/Library/Application Support/${APP_NAME}/logs/stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>OKCLAW_DATA_DIR</key>
        <string>${HOME}/Library/Application Support/${APP_NAME}/data</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>${APP_RESOURCES}</string>
</dict>
</plist>
PLIST_EOF

    echo "已创建启动服务: ${LAUNCHAGENT_PLIST}"
    echo "使用以下命令管理服务:"
    echo "  启动: launchctl load ${LAUNCHAGENT_PLIST}"
    echo "  停止: launchctl unload ${LAUNCHAGENT_PLIST}"
fi

# 配置 Claude CLI
echo ""
echo "=========================================="
echo "   下一步"
echo "=========================================="
echo ""
echo "1. 编辑配置文件:"
echo "   open -e \"${CONFIG_DIR}/.env\""
echo ""
echo "2. 配置 Claude API Key (首次使用):"
echo "   claude config"
echo ""
echo "3. 启动服务:"
echo "   open ${APP_PATH}"
echo ""
echo "4. 访问 Web 界面:"
echo "   http://localhost:3100"
echo ""
echo "安装完成!"
