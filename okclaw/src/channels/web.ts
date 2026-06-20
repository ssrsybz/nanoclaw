import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { WebSocket, WebSocketServer } from 'ws';
import busboy from 'busboy';
import { networkInterfaces } from 'os';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  STORE_DIR,
  PROJECT_ROOT,
} from '../config.js';
import {
  parseFile,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
} from '../file-parser.js';
import { parseSkillMd } from '../skill-parser.js';
import { getDb, addConversationMessage } from '../db.js';
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
  Workspace,
} from '../types.js';
import { BUILTIN_SKILLS, type BuiltinSkill } from '../builtin-skills.js';
import {
  handleQuestionResponse,
  processIPCResponses,
} from '../question-responder.js';

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
  // Get the active conversationId for a workspace (returns null if no agent running)
  getActiveConversationId?: (workspaceId: string) => string | null;
  // Cancel the active agent for a workspace (returns true if cancelled)
  cancelAgent?: (workspaceId: string) => boolean;
}

// ============ Heartbeat Configuration ============
const HEARTBEAT_INTERVAL = 30000; // Send ping every 30 seconds
const HEARTBEAT_TIMEOUT = 10000; // Terminate if no pong within 10 seconds

// ============ Agent State Tracking ============
interface AgentState {
  conversationId: string;
  workspaceId: string;
  status: 'running' | 'complete' | 'error';
  startedAt: number;
  // Message buffer for reconnection recovery
  messageBuffer: Array<{
    index: number;
    type: string;
    data: StreamMessage;
  }>;
}

