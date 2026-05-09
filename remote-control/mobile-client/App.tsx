/**
 * 手机端应用主组件
 */

import React, { useState, useEffect } from 'react';
import { ConversationView } from './components/ConversationView';
import { PermissionDialog } from './components/PermissionDialog';
import { sessionManager, Message } from './services/SessionManager';
import { messageHandler } from './services/MessageHandler';
import { permissionController } from './services/PermissionController';
import { Transport, createTransport } from './services/Transport';
import { PermissionRequest } from '../shared/protocols/permission';

export const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // 初始化
  useEffect(() => {
    // 设置消息回调
    messageHandler.setOnMessage((sessionId, message) => {
      const currentSession = sessionManager.getCurrentSession();
      if (currentSession?.sessionId === sessionId) {
        setMessages(prev => [...prev, message]);
      }
    });

    // 设置流式回调
    messageHandler.setOnStream((sessionId, content) => {
      const currentSession = sessionManager.getCurrentSession();
      if (currentSession?.sessionId === sessionId) {
        setStreamingContent(prev => prev + content);
      }
    });

    // 设置权限回调
    permissionController.setOnPermission((request) => {
      setPermissionRequest(request);
    });
  }, []);

  // 连接到服务器
  const connect = (serverUrl: string, sessionId: string) => {
    const newTransport = createTransport({
      baseUrl: serverUrl,
      onConnect: () => {
        setIsConnected(true);
        console.log('Connected to server');
      },
      onDisconnect: () => {
        setIsConnected(false);
        console.log('Disconnected from server');
      },
      onError: (error) => {
        console.error('Connection error:', error);
      }
    });

    newTransport.connectWebSocket(`${serverUrl}/ws?session=${sessionId}`);
    setTransport(newTransport);

    // 创建本地会话
    sessionManager.createSession('default-env', 'Remote Session');
    sessionManager.setCurrentSession(sessionId);
  };

  // 发送消息
  const handleSendMessage = (content: string) => {
    if (!transport || !isConnected) return;

    const currentSession = sessionManager.getCurrentSession();
    if (!currentSession) return;

    transport.send(currentSession.sessionId, content);
    setStreamingContent(''); // 清空流式内容
  };

  // 处理权限响应
  const handlePermissionAllow = (remember: boolean) => {
    if (!permissionRequest || !transport) return;

    const response = permissionController.respond(
      permissionRequest.request_id,
      'allow',
      remember ? { scope: 'session', remember: true } : undefined
    );

    transport.sendPermissionResponse(response);
    setPermissionRequest(null);
  };

  const handlePermissionDeny = (remember: boolean) => {
    if (!permissionRequest || !transport) return;

    const response = permissionController.respond(
      permissionRequest.request_id,
      'deny',
      remember ? { scope: 'session', remember: true } : undefined
    );

    transport.sendPermissionResponse(response);
    setPermissionRequest(null);
  };

  return (
    <div className="app">
      {/* 头部 */}
      <header className="app-header">
        <h1>Claude Remote Control</h1>
        <div className="connection-status">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          {isConnected ? 'Connected' : 'Disconnected'}
        </div>
      </header>

      {/* 主内容 */}
      <main className="app-main">
        {messages.length === 0 && !isConnected ? (
          <div className="connect-prompt">
            <h2>Connect to Terminal</h2>
            <p>Scan QR code or enter session ID to connect</p>
            {/* 这里可以添加连接表单 */}
          </div>
        ) : (
          <ConversationView
            messages={messages}
            streamingContent={streamingContent}
            onSendMessage={handleSendMessage}
          />
        )}
      </main>

      {/* 权限弹窗 */}
      {permissionRequest && (
        <PermissionDialog
          request={permissionRequest}
          onAllow={handlePermissionAllow}
          onDeny={handlePermissionDeny}
        />
      )}

      <style>{`
        .app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .app-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: #1976d2;
          color: white;
        }

        .app-header h1 {
          margin: 0;
          font-size: 1.2em;
        }

        .connection-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9em;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .status-dot.connected { background: #4caf50; }
        .status-dot.disconnected { background: #f44336; }

        .app-main {
          flex: 1;
          overflow: hidden;
        }

        .connect-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          text-align: center;
          padding: 20px;
        }

        .connect-prompt h2 {
          margin-bottom: 8px;
        }

        .connect-prompt p {
          color: #666;
        }
      `}</style>
    </div>
  );
};

export default App;
