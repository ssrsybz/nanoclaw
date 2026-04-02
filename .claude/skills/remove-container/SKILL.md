---
name: remove-container 移除容器
description: Convert NanoClaw from Docker container architecture to direct SDK execution. Run after /update-nanoclaw when upstream brings back container dependencies. Removes Docker/OneCLI dependency, runs Claude Agent SDK directly in the main process for single-user trusted environments.
---

# Remove Container Dependency

This skill converts NanoClaw from running agents in Docker containers to running the Claude Agent SDK directly in the main Node.js process.

**When to use:** After `/update-nanoclaw` when the upstream merge brings back container-related code. Or when setting up a fresh clone for a single-user trusted environment.

**Security note:** This removes container isolation. Agent Bash commands will execute directly on the host system. Only use in trusted single-user environments.

## Prerequisites

- Node.js 20+
- Claude Agent SDK will be installed automatically
- No Docker required after conversion

## Step 1: Update package.json

Remove `@onecli-sh/sdk` dependency and add SDK dependencies:

```bash
# Remove OneCLI
npm uninstall @onecli-sh/sdk 2>/dev/null || true

# Add SDK dependencies
npm install @anthropic-ai/claude-agent-sdk @modelcontextprotocol/sdk zod

# Update version to indicate major architecture change
node -e "const p=require('./package.json'); p.version='2.0.0'; require('fs').writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n')"
```

## Step 2: Create agent-runner.ts

Create `src/agent-runner.ts` with direct SDK invocation:

