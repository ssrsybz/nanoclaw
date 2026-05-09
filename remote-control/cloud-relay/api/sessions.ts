/**
 * 会话 API
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SessionState, WorkerState } from '../../shared/types';
import { WorkerJWT, signJwt, validateWorkerJwt } from '../../shared/auth';

const router = express.Router();

// 内存存储 (实际应使用数据库)
const sessions = new Map<string, SessionState>();
const workerTokens = new Map<string, { jwt: string; epoch: number }>();

// 创建会话
router.post('/v1/code/sessions', async (req: Request, res: Response) => {
  const { title, organization_uuid } = req.body;

  const sessionId = uuidv4();
  const sessionState: SessionState = {
    session_id: sessionId,
    status: 'idle',
    metadata: {
      title,
      organization_uuid,
      created_at: new Date().toISOString()
    }
  };

  sessions.set(sessionId, sessionState);

  res.json({
    id: sessionId,
    url: `${process.env.BASE_URL || 'http://localhost:3000'}/v1/code/sessions/${sessionId}`,
    title,
    status: 'idle'
  });
});

// 获取会话信息
router.get('/v1/code/sessions/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json(session);
});

// 桥接会话 - 获取 Worker JWT
router.post('/v1/code/sessions/:sessionId/bridge', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // 生成 Worker JWT
  const epoch = Date.now();
  const jwt = await signJwt({
    session_id: sessionId,
    role: 'worker',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600 // 1 小时
  });

  workerTokens.set(sessionId, { jwt, epoch });

  res.json({
    worker_jwt: jwt,
    worker_epoch: epoch
  });
});

// 更新 Worker 状态
router.put('/v1/code/sessions/:sessionId/worker', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { worker_epoch, worker_status } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // 检查 epoch
  const tokenInfo = workerTokens.get(sessionId);
  if (tokenInfo && tokenInfo.epoch !== worker_epoch) {
    res.status(409).json({ error: 'Epoch mismatch' });
    return;
  }

  session.status = worker_status === 'busy' ? 'busy' : 'active';
  sessions.set(sessionId, session);

  res.json({ success: true });
});

// Worker 心跳
router.post('/v1/code/sessions/:sessionId/worker/heartbeat', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { worker_epoch } = req.body;

  const tokenInfo = workerTokens.get(sessionId);
  if (!tokenInfo) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  // 检查 epoch
  if (tokenInfo.epoch !== worker_epoch) {
    res.status(409).json({ error: 'Epoch mismatch' });
    return;
  }

  res.json({ success: true });
});

export default router;
