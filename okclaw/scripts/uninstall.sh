#!/bin/bash
# OKClaw 卸载脚本

set -e

APP_NAME="OKClaw"
APP_PATH="/Applications/${APP_NAME}.app"
SUPPORT_DIR="${HOME}/Library/Application Support/${APP_NAME}"
LAUNCHAGENT_PLIST="${HOME}/Library/LaunchAgents/com.okclaw.plist"

echo "=========================================="
echo "   OKClaw 卸载"
echo "=========================================="
echo ""
echo "将要删除:"
echo "  - ${APP_PATH}"
echo "  - ${SUPPORT_DIR}"
echo "  - ${LAUNCHAGENT_PLIST}"
echo ""
echo "是否继续？(y/n)"
read -r answer

if [ "$answer" != "y" ] && [ "$answer" != "Y" ]; then
    echo "取消卸载"
    exit 0
fi

# 停止并卸载服务
if [ -f "$LAUNCHAGENT_PLIST" ]; then
    echo "停止启动服务..."
    launchctl unload "$LAUNCHAGENT_PLIST" 2>/dev/null || true
    rm -f "$LAUNCHAGENT_PLIST"
fi

# 删除应用
if [ -d "$APP_PATH" ]; then
    echo "删除应用..."
    rm -rf "$APP_PATH"
fi

# 删除支持文件
if [ -d "$SUPPORT_DIR" ]; then
    echo "删除数据目录..."
    rm -rf "$SUPPORT_DIR"
fi

echo ""
echo "卸载完成!"
echo ""
echo "注意: Claude CLI 配置 (~/.claude/) 已保留"
echo "如需删除，请手动执行: rm -rf ~/.claude"
