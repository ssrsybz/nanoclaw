/**
 * 消息处理服务
 */

import { SDKMessage, SDKUserMessage, SDKAssistantMessage, SDKStreamEvent } from '../../shared/protocols';
import { sessionManager, Message } from './SessionManager';

// 入站消息类型
type MobileInboundMessage =
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKStreamEvent;

// 出站消息类型
export interface MobileOutboundMessage {
  type: 'user' | 'control_response' | 'control_request';
  content?: string;
  response?: Record<string, unknown>;
  subtype?: string;
}

// 消息处理器
export class MessageHandler {
  private onMessageCallback?: (sessionId: string, message: Message) => void;
  private onStreamCallback?: (sessionId: string, content: string) => void;

  // 处理入站消息
  handleInbound(sessionId: string, msg: SDKMessage): void {
    switch (msg.type) {
      case 'user':
        this.handleUserMessage(sessionId, msg);
        break;
      case 'assistant':
        this.handleAssistantMessage(sessionId, msg);
        break;
      case 'stream_event':
        this.handleStreamEvent(sessionId, msg);
        break;
      case 'result':
        this.handleResultMessage(sessionId, msg);
        break;
      case 'system':
        this.handleSystemMessage(sessionId, msg);
        break;
    }
  }

  // 构建出站消息
  buildOutbound(content: string): MobileOutboundMessage {
    return {
      type: 'user',
      content
    };
  }

  // 设置回调
  setOnMessage(callback: (sessionId: string, message: Message) => void): void {
    this.onMessageCallback = callback;
  }

  setOnStream(callback: (sessionId: string, content: string) => void): void {
    this.onStreamCallback = callback;
  }

  // 私有方法
  private handleUserMessage(sessionId: string, msg: SDKUserMessage): void {
    const content = typeof msg.content === 'string'
      ? msg.content
      : JSON.stringify(msg.content);

    const message = sessionManager.addMessage(sessionId, {
      type: 'user',
      content
    });

    this.onMessageCallback?.(sessionId, message);
  }

  private handleAssistantMessage(sessionId: string, msg: SDKAssistantMessage): void {
    const content = msg.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('\n');

    const message = sessionManager.addMessage(sessionId, {
      type: 'assistant',
      content
    });

    this.onMessageCallback?.(sessionId, message);
  }

  private handleStreamEvent(sessionId: string, msg: SDKStreamEvent): void {
    if (msg.event.type === 'content_block_delta' && msg.event.delta?.text) {
      this.onStreamCallback?.(sessionId, msg.event.delta.text);
    }
  }

  private handleResultMessage(sessionId: string, msg: { type: 'result'; subtype: string; duration_ms?: number }): void {
    sessionManager.updateSessionStatus(
      sessionId,
      msg.subtype === 'success' ? 'idle' : 'error'
    );
  }

  private handleSystemMessage(sessionId: string, msg: { type: 'system'; subtype: string; content?: string }): void {
    const message = sessionManager.addMessage(sessionId, {
      type: 'system',
      content: msg.content || `[System: ${msg.subtype}]`
    });

    this.onMessageCallback?.(sessionId, message);
  }
}

// 导出单例
export const messageHandler = new MessageHandler();
