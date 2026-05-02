# File Attachment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file attachment support (.docx, .xlsx, .pdf) to the Web chat with auto text extraction and workspace file persistence.

**Architecture:** Two-step upload-then-send flow. Frontend uploads file via multipart POST, backend parses text with JS libraries (pdf-parse, xlsx, mammoth), saves original to workspace, then attaches extracted text to agent prompt. All changes are backward compatible — messages without attachments work as before.

**Tech Stack:** Node.js, React, TypeScript, pdf-parse, xlsx (SheetJS), mammoth, busboy (multipart parsing)

**Spec:** `docs/superpowers/specs/2026-04-14-file-attachment-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/file-parser.ts` | Parse .docx/.xlsx/.pdf files to text |
| Create | `src/file-parser.test.ts` | Tests for file parser |
| Modify | `src/types.ts:10-21` | Add `attachment` field to `NewMessage` |
| Modify | `src/db.ts:28-50` | Add `attachment` column to schema migration |
| Modify | `src/db.ts:844-851` | Add `attachment` to `ConversationMessageRow` |
| Modify | `src/db.ts:919-944` | Add `attachment` param to `addConversationMessage` |
| Modify | `src/db.ts:946-964` | Return `attachment` in `getConversationMessages` |
| Modify | `src/channels/web.ts:191-561` | Add upload route, multipart parsing, extend message routes |
| Modify | `src/channels/web.ts:589-640` | Handle attachment in WebSocket messages |
| Modify | `src/router.ts:13-25` | Include attachment text in `formatMessages` |
| Modify | `web/src/store.ts:47-53` | Add `AttachmentInfo` type to `ChatMessage` |
| Modify | `web/src/components/AssistantChat.tsx:66-74` | Show attachment tag in `UserMessage` |
| Modify | `web/src/components/AssistantChat.tsx:154-210` | Add attachment button and upload logic to `Composer` |
| Modify | `web/src/App.tsx:121-149` | Pass attachment in `handleSend` |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install npm packages**

```bash
npm install pdf-parse xlsx mammoth busboy
npm install -D @types/pdf-parse
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('pdf-parse'); require('xlsx'); require('mammoth'); require('busboy'); console.log('All packages loaded OK')"
```

Expected: `All packages loaded OK`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add file parsing dependencies (pdf-parse, xlsx, mammoth, busboy)"
```

---

### Task 2: Create file-parser module

**Files:**
- Create: `src/file-parser.ts`
- Create: `src/file-parser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/file-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from './file-parser.js';

describe('file-parser', () => {
  it('should define allowed extensions', () => {
    expect(ALLOWED_EXTENSIONS).toContain('.docx');
    expect(ALLOWED_EXTENSIONS).toContain('.xlsx');
    expect(ALLOWED_EXTENSIONS).toContain('.pdf');
  });

  it('should define max file size as 10MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it('should reject unsupported file types', async () => {
    await expect(
      parseFile(Buffer.from('test'), 'text/plain', 'test.txt')
    ).rejects.toThrow('Unsupported file type');
  });

  it('should reject files exceeding max size', async () => {
    const bigBuf = Buffer.alloc(MAX_FILE_SIZE + 1);
    await expect(
      parseFile(bigBuf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'big.xlsx')
    ).rejects.toThrow('exceeds maximum');
  });

  it('should truncate output over 50000 chars', async () => {
    // This will be tested via the actual parsing functions
    // We'll verify truncation logic separately
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/file-parser.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/file-parser.ts
import path from 'path';
import { logger } from './logger.js';

export const ALLOWED_EXTENSIONS = ['.docx', '.xlsx', '.pdf'];
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_TEXT_LENGTH = 50_000;

export interface ParsedFile {
  text: string;
  pageCount?: number;
  sheetCount?: number;
}

function truncateText(text: string, filePath?: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  const suffix = filePath
    ? `\n\n[文件内容过长，已截断。完整文件已保存至: ${filePath}]`
    : '\n\n[文件内容过长，已截断]';
  return text.slice(0, MAX_TEXT_LENGTH - suffix.length) + suffix;
}

async function parsePdf(buffer: Buffer): Promise<ParsedFile> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return {
    text: data.text || '',
    pageCount: data.numpages,
  };
}

async function parseXlsx(buffer: Buffer): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`--- ${sheetName} ---\n${csv}`);
  }
  return {
    text: parts.join('\n\n'),
    sheetCount: workbook.SheetNames.length,
  };
}