```typescript
/**
 * Agent Runner for NanoClaw
 * Directly invokes Claude Agent SDK without container isolation
 * For single-user trusted environments only
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

import { ASSISTANT_NAME, DATA_DIR, GROUPS_DIR, TIMEZONE } from './config.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

const OUTPUT_START_MARKER = '---NANOCLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---NANOCLAW_OUTPUT_END---';

export interface AgentInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
  script?: string;
}

export interface AgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

const SCRIPT_TIMEOUT_MS = 30_000;

function getGroupSessionsDir(groupFolder: string): string {
  return path.join(DATA_DIR, 'sessions', groupFolder, '.claude');
}

function ensureSessionsDir(groupFolder: string): string {
  const sessionsDir = getGroupSessionsDir(groupFolder);
  fs.mkdirSync(sessionsDir, { recursive: true });

  const settingsFile = path.join(sessionsDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(settingsFile, JSON.stringify({
      env: {
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
        CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
      },
    }, null, 2) + '\n');
  }

  return sessionsDir;
}

function getGroupWorkingDir(groupFolder: string): string {
  const groupDir = resolveGroupFolderPath(groupFolder);
  fs.mkdirSync(groupDir, { recursive: true });
  return groupDir;
}

async function runScript(script: string): Promise<{ wakeAgent: boolean; data?: unknown } | null> {
  const scriptPath = '/tmp/task-script.sh';
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  return new Promise((resolve) => {
    execFile('bash', [scriptPath], {
      timeout: SCRIPT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      env: process.env,
    }, (error, stdout, stderr) => {
      if (error) {
        logger.warn(`Script error: ${error.message}`);
        return resolve(null);
      }

      const lines = stdout.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      if (!lastLine) return resolve(null);

      try {
        const result = JSON.parse(lastLine);
        if (typeof result.wakeAgent !== 'boolean') return resolve(null);
        resolve(result);
      } catch {
        resolve(null);
      }
    });
  });
}

export async function runAgentDirect(
  group: RegisteredGroup,
  input: AgentInput,
  onOutput?: (output: AgentOutput) => Promise<void>,
): Promise<AgentOutput> {
  const startTime = Date.now();
  const groupDir = getGroupWorkingDir(input.groupFolder);
  ensureSessionsDir(input.groupFolder);

  logger.info({ group: group.name, groupFolder: input.groupFolder, isMain: input.isMain }, 'Starting agent');

  let prompt = input.prompt;
  if (input.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }

  if (input.script && input.isScheduledTask) {
    const scriptResult = await runScript(input.script);
    if (!scriptResult || !scriptResult.wakeAgent) {
      logger.info(`Script decided not to wake agent`);
      return { status: 'success', result: null };
    }
    prompt = `[SCHEDULED TASK]\n\nScript output:\n${JSON.stringify(scriptResult.data, null, 2)}\n\nInstructions:\n${input.prompt}`;
  }

  const extraDirs: string[] = [];
  const globalDir = path.join(GROUPS_DIR, 'global');
  if (!input.isMain && fs.existsSync(globalDir)) {
    extraDirs.push(globalDir);
  }

  try {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    let sessionId = input.sessionId;
    let newSessionId: string | undefined;
    let lastAssistantUuid: string | undefined;

    class MessageStream {
      private queue: Array<{ type: 'user'; message: { role: 'user'; content: string }; parent_tool_use_id: null; session_id: string }> = [];
      private waiting: (() => void) | null = null;
      private done = false;

      push(text: string): void {
        this.queue.push({ type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null, session_id: '' });
        this.waiting?.();
      }

      end(): void { this.done = true; this.waiting?.(); }

      async *[Symbol.asyncIterator]() {
        while (true) {
          while (this.queue.length > 0) yield this.queue.shift()!;
          if (this.done) return;
          await new Promise<void>(r => { this.waiting = r; });
          this.waiting = null;
        }
      }
    }

    const stream = new MessageStream();
    stream.push(prompt);

    let globalClaudeMd: string | undefined;
    if (!input.isMain && fs.existsSync(path.join(globalDir, 'CLAUDE.md'))) {
      globalClaudeMd = fs.readFileSync(path.join(globalDir, 'CLAUDE.md'), 'utf-8');
    }

    const allowedTools = [
      'Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep',
      'WebSearch', 'WebFetch', 'Task', 'TaskOutput', 'TaskStop',
      'TeamCreate', 'TeamDelete', 'SendMessage', 'TodoWrite', 'ToolSearch', 'Skill', 'NotebookEdit',
      'mcp__nanoclaw__send_message', 'mcp__nanoclaw__schedule_task', 'mcp__nanoclaw__list_tasks',
      'mcp__nanoclaw__pause_task', 'mcp__nanoclaw__resume_task', 'mcp__nanoclaw__cancel_task',
      'mcp__nanoclaw__update_task', 'mcp__nanoclaw__register_group',
    ];

    const distDir = path.dirname(fileURLToPath(import.meta.url));
    const mcpServerPath = path.join(distDir, 'mcp-stdio.js');

    for await (const message of query({
      prompt: stream,
      options: {
        cwd: groupDir,
        additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
        resume: sessionId,
        systemPrompt: globalClaudeMd ? { type: 'preset', preset: 'claude_code', append: globalClaudeMd } : undefined,
        allowedTools,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        settingSources: ['project', 'user'],
        mcpServers: {
          nanoclaw: {
            command: process.execPath,
            args: [mcpServerPath],
            env: {
              NANOCLAW_CHAT_JID: input.chatJid,
              NANOCLAW_GROUP_FOLDER: input.groupFolder,
              NANOCLAW_IS_MAIN: input.isMain ? '1' : '0',
              NANOCLAW_DATA_DIR: DATA_DIR,
            },
          },
        },
      },
    })) {
      if (message.type === 'assistant' && 'uuid' in message) {
        lastAssistantUuid = (message as { uuid: string }).uuid;
      }

      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
      }

      if (message.type === 'result') {
        const textResult = 'result' in message ? (message as { result?: string }).result : null;
        if (onOutput) {
          await onOutput({ status: 'success', result: textResult || null, newSessionId });
        }
      }
    }

    logger.info({ group: group.name, duration: Date.now() - startTime }, 'Agent completed');
    return { status: 'success', result: null, newSessionId };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ group: group.name, error: errorMessage }, 'Agent error');
    return { status: 'error', result: null, error: errorMessage };
  }
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

export function writeTasksSnapshot(groupFolder: string, isMain: boolean, tasks: Array<{
  id: string; groupFolder: string; prompt: string; script?: string | null;
  schedule_type: string; schedule_value: string; status: string; next_run: string | null;
}>): void {
  const ipcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(ipcDir, { recursive: true });
  const filteredTasks = isMain ? tasks : tasks.filter(t => t.groupFolder === groupFolder);
  fs.writeFileSync(path.join(ipcDir, 'current_tasks.json'), JSON.stringify(filteredTasks, null, 2));
}

export function writeGroupsSnapshot(groupFolder: string, isMain: boolean, groups: AvailableGroup[], _registeredJids: Set<string>): void {
  const ipcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(ipcDir, { recursive: true });
  const visibleGroups = isMain ? groups : [];
  fs.writeFileSync(path.join(ipcDir, 'available_groups.json'), JSON.stringify({ groups: visibleGroups, lastSync: new Date().toISOString() }, null, 2));
}
```

