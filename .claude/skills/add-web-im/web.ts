import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocket, WebSocketServer } from 'ws';

import { ASSISTANT_NAME, STORE_DIR } from '../config.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
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

  constructor(port: number, opts: WebChannelOpts) {
    this.port = port;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // Ensure public directory exists
    const publicDir = path.join(STORE_DIR, 'public');
    const htmlFile = path.join(publicDir, 'web-im.html');

    // Create HTTP server
    this.httpServer = http.createServer((req, res) => {
      if (req.url === '/' || req.url === '/index.html') {
        // Serve the HTML file
        if (fs.existsSync(htmlFile)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(fs.readFileSync(htmlFile));
        } else {
          // Serve embedded HTML if file doesn't exist
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.getEmbeddedHtml());
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.info({ clientCount: this.clients.size }, 'Web IM client connected');

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
        resolve();
      });
      this.httpServer!.on('error', reject);
    });
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

  private handleMessage(ws: WebSocket, msg: { type: string; content?: string; sender?: string }): void {
    if (msg.type === 'message' && msg.content) {
      const timestamp = new Date().toISOString();
      const sender = msg.sender || 'User';

      // Store chat metadata
      this.opts.onChatMetadata(WEB_JID, timestamp, WEB_GROUP_NAME, 'web', false);

      // Deliver message
      this.opts.onMessage(WEB_JID, {
        id: `web-${Date.now()}`,
        chat_jid: WEB_JID,
        sender: 'web-user',
        sender_name: sender,
        content: msg.content,
        timestamp,
        is_from_me: false,
      });

      logger.info({ sender, content: msg.content.slice(0, 50) }, 'Web IM message received');
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.wss) {
      logger.warn('Web IM server not initialized');
      return;
    }

    const message = {
      type: 'message',
      content: text,
      sender: ASSISTANT_NAME,
      timestamp: new Date().toISOString(),
    };

    // Broadcast to all connected clients
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        this.sendToClient(client, message);
      }
    }

    logger.info({ jid, length: text.length }, 'Web IM message sent');
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
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; height: 100vh; display: flex; flex-direction: column; }
    .header { background: #1a1a2e; color: white; padding: 16px 20px; display: flex; align-items: center; gap: 12px; }
    .header h1 { font-size: 18px; font-weight: 600; }
    .status { font-size: 12px; opacity: 0.7; }
    .status.connected { color: #4ade80; }
    .status.disconnected { color: #f87171; }
    .chat-container { flex: 1; overflow-y: auto; padding: 20px; }
    .message { margin-bottom: 16px; display: flex; flex-direction: column; }
    .message.user { align-items: flex-end; }
    .message.assistant { align-items: flex-start; }
    .message-content { max-width: 70%; padding: 12px 16px; border-radius: 16px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    .message.user .message-content { background: #1a1a2e; color: white; border-bottom-right-radius: 4px; }
    .message.assistant .message-content { background: white; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
    .message-meta { font-size: 11px; color: #999; margin-top: 4px; }
    .typing-indicator { display: none; padding: 12px 16px; background: white; border-radius: 16px; margin-bottom: 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
    .typing-indicator.active { display: inline-block; }
    .typing-indicator span { animation: blink 1.4s infinite both; }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink { 0%, 80%, 100% { opacity: 0; } 40% { opacity: 1; } }
    .input-container { background: white; padding: 16px 20px; border-top: 1px solid #e5e5e5; display: flex; gap: 12px; }
    .input-container textarea { flex: 1; padding: 12px 16px; border: 1px solid #e5e5e5; border-radius: 24px; resize: none; font-size: 14px; outline: none; font-family: inherit; }
    .input-container textarea:focus { border-color: #1a1a2e; }
    .input-container button { padding: 12px 24px; background: #1a1a2e; color: white; border: none; border-radius: 24px; cursor: pointer; font-size: 14px; font-weight: 500; }
    .input-container button:hover { background: #2d2d4a; }
    .input-container button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="header">
    <h1>NanoClaw</h1>
    <span class="status" id="status">connecting...</span>
  </div>
  <div class="chat-container" id="chat"></div>
  <div class="typing-indicator" id="typing"><span>.</span><span>.</span><span>.</span></div>
  <div class="input-container">
    <textarea id="input" placeholder="Type a message..." rows="1"></textarea>
    <button id="send">Send</button>
  </div>
  <script>
    const chat = document.getElementById('chat');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    const status = document.getElementById('status');
    const typing = document.getElementById('typing');
    let ws;
    let assistantName = 'Assistant';

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
          assistantName = msg.assistantName || 'Assistant';
        } else if (msg.type === 'message') {
          addMessage(msg.content, 'assistant', msg.sender || assistantName);
          typing.classList.remove('active');
        } else if (msg.type === 'typing') {
          typing.classList.add('active');
          chat.scrollTop = chat.scrollHeight;
        }
      };
    }

    function addMessage(content, type, sender) {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.innerHTML = '<div class="message-content">' + escapeHtml(content) + '</div>' +
        '<div class="message-meta">' + escapeHtml(sender) + ' · ' + new Date().toLocaleTimeString() + '</div>';
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
      ws.send(JSON.stringify({ type: 'message', content }));
      input.value = '';
    }

    send.onclick = sendMessage;
    input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

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
