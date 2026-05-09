#!/bin/bash
# OKClaw 快速启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="$SCRIPT_DIR/.okclaw.pid"
LOG_FILE="$SCRIPT_DIR/logs/okclaw.log"
ERROR_LOG="$SCRIPT_DIR/logs/okclaw.error.log"

# 确保日志目录存在
mkdir -p "$SCRIPT_DIR/logs"

get_pid() {
    if [ -f "$PID_FILE" ]; then
        cat "$PID_FILE"
    fi
}

is_running() {
    local pid=$(get_pid)
    if [ -n "$pid" ]; then
        ps -p "$pid" > /dev/null 2>&1
        return $?
    fi
    # 也检查端口是否被占用
    local port_pid=$(lsof -ti :3100 2>/dev/null)
    if [ -n "$port_pid" ]; then
        return 0
    fi
    return 1
}

get_port_pid() {
    lsof -ti :3100 2>/dev/null
}

start() {
    if is_running; then
        echo "OKClaw 已在运行 (PID: $(get_pid))"
        return 0
    fi

    echo "启动 OKClaw..."

    # 检查依赖
    if [ ! -d "node_modules" ]; then
        echo "安装依赖..."
        npm install
    fi

    # 检查构建
    if [ ! -d "dist" ]; then
        echo "构建项目..."
        npm run build
    fi

    # 启动服务
    nohup node dist/index.js >> "$LOG_FILE" 2>> "$ERROR_LOG" &
    echo $! > "$PID_FILE"

    sleep 2

    if is_running; then
        echo "✓ OKClaw 启动成功 (PID: $(get_pid))"
        echo "  Web IM: http://localhost:3100"
        echo "  日志: $LOG_FILE"
    else
        echo "✗ 启动失败，查看错误日志: $ERROR_LOG"
        exit 1
    fi
}

stop() {
    local pid=$(get_pid)
    local port_pid=$(get_port_pid)

    if [ -z "$pid" ] && [ -z "$port_pid" ]; then
        echo "OKClaw 未运行"
        [ -f "$PID_FILE" ] && rm "$PID_FILE"
        return 0
    fi

    # 优先使用端口检测到的 PID
    if [ -z "$pid" ] && [ -n "$port_pid" ]; then
        pid="$port_pid"
    fi

    echo "停止 OKClaw (PID: $pid)..."
    kill "$pid" 2>/dev/null || true

    # 等待进程结束
    for i in {1..10}; do
        if ! ps -p "$pid" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    if ps -p "$pid" > /dev/null 2>&1; then
        echo "强制终止..."
        kill -9 "$pid" 2>/dev/null || true
    fi

    rm -f "$PID_FILE"
    echo "✓ OKClaw 已停止"
}

status() {
    if is_running; then
        echo "OKClaw 运行中 (PID: $(get_pid))"
        echo "  Web IM: http://localhost:3100"
        echo "  日志: $LOG_FILE"
    else
        echo "OKClaw 未运行"
        [ -f "$PID_FILE" ] && echo "  (残留 PID 文件已清理)" && rm "$PID_FILE"
    fi
}

logs() {
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        echo "日志文件不存在: $LOG_FILE"
    fi
}

dev() {
    echo "启动开发模式..."
    npm run dev
}

case "${1:-start}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        sleep 1
        start
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    dev)
        dev
        ;;
    *)
        echo "用法: $0 {start|stop|restart|status|logs|dev}"
        echo ""
        echo "命令:"
        echo "  start   - 后台启动服务"
        echo "  stop    - 停止服务"
        echo "  restart - 重启服务"
        echo "  status  - 查看运行状态"
        echo "  logs    - 查看实时日志"
        echo "  dev     - 前台开发模式（热重载）"
        exit 1
        ;;
esac