## Step 3: Create MCP Server Files

Create `src/mcp-stdio.ts`:

```typescript
/**
 * MCP Stdio Server Entry Point for NanoClaw
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';

const chatJid = process.env.NANOCLAW_CHAT_JID!;
const groupFolder = process.env.NANOCLAW_GROUP_FOLDER!;
const isMain = process.env.NANOCLAW_IS_MAIN === '1';
const dataDir = process.env.NANOCLAW_DATA_DIR!;

const IPC_DIR = path.join(dataDir, 'ipc', groupFolder);
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);
  return filename;
}

const server = new McpServer({ name: 'nanoclaw', version: '1.0.0' });

server.tool('send_message', "Send a message to the user or group immediately.", {
  text: z.string().describe('The message text'),
  sender: z.string().optional().describe('Sender identity'),
}, async (args) => {
  writeIpcFile(MESSAGES_DIR, { type: 'message', chatJid, text: args.text, sender: args.sender, groupFolder, timestamp: new Date().toISOString() });
  return { content: [{ type: 'text', text: 'Message sent.' }] };
});

server.tool('schedule_task', `Schedule a recurring or one-time task.`, {
  prompt: z.string().describe('What the agent should do'),
  schedule_type: z.enum(['cron', 'interval', 'once']),
  schedule_value: z.string(),
  context_mode: z.enum(['group', 'isolated']).default('group'),
  target_group_jid: z.string().optional(),
  script: z.string().optional(),
}, async (args) => {
  if (args.schedule_type === 'cron') {
    try { CronExpressionParser.parse(args.schedule_value); } catch {
      return { content: [{ type: 'text', text: `Invalid cron: "${args.schedule_value}"` }], isError: true };
    }
  }
  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  writeIpcFile(TASKS_DIR, { type: 'schedule_task', taskId, prompt: args.prompt, schedule_type: args.schedule_type, schedule_value: args.schedule_value, context_mode: args.context_mode || 'group', targetJid: isMain && args.target_group_jid ? args.target_group_jid : chatJid, createdBy: groupFolder });
  return { content: [{ type: 'text', text: `Task ${taskId} scheduled` }] };
});

server.tool('list_tasks', "List scheduled tasks.", {}, async () => {
  const tasksFile = path.join(IPC_DIR, 'current_tasks.json');
  if (!fs.existsSync(tasksFile)) return { content: [{ type: 'text', text: 'No tasks found.' }] };
  const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
  const filtered = isMain ? tasks : tasks.filter((t: { groupFolder: string }) => t.groupFolder === groupFolder);
  return { content: [{ type: 'text', text: `Tasks:\n${filtered.map((t: any) => `- [${t.id}] ${t.prompt.slice(0, 50)}...`).join('\n')}` }] };
});

server.tool('pause_task', 'Pause a task.', { task_id: z.string() }, async (args) => {
  writeIpcFile(TASKS_DIR, { type: 'pause_task', taskId: args.task_id, groupFolder, isMain });
  return { content: [{ type: 'text', text: `Task ${args.task_id} pause requested.` }] };
});

server.tool('resume_task', 'Resume a task.', { task_id: z.string() }, async (args) => {
  writeIpcFile(TASKS_DIR, { type: 'resume_task', taskId: args.task_id, groupFolder, isMain });
  return { content: [{ type: 'text', text: `Task ${args.task_id} resume requested.` }] };
});

server.tool('cancel_task', 'Cancel a task.', { task_id: z.string() }, async (args) => {
  writeIpcFile(TASKS_DIR, { type: 'cancel_task', taskId: args.task_id, groupFolder, isMain });
  return { content: [{ type: 'text', text: `Task ${args.task_id} cancelled.` }] };
});

server.tool('update_task', 'Update a task.', {
  task_id: z.string(), prompt: z.string().optional(), schedule_type: z.enum(['cron', 'interval', 'once']).optional(),
  schedule_value: z.string().optional(), script: z.string().optional(),
}, async (args) => {
  const data: Record<string, any> = { type: 'update_task', taskId: args.task_id, groupFolder, isMain };
  if (args.prompt !== undefined) data.prompt = args.prompt;
  if (args.script !== undefined) data.script = args.script;
  if (args.schedule_type !== undefined) data.schedule_type = args.schedule_type;
  if (args.schedule_value !== undefined) data.schedule_value = args.schedule_value;
  writeIpcFile(TASKS_DIR, data);
  return { content: [{ type: 'text', text: `Task ${args.task_id} updated.` }] };
});

server.tool('register_group', 'Register a new group. Main only.', {
  jid: z.string(), name: z.string(), folder: z.string(), trigger: z.string(),
}, async (args) => {
  if (!isMain) return { content: [{ type: 'text', text: 'Only main group can register.' }], isError: true };
  writeIpcFile(TASKS_DIR, { type: 'register_group', jid: args.jid, name: args.name, folder: args.folder, trigger: args.trigger });
  return { content: [{ type: 'text', text: `Group "${args.name}" registered.` }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

## Step 4: Update config.ts

Remove container-related exports and add `MAX_CONCURRENT_AGENTS`:

```bash
# Remove these exports from src/config.ts:
# - CONTAINER_IMAGE
# - CONTAINER_TIMEOUT
# - CONTAINER_MAX_OUTPUT_SIZE
# - ONECLI_URL
# - MAX_CONCURRENT_CONTAINERS
# - MOUNT_ALLOWLIST_PATH

