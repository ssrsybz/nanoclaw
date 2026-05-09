/**
 * 断线重连与容错机制
 */

// ============ 重连配置 ============

export interface ReconnectConfig {
  // 基础延迟
  baseDelayMs: number;
  // 最大延迟
  maxDelayMs: number;
  // 放弃时间
  giveUpMs: number;
  // 最大尝试次数
  maxAttempts: number;
  // 抖动范围 (0-1)
  jitter: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  giveUpMs: 600_000, // 10 分钟
  maxAttempts: 100,
  jitter: 0.3
};

// ============ 重连状态 ============

export interface ReconnectState {
  attempt: number;
  totalDelayMs: number;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  gaveUp: boolean;
}

// ============ 重连管理器 ============

export class ReconnectManager {
  private config: ReconnectConfig;
  private state: ReconnectState;
  private timeoutId: NodeJS.Timeout | null = null;
  private onReconnectCallback?: () => Promise<boolean>;
  private onGiveUpCallback?: () => void;
  private onStateChangeCallback?: (state: ReconnectState) => void;

  constructor(config: Partial<ReconnectConfig> = {}) {
    this.config = { ...DEFAULT_RECONNECT_CONFIG, ...config };
    this.state = {
      attempt: 0,
      totalDelayMs: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      gaveUp: false
    };
  }

  // 开始重连
  startReconnect(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.state.gaveUp = false;
    this.scheduleReconnect();
  }

  // 停止重连
  stopReconnect(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.state.nextAttemptAt = null;
  }

  // 重置状态
  reset(): void {
    this.stopReconnect();
    this.state = {
      attempt: 0,
      totalDelayMs: 0,
      lastAttemptAt: null,
      nextAttemptAt: null,
      gaveUp: false
    };
    this.onStateChangeCallback?.(this.state);
  }

  // 设置回调
  setOnReconnect(callback: () => Promise<boolean>): void {
    this.onReconnectCallback = callback;
  }

  setOnGiveUp(callback: () => void): void {
    this.onGiveUpCallback = callback;
  }

  setOnStateChange(callback: (state: ReconnectState) => void): void {
    this.onStateChangeCallback = callback;
  }

  // 获取状态
  getState(): ReconnectState {
    return { ...this.state };
  }

  // 私有方法
  private scheduleReconnect(): void {
    const delay = this.calculateDelay();

    // 检查是否应该放弃
    if (this.state.totalDelayMs + delay > this.config.giveUpMs ||
        this.state.attempt >= this.config.maxAttempts) {
      this.state.gaveUp = true;
      this.onGiveUpCallback?.();
      this.onStateChangeCallback?.(this.state);
      return;
    }

    this.state.nextAttemptAt = new Date(Date.now() + delay);
    this.onStateChangeCallback?.(this.state);

    this.timeoutId = setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }

  private async attemptReconnect(): Promise<void> {
    this.state.attempt++;
    this.state.lastAttemptAt = new Date();

    try {
      const success = await this.onReconnectCallback?.() ?? false;

      if (success) {
        // 重连成功，重置状态
        this.reset();
        return;
      }
    } catch (error) {
      console.error('Reconnect attempt failed:', error);
    }

    // 计算已用时间
    this.state.totalDelayMs += this.calculateDelay();

    // 继续下一次尝试
    this.scheduleReconnect();
  }

  private calculateDelay(): number {
    // 指数退避
    const exponentialDelay = this.config.baseDelayMs *
      Math.pow(2, this.state.attempt);

    // 限制最大延迟
    let delay = Math.min(exponentialDelay, this.config.maxDelayMs);

    // 添加抖动
    const jitterAmount = delay * this.config.jitter;
    delay += (Math.random() - 0.5) * 2 * jitterAmount;

    return Math.floor(delay);
  }
}

// ============ 心跳管理 ============

export interface HeartbeatConfig {
  // 心跳间隔
  intervalMs: number;
  // 超时时间
  timeoutMs: number;
  // 最大重试次数
  maxRetries: number;
}

export const DEFAULT_HEARTBEAT_CONFIG: HeartbeatConfig = {
  intervalMs: 20_000,
  timeoutMs: 60_000,
  maxRetries: 3
};

export class HeartbeatManager {
  private config: HeartbeatConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private heartbeatInFlight = false;
  private consecutiveFailures = 0;
  private sendHeartbeatCallback?: () => Promise<void>;
  private onTimeoutCallback?: () => void;

  constructor(config: Partial<HeartbeatConfig> = {}) {
    this.config = { ...DEFAULT_HEARTBEAT_CONFIG, ...config };
  }

  // 启动心跳
  start(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.consecutiveFailures = 0;
    this.intervalId = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.intervalMs);
  }

  // 停止心跳
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // 设置回调
  setSendHeartbeat(callback: () => Promise<void>): void {
    this.sendHeartbeatCallback = callback;
  }

  setOnTimeout(callback: () => void): void {
    this.onTimeoutCallback = callback;
  }

  // 私有方法
  private async sendHeartbeat(): Promise<void> {
    if (this.heartbeatInFlight) return;

    this.heartbeatInFlight = true;

    try {
      await this.sendHeartbeatCallback?.();
      this.consecutiveFailures = 0;
    } catch (error) {
      console.error('Heartbeat failed:', error);
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.config.maxRetries) {
        this.onTimeoutCallback?.();
      }
    } finally {
      this.heartbeatInFlight = false;
    }
  }
}

// ============ 序列号恢复 ============

export interface SequenceManager {
  // 获取最后序列号
  getLastSequenceNum(): number;
  // 设置最后序列号
  setLastSequenceNum(num: number): void;
  // 重置
  reset(): void;
}

export class SequenceNumberManager implements SequenceManager {
  private lastSequenceNum = 0;

  getLastSequenceNum(): number {
    return this.lastSequenceNum;
  }

  setLastSequenceNum(num: number): void {
    if (num > this.lastSequenceNum) {
      this.lastSequenceNum = num;
    }
  }

  reset(): void {
    this.lastSequenceNum = 0;
  }
}
