/**
 * 事件流 API (SSE)
 */

import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// 存储的事件
interface StoredEvent {
  event_id: string;
  sequence_num: number;
  event_type: string;
  source: 'user' | 'assistant' | 'system';
  payload: Record<string, unknown>;
  created_at: string;
  delivery_status: 'pending' | 'delivered' | 'processed';
}

// 内存存储
const events = new Map<string, StoredEvent[]>();
const sseClients = new Map<string, Set<Response>>();

// 发送事件
router.post('/v1/code/sessions/:sessionId/worker/events', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const event = req.body;

  // 存储事件
  const sessionEvents = events.get(sessionId) || [];
  const storedEvent: StoredEvent = {
    event_id: uuidv4(),
    sequence_num: sessionEvents.length + 1,
    event_type: event.type || 'message',
    source: event.source || 'system',
    payload: event,
    created_at: new Date().toISOString(),
    delivery_status: 'pending'
  };

  sessionEvents.push(storedEvent);
  events.set(sessionId, sessionEvents);

  // 推送给 SSE 客户端
  const clients = sseClients.get(sessionId);
  if (clients) {
    const sseData = `data: ${JSON.stringify(storedEvent)}\n\n`;
    clients.forEach(client => {
      client.write(sseData);
    });
  }

  res.json({
    event_id: storedEvent.event_id,
    sequence_num: storedEvent.sequence_num
  });
});

// SSE 事件流
router.get('/v1/code/sessions/:sessionId/worker/events/stream', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const fromSequenceNum = parseInt(req.query.from_sequence_num as string) || 0;

  // 设置 SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 注册客户端
  const clients = sseClients.get(sessionId) || new Set<Response>();
  clients.add(res);
  sseClients.set(sessionId, clients);

  // 发送历史事件
  const sessionEvents = events.get(sessionId) || [];
  const missedEvents = sessionEvents.filter(e => e.sequence_num > fromSequenceNum);

  missedEvents.forEach(event => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // 保持连接
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 15000);

  // 清理
  req.on('close', () => {
    clearInterval(heartbeat);
    const clients = sseClients.get(sessionId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(sessionId);
      }
    }
  });
});

// 送达确认
router.post('/v1/code/sessions/:sessionId/worker/events/delivery', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { event_id, status } = req.body;

  const sessionEvents = events.get(sessionId) || [];
  const event = sessionEvents.find(e => e.event_id === event_id);

  if (event) {
    event.delivery_status = status;
  }

  res.json({ success: true });
});

export default router;