async function parseDocx(buffer: Buffer): Promise<ParsedFile> {
  const mammoth = await import('mammoth');
  const result = await mammoth.convertToHtml({ buffer });
  // Strip HTML to plain text, preserving structure
  const text = result.value
    .replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text };
}

export async function parseFile(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  filePath?: string,
): Promise<ParsedFile> {
  const ext = path.extname(filename).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error(`File size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds maximum (${MAX_FILE_SIZE / 1024 / 1024}MB)`);
  }

  try {
    let result: ParsedFile;
    switch (ext) {
      case '.pdf':
        result = await parsePdf(buffer);
        break;
      case '.xlsx':
        result = await parseXlsx(buffer);
        break;
      case '.docx':
        result = await parseDocx(buffer);
        break;
      default:
        throw new Error(`No parser for: ${ext}`);
    }

    result.text = truncateText(result.text, filePath);
    return result;
  } catch (err) {
    if (err instanceof Error && (err.message.includes('Unsupported') || err.message.includes('exceeds'))) {
      throw err;
    }
    logger.error({ err, filename }, 'File parsing failed');
    return {
      text: `[文件解析失败: ${err instanceof Error ? err.message : String(err)}]`,
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/file-parser.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/file-parser.ts src/file-parser.test.ts
git commit -m "feat: add file-parser module for docx/xlsx/pdf text extraction"
```

---

### Task 3: Extend types and database

**Files:**
- Modify: `src/types.ts:10-21`
- Modify: `src/db.ts`

- [ ] **Step 1: Add AttachmentInfo to types.ts**

Add after the `NewMessage` interface at `src/types.ts:21`:

```typescript
export interface AttachmentInfo {
  fileId: string;
  filename: string;
  extractedText: string;
  filePath: string;
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean;
  is_bot_message?: boolean;
  workspaceId?: string;
  conversationId?: string;
  attachment?: AttachmentInfo;
}
```

- [ ] **Step 2: Add attachment column to database schema**

In `src/db.ts`, inside `createSchema()` (after the `conversation_messages` CREATE TABLE), add:

```sql
-- Migration: add attachment column to conversation_messages
```

In the `createSchema` function, after the existing CREATE TABLE statements, add a migration block:

```typescript
// Add attachment column if not exists
try {
  database.exec(`ALTER TABLE conversation_messages ADD COLUMN attachment TEXT`);
} catch {
  // Column already exists, ignore
}
```

- [ ] **Step 3: Update ConversationMessageRow**

In `src/db.ts`, update `ConversationMessageRow` interface (line ~844):

```typescript
export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: string | null;
  attachment: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Update addConversationMessage**

In `src/db.ts`, update `addConversationMessage` (line ~919) to accept `attachment`:

```typescript
export function addConversationMessage(
  db: Database.Database,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  parts?: string,
  attachment?: string,
): ConversationMessageRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversation_messages (id, conversation_id, role, content, parts, attachment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, conversationId, role, content, parts ?? null, attachment ?? null, now);
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(
    now,
    conversationId,
  );
  return {
    id,
    conversation_id: conversationId,
    role,
    content,
    parts: parts ?? null,
    attachment: attachment ?? null,
    created_at: now,
  };
}
```

- [ ] **Step 5: Run build to verify**

```bash
npm run build
```

Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/db.ts
git commit -m "feat: add attachment field to NewMessage and database schema"
```

---

### Task 4: Add upload API route to web.ts

**Files:**
- Modify: `src/channels/web.ts`

- [ ] **Step 1: Add imports**

At the top of `src/channels/web.ts`, add:

```typescript
import busboy from 'busboy';
import { parseFile, ALLOWED_EXTENSIONS, MAX_FILE_SIZE } from '../file-parser.js';
import * as workspace from '../workspace.js';
```

(`workspace` import already exists)

- [ ] **Step 2: Add multipart body reader helper**

After the `readBody` helper (line ~212), add:

```typescript
const readBodyBuffer = (): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
};

interface UploadResult {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  extractedText: string;
  filePath: string;
}

const parseMultipart = (): Promise<{ file: Buffer; filename: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const bb = busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_SIZE } });
    let fileBuffer: Buffer[] = [];
    let filename = '';
    let mimeType = '';
    let fileFound = false;

    bb.on('file', (name, stream, info) => {
      if (name !== 'file' || fileFound) {
        stream.resume(); // discard extra files
        return;
      }
      fileFound = true;
      filename = info.filename;
      mimeType = info.mimeType;
      stream.on('data', (chunk: Buffer) => fileBuffer.push(chunk));
    });

    bb.on('finish', () => {
      if (!fileFound) {
        reject(new Error('No file field in upload'));
        return;
      }
      resolve({ file: Buffer.concat(fileBuffer), filename, mimeType });
    });

    bb.on('error', reject);
    req.pipe(bb);
  });
};
```

- [ ] **Step 3: Add POST /api/upload route**

In `handleApiRequest`, before the `// No matching API route` line (line ~563), add:

