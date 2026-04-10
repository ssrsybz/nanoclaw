# NanoClaw Workspace Feature Design

**Date:** 2026-04-10
**Status:** Draft
**Author:** Claude + h3glove

## Overview

Add a workspace concept to NanoClaw's web UI, allowing users to select any folder on their computer as a workspace. Each workspace has its own isolated CLAUDE.md and `.claude/skills/` directory. The web UI provides workspace switching, CLAUDE.md editing, and skill selection per workspace.

## Requirements

1. User can add any folder on their computer as a workspace via the web UI
2. Each workspace has an isolated CLAUDE.md (auto-created if missing)
3. Each workspace's `.claude/skills/` directory is scanned and displayed
4. User can select/deselect skills per workspace (selected = active for agent)
5. User can edit CLAUDE.md and skill files via modal dialogs
6. Single chat interface with workspace switching (not separate chat windows)
7. Agent runs in the selected workspace directory with enabled skills loaded

## Type Definitions

```typescript
interface Workspace {
  id: string;              // UUID v4
  name: string;            // Display name (folder basename)
  path: string;            // Absolute filesystem path
  enabledSkills: string[]; // List of enabled skill names
  createdAt: string;       // ISO 8601
  lastUsedAt: string | null;
}

interface Skill {
  name: string;            // Skill directory name (e.g., "add-telegram")
  description: string;     // First line or description from SKILL.md
  path: string;            // Absolute path to skill directory
  enabled: boolean;        // Whether this skill is enabled for the workspace
  hasSkillMd: boolean;     // Whether SKILL.md exists
}
```

## Architecture

### Project Structure Changes

```
nanoclaw/
├── web/                              # NEW: React frontend project
│   ├── src/
│   │   ├── App.tsx                   # Three-panel layout
│   │   ├── components/
│   │   │   ├── WorkspaceSidebar.tsx  # Left panel: workspace list + add button
│   │   │   ├── ChatPanel.tsx         # Center: assistant-ui chat
│   │   │   ├── SkillsPanel.tsx       # Right panel: CLAUDE.md + skills with checkboxes
│   │   │   ├── EditModal.tsx         # Modal for editing CLAUDE.md or SKILL.md
│   │   │   └── FolderPicker.tsx      # Trigger backend folder picker
│   │   ├── hooks/
│   │   │   └── useWorkspace.ts       # Workspace state management (Zustand)
│   │   └── main.tsx
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── index.html
├── src/
│   ├── workspace.ts                  # NEW: Workspace management module
│   ├── channels/web.ts              # MODIFY: Add API endpoints, serve built static files
│   └── agent-runner.ts              # MODIFY: Accept workspacePath parameter
└── store/public/                     # React build output (served by web channel)
```

### Key Decision: Why Separate `web/` Directory

- Current UI is embedded HTML in `web.ts` (877 lines). Adding workspace features would make it unmaintainable.
- React + assistant-ui provides streaming, thinking process display, and Markdown rendering out of the box.
- `web/` is a self-contained Vite project. Build output goes to `store/public/`, which the existing web channel already supports serving (line 49-56 in web.ts).
- The single-process architecture is preserved. No Next.js, no SSR.

## Backend Design

### Database Schema

