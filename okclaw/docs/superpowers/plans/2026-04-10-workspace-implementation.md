# Workspace Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace management to OKClaw, allowing users to select computer folders as workspaces with isolated CLAUDE.md and skills, powered by a new React + assistant-ui frontend.

**Architecture:** Backend adds a `workspace.ts` module with SQLite storage, API endpoints on the existing WebChannel HTTP server, and workspace-aware agent invocation. Frontend is a separate React app in `web/` using Vite, assistant-ui for streaming chat, Zustand for state, and Tailwind CSS for styling. Build output goes to `store/public/` served by the existing web channel.

**Tech Stack:** TypeScript (backend), React 18 + Vite + assistant-ui + Zustand + Tailwind CSS (frontend), SQLite (storage), WebSocket (realtime)

**Design Spec:** `docs/superpowers/specs/2026-04-10-workspace-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/types.ts` | Append `Workspace` and `Skill` interfaces |
| `src/workspace.ts` | Workspace CRUD, path validation, skill scanning, CLAUDE.md management |
| `src/workspace.test.ts` | Tests for workspace module |
| `web/package.json` | React project manifest |
| `web/vite.config.ts` | Vite build config, proxy /api and /ws to backend |
| `web/tailwind.config.ts` | Tailwind dark theme config |
| `web/index.html` | SPA entry point |
| `web/postcss.config.js` | PostCSS for Tailwind |
| `web/tsconfig.json` | Frontend TypeScript config |
| `web/src/main.tsx` | React entry point |
| `web/src/App.tsx` | Three-panel layout |
| `web/src/store.ts` | Zustand workspace store |
| `web/src/components/WorkspaceSidebar.tsx` | Left panel: workspace list |
| `web/src/components/ChatPanel.tsx` | Center: assistant-ui chat |
| `web/src/components/SkillsPanel.tsx` | Right panel: skills + CLAUDE.md |
| `web/src/components/EditModal.tsx` | Modal editor for CLAUDE.md / skills |

### Modified Files

| File | Change |
|------|--------|
| `src/db.ts:17-149` | Add `workspaces` table to `createSchema()`, add `workspace_id` migration to messages |
| `src/agent-runner.ts:29-38` | Add `workspacePath?` and `enabledSkills?` to `AgentInput` |
| `src/agent-runner.ts:99-103,292,533` | Use `workspacePath` as cwd when provided, inject skills into systemPrompt |
| `src/channels/web.ts:46-61` | Expand HTTP server with API routes and static file serving for React build |
| `src/channels/web.ts:76-96` | Parse `workspaceId` from WebSocket messages |
| `src/index.ts:368-469` | Pass workspace context through message processing to agent invocation |
| `package.json:7-21` | Add concurrently, update dev/build scripts |

---

## Phase 1: Backend Foundation

### Task 1: Add TypeScript Types

**Files:**
- Modify: `src/types.ts` (append after line 73)

- [ ] **Step 1: Add Workspace and Skill interfaces**

Append to `src/types.ts`:

```typescript
export interface Workspace {
  id: string;
  name: string;
  path: string;
  enabledSkills: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Skill {
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  hasSkillMd: boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/h3glove/projeck/okclaw && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(workspace): add Workspace and Skill type definitions"
```

---

### Task 2: Database Schema Migration

**Files:**
- Modify: `src/db.ts:17-149` (createSchema + migrations)

- [ ] **Step 1: Write the test**

Create `src/db.test.ts` addition — add a test case within the existing test file:

```typescript
// Add to existing db.test.ts describe block
test('workspaces table is created', () => {
  const db = _initTestDatabase();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspaces'").all();
  expect(tables).toHaveLength(1);
});

test('messages table has workspace_id column', () => {
  const db = _initTestDatabase();
  const info = db.pragma('table_info(messages)');
  const col = info.find((c: any) => c.name === 'workspace_id');
  expect(col).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL — workspaces table not found

- [ ] **Step 3: Add workspaces table to createSchema()**

In `src/db.ts`, inside `createSchema()` function (after the `registered_groups` table, around line 84), add:

```typescript
db.exec(`CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  enabled_skills TEXT DEFAULT '[]',
  created_at TEXT NOT NULL,
  last_used_at TEXT
)`);
```

- [ ] **Step 4: Add workspace_id migration to messages**

In the migration section of `createSchema()` (after the existing try/catch blocks, around line 148), add:

```typescript
try {
  db.exec('ALTER TABLE messages ADD COLUMN workspace_id TEXT');
} catch {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/db.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat(workspace): add workspaces table and workspace_id column"
```

---

### Task 3: Workspace Module — Core CRUD

**Files:**
- Create: `src/workspace.ts`
- Create: `src/workspace.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/workspace.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { _initTestDatabase } from './db.js';
import { addWorkspace, removeWorkspace, listWorkspaces, getWorkspace, updateLastUsed, validateWorkspacePath } from './workspace.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('workspace', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    db = _initTestDatabase();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'okclaw-ws-test-'));
  });

  test('addWorkspace creates record and returns workspace', () => {
    const ws = addWorkspace(db, tmpDir);
    expect(ws.name).toBe(path.basename(tmpDir));
    expect(ws.path).toBe(tmpDir);
    expect(ws.enabledSkills).toEqual([]);
    expect(ws.id).toBeTruthy();
  });

  test('addWorkspace creates CLAUDE.md if missing', () => {
    addWorkspace(db, tmpDir);
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(claudeMd).toContain('This is your workspace');
  });

  test('addWorkspace preserves existing CLAUDE.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'existing content');
    addWorkspace(db, tmpDir);
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toBe('existing content');
  });

  test('addWorkspace rejects non-existent path', () => {
    expect(() => addWorkspace(db, '/nonexistent/path')).toThrow(/does not exist/);
  });

  test('addWorkspace rejects file path', () => {
    const filePath = path.join(tmpDir, 'file.txt');
    fs.writeFileSync(filePath, 'test');
    expect(() => addWorkspace(db, filePath)).toThrow(/not a directory/);
  });

  test('addWorkspace rejects duplicate path', () => {
    addWorkspace(db, tmpDir);
    expect(() => addWorkspace(db, tmpDir)).toThrow(/already exists/);
  });

  test('removeWorkspace deletes record only', () => {
    const ws = addWorkspace(db, tmpDir);
    removeWorkspace(db, ws.id);
    expect(getWorkspace(db, ws.id)).toBeNull();
    expect(fs.existsSync(tmpDir)).toBe(true);
  });

  test('listWorkspaces returns ordered by lastUsedAt', () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'okclaw-ws-test-'));
    const ws1 = addWorkspace(db, tmpDir);
    const ws2 = addWorkspace(db, dir2);
    updateLastUsed(db, ws1.id);
    const list = listWorkspaces(db);
    expect(list[0].id).toBe(ws1.id);
  });

  test('updateLastUsed updates timestamp', () => {
    const ws = addWorkspace(db, tmpDir);
    updateLastUsed(db, ws.id);
    const updated = getWorkspace(db, ws.id);
    expect(updated?.lastUsedAt).toBeTruthy();
  });

  test('validateWorkspacePath rejects relative paths', () => {
    expect(() => validateWorkspacePath('relative/path')).toThrow(/absolute path/);
  });

  test('validateWorkspacePath rejects .. segments', () => {
    expect(() => validateWorkspacePath('/foo/../etc')).toThrow(/invalid segments/);
  });

  test('validateWorkspacePath rejects system directories', () => {
    expect(() => validateWorkspacePath('/etc')).toThrow(/not allowed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/workspace.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement workspace.ts core functions**

Create `src/workspace.ts`:

```typescript
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Workspace } from './types.js';

const SYSTEM_DIRS = ['/etc', '/System', '/Library', '/usr', '/bin', '/sbin', '/var', '/dev', '/proc', '/sys'];

const CLAUDE_MD_TEMPLATE = `# Workspace

This is your workspace CLAUDE.md. The AI assistant will read this file when working in this workspace.

You can add project-specific instructions, conventions, and context here.
`;

export function validateWorkspacePath(inputPath: string): void {
  if (!path.isAbsolute(inputPath)) {
    throw new Error(`Path must be absolute: ${inputPath}`);
  }
  const resolved = path.normalize(inputPath);
  if (resolved !== inputPath && !inputPath.startsWith('/private/')) {
    // Re-check after normalization
    const realResolved = fs.realpathSync?.(resolved) ?? resolved;
    if (realResolved.includes('..')) {
      throw new Error(`Path contains invalid segments: ${inputPath}`);
    }
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolved}`);
  }
  const realPath = fs.realpathSync(resolved);
  for (const sysDir of SYSTEM_DIRS) {
    if (realPath === sysDir || realPath.startsWith(sysDir + '/')) {
      throw new Error(`System directory not allowed: ${resolved}`);
    }
  }
}

export function addWorkspace(db: Database.Database, dirPath: string): Workspace {
  validateWorkspacePath(dirPath);
  const realPath = fs.realpathSync(dirPath);
  const name = path.basename(realPath);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Check duplicate
  const existing = db.prepare('SELECT id FROM workspaces WHERE path = ?').get(realPath);
  if (existing) throw new Error(`Workspace already exists for path: ${realPath}`);

  // Auto-create CLAUDE.md
  const claudeMdPath = path.join(realPath, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE, 'utf-8');
  }

  db.prepare('INSERT INTO workspaces (id, name, path, enabled_skills, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, realPath, '[]', now, null);
  return { id, name, path: realPath, enabledSkills: [], createdAt: now, lastUsedAt: null };
}

export function removeWorkspace(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
}

export function listWorkspaces(db: Database.Database): Workspace[] {
  const rows = db.prepare('SELECT * FROM workspaces ORDER BY last_used_at DESC NULLS LAST, created_at DESC').all() as any[];
  return rows.map(rowToWorkspace);
}

