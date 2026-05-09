/**
 * 电脑终端服务入口
 */

import express from 'express';
import { ReplBridge, BridgeConfig } from './bridge';
import { SSETransport } from './bridge/transport';
import { SDKMessage } from '../shared/protocols';

const app = express();
app.use(express.json());

// 活跃的桥接实例
const activeBridges = new Map<string, ReplBridge>();

// Session to workspace/conversation mappings
const sessionWorkspaces = new Map<string, string>();
const sessionConversations = new Map<string, string>();

function getSessionWorkspace(sessionId: string): string | undefined {
  return sessionWorkspaces.get(sessionId);
}

function getSessionConversation(sessionId: string): string | undefined {
  return sessionConversations.get(sessionId);
}

// 创建桥接
app.post('/bridge/create', async (req, res) => {
  try {
    const { sessionUrl, workerJwt, workerEpoch, sessionId } = req.body;

    const config: BridgeConfig = {
      sessionId,
      sessionUrl,
      workerJwt,
      workerEpoch,
      onStateChange: (state, message) => {
        console.log(`Bridge ${sessionId} state: ${state}`, message || '');
      },
      onInboundMessage: (msg) => {
        console.log(`Bridge ${sessionId} received:`, msg.type);
        // 处理来自手机端的消息
        void handleInboundMessage(sessionId, msg);
      }
    };

    const transport = new SSETransport({
      url: sessionUrl,
      token: workerJwt
    });

    const bridge = new ReplBridge(config, transport);
    activeBridges.set(sessionId, bridge);

    bridge.connect();

    res.json({
      success: true,
      sessionId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 绑定会话到工作空间
app.post('/bridge/bind', async (req, res) => {
  const { sessionId, workspaceId, conversationId } = req.body;

  if (workspaceId) {
    sessionWorkspaces.set(sessionId, workspaceId);
  }
  if (conversationId) {
    sessionConversations.set(sessionId, conversationId);
  }

  res.json({ success: true });
});

// 发送消息
app.post('/bridge/:sessionId/send', async (req, res) => {
  const { sessionId } = req.params;
  const messages = req.body.messages as SDKMessage[];

  const bridge = activeBridges.get(sessionId);
  if (!bridge) {
    res.status(404).json({ error: 'Bridge not found' });
    return;
  }

  try {
    await bridge.writeMessages(messages);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 关闭桥接
app.post('/bridge/:sessionId/close', (req, res) => {
  const { sessionId } = req.params;
  const bridge = activeBridges.get(sessionId);

  if (bridge) {
    bridge.close();
    activeBridges.delete(sessionId);
  }

  res.json({ success: true });
});

// 接收 okclaw 推送的 Agent 输出
app.post('/bridge/:sessionId/push', async (req, res) => {
  const { sessionId } = req.params;
  const { data } = req.body;

  const bridge = activeBridges.get(sessionId);
  if (!bridge) {
    res.status(404).json({ error: 'Bridge not found' });
    return;
  }

  // 通过桥接的 transport 推送消息
  // 暂时只记录日志，后续需要实现 SSE 推送
  console.log(`Push to session ${sessionId}:`, data.type);

  res.json({ success: true });
});

// 处理入站消息
async function handleInboundMessage(sessionId: string, msg: SDKMessage): Promise<void> {
  console.log(`Handling inbound message for ${sessionId}:`, msg.type);

  // 只处理用户消息
  if (msg.type !== 'user') return;

  // 从映射中获取 workspaceId
  const workspaceId = getSessionWorkspace(sessionId);
  if (!workspaceId) {
    console.warn('No workspace bound to session:', sessionId);
    return;
  }

  // 调用 okclaw 的消息注入 API
  try {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);

    const response = await fetch('http://localhost:3100/api/remote-control/inject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceId,
        conversationId: getSessionConversation(sessionId),
        content,
        sender: 'remote-user',
        sender_name: 'Remote User',
      }),
    });

    if (!response.ok) {
      console.error('Failed to inject message:', await response.text());
    }
  } catch (error) {
    console.error('Error injecting message:', error);
  }
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeBridges: activeBridges.size
  });
});

// 启动服务
const PORT = process.env.TERMINAL_SERVICE_PORT || 3002;

app.listen(PORT, () => {
  console.log(`Terminal Service running on port ${PORT}`);
});
