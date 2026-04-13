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
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- Conversation messages table
CREATE TABLE conversation_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  parts TEXT,  -- JSON array of rich content parts
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages(conversation_id);
```

## API Design

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/workspaces/:id/conversations` | GET | List all conversations in workspace |
| `/api/workspaces/:id/conversations` | POST | Create new conversation |
| `/api/conversations/:id` | GET | Get conversation details |
| `/api/conversations/:id` | PUT | Update conversation (name) |
| `/api/conversations/:id` | DELETE | Delete conversation |
| `/api/conversations/:id/messages` | GET | Get all messages in conversation |
| `/api/conversations/:id/messages` | POST | Send message to conversation (legacy fallback) |

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
// Response:
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

**PUT /api/conversations/:id**
```json
// Request:
{ "name": "新的对话名称" }
// Response:
{ "ok": true }
```

**GET /api/conversations/:id/messages**
```json
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
  ]
}
```

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
  // Replace/add
  conversations: Record<string, Conversation[]>;  // workspaceId -> conversations
  activeConversationId: string | null;

  // Messages keyed by conversation
  messages: Record<string, ChatMessage[]>;  // conversationId -> messages

  // Methods
  fetchConversations: (workspaceId: string) => Promise<void>;
  createConversation: (workspaceId: string) => Promise<Conversation>;
  switchConversation: (conversationId: string, workspaceId: string) => Promise<void>;
  renameConversation: (id: string, name: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
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

## Implementation Order

1. **Database**: Add `conversations` and `conversation_messages` tables
2. **Backend API**: Implement all conversation endpoints
3. **WebChannel**: Use conversation_id for message routing
4. **Frontend Store**: Add conversation state and API calls
5. **UI Components**: Update sidebar and chat panel for conversations
6. **Auto-naming**: LLM summary after first response

## Session Integration

- Each conversation maps to one Claude Agent SDK session
- `session_id` stored in `conversations` table
- When switching conversations, resume corresponding session
- When creating conversation, start new session

## File Changes

- `src/db.ts`: Add tables and migration
- `src/channels/web.ts`: Route by conversation_id
- `src/agent-runner.ts`: Accept conversation_id, manage session mapping
- `web/src/store.ts`: Add conversation state
- `web/src/App.tsx`: Handle conversation switching
- `web/src/components/WorkspaceSidebar.tsx`: Show conversation list
- `web/src/components/ChatPanel.tsx`: Display current conversation
