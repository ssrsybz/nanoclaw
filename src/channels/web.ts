import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';

import { ASSISTANT_NAME, STORE_DIR } from '../config.js';
import { getDb } from '../db.js';
import { logger } from '../logger.js';
import * as workspace from '../workspace.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
  StreamMessage,
} from '../types.js';

export interface WebChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup?: (jid: string, group: RegisteredGroup) => void;
}

const WEB_JID = 'web:main';
const WEB_GROUP_NAME = 'Web IM';

export class WebChannel implements Channel {
  name = 'web';

  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private opts: WebChannelOpts;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  // Track workspace and conversation per client for response routing
  private clientWorkspaces: Map<WebSocket, string> = new Map();
  private clientConversationIds: Map<WebSocket, string> = new Map();
  // Fallback workspace per chatJid for legacy sendMessage
  private chatJidWorkspaces: Map<string, string> = new Map();

  constructor(port: number, opts: WebChannelOpts) {
    this.port = port;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // Ensure public directory exists
    const publicDir = path.join(STORE_DIR, 'public');
    fs.mkdirSync(publicDir, { recursive: true });

    // Create HTTP server with full router
    this.httpServer = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.info(
        { clientCount: this.clients.size },
        'Web IM client connected',
      );

      // Auto-register main group if not registered
      this.ensureMainGroupRegistered();

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(ws, msg);
        } catch (err) {
          logger.warn({ err }, 'Failed to parse Web IM message');
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.clientWorkspaces.delete(ws);
        this.clientConversationIds.delete(ws);
        logger.info(
          { clientCount: this.clients.size },
          'Web IM client disconnected',
        );
      });

      ws.on('error', (err) => {
        logger.error({ err }, 'Web IM client error');
        this.clients.delete(ws);
      });

      // Send connection confirmation
      this.sendToClient(ws, {
        type: 'connected',
        assistantName: ASSISTANT_NAME,
      });
    });

    return new Promise((resolve, reject) => {
      this.httpServer!.listen(this.port, () => {
        logger.info({ port: this.port }, 'Web IM server started');
        console.log(`\n  Web IM: http://localhost:${this.port}\n`);
        resolve();
      });
      this.httpServer!.on('error', reject);
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const parsedUrl = new URL(req.url ?? '/', `http://localhost:${this.port}`);
    const pathname = parsedUrl.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      await this.handleApiRequest(req, res, pathname);
      return;
    }

    // Root: serve React build index.html → fallback to web-im.html → fallback to embedded HTML
    if (pathname === '/' || pathname === '/index.html') {
      const indexPath = path.join(STORE_DIR, 'public', 'index.html');
      const fallbackPath = path.join(STORE_DIR, 'public', 'web-im.html');

      if (fs.existsSync(indexPath)) {
        this.serveStaticFile(res, indexPath, 'text/html; charset=utf-8');
      } else if (fs.existsSync(fallbackPath)) {
        this.serveStaticFile(res, fallbackPath, 'text/html; charset=utf-8');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.getEmbeddedHtml());
      }
      return;
    }

    // Static files from store/public/
    const staticPath = path.join(STORE_DIR, 'public', pathname);
    if (staticPath.startsWith(path.join(STORE_DIR, 'public'))) {
      if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
        const ext = path.extname(staticPath);
        const contentType = this.getContentType(ext);
        this.serveStaticFile(res, staticPath, contentType);
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  private serveStaticFile(
    res: http.ServerResponse,
    filePath: string,
    contentType: string,
  ): void {
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  }

  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
    };
    return types[ext] ?? 'application/octet-stream';
  }

  private async handleApiRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    pathname: string,
  ): Promise<void> {
    const sendJson = (status: number, data: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    const sendError = (status: number, message: string) => {
      sendJson(status, { error: message });
    };

    const readBody = (): Promise<string> => {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
      });
    };

    try {
      const db = getDb();
      const method = req.method ?? 'GET';

      // Route: GET /api/workspaces
      if (pathname === '/api/workspaces' && method === 'GET') {
        const workspaces = workspace.listWorkspaces(db);
        sendJson(200, { workspaces });
        return;
      }

      // Route: POST /api/workspaces
      if (pathname === '/api/workspaces' && method === 'POST') {
        const body = JSON.parse(await readBody());
        if (!body.path) {
          sendError(400, 'Missing required field: path');
          return;
        }
        const ws = workspace.addWorkspace(db, body.path);
        sendJson(201, { workspace: ws });
        return;
      }

      // Route: DELETE /api/workspaces/:id
      const deleteMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
      if (deleteMatch && method === 'DELETE') {
        const id = deleteMatch[1];
        const existing = workspace.getWorkspace(db, id);
        if (!existing) {
          sendError(404, 'Workspace not found');
          return;
        }
        workspace.removeWorkspace(db, id);
        sendJson(200, { ok: true });
        return;
      }

      // Route: PUT /api/workspaces/:id/last-used
      const lastUsedMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/last-used$/,
      );
      if (lastUsedMatch && method === 'PUT') {
        const id = lastUsedMatch[1];
        const existing = workspace.getWorkspace(db, id);
        if (!existing) {
          sendError(404, 'Workspace not found');
          return;
        }
        workspace.updateLastUsed(db, id);
        sendJson(200, { ok: true });
        return;
      }

      // Route: GET /api/workspaces/:id/claude-md
      const claudeMdGetMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/claude-md$/,
      );
      if (claudeMdGetMatch && method === 'GET') {
        const id = claudeMdGetMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const content = workspace.readClaudeMd(ws.path);
        sendJson(200, { content });
        return;
      }

      // Route: PUT /api/workspaces/:id/claude-md
      if (claudeMdGetMatch && method === 'PUT') {
        const id = claudeMdGetMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const body = JSON.parse(await readBody());
        if (typeof body.content !== 'string') {
          sendError(400, 'Missing required field: content');
          return;
        }
        workspace.writeClaudeMd(ws.path, body.content);
        sendJson(200, { ok: true });
        return;
      }

      // Route: GET /api/workspaces/:id/skills
      const skillsMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/skills$/,
      );
      if (skillsMatch && method === 'GET') {
        const id = skillsMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const enabledSkills = workspace.getEnabledSkills(db, id);
        const skills = workspace.scanSkills(ws.path, enabledSkills);
        sendJson(200, skills);
        return;
      }

      // Route: GET /api/workspaces/:id/skills/:name
      const skillDetailMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/skills\/([^/]+)$/,
      );
      if (skillDetailMatch && method === 'GET') {
        const id = skillDetailMatch[1];
        const skillName = decodeURIComponent(skillDetailMatch[2]);
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const content = workspace.readSkillFile(ws.path, skillName);
        sendJson(200, { name: skillName, content });
        return;
      }

      // Route: PUT /api/workspaces/:id/skills/:name
      if (skillDetailMatch && method === 'PUT') {
        const id = skillDetailMatch[1];
        const skillName = decodeURIComponent(skillDetailMatch[2]);
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const body = JSON.parse(await readBody());
        if (typeof body.content !== 'string') {
          sendError(400, 'Missing required field: content');
          return;
        }
        workspace.writeSkillFile(ws.path, skillName, body.content);
        sendJson(200, { ok: true });
        return;
      }

      // Route: PUT /api/workspaces/:id/enabled-skills
      const enabledSkillsMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/enabled-skills$/,
      );
      if (enabledSkillsMatch && method === 'PUT') {
        const id = enabledSkillsMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const body = JSON.parse(await readBody());
        if (!Array.isArray(body.skills)) {
          sendError(400, 'Missing required field: skills (string[])');
          return;
        }
        workspace.setEnabledSkills(db, id, body.skills);
        sendJson(200, { ok: true });
        return;
      }

      // Route: POST /api/folder-picker
      if (pathname === '/api/folder-picker' && method === 'POST') {
        const folderPath = await workspace.openFolderPicker();
        sendJson(200, { path: folderPath });
        return;
      }

      // Import conversation helpers
      const {
        createConversation,
        getConversationsByWorkspace,
        getConversation,
        updateConversation,
        deleteConversation,
        addConversationMessage,
        getConversationMessages,
      } = await import('../db.js');

      // Route: GET /api/workspaces/:id/conversations
      const convListMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/conversations$/,
      );
      if (convListMatch && method === 'GET') {
        const workspaceId = convListMatch[1];
        const ws = workspace.getWorkspace(db, workspaceId);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const conversations = getConversationsByWorkspace(db, workspaceId);
        sendJson(200, {
          conversations: conversations.map((c) => ({
            id: c.id,
            workspaceId: c.workspace_id,
            name: c.name,
            createdAt: c.created_at,
            updatedAt: c.updated_at,
          })),
        });
        return;
      }

      // Route: POST /api/workspaces/:id/conversations
      if (convListMatch && method === 'POST') {
        const workspaceId = convListMatch[1];
        const ws = workspace.getWorkspace(db, workspaceId);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const conversation = createConversation(db, workspaceId);
        sendJson(201, {
          conversation: {
            id: conversation.id,
            workspaceId: conversation.workspace_id,
            name: conversation.name,
            createdAt: conversation.created_at,
            updatedAt: conversation.updated_at,
          },
        });
        return;
      }

      // Route: /api/workspaces/:id/conversations/:convId
      const convDetailMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/conversations\/([^/]+)$/,
      );
      if (convDetailMatch) {
        const workspaceId = convDetailMatch[1];
        const convId = convDetailMatch[2];
        const ws = workspace.getWorkspace(db, workspaceId);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const conversation = getConversation(db, convId);
        if (!conversation || conversation.workspace_id !== workspaceId) {
          sendError(404, 'Conversation not found');
          return;
        }

        if (method === 'GET') {
          sendJson(200, {
            conversation: {
              id: conversation.id,
              workspaceId: conversation.workspace_id,
              name: conversation.name,
              createdAt: conversation.created_at,
              updatedAt: conversation.updated_at,
            },
          });
          return;
        }

        if (method === 'PUT') {
          const body = JSON.parse(await readBody());
          if (typeof body.name !== 'string') {
            sendError(400, 'Missing required field: name');
            return;
          }
          updateConversation(db, convId, body.name);
          const updated = getConversation(db, convId);
          sendJson(200, {
            conversation: {
              id: updated!.id,
              workspaceId: updated!.workspace_id,
              name: updated!.name,
              createdAt: updated!.created_at,
              updatedAt: updated!.updated_at,
            },
          });
          return;
        }

        if (method === 'DELETE') {
          deleteConversation(db, convId);
          sendJson(200, { ok: true });
          return;
        }
      }

      // Route: /api/workspaces/:id/conversations/:convId/messages
      const convMsgMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/conversations\/([^/]+)\/messages$/,
      );
      if (convMsgMatch) {
        const workspaceId = convMsgMatch[1];
        const convId = convMsgMatch[2];
        const ws = workspace.getWorkspace(db, workspaceId);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const conversation = getConversation(db, convId);
        if (!conversation || conversation.workspace_id !== workspaceId) {
          sendError(404, 'Conversation not found');
          return;
        }

        if (method === 'GET') {
          const url = new URL(req.url!, 'http://localhost');
          const limit = parseInt(url.searchParams.get('limit') || '100', 10);
          const before = url.searchParams.get('before') || undefined;
          const messages = getConversationMessages(db, convId, limit, before);
          sendJson(200, {
            messages: messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              parts: m.parts ? JSON.parse(m.parts) : null,
              createdAt: m.created_at,
            })),
            hasMore: messages.length === limit,
            nextCursor:
              messages.length > 0
                ? messages[messages.length - 1].created_at
                : null,
          });
          return;
        }

        if (method === 'POST') {
          const body = JSON.parse(await readBody());
          if (typeof body.content !== 'string') {
            sendError(400, 'Missing required field: content');
            return;
          }
          const parts = body.parts ? JSON.stringify(body.parts) : undefined;
          const message = addConversationMessage(
            db,
            convId,
            body.role || 'user',
            body.content,
            parts,
          );
          sendJson(201, {
            message: {
              id: message.id,
              role: message.role,
              content: message.content,
              parts: message.parts ? JSON.parse(message.parts) : null,
              createdAt: message.created_at,
            },
          });
          return;
        }
      }

      // No matching API route
      sendError(404, 'Not found');
    } catch (err) {
      logger.error({ err, pathname }, 'API request error');
      const message =
        err instanceof Error ? err.message : 'Internal server error';
      sendError(500, message);
    }
  }

  private ensureMainGroupRegistered(): void {
    const groups = this.opts.registeredGroups();
    if (!groups[WEB_JID] && this.opts.registerGroup) {
      const group: RegisteredGroup = {
        name: WEB_GROUP_NAME,
        folder: 'web-main',
        trigger: '',
        added_at: new Date().toISOString(),
        requiresTrigger: false,
        isMain: true,
      };
      this.opts.registerGroup(WEB_JID, group);
      logger.info({ jid: WEB_JID }, 'Web IM main group auto-registered');
    }
  }

  private handleMessage(
    ws: WebSocket,
    msg: {
      type: string;
      content?: string;
      sender?: string;
      workspaceId?: string;
      conversationId?: string;
    },
  ): void {
    if (msg.type === 'message' && msg.content) {
      const timestamp = new Date().toISOString();
      const sender = msg.sender || 'User';

      // Track workspace and conversation per client for response routing
      if (msg.workspaceId) {
        this.clientWorkspaces.set(ws, msg.workspaceId);
        // Also update chatJid -> workspace mapping for legacy sendMessage
        this.chatJidWorkspaces.set(WEB_JID, msg.workspaceId);
      }
      if (msg.conversationId) {
        this.clientConversationIds.set(ws, msg.conversationId);
      }

      // Store chat metadata
      this.opts.onChatMetadata(
        WEB_JID,
        timestamp,
        WEB_GROUP_NAME,
        'web',
        false,
      );

      // Deliver message
      this.opts.onMessage(WEB_JID, {
        id: `web-${Date.now()}`,
        chat_jid: WEB_JID,
        sender: 'web-user',
        sender_name: sender,
        content: msg.content,
        timestamp,
        is_from_me: false,
        workspaceId: msg.workspaceId,
        conversationId: msg.conversationId,
      });

      logger.info(
        { sender, content: msg.content.slice(0, 50) },
        'Web IM message received',
      );
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.wss) {
      logger.warn('Web IM server not initialized');
      return;
    }

    const workspaceId = this.chatJidWorkspaces.get(jid);
    const message = {
      type: 'message',
      content: text,
      sender: ASSISTANT_NAME,
      timestamp: new Date().toISOString(),
      workspaceId,
    };

    // Broadcast to all connected clients
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        this.sendToClient(client, message);
      }
    }

    logger.info({ jid, length: text.length }, 'Web IM message sent');
  }

  async sendStructured(jid: string, data: StreamMessage): Promise<void> {
    if (!this.wss) return;

    // Use conversationId from data if provided
    const conversationId = data.conversationId;
    // Use workspaceId from data if provided, otherwise fallback to chatJid mapping
    const workspaceId = data.workspaceId ?? this.chatJidWorkspaces.get(jid);

    const timestamp = new Date().toISOString();
    const msg = {
      ...data,
      conversationId,
      workspaceId,
      timestamp,
    };

    // Store assistant messages to conversation_messages if conversationId is present
    if (conversationId && data.type === 'assistant' && data.content) {
      try {
        const db = getDb();
        const id = `web-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        db.prepare(
          `INSERT INTO conversation_messages (id, conversation_id, role, content, parts, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(id, conversationId, 'assistant', data.content, null, timestamp);
        db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(
          timestamp,
          conversationId,
        );
      } catch (err) {
        logger.warn(
          { err, conversationId },
          'Failed to store assistant message to conversation_messages',
        );
      }
    }

    // If conversationId is provided, route to the specific client
    // Otherwise broadcast to all clients (legacy behavior)
    if (conversationId) {
      for (const [client, clientConvId] of this.clientConversationIds) {
        if (
          clientConvId === conversationId &&
          client.readyState === WebSocket.OPEN
        ) {
          this.sendToClient(client, msg);
        }
      }
    } else {
      // Broadcast to all clients for backwards compatibility
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          this.sendToClient(client, msg);
        }
      }
    }
  }

  private sendToClient(ws: WebSocket, data: object): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  isConnected(): boolean {
    return this.httpServer !== null && this.wss !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('web:');
  }

  async disconnect(): Promise<void> {
    // Close all WebSocket connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    // Close WebSocket server
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    logger.info('Web IM server stopped');
  }

  async setTyping(_jid: string, isTyping: boolean): Promise<void> {
    if (!isTyping) return;

    // Broadcast typing indicator to all clients
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        this.sendToClient(client, { type: 'typing' });
      }
    }
  }

  private getEmbeddedHtml(): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NanoClaw Web IM</title>
  <style>
    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-chat: #0f0f1a;
      --text-primary: #e4e4e7;
      --text-secondary: #a1a1aa;
      --accent: #6366f1;
      --accent-hover: #818cf8;
      --border: #27272a;
      --code-bg: #1e1e2e;
      --success: #22c55e;
      --error: #ef4444;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans SC', sans-serif;
      background: var(--bg-chat);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    .header {
      background: var(--bg-primary);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--border);
    }
    .header h1 { font-size: 16px; font-weight: 600; }
    .status {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--border);
    }
    .status.connected { background: rgba(34, 197, 94, 0.2); color: var(--success); }
    .status.disconnected { background: rgba(239, 68, 68, 0.2); color: var(--error); }
    .header-actions { margin-left: auto; display: flex; gap: 8px; }
    .header-actions button {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
    }
    .header-actions button:hover { border-color: var(--accent); color: var(--text-primary); }

    /* Chat Container */
    .chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      scroll-behavior: smooth;
    }
    .chat-container::-webkit-scrollbar { width: 6px; }
    .chat-container::-webkit-scrollbar-track { background: transparent; }
    .chat-container::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

    /* Messages */
    .message { margin-bottom: 20px; display: flex; flex-direction: column; gap: 6px; }
    .message.user { align-items: flex-end; }
    .message.assistant { align-items: flex-start; }

    .message-content {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 16px;
      line-height: 1.6;
      word-break: break-word;
    }
    .message.user .message-content {
      background: var(--accent);
      color: white;
      border-bottom-right-radius: 4px;
    }
    .message.assistant .message-content {
      background: var(--bg-primary);
      border-bottom-left-radius: 4px;
    }

    /* Markdown Styles */
    .message-content h1, .message-content h2, .message-content h3 {
      margin: 16px 0 8px 0;
      font-weight: 600;
    }
    .message-content h1:first-child, .message-content h2:first-child, .message-content h3:first-child { margin-top: 0; }
    .message-content p { margin: 8px 0; }
    .message-content p:first-child { margin-top: 0; }
    .message-content p:last-child { margin-bottom: 0; }
    .message-content ul, .message-content ol { margin: 8px 0; padding-left: 20px; }
    .message-content li { margin: 4px 0; }
    .message-content code {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.9em;
    }
    .message-content pre {
      background: var(--code-bg);
      padding: 12px 16px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 12px 0;
      position: relative;
    }
    .message-content pre code {
      padding: 0;
      background: transparent;
    }
    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(0,0,0,0.3);
      padding: 6px 12px;
      margin: -12px -16px 12px -16px;
      border-radius: 8px 8px 0 0;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .copy-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 2px 6px;
      font-size: 11px;
      border-radius: 4px;
    }
    .copy-btn:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
    .message-content a { color: var(--accent-hover); text-decoration: none; }
    .message-content a:hover { text-decoration: underline; }
    .message-content blockquote {
      border-left: 3px solid var(--accent);
      padding-left: 12px;
      margin: 8px 0;
      color: var(--text-secondary);
    }

    .message-meta {
      font-size: 11px;
      color: var(--text-secondary);
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .message-actions {
      display: none;
      gap: 4px;
    }
    .message:hover .message-actions { display: flex; }
    .message-actions button {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 2px 6px;
      font-size: 11px;
      border-radius: 4px;
    }
    .message-actions button:hover { background: var(--border); color: var(--text-primary); }

    /* Typing Indicator */
    .typing-indicator {
      display: none;
      padding: 12px 16px;
      background: var(--bg-primary);
      border-radius: 16px;
      margin-bottom: 20px;
      width: fit-content;
    }
    .typing-indicator.active { display: block; }
    .typing-indicator span {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: var(--text-secondary);
      border-radius: 50%;
      margin: 0 2px;
      animation: bounce 1.4s infinite ease-in-out;
    }
    .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
    .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }

    /* Input Container */
    .input-container {
      background: var(--bg-primary);
      padding: 16px 20px;
      border-top: 1px solid var(--border);
    }
    .input-wrapper {
      display: flex;
      gap: 12px;
      align-items: flex-end;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 8px 12px;
    }
    .input-wrapper:focus-within { border-color: var(--accent); }
    .input-wrapper textarea {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-primary);
      resize: none;
      font-size: 14px;
      line-height: 1.5;
      outline: none;
      font-family: inherit;
      max-height: 200px;
      min-height: 24px;
    }
    .input-wrapper textarea::placeholder { color: var(--text-secondary); }
    .input-actions { display: flex; gap: 8px; align-items: center; }
    .input-hint {
      font-size: 11px;
      color: var(--text-secondary);
      white-space: nowrap;
    }
    .send-btn {
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .send-btn:hover { background: var(--accent-hover); }
    .send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .stop-btn {
      background: var(--error);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 13px;
      display: none;
    }
    .stop-btn.active { display: flex; }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-secondary);
      text-align: center;
      padding: 40px;
    }
    .empty-state h2 { font-size: 24px; margin-bottom: 12px; color: var(--text-primary); }
    .empty-state p { font-size: 14px; max-width: 400px; line-height: 1.6; }
    .shortcuts {
      margin-top: 24px;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .shortcut {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }
    kbd {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 2px 6px;
      font-family: inherit;
      font-size: 11px;
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-primary);
      border: 1px solid var(--border);
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      opacity: 0;
      transition: opacity 0.3s;
      pointer-events: none;
    }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div class="header">
    <h1>NanoClaw</h1>
    <span class="status" id="status">connecting...</span>
    <div class="header-actions">
      <button onclick="clearChat()">Clear Chat</button>
    </div>
  </div>
  <div class="chat-container" id="chat">
    <div class="empty-state" id="emptyState">
      <h2>👋 Welcome to NanoClaw</h2>
      <p>Your personal AI assistant. Ask questions, write code, analyze data, or just have a conversation.</p>
      <div class="shortcuts">
        <div class="shortcut"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> Send message</div>
        <div class="shortcut"><kbd>↑</kbd><kbd>↓</kbd> History</div>
        <div class="shortcut"><kbd>Esc</kbd> Clear input</div>
      </div>
    </div>
  </div>
  <div class="typing-indicator" id="typing"><span></span><span></span><span></span></div>
  <div class="input-container">
    <div class="input-wrapper">
      <textarea id="input" placeholder="Type a message... (Ctrl+Enter to send)" rows="1"></textarea>
      <div class="input-actions">
        <span class="input-hint" id="inputHint"></span>
        <button class="stop-btn" id="stopBtn" onclick="stopGeneration()">Stop</button>
        <button class="send-btn" id="sendBtn" onclick="sendMessage()">
          <span>Send</span>
        </button>
      </div>
    </div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
    const chat = document.getElementById('chat');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');
    const typing = document.getElementById('typing');
    const emptyState = document.getElementById('emptyState');
    const inputHint = document.getElementById('inputHint');
    const toast = document.getElementById('toast');

    let ws;
    let assistantName = 'NanoClaw';
    let isGenerating = false;
    let history = [];
    let historyIndex = -1;
    let currentInput = '';

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 200) + 'px';
      updateInputHint();
    });

    function updateInputHint() {
      const lines = input.value.split('\\n').length;
      if (lines > 1) {
        inputHint.textContent = lines + ' lines';
      } else {
        inputHint.textContent = '';
      }
    }

    // Keyboard shortcuts
    input.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter to send
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sendMessage();
        return;
      }

      // Up arrow - history back
      if (e.key === 'ArrowUp' && !e.shiftKey && input.selectionStart === 0 && input.selectionEnd === 0) {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          if (historyIndex === -1) currentInput = input.value;
          historyIndex++;
          input.value = history[history.length - 1 - historyIndex];
          updateInputHint();
        }
        return;
      }

      // Down arrow - history forward
      if (e.key === 'ArrowDown' && !e.shiftKey) {
        const len = input.value.length;
        if (input.selectionStart === len && input.selectionEnd === len) {
          e.preventDefault();
          if (historyIndex > 0) {
            historyIndex--;
            input.value = history[history.length - 1 - historyIndex];
          } else if (historyIndex === 0) {
            historyIndex = -1;
            input.value = currentInput;
          }
          updateInputHint();
        }
        return;
      }

      // Escape to clear
      if (e.key === 'Escape') {
        input.value = '';
        historyIndex = -1;
        updateInputHint();
        return;
      }
    });

    function connect() {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(protocol + '//' + location.host);

      ws.onopen = () => {
        status.textContent = 'connected';
        status.className = 'status connected';
      };

      ws.onclose = () => {
        status.textContent = 'disconnected';
        status.className = 'status disconnected';
        setTimeout(connect, 3000);
      };

      ws.onerror = () => { ws.close(); };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'connected') {
          assistantName = msg.assistantName || 'NanoClaw';
        } else if (msg.type === 'message') {
          addMessage(msg.content, 'assistant', msg.sender || assistantName);
          setGenerating(false);
        } else if (msg.type === 'typing') {
          typing.classList.add('active');
          chat.scrollTop = chat.scrollHeight;
        }
      };
    }

    function setGenerating(gen) {
      isGenerating = gen;
      sendBtn.style.display = gen ? 'none' : 'flex';
      stopBtn.classList.toggle('active', gen);
    }

    function stopGeneration() {
      // Send stop signal
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
      }
      setGenerating(false);
      typing.classList.remove('active');
    }

    // Simple Markdown parser
    function parseMarkdown(text) {
      // Escape HTML first
      let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Code blocks with language
      html = html.replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, (match, lang, code) => {
        const langDisplay = lang || 'code';
        return '<pre><div class="code-header"><span>' + langDisplay + '</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><code>' + code.trim() + '</code></pre>';
      });

      // Inline code
      html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');

      // Headers
      html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
      html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
      html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

      // Bold and italic
      html = html.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g, '<strong><em>$1</em></strong>');
      html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
      html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');

      // Links
      html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank">$1</a>');

      // Blockquotes
      html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

      // Unordered lists
      html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
      html = html.replace(/(<li>.*<\\/li>\\n?)+/g, '<ul>$&</ul>');

      // Ordered lists
      html = html.replace(/^\\d+\\. (.+)$/gm, '<li>$1</li>');

      // Paragraphs (lines not already wrapped)
      const lines = html.split('\\n');
      let result = [];
      let inCodeBlock = false;

      for (let line of lines) {
        if (line.includes('<pre>')) inCodeBlock = true;
        if (line.includes('</pre>')) inCodeBlock = false;

        if (!inCodeBlock && line.trim() && !/^<(h[1-6]|ul|ol|li|blockquote|pre|div)/.test(line)) {
          result.push('<p>' + line + '</p>');
        } else {
          result.push(line);
        }
      }

      return result.join('\\n');
    }

    function addMessage(content, type, sender) {
      emptyState.style.display = 'none';

      const div = document.createElement('div');
      div.className = 'message ' + type;

      const contentHtml = type === 'assistant' ? parseMarkdown(content) : escapeHtml(content);

      div.innerHTML =
        '<div class="message-content">' + contentHtml + '</div>' +
        '<div class="message-meta">' +
          '<span>' + escapeHtml(sender) + ' · ' + new Date().toLocaleTimeString() + '</span>' +
          '<div class="message-actions">' +
            '<button onclick="copyMessage(this)">Copy</button>' +
            (type === 'user' ? '<button onclick="editMessage(this)">Edit</button>' : '') +
            (type === 'assistant' ? '<button onclick="retryMessage()">Retry</button>' : '') +
          '</div>' +
        '</div>';

      chat.appendChild(div);
      chat.scrollTop = chat.scrollHeight;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function sendMessage() {
      const content = input.value.trim();
      if (!content || ws.readyState !== WebSocket.OPEN) return;

      addMessage(content, 'user', 'You');
      history.push(content);
      historyIndex = -1;

      ws.send(JSON.stringify({ type: 'message', content }));

      input.value = '';
      input.style.height = 'auto';
      updateInputHint();
      setGenerating(true);
    }

    function copyCode(btn) {
      const pre = btn.closest('pre');
      const code = pre.querySelector('code').textContent;
      navigator.clipboard.writeText(code);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    }

    function copyMessage(btn) {
      const content = btn.closest('.message').querySelector('.message-content').textContent;
      navigator.clipboard.writeText(content);
      showToast('Copied to clipboard');
    }

    function editMessage(btn) {
      const content = btn.closest('.message').querySelector('.message-content').textContent;
      input.value = content;
      input.focus();
      updateInputHint();
    }

    function retryMessage() {
      if (history.length > 0) {
        const lastMsg = history[history.length - 1];
        addMessage(lastMsg, 'user', 'You');
        ws.send(JSON.stringify({ type: 'message', content: lastMsg }));
        setGenerating(true);
      }
    }

    function clearChat() {
      chat.innerHTML = '';
      emptyState.style.display = 'flex';
      chat.appendChild(emptyState);
    }

    function showToast(msg) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    }

    connect();
  </script>
</body>
</html>`;
  }
}

registerChannel('web', (opts: ChannelOpts) => {
  const port = parseInt(process.env.WEB_IM_PORT || '3100', 10);
  return new WebChannel(port, opts);
});
