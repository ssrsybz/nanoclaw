#!/bin/bash
# Claude Remote Control 调试代理脚本
# 启动一个代理服务器，用于拦截和调试所有消息

set -e

echo "🔍 Starting Debug Proxy..."

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 调试代理端口
PROXY_PORT=${DEBUG_PROXY_PORT:-8888}
TARGET_HOST=${DEBUG_TARGET:-localhost:3000}

# 创建临时代理脚本
PROXY_SCRIPT=$(mktemp)
cat > "$PROXY_SCRIPT" << 'PROXY_EOF'
const http = require('http');
const https = require('https');
const url = require('url');

const PROXY_PORT = process.env.PROXY_PORT || 8888;
const TARGET_HOST = process.env.TARGET_HOST || 'localhost:3000';

// 颜色
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(color, prefix, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`${colors[color]}[${timestamp}] [${prefix}]${colors.reset} ${message}`);
}

const server = http.createServer((req, res) => {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  log('cyan', 'REQUEST', `${req.method} ${req.url}`);

  // 读取请求体
  let body = [];
  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    body = Buffer.concat(body);

    // 打印请求详情
    if (body.length > 0) {
      try {
        const json = JSON.parse(body.toString());
        log('blue', 'REQUEST_BODY', JSON.stringify(json, null, 2));
      } catch (e) {
        log('yellow', 'REQUEST_BODY', body.toString());
      }
    }

    // 转发请求
    const options = {
      hostname: TARGET_HOST.split(':')[0],
      port: TARGET_HOST.split(':')[1] || 80,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: TARGET_HOST.split(':')[0]
      }
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const duration = Date.now() - startTime;

      log('green', 'RESPONSE', `${proxyRes.statusCode} (${duration}ms)`);

      // 读取响应体
      let resBody = [];
      proxyRes.on('data', chunk => resBody.push(chunk));
      proxyRes.on('end', () => {
        resBody = Buffer.concat(resBody);

        // 打印响应详情
        if (resBody.length > 0) {
          try {
            const json = JSON.parse(resBody.toString());
            log('green', 'RESPONSE_BODY', JSON.stringify(json, null, 2));
          } catch (e) {
            log('yellow', 'RESPONSE_BODY', resBody.toString().substring(0, 500));
          }
        }

        // 返回响应
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        res.end(resBody);
      });
    });

    proxyReq.on('error', (e) => {
      log('red', 'ERROR', e.message);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Proxy Error', message: e.message }));
    });

    if (body.length > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
});

// WebSocket 升级处理
server.on('upgrade', (req, socket, head) => {
  log('yellow', 'WEBSOCKET', `Upgrade request to ${req.url}`);

  const options = {
    hostname: TARGET_HOST.split(':')[0],
    port: TARGET_HOST.split(':')[1] || 80,
    path: req.url,
    headers: req.headers
  };

  const proxyReq = http.request(options);

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    log('green', 'WEBSOCKET', 'Connection established');

    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );

    // 双向转发
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);

    // 日志
    socket.on('data', (chunk) => {
      log('blue', 'WS_CLIENT', chunk.toString());
    });
    proxySocket.on('data', (chunk) => {
      log('green', 'WS_SERVER', chunk.toString());
    });
  });

  proxyReq.on('error', (e) => {
    log('red', 'WEBSOCKET_ERROR', e.message);
  });

  proxyReq.end();
});

server.listen(PROXY_PORT, () => {
  console.log('');
  console.log(`${colors.green}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║     Claude Remote Control Debug Proxy     ║${colors.reset}`);
  console.log(`${colors.green}╚════════════════════════════════════════════╝${colors.reset}`);
  console.log('');
  console.log(`Proxy running on: http://localhost:${PROXY_PORT}`);
  console.log(`Forwarding to: http://${TARGET_HOST}`);
  console.log('');
  console.log('Features:');
  console.log('  - HTTP request/response logging');
  console.log('  - WebSocket message inspection');
  console.log('  - Colored output for easy reading');
  console.log('');
  console.log('Press Ctrl+C to stop');
  console.log('');
});
PROXY_EOF

# 设置环境变量并启动
export PROXY_PORT
export TARGET_HOST

echo -e "${GREEN}Starting debug proxy on port ${PROXY_PORT}...${NC}"
echo -e "${BLUE}Forwarding to ${TARGET_HOST}${NC}"
echo ""

node "$PROXY_SCRIPT"

# 清理
trap "rm -f $PROXY_SCRIPT" EXIT
