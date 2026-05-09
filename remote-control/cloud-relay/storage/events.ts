/**
 * 事件存储服务
 */

// 内存存储实现
class EventStorage {
  private events: Map<string, StoredEvent[]> = new Map();
  private maxEventsPerSession = 10000;

  // 添加事件
  addEvent(sessionId: string, event: Omit<StoredEvent, 'event_id' | 'sequence_num' | 'created_at'>): StoredEvent {
    const sessionEvents = this.events.get(sessionId) || [];

    const storedEvent: StoredEvent = {
      ...event,
      event_id: this.generateEventId(),
      sequence_num: sessionEvents.length + 1,
      created_at: new Date().toISOString()
    };

    sessionEvents.push(storedEvent);

    // 限制事件数量
    if (sessionEvents.length > this.maxEventsPerSession) {
      sessionEvents.shift();
    }

    this.events.set(sessionId, sessionEvents);
    return storedEvent;
  }

  // 获取事件
  getEvents(sessionId: string, fromSequenceNum?: number): StoredEvent[] {
    const sessionEvents = this.events.get(sessionId) || [];

    if (fromSequenceNum !== undefined) {
      return sessionEvents.filter(e => e.sequence_num > fromSequenceNum);
    }

    return sessionEvents;
  }

  // 获取单个事件
  getEvent(sessionId: string, eventId: string): StoredEvent | undefined {
    const sessionEvents = this.events.get(sessionId) || [];
    return sessionEvents.find(e => e.event_id === eventId);
  }

  // 更新事件状态
  updateEventStatus(sessionId: string, eventId: string, status: StoredEvent['delivery_status']): boolean {
    const sessionEvents = this.events.get(sessionId) || [];
    const event = sessionEvents.find(e => e.event_id === eventId);

    if (event) {
      event.delivery_status = status;
      return true;
    }

    return false;
  }

  // 清理会话事件
  clearSessionEvents(sessionId: string): void {
    this.events.delete(sessionId);
  }

  // 获取最新序列号
  getLastSequenceNum(sessionId: string): number {
    const sessionEvents = this.events.get(sessionId) || [];
    return sessionEvents.length > 0 ? sessionEvents[sessionEvents.length - 1].sequence_num : 0;
  }

  // 生成事件 ID
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// 导出单例
export const eventStorage = new EventStorage();

// 类型定义
export interface StoredEvent {
  event_id: string;
  sequence_num: number;
  event_type: string;
  source: 'user' | 'assistant' | 'system';
  payload: Record<string, unknown>;
  created_at: string;
  delivery_status: 'pending' | 'delivered' | 'processed';
}
