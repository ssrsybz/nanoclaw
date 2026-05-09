/**
 * 权限控制服务
 */

import { PermissionBehavior, PermissionRequest, PermissionResponse, PermissionUpdate } from '../../shared/protocols/permission';

// 权限控制器
export class PermissionController {
  private pendingRequests: Map<string, PermissionRequest> = new Map();
  private onPermissionCallback?: (request: PermissionRequest) => void;
  private savedPermissions: Map<string, PermissionBehavior> = new Map();

  // 处理权限请求
  handlePermissionRequest(request: PermissionRequest): void {
    // 检查是否有保存的权限
    const savedBehavior = this.savedPermissions.get(request.tool_name);
    if (savedBehavior) {
      this.respond(request.request_id, savedBehavior);
      return;
    }

    // 添加到待处理队列
    this.pendingRequests.set(request.request_id, request);

    // 通知 UI 显示权限弹窗
    this.onPermissionCallback?.(request);
  }

  // 响应权限请求
  respond(requestId: string, behavior: PermissionBehavior, update?: PermissionUpdate): PermissionResponse {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error('Permission request not found');
    }

    // 从待处理队列移除
    this.pendingRequests.delete(requestId);

    // 如果用户选择记住，保存权限
    if (update?.remember) {
      this.savedPermissions.set(request.tool_name, behavior);
    }

    return {
      request_id: requestId,
      behavior,
      update
    };
  }

  // 获取待处理的请求
  getPendingRequests(): PermissionRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  // 获取单个待处理请求
  getPendingRequest(requestId: string): PermissionRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  // 设置权限回调
  setOnPermission(callback: (request: PermissionRequest) => void): void {
    this.onPermissionCallback = callback;
  }

  // 清除保存的权限
  clearSavedPermissions(): void {
    this.savedPermissions.clear();
  }

  // 获取保存的权限
  getSavedPermissions(): Map<string, PermissionBehavior> {
    return new Map(this.savedPermissions);
  }
}

// 导出单例
export const permissionController = new PermissionController();
