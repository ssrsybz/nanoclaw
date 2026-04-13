# Workspace Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement per-workspace conversation history with independent sessions, auto-naming, and CRUD operations.

**Architecture:** SQLite-backed conversation storage with REST API, WebSocket routing by conversationId, frontend state refactored from workspaceId to conversationId keys.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), WebSocket, React/Zustand

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/db.ts` | Add `conversations` and `conversation_messages` tables, CRUD helpers |
| `src/channels/web.ts` | Per-client conversationId tracking, message routing by conversationId |
| `src/agent-runner.ts` | Accept `conversationId`, manage session mapping |
| `src/index.ts` | Pass `conversationId` through message flow |
| `web/src/store.ts` | Conversation state, message keys refactored to conversationId |
| `web/src/App.tsx` | Conversation switching, WebSocket updates |
| `web/src/components/WorkspaceSidebar.tsx` | Conversation list with create/delete/rename |
| `web/src/components/ChatPanel.tsx` | Display current conversation |

---

## Tasks

### Task 1: Database Schema & CRUD

**Files:**
- Modify: `src/db.ts` (add tables + helpers)
- Create: `src/db-conversations.test.ts` (tests)

- [ ] **Step 1: Write failing test for conversation CRUD**

```typescript
// src/db-conversations.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase, getDb } from './db.js';
import {
  createConversation,
  getConversationsByWorkspace,
  getConversation,
  updateConversation,
  deleteConversation,
  addConversationMessage,
  getConversationMessages,
} from './db-conversations.js';

