/**
 * REPL 桥接主逻辑
 */

import { SDKMessage, SDKControlRequest, SDKControlResponse } from '../../shared/protocols';
import { ReplBridgeTransport } from './transport';

// ============ 桥接状态 ============

export type BridgeState =
  | 'idle'          // 空闲，等待连接
  | 'connecting'    // 连接中
  | 'connected'     // 已连接
  | 'reconnecting'  // 重连中
  | 'failed';       // 失败

// ============ 桥接配置 ============

export interface BridgeConfig {
  sessionId: string;
  sessionUrl: string;
  workerJwt: string;
  workerEpoch: number;
  onStateChange?: (state: BridgeState, message?: string) => void;
  onInboundMessage?: (msg: SDKMessage) => void;
  onPermissionResponse?: (response: SDKControlResponse) => void;
  onControlRequest?: (request: SDKControlRequest) => void;
}

// ============ 桥接句柄 ============

export interface ReplBridgeHandle {
  writeMessages(messages: SDKMessage[]): Promise<void>;
  state: BridgeState;
  close(): void;
  flush(): Promise<void>;
}

// ============ UUID 去重集合 ============

export class BoundedUUIDSet {
  private readonly capacity: number;
  private readonly ring: (string | undefined)[];
  private readonly set = new Set<string>();
  private writeIdx = 0;

  constructor(capacity: number = 1000) {
    this.capacity = capacity;
    this.ring = new Array<string | undefined>(capacity);
  }

  add(uuid: string): void {
    if (this.set.has(uuid)) return;

    // 淘汰最老的条目
    const evicted = this.ring[this.writeIdx];
    if (evicted !== undefined) {
      this.set.delete(evicted);
    }

    // 添加新条目
    this.ring[this.writeIdx] = uuid;
    this.set.add(uuid);
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
  }

  has(uuid: string): boolean {
    return this.set.has(uuid);
  }

  clear(): void {
    this.set.clear();
    this.ring.fill(undefined);
    this.writeIdx = 0;
  }
}

// ============ REPL Bridge 实现 ============

export class ReplBridge implements ReplBridgeHandle {
  private transport: ReplBridgeTransport;
  private config: BridgeConfig;
  private _state: BridgeState = 'idle';

  // UUID 去重
  private recentPostedUUIDs = new BoundedUUIDSet();
  private recentInboundUUIDs = new BoundedUUIDSet();

  constructor(config: BridgeConfig, transport: ReplBridgeTransport) {
    this.config = config;
    this.transport = transport;

    // 设置传输层回调
    this.transport.setOnData((data) => this.handleData(data));
    this.transport.setOnClose((code) => this.handleClose(code));
    this.transport.setOnConnect(() => this.handleConnect());
  }

  get state(): BridgeState {
    return this._state;
  }

  private setState(newState: BridgeState, message?: string): void {
    this._state = newState;
    this.config.onStateChange?.(newState, message);
  }

  // 连接
  connect(): void {
    this.setState('connecting');
    this.transport.connect();
  }

  // 发送消息
  async writeMessages(messages: SDKMessage[]): Promise<void> {
    const eligible = messages.filter(msg => this.isEligibleBridgeMessage(msg));

    for (const msg of eligible) {
      this.recentPostedUUIDs.add(msg.uuid);
    }

    await this.transport.writeBatch(eligible);
  }

  // 刷新
  async flush(): Promise<void> {
    await this.transport.flush();
  }

  // 关闭
  close(): void {
    this.transport.close();
    this.setState('idle');
  }

  // 消息过滤
  private isEligibleBridgeMessage(msg: SDKMessage): boolean {
    // 只转发用户消息、AI 回复、系统消息
    return (
      msg.type === 'user' ||
      msg.type === 'assistant' ||
      (msg.type === 'system' && msg.subtype === 'local_command')
    );
  }

  // 处理数据
  private handleData(data: string): void {
    try {
      const parsed = JSON.parse(data);

      // 权限响应
      if (this.isControlResponse(parsed)) {
        this.config.onPermissionResponse?.(parsed);
        return;
      }

      // 控制请求
      if (this.isControlRequest(parsed)) {
        this.config.onControlRequest?.(parsed);
        return;
      }

      // 用户消息
      if (parsed.type === 'user' && parsed.uuid) {
        // 防止回显和重复
        if (this.recentPostedUUIDs.has(parsed.uuid) ||
            this.recentInboundUUIDs.has(parsed.uuid)) {
          return;
        }

        this.recentInboundUUIDs.add(parsed.uuid);
        this.config.onInboundMessage?.(parsed);
      }
    } catch (error) {
      console.error('Failed to handle inbound data:', error);
    }
  }

  // 连接成功
  private handleConnect(): void {
    this.setState('connected');
  }

  // 连接关闭
  private handleClose(code?: number): void {
    if (code === 4090) {
      // Epoch 冲突
      this.setState('failed', 'Connection replaced by another instance');
    } else {
      this.setState('idle');
    }
  }

  // 类型守卫
  private isControlResponse(msg: unknown): msg is SDKControlResponse {
    return typeof msg === 'object' && msg !== null &&
           (msg as Record<string, unknown>).type === 'control_response';
  }

  private isControlRequest(msg: unknown): msg is SDKControlRequest {
    return typeof msg === 'object' && msg !== null &&
           (msg as Record<string, unknown>).type === 'control_request';
  }
}
