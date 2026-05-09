/**
 * 会话管理服务
 */

import { SessionStatus } from '../../shared/types';

// 会话状态
export interface MobileSession {
  sessionId: string;
  environmentId: string;
  title: string;
  status: SessionStatus;
  lastActivity: Date;
  messages: Message[];
}

export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

// 会话管理器
export class SessionManager {
  private sessions: Map<string, MobileSession> = new Map();
  private currentSessionId: string | null = null;

  // 创建会话
  createSession(environmentId: string, title: string): MobileSession {
    const sessionId = this.generateSessionId();
    const session: MobileSession = {
      sessionId,
      environmentId,
      title,
      status: 'idle',
      lastActivity: new Date(),
      messages: []
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  // 获取会话
  getSession(sessionId: string): MobileSession | undefined {
    return this.sessions.get(sessionId);
  }

  // 获取所有会话
  getAllSessions(): MobileSession[] {
    return Array.from(this.sessions.values());
  }

  // 设置当前会话
  setCurrentSession(sessionId: string): void {
    if (this.sessions.has(sessionId)) {
      this.currentSessionId = sessionId;
    }
  }

  // 获取当前会话
  getCurrentSession(): MobileSession | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }

  // 更新会话状态
  updateSessionStatus(sessionId: string, status: SessionStatus): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActivity = new Date();
    }
  }

  // 添加消息
  addMessage(sessionId: string, message: Omit<Message, 'id' | 'timestamp'>): Message {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const newMessage: Message = {
      id: this.generateMessageId(),
      ...message,
      timestamp: new Date()
    };

    session.messages.push(newMessage);
    session.lastActivity = new Date();

    return newMessage;
  }

  // 获取消息
  getMessages(sessionId: string): Message[] {
    const session = this.sessions.get(sessionId);
    return session?.messages || [];
  }

  // 删除会话
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = null;
    }
  }

  // 清空所有会话
  clearAllSessions(): void {
    this.sessions.clear();
    this.currentSessionId = null;
  }

  // 生成 ID
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// 导出单例
export const sessionManager = new SessionManager();