describe('conversation CRUD', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabase(db);
  });

  it('creates a conversation with default name', () => {
    const conv = createConversation(db, 'workspace-1');
    expect(conv.name).toBe('新对话');
    expect(conv.workspaceId).toBe('workspace-1');
  });

  it('lists conversations by workspace', () => {
    createConversation(db, 'ws-1');
    createConversation(db, 'ws-1');
    createConversation(db, 'ws-2');
    const ws1Convs = getConversationsByWorkspace(db, 'ws-1');
    expect(ws1Convs.length).toBe(2);
  });

  it('updates conversation name', () => {
    const conv = createConversation(db, 'ws-1');
    updateConversation(db, conv.id, '新名称');
    const updated = getConversation(db, conv.id);
    expect(updated?.name).toBe('新名称');
  });

  it('deletes conversation and its messages', () => {
    const conv = createConversation(db, 'ws-1');
    addConversationMessage(db, conv.id, 'user', 'Hello');
    addConversationMessage(db, conv.id, 'assistant', 'Hi');
    deleteConversation(db, conv.id);
    expect(getConversationsByWorkspace(db, 'ws-1').find(c => c.id === conv.id)).toBeUndefined();
    expect(getConversationMessages(db, conv.id).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db-conversations.test.ts`
Expected: FAIL with "createConversation not defined"

- [ ] **Step 3: Implement table creation and CRUD in db.ts**

Add to `src/db.ts`:

```typescript
// --- Conversation helpers ---

export interface ConversationRow {
  id: string;
  workspace_id: string;
  session_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: string | null;
  created_at: string;
}

export function createConversation(
  db: Database.Database,
  workspaceId: string,
): ConversationRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversations (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
  ).run(id, workspaceId, '新对话', now, now);
  return { id, workspace_id: workspaceId, session_id: null, name: '新对话', created_at: now, updated_at: now };
}

export function getConversationsByWorkspace(
  db: Database.Database,
  workspaceId: string,
): ConversationRow[] {
  return db
    .prepare(`SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC`)
    .all(workspaceId) as ConversationRow[];
}

export function getConversation(db: Database.Database, id: string): ConversationRow | null {
  return db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as ConversationRow | null;
}

export function updateConversation(
  db: Database.Database,
  id: string,
  name: string,
): void {
  db.prepare(`UPDATE conversations SET name = ?, updated_at = ? WHERE id = ?`)
    .run(name, new Date().toISOString(), id);
}

export function deleteConversation(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM conversation_messages WHERE conversation_id = ?`).run(id);
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

export function addConversationMessage(
  db: Database.Database,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  parts?: string,
): ConversationMessageRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversation_messages (id, conversation_id, role, content, parts, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, conversationId, role, content, parts ?? null, now);
  // Update conversation updated_at
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(now, conversationId);
  return { id, conversation_id: conversationId, role, content, parts: parts ?? null, created_at: now };
}

export function getConversationMessages(
  db: Database.Database,
  conversationId: string,
  limit = 100,
  before?: string,
): ConversationMessageRow[] {
  if (before) {
    return db
      .prepare(
        `SELECT * FROM conversation_messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(conversationId, before, limit) as ConversationMessageRow[];
  }
  return db
    .prepare(
      `SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`
    )
    .all(conversationId, limit) as ConversationMessageRow[];
}
```

- [ ] **Step 4: Add migration to create tables in initDatabase**

In `createSchema()`, add:

```typescript
database.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    session_id TEXT,
    name TEXT NOT NULL DEFAULT '新对话',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS conversation_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    parts TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages(conversation_id);
`);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db-conversations.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db.ts src/db-conversations.test.ts
git commit -m "feat(db): add conversations and conversation_messages tables with CRUD"
```

---

### Task 2: WebChannel Conversation Routing

**Files:**
- Modify: `src/channels/web.ts` (conversationId tracking + per-client workspace/conversation maps)

- [ ] **Step 1: Add conversationId tracking to WebChannel class**

In `WebChannel` class, replace the Map tracking:

```typescript
// Track workspace and conversation per client for response routing
private clientConversationIds: Map<WebSocket, string> = new Map();
private clientWorkspaceIds: Map<WebSocket, string> = new Map();
```

- [ ] **Step 2: Update handleMessage to track conversationId**

```typescript
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
    // Track workspace and conversation per client
    if (msg.workspaceId) {
      this.clientWorkspaceIds.set(ws, msg.workspaceId);
    }
    if (msg.conversationId) {
      this.clientConversationIds.set(ws, msg.conversationId);
      this.chatJidWorkspaces.set(WEB_JID, msg.workspaceId || '');
    }
    // ... rest of existing logic
  }
}
```

- [ ] **Step 3: Update sendStructured to route by conversationId**

```typescript
async sendStructured(jid: string, data: StreamMessage): Promise<void> {
  if (!this.wss) return;

  // Get conversationId and workspaceId from data or fallbacks
  const conversationId = data.conversationId ?? this.clientConversationIds.get(/* find client */);
  const workspaceId = data.workspaceId ?? Array.from(this.clientWorkspaceIds.values())[0];

  const msg = {
    ...data,
    conversationId,
    workspaceId,
    timestamp: new Date().toISOString(),
  };

  for (const client of this.clients) {
    const clientConvId = this.clientConversationIds.get(client);
    // Only send to client if conversationId matches or is broadcast
    if (clientConvId === conversationId || !conversationId) {
      this.sendToClient(client, msg);
    }
  }
}
```

**Note:** Need to track which client sent which conversation. Update to store a Map of client → {workspaceId, conversationId}.

- [ ] **Step 4: Update client disconnect cleanup**

```typescript
ws.on('close', () => {
  this.clients.delete(ws);
  this.clientWorkspaces.delete(ws);
  this.clientConversationIds.delete(ws);  // ADD THIS
  this.clientWorkspaceIds.delete(ws);       // ADD THIS
});
```

- [ ] **Step 5: Commit**

```bash
git add src/channels/web.ts
git commit -m "feat(web): add per-client conversationId tracking for message routing"
```

---

### Task 3: API Endpoints for Conversations

**Files:**
- Modify: `src/channels/web.ts` (add conversation API routes)

- [ ] **Step 1: Add conversation API routes in handleApiRequest**

Add routes after existing workspace routes:

```typescript
// GET /api/workspaces/:id/conversations
const convListMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/conversations$/);
if (convListMatch && method === 'GET') {
  const workspaceId = convListMatch[1];
  const ws = workspace.getWorkspace(db, workspaceId);
  if (!ws) { sendError(404, 'Workspace not found'); return; }
  const conversations = getConversationsByWorkspace(db, workspaceId);
  sendJson(200, { conversations });
  return;
}

// POST /api/workspaces/:id/conversations
if (convListMatch && method === 'POST') {
  const workspaceId = convListMatch[1];
  const ws = workspace.getWorkspace(db, workspaceId);
  if (!ws) { sendError(404, 'Workspace not found'); return; }
  const conversation = createConversation(db, workspaceId);
  sendJson(201, { conversation });
  return;
}

// Conversation detail routes
const convDetailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/conversations\/([^/]+)$/);
if (convDetailMatch) {
  const workspaceId = convDetailMatch[1];
  const convId = convDetailMatch[2];
  const ws = workspace.getWorkspace(db, workspaceId);
  if (!ws) { sendError(404, 'Workspace not found'); return; }
  const conversation = getConversation(db, convId);
  if (!conversation) { sendError(404, 'Conversation not found'); return; }

  if (method === 'GET') {
    sendJson(200, { conversation });
  } else if (method === 'PUT') {
    const body = JSON.parse(await readBody());
    if (typeof body.name !== 'string') { sendError(400, 'Missing name'); return; }
    updateConversation(db, convId, body.name);
    sendJson(200, { conversation: getConversation(db, convId) });
  } else if (method === 'DELETE') {
    deleteConversation(db, convId);
    sendJson(200, { ok: true });
  }
  return;
}

// GET/POST /api/workspaces/:id/conversations/:convId/messages
const convMsgMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/conversations\/([^/]+)\/messages$/);
if (convMsgMatch && method === 'GET') {
  const convId = convMsgMatch[2];
  const messages = getConversationMessages(db, convId);
  sendJson(200, { messages, hasMore: false, nextCursor: null });
  return;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/channels/web.ts
git commit -m "feat(api): add conversation CRUD and message endpoints"
```

---

### Task 4: Frontend Store - Conversation State

**Files:**
- Modify: `web/src/store.ts` (add conversation state + refactor message keys)

- [ ] **Step 1: Add conversation interfaces and state**

```typescript
export interface Conversation {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceStore {
  // ... existing state ...

  // NEW: Conversations
  conversations: Record<string, Conversation[]>;  // workspaceId -> conversations
  activeConversationId: string | null;

  // Refactor messages to be keyed by conversationId
  messages: Record<string, ChatMessage[]>;  // conversationId -> messages

  // Methods
  fetchConversations: (workspaceId: string) => Promise<void>;
  createConversation: (workspaceId: string) => Promise<Conversation | null>;
  switchConversation: (conversationId: string) => void;
  renameConversation: (workspaceId: string, id: string, name: string) => Promise<void>;
  deleteConversation: (workspaceId: string, id: string) => Promise<void>;
  // ...
}
```

- [ ] **Step 2: Implement conversation methods**

```typescript
fetchConversations: async (workspaceId) => {
  try {
    const res = await fetch(`/api/workspaces/${workspaceId}/conversations`);
    const data = await res.json();
    set(state => ({
      conversations: { ...state.conversations, [workspaceId]: data.conversations || [] }
    }));
  } catch (err) {
    console.error('Failed to fetch conversations:', err);
  }
},

createConversation: async (workspaceId) => {
  try {
    const res = await fetch(`/api/workspaces/${workspaceId}/conversations`, { method: 'POST' });
    const data = await res.json();
    if (data.conversation) {
      set(state => ({
        conversations: {
          ...state.conversations,
          [workspaceId]: [...(state.conversations[workspaceId] || []), data.conversation]
        },
        activeConversationId: data.conversation.id,
        messages: { ...state.messages, [data.conversation.id]: [] }
      }));
      return data.conversation;
    }
  } catch (err) {
    console.error('Failed to create conversation:', err);
  }
  return null;
},

switchConversation: (conversationId) => {
  set({ activeConversationId: conversationId });
},

renameConversation: async (workspaceId, id, name) => {
  try {
    await fetch(`/api/workspaces/${workspaceId}/conversations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    set(state => ({
      conversations: {
        ...state.conversations,
        [workspaceId]: state.conversations[workspaceId]?.map(c =>
          c.id === id ? { ...c, name } : c
        ) || []
      }
    }));
  } catch (err) {
    console.error('Failed to rename conversation:', err);
  }
},