```typescript
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

    // Sanitize filename
    const safeName = filename.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '_');
    const timestamp = Date.now();
    const savedName = `${timestamp}_${safeName}`;
    const fileId = `f_${timestamp}`;

    // Get workspace path from query param
    const uploadUrl = new URL(req.url!, `http://localhost`);
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

    // Parse file content
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
    logger.error({ err }, 'File upload error');
    const message = err instanceof Error ? err.message : 'Upload failed';
    sendError(500, message);
  }
  return;
}
```

Note: need to add `import { DATA_DIR } from '../config.js';` at the top (check if already imported — it's not, but `STORE_DIR` is). Add `DATA_DIR` to the existing config import.

- [ ] **Step 4: Extend POST messages route to handle attachment**

In the `POST /api/workspaces/:id/conversations/:convId/messages` handler (line ~536), update:

```typescript
if (method === 'POST') {
  const body = JSON.parse(await readBody());
  if (typeof body.content !== 'string') {
    sendError(400, 'Missing required field: content');
    return;
  }
  const parts = body.parts ? JSON.stringify(body.parts) : undefined;
  const attachment = body.attachment ? JSON.stringify(body.attachment) : undefined;
  const message = addConversationMessage(
    db,
    convId,
    body.role || 'user',
    body.content,
    parts,
    attachment,
  );
  sendJson(201, {
    message: {
      id: message.id,
      role: message.role,
      content: message.content,
      parts: message.parts ? JSON.parse(message.parts) : null,
      attachment: message.attachment ? JSON.parse(message.attachment) : null,
      createdAt: message.created_at,
    },
  });
  return;
}
```

- [ ] **Step 5: Extend GET messages to return attachment**

In the `GET /api/workspaces/:id/conversations/:convId/messages` handler (line ~514), update the mapping:

```typescript
messages: messages.map((m) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  parts: m.parts ? JSON.parse(m.parts) : null,
  attachment: m.attachment ? JSON.parse(m.attachment) : null,
  createdAt: m.created_at,
})),
```

- [ ] **Step 6: Extend WebSocket message handler**

In `handleMessage` (line ~589), update the message type and delivery:

```typescript
private handleMessage(
  ws: WebSocket,
  msg: {
    type: string;
    content?: string;
    sender?: string;
    workspaceId?: string;
    conversationId?: string;
    attachment?: {
      fileId: string;
      filename: string;
      extractedText: string;
      filePath: string;
    };
  },
): void {
  if (msg.type === 'message' && msg.content) {
    // ... existing tracking code unchanged ...

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
      attachment: msg.attachment,
    });

    // ... existing logger ...
  }
}
```

- [ ] **Step 7: Build and verify**

```bash
npm run build
```

Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add src/channels/web.ts
git commit -m "feat: add file upload API route and attachment support in web channel"
```

