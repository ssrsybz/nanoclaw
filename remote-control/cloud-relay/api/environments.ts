/**
 * 环境 API
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { EnvironmentInfo } from '../../shared/types';

const router = express.Router();

// 内存存储
const environments = new Map<string, EnvironmentInfo>();
const pendingWorks = new Map<string, Array<{ sessionId: string; callback: () => void }>>();

// 注册环境
router.post('/v1/environments', (req: Request, res: Response) => {
  const { machine_name, branch, git_repo_url, max_sessions, spawn_mode, worker_type, metadata } = req.body;

  const environmentId = uuidv4();
  const environmentSecret = uuidv4();

  const envInfo: EnvironmentInfo = {
    environment_id: environmentId,
    environment_secret: environmentSecret,
    machine_name,
    branch,
    git_repo_url,
    metadata: {
      ...metadata,
      max_sessions,
      spawn_mode,
      worker_type,
      created_at: new Date().toISOString()
    }
  };

  environments.set(environmentId, envInfo);

  res.json({
    id: environmentId,
    secret: environmentSecret
  });
});

// 轮询等待工作 (长轮询)
router.get('/v1/environments/:envId/work', async (req: Request, res: Response) => {
  const { envId } = req.params;
  const timeout = parseInt(req.query.timeout as string) || 30000;

  const env = environments.get(envId);
  if (!env) {
    res.status(404).json({ error: 'Environment not found' });
    return;
  }

  // 检查是否有待处理的工作
  const pending = pendingWorks.get(envId) || [];

  if (pending.length > 0) {
    const work = pending.shift()!;
    res.json({
      session_id: work.sessionId
    });
    return;
  }

  // 长轮询等待
  const startTime = Date.now();
  const interval = 1000;

  const checkWork = () => {
    const elapsed = Date.now() - startTime;
    if (elapsed >= timeout) {
      res.json({ session_id: null });
      return;
    }

    const pending = pendingWorks.get(envId) || [];
    if (pending.length > 0) {
      const work = pending.shift()!;
      res.json({
        session_id: work.sessionId
      });
      return;
    }

    setTimeout(checkWork, interval);
  };

  checkWork();
});

// 确认工作
router.post('/v1/environments/:envId/ack', (req: Request, res: Response) => {
  const { envId } = req.params;
  const { session_id } = req.body;

  const env = environments.get(envId);
  if (!env) {
    res.status(404).json({ error: 'Environment not found' });
    return;
  }

  res.json({ success: true });
});

// 停止工作
router.post('/v1/environments/:envId/stop', (req: Request, res: Response) => {
  const { envId } = req.params;

  const env = environments.get(envId);
  if (!env) {
    res.status(404).json({ error: 'Environment not found' });
    return;
  }

  res.json({ success: true });
});

// 注销环境
router.delete('/v1/environments/:envId', (req: Request, res: Response) => {
  const { envId } = req.params;

  environments.delete(envId);
  pendingWorks.delete(envId);

  res.json({ success: true });
});

export default router;
