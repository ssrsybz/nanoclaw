import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WebSocket, WebSocketServer } from 'ws';
import busboy from 'busboy';

import { ASSISTANT_NAME, DATA_DIR, STORE_DIR, PROJECT_ROOT } from '../config.js';
import { parseFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '../file-parser.js';
import { getDb } from '../db.js';
import { logger } from '../logger.js';
import * as workspace from '../workspace.js';
import { registerChannel } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
  StreamMessage,
  Skill,
  SkillCategory,
  AskUserQuestionResponse,
  WS_MSG_TYPES,
} from '../types.js';
import { BUILTIN_SKILLS, type BuiltinSkill } from '../builtin-skills.js';
import { handleQuestionResponse, processIPCResponses } from '../question-responder.js';

const WEB_GROUP_NAME = 'Web IM';
const WEB_GROUP_FOLDER = 'web-main';

/**
 * Generate a unique chatJid for each workspace.
 * This enables multiple workspaces to have independent agent sessions.
 */
function getWebChatJid(workspaceId: string): string {
  return `web:ws-${workspaceId}`;
}

export interface WebChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup?: (jid: string, group: RegisteredGroup) => void;
}

export class WebChannel implements Channel {
  name = 'web';

  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private opts: WebChannelOpts;
  private port: number;

  private clients = new Set<WebSocket>();
  // Track workspace and conversation per client for response routing
  private clientWorkspaces = new Map<WebSocket, string>();
  private clientConversationIds = new Map<WebSocket, string>();
  // Fallback workspace per chatJid for legacy sendMessage
  private chatJidWorkspaces = new Map<string, string>();

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
      logger.info({ clientCount: this.clients.size }, 'Web IM client connected');

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
        logger.info({ clientCount: this.clients.size }, 'Web IM client disconnected');
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

        // Start periodic IPC response processing for question responses
        setInterval(() => {
          processIPCResponses();
        }, 500);

        resolve();
      });
      this.httpServer!.on('error', reject);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const parsedUrl = new URL(req.url ?? '/', `http://localhost:${this.port}`);
    const pathname = parsedUrl.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      await this.handleApiRequest(req, res, pathname);
      return;
    }

    // Static files from store/public/ (React build output)
    const staticPath = path.join(STORE_DIR, 'public', pathname);
    if (
      staticPath.startsWith(path.join(STORE_DIR, 'public')) &&
      fs.existsSync(staticPath) &&
      fs.statSync(staticPath).isFile()
    ) {
      const ext = path.extname(staticPath);
      const contentType = this.getContentType(ext);
      this.serveStaticFile(res, staticPath, contentType);
      return;
    }

    // SPA fallback: serve index.html for all other routes
    const indexPath = path.join(STORE_DIR, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      this.serveStaticFile(res, indexPath, 'text/html; charset=utf-8');
      return;
    }

    // No React build found
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>OKClaw</title></head>
<body style="background:#1a1a2e;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
  <div style="text-align:center">
    <h1>OKClaw Web IM</h1>
    <p style="color:#888">前端未构建，请运行：</p>
    <code style="background:#333;padding:8px 16px;border-radius:4px">cd web && npm run build</code>
  </div>
