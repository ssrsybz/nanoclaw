/**
 * 通信协议 - 消息类型定义
 */

import { ContentBlock, Usage } from '../types';

// ============ 基础消息类型 ============

export interface BaseMessage {
  uuid: string;
  session_id?: string;
  timestamp?: string;
}

// ============ 用户消息 ============

export interface SDKUserMessage extends BaseMessage {
  type: 'user';
  content: string | ContentBlock[];
}

// ============ AI 回复消息 ============

export interface SDKAssistantMessage extends BaseMessage {
  type: 'assistant';
  content: ContentBlock[];
  message: {
    id: string;  // API 消息 ID (msg_xxx)
  };
}

// ============ 流式事件 ============

export interface SDKStreamEvent extends BaseMessage {
  type: 'stream_event';
  event: {
    type: 'content_block_delta' | 'content_block_start' | 'content_block_stop' | 'message_start' | 'message_delta' | 'message_stop';
    index?: number;
    delta?: {
      type: 'text_delta' | 'input_json_delta';
      text?: string;
      partial_json?: string;
    };
    content_block?: ContentBlock;
    message?: {
      id: string;
      content: ContentBlock[];
    };
  };
}

// ============ 结果消息 ============

export interface SDKResultMessage extends BaseMessage {
  type: 'result';
  subtype: 'success' | 'error';
  duration_ms: number;
  total_cost_usd: number;
  usage: Usage;
  error?: {
    type: string;
    message: string;
  };
}

// ============ 系统消息 ============

export interface SDKSystemMessage extends BaseMessage {
  type: 'system';
  subtype: 'local_command' | 'permission_request' | 'permission_response' | 'error';
  content?: string;
  data?: Record<string, unknown>;
}

// ============ 联合类型 ============

export type SDKMessage =
  | SDKUserMessage
  | SDKAssistantMessage
  | SDKStreamEvent
  | SDKResultMessage
  | SDKSystemMessage;

// ============ 类型守卫 ============

export function isSDKUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  return msg.type === 'user';
}

export function isSDKAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === 'assistant';
}

export function isSDKStreamEvent(msg: SDKMessage): msg is SDKStreamEvent {
  return msg.type === 'stream_event';
}

export function isSDKResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === 'result';
}

export function isSDKSystemMessage(msg: SDKMessage): msg is SDKSystemMessage {
  return msg.type === 'system';
}