# Add this export:
sed -i '' '/export const MAX_CONCURRENT_CONTAINERS/,/);/c\
export const MAX_CONCURRENT_AGENTS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_AGENTS || '\''5'\'', 10) || 5);\
export const AGENT_TIMEOUT = parseInt(process.env.AGENT_TIMEOUT || '\''1800000'\'', 10);
' src/config.ts 2>/dev/null || sed -i '/export const MAX_CONCURRENT_CONTAINERS/,/);/c\export const MAX_CONCURRENT_AGENTS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_AGENTS || '\''5'\'', 10) || 5);\nexport const AGENT_TIMEOUT = parseInt(process.env.AGENT_TIMEOUT || '\''1800000'\'', 10);' src/config.ts
```

## Step 5: Update index.ts

Replace container imports and calls:

```typescript
// Replace this import:
// import { ContainerOutput, runContainerAgent, writeGroupsSnapshot, writeTasksSnapshot } from './container-runner.js';
// With:
import { AgentOutput, runAgentDirect, writeGroupsSnapshot, writeTasksSnapshot } from './agent-runner.js';

// Remove:
// import { OneCLI } from '@onecli-sh/sdk';
// import { ensureContainerRuntimeRunning, cleanupOrphans } from './container-runtime.js';

// Remove OneCLI initialization and ensureOneCLIAgent function
// Replace runContainerAgent calls with runAgentDirect
// Remove idle timer and closeStdin logic (no longer needed)
```

## Step 6: Update task-scheduler.ts

```typescript
// Replace import:
// import { ContainerOutput, runContainerAgent } from './container-runner.js';
// With:
import { AgentOutput, runAgentDirect } from './agent-runner.js';