const MESSAGE_BUFFER_SIZE = 200; // Keep last 200 parts per agent
const AGENT_STATE_TTL = 5 * 60 * 1000; // Keep state for 5 minutes after completion

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
  // Session mappings for remote control
  private sessionIdToJid = new Map<string, string>();
  private jidToSessionId = new Map<string, string>();

  // ============ Connection Stability: Heartbeat + Agent State + Multi-connection ============
  // Per-connection heartbeat timers (keyed by WebSocket instance)
  private heartbeatTimers = new Map<WebSocket, NodeJS.Timeout>();
  // Agent state tracking for reconnection recovery
  private agentStates = new Map<string, AgentState>();
  // Active connection per conversationId (for multi-tab handling)
  private activeConnections = new Map<string, WebSocket>();

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

      // ============ Heartbeat: start ping/pong cycle ============
      this.startHeartbeat(ws);

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
        this.stopHeartbeat(ws);
        // Clean up active connection mapping
        for (const [convId, conn] of this.activeConnections) {
          if (conn === ws) {
            this.activeConnections.delete(convId);
          }
        }
        logger.info(
          { clientCount: this.clients.size },
          'Web IM client disconnected',
        );
      });

      ws.on('error', (err) => {
        logger.error({ err }, 'Web IM client error');
        this.clients.delete(ws);
        this.stopHeartbeat(ws);
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

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
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

  private serveStaticFile(
    res: http.ServerResponse,
    filePath: string,
    contentType: string,
  ) {
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
  ) {
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

    const parseMultipart = (): Promise<{
      file: Buffer;
      filename: string;
      mimeType: string;
    }> => {
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
            reject(
              new Error(
                `文件大小超过限制 (${MAX_FILE_SIZE / 1024 / 1024}MB)，请压缩后重试`,
              ),
            );
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

      // Route: PUT /api/workspaces/:id/icon — set or clear workspace avatar
      const iconMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/icon$/);
      if (iconMatch && method === 'PUT') {
        const id = iconMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        try {
          const body = JSON.parse(await readBody());
          workspace.setWorkspaceIcon(db, id, body.icon !== undefined ? body.icon : null);
          const updated = workspace.getWorkspace(db, id);
          sendJson(200, { workspace: updated });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Invalid icon';
          sendError(400, message);
        }
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

      // Route: GET /api/workspaces/:id/files
      const workspaceFilesMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/files$/,
      );
      if (workspaceFilesMatch && method === 'GET') {
        const id = workspaceFilesMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        try {
          const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
          const requestedPath = url.searchParams.get('path') || '.';
          const result = workspace.listWorkspaceFiles(ws.path, requestedPath);
          sendJson(200, result);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to list files';
          sendError(message.includes('escapes') ? 403 : 400, message);
        }
        return;
      }

      // Route: GET /api/workspaces/:id/files/preview
      const workspaceFilePreviewMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/files\/preview$/,
      );
      if (workspaceFilePreviewMatch && method === 'GET') {
        const id = workspaceFilePreviewMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        try {
          const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
          const requestedPath = url.searchParams.get('path');
          if (!requestedPath) {
            sendError(400, 'Missing required query parameter: path');
            return;
          }
          const preview = await workspace.previewWorkspaceFile(ws.path, requestedPath);
          sendJson(200, preview);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to preview file';
          sendError(message.includes('escapes') ? 403 : 400, message);
        }
        return;
      }

      // Route: POST /api/workspaces/:id/files/context
      const workspaceFileContextMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/files\/context$/,
      );
      if (workspaceFileContextMatch && method === 'POST') {
        const id = workspaceFileContextMatch[1];
        const ws = workspace.getWorkspace(db, id);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }
        try {
          const body = JSON.parse(await readBody());
          if (typeof body.path !== 'string' || !body.path.trim()) {
            sendError(400, 'Missing required field: path');
            return;
          }
          const attachment = await workspace.workspaceFileToAttachment(id, ws.path, body.path);
          sendJson(200, { attachment });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to add file context';
          sendError(message.includes('escapes') ? 403 : 400, message);
        }
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
        sendJson(200, { skills });
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

      // Route: GET /api/workspaces/:id/skills/:name/content
      const skillContentMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/skills\/([^/]+)\/content$/,
      );
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
            skillType: skill.skillType,
            source: skill.source,
            readOnly: skill.readOnly,
          });
        }

        // Add system skills from skills/ directory (using unified parser)
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
              const parsed = parseSkillMd(content);
              const fm = parsed.frontmatter;
              skillsByCategory.system.push({
                name: fm.name || entry.name,
                nameZh: fm.nameZh,
                description: fm.description || '',
                path: skillPath,
                enabled: true,
                hasSkillMd: true,
                category: fm.category || 'system',
                icon: fm.icon,
                isSystem: true,
                skillType: fm.skillType || 'operational',
                source: fm.source || 'system',
                allowedTools: fm['allowed-tools'],
                dependencies: fm.dependencies,
                version: fm.version,
                author: fm.author,
                readOnly: true, // System skills are read-only in UI
              });
            } catch {
              // Skip skills with read errors
            }
          }
        }

        // Add host-side installable skills from .claude/skills/
        const claudeSkillsDir = path.join(PROJECT_ROOT, '.claude', 'skills');
        if (fs.existsSync(claudeSkillsDir)) {
          const entries = fs.readdirSync(claudeSkillsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const skillPath = path.join(claudeSkillsDir, entry.name);
            const skillMdPath = path.join(skillPath, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) continue;

            try {
              const content = fs.readFileSync(skillMdPath, 'utf-8');
              const parsed = parseSkillMd(content);
              const fm = parsed.frontmatter;
              const targetCategory = fm.category || 'channel';
              if (!skillsByCategory[targetCategory]) {
                // Fallback to system if category doesn't exist
                skillsByCategory.system.push({
                  name: fm.name || entry.name,
                  nameZh: fm.nameZh,
                  description: fm.description || '',
                  path: skillPath,
                  enabled: true,
                  hasSkillMd: true,
                  category: targetCategory,
                  icon: fm.icon,
                  skillType: fm.skillType || 'feature',
                  source: 'system',
                  allowedTools: fm['allowed-tools'],
                  dependencies: fm.dependencies,
                  version: fm.version,
                  author: fm.author,
                  readOnly: false, // Installable skills can be invoked/installed
                });
              } else {
                skillsByCategory[targetCategory].push({
                  name: fm.name || entry.name,
                  nameZh: fm.nameZh,
                  description: fm.description || '',
                  path: skillPath,
                  enabled: true,
                  hasSkillMd: true,
                  category: targetCategory,
                  icon: fm.icon,
                  skillType: fm.skillType || 'feature',
                  source: 'system',
                  allowedTools: fm['allowed-tools'],
                  dependencies: fm.dependencies,
                  version: fm.version,
                  author: fm.author,
                  readOnly: false,
                });
              }
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
              skillsByCategory.workspace.push(s);
            }
          }
        }

        sendJson(200, { skills: skillsByCategory });
        return;
      }

      // Route: GET /api/system-skills
      if (pathname === '/api/system-skills' && method === 'GET') {
        const skillsDir = path.join(PROJECT_ROOT, 'skills');
        const skills: Array<Skill> = [];

        if (fs.existsSync(skillsDir)) {
          const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;

            const skillPath = path.join(skillsDir, entry.name);
            const skillMdPath = path.join(skillPath, 'SKILL.md');

            if (!fs.existsSync(skillMdPath)) continue;

            try {
              const content = fs.readFileSync(skillMdPath, 'utf-8');
              const parsed = parseSkillMd(content);
              const fm = parsed.frontmatter;
              skills.push({
                name: fm.name || entry.name,
                nameZh: fm.nameZh,
                description: fm.description || '',
                path: skillPath,
                enabled: true,
                hasSkillMd: true,
                category: fm.category || 'system',
                icon: fm.icon,
                isSystem: true,
                skillType: fm.skillType || 'operational',
                source: 'system',
                allowedTools: fm['allowed-tools'],
                dependencies: fm.dependencies,
                readOnly: true,
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
      const systemSkillContentMatch = pathname.match(
        /^\/api\/system-skills\/([^/]+)\/content$/,
      );
      if (systemSkillContentMatch && method === 'GET') {
        const skillName = decodeURIComponent(systemSkillContentMatch[1]);
        // Try skills/ first, then .claude/skills/ as fallback
        const systemPath = path.join(PROJECT_ROOT, 'skills', skillName, 'SKILL.md');
        const featurePath = path.join(PROJECT_ROOT, '.claude', 'skills', skillName, 'SKILL.md');
        const skillMdPath = fs.existsSync(systemPath) ? systemPath : (fs.existsSync(featurePath) ? featurePath : null);

        if (!skillMdPath || !fs.existsSync(skillMdPath)) {
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

      // Route: GET /api/skills/content?source=system|workspace&name=xxx[&workspaceId=xxx]
      // Unified skill content endpoint for both system and workspace skills
      if (pathname === '/api/skills/content' && method === 'GET') {
        const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
        const source = url.searchParams.get('source') || 'system';
        const skillName = url.searchParams.get('name');
        const wsId = url.searchParams.get('workspaceId');

        if (!skillName) {
          sendError(400, 'Missing required parameter: name');
          return;
        }

        let skillMdPath: string | null = null;

        if (source === 'workspace' && wsId) {
          const ws = workspace.getWorkspace(db, wsId);
          if (!ws) {
            sendError(404, 'Workspace not found');
            return;
          }
          skillMdPath = path.join(ws.path, '.claude', 'skills', skillName, 'SKILL.md');
        } else if (source === 'feature') {
          // Feature skills live in .claude/skills/
          skillMdPath = path.join(PROJECT_ROOT, '.claude', 'skills', skillName, 'SKILL.md');
        } else {
          // System skills: try skills/ first, then .claude/skills/ as fallback
          const systemPath = path.join(PROJECT_ROOT, 'skills', skillName, 'SKILL.md');
          const featurePath = path.join(PROJECT_ROOT, '.claude', 'skills', skillName, 'SKILL.md');
          skillMdPath = fs.existsSync(systemPath) ? systemPath : (fs.existsSync(featurePath) ? featurePath : null);
        }

        if (!skillMdPath || !fs.existsSync(skillMdPath)) {
          sendError(404, 'Skill not found');
          return;
        }

        try {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const parsed = parseSkillMd(content);
          sendJson(200, {
            name: skillName,
            content,
            frontmatter: parsed.frontmatter,
            hasFrontmatter: parsed.hasFrontmatter,
            warnings: parsed.warnings,
            errors: parsed.errors,
          });
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

      // Route: GET /api/icons/search — proxy to Iconify search API
      if (pathname === '/api/icons/search' && method === 'GET') {
        const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
        const query = url.searchParams.get('query') || '';
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '48', 10), 96);
        const prefix = url.searchParams.get('prefix') || '';

        if (!query || query.length < 2) {
          sendError(400, 'Query must be at least 2 characters');
          return;
        }

        try {
          const params = new URLSearchParams({ query, limit: String(limit) });
          if (prefix) params.set('prefix', prefix);
          const iconifyRes = await fetch(`https://api.iconify.design/search?${params}`);
          if (!iconifyRes.ok) {
            sendError(502, 'Iconify search failed');
            return;
          }
          const data = await iconifyRes.json();
          sendJson(200, data);
        } catch (err) {
          logger.error({ err }, 'Iconify search proxy error');
          sendError(502, 'Failed to search icons');
        }
        return;
      }

      // Route: GET /api/icons/svg — proxy to Iconify SVG API
      if (pathname === '/api/icons/svg' && method === 'GET') {
        const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
        const iconName = url.searchParams.get('icon') || '';

        if (!iconName) {
          sendError(400, 'Missing required parameter: icon');
          return;
        }

        // Split on first colon only to handle icon names that may contain colons
        const colonIdx = iconName.indexOf(':');
        if (colonIdx < 1 || colonIdx === iconName.length - 1) {
          sendError(400, 'Invalid icon name format. Expected: prefix:name');
          return;
        }
        const prefix = iconName.slice(0, colonIdx);
        const name = iconName.slice(colonIdx + 1);

        try {
          const iconifyRes = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`);
          if (!iconifyRes.ok) {
            sendError(404, `Icon not found: ${iconName}`);
            return;
          }
          const svgText = await iconifyRes.text();
          sendJson(200, { icon: iconName, svg: svgText });
        } catch (err) {
          logger.error({ err }, 'Iconify SVG proxy error');
          sendError(502, 'Failed to fetch icon SVG');
        }
        return;
      }

      // Route: GET /api/directory-list — browse server directories
      if (pathname === '/api/directory-list' && method === 'GET') {
        const requestedPath =
          new URL(
            req.url ?? '/',
            `http://localhost:${this.port}`,
          ).searchParams.get('path') || os.homedir();
        const resolvedPath = path.resolve(requestedPath);

        // Block system directories
        const blockedPrefixes = [
          '/etc',
          '/usr',
          '/sys',
          '/proc',
          '/dev',
          '/boot',
          '/sbin',
          '/bin',
          '/lib',
        ];
        if (
          blockedPrefixes.some(
            (p) => resolvedPath === p || resolvedPath.startsWith(p + '/'),
          )
        ) {
          sendJson(200, { path: resolvedPath, directories: [] });
          return;
        }

        try {
          const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
          const directories = entries
            .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
            .map((e) => ({
              name: e.name,
              path: path.join(resolvedPath, e.name),
            }))
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
        getLastAssistantMessage,
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
              messages.length > 0
                ? messages[messages.length - 1].created_at
                : null,
          });
          return;
        }
      }

      // Route: GET /api/workspaces/:id/agent-states
      // Returns which conversations in a workspace currently have a running agent.
      const agentStatesMatch = pathname.match(
        /^\/api\/workspaces\/([^/]+)\/agent-states$/,
      );
      if (agentStatesMatch && method === 'GET') {
        const workspaceId = agentStatesMatch[1];
        const result: Record<string, string> = {};
        for (const [convId, state] of this.agentStates) {
          if (state.workspaceId === workspaceId && state.status === 'running') {
            result[convId] = 'running';
          }
        }
        sendJson(200, { agentStates: result });
        return;
      }

      // Route: GET /api/conversations/:convId/messages/last-assistant
      const lastAssistantMatch = pathname.match(
        /^\/api\/conversations\/([^/]+)\/messages\/last-assistant$/,
      );
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

          const uploadUrl = new URL(
            req.url ?? '/',
            `http://localhost:${this.port}`,
          );
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
          const message =
            err instanceof Error ? err.message : 'Failed to save config';
          sendError(500, message);
        }
        return;
      }

      // Route: GET /api/remote-control/config - Get remote control configuration
      if (pathname === '/api/remote-control/config' && method === 'GET') {
        // 云中继服务器地址
        const cloudRelayUrl = 'http://43.167.222.20';

        // 本地 terminal-service 地址
        const terminalServiceUrl = 'http://localhost:3002';

        sendJson(200, {
          enabled: true,
          version: '1.0',
          cloudRelayUrl: cloudRelayUrl,
          terminalServiceUrl: terminalServiceUrl,
          localCloudRelayUrl: 'http://localhost:3000',
          localTerminalServiceUrl: 'http://localhost:3002',
          apps: {
            ios: {
              name: 'OKClaw Remote',
              url: '/download/okclaw-remote-ios',
              appId: 'com.okclaw.remote',
            },
            android: {
              name: 'OKClaw Remote',
              url: '/download/okclaw-remote-android.apk',
              appId: 'com.okclaw.remote',
            },
          },
          buildInstructions: {
            flutterProject: './flutter_doubao_副本/flutter_doubao_app',
            commands: {
              android: 'flutter build apk --release',
              ios: 'flutter build ios --release',
            },
          },
          steps: [
            {
              step: 1,
              title: '下载 App',
              description: '下载 OKClaw Remote 控制端',
            },
            {
              step: 2,
              title: '扫码连接',
              description: '使用 App 扫描二维码连接电脑',
            },
            {
              step: 3,
              title: '开始控制',
              description: '在手机上查看对话、发送消息、批准权限',
            },
          ],
        });
        return;
      }

      // Route: GET /api/remote-control/status - Check remote control services status
      if (pathname === '/api/remote-control/status' && method === 'GET') {
        try {
          const cloudRelayHealth = await fetch('http://43.167.222.20/health')
            .then((r) => r.json())
            .catch(() => null);
          const terminalHealth = await fetch('http://localhost:3002/health')
            .then((r) => r.json())
            .catch(() => null);

          sendJson(200, {
            cloudRelay: cloudRelayHealth ? 'online' : 'offline',
            terminalService: terminalHealth ? 'online' : 'offline',
            overall: cloudRelayHealth && terminalHealth ? 'online' : 'partial',
          });
        } catch {
          sendJson(200, {
            cloudRelay: 'offline',
            terminalService: 'offline',
            overall: 'offline',
          });
        }
        return;
      }

      // Route: GET /api/remote-control/workspaces
      if (pathname === '/api/remote-control/workspaces' && method === 'GET') {
        const workspaces = workspace.listWorkspaces(db);
        sendJson(200, {
          workspaces: workspaces.map((ws: Workspace) => ({
            id: ws.id,
            name: ws.name,
            path: ws.path,
            lastUsedAt: ws.lastUsedAt,
          })),
        });
        return;
      }

      // Route: POST /api/remote-control/bind
      if (pathname === '/api/remote-control/bind' && method === 'POST') {
        const body = JSON.parse(await readBody());
        const { sessionId, workspaceId, conversationId } = body;

        // 验证工作空间存在
        const ws = workspace.getWorkspace(db, workspaceId);
        if (!ws) {
          sendError(404, 'Workspace not found');
          return;
        }

        // 存储 sessionId → chatJid 映射
        const chatJid = getWebChatJid(workspaceId);
        this.sessionIdToJid.set(sessionId, chatJid);
        this.jidToSessionId.set(chatJid, sessionId);

        // 通知 terminal-service 绑定工作空间
        try {
          await fetch('http://localhost:3002/bridge/bind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, workspaceId, conversationId }),
          });
        } catch (error) {
          logger.warn({ error }, 'Failed to notify terminal-service of bind');
        }

        sendJson(200, { ok: true, chatJid, workspaceName: ws.name });
        return;
      }

      // Route: POST /api/remote-control/inject
      if (pathname === '/api/remote-control/inject' && method === 'POST') {
        const body = JSON.parse(await readBody());

        // 验证必要字段
        if (!body.workspaceId || !body.content) {
          sendError(400, 'Missing required fields: workspaceId, content');
          return;
        }

        const { workspaceId, conversationId, content, sender, sender_name } =
          body;
        const chatJid = getWebChatJid(workspaceId);
        const timestamp = new Date().toISOString();

        // 确保群组已注册
        this.ensureWorkspaceGroupRegistered(workspaceId);

        // 复用现有的消息注入逻辑
        this.opts.onMessage(chatJid, {
          id: `remote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          chat_jid: chatJid,
          sender: sender || 'remote-user',
          sender_name: sender_name || 'Remote User',
          content,
          timestamp,
          is_from_me: false,
          workspaceId,
          conversationId,
        });

        sendJson(200, { ok: true, chatJid });
        return;
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
      logger.info(
        { jid: chatJid, workspaceId },
        'Web IM workspace group registered',
      );
    }

    return chatJid;
  }

  /**
   * Load LLM configuration with project-level override support.
   * Priority: project .env (highest) > global settings.json (default)
   */
  private loadLLMConfig(): {
    config: { apiKey: string; baseUrl: string; model: string };
    source: string;
  } {
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

        if (
          projectEnv.ANTHROPIC_API_KEY ||
          projectEnv.ANTHROPIC_BASE_URL ||
          projectEnv.MODEL
        ) {
          if (projectEnv.ANTHROPIC_API_KEY)
            apiKey = projectEnv.ANTHROPIC_API_KEY;
          if (projectEnv.ANTHROPIC_BASE_URL)
            baseUrl = projectEnv.ANTHROPIC_BASE_URL;
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
    const preserveKeys = new Set([
      'ANTHROPIC_API_KEY',
      'ANTHROPIC_BASE_URL',
      'MODEL',
    ]);

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
    if (updated.ANTHROPIC_API_KEY)
      newLines.push(`ANTHROPIC_API_KEY= ${updated.ANTHROPIC_API_KEY}`);
    if (updated.ANTHROPIC_BASE_URL)
      newLines.push(`ANTHROPIC_BASE_URL= ${updated.ANTHROPIC_BASE_URL}`);
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
        logger.info(
          {
            conversationId: response.conversationId,
            toolUseId: response.toolUseId,
          },
          'Question response received from frontend',
        );
      }
      return;
    }

    // ============ Reconnection Recovery ============
    if (msg.type === 'resume') {
      const { conversationId, lastReceivedIndex } = msg;
      logger.info(
        { conversationId, lastReceivedIndex },
        'Reconnection: client requesting resume',
      );

      // Register this connection as active for the conversation
      if (conversationId) {
        this.clientConversationIds.set(ws, conversationId);
        this.registerActiveConnection(ws, conversationId);
      }

      const state = conversationId
        ? this.agentStates.get(conversationId)
        : undefined;

      if (!state || !conversationId) {
        // No active agent for this conversation
        this.sendToClient(ws, {
          type: 'agent_state',
          conversationId,
          status: 'none',
        });
        return;
      }

      if (state.status === 'running') {
        // Agent is still running — replay missed messages
        const fromIndex = lastReceivedIndex ?? 0;
        const missedMessages = state.messageBuffer.filter(
          (m) => m.index >= fromIndex,
        );

        logger.info(
          {
            conversationId,
            fromIndex,
            missedCount: missedMessages.length,
            bufferSize: state.messageBuffer.length,
          },
          'Reconnection: replaying missed messages',
        );

        this.sendToClient(ws, {
          type: 'agent_resumed',
          conversationId,
          status: 'running',
          missedMessages,
          totalParts: state.messageBuffer.length,
        });
      } else if (state.status === 'complete' || state.status === 'error') {
        // Agent already finished — let frontend know
        this.sendToClient(ws, {
          type: 'agent_state',
          conversationId,
          status: state.status,
        });
      }

      return;
    }

    if (msg.type === WS_MSG_TYPES.SWITCH_CONVERSATION) {
      if (msg.workspaceId) {
        this.clientWorkspaces.set(ws, msg.workspaceId);
        this.chatJidWorkspaces.set(
          getWebChatJid(msg.workspaceId),
          msg.workspaceId,
        );
      }
      if (msg.conversationId) {
        this.clientConversationIds.set(ws, msg.conversationId);
        logger.debug(
          { conversationId: msg.conversationId, workspaceId: msg.workspaceId },
          'Client switched conversation',
        );
      }
      // Check if there's an active agent for this workspace and send typing status
      if (msg.workspaceId && this.opts.getActiveConversationId) {
        const activeConvId = this.opts.getActiveConversationId(msg.workspaceId);
        if (activeConvId && activeConvId === msg.conversationId) {
          // Send typing indicator for the active conversation
          this.sendToClient(ws, {
            type: 'typing',
            conversationId: activeConvId,
          });
        }
      }
      return;
    }

    // Handle stop message - cancel the active agent
    if (msg.type === 'stop') {
      const workspaceId = this.clientWorkspaces.get(ws);
      if (workspaceId && this.opts.cancelAgent) {
        const cancelled = this.opts.cancelAgent(workspaceId);
        logger.info(
          { workspaceId, cancelled },
          'Stop request received, agent cancellation attempted',
        );
        // Send stream_end to tell frontend the turn is complete
        const conversationId = this.clientConversationIds.get(ws);
        if (conversationId) {
          this.sendToClient(ws, {
            type: 'stream_end',
            conversationId,
            workspaceId,
          });
        }
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

      // Promote workspace to top (WeChat-style: active workspace comes first)
      workspace.updateLastUsed(getDb(), workspaceId);

      // Ensure group is registered for this workspace and get chatJid
      const chatJid = this.ensureWorkspaceGroupRegistered(workspaceId);

      // Store chat metadata
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        WEB_GROUP_NAME,
        'web',
        false,
      );

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

      // Backend persists the user message directly so the conversation history
      // stays complete even if the frontend is no longer subscribed (workspace
      // switched / page closed). The frontend no longer POSTs user messages.
      if (msg.conversationId) {
        try {
          addConversationMessage(
            getDb(),
            msg.conversationId,
            'user',
            enrichedContent,
            undefined,
            msg.attachment ? JSON.stringify(msg.attachment) : undefined,
          );
        } catch (err) {
          logger.error(
            { err, conversationId: msg.conversationId },
            'Failed to persist user message to DB',
          );
        }
      }

      // Deliver message
      this.opts.onMessage(chatJid, {
        id: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

      logger.info(
        { sender, workspaceId, content: msg.content.slice(0, 50) },
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

    // Debug logging for tool_result
    if (data.type === 'tool_result') {
      logger.debug(
        { contentLength: data.content?.length || 0 },
        'Sending tool_result to WebSocket',
      );
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

    // Broadcast to ALL connected clients - let frontend filter by conversationId.
    // This ensures messages reach the client even if user switched to another
    // workspace/conversation while the agent was running. Frontend uses the
    // conversationId to route to the correct conversation in its store.
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        this.sendToClient(client, msg);
      }
    }

    // 同时推送到 terminal-service (如果有绑定的远程会话)
    const sessionId = this.jidToSessionId.get(jid);
    if (sessionId) {
      await this.pushToTerminalService(sessionId, data);
    }

    // ============ Buffer message for reconnection recovery ============
    // Token-level deltas (text_delta/thinking_delta) are NOT buffered — they
    // would overflow MESSAGE_BUFFER_SIZE instantly and replaying hundreds of
    // tokens on reconnect is pointless (the full block is buffered instead).
    // Only block-level events are buffered for running-turn replay.
    if (
      conversationId &&
      data.type !== 'text_delta' &&
      data.type !== 'thinking_delta'
    ) {
      const state = this.agentStates.get(conversationId);
      if (state && state.status === 'running') {
        state.messageBuffer.push({
          index: state.messageBuffer.length,
          type: data.type,
          data: msg as StreamMessage,
        });
        // Trim to keep buffer bounded
        if (state.messageBuffer.length > MESSAGE_BUFFER_SIZE) {
          state.messageBuffer.shift();
        }
      }
    }
  }

  private async pushToTerminalService(
    sessionId: string,
    data: StreamMessage,
  ): Promise<void> {
    try {
      await fetch('http://localhost:3002/bridge/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, data }),
      });
    } catch (error) {
      logger.debug({ error, sessionId }, 'Failed to push to terminal-service');
    }
  }

  private sendToClient(ws: WebSocket, data: unknown) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // ============ Heartbeat Methods ============

  /**
   * Start heartbeat for a WebSocket connection.
   * Uses setTimeout for true timeout detection:
   * - Send ping, wait up to HEARTBEAT_TIMEOUT for pong
   * - If pong received, schedule next ping after HEARTBEAT_INTERVAL
   * - If timeout, terminate the dead connection
   */
  private startHeartbeat(ws: WebSocket): void {
    let pingTimer: NodeJS.Timeout | null = null;
    let pongTimer: NodeJS.Timeout | null = null;

    const scheduleNext = () => {
      pingTimer = setTimeout(() => {
        // Send ping
        ws.ping();
        // Set timeout for pong response
        pongTimer = setTimeout(() => {
          logger.info('WebSocket heartbeat timeout, terminating dead connection');
          ws.terminate();
        }, HEARTBEAT_TIMEOUT);
      }, HEARTBEAT_INTERVAL);
      // Store both timers so we can cancel on close
      this.heartbeatTimers.set(ws, pingTimer);
    };

    ws.on('pong', () => {
      // Clear the pong timeout — connection is alive
      if (pongTimer) {
        clearTimeout(pongTimer);
        pongTimer = null;
      }
      // Schedule next heartbeat cycle
      scheduleNext();
    });

    // Start first heartbeat cycle
    scheduleNext();
  }

  /**
   * Stop heartbeat for a WebSocket connection.
   */
  private stopHeartbeat(ws: WebSocket): void {
    const timer = this.heartbeatTimers.get(ws);
    if (timer) {
      clearTimeout(timer);
      this.heartbeatTimers.delete(ws);
    }
  }

  // ============ Agent State Methods ============

  /**
   * Register that an agent has started for a conversation.
   * Called from index.ts when the agent begins processing.
   */
  startAgentState(conversationId: string, workspaceId: string): void {
    this.agentStates.set(conversationId, {
      conversationId,
      workspaceId,
      status: 'running',
      startedAt: Date.now(),
      messageBuffer: [],
    });
    logger.info(
      { conversationId, workspaceId, activeAgents: this.agentStates.size },
      'Agent state: started',
    );
    this.broadcastAgentStateChanged(conversationId, workspaceId, 'running');
  }

  /**
   * Mark an agent as completed and schedule cleanup.
   * Called from index.ts when the agent finishes.
   */
  endAgentState(conversationId: string): void {
    const state = this.agentStates.get(conversationId);
    if (state) {
      state.status = 'complete';
      logger.info(
        { conversationId, bufferSize: state.messageBuffer.length },
        'Agent state: completed',
      );
      this.broadcastAgentStateChanged(
        conversationId,
        state.workspaceId,
        'complete',
      );
      // Keep state for a while to allow reconnection recovery
      setTimeout(() => {
        this.agentStates.delete(conversationId);
        logger.debug(
          { conversationId },
          'Agent state: cleaned up after TTL',
        );
      }, AGENT_STATE_TTL);
    }
  }

  /**
   * Mark an agent as errored.
   */
  errorAgentState(conversationId: string): void {
    const state = this.agentStates.get(conversationId);
    if (state) {
      state.status = 'error';
      this.broadcastAgentStateChanged(
        conversationId,
        state.workspaceId,
        'error',
      );
      // Same TTL cleanup as complete
      setTimeout(() => {
        this.agentStates.delete(conversationId);
      }, AGENT_STATE_TTL);
    }
  }

  /**
   * Broadcast a running-state change to every client currently viewing the
   * workspace, so sidebars can show/hide the running indicator in real time —
   * even for conversations the user has switched away from.
   */
  private broadcastAgentStateChanged(
    conversationId: string,
    workspaceId: string,
    status: 'running' | 'complete' | 'error',
  ): void {
    const msg = {
      type: 'agent_state_changed',
      conversationId,
      workspaceId,
      status,
      timestamp: Date.now(),
    };
    for (const [client, wsId] of this.clientWorkspaces) {
      if (wsId === workspaceId && client.readyState === WebSocket.OPEN) {
        this.sendToClient(client, msg);
      }
    }
  }

  // ============ Multi-connection Management ============

  /**
   * Register a connection as the active one for a conversation.
   * If another connection is already active, notify it that it's been replaced.
   */
  private registerActiveConnection(ws: WebSocket, conversationId: string): void {
    const existingConn = this.activeConnections.get(conversationId);
    if (
      existingConn &&
      existingConn !== ws &&
      existingConn.readyState === WebSocket.OPEN
    ) {
      // Notify the old connection that it's been replaced
      this.sendToClient(existingConn, {
        type: 'connection_replaced',
        conversationId,
        message: '您的连接已在其他地方打开，当前连接已断开。',
      });
      existingConn.close();
      logger.info(
        { conversationId },
        'Multi-connection: replaced existing connection',
      );
    }
    this.activeConnections.set(conversationId, ws);
  }


  isConnected(): boolean {
    return this.httpServer !== null && this.wss !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('web:');
  }

  async disconnect(): Promise<void> {
    // Stop all heartbeat timers
    for (const timer of this.heartbeatTimers.values()) {
      clearTimeout(timer);
    }
    this.heartbeatTimers.clear();

    // Close all WebSocket connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.activeConnections.clear();
    this.agentStates.clear();

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