deleteConversation: async (workspaceId, id) => {
  try {
    await fetch(`/api/workspaces/${workspaceId}/conversations/${id}`, { method: 'DELETE' });
    set(state => {
      const { [id]: _, ...restMessages } = state.messages;
      return {
        conversations: {
          ...state.conversations,
          [workspaceId]: state.conversations[workspaceId]?.filter(c => c.id !== id) || []
        },
        messages: restMessages,
        activeConversationId: state.activeConversationId === id ? null : state.activeConversationId
      };
    });
  } catch (err) {
    console.error('Failed to delete conversation:', err);
  }
},
```

- [ ] **Step 3: Update fetchWorkspaces to also fetch conversations**

```typescript
fetchWorkspaces: async () => {
  try {
    const res = await fetch('/api/workspaces');
    const data = await res.json();
    set({ workspaces: data.workspaces || [] });
    // Fetch conversations for active workspace if set
    const activeWs = data.workspaces?.[0];
    if (activeWs) {
      await get().fetchConversations(activeWs.id);
    }
  } catch (err) {
    console.error('Failed to fetch workspaces:', err);
  }
},
```

- [ ] **Step 4: Commit**

```bash
git add web/src/store.ts
git commit -m "feat(store): add conversation state and CRUD methods"
```

---

### Task 5: Frontend WebSocket - Conversation Routing

**Files:**
- Modify: `web/src/App.tsx` (update WebSocket to include conversationId)

- [ ] **Step 1: Update nanoclaw-send event to include conversationId**

```typescript
window.addEventListener('nanoclaw-send', handleSend);

