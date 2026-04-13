# Workspace Conversations Design

## Overview

Implement per-workspace conversation history with independent sessions. Each workspace has isolated `CLAUDE.md` and skills, but conversations within a workspace share these resources while maintaining separate context/history.

## Architecture

### Two-Layer Isolation

1. **Workspace Layer (Strong Isolation)**
   - Each workspace has its own `CLAUDE.md`, skills, and file operation scope
   - Workspace is the unit of resource isolation

2. **Conversation Layer (Shared Resources)**
   - Multiple conversations per workspace share workspace's `CLAUDE.md` and skills
   - Each conversation has independent context/history

### Data Storage

**Database: SQLite (existing `db.ts`)**

### Database Schema

```sql
-- Conversations table
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  session_id TEXT,
  name TEXT NOT NULL DEFAULT '新对话',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

-- Conversation messages table
CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  parts TEXT,  -- JSON: [{"type": "text"|"thinking"|"tool_use", "text"|"thinking"|"toolName"|"toolInput": ...}]
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages(conversation_id);
```

**Schema Notes:**
- `updated_at` is updated on any message sent OR on rename
- `parts` stores rich content as JSON array (see ContentPart types below)
- `ON DELETE CASCADE`: deleting a conversation deletes all its messages

### Session Lifecycle

| State | `session_id` | Behavior |
|-------|--------------|----------|
| Conversation created | `NULL` | No session yet |
| First message sent | Created | New session started |
| Session transcript lost | `NULL` | Orphaned - creates new session on next message |
| Conversation deleted | N/A | Session file remains on disk (acceptable) |

### ContentPart JSON Structure

```typescript
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; toolName: string; toolInput?: string }
  | { type: 'tool_result'; text: string };
```

## API Design

All conversation endpoints are nested under workspaces to respect resource hierarchy.

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workspaces/:id/conversations` | GET | List all conversations in workspace |
| `/api/workspaces/:id/conversations` | POST | Create new conversation |
| `/api/workspaces/:id/conversations/:convId` | GET | Get conversation details |
| `/api/workspaces/:id/conversations/:convId` | PUT | Update conversation (name) |
| `/api/workspaces/:id/conversations/:convId` | DELETE | Delete conversation and its messages |
| `/api/workspaces/:id/conversations/:convId/messages` | GET | Get messages (paginated) |
| `/api/workspaces/:id/conversations/:convId/messages` | POST | Send message (start/resume session) |

### Response Shapes

**GET /api/workspaces/:id/conversations**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "workspaceId": "uuid",
      "name": "分析代码结构",
      "createdAt": "2026-04-13T...",
      "updatedAt": "2026-04-13T..."
    }
  ]
}
```

**POST /api/workspaces/:id/conversations**
```json
// Request: empty body
// Response: 201 Created
{
  "conversation": {
    "id": "uuid",
    "workspaceId": "uuid",
    "name": "新对话",
    "createdAt": "2026-04-13T...",
    "updatedAt": "2026-04-13T..."
  }
}
```

**PUT /api/workspaces/:id/conversations/:convId**
```json
// Request:
{ "name": "新的对话名称" }
// Response: 200 OK (returns updated conversation)
{
  "conversation": {
    "id": "uuid",
    "workspaceId": "uuid",
    "name": "新的对话名称",
    "createdAt": "2026-04-13T...",
    "updatedAt": "2026-04-13T..."
  }
}
```

**GET /api/workspaces/:id/conversations/:convId/messages**
```json
// Query params: ?limit=100&before=message_id (cursor-based)
// Response:
{
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "请帮我分析...",
      "parts": null,
      "createdAt": "2026-04-13T..."
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "这是一个...",
      "parts": [{"type": "thinking", "text": "..."}],
      "createdAt": "2026-04-13T..."
    }
  ],
  "hasMore": false,
  "nextCursor": null
}
```

