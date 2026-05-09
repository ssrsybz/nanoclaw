/**
 * 云服务器中继入口
 */

import express from 'express';
import cors from 'cors';
import sessionsRouter from './api/sessions';
import environmentsRouter from './api/environments';
import eventsRouter from './api/events';

const app = express();

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// API 路由
app.use(sessionsRouter);
app.use(environmentsRouter);
app.use(eventsRouter);

// 根路径
app.get('/', (req, res) => {
  res.json({
    name: 'Claude Remote Control - Cloud Relay',
    version: '1.0.0',
    endpoints: {
      sessions: '/v1/code/sessions',
      environments: '/v1/environments'
    }
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// 错误处理
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 启动服务
const PORT = process.env.CLOUD_RELAY_PORT || 3000;

app.listen(PORT, () => {
  console.log(`Cloud Relay running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