const handleSend = (e: Event) => {
  const { content, workspaceId } = (e as CustomEvent).detail;
  const ws = wsRef.current;
  const conversationId = activeConversationIdRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  setTyping(true);
  ws.send(JSON.stringify({
    type: 'message',
    content,
    workspaceId,
    conversationId
  }));
};
```

- [ ] **Step 2: Update WebSocket message handler to route by conversationId**

```typescript
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    const conversationId = data.conversationId || activeConversationIdRef.current;
    if (!conversationId) return;

    // ... existing switch for types, but use conversationId for routing
  } catch { }
};
```

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(app): add conversationId to WebSocket message routing"
```

---

### Task 6: UI - Conversation List Sidebar

**Files:**
- Modify: `web/src/components/WorkspaceSidebar.tsx` (show conversation list)

- [ ] **Step 1: Render conversation list**

Add conversation list section:

```tsx
// In sidebar, below workspace selector
<div className="conversations-section">
  <div className="section-header">
    <span>对话</span>
    <button onClick={() => createConversation(activeWorkspaceId!)}>+</button>
  </div>
  <div className="conversation-list">
    {conversations[activeWorkspaceId!]?.map(conv => (
      <div
        key={conv.id}
        className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
        onClick={() => switchConversation(conv.id)}
      >
        <span className="conv-name">{conv.name}</span>
        <button
          className="delete-btn"
          onClick={(e) => { e.stopPropagation(); deleteConversation(activeWorkspaceId!, conv.id); }}
        >×</button>
      </div>
    ))}
  </div>
</div>
```

- [ ] **Step 2: Add conversation switcher to switchWorkspace**

```typescript
switchWorkspace: async (id) => {
  set({ activeWorkspaceId: id, activeConversationId: null });
  try {
    await fetch(`/api/workspaces/${id}/last-used`, { method: 'PUT' });
  } catch { }
  await get().fetchSkills();
  await get().fetchConversations(id);
  // Auto-select first conversation or create new
  const convs = get().conversations[id];
  if (convs && convs.length > 0) {
    set({ activeConversationId: convs[0].id });
  } else {
    await get().createConversation(id);
  }
},
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/WorkspaceSidebar.tsx
git commit -m "feat(sidebar): add conversation list with create/delete/switch"
```

---

### Task 7: UI - Chat Panel Updates

**Files:**
- Modify: `web/src/components/ChatPanel.tsx` (display current conversation)

- [ ] **Step 1: Update to use conversationId for messages**

The chat panel should read messages from `messages[activeConversationId]` instead of `messages[activeWorkspaceId]`.

- [ ] **Step 2: Commit**

```bash
git add web/src/components/ChatPanel.tsx
git commit -m "feat(chat): update to use conversationId for message routing"
```

---

### Task 8: Auto-Naming After First Response

**Files:**
- Modify: `src/agent-runner.ts` (call LLM to summarize first message)

- [ ] **Step 1: After agent completes first response, summarize conversation name**

In `runAgentDirect`, after the first `result` message is received:

```typescript
if (result.newSessionId && isFirstMessage) {
  // Update conversation with session_id
  updateConversationSession(db, conversationId, result.newSessionId);

  // If this is first user message (name is still "新对话"), summarize
  const conv = getConversation(db, conversationId);
  if (conv?.name === '新对话') {
    const firstMsg = getConversationMessages(db, conversationId);
    const userMsg = firstMsg.find(m => m.role === 'user');
    if (userMsg) {
      const summary = await summarizeConversation(userMsg.content);
      if (summary) {
        updateConversation(db, conversationId, summary);
      }
    }
  }
}
```

- [ ] **Step 2: Implement summarizeConversation function**

```typescript
async function summarizeConversation(firstMessage: string): Promise<string | null> {
  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const result = await query({
      prompt: `请为以下对话生成一个简短的中文名称（最多10个字），概括用户的问题主题：\n\n${firstMessage}`,
      options: { model: MODEL, env: sdkEnv },
    });
    // Extract text from result
    const summary = extractText(result);
    return summary.slice(0, 10);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/agent-runner.ts
git commit -m "feat(agent): auto-name conversation after first response"
```

---

## Summary

Total: 8 tasks, ~16 steps

**Order:** Task 1 (DB) → Task 2 (WebChannel) → Task 3 (API) → Task 4 (Store) → Task 5 (WebSocket) → Task 6 (Sidebar) → Task 7 (ChatPanel) → Task 8 (Auto-naming)

Each task produces working, testable software. Commit after each task.