New `workspaces` table in SQLite:

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,              -- UUID v4
  name TEXT NOT NULL,               -- Display name (folder basename)
  path TEXT NOT NULL UNIQUE,        -- Absolute filesystem path
  enabled_skills TEXT DEFAULT '[]', -- JSON array of enabled skill names
  created_at TEXT NOT NULL,         -- ISO 8601 timestamp
  last_used_at TEXT                 -- ISO 8601 timestamp, updated on workspace switch
);
```

### Module: `src/workspace.ts`

Responsibilities:

| Function | Description |
|----------|-------------|
| `addWorkspace(path)` | Validate path exists and is a directory, insert into DB, auto-create CLAUDE.md if missing |
| `removeWorkspace(id)` | Delete DB record only. Never delete user files. |
| `listWorkspaces()` | Return all workspaces ordered by `last_used_at DESC` |
| `getWorkspace(id)` | Return single workspace by ID |
| `updateLastUsed(id)` | Update `last_used_at` timestamp |
| `scanSkills(workspacePath)` | Read `{workspace}/.claude/skills/*/SKILL.md`, return list with names and descriptions |
| `readClaudeMd(workspacePath)` | Read CLAUDE.md content |
| `writeClaudeMd(workspacePath, content)` | Write CLAUDE.md content |
| `readSkillFile(workspacePath, skillName)` | Read a specific skill's SKILL.md |
| `writeSkillFile(workspacePath, skillName, content)` | Write a specific skill's SKILL.md |
| `setEnabledSkills(id, skills)` | Update `enabled_skills` JSON array |
| `getEnabledSkills(id)` | Return enabled skills list |
| `validateWorkspacePath(path)` | Security: prevent path traversal, ensure path is within allowed scope |

Path validation rules:
- Must be an absolute path
- Must exist and be a directory
- Must not be a parent of NanoClaw's own data directories (`store/`, `data/`, `groups/`)
- Must not contain `..` segments after normalization
- Symlinks are resolved via `fs.realpathSync()` before validation
- System-sensitive directories (`/etc`, `/System`, `/usr`) are rejected
- NanoClaw's own project root is allowed as a workspace (useful for self-development)

### API Endpoints

Mounted on the existing WebChannel HTTP server. All endpoints prefixed with `/api/`.

| Method | Path | Request | Response | Description |
|--------|------|---------|----------|-------------|
| GET | `/api/workspaces` | - | `{ workspaces: Workspace[] }` | List all workspaces |
| POST | `/api/workspaces` | `{ path: string }` | `{ workspace: Workspace }` | Add workspace |
| DELETE | `/api/workspaces/:id` | - | `{ ok: true }` | Remove workspace record |
| GET | `/api/workspaces/:id/claude-md` | - | `{ content: string }` | Read CLAUDE.md |
| PUT | `/api/workspaces/:id/claude-md` | `{ content: string }` | `{ ok: true }` | Update CLAUDE.md |
| GET | `/api/workspaces/:id/skills` | - | `{ skills: Skill[] }` | List workspace skills |
| GET | `/api/workspaces/:id/skills/:name` | - | `{ content: string }` | Read skill file |
| PUT | `/api/workspaces/:id/skills/:name` | `{ content: string }` | `{ ok: true }` | Update skill file |
| PUT | `/api/workspaces/:id/enabled-skills` | `{ skills: string[] }` | `{ ok: true }` | Set enabled skills |
| POST | `/api/folder-picker` | - | `{ path: string \| null }` | Open native folder picker |
| PUT | `/api/workspaces/:id/last-used` | - | `{ ok: true }` | Update last-used timestamp |

### Folder Picker Implementation (Cross-Platform)

Platform detection at runtime:

```typescript
import { execFile } from 'child_process';
import platform from 'os';

async function openFolderPicker(): Promise<string | null> {
  const p = platform.platform();

  if (p === 'darwin') {
    // macOS: osascript native dialog
    return execOsascript();
  } else if (p === 'linux') {
    // Linux: try zenity first, fallback to text input on UI
    return execZenity();
  }
  // Fallback: return null, frontend shows manual path input
  return null;
}

function execOsascript(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose Workspace Folder")'], (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout.trim());
    });
  });
}

function execZenity(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('zenity', ['--file-selection', '--directory', '--title=Choose Workspace Folder'], (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout.trim());
    });
  });
}
```

When folder picker returns `null` (unsupported platform or cancelled), the frontend shows a text input for manual path entry as fallback.

### Agent Runner Modification

`runAgentDirect()` accepts an optional `workspacePath` parameter:

```typescript
interface AgentInput {
  // ... existing fields
  workspacePath?: string;  // If set, overrides group folder as cwd
  enabledSkills?: string[]; // Skills to inject into agent context
}
```

When `workspacePath` is provided:
- `cwd` is set to `workspacePath` instead of `resolveGroupFolderPath(groupFolder)`
- The agent automatically picks up CLAUDE.md from the workspace directory
- Enabled skills are loaded and injected (see Skill Injection below)

### Skill Injection Mechanism

Enabled skills are injected into the `systemPrompt` by concatenating content:

```
systemPrompt composition:
1. globalClaudeMd content (if exists, from groups/global/CLAUDE.md)
2. "---" separator
3. Each enabled skill's SKILL.md content, wrapped in markers:
   <!-- SKILL: {skillName} -->
   {skillContent}
   <!-- END SKILL: {skillName} -->
```

- Skills are appended after the global CLAUDE.md content
- The workspace's own CLAUDE.md is automatically loaded by the Agent SDK via `cwd` (no injection needed)
- Total injected content is capped at 32KB. If exceeded, skills are truncated with a warning appended
- This keeps the initial implementation simple; MCP-based tool injection (Option B) can be added later

### Workspace ↔ Group/Session Relationship

This is the critical integration point. The design choice is:

**Workspace is decoupled from Group.** Workspace messages still route through the existing `web:main` JID and Group, but with an additional workspace context layer.

**Routing flow:**
1. All workspace messages still use `web:main` as the JID for message routing
2. The `workspaceId` is carried alongside the message via WebSocket
3. In `index.ts` message processing, if a `workspaceId` is present, it resolves the workspace path and injects it into `AgentInput`
4. The agent runner uses `workspacePath` as `cwd` instead of the group folder

**Session management:**
- Agent sessions are keyed by `groupFolder + workspaceId` combination
- Session files stored at `data/sessions/{groupFolder}--ws-{workspaceId}/`
- This means each workspace gets its own agent session, even though they share the `web:main` group
- When switching workspaces, the previous workspace's session remains (can be resumed later)
- The existing `IDLE_TIMEOUT` mechanism cleans up stale sessions per-key

**Concurrency:**
- Workspaces share the `web:main` GroupQueue entry, so only one agent runs at a time per web client
- If a user sends a message while an agent is running in workspace A, then switches to workspace B and sends another message, the second message queues behind the first (existing GroupQueue behavior)
- No changes needed to `GroupQueue` — workspace context is simply a parameter on the same queue entry

**Interaction with existing features:**
- **Other channels (Discord, Feishu):** Not affected. They route through their own JIDs and groups without workspace context.
- **Scheduled tasks:** Tasks remain associated with `group_folder`. Workspace mode does not introduce workspace-specific scheduling in this iteration. Scheduled tasks in the `web-main` group will continue to use the group folder as cwd.
- **Message storage:** Messages are stored in the `messages` table under `chat_jid = 'web:main'`. A new column `workspace_id TEXT` is added to the `messages` table to associate messages with their workspace. The frontend uses this to filter/display workspace-specific chat history (if persistence is implemented in the future).
- **IPC:** Workspace-aware IPC uses `data/ipc/web-main--ws-{workspaceId}/` paths to avoid collision with the default `web-main` IPC.

### Database Migration

In addition to the `workspaces` table, add a column to existing `messages`:

```sql
ALTER TABLE messages ADD COLUMN workspace_id TEXT;
```

WebSocket message format updated to carry workspace context:

```json
{
  "type": "message",
  "content": "user text",
  "workspaceId": "uuid-of-current-workspace"
}
```

## Frontend Design

### Technology Stack

| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | UI framework |
| Vite | Build tool (dev server + production build) |
| assistant-ui | Chat components (streaming, thinking, Markdown) |
| Zustand | Workspace state management |
| Tailwind CSS | Styling (dark theme matching current design) |

### Layout

Three-panel responsive layout:

```
┌──────────────┬─────────────────────────┬──────────────────────┐
│  Workspace   │       Chat Area         │   Skills Panel       │
│  List        │                         │   (collapsible)      │
│  (240px)     │    (flex: 1)            │    (320px)           │
└──────────────┴─────────────────────────┴──────────────────────┘
```

### Left Panel: Workspace Sidebar

- Header: "Workspaces" with [+] add button
- List of workspace cards, each showing:
  - Workspace name (folder basename)
  - Truncated path
  - Active indicator (highlighted border/background)
- Click to switch workspace
- Right-click or long-press for remove option
- Empty state: "Add a workspace to get started" prompt

### Center Panel: Chat Area

- Uses `assistant-ui` components:
  - `Thread` component for message list
  - Streaming message rendering
  - Thinking/reasoning display (collapsible `ReasoningGroup`)
  - Markdown with code highlighting
  - Auto-scroll during streaming
- Input area with send button
- Workspace name displayed in header
- Welcome screen when no workspace is selected

### Right Panel: Skills Panel (Collapsible)

- Header shows current workspace name
- **CLAUDE.md section**: File icon + "CLAUDE.md" label + [Edit] button
  - Click opens EditModal
- **Skills section**: List of discovered skills
  - Each skill has a checkbox (selected = enabled for agent)
  - Skill name + [View] button
  - Click opens EditModal with skill content
- Checkbox state is persisted to backend (`enabled_skills` field)
- Empty state: "No skills found in .claude/skills/"

### EditModal Component

Shared modal for editing CLAUDE.md and SKILL.md files:

```
┌─────────────────────────────────────┐
│  Edit: CLAUDE.md                [x]  │
├─────────────────────────────────────┤
│                                     │
│  <textarea>                         │
│  (monospace font, full content)     │
│                                     │
├─────────────────────────────────────┤
│                     [Cancel] [Save] │
└─────────────────────────────────────┘
```

- Opens when clicking "Edit" on CLAUDE.md or "View" on a skill
- Full-screen textarea with monospace font
- Cancel discards changes, Save writes to file via API

### State Management (Zustand)

```typescript
interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  skills: Skill[];

  fetchWorkspaces: () => Promise<void>;
  addWorkspace: (path: string) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;

  fetchSkills: (workspaceId: string) => Promise<void>;
  toggleSkill: (workspaceId: string, skillName: string) => Promise<void>;

  editClaudeMd: (workspaceId: string, content: string) => Promise<void>;
  editSkill: (workspaceId: string, skillName: string, content: string) => Promise<void>;
}
```

## Data Flow

### Adding a Workspace

```
User clicks [+] → POST /api/folder-picker → osascript dialog
→ User selects folder → POST /api/workspaces { path }
→ Backend validates path, inserts DB, creates CLAUDE.md if needed
→ Frontend refreshes workspace list
```

### Switching Workspace

```
User clicks workspace in sidebar
→ Frontend updates activeWorkspaceId
→ PUT /api/workspaces/:id/last-used (backend updates timestamp)
→ GET /api/workspaces/:id/skills (load skills for new workspace)
→ Chat area clears or shows workspace-specific welcome
→ Agent cwd will be set to this workspace's path on next message
```

### Sending a Message

```
User types message + Ctrl+Enter
→ WebSocket sends { type: "message", content: "...", workspaceId: "..." }
→ Backend receives, resolves workspace path and enabled skills
→ agent-runner called with workspacePath + enabledSkills
→ Agent runs in workspace directory, loads CLAUDE.md + enabled skills
→ Response streamed via WebSocket
→ assistant-ui renders streaming response with thinking/Markdown
```

### Toggling a Skill

```
User checks/unchecks skill checkbox
→ PUT /api/workspaces/:id/enabled-skills { skills: [...] }
→ Backend updates enabled_skills JSON
→ Next agent invocation in this workspace will include/exclude the skill
```

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Workspace folder deleted externally | Show warning badge on workspace card, prompt user to remove or re-link |
| CLAUDE.md deleted externally | Auto-recreate on next workspace access |
| Skill directory missing | Show "No skills found" empty state |
| Folder picker cancelled | No action, return null |
| Path validation fails | Return 400 error with descriptive message |
| API error on save | Show toast notification, keep modal open with unsaved content |
| WebSocket disconnect | Auto-reconnect (existing behavior), show connection status |

## Security Considerations

- Path validation prevents traversal attacks (`..`, symlinks to sensitive dirs)
- Workspace paths are restricted from NanoClaw's own data directories
- API endpoints only accept workspace IDs from the database (not arbitrary paths)
- Folder picker uses native OS dialog (user must explicitly choose)
- Agent commands execute on host system (existing no-container mode trade-off)

## Migration & Compatibility

- Existing embedded HTML in `web.ts` is preserved as fallback
- **Static file serving change:** HTTP server checks for `store/public/index.html` first. If present, serves the React app. Otherwise falls back to checking `store/public/web-im.html`, then the embedded HTML.
- Existing groups and channels continue working unchanged
- Workspace feature is additive; no breaking changes to current functionality
- `npm run dev` script updated to also run Vite dev server concurrently (via `concurrently` npm package)
- `npm run build` updated to also build the React frontend (`cd web && npm run build`)
- Chat history is NOT persisted in this iteration — page refresh clears the chat UI. Agent sessions are preserved via session IDs, so conversation context survives, but the visual message history resets.

## Future Considerations (Out of Scope)

- Workspace-specific chat history persistence
- Multi-tab workspace support
- Skill creation wizard
- File browser within workspace
- Drag-and-drop workspace reordering
- Linux/Windows folder picker support
