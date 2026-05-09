/**
 * 共享类型定义
 * 用于手机端、电脑终端服务、云服务器中继
 */

// ============ 内容块类型 ============

export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock

export interface TextBlock {
  type: 'text'
  text: string
}

export interface ToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id: string
  content: string | ContentBlock[]
  is_error?: boolean
}

// ============ 使用统计 ============

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// ============ 会话状态 ============

export type SessionStatus = 'idle' | 'active' | 'busy' | 'error'

export interface SessionState {
  session_id: string
  status: SessionStatus
  model?: string
  last_activity?: Date
  metadata?: Record<string, unknown>
}

// ============ 环境信息 ============

export interface EnvironmentInfo {
  environment_id: string
  environment_secret: string
  machine_name?: string
  branch?: string
  git_repo_url?: string
  metadata?: Record<string, unknown>
}

// ============ Worker 状态 ============

export interface WorkerState {
  worker_epoch: number
  worker_status: 'idle' | 'busy'
  last_heartbeat: Date
}
