/**
 * 启动台频道
 * 提供 HTTP API 和 WebSocket 实时更新
 */

import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { registerChannel } from './registry.js';
import { logger } from '../logger.js';
import { appScanner } from './launchpad/scanner.js';
import { appLauncher } from './launchpad/launcher.js';
import {
  getAllLaunchpadApps,
  getLaunchpadApp,
  upsertLaunchpadApp,
  updateLaunchpadApp,
  deleteLaunchpadApp,
  getLaunchpadLayout,
  updateLaunchpadLayout,
  getLaunchpadCategories,
  searchLaunchpadApps,
  type LaunchpadAppRow,
} from '../db.js';
import type {
  Channel,
  OnInboundMessage,
  OnChatMetadata,
  RegisteredGroup,
} from '../types.js';
import type { LaunchpadItem, LaunchpadLayout, LaunchpadWSMessage } from './launchpad/types.js';

const PORT = 3101;

export interface LaunchpadChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

export class LaunchpadChannel implements Channel {
  name = 'launchpad';

  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private opts: LaunchpadChannelOpts;
  private clients = new Set<WebSocket>();
  private _connected = false;

  constructor(opts: LaunchpadChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // 创建 HTTP 服务器
    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // 创建 WebSocket 服务器
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.info('Launchpad WebSocket client connected');

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        logger.warn({ err }, 'Launchpad WebSocket error');
        this.clients.delete(ws);
      });
    });

    // 启动服务器
    return new Promise((resolve) => {
      this.httpServer!.listen(PORT, () => {
        this._connected = true;
        logger.info({ port: PORT }, 'Launchpad channel started');
        resolve();
      });
    });
  }

  // Channel 接口要求的方法（启动台不需要消息发送功能）
  async sendMessage(_jid: string, _text: string): Promise<void> {
    // 启动台频道不支持发送消息
  }

  isConnected(): boolean {
    return this._connected;
  }

  ownsJid(_jid: string): boolean {
    return false; // 启动台不拥有任何 JID
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    if (this.wss) {
      for (const client of this.clients) {
        client.close();
      }
      this.wss.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    // CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // ===== 应用管理 API =====

      // GET /api/launchpad/apps - 获取应用列表
      if (pathname === '/api/launchpad/apps' && method === 'GET') {
        const kind = url.searchParams.get('kind') || undefined;
        const category = url.searchParams.get('category') || undefined;
        const includeHidden = url.searchParams.get('includeHidden') === 'true';

        const rows = getAllLaunchpadApps({ kind, category, includeHidden });
        const apps = rows.map(this.rowToItem);

        this.sendJson(res, 200, { apps });
        return;
      }

      // POST /api/launchpad/apps - 添加自定义应用
      if (pathname === '/api/launchpad/apps' && method === 'POST') {
        const body = await this.readBody(req);
        const app = body as Partial<LaunchpadItem>;

        if (!app.name || !app.path || !app.kind) {
          this.sendError(res, 400, 'Missing required fields: name, path, kind');
          return;
        }

        const id = app.id || `custom-${Date.now()}`;
        upsertLaunchpadApp({ ...app, id } as LaunchpadItem);

        this.broadcast({ type: 'apps_updated', apps: getAllLaunchpadApps().map(this.rowToItem) });
        this.sendJson(res, 201, { app: { ...app, id } });
        return;
      }

      // GET/PUT/DELETE /api/launchpad/apps/:id
      const appMatch = pathname.match(/^\/api\/launchpad\/apps\/([^/]+)$/);
      if (appMatch) {
        const appId = appMatch[1];
        const row = getLaunchpadApp(appId);

        if (!row) {
          this.sendError(res, 404, 'App not found');
          return;
        }

        if (method === 'GET') {
          this.sendJson(res, 200, { app: this.rowToItem(row) });
        } else if (method === 'PUT') {
          const body = await this.readBody(req);
          updateLaunchpadApp(appId, body as Partial<LaunchpadItem>);
          this.sendJson(res, 200, { ok: true });
        } else if (method === 'DELETE') {
          deleteLaunchpadApp(appId);
          this.broadcast({ type: 'app_uninstalled', appId });
          this.sendJson(res, 200, { ok: true });
        }
        return;
      }

      // ===== 启动 API =====

      // POST /api/launchpad/launch - 启动应用
      if (pathname === '/api/launchpad/launch' && method === 'POST') {
        const body = await this.readBody(req);
        const result = await appLauncher.launch({
          appId: body.appId as string | undefined,
          name: body.name as string | undefined,
          path: body.path as string | undefined,
          args: body.args as string[] | undefined,
        });

        if (result.success) {
          this.broadcast({ type: 'app_launched', appId: body.appId as string, appName: result.appName || '' });
        }

        this.sendJson(res, 200, result);
        return;
      }

      // ===== 扫描 API =====

      // POST /api/launchpad/scan - 触发扫描
      if (pathname === '/api/launchpad/scan' && method === 'POST') {
        this.broadcast({ type: 'scan_started' });

        const body = await this.readBody(req).catch(() => ({})) as Record<string, unknown>;
        const directories = (body.directories as string[] | undefined);

        const result = await appScanner.scanAll(directories);

        // 更新数据库
        for (const app of result.items) {
          upsertLaunchpadApp(app);
        }

        this.broadcast({
          type: 'apps_updated',
          apps: getAllLaunchpadApps().map(this.rowToItem),
        });
        this.broadcast({ type: 'scan_completed', count: result.items.length });

        this.sendJson(res, 200, {
          count: result.items.length,
          errors: result.errors,
          duration: result.duration,
        });
        return;
      }

      // ===== 布局 API =====

      // GET /api/launchpad/layout - 获取布局配置
      if (pathname === '/api/launchpad/layout' && method === 'GET') {
        const layout = getLaunchpadLayout();
        this.sendJson(res, 200, { layout });
        return;
      }

      // PUT /api/launchpad/layout - 更新布局配置
      if (pathname === '/api/launchpad/layout' && method === 'PUT') {
        const body = await this.readBody(req);
        updateLaunchpadLayout(body as Partial<LaunchpadLayout>);
        this.sendJson(res, 200, { ok: true });
        return;
      }

      // ===== 搜索 API =====

      // GET /api/launchpad/search - 搜索应用
      if (pathname === '/api/launchpad/search' && method === 'GET') {
        const query = url.searchParams.get('q') || '';
        const limit = parseInt(url.searchParams.get('limit') || '50');

        const rows = searchLaunchpadApps(query, limit);
        const results = rows.map(this.rowToItem);

        this.sendJson(res, 200, { results });
        return;
      }

      // ===== 分类 API =====

      // GET /api/launchpad/categories - 获取分类列表
      if (pathname === '/api/launchpad/categories' && method === 'GET') {
        const categories = getLaunchpadCategories();
        this.sendJson(res, 200, { categories });
        return;
      }

      // ===== 图标 API =====

      // GET /api/launchpad/apps/:id/icon - 获取应用图标
      const iconMatch = pathname.match(/^\/api\/launchpad\/apps\/([^/]+)\/icon$/);
      if (iconMatch && method === 'GET') {
        const row = getLaunchpadApp(iconMatch[1]);
        if (!row || !row.icon) {
          // 返回默认图标
          this.sendDefaultIcon(res, row);
          return;
        }

        // 返回图标文件
        try {
          const fs = await import('fs');
          const iconPath = row.icon;

          if (fs.existsSync(iconPath)) {
            const stat = fs.statSync(iconPath);
            const ext = iconPath.toLowerCase().slice(-4);

            // 设置正确的 Content-Type
            let contentType = 'image/png';
            if (ext === '.svg') {
              contentType = 'image/svg+xml';
            } else if (ext === '.jpg' || ext === 'jpeg') {
              contentType = 'image/jpeg';
            } else if (ext === '.gif') {
              contentType = 'image/gif';
            } else if (ext === 'webp') {
              contentType = 'image/webp';
            }

            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stat.size);
            res.setHeader('Cache-Control', 'public, max-age=86400'); // 缓存 1 天
            fs.createReadStream(iconPath).pipe(res);
            return;
          }
        } catch {
          // 忽略错误
        }

        // 图标文件不存在，返回默认图标
        this.sendDefaultIcon(res, row);
        return;
      }

      // ===== 收藏 API =====

      // POST /api/launchpad/apps/:id/pin - 收藏应用
      const pinMatch = pathname.match(/^\/api\/launchpad\/apps\/([^/]+)\/pin$/);
      if (pinMatch && method === 'POST') {
        const appId = pinMatch[1];
        const row = getLaunchpadApp(appId);
        if (!row) {
          this.sendError(res, 404, 'App not found');
          return;
        }
        updateLaunchpadApp(appId, { pinned: true } as Partial<LaunchpadItem>);
        this.broadcast({ type: 'apps_updated', apps: getAllLaunchpadApps().map(this.rowToItem) });
        this.sendJson(res, 200, { ok: true });
        return;
      }

      // POST /api/launchpad/apps/:id/unpin - 取消收藏
      const unpinMatch = pathname.match(/^\/api\/launchpad\/apps\/([^/]+)\/unpin$/);
      if (unpinMatch && method === 'POST') {
        const appId = unpinMatch[1];
        updateLaunchpadApp(appId, { pinned: false } as Partial<LaunchpadItem>);
        this.broadcast({ type: 'apps_updated', apps: getAllLaunchpadApps().map(this.rowToItem) });
        this.sendJson(res, 200, { ok: true });
        return;
      }

      // GET /api/launchpad/pinned - 获取收藏列表
      if (pathname === '/api/launchpad/pinned' && method === 'GET') {
        const rows = getAllLaunchpadApps({ includeHidden: false });
        const pinned = rows.filter(r => r.pinned).map(this.rowToItem);
        this.sendJson(res, 200, { apps: pinned });
        return;
      }

      // ===== 文件夹 API =====

      // POST /api/launchpad/folders - 创建文件夹
      if (pathname === '/api/launchpad/folders' && method === 'POST') {
        const body = await this.readBody(req);
        const { name, appIds } = body as { name?: string; appIds?: string[] };

        if (!name || !appIds || appIds.length < 2) {
          this.sendError(res, 400, 'Folder requires name and at least 2 apps');
          return;
        }

        // 创建文件夹
        const folderId = `folder-${Date.now()}`;
        const folder: LaunchpadItem = {
          id: folderId,
          name,
          kind: 'folder',
          path: `folder://${folderId}`,
          children: [],
          usageCount: 0,
          status: 'installed',
          hidden: false,
          pinned: false,
          pageIndex: 0,
          gridIndex: 0,
        };

        // 将应用移入文件夹
        for (const appId of appIds) {
          const appRow = getLaunchpadApp(appId);
          if (appRow) {
            updateLaunchpadApp(appId, {
              hidden: true,
              parentId: folderId,
            } as Partial<LaunchpadItem>);
          }
        }

        upsertLaunchpadApp(folder);
        this.broadcast({ type: 'apps_updated', apps: getAllLaunchpadApps().map(this.rowToItem) });
        this.sendJson(res, 201, { folder });
        return;
      }

      // POST /api/launchpad/folders/:id/add - 向文件夹添加应用
      const folderAddMatch = pathname.match(/^\/api\/launchpad\/folders\/([^/]+)\/add$/);
      if (folderAddMatch && method === 'POST') {
        const folderId = folderAddMatch[1];
        const body = await this.readBody(req);
        const { appId } = body as { appId?: string };

        if (!appId) {
          this.sendError(res, 400, 'Missing appId');
          return;
        }

        const appRow = getLaunchpadApp(appId);
        if (!appRow) {
          this.sendError(res, 404, 'App not found');
          return;
        }

        updateLaunchpadApp(appId, {
          hidden: true,
          parentId: folderId,
        } as Partial<LaunchpadItem>);

        this.broadcast({ type: 'apps_updated', apps: getAllLaunchpadApps().map(this.rowToItem) });
        this.sendJson(res, 200, { ok: true });
        return;
      }

      // POST /api/launchpad/folders/:id/remove - 从文件夹移除应用
      const folderRemoveMatch = pathname.match(/^\/api\/launchpad\/folders\/([^/]+)\/remove$/);
      if (folderRemoveMatch && method === 'POST') {
        const body = await this.readBody(req);
        const { appId } = body as { appId?: string };

        if (!appId) {
          this.sendError(res, 400, 'Missing appId');
          return;
        }

        updateLaunchpadApp(appId, {
          hidden: false,
          parentId: null,
        } as Partial<LaunchpadItem>);

        this.broadcast({ type: 'apps_updated', apps: getAllLaunchpadApps().map(this.rowToItem) });
        this.sendJson(res, 200, { ok: true });
        return;
      }

      // DELETE /api/launchpad/folders/:id - 删除文件夹
      const folderDeleteMatch = pathname.match(/^\/api\/launchpad\/folders\/([^/]+)$/);
      if (folderDeleteMatch && method === 'DELETE') {
        const folderId = folderDeleteMatch[1];

        // 将文件夹内的应用移出
        const rows = getAllLaunchpadApps({ includeHidden: true });
        for (const row of rows) {
          if (row.parent_id === folderId) {
            updateLaunchpadApp(row.id, {
              hidden: false,
              parentId: null,
            } as Partial<LaunchpadItem>);
          }
        }

        // 删除文件夹
        deleteLaunchpadApp(folderId);
        this.broadcast({ type: 'apps_updated', apps: getAllLaunchpadApps().map(this.rowToItem) });
        this.sendJson(res, 200, { ok: true });
        return;
      }

      // ===== 排序 API =====

      // POST /api/launchpad/reorder - 重新排序应用
      if (pathname === '/api/launchpad/reorder' && method === 'POST') {
        const body = await this.readBody(req);
        const { orders } = body as { orders?: Array<{ id: string; pageIndex: number; gridIndex: number }> };

        if (!orders) {
          this.sendError(res, 400, 'Missing orders');
          return;
        }

        for (const order of orders) {
          updateLaunchpadApp(order.id, {
            pageIndex: order.pageIndex,
            gridIndex: order.gridIndex,
          } as Partial<LaunchpadItem>);
        }

        this.broadcast({ type: 'apps_updated', apps: getAllLaunchpadApps().map(this.rowToItem) });
        this.sendJson(res, 200, { ok: true });
        return;
      }

      // 未知路由
      this.sendError(res, 404, 'Not found');
    } catch (err) {
      logger.error({ err, pathname, method }, 'Launchpad API error');
      this.sendError(res, 500, String(err));
    }
  }

  /**
   * 读取请求体
   */
  private readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * 发送 JSON 响应
   */
  private sendJson(res: http.ServerResponse, status: number, data: unknown): void {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(status);
    res.end(JSON.stringify(data));
  }

  /**
   * 发送错误响应
   */
  private sendError(res: http.ServerResponse, status: number, message: string): void {
    this.sendJson(res, status, { error: message });
  }

  /**
   * 发送默认图标（SVG）
   */
  private sendDefaultIcon(res: http.ServerResponse, row: LaunchpadAppRow | null): void {
    // 根据 kind 选择不同的默认图标
    const icons: Record<string, string> = {
      'macos-app': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#6366f1"/><text x="32" y="42" text-anchor="middle" font-size="28">📱</text></svg>`,
      'node-project': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#22c55e"/><text x="32" y="42" text-anchor="middle" font-size="28">📦</text></svg>`,
      'python-project': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#3b82f6"/><text x="32" y="42" text-anchor="middle" font-size="28">🐍</text></svg>`,
      'script': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f59e0b"/><text x="32" y="42" text-anchor="middle" font-size="28">📜</text></svg>`,
      'folder': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#8b5cf6"/><text x="32" y="42" text-anchor="middle" font-size="28">📁</text></svg>`,
    };

    const kind = row?.kind || 'macos-app';
    const svg = icons[kind] || icons['macos-app'];

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.writeHead(200);
    res.end(svg);
  }

  /**
   * 广播消息给所有客户端
   */
  private broadcast(data: LaunchpadWSMessage): void {
    const message = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * 数据库行转换为 LaunchpadItem
   */
  private rowToItem(row: LaunchpadAppRow): LaunchpadItem {
    return {
      id: row.id,
      name: row.name,
      nameZh: row.name_zh ?? undefined,
      kind: row.kind as LaunchpadItem['kind'],
      path: row.path,
      bundleId: row.bundle_id ?? undefined,
      icon: row.icon ?? undefined,
      category: row.category ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      children: row.children ? JSON.parse(row.children) : undefined,
      parentId: row.parent_id ?? undefined,
      launchCommand: row.launch_command ?? undefined,
      workingDirectory: row.working_directory ?? undefined,
      usageCount: row.usage_count || 0,
      lastUsedAt: row.last_used_at ?? undefined,
      status: (row.status as LaunchpadItem['status']) || 'installed',
      version: row.version ?? undefined,
      description: row.description ?? undefined,
      hidden: !!row.hidden,
      pinned: !!row.pinned,
      pageIndex: row.page_index || 0,
      gridIndex: row.grid_index || 0,
    };
  }
}

// 注册频道
registerChannel('launchpad', (opts) => {
  return new LaunchpadChannel(opts);
});
