# File Attachment Feature Design

Date: 2026-04-14

## Overview

Add file attachment support to the NanoClaw Web chat interface. Users can upload Word (.docx), Excel (.xlsx), and PDF (.pdf) files via an attachment button in the message composer. The backend parses file content into text, injects it into the agent prompt for immediate analysis, and saves the original file to the workspace for subsequent access.

## Requirements

- **File types:** .docx, .xlsx, .pdf
- **Size limit:** 10MB per file
- **Quantity:** One attachment per message
- **Interaction:** Attachment button (📎) in composer, click to select file
- **Processing:** Auto-extract text content and analyze; save original file to workspace
- **Backward compatible:** Messages without attachments work exactly as before

## Data Flow

```
User clicks 📎 → selects file → frontend preview tag
        ↓
POST /api/upload (multipart/form-data)
        ↓
Backend:
  1. Validate type (docx/xlsx/pdf) + size (≤10MB)
  2. Parse text (pdf-parse / xlsx / mammoth)
  3. Save original to workspace/uploads/{timestamp}_{filename}
        ↓
Returns { fileId, filename, extractedText, filePath }
        ↓
User types message → Send → message + attachment sent via WebSocket + REST
        ↓
Agent prompt includes:
  [Attachment: report.xlsx]
  ---File content start---
  {extractedText}
  ---File content end---
  [User message: analyze this file...]
  [Original file saved to: /path/to/workspace/uploads/xxx]
```

Upload and message send are two separate steps: user uploads first, sees preview, then decides what to say.

## API Design

### New Endpoint: POST /api/upload

- Content-Type: `multipart/form-data`
- Field name: `file`
- Restrictions: single file, docx/xlsx/pdf only, ≤10MB

Response:
```json
{
  "fileId": "f_1713001234567",
  "filename": "report.xlsx",
  "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "size": 245760,
  "extractedText": "Sheet1:\n| Name | Qty | Amount |\n...",
  "filePath": "uploads/1713001234567_report.xlsx"
}
```

### Modified: POST /api/workspaces/:id/conversations/:convId/messages

Body extended with optional `attachment` field:
```json
{
  "role": "user",
  "content": "analyze this file",
  "attachment": {
    "fileId": "f_1713001234567",
    "filename": "report.xlsx",
    "extractedText": "...",
    "filePath": "uploads/1713001234567_report.xlsx"
  }
}
```

Without `attachment`, behavior is unchanged.

### WebSocket Message Extension

Payload gains optional `attachment` field:
```json
{
  "type": "message",
  "content": "analyze this file",
  "workspaceId": "...",
  "conversationId": "...",
  "attachment": { "fileId": "...", "filename": "...", "extractedText": "...", "filePath": "..." }
}
```

## Database Changes

Add `attachment` column to `conversation_messages`:

```sql
ALTER TABLE conversation_messages ADD COLUMN attachment TEXT;
```

Stores JSON string when present, NULL when no attachment. Parsed on read.

## Frontend Changes

### Composer Component (AssistantChat.tsx)

Add 📎 button to the left of the textarea. Hidden `<input type="file" accept=".docx,.xlsx,.pdf">` triggered by button click.

Layout:
```
[📎] [___输入消息...___] [Send]
[📄 report.xlsx ✕]          ← attachment preview (shown when file attached)
Enter 发送 · Shift+Enter 换行
```

State managed with `useState<AttachmentInfo | null>` inside Composer. No global store changes needed.

Interaction flow:
1. Click 📎 → file picker opens
2. File selected → `POST /api/upload` called
3. Upload succeeds → preview tag shown (filename + ✕ remove button)
4. User types message → Send / Enter
5. Message dispatched with attachment info
6. On success → clear attachment state

### UserMessage Component

When `message.attachment` exists, render a small attachment tag above the text:
```
┌─────────────────────────────┐
│ 📄 report.xlsx              │
│ 请分析一下这个文件          │
└─────────────────────────────┘
```

### Event Extension

`nanoclaw-send` custom event detail gains optional `attachment`:
```typescript
window.dispatchEvent(new CustomEvent('nanoclaw-send', {
  detail: { content: text, workspaceId, attachment }
}));
```

`App.tsx` `handleSend` listener updated to pass attachment to both REST API and WebSocket.

## Backend Changes

### New Module: src/file-parser.ts

Single-responsibility module for file content extraction.

```typescript
export interface ParsedFile {
  text: string;
  pageCount?: number;   // PDF pages (optional)
  sheetCount?: number;  // Excel sheets (optional)
}

export async function parseFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ParsedFile>
```

Parsing strategy:
- **.pdf** → `pdf-parse`: extract plain text, keep page markers
- **.xlsx** → `xlsx` (SheetJS): iterate sheets, convert each to CSV text with `sheet_to_csv`, preserve sheet names
- **.docx** → `mammoth`: extract to HTML then strip to plain text, preserve headings and paragraphs

Output truncation: if extracted text exceeds 50,000 characters, truncate and append `[文件内容过长，已截断。完整文件已保存至: {filePath}]`

### Upload Route in web.ts

New multipart upload handler in `handleApiRequest`:
1. Read raw body as Buffer (not UTF-8 string)
2. Parse multipart boundary manually or with a lightweight parser
3. Validate file type and size
4. Call `file-parser.ts` to extract text
5. Save file to `{workspacePath}/uploads/{timestamp}_{filename}`
6. Return parsed result as JSON

### Message Formatting in router.ts

When message has attachment, `formatMessages()` wraps content:

```
<message sender="用户" time="...">
[附件: report.xlsx]
---文件内容开始---
Sheet1:
| Name | Qty | Amount |
...
---文件内容结束---
分析一下这个文件

原始文件已保存至: /path/to/workspace/uploads/1713001234567_report.xlsx
</message>
```

Agent sees text content for immediate analysis and has the file path for deeper access via `Read` tool.

## File Storage

- Location: `{workspacePath}/uploads/{timestamp}_{originalFilename}`
- Timestamp prefix prevents name collisions
- Filename sanitization: remove special characters to prevent path injection
- No automatic cleanup (files are part of workspace, user manages them)

## Error Handling

| Scenario | Response |
|----------|----------|
| Unsupported file type | 400 + "仅支持 .docx .xlsx .pdf" |
| File exceeds 10MB | 413 + "文件大小不能超过 10MB" |
| File parsing fails | 200 with `extractedText: "[文件解析失败: {error}]"`, file still saved |
| Upload network error | Frontend shows error, clears attachment state |

## Dependencies

Three new npm packages:
- `pdf-parse` — PDF text extraction
- `xlsx` — Excel spreadsheet parsing (SheetJS)
- `mammoth` — Word document (.docx) parsing

## Files Modified

| File | Change |
|------|--------|
| `web/src/components/AssistantChat.tsx` | Add attachment button, preview, upload logic to Composer; add attachment tag to UserMessage |
| `web/src/App.tsx` | Update `handleSend` to pass attachment to REST + WebSocket |
| `web/src/store.ts` | Add `AttachmentInfo` type to `ChatMessage` |
| `src/channels/web.ts` | Add `POST /api/upload` route, multipart parsing, extend message handling for attachment |
| `src/file-parser.ts` | **New file** — file content extraction module |
| `src/router.ts` | Extend `formatMessages()` to include attachment text in prompt |
| `src/types.ts` | Add `attachment` field to `NewMessage` interface |
| `src/db.ts` | Add `attachment` column, update insert/query functions |
| `src/group-queue.ts` | Pass attachment info through agent session |