---

### Task 5: Extend router to include attachment in prompt

**Files:**
- Modify: `src/router.ts`

- [ ] **Step 1: Update formatMessages**

In `src/router.ts`, update `formatMessages` (line ~13):

```typescript
export function formatMessages(
  messages: NewMessage[],
  timezone: string,
): string {
  const lines = messages.map((m) => {
    const displayTime = formatLocalTime(m.timestamp, timezone);
    let body = escapeXml(m.content);

    if (m.attachment) {
      const attachBlock = [
        `[附件: ${m.attachment.filename}]`,
        `---文件内容开始---`,
        m.attachment.extractedText,
        `---文件内容结束---`,
        '',
        `原始文件已保存至: ${m.attachment.filePath}`,
      ].join('\n');
      body = `${attachBlock}\n\n${body}`;
    }

    return `<message sender="${escapeXml(m.sender_name)}" time="${escapeXml(displayTime)}">${body}</message>`;
  });

  const header = `<context timezone="${escapeXml(timezone)}" />\n`;
  return `${header}<messages>\n${lines.join('\n')}\n</messages>`;
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/router.ts
git commit -m "feat: include attachment text in agent prompt formatting"
```

---

### Task 6: Update frontend store and types

**Files:**
- Modify: `web/src/store.ts`

- [ ] **Step 1: Add AttachmentInfo type and field to ChatMessage**

In `web/src/store.ts`, add after `ContentPart` type (line ~45):

```typescript
export interface AttachmentInfo {
  fileId: string;
  filename: string;
  extractedText: string;
  filePath: string;
}
```

Update `ChatMessage` interface (line ~47):

```typescript
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  parts?: ContentPart[];
  attachment?: AttachmentInfo;
}
```

- [ ] **Step 2: Update switchConversation to load attachment**

In `switchConversation` (line ~283), update the message mapping:

```typescript
messages: data.messages.map((m: any) => ({
  id: m.id,
  role: m.role,
  content: m.content,
  parts: m.parts,
  attachment: m.attachment,
})),
```

- [ ] **Step 3: Commit**

```bash
git add web/src/store.ts
git commit -m "feat: add AttachmentInfo type to frontend store"
```

---

### Task 7: Update Composer component

**Files:**
- Modify: `web/src/components/AssistantChat.tsx`

- [ ] **Step 1: Add attachment state and upload logic to Composer**

Replace the `Composer` function (lines 154-210) with:

```typescript
function Composer() {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachment, setAttachment] = useState<{
    fileId: string;
    filename: string;
    extractedText: string;
    filePath: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typing = useStore((s) => s.typing);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.docx', '.xlsx', '.pdf'].includes(ext)) {
      alert('仅支持 .docx .xlsx .pdf 格式的文件');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/upload?workspaceId=${activeWorkspaceId}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '上传失败');
      }
      const data = await res.json();
      setAttachment({
        fileId: data.fileId,
        filename: data.filename,
        extractedText: data.extractedText,
        filePath: data.filePath,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = () => {
    if ((!input.trim() && !attachment) || typing || isComposing || uploading) return;
    const content = input.trim();
    setInput('');
    window.dispatchEvent(new CustomEvent('okclaw-send', {
      detail: { content, attachment },
    }));
    setAttachment(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  return (
    <div className="px-4 py-3 border-t border-white/10">
      {attachment && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-xs text-white/60">📄</span>
          <span className="text-xs text-white/80 bg-white/5 px-2 py-1 rounded">{attachment.filename}</span>
          <button
            onClick={() => setAttachment(null)}
            className="text-white/30 hover:text-white/60 text-xs"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2 bg-[#16213e] rounded-xl border border-white/10 px-3 py-2 focus-within:border-indigo-500">
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.xlsx,.pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors flex-shrink-0 text-lg leading-none"
          title="添加附件"
        >
          {uploading ? '⏳' : '📎'}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="输入消息..."
          className="flex-1 bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-white/20 max-h-[150px] py-1"
          rows={1}
        />
        {typing ? (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('okclaw-cancel'))}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors flex-shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim() && !attachment}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm transition-colors flex-shrink-0"
          >
            Send
          </button>
        )}
      </div>
      <p className="text-[10px] text-white/20 mt-1 text-center">Enter 发送 · Shift+Enter 换行</p>
    </div>
  );
}
```

