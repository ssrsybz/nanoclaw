/**
 * 传输层抽象接口
 */

import { SDKMessage } from '../../shared/protocols';
import { SessionState } from '../../shared/types';

// ============ 传输层接口 ============

export interface ReplBridgeTransport {
  // 发送消息
  write(message: SDKMessage): Promise<void>;
  writeBatch(messages: SDKMessage[]): Promise<void>;

  // 连接管理
  connect(): void;
  close(): void;
  isConnectedStatus(): boolean;
  getStateLabel(): string;

  // 事件回调
  setOnData(callback: (data: string) => void): void;
  setOnClose(callback: (closeCode?: number) => void): void;
  setOnConnect(callback: () => void): void;

  // 状态上报
  reportState(state: SessionState): void;
  reportMetadata(metadata: Record<string, unknown>): void;
  reportDelivery(eventId: string, status: 'processing' | 'processed'): void;

  // 序列号管理 (断线重连)
  getLastSequenceNum(): number;

  // 刷新
  flush(): Promise<void>;
}

// ============ 传输层配置 ============

export interface TransportConfig {
  url: string;
  token: string;
  reconnect?: {
    baseDelayMs: number;
    maxDelayMs: number;
    giveUpMs: number;
  };
  heartbeat?: {
    intervalMs: number;
    ttlMs: number;
  };
}

// ============ 默认配置 ============

export const DEFAULT_TRANSPORT_CONFIG: Required<TransportConfig['reconnect']> &
                                           Required<TransportConfig['heartbeat']> = {
  // 重连配置
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  giveUpMs: 600_000, // 10 分钟

  // 心跳配置
  intervalMs: 20_000,
  ttlMs: 60_000
};

// ============ 传输层状态 ============

export type TransportState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

// ============ SSE 传输实现 ============

export class SSETransport implements ReplBridgeTransport {
  private config: TransportConfig;
  private state: TransportState = 'disconnected';
  private lastSequenceNum = 0;
  private eventSource: EventSource | null = null;

  private onDataCallback?: (data: string) => void;
  private onCloseCallback?: (closeCode?: number) => void;
  private onConnectCallback?: () => void;

  constructor(config: TransportConfig) {
    this.config = config;
  }

  connect(): void {
    this.state = 'connecting';

    const url = new URL(this.config.url);
    if (this.lastSequenceNum > 0) {
      url.searchParams.set('from_sequence_num', this.lastSequenceNum.toString());
    }

    this.eventSource = new EventSource(url.toString(), {
      headers: {
        'Authorization': `Bearer ${this.config.token}`
      }
    } as EventSourceInit);

    this.eventSource.onopen = () => {
      this.state = 'connected';
      this.onConnectCallback?.();
    };

    this.eventSource.onmessage = (event) => {
      this.handleEvent(event);
    };

    this.eventSource.onerror = (error) => {
      this.handleError(error);
    };
  }

  close(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.state = 'disconnected';
  }

  async write(message: SDKMessage): Promise<void> {
    // SSE 是单向的，需要通过 HTTP POST 发送
    await this.postMessage(message);
  }

  async writeBatch(messages: SDKMessage[]): Promise<void> {
    for (const msg of messages) {
      await this.postMessage(msg);
    }
  }

  isConnectedStatus(): boolean {
    return this.state === 'connected';
  }

  getStateLabel(): string {
    return this.state;
  }

  setOnData(callback: (data: string) => void): void {
    this.onDataCallback = callback;
  }

  setOnClose(callback: (closeCode?: number) => void): void {
    this.onCloseCallback = callback;
  }

  setOnConnect(callback: () => void): void {
    this.onConnectCallback = callback;
  }

  reportState(state: SessionState): void {
    // 通过 HTTP POST 上报状态
    this.postState(state);
  }

  reportMetadata(metadata: Record<string, unknown>): void {
    // 通过 HTTP POST 上报元数据
    this.postMetadata(metadata);
  }

  reportDelivery(eventId: string, status: 'processing' | 'processed'): void {
    // 通过 HTTP POST 确认送达
    this.postDelivery(eventId, status);
  }

  getLastSequenceNum(): number {
    return this.lastSequenceNum;
  }

  async flush(): Promise<void> {
    // SSE 没有 flush 概念
  }

  // 私有方法

  private handleEvent(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);

      // 更新序列号
      if (data.sequence_num) {
        this.lastSequenceNum = data.sequence_num;
      }

      this.onDataCallback?.(event.data);
    } catch (error) {
      console.error('Failed to parse SSE event:', error);
    }
  }

  private handleError(error: Event): void {
    console.error('SSE error:', error);

    if (this.eventSource?.readyState === EventSource.CLOSED) {
      this.state = 'disconnected';
      this.onCloseCallback?.();
    } else {
      this.state = 'reconnecting';
    }
  }

  private async postMessage(message: SDKMessage): Promise<void> {
    const response = await fetch(`${this.config.url}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
  }

  private async postState(state: SessionState): Promise<void> {
    await fetch(`${this.config.url}/worker`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(state)
    });
  }

  private async postMetadata(metadata: Record<string, unknown>): Promise<void> {
    await fetch(`${this.config.url}/worker/metadata`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
  }

  private async postDelivery(eventId: string, status: string): Promise<void> {
    await fetch(`${this.config.url}/worker/events/delivery`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ event_id: eventId, status })
    });
  }
}