// Remove ChildProcess import
// Remove onProcess from SchedulerDependencies
// Replace runContainerAgent with runAgentDirect
// Remove closeTimer and closeStdin logic
```

## Step 7: Update group-queue.ts

Simplify process management:

```typescript
// Remove ChildProcess import
// Replace MAX_CONCURRENT_CONTAINERS with MAX_CONCURRENT_AGENTS
// Remove process, containerName from GroupState
// Replace registerProcess with registerAgent
// Remove closeStdin, notifyIdle methods
// Update active check messages from "container" to "agent"
```

## Step 8: Update types.ts

Remove container-related types:

```typescript
// Remove these interfaces:
// - AdditionalMount
// - MountAllowlist
// - AllowedRoot
// - ContainerConfig

// Remove from RegisteredGroup:
// - containerConfig?: ContainerConfig
```

## Step 9: Update db.ts

Remove containerConfig handling:

```typescript
// Remove container_config from INSERT/UPDATE statements
// Remove containerConfig from return objects in getRegisteredGroup, getAllRegisteredGroups
```

## Step 10: Update ipc.ts

```typescript
// Replace import:
// import { AvailableGroup } from './container-runner.js';
// With:
import { AvailableGroup } from './agent-runner.js';

// Remove containerConfig from register_group handling
```

## Step 11: Update sender-allowlist.ts

Fix config path (it referenced removed MOUNT_ALLOWLIST_PATH):

```typescript
// Add local path definition:
const HOME_DIR = process.env.HOME || os.homedir();
const SENDER_ALLOWLIST_PATH = path.join(HOME_DIR, '.config', 'nanoclaw', 'sender-allowlist.json');
```

## Step 12: Delete Container Files

```bash
rm -f src/container-runner.ts
rm -f src/container-runtime.ts
rm -f src/mount-security.ts
rm -f src/container-runner.test.ts
rm -f src/container-runtime.test.ts
rm -rf container/
```

## Step 13: Update CLAUDE.md

Replace architecture description with:

```markdown
## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running directly in the main process. Each group has isolated filesystem and memory.

> **Note:** This version runs without Docker containers. Agent Bash commands execute directly on the host system. Use only in trusted single-user environments.

## Key Files

| File | Purpose |
|------|---------|
| src/index.ts | Orchestrator: state, message loop, agent invocation |
| src/agent-runner.ts | Direct Claude Agent SDK invocation |
| src/mcp-stdio.ts | MCP server for agent tools |
| src/channels/registry.ts | Channel registry |
| src/ipc.ts | IPC watcher and task processing |
| src/config.ts | Trigger pattern, paths, intervals |
| src/task-scheduler.ts | Runs scheduled tasks |
| src/group-queue.ts | Agent session management |
| src/db.ts | SQLite operations |
| groups/{name}/CLAUDE.md | Per-group memory |

## Secrets / Credentials

API keys are read directly from .env file. Set ANTHROPIC_API_KEY in your .env file.
```

## Step 14: Build and Verify

```bash
npm install
npm run build
```

If type errors occur, fix them:
- Update test files that reference removed methods (`registerProcess`, `notifyIdle`, `closeStdin`)
- Remove container-related test mocks

## Troubleshooting

**Type error: Cannot find module './container-runner.js'**
- Update imports to use `./agent-runner.js`

**Type error: Property 'containerConfig' does not exist**
- Remove containerConfig references from types and db

**Type error: MAX_CONCURRENT_CONTAINERS not found**
- Replace with MAX_CONCURRENT_AGENTS

**Build fails with MCP SDK errors**
- Ensure `@modelcontextprotocol/sdk` and `zod` are installed
