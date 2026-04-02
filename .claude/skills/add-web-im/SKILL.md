---
name: add-web-im
description: Add Web IM channel integration to NanoClaw. Provides a browser-based chat interface with WebSocket real-time communication. No authentication required - designed for local network trust.
---

# Add Web IM Channel

This skill adds a Web IM channel to NanoClaw, providing a browser-based chat interface that automatically registers as the main group.

## Phase 1: Pre-flight

### Check if already applied

Check if `src/channels/web.ts` exists. If it does, skip to Phase 3 (Verify). The code changes are already in place.

## Phase 2: Apply Code Changes

### 2.1 Add dependencies

```bash
npm install ws && npm install -D @types/ws
```

### 2.2 Create Web Channel

Copy the web.ts file from the skill directory:

```bash
cp .claude/skills/add-web-im/web.ts src/channels/web.ts
```

### 2.3 Update channel barrel file

Read `src/channels/index.ts` and add the web import if not present:

```typescript
// web
import './web.js';
```

Place it before `// whatsapp` or at the end of the imports section.

### 2.4 Update ChannelOpts interface

Read `src/channels/registry.ts` and check if `registerGroup` is already in `ChannelOpts`. If not, add it:

```typescript
export interface ChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup?: (jid: string, group: RegisteredGroup) => void;  // Add this line
}
```

### 2.5 Update main index.ts

Read `src/index.ts` and find the `channelOpts` object definition. Check if `registerGroup` is already included. If not, add it:

```typescript
const channelOpts = {
  onMessage: (chatJid: string, msg: NewMessage) => { ... },
  onChatMetadata: (...) => storeChatMetadata(...),
  registeredGroups: () => registeredGroups,
  registerGroup,  // Add this line
};
```

### 2.6 Ensure agent-runner.ts has input watcher

Read `src/agent-runner.ts` and check if it has the IPC input watcher that polls for follow-up messages from `data/ipc/{groupFolder}/input/`.

Look for:
1. A `MessageStream` class that handles follow-up messages
2. An input directory watcher that calls `stream.push(data.text)` when new messages arrive
3. `setInterval(checkInputFiles, 1000)` to start polling
4. Cleanup with `clearInterval(inputCheckInterval)` on completion/error

If the input watcher is missing, it needs to be added. The key components are:

**Before the SDK try block**, define the MessageStream and input watcher:

```typescript
class MessageStream {
  private queue: Array<{...}> = [];
  private waiting: (() => void) | null = null;
  private done = false;

  push(text: string): void { ... }
  end(): void { this.done = true; this.waiting?.(); }
  async *[Symbol.asyncIterator]() { ... }
}

const stream = new MessageStream();
stream.push(prompt);

const inputDir = path.join(DATA_DIR, 'ipc', input.groupFolder, 'input');
const processedFiles = new Set<string>();
let inputCheckInterval: NodeJS.Timeout | null = null;

const checkInputFiles = () => {
  try {
    if (!fs.existsSync(inputDir)) return;
    const files = fs.readdirSync(inputDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      if (processedFiles.has(file)) continue;
      processedFiles.add(file);
      const filePath = path.join(inputDir, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (data.type === 'message' && data.text) {
          stream.push(data.text);
        }
        fs.unlinkSync(filePath);
      } catch (err) { /* skip */ }
    }
  } catch (err) { /* skip */ }
};
```

**Inside the try block**, start the polling:

```typescript
inputCheckInterval = setInterval(checkInputFiles, 1000);
```

**In the completion and error handlers**, cleanup:

```typescript
if (inputCheckInterval) {
  clearInterval(inputCheckInterval);
  stream.end();
}
```

### 2.7 Build and validate

```bash
npm run build
```

Build must be clean before proceeding.

## Phase 3: Verify

### Start the service

If NanoClaw is already running, restart it:

```bash
# macOS launchd
launchctl kickstart -k gui/$(id -u)/com.nanoclaw

# Or for dev mode
npm run dev
```

### Test the Web IM

Open browser to `http://localhost:3100` (or the port configured via `WEB_IM_PORT`).

Send a message and verify the assistant responds.

## Configuration

### Environment Variables

- `WEB_IM_PORT`: Port for Web IM server (default: 3100)

Add to `.env` if you want a different port:

```
WEB_IM_PORT=3200
```

### Auto-Registration

The Web IM channel automatically registers itself as a main group with:
- JID: `web:main`
- Name: `Web IM`
- Folder: `web-main`
- No trigger required (responds to all messages)

## Troubleshooting

### Port already in use

Set a different port via `WEB_IM_PORT` environment variable.

### No response from agent

1. Check the agent session is running: look for "Starting agent" in logs
2. Check IPC input directory: `ls data/ipc/web-main/input/`
3. Check agent-runner.ts has the input watcher code
4. Check the `registerGroup` callback is passed in `channelOpts`

### WebSocket connection fails

1. Ensure the server is running
2. Check firewall settings
3. Try accessing from the same machine first (localhost)

## After Setup

The Web IM channel supports:
- Real-time bidirectional communication via WebSocket
- Auto-registration as main group
- Typing indicators
- Multiple concurrent browser connections
- Embedded HTML frontend (no separate files needed)