export function getWorkspace(db: Database.Database, id: string): Workspace | null {
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as any;
  return row ? rowToWorkspace(row) : null;
}

export function getWorkspaceByPath(db: Database.Database, wsPath: string): Workspace | null {
  const row = db.prepare('SELECT * FROM workspaces WHERE path = ?').get(wsPath) as any;
  return row ? rowToWorkspace(row) : null;
}

export function updateLastUsed(db: Database.Database, id: string): void {
  db.prepare('UPDATE workspaces SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

export function setEnabledSkills(db: Database.Database, id: string, skills: string[]): void {
  db.prepare('UPDATE workspaces SET enabled_skills = ? WHERE id = ?').run(JSON.stringify(skills), id);
}

export function getEnabledSkills(db: Database.Database, id: string): string[] {
  const row = db.prepare('SELECT enabled_skills FROM workspaces WHERE id = ?').get(id) as any;
  return row ? JSON.parse(row.enabled_skills) : [];
}

// --- File operations ---

export function readClaudeMd(workspacePath: string): string {
  const filePath = path.join(workspacePath, 'CLAUDE.md');
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeClaudeMd(workspacePath: string, content: string): void {
  const filePath = path.join(workspacePath, 'CLAUDE.md');
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function scanSkills(workspacePath: string, enabledSkills: string[]): import('./types.js').Skill[] {
  const skillsDir = path.join(workspacePath, '.claude', 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => {
      const skillPath = path.join(skillsDir, e.name);
      const skillMdPath = path.join(skillPath, 'SKILL.md');
      const hasSkillMd = fs.existsSync(skillMdPath);
      let description = '';
      if (hasSkillMd) {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const firstLine = content.split('\n').find(l => l.trim()) ?? '';
        description = firstLine.replace(/^#\s*/, '').trim();
      }
      return {
        name: e.name,
        description,
        path: skillPath,
        enabled: enabledSkills.includes(e.name),
        hasSkillMd,
      };
    });
}

export function readSkillFile(workspacePath: string, skillName: string): string {
  const filePath = path.join(workspacePath, '.claude', 'skills', skillName, 'SKILL.md');
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

export function writeSkillFile(workspacePath: string, skillName: string, content: string): void {
  const skillDir = path.join(workspacePath, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf-8');
}

// --- Folder picker ---

export async function openFolderPicker(): Promise<string | null> {
  const { execFile } = await import('child_process');
  const platform = process.platform;

  if (platform === 'darwin') {
    return new Promise((resolve) => {
      execFile('osascript', ['-e', 'POSIX path of (choose folder with prompt "Choose Workspace Folder")'], (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim());
      });
    });
  } else if (platform === 'linux') {
    return new Promise((resolve) => {
      execFile('zenity', ['--file-selection', '--directory', '--title=Choose Workspace Folder'], (err, stdout) => {
        if (err) resolve(null);
        else resolve(stdout.trim());
      });
    });
  }
  return null;
}

// --- Helpers ---

function rowToWorkspace(row: any): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    enabledSkills: JSON.parse(row.enabled_skills || '[]'),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/workspace.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add src/workspace.ts src/workspace.test.ts
git commit -m "feat(workspace): add workspace module with CRUD, path validation, and skill scanning"
```

---

### Task 4: Agent Runner — Workspace Support

**Files:**
- Modify: `src/agent-runner.ts:29-38` (AgentInput interface)
- Modify: `src/agent-runner.ts:99-103,292,533` (cwd and systemPrompt logic)

- [ ] **Step 1: Update AgentInput interface**

In `src/agent-runner.ts`, update the `AgentInput` interface (lines 29-38) to add:

```typescript
export interface AgentInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  script?: string;
  workspacePath?: string;   // NEW: If set, overrides group folder as cwd
  enabledSkills?: string[]; // NEW: Skills to inject into systemPrompt
}
```

- [ ] **Step 2: Update cwd logic in runAgentDirect**

In the `runAgentDirect` function body (around line 292 where `groupDir` is set), replace:

```typescript
const groupDir = getGroupWorkingDir(input.groupFolder);
```

With:

```typescript
const groupDir = input.workspacePath || getGroupWorkingDir(input.groupFolder);
```

- [ ] **Step 3: Update systemPrompt composition for skill injection**

Find the section where `systemPrompt` is constructed (around line 538 where `globalClaudeMd` is used). After the existing globalClaudeMd assignment, add skill injection:

```typescript
// After existing systemPrompt assignment (globalClaudeMd)
let skillContent = '';
if (input.enabledSkills && input.enabledSkills.length > 0 && input.workspacePath) {
  const MAX_SKILL_BYTES = 32 * 1024;
  let totalBytes = 0;
  for (const skillName of input.enabledSkills) {
    const skillMdPath = path.join(input.workspacePath, '.claude', 'skills', skillName, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8');
      const wrapped = `\n<!-- SKILL: ${skillName} -->\n${content}\n<!-- END SKILL: ${skillName} -->\n`;
      if (totalBytes + wrapped.length > MAX_SKILL_BYTES) break;
      skillContent += wrapped;
      totalBytes += wrapped.length;
    }
  }
}
// Append to systemPrompt (after existing globalClaudeMd)
const finalSystemPrompt = (systemPrompt ? systemPrompt + '\n---\n' : '') + skillContent;
```

Then use `finalSystemPrompt || undefined` in the `query()` call's `systemPrompt` parameter.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/agent-runner.ts
git commit -m "feat(workspace): agent runner supports workspacePath and skill injection"
```

---

### Task 5: Web Channel — API Endpoints

**Files:**
- Modify: `src/channels/web.ts:46-61` (HTTP server → expand with API routes)

- [ ] **Step 1: Add imports and API handler to WebChannel**

At the top of `web.ts`, add import:

```typescript
import { addWorkspace, removeWorkspace, listWorkspaces, getWorkspace, updateLastUsed, setEnabledSkills, scanSkills, readClaudeMd, writeClaudeMd, readSkillFile, writeSkillFile, openFolderPicker } from '../workspace.js';
```

- [ ] **Step 2: Replace the HTTP request handler**

Replace the existing `http.createServer` handler (lines 46-61) with a router that handles both API endpoints and static file serving:

```typescript
this.httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);

  // API routes
  if (url.pathname.startsWith('/api/')) {
    return this.handleApiRequest(req, res, url);
  }

  // Static file serving
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const indexPath = path.join(STORE_DIR, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(indexPath));
    }
    const webImPath = path.join(STORE_DIR, 'public', 'web-im.html');
    if (fs.existsSync(webImPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(fs.readFileSync(webImPath));
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(getEmbeddedHtml());
  }

  // Serve static assets from store/public/
  const staticPath = path.join(STORE_DIR, 'public', url.pathname);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    const ext = path.extname(staticPath);
    const mimeTypes: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    return res.end(fs.readFileSync(staticPath));
  }

  res.writeHead(404);
  res.end('Not found');
});
```

- [ ] **Step 3: Add handleApiRequest method to WebChannel class**

```typescript
private async handleApiRequest(req: http.IncomingMessage, res: http.ServerResponse, url: URL): Promise<void> {
  const sendJson = (data: any, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  const readBody = (): Promise<string> => new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => resolve(body));
  });

  try {
    const db = this.getDb();

    // GET /api/workspaces
    if (req.method === 'GET' && url.pathname === '/api/workspaces') {
      return sendJson({ workspaces: listWorkspaces(db) });
    }

    // POST /api/workspaces
    if (req.method === 'POST' && url.pathname === '/api/workspaces') {
      const body = JSON.parse(await readBody());
      const ws = addWorkspace(db, body.path);
      return sendJson({ workspace: ws }, 201);
    }

    // DELETE /api/workspaces/:id
    const deleteMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      removeWorkspace(db, deleteMatch[1]);
      return sendJson({ ok: true });
    }

    // PUT /api/workspaces/:id/last-used
    const lastUsedMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/last-used$/);
    if (req.method === 'PUT' && lastUsedMatch) {
      updateLastUsed(db, lastUsedMatch[1]);
      return sendJson({ ok: true });
    }

    // GET /api/workspaces/:id/claude-md
    const claudeMdMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/claude-md$/);
    if (req.method === 'GET' && claudeMdMatch) {
      const ws = getWorkspace(db, claudeMdMatch[1]);
      if (!ws) return sendJson({ error: 'Not found' }, 404);
      return sendJson({ content: readClaudeMd(ws.path) });
    }

    // PUT /api/workspaces/:id/claude-md
    if (req.method === 'PUT' && claudeMdMatch) {
      const ws = getWorkspace(db, claudeMdMatch[1]);
      if (!ws) return sendJson({ error: 'Not found' }, 404);
      const body = JSON.parse(await readBody());
      writeClaudeMd(ws.path, body.content);
      return sendJson({ ok: true });
    }

    // GET /api/workspaces/:id/skills
    const skillsMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/skills$/);
    if (req.method === 'GET' && skillsMatch) {
      const ws = getWorkspace(db, skillsMatch[1]);
      if (!ws) return sendJson({ error: 'Not found' }, 404);
      return sendJson({ skills: scanSkills(ws.path, ws.enabledSkills) });
    }

    // GET/PUT /api/workspaces/:id/skills/:name
    const skillDetailMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/skills\/([^/]+)$/);
    if (skillDetailMatch) {
      const ws = getWorkspace(db, skillDetailMatch[1]);
      if (!ws) return sendJson({ error: 'Not found' }, 404);
      const skillName = decodeURIComponent(skillDetailMatch[2]);
      if (req.method === 'GET') {
        return sendJson({ content: readSkillFile(ws.path, skillName) });
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(await readBody());
        writeSkillFile(ws.path, skillName, body.content);
        return sendJson({ ok: true });
      }
    }

    // PUT /api/workspaces/:id/enabled-skills
    const enabledMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/enabled-skills$/);
    if (req.method === 'PUT' && enabledMatch) {
      const body = JSON.parse(await readBody());
      setEnabledSkills(db, enabledMatch[1], body.skills);
      return sendJson({ ok: true });
    }

    // POST /api/folder-picker
    if (req.method === 'POST' && url.pathname === '/api/folder-picker') {
      const selectedPath = await openFolderPicker();
      return sendJson({ path: selectedPath });
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err: any) {
    console.error('[web-api]', err.message);
    sendJson({ error: err.message }, 400);
  }
}
```

Note: `this.getDb()` requires access to the database instance. The WebChannel needs a reference to the db. This can be done by passing `db` through `ChannelOpts` or importing the shared db instance. Check how other code gets db access — likely through a module-level import or the `initDatabase()` return value.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (may need to adjust db access pattern)

- [ ] **Step 5: Commit**

```bash
git add src/channels/web.ts
git commit -m "feat(workspace): add workspace API endpoints to web channel"
```

---

### Task 6: Message Routing — Workspace Context

**Files:**
- Modify: `src/channels/web.ts:76-96` (parse workspaceId from WebSocket)
- Modify: `src/index.ts` (pass workspace context to agent)

- [ ] **Step 1: Update WebSocket message handler**

In `web.ts`, the WebSocket `message` event handler (around line 78) currently sends:

```typescript
this.opts.onMessage({ id: ..., chat_jid: WEB_JID, sender: ..., content: data.content, ... });
```

Update to include `workspaceId` from the incoming message:

```typescript
ws.on('message', (raw) => {
  const data = JSON.parse(raw.toString());
  if (data.type === 'message' && data.content?.trim()) {
    const msg: NewMessage & { workspaceId?: string } = {
      id: crypto.randomUUID(),
      chat_jid: WEB_JID,
      sender: 'user',
      sender_name: 'User',
      content: data.content.trim(),
      timestamp: new Date().toISOString(),
      workspaceId: data.workspaceId,
    };
    this.opts.onMessage(msg);
  }
});
```

- [ ] **Step 2: Propagate workspaceId through message processing**

In `src/index.ts`, find where `processGroupMessages()` constructs `AgentInput` and passes it to `runAgentDirect()`. Add `workspaceId` handling:

1. Where messages are grouped and passed to `runAgent()` (around line 240), extract `workspaceId` from the first message.
2. In `AgentInput` construction, resolve workspace path and enabled skills if `workspaceId` is present.
3. This requires importing workspace functions and db in `index.ts`.

```typescript
import { getWorkspace, getEnabledSkills } from './workspace.js';

// Inside runAgent() or processGroupMessages(), when building AgentInput:
const workspaceId = (messages[0] as any).workspaceId;
let workspacePath: string | undefined;
let enabledSkills: string[] | undefined;
if (workspaceId) {
  const ws = getWorkspace(db, workspaceId);
  if (ws) {
    workspacePath = ws.path;
    enabledSkills = ws.enabledSkills;
    updateLastUsed(db, workspaceId);
  }
}

// Add to AgentInput:
const input: AgentInput = {
  // ... existing fields
  workspacePath,
  enabledSkills,
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Build and manual test**

Run: `npm run build`
Then start the service and send a WebSocket message with `workspaceId` to verify routing works.

- [ ] **Step 5: Commit**

```bash
git add src/channels/web.ts src/index.ts
git commit -m "feat(workspace): route workspace context through message processing"
```

---

## Phase 2: Frontend

### Task 7: React Project Setup

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tsconfig.json`
- Create: `web/tailwind.config.ts`
- Create: `web/postcss.config.js`
- Create: `web/index.html`
- Create: `web/src/main.tsx`

- [ ] **Step 1: Initialize web project**

Run:
```bash
cd /Users/h3glove/projeck/okclaw
mkdir -p web/src/components
cd web
npm init -y
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
cd /Users/h3glove/projeck/okclaw/web
npm install react react-dom @assistant-ui/react zustand
npm install -D @vitejs/plugin-react vite typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3100',
      '/ws': { target: 'ws://localhost:3100', ws: true },
    },
  },
  build: {
    outDir: '../store/public',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 4: Create web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create web/index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OKClaw</title>
</head>
<body class="bg-[#1a1a2e] text-[#e4e4e7]">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: Create web/src/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 7: Create web/src/index.css**

```css
@import "tailwindcss";
```

- [ ] **Step 8: Update root package.json scripts**

In the root `package.json`, update scripts:

```json
{
  "dev": "concurrently \"tsx src/index.ts\" \"cd web && npx vite\"",
  "build": "tsc && cd web && npm run build",
  "build:backend": "tsc",
  "build:frontend": "cd web && npm run build"
}
```

Install concurrently: `npm install -D concurrently`

- [ ] **Step 9: Verify dev server starts**

Run: `cd /Users/h3glove/projeck/okclaw/web && npx vite`
Expected: Vite dev server starts on port 5173

- [ ] **Step 10: Commit**

```bash
cd /Users/h3glove/projeck/okclaw
git add web/ package.json
git commit -m "feat(workspace): scaffold React frontend with Vite, assistant-ui, Tailwind"
```

---

### Task 8: Zustand Store + App Shell

**Files:**
- Create: `web/src/store.ts`
- Create: `web/src/App.tsx`

- [ ] **Step 1: Create Zustand store**

Create `web/src/store.ts`:

```tsx
import { create } from 'zustand';

interface Workspace {
  id: string;
  name: string;
  path: string;
  enabledSkills: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

interface Skill {
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  hasSkillMd: boolean;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  skills: Skill[];
  connected: boolean;

  setConnected: (v: boolean) => void;
  fetchWorkspaces: () => Promise<void>;
  addWorkspace: () => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  fetchSkills: () => Promise<void>;
  toggleSkill: (skillName: string) => Promise<void>;
}

const API = '/api';

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  skills: [],
  connected: false,

  setConnected: (v) => set({ connected: v }),

  fetchWorkspaces: async () => {
    const res = await fetch(`${API}/workspaces`);
    const data = await res.json();
    set({ workspaces: data.workspaces });
  },

  addWorkspace: async () => {
    const pickRes = await fetch(`${API}/folder-picker`, { method: 'POST' });
    const pickData = await pickRes.json();
    if (!pickData.path) return;
    const res = await fetch(`${API}/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pickData.path }),
    });
    const data = await res.json();
    if (data.workspace) {
      set((s) => ({ workspaces: [data.workspace, ...s.workspaces], activeWorkspaceId: data.workspace.id }));
      get().fetchSkills();
    }
  },

  removeWorkspace: async (id) => {
    await fetch(`${API}/workspaces/${id}`, { method: 'DELETE' });
    set((s) => ({
      workspaces: s.workspaces.filter((w) => w.id !== id),
      activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
      skills: s.activeWorkspaceId === id ? [] : s.skills,
    }));
  },

  switchWorkspace: async (id) => {
    set({ activeWorkspaceId: id });
    await fetch(`${API}/workspaces/${id}/last-used`, { method: 'PUT' });
    get().fetchSkills();
  },

  fetchSkills: async () => {
    const id = get().activeWorkspaceId;
    if (!id) { set({ skills: [] }); return; }
    const res = await fetch(`${API}/workspaces/${id}/skills`);
    const data = await res.json();
    set({ skills: data.skills });
  },

  toggleSkill: async (skillName) => {
    const id = get().activeWorkspaceId;
    if (!id) return;
    const skills = get().skills;
    const newEnabled = skills.filter((s) => s.enabled !== (s.name === skillName)).map((s) => s.name === skillName ? { ...s, enabled: !s.enabled } : s).filter((s) => s.enabled).map((s) => s.name);
    // Optimistic update
    set({ skills: skills.map((s) => s.name === skillName ? { ...s, enabled: !s.enabled } : s) });
    await fetch(`${API}/workspaces/${id}/enabled-skills`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skills: newEnabled }),
    });
  },
}));
```

- [ ] **Step 2: Create App.tsx shell**

Create `web/src/App.tsx` with three-panel layout:

```tsx
import { useEffect } from 'react';
import { useWorkspaceStore } from './store';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import ChatPanel from './components/ChatPanel';
import SkillsPanel from './components/SkillsPanel';

export default function App() {
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces);
  const setConnected = useWorkspaceStore((s) => s.setConnected);

  useEffect(() => {
    fetchWorkspaces();

    const ws = new WebSocket(`ws://${window.location.host}/ws`);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => ws.close();
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1a2e]">
      <WorkspaceSidebar />
      <ChatPanel />
      <SkillsPanel />
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder components**

Create minimal placeholder components for the three panels:

`web/src/components/WorkspaceSidebar.tsx`:
```tsx
export default function WorkspaceSidebar() {
  return <div className="w-60 bg-[#16213e] border-r border-white/10 p-4">Workspaces</div>;
}
```

`web/src/components/ChatPanel.tsx`:
```tsx
export default function ChatPanel() {
  return <div className="flex-1 flex items-center justify-center text-white/50">Chat Area</div>;
}
```

`web/src/components/SkillsPanel.tsx`:
```tsx
export default function SkillsPanel() {
  return <div className="w-80 bg-[#16213e] border-l border-white/10 p-4">Skills Panel</div>;
}
```

- [ ] **Step 4: Verify frontend renders**

Run: `cd /Users/h3glove/projeck/okclaw/web && npx vite`
Open browser to http://localhost:5173 — should see three-panel layout with dark theme.

- [ ] **Step 5: Commit**

```bash
cd /Users/h3glove/projeck/okclaw
git add web/
git commit -m "feat(workspace): add Zustand store and three-panel App shell"
```

---

### Task 9: WorkspaceSidebar Component

**Files:**
- Modify: `web/src/components/WorkspaceSidebar.tsx`

- [ ] **Step 1: Implement full WorkspaceSidebar**

```tsx
import { useWorkspaceStore } from '../store';

export default function WorkspaceSidebar() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace);
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace);
  const switchWorkspace = useWorkspaceStore((s) => s.switchWorkspace);
  const connected = useWorkspaceStore((s) => s.connected);

  return (
    <div className="w-60 bg-[#16213e] border-r border-white/10 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">OKClaw</span>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <button onClick={addWorkspace} className="w-7 h-7 rounded bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center text-lg" title="Add workspace">+</button>
      </div>

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto p-2">
        {workspaces.length === 0 && (
          <div className="text-white/40 text-sm text-center mt-8 px-4">
            Add a workspace to get started
          </div>
        )}
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            onClick={() => switchWorkspace(ws.id)}
            className={`p-3 rounded-lg cursor-pointer mb-1 group transition-colors ${
              activeWorkspaceId === ws.id
                ? 'bg-indigo-600/30 border border-indigo-500/50'
                : 'hover:bg-white/5 border border-transparent'
            }`}
          >
            <div className="font-medium text-sm truncate">{ws.name}</div>
            <div className="text-xs text-white/40 truncate mt-0.5">{ws.path}</div>
            <button
              onClick={(e) => { e.stopPropagation(); removeWorkspace(ws.id); }}
              className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 text-white/30 hover:text-red-400 text-xs"
              title="Remove workspace"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify workspace list renders**

Start both backend and frontend, add a workspace via the + button. Verify it appears in the sidebar.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/WorkspaceSidebar.tsx
git commit -m "feat(workspace): implement WorkspaceSidebar with add/switch/remove"
```

---

### Task 10: SkillsPanel Component

**Files:**
- Modify: `web/src/components/SkillsPanel.tsx`
- Create: `web/src/components/EditModal.tsx`

- [ ] **Step 1: Implement EditModal**

Create `web/src/components/EditModal.tsx`:

```tsx
import { useState, useEffect } from 'react';

interface EditModalProps {
  title: string;
  content: string;
  onSave: (content: string) => Promise<void>;
  onClose: () => void;
}

export default function EditModal({ title, content: initialContent, onSave, onClose }: EditModalProps) {
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#1e1e2e] rounded-xl w-[700px] max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h3 className="font-medium">Edit: {title}</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl">×</button>
        </div>
        <textarea
          className="flex-1 p-4 bg-transparent text-sm font-mono text-white/90 resize-none outline-none min-h-[400px]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <div className="flex justify-end gap-2 p-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-white/60 hover:text-white">Cancel</button>
          <button
            onClick={async () => { setSaving(true); await onSave(content); setSaving(false); onClose(); }}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement SkillsPanel**

```tsx
import { useState } from 'react';
import { useWorkspaceStore } from '../store';
import EditModal from './EditModal';

const API = '/api';

export default function SkillsPanel() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const skills = useWorkspaceStore((s) => s.skills);
  const toggleSkill = useWorkspaceStore((s) => s.toggleSkill);
  const fetchSkills = useWorkspaceStore((s) => s.fetchSkills);

  const [editing, setEditing] = useState<{ type: 'claude-md' | 'skill'; name?: string; content: string } | null>(null);

  const ws = workspaces.find((w) => w.id === activeWorkspaceId);
  if (!ws) {
    return <div className="w-80 bg-[#16213e] border-l border-white/10 p-4 text-white/30 text-sm">Select a workspace</div>;
  }

  const handleEditClaudeMd = async () => {
    const res = await fetch(`${API}/workspaces/${ws.id}/claude-md`);
    const data = await res.json();
    setEditing({ type: 'claude-md', content: data.content });
  };

  const handleEditSkill = async (skillName: string) => {
    const res = await fetch(`${API}/workspaces/${ws.id}/skills/${encodeURIComponent(skillName)}`);
    const data = await res.json();
    setEditing({ type: 'skill', name: skillName, content: data.content });
  };

  const handleSave = async (content: string) => {
    if (editing?.type === 'claude-md') {
      await fetch(`${API}/workspaces/${ws.id}/claude-md`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
      });
    } else if (editing?.name) {
      await fetch(`${API}/workspaces/${ws.id}/skills/${encodeURIComponent(editing.name)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
      });
    }
  };

  return (
    <div className="w-80 bg-[#16213e] border-l border-white/10 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="font-medium text-sm truncate">{ws.name}</div>
        <div className="text-xs text-white/30 truncate">{ws.path}</div>
      </div>

      {/* CLAUDE.md */}
      <div className="p-3 border-b border-white/10">
        <button onClick={handleEditClaudeMd} className="flex items-center gap-2 text-sm text-white/70 hover:text-white w-full">
          <span>📄</span>
          <span>CLAUDE.md</span>
          <span className="ml-auto text-indigo-400 hover:text-indigo-300">Edit</span>
        </button>
      </div>

      {/* Skills */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs text-white/40 uppercase tracking-wide mb-2">Skills</div>
        {skills.length === 0 ? (
          <div className="text-white/30 text-sm text-center mt-4">No skills found in .claude/skills/</div>
        ) : (
          skills.map((skill) => (
            <div key={skill.name} className="flex items-center gap-2 py-1.5 group">
              <input
                type="checkbox"
                checked={skill.enabled}
                onChange={() => toggleSkill(skill.name)}
                className="accent-indigo-600"
              />
              <span className="text-sm flex-1 truncate">{skill.name}</span>
              <button
                onClick={() => handleEditSkill(skill.name)}
                className="text-xs text-white/30 hover:text-indigo-400 opacity-0 group-hover:opacity-100"
              >
                View
              </button>
            </div>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <EditModal
          title={editing.type === 'claude-md' ? 'CLAUDE.md' : editing.name ?? ''}
          content={editing.content}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify skills panel renders**

Add a workspace that has `.claude/skills/` directory, verify skills appear with checkboxes. Test edit modal.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/SkillsPanel.tsx web/src/components/EditModal.tsx
git commit -m "feat(workspace): implement SkillsPanel with checkboxes and EditModal"
```

---

### Task 11: ChatPanel with assistant-ui

**Files:**
- Modify: `web/src/components/ChatPanel.tsx`
- Modify: `web/src/App.tsx` (add assistant-ui provider)

- [ ] **Step 1: Implement ChatPanel with assistant-ui**

```tsx
import { useWorkspaceStore } from '../store';
import { useExternalStoreRuntime } from '@assistant-ui/react';

export default function ChatPanel() {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const ws = workspaces.find((w) => w.id === activeWorkspaceId);

  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect WebSocket
  useEffect(() => {
    const socket = new WebSocket(`ws://${window.location.host}/ws`);
    wsRef.current = socket;
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.content }]);
        setIsRunning(false);
      }
    };
    return () => socket.close();
  }, []);

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current) return;
    const content = input.trim();
    setMessages((prev) => [...prev, { role: 'user', content }]);
    wsRef.current.send(JSON.stringify({ type: 'message', content, workspaceId: activeWorkspaceId }));
    setInput('');
    setIsRunning(true);
  };

  if (!ws) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🐾</div>
          <h2 className="text-xl font-bold mb-2">OKClaw</h2>
          <p className="text-white/40">Select a workspace to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center">
        <span className="font-medium">{ws.name}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${
              msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/90'
            }`}>
              <pre className="whitespace-pre-wrap font-sans text-sm">{msg.content}</pre>
            </div>
          </div>
        ))}
        {isRunning && (
          <div className="flex justify-start">
            <div className="bg-white/10 rounded-lg px-4 py-2">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/10">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendMessage(); }}
            placeholder="Type a message... (Ctrl+Enter to send)"
            className="flex-1 bg-white/5 rounded-lg px-4 py-2 text-sm resize-none outline-none border border-white/10 focus:border-indigo-500/50"
            rows={1}
          />
          <button onClick={sendMessage} disabled={isRunning || !input.trim()} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 text-sm">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

Note: This initial implementation uses a simple message list rather than full assistant-ui integration. The assistant-ui `Thread` component can be integrated in a follow-up task once the basic flow works end-to-end. This keeps the first iteration simpler while ensuring the data flow is correct.

- [ ] **Step 2: Verify chat sends and receives messages**

Start backend, open frontend, add a workspace, send a message. Verify it reaches the agent and response comes back.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ChatPanel.tsx
git commit -m "feat(workspace): implement ChatPanel with WebSocket messaging"
```

---

### Task 12: Integration Test & Polish

**Files:**
- Modify: Various for bug fixes and polish

- [ ] **Step 1: Build frontend and test production mode**

Run:
```bash
cd /Users/h3glove/projeck/okclaw
npm run build
npm start
```

Open http://localhost:3100 and verify:
- React app loads (not embedded HTML)
- Workspace sidebar shows
- Can add a workspace via folder picker
- Can switch workspaces
- Skills panel shows skills from workspace
- Can toggle skill checkboxes
- Can edit CLAUDE.md and skills via modal
- Can send a message and receive a response
- Agent runs in the correct workspace directory

- [ ] **Step 2: Fix any issues found during testing**

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "feat(workspace): integration polish and production build fixes"
```

---

## Summary

| Phase | Tasks | Est. Steps |
|-------|-------|-----------|
| Phase 1: Backend Foundation | Tasks 1-6 | ~25 steps |
| Phase 2: Frontend | Tasks 7-12 | ~18 steps |
| **Total** | **12 tasks** | **~43 steps** |

Each task produces a self-contained, committable change. Phase 1 can be fully tested via unit tests before Phase 2 begins.
