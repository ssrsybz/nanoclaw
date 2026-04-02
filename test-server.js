#!/usr/bin/env node
/**
 * NanoClaw 飞书测试服务器
 * 运行: node test-server.js
 * 访问: http://localhost:3456
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3456;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 路由处理
  if (url.pathname === '/') {
    // 返回测试页面
    const filePath = path.join(__dirname, 'test-feishu.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  } else if (url.pathname === '/logs/nanoclaw.log') {
    // 返回日志文件
    const logPath = path.join(__dirname, 'logs', 'nanoclaw.log');
    fs.readFile(logPath, 'utf-8', (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Log file not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(data);
    });
  } else if (url.pathname === '/api/status') {
    // API 状态
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', time: new Date().toISOString() }));
  } else if (url.pathname === '/api/logs') {
    // 返回最近的日志
    const logPath = path.join(__dirname, 'logs', 'nanoclaw.log');
    const lines = url.searchParams.get('lines') || 100;
    fs.readFile(logPath, 'utf-8', (err, data) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ logs: [] }));
        return;
      }
      const allLines = data.split('\n').filter(l => l.trim()).slice(-lines);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ logs: allLines }));
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║     NanoClaw 飞书测试服务器                  ║
╠══════════════════════════════════════════════╣
║  访问: http://localhost:${PORT}                 ║
║  按 Ctrl+C 停止                              ║
╚══════════════════════════════════════════════╝
  `);
});