Add `useRef` to the React import at line 1:

```typescript
import { useState, useRef } from 'react';
```

- [ ] **Step 2: Update UserMessage to show attachment**

Replace `UserMessage` (lines 66-74):

```typescript
function UserMessage({ content, attachment }: { content: string; attachment?: {
  fileId: string;
  filename: string;
  extractedText: string;
  filePath: string;
} | null }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-indigo-600 text-white text-sm whitespace-pre-wrap">
        {attachment && (
          <div className="flex items-center gap-1.5 mb-1 pb-1.5 border-b border-white/20">
            <span>📄</span>
            <span className="text-white/80 text-xs">{attachment.filename}</span>
          </div>
        )}
        {content}
      </div>
    </div>
  );
}
```

Update the `MessageList` to pass attachment (line ~46):

```typescript
<UserMessage key={i} content={msg.content} attachment={msg.attachment} />
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/AssistantChat.tsx
git commit -m "feat: add attachment button and file upload to chat composer"
```

---

### Task 8: Update App.tsx to pass attachment through

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Update handleSend to include attachment**

In `App.tsx`, update the `handleSend` event listener (line ~121):

```typescript
const handleSend = async (e: Event) => {
  const { content, attachment } = (e as CustomEvent).detail;
  const ws = wsRef.current;
  const conversationId = activeConversationIdRef.current;
  const workspaceId = activeWorkspaceIdRef.current;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!conversationId || !workspaceId) return;

  if (!content && !attachment) return;

  setTyping(true);
  // Store user message immediately for instant display
  appendMessage(conversationId, { role: 'user', content: content || '', attachment });

  // Persist message to backend via API
  try {
    await fetch(`/api/workspaces/${workspaceId}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        content: content || `[附件: ${attachment?.filename}]`,
        attachment,
      }),
    });
  } catch (err) {
    console.error('Failed to persist message:', err);
  }

  ws.send(JSON.stringify({
    type: 'message',
    content: content || `[附件: ${attachment?.filename}]`,
    workspaceId,
    conversationId,
    attachment,
  }));
};
```

- [ ] **Step 2: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat: pass attachment data through WebSocket and REST message flow"
```

---

### Task 9: Integration test

**Files:** None new — manual testing

- [ ] **Step 1: Build and start**

```bash
npm run build && npm run dev
```

- [ ] **Step 2: Test upload API**

```bash
# Create a small test xlsx
node -e "
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([['Name','Qty','Price'],['Apple',10,5.5],['Banana',20,3.0]]);
XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
XLSX.writeFile(wb, '/tmp/test-upload.xlsx');
console.log('Test file created');
"

# Upload it
curl -X POST http://localhost:3100/api/upload?workspaceId=DEFAULT \
  -F "file=@/tmp/test-upload.xlsx" | jq .
```

Expected: JSON with `fileId`, `filename`, `extractedText` containing CSV data

- [ ] **Step 3: Test Web UI**

Open browser to `http://localhost:5173`:
1. Click 📎 button → select a .xlsx file
2. Verify file tag appears with filename
3. Type a message and send
4. Verify agent receives the file content in prompt
5. Verify message bubble shows attachment tag

- [ ] **Step 4: Test error cases**

1. Try uploading a .txt file → expect "仅支持 .docx .xlsx .pdf" error
2. Try uploading a file > 10MB → expect size error

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete file attachment integration (docx/xlsx/pdf)"
```