**POST /api/workspaces/:id/conversations/:convId/messages**
```json
// Request:
{ "content": "用户输入的消息" }
// Response: 202 Accepted (async - agent processes in background)
{
  "message": {
    "id": "uuid",
    "role": "user",
    "content": "用户输入的消息",
    "parts": null,
    "createdAt": "2026-04-13T..."
  }
}
```

### Error Responses

All endpoints return consistent error shape:
```json
{
  "error": {
    "code": "NOT_FOUND" | "VALIDATION_ERROR" | "INTERNAL_ERROR",
    "message": "Human readable message",
    "details": {}  // optional field-level errors
  }
}
```

| Status | Code | When |
|--------|------|------|
| 400 | VALIDATION_ERROR | Invalid input |
| 404 | NOT_FOUND | Workspace or conversation not found |
| 500 | INTERNAL_ERROR | Server error |

## Naming Logic

1. **Creation**: Default name is "新对话"
2. **After first response**: Call LLM to summarize name based on first user message
3. **User can rename anytime**: Manual rename via PUT endpoint

## Frontend Changes

### Store (`web/src/store.ts`)

```typescript
interface Conversation {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceStore {
  // Conversations by workspace
  conversations: Record<string, Conversation[]>;  // workspaceId -> conversations
  activeConversationId: string | null;

  // Messages keyed by conversation (migrated from workspaceId)
  messages: Record<string, ChatMessage[]>;  // conversationId -> messages

  // Methods
  fetchConversations: (workspaceId: string) => Promise<void>;
  createConversation: (workspaceId: string) => Promise<Conversation>;
  switchConversation: (conversationId: string, workspaceId: string) => Promise<void>;
  renameConversation: (workspaceId: string, id: string, name: string) => Promise<void>;
  deleteConversation: (workspaceId: string, id: string) => Promise<void>;
  sendMessage: (content: string) => void;
}
```

### UI Structure

```
Workspace: banana-slides
├── Sidebar
│   ├── 对话列表
│   │   ├── 分析代码结构 (conversation)
│   │   ├── 新对话 (conversation)
│   │   └── + 新建对话
│   └── Skills
└── ChatPanel
    └── Messages (current conversation)
```

## WebSocket Message Flow

### Client → Server
```json
{
  "type": "message",
  "content": "用户消息",
  "conversationId": "uuid",
  "workspaceId": "uuid"
}
```

### Server → Client (Streaming)
```json
{
  "type": "assistant",
  "content": "助手回复",
  "conversationId": "uuid",
  "workspaceId": "uuid",
  "parts": [{"type": "thinking", "text": "..."}]
}
```

**Note:** `conversationId` is used instead of `workspaceId` for message routing.

## Implementation Order

1. **Database**: Add `conversations` and `conversation_messages` tables with migration
2. **Backend API**: Implement all conversation endpoints with proper error handling
3. **WebChannel**: Route by `conversationId` instead of `workspaceId`
4. **Frontend Store**: Refactor from `workspaceId` to `conversationId` keys
5. **UI Components**: Update sidebar (conversation list) and chat panel
6. **Auto-naming**: LLM summary after first response

## File Changes

| File | Changes |
|------|---------|
| `src/db.ts` | Add tables, migration, CRUD helpers |
| `src/channels/web.ts` | Use `conversationId` for routing, per-client tracking |
| `src/agent-runner.ts` | Accept `conversationId`, map to session |
| `src/index.ts` | Pass `conversationId` through message flow |
| `web/src/store.ts` | Add `conversations`, `activeConversationId`, refactor message keys |
| `web/src/App.tsx` | Handle conversation switching, update WebSocket |
| `web/src/components/WorkspaceSidebar.tsx` | Show conversation list with CRUD |
| `web/src/components/ChatPanel.tsx` | Display current conversation, send via conversationId |

## Concurrent Access

- Each browser tab with the same conversation shares the same session
- Messages are appended, not replaced
- No optimistic locking on `updated_at` (eventual consistency acceptable for this use case)
