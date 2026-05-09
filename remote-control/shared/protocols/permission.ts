/**
 * 通信协议 - 权限协议
 */

// ============ 权限行为类型 ============

export type PermissionBehavior = 'allow' | 'deny';

// ============ 权限更新类型 ============

export interface PermissionUpdate {
  scope: 'session' | 'environment' | 'global';
  remember: boolean;
  duration?: number; // 秒
}

// ============ 权限请求 ============

export interface PermissionRequest {
  request_id: string;
  tool_name: string;
  tool_use_id: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  agent_id?: string;
  risk_level?: 'low' | 'medium' | 'high';
  context?: {
    file_path?: string;
    command?: string;
    url?: string;
  };
}

// ============ 权限响应 ============

export interface PermissionResponse {
  request_id: string;
  behavior: PermissionBehavior;
  update?: PermissionUpdate;
  reason?: string;
}

// ============ 权限规则 ============

export interface PermissionRule {
  id: string;
  tool_name: string;
  pattern?: RegExp | string;
  behavior: PermissionBehavior;
  scope: 'session' | 'environment' | 'global';
  created_at: Date;
  expires_at?: Date;
}

// ============ 权限状态 ============

export interface PermissionState {
  mode: 'auto' | 'interactive' | 'ask_once';
  pending_requests: PermissionRequest[];
  rules: PermissionRule[];
}

// ============ 工具权限配置 ============

export const TOOL_PERMISSIONS: Record<string, {
  risk_level: 'low' | 'medium' | 'high';
  description: string;
  requires_confirmation: boolean;
}> = {
  Read: {
    risk_level: 'low',
    description: 'Read file contents',
    requires_confirmation: false
  },
  Write: {
    risk_level: 'high',
    description: 'Write or modify files',
    requires_confirmation: true
  },
  Edit: {
    risk_level: 'medium',
    description: 'Edit existing files',
    requires_confirmation: true
  },
  Bash: {
    risk_level: 'high',
    description: 'Execute shell commands',
    requires_confirmation: true
  },
  WebFetch: {
    risk_level: 'low',
    description: 'Fetch web content',
    requires_confirmation: false
  },
  WebSearch: {
    risk_level: 'low',
    description: 'Search the web',
    requires_confirmation: false
  },
  Agent: {
    risk_level: 'medium',
    description: 'Spawn sub-agents',
    requires_confirmation: true
  }
};

// ============ 辅助函数 ============

export function shouldRequestPermission(
  tool_name: string,
  mode: 'auto' | 'interactive' | 'ask_once'
): boolean {
  if (mode === 'auto') return false;

  const toolConfig = TOOL_PERMISSIONS[tool_name];
  if (!toolConfig) return true; // 未知工具需要确认

  return toolConfig.requires_confirmation;
}

export function checkPermissionRule(
  rules: PermissionRule[],
  tool_name: string,
  input: Record<string, unknown>
): PermissionBehavior | null {
  const now = new Date();

  for (const rule of rules) {
    if (rule.tool_name !== tool_name) continue;
    if (rule.expires_at && rule.expires_at < now) continue;

    if (rule.pattern) {
      const inputStr = JSON.stringify(input);
      if (typeof rule.pattern === 'string') {
        if (inputStr.includes(rule.pattern)) {
          return rule.behavior;
        }
      } else {
        if (rule.pattern.test(inputStr)) {
          return rule.behavior;
        }
      }
    } else {
      return rule.behavior;
    }
  }

  return null;
}
