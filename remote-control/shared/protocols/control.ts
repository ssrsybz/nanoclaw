/**
 * 通信协议 - 控制协议
 */

// ============ 控制请求类型 ============

export interface ControlRequestBase {
  type: 'control_request';
  request_id: string;
  timestamp?: string;
}

export interface InitializeRequest extends ControlRequestBase {
  subtype: 'initialize';
  config?: Record<string, unknown>;
}

export interface SetModelRequest extends ControlRequestBase {
  subtype: 'set_model';
  model: string;
}

export interface InterruptRequest extends ControlRequestBase {
  subtype: 'interrupt';
}

export interface SetPermissionModeRequest extends ControlRequestBase {
  subtype: 'set_permission_mode';
  mode: 'auto' | 'interactive' | 'ask_once';
}

export interface CanUseToolRequest extends ControlRequestBase {
  subtype: 'can_use_tool';
  tool_name: string;
  tool_use_id: string;
  input: Record<string, unknown>;
  title?: string;
  description?: string;
  agent_id?: string;
}

// ============ 控制请求联合类型 ============

export type SDKControlRequest =
  | InitializeRequest
  | SetModelRequest
  | InterruptRequest
  | SetPermissionModeRequest
  | CanUseToolRequest;

// ============ 控制响应类型 ============

export interface SDKControlResponse {
  type: 'control_response';
  response: {
    subtype: 'success' | 'error';
    request_id: string;
    response?: Record<string, unknown>;
    error?: string;
  };
}

// ============ 类型守卫 ============

export function isSDKControlRequest(msg: unknown): msg is SDKControlRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'control_request' && typeof m.subtype === 'string';
}

export function isSDKControlResponse(msg: unknown): msg is SDKControlResponse {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m.type === 'control_response';
}

export function isInitializeRequest(req: SDKControlRequest): req is InitializeRequest {
  return req.subtype === 'initialize';
}

export function isSetModelRequest(req: SDKControlRequest): req is SetModelRequest {
  return req.subtype === 'set_model';
}

export function isInterruptRequest(req: SDKControlRequest): req is InterruptRequest {
  return req.subtype === 'interrupt';
}

export function isSetPermissionModeRequest(req: SDKControlRequest): req is SetPermissionModeRequest {
  return req.subtype === 'set_permission_mode';
}

export function isCanUseToolRequest(req: SDKControlRequest): req is CanUseToolRequest {
  return req.subtype === 'can_use_tool';
}
