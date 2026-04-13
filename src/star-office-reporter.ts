/**
 * Star Office UI 状态报告模块
 * 将 NanoClaw 的工作状态实时推送到 Star Office UI
 */

import { logger } from './logger.js';

const STAR_OFFICE_URL = process.env.STAR_OFFICE_URL || 'http://localhost:19000';
const AGENT_NAME = process.env.STAR_OFFICE_AGENT_NAME || 'NanoClaw';

// 状态映射：NanoClaw 状态 -> Star Office 状态
const STATUS_MAP: Record<string, string> = {
  idle: 'idle',
  writing: 'writing',
  researching: 'researching',
  executing: 'executing',
  syncing: 'syncing',
  error: 'error',
};

let lastStatus: string = 'idle';
let lastUpdate: number = 0;

/**
 * 推送状态到 Star Office UI
 */
export async function pushStatus(
  status: string,
  message?: string,
): Promise<void> {
  const mappedStatus = STATUS_MAP[status] || 'idle';
  const now = Date.now();

  // 避免频繁更新（至少间隔 2 秒）
  if (mappedStatus === lastStatus && now - lastUpdate < 2000) {
    return;
  }

  const payload = {
    agent: AGENT_NAME,
    status: mappedStatus,
    message: message || getDefaultMessage(mappedStatus),
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(`${STAR_OFFICE_URL}/set_state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      lastStatus = mappedStatus;
      lastUpdate = now;
      logger.debug({ status: mappedStatus }, 'Star Office status updated');
    } else {
      logger.warn(
        { status: response.status, statusText: response.statusText },
        'Failed to update Star Office status',
      );
    }
  } catch (err) {
    // 静默失败，不影响主流程
    logger.debug({ err }, 'Star Office connection failed (may not be running)');
  }
}

/**
 * 获取默认状态消息
 */
function getDefaultMessage(status: string): string {
  const messages: Record<string, string> = {
    idle: '待命中...',
    writing: '正在整理回复...',
    researching: '正在搜索信息...',
    executing: '正在执行任务...',
    syncing: '正在同步数据...',
    error: '遇到问题，排查中...',
  };
  return messages[status] || '工作中...';
}

/**
 * 包装任务执行，自动推送状态
 */
export async function withStatus<T>(
  status: string,
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  await pushStatus(status, message);
  try {
    const result = await fn();
    await pushStatus('idle', '任务完成');
    return result;
  } catch (err) {
    await pushStatus('error', '任务执行出错');
    throw err;
  }
}

/**
 * 初始化状态报告
 */
export function initStatusReporter(): void {
  pushStatus('idle', '系统已启动');
  logger.info({ url: STAR_OFFICE_URL }, 'Star Office UI reporter initialized');
}
