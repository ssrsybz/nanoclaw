/**
 * 传输层服务
 */

import { SDKMessage, SDKControlResponse } from '../../shared/protocols';
import { PermissionResponse } from '../../shared/protocols/permission';
import { sessionManager } from './SessionManager';
import { messageHandler } from './MessageHandler';
import { permissionController } from './PermissionController';

// 传输层配置
export interface TransportConfig {
  baseUrl: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

// 传输层服务
export class Transport {
  private config: TransportConfig;
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(config: TransportConfig) {
    this.config = config;
  }

  // 连接 WebSocket
  connectWebSocket(url: string): void {
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      this.config.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      this.config.onDisconnect?.();
      this.attemptReconnect(url);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.config.onError?.(new Error('WebSocket error'));
    };
  }

  // 连接 SSE
  connectSSE(url: string): void {
    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      console.log('SSE connected');
      this.reconnectAttempts = 0;
      this.config.onConnect?.();
    };

    this.eventSource.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      this.config.onError?.(new Error('SSE error'));
    };
  }

  // 发送消息
  send(sessionId: string, content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message = {
      type: 'user',
      uuid: this.generateUUID(),
      session_id: sessionId,
      content
    };

    this.ws.send(JSON.stringify(message));
  }

  // 发送权限响应
  sendPermissionResponse(response: PermissionResponse): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const message: SDKControlResponse = {
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: response.request_id,
        response: {
          behavior: response.behavior,
          update: response.update
        }
      }
    };

    this.ws.send(JSON.stringify(message));
  }

  // 断开连接
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  // 是否已连接
  isConnected(): boolean {
    return (this.ws?.readyState === WebSocket.OPEN) ||
           (this.eventSource?.readyState === EventSource.OPEN);
  }

  // 私有方法
  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as SDKMessage;

      if (msg.session_id) {
        messageHandler.handleInbound(msg.session_id, msg);
      }
    } catch (error) {
      console.error('Failed to parse message:', error);
    }
  }

  private attemptReconnect(url: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      if (this.ws) {
        this.connectWebSocket(url);
      }
    }, delay);
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// 导出工厂函数
export function createTransport(config: TransportConfig): Transport {
  return new Transport(config);
}