</body>
</html>`);
  }

  private serveStaticFile(res: http.ServerResponse, filePath: string, contentType: string) {
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

  private async handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse, pathname: string) {
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
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
      });
    };

    const parseMultipart = (): Promise<{ file: Buffer; filename: string; mimeType: string }> => {
      return new Promise((resolve, reject) => {
        const bb = busboy({
          headers: req.headers,
          limits: { fileSize: MAX_FILE_SIZE },
          defParamCharset: 'utf8',
        });

        let fileBuffer: Buffer[] = [];
        let filename = '';
        let mimeType = '';
        let fileFound = false;
        let truncated = false;

        bb.on('file', (name, stream, info) => {
          if (name !== 'file' || fileFound) {
            stream.resume();
            return;
          }

          fileFound = true;
          filename = info.filename;
          mimeType = info.mimeType;

          stream.on('data', (chunk: Buffer) => fileBuffer.push(chunk));
          stream.on('end', () => {
            if ((stream as any).truncated) {
              truncated = true;
            }
          });
        });

        bb.on('finish', () => {
          if (!fileFound) {
            reject(new Error('No file field in upload'));
            return;
          }

          if (truncated) {
            reject(new Error(`文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)，请压缩后重试`));
            return;
          }

          resolve({ file: Buffer.concat(fileBuffer), filename, mimeType });
        });

        bb.on('error', reject);
        req.pipe(bb);
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
      const lastUsedMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/last-used$/);
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
      const claudeMdGetMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/claude-md$/);
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
      const skillsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/skills$/);
      if (skillsMatch && method === 'GET') {
        const id = skillsMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const enabledSkills = workspace.getEnabledSkills(db, id);
        const skills = workspace.scanSkills(ws.path, enabledSkills);
        sendJson(200, { skills });
        return;
      }

      // Route: GET /api/workspaces/:id/skills/:name
      const skillDetailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/skills\/([^/]+)$/);
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

      // Route: GET /api/workspaces/:id/skills/:name/content
      const skillContentMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/skills\/([^/]+)\/content$/);
      if (skillContentMatch && method === 'GET') {
        const id = skillContentMatch[1];
        const skillName = decodeURIComponent(skillContentMatch[2]);
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        const content = workspace.readSkillFile(ws.path, skillName);
        if (!content) {
          sendError(404, 'Skill not found');
          return;
        }
        sendJson(200, { name: skillName, content });
        return;
      }

      // Route: GET /api/skills/discover - Get all available skills grouped by category
      if (pathname === '/api/skills/discover' && method === 'GET') {
        const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
        const workspaceId = url.searchParams.get('workspaceId');

        // Group skills by category
        const skillsByCategory: Record<SkillCategory, Skill[]> = {
          core: [],
          mcp: [],
          channel: [],
          system: [],
          workspace: [],
        };

        // Add builtin skills (core, mcp, channel)
        for (const skill of BUILTIN_SKILLS) {
          skillsByCategory[skill.category].push({
            name: skill.name,
            nameZh: skill.nameZh,
            description: skill.description,
            path: '',
            enabled: true,
            hasSkillMd: false,
            category: skill.category,
            icon: skill.icon,
            isBuiltin: true,
          });
        }

        // Add system skills from skills/ directory
        const skillsDir = path.join(PROJECT_ROOT, 'skills');
        if (fs.existsSync(skillsDir)) {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const skillPath = path.join(skillsDir, entry.name);
            const skillMdPath = path.join(skillPath, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) continue;

            try {
              const content = fs.readFileSync(skillMdPath, 'utf-8');
              const frontmatter = this.parseFrontmatter(content);
              skillsByCategory.system.push({
                name: frontmatter.name || entry.name,
                nameZh: frontmatter.nameZh || frontmatter.name || entry.name,
                description: frontmatter.description || '',
                path: skillPath,
                enabled: true,
                hasSkillMd: true,
                category: 'system',
                isSystem: true,
              });
            } catch {
              // Skip skills with read errors
            }
          }
        }

        // Add workspace skills if workspaceId provided
        if (workspaceId) {
          const ws = workspace.getWorkspace(db, workspaceId);
          if (ws) {
            const enabledSkills = workspace.getEnabledSkills(db, workspaceId);
            const wsSkills = workspace.scanSkills(ws.path, enabledSkills);
            for (const s of wsSkills) {
              skillsByCategory.workspace.push({
                ...s,
                nameZh: s.name, // Could be enhanced to read from SKILL.md
                category: 'workspace',
              });
            }
          }
        }

        sendJson(200, { skills: skillsByCategory });
        return;
      }

      // Route: GET /api/system-skills
      if (pathname === '/api/system-skills' && method === 'GET') {
        const skillsDir = path.join(PROJECT_ROOT, 'skills');
        const skills: Array<{ name: string; description: string; path: string }> = [];

        if (fs.existsSync(skillsDir)) {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const skillPath = path.join(skillsDir, entry.name);
            const skillMdPath = path.join(skillPath, 'SKILL.md');

            if (!fs.existsSync(skillMdPath)) continue;

            try {
              const content = fs.readFileSync(skillMdPath, 'utf-8');
              const frontmatter = this.parseFrontmatter(content);
              skills.push({
                name: frontmatter.name || entry.name,
                description: frontmatter.description || '',
                path: skillPath,
              });
            } catch {
              // Skip skills with read errors
            }
          }
        }

        sendJson(200, { skills });
        return;
      }

      // Route: GET /api/system-skills/:name/content
      const systemSkillContentMatch = pathname.match(/^\/api\/system-skills\/([^/]+)\/content$/);
      if (systemSkillContentMatch && method === 'GET') {
        const skillName = decodeURIComponent(systemSkillContentMatch[1]);
        const skillMdPath = path.join(PROJECT_ROOT, 'skills', skillName, 'SKILL.md');

        if (!fs.existsSync(skillMdPath)) {
          sendError(404, 'Skill not found');
          return;
        }

        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          sendJson(200, { name: skillName, content });
        } catch {
          sendError(500, 'Failed to read skill file');
        }
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
      const enabledSkillsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/enabled-skills$/);
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

      // Route: GET /api/directory-list — browse server directories
      if (pathname === '/api/directory-list' && method === 'GET') {
        const requestedPath =
          new URL(req.url ?? '/', `http://localhost:${this.port}`).searchParams.get('path') ||
          os.homedir();
        const resolvedPath = path.resolve(requestedPath);

        // Block system directories
        const blockedPrefixes = ['/etc', '/usr', '/sys', '/proc', '/dev', '/boot', '/sbin', '/bin', '/lib'];
        if (blockedPrefixes.some((p) => resolvedPath === p || resolvedPath.startsWith(p + '/'))) {
          sendJson(200, { path: resolvedPath, directories: [] });
          return;
        }

        try {
          const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
          const directories = entries
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
            .map((e) => ({ name: e.name, path: path.join(resolvedPath, e.name) }))
            .sort((a, b) => a.name.localeCompare(b.name));
          sendJson(200, { path: resolvedPath, directories });
        } catch {
          sendJson(200, { path: resolvedPath, directories: [] });
        }
        return;
      }

      // Route: POST /api/folder-picker (legacy — kept for backward compat)
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
        updateConversationMessage,
        getLastAssistantMessage,
      } = await import('../db.js');

      // Route: GET /api/workspaces/:id/conversations
      const convListMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/conversations$/);
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
      const convDetailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/conversations\/([^/]+)$/);
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
      const convMsgMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/conversations\/([^/]+)\/messages$/);
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
          const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
          const limit = parseInt(url.searchParams.get('limit') || '100', 10);
          const before = url.searchParams.get('before') || undefined;
          const messages = getConversationMessages(db, convId, limit, before);
          sendJson(200, {
            messages: messages.map((m) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              parts: m.parts ? JSON.parse(m.parts) : null,
              attachment: m.attachment ? JSON.parse(m.attachment) : null,
              model: m.model,
              apiCalls: m.api_calls ? JSON.parse(m.api_calls) : null,
              createdAt: m.created_at,
            })),
            hasMore: messages.length === limit,
            nextCursor:
              messages.length > 0 ? messages[messages.length - 1].created_at : null,
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
          const attachment = body.attachment ? JSON.stringify(body.attachment) : undefined;
          const model = body.model ? String(body.model) : undefined;
          const apiCalls = body.apiCalls ? JSON.stringify(body.apiCalls) : undefined;
          const message = addConversationMessage(
            db,
            convId,
            body.role || 'user',
            body.content,
            parts,
            attachment,
            model,
            apiCalls
          );
          sendJson(201, {
            message: {
              id: message.id,
              role: message.role,
              content: message.content,
              parts: message.parts ? JSON.parse(message.parts) : null,
              attachment: message.attachment ? JSON.parse(message.attachment) : null,
              model: message.model,
              apiCalls: message.api_calls ? JSON.parse(message.api_calls) : null,
              createdAt: message.created_at,
            },
          });
          return;
        }
      }

      // Route: PATCH /api/conversations/:convId/messages/:msgId (update streaming message)
      const msgUpdateMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/([^/]+)$/);
      if (msgUpdateMatch && method === 'PATCH') {
        const convId = msgUpdateMatch[1];
        const msgId = msgUpdateMatch[2];
        const body = JSON.parse(await readBody());

        const updates: { content?: string; parts?: string; model?: string; apiCalls?: string } = {};
        if (body.content !== undefined) updates.content = body.content;
        if (body.parts !== undefined) updates.parts = JSON.stringify(body.parts);
        if (body.model !== undefined) updates.model = body.model;
        if (body.apiCalls !== undefined) updates.apiCalls = JSON.stringify(body.apiCalls);

        const success = updateConversationMessage(db, msgId, updates);
        if (success) {
          sendJson(200, { success: true });
        } else {
          sendError(404, 'Message not found');
        }
        return;
      }

      // Route: GET /api/conversations/:convId/messages/last-assistant
      const lastAssistantMatch = pathname.match(/^\/api\/conversations\/([^/]+)\/messages\/last-assistant$/);
      if (lastAssistantMatch && method === 'GET') {
        const convId = lastAssistantMatch[1];
        const message = getLastAssistantMessage(db, convId);
        if (message) {
          sendJson(200, {
            message: {
              id: message.id,
              role: message.role,
              content: message.content,
              parts: message.parts ? JSON.parse(message.parts) : null,
              createdAt: message.created_at,
            },
          });
        } else {
          sendJson(200, { message: null });
        }
        return;
      }

      // Route: POST /api/upload
      if (pathname === '/api/upload' && method === 'POST') {
        try {
          const { file, filename, mimeType } = await parseMultipart();
          const ext = path.extname(filename).toLowerCase();

          if (!ALLOWED_EXTENSIONS.includes(ext)) {
            sendError(400, `仅支持 ${ALLOWED_EXTENSIONS.join(' ')} 格式的文件`);
            return;
          }

          if (file.length > MAX_FILE_SIZE) {
            sendError(413, `文件大小不能超过 ${MAX_FILE_SIZE / 1024 / 1024}MB`);
            return;
          }

          const safeName = filename.replace(/[^a-zA-Z0-9._\-一-鿿]/g, '_');
          const timestamp = Date.now();
          const savedName = `${timestamp}_${safeName}`;
          const fileId = `f_${timestamp}`;

          const uploadUrl = new URL(req.url ?? '/', `http://localhost:${this.port}`);
          const workspaceId = uploadUrl.searchParams.get('workspaceId');

          let uploadDir: string;
          if (workspaceId) {
            const ws = workspace.getWorkspace(db, workspaceId);
            if (ws) {
              uploadDir = path.join(ws.path, 'uploads');
            } else {
              uploadDir = path.join(DATA_DIR, 'uploads');
            }
          } else {
            uploadDir = path.join(DATA_DIR, 'uploads');
          }

          fs.mkdirSync(uploadDir, { recursive: true });
          const filePath = path.join(uploadDir, savedName);
          fs.writeFileSync(filePath, file);

          const relativePath = `uploads/${savedName}`;
          const parsed = await parseFile(file, mimeType, filename, filePath);

          sendJson(200, {
            fileId,
            filename,
            mimeType,
            size: file.length,
            extractedText: parsed.text,
            filePath: relativePath,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Upload failed';
          const isSizeError = message.includes('超过限制');
          logger.error({ err }, 'File upload error');
          sendError(isSizeError ? 413 : 500, message);
        }
        return;
      }

      // Route: GET /api/llm-config - Get current LLM configuration
      if (pathname === '/api/llm-config' && method === 'GET') {
        const result = this.loadLLMConfig();
        sendJson(200, result);
        return;
      }

      // Route: PUT /api/llm-config - Update LLM configuration
      if (pathname === '/api/llm-config' && method === 'PUT') {
        try {
          const body = JSON.parse(await readBody());
          const updated = this.saveLLMConfig(body);
          sendJson(200, { ok: true, config: updated });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to save config';
          sendError(500, message);
        }
        return;
      }

      // No matching API route
      sendError(404, 'Not found');
    } catch (err) {
      logger.error({ err, pathname }, 'API request error');
      const message = err instanceof Error ? err.message : 'Internal server error';
      sendError(500, message);
    }
  }

  /**
   * Ensure a group is registered for the given workspace.
   * Each workspace gets its own chatJid for independent agent sessions.
   */
  private ensureWorkspaceGroupRegistered(workspaceId: string): string {
    const chatJid = getWebChatJid(workspaceId);
    const groups = this.opts.registeredGroups();

    if (!groups[chatJid] && this.opts.registerGroup) {
      const group: RegisteredGroup = {
        name: `${WEB_GROUP_NAME} (${workspaceId.slice(0, 8)})`,
        folder: WEB_GROUP_FOLDER,
        trigger: '',
        added_at: new Date().toISOString(),
        requiresTrigger: false,
        isMain: true,
      };
      this.opts.registerGroup(chatJid, group);
      logger.info({ jid: chatJid, workspaceId }, 'Web IM workspace group registered');
    }

    return chatJid;
  }

  /**
   * Load LLM configuration with project-level override support.
   * Priority: project .env (highest) > global settings.json (default)
   */
  private loadLLMConfig(): { config: { apiKey: string; baseUrl: string; model: string }; source: string } {
    let apiKey = '';
    let baseUrl = '';
    let model = '';
    let source = 'global';

    // Load global defaults from ~/.claude/settings.json
    try {
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        const env = settings.env || {};
        apiKey = env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || '';
        baseUrl = env.ANTHROPIC_BASE_URL || '';
        model = env.ANTHROPIC_MODEL || '';
      }
    } catch (err) {
      logger.debug({ err }, 'Failed to load global settings.json');
    }

    // Load project .env overrides (higher priority)
    try {
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const projectEnv: Record<string, string> = {};

        for (const line of envContent.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          let value = trimmed.slice(eqIdx + 1).trim();
          if (
            value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'")))
          ) {
            value = value.slice(1, -1);
          }
          if (value) projectEnv[key] = value;
        }

        if (projectEnv.ANTHROPIC_API_KEY || projectEnv.ANTHROPIC_BASE_URL || projectEnv.MODEL) {
          if (projectEnv.ANTHROPIC_API_KEY) apiKey = projectEnv.ANTHROPIC_API_KEY;
          if (projectEnv.ANTHROPIC_BASE_URL) baseUrl = projectEnv.ANTHROPIC_BASE_URL;
          if (projectEnv.MODEL) model = projectEnv.MODEL;
          source = 'project';
        }
      }
    } catch (err) {
      logger.debug({ err }, 'Failed to load project .env');
    }

    // Mask API key for security (show first 8 and last 4 chars)
    const maskedApiKey =
      apiKey.length > 12
        ? apiKey.slice(0, 8) + '****' + apiKey.slice(-4)
        : apiKey
          ? '****'
          : '';

    return {
      config: { apiKey: maskedApiKey, baseUrl, model },
      source,
    };
  }

  /**
   * Save LLM configuration to project .env file.
   * Preserves existing non-LLM configuration.
   */
  private saveLLMConfig(config: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  }): { apiKey: string; baseUrl: string; model: string } {
    const envPath = path.join(process.cwd(), '.env');
    let envContent = '';

    // Read existing .env if it exists
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    // Parse existing content
    const lines = envContent.split('\n');
    const updated: Record<string, string> = {};
    const preserveKeys = new Set(['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'MODEL']);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }
      if (!preserveKeys.has(key)) {
        updated[key] = value;
      }
    }

    // Add LLM config
    if (config.apiKey) updated.ANTHROPIC_API_KEY = config.apiKey;
    if (config.baseUrl) updated.ANTHROPIC_BASE_URL = config.baseUrl;
    if (config.model) updated.MODEL = config.model;

    // Build new .env content
    const newLines: string[] = [];
    newLines.push('# LLM Configuration');
    if (updated.ANTHROPIC_API_KEY) newLines.push(`ANTHROPIC_API_KEY= ${updated.ANTHROPIC_API_KEY}`);
    if (updated.ANTHROPIC_BASE_URL) newLines.push(`ANTHROPIC_BASE_URL= ${updated.ANTHROPIC_BASE_URL}`);
    if (updated.MODEL) newLines.push(`MODEL= ${updated.MODEL}`);
    newLines.push('');

    // Add other config
    for (const [key, value] of Object.entries(updated)) {
      if (!preserveKeys.has(key)) {
        newLines.push(`${key}= ${value}`);
      }
    }

    fs.writeFileSync(envPath, newLines.join('\n'));
    logger.info({ envPath }, 'LLM config saved to project .env');

    return {
      apiKey: config.apiKey || '',
      baseUrl: config.baseUrl || '',
      model: config.model || '',
    };
  }

  private handleMessage(ws: WebSocket, msg: any) {
    if (msg.type === WS_MSG_TYPES.ASK_USER_QUESTION_RESPONSE) {
      const response = msg as AskUserQuestionResponse;
      const handled = handleQuestionResponse(response);
      if (handled) {
        logger.info({ conversationId: response.conversationId, toolUseId: response.toolUseId }, 'Question response received from frontend');
      }
      return;
    }

    if (msg.type === WS_MSG_TYPES.SWITCH_CONVERSATION) {
      if (msg.workspaceId) {
        this.clientWorkspaces.set(ws, msg.workspaceId);
        this.chatJidWorkspaces.set(getWebChatJid(msg.workspaceId), msg.workspaceId);
      }
      if (msg.conversationId) {
        this.clientConversationIds.set(ws, msg.conversationId);
        logger.debug({ conversationId: msg.conversationId, workspaceId: msg.workspaceId }, 'Client switched conversation');
      }
      return;
    }

    if (msg.type === 'message' && msg.content) {
      const timestamp = new Date().toISOString();
      const sender = msg.sender || 'User';

      // Require workspaceId for message routing
      if (!msg.workspaceId) {
        logger.warn('Web IM message missing workspaceId, ignoring');
        return;
      }

      const workspaceId = msg.workspaceId;

      // Track workspace and conversation per client for response routing
      this.clientWorkspaces.set(ws, workspaceId);
      this.chatJidWorkspaces.set(getWebChatJid(workspaceId), workspaceId);
      if (msg.conversationId) {
        this.clientConversationIds.set(ws, msg.conversationId);
      }

      // Ensure group is registered for this workspace and get chatJid
      const chatJid = this.ensureWorkspaceGroupRegistered(workspaceId);

      // Store chat metadata
      this.opts.onChatMetadata(chatJid, timestamp, WEB_GROUP_NAME, 'web', false);

      // Embed attachment text into content so the agent can see it via the
      // messages table (which has no attachment column).
      let enrichedContent = msg.content;
      if (msg.attachment?.extractedText) {
        const attachBlock = [
          `[附件: ${msg.attachment.filename}]`,
          `---文件内容开始---`,
          msg.attachment.extractedText,
          `---文件内容结束---`,
          '',
          `原始文件已保存至: ${msg.attachment.filePath}`,
        ].join('\n');
        enrichedContent = `${attachBlock}\n\n${msg.content}`;
      }

      // Deliver message
      this.opts.onMessage(chatJid, {
        id: `web-${Date.now()}`,
        chat_jid: chatJid,
        sender: 'web-user',
        sender_name: sender,
        content: enrichedContent,
        timestamp,
        is_from_me: false,
        workspaceId: msg.workspaceId,
        conversationId: msg.conversationId,
        attachment: msg.attachment,
        skill: msg.skill,
      });

      logger.info({ sender, workspaceId, content: msg.content.slice(0, 50) }, 'Web IM message received');
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

    // Debug logging for tool_result
    if (data.type === 'tool_result') {
      logger.debug({ contentLength: data.content?.length || 0 }, 'Sending tool_result to WebSocket');
    }

    // Use conversationId from data if provided
    const conversationId = (data as any).conversationId;

    // Use workspaceId from data if provided, otherwise fallback to chatJid mapping
    const workspaceId = data.workspaceId ?? this.chatJidWorkspaces.get(jid);

    const timestamp = new Date().toISOString();

    const msg = {
      ...data,
      conversationId,
      workspaceId,
      timestamp,
    };

    // If conversationId is provided, route to the specific client
    // Otherwise broadcast to all clients (legacy behavior)
    if (conversationId) {
      for (const [client, clientConvId] of this.clientConversationIds) {
        if (clientConvId === conversationId && client.readyState === WebSocket.OPEN) {
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

  private sendToClient(ws: WebSocket, data: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  /**
   * Parse YAML frontmatter from a SKILL.md file.
   * Returns an object with name, nameZh, description fields.
   */
  private parseFrontmatter(content: string): { name?: string; nameZh?: string; description?: string } {
    const result: { name?: string; nameZh?: string; description?: string } = {};

    // Check for frontmatter block
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return result;

    const frontmatter = frontmatterMatch[1];

    // Parse name field
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
    if (nameMatch) {
      result.name = nameMatch[1].trim();
    }

    // Parse nameZh field (Chinese name)
    const nameZhMatch = frontmatter.match(/^nameZh:\s*(.+)$/m);
    if (nameZhMatch) {
      result.nameZh = nameZhMatch[1].trim();
    }

    // Parse description field
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    if (descMatch) {
      result.description = descMatch[1].trim();
    }

    return result;
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
}

registerChannel('web', (opts) => {
  const port = parseInt(process.env.WEB_IM_PORT || '3100', 10);
  return new WebChannel(port, opts);
});
