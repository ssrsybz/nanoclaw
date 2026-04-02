/**
 * Agent Runner for NanoClaw
 * Directly invokes Claude Agent SDK without container isolation
 * For single-user trusted environments only
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

import {
  ANTHROPIC_API_KEY,
  ANTHROPIC_BASE_URL,
  ASSISTANT_NAME,
  DATA_DIR,
  GROUPS_DIR,
  MODEL,
  TIMEZONE,
} from './config.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

// Sentinel markers for output parsing (consistent with container version)
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

interface SessionEntry {
  sessionId: string;
  fullPath: string;
  summary: string;
  firstPrompt: string;
}

interface SessionsIndex {
  entries: SessionEntry[];
}

const SCRIPT_TIMEOUT_MS = 30_000;

/**
 * Get the path to the group's sessions directory
 */
function getGroupSessionsDir(groupFolder: string): string {
  return path.join(DATA_DIR, 'sessions', groupFolder, '.claude');
}

/**
 * Ensure the sessions directory exists with proper settings
 */
function ensureSessionsDir(groupFolder: string): string {
  const sessionsDir = getGroupSessionsDir(groupFolder);
  fs.mkdirSync(sessionsDir, { recursive: true });

  // Create settings.json if it doesn't exist
  const settingsFile = path.join(sessionsDir, 'settings.json');
  if (!fs.existsSync(settingsFile)) {
    fs.writeFileSync(
      settingsFile,
      JSON.stringify(
        {
          env: {
            CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
            CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD: '1',
            CLAUDE_CODE_DISABLE_AUTO_MEMORY: '0',
          },
        },
        null,
        2,
      ) + '\n',
    );
  }

  return sessionsDir;
}

/**
 * Get the working directory for a group
 */
function getGroupWorkingDir(groupFolder: string): string {
  const groupDir = resolveGroupFolderPath(groupFolder);
  fs.mkdirSync(groupDir, { recursive: true });
  return groupDir;
}

/**
 * Run a script for scheduled tasks
 */
async function runScript(script: string): Promise<{ wakeAgent: boolean; data?: unknown } | null> {
  const scriptPath = '/tmp/task-script.sh';
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  return new Promise((resolve) => {
    execFile(
      'bash',
      [scriptPath],
      {
        timeout: SCRIPT_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
        env: process.env,
      },
      (error, stdout, stderr) => {
        if (stderr) {
          logger.debug(`Script stderr: ${stderr.slice(0, 500)}`);
        }

        if (error) {
          logger.warn(`Script error: ${error.message}`);
          return resolve(null);
        }

        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        if (!lastLine) {
          logger.debug('Script produced no output');
          return resolve(null);
        }

        try {
          const result = JSON.parse(lastLine);
          if (typeof result.wakeAgent !== 'boolean') {
            logger.warn(`Script output missing wakeAgent boolean`);
            return resolve(null);
          }
          resolve(result);
        } catch {
          logger.warn(`Script output is not valid JSON: ${lastLine.slice(0, 200)}`);
          resolve(null);
        }
      },
    );
  });
}

/**
 * Write output marker to stdout
 */
function writeOutput(output: AgentOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

/**
 * Get session summary from sessions index
 */
function getSessionSummary(sessionId: string, transcriptPath: string): string | null {
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const entry = index.entries.find((e) => e.sessionId === sessionId);
    return entry?.summary || null;
  } catch {
    return null;
  }
}

/**
 * Format transcript as markdown
 */
function formatTranscriptMarkdown(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  title?: string | null,
  assistantName?: string,
): string {
  const now = new Date();
  const formatDateTime = (d: Date) =>
    d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

  const lines: string[] = [];
  lines.push(`# ${title || 'Conversation'}`);
  lines.push('');
  lines.push(`Archived: ${formatDateTime(now)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const msg of messages) {
    const sender = msg.role === 'user' ? 'User' : assistantName || 'Assistant';
    const content =
      msg.content.length > 2000 ? msg.content.slice(0, 2000) + '...' : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse transcript content into messages
 */
function parseTranscript(content: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.content) {
        const text =
          typeof entry.message.content === 'string'
            ? entry.message.content
            : entry.message.content
                .map((c: { text?: string }) => c.text || '')
                .join('');
        if (text) messages.push({ role: 'user', content: text });
      } else if (entry.type === 'assistant' && entry.message?.content) {
        const textParts = entry.message.content
          .filter((c: { type: string }) => c.type === 'text')
          .map((c: { text: string }) => c.text);
        const text = textParts.join('');
        if (text) messages.push({ role: 'assistant', content: text });
      }
    } catch {
      // Ignore parse errors
    }
  }

  return messages;
}

function sanitizeFilename(summary: string): string {
  return summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function generateFallbackName(): string {
  const time = new Date();
  return `conversation-${time.getHours().toString().padStart(2, '0')}${time
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Main function to run the agent directly
 * This is the primary entry point for agent execution
 */
export async function runAgentDirect(
  group: RegisteredGroup,
  input: AgentInput,
  onOutput?: (output: AgentOutput) => Promise<void>,
): Promise<AgentOutput> {
  const startTime = Date.now();
  const groupDir = getGroupWorkingDir(input.groupFolder);
  const sessionsDir = ensureSessionsDir(input.groupFolder);

  logger.info(
    {
      group: group.name,
      groupFolder: input.groupFolder,
      isMain: input.isMain,
      isScheduledTask: input.isScheduledTask,
    },
    'Starting agent',
  );

  // Build prompt
  let prompt = input.prompt;
  if (input.isScheduledTask) {
    prompt = `[SCHEDULED TASK - The following message was sent automatically and is not coming directly from the user or group.]\n\n${prompt}`;
  }

  // Script phase for scheduled tasks
  if (input.script && input.isScheduledTask) {
    logger.debug('Running task script...');
    const scriptResult = await runScript(input.script);

    if (!scriptResult || !scriptResult.wakeAgent) {
      const reason = scriptResult ? 'wakeAgent=false' : 'script error/no output';
      logger.info(`Script decided not to wake agent: ${reason}`);
      return { status: 'success', result: null };
    }

    prompt = `[SCHEDULED TASK]\n\nScript output:\n${JSON.stringify(scriptResult.data, null, 2)}\n\nInstructions:\n${input.prompt}`;
  }

  // Determine additional directories to mount
  const extraDirs: string[] = [];
  const globalDir = path.join(GROUPS_DIR, 'global');
  if (!input.isMain && fs.existsSync(globalDir)) {
    extraDirs.push(globalDir);
  }

  // MCP tools callback - will be implemented with in-process MCP
  // For now, we use a placeholder that logs
  const mcpTools = {
    sendMessage: async (text: string) => {
      logger.debug(`MCP send_message: ${text.slice(0, 100)}...`);
      // This will be replaced with actual channel message sending
    },
    scheduleTask: async (params: unknown) => {
      logger.debug(`MCP schedule_task: ${JSON.stringify(params).slice(0, 100)}...`);
      // This will be replaced with actual task scheduling
    },
  };

  // Message stream for handling follow-up messages
  class MessageStream {
    private queue: Array<{
      type: 'user';
      message: { role: 'user'; content: string };
      parent_tool_use_id: null;
      session_id: string;
    }> = [];
    private waiting: (() => void) | null = null;
    private done = false;

    push(text: string): void {
      this.queue.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        session_id: '',
      });
      this.waiting?.();
    }

    end(): void {
      this.done = true;
      this.waiting?.();
    }

    async *[Symbol.asyncIterator]() {
      while (true) {
        while (this.queue.length > 0) {
          yield this.queue.shift()!;
        }
        if (this.done) return;
        await new Promise<void>((r) => {
          this.waiting = r;
        });
        this.waiting = null;
      }
    }
  }

  const stream = new MessageStream();
  stream.push(prompt);

  // IPC input watcher - poll for follow-up messages
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
            logger.debug({ file }, 'IPC input message received, pushing to agent stream');
            stream.push(data.text);
          }
          // Remove the file after processing
          fs.unlinkSync(filePath);
        } catch (err) {
          logger.warn({ file, err }, 'Failed to process IPC input file');
        }
      }
    } catch (err) {
      logger.debug({ err }, 'Error checking input directory');
    }
  };

  try {
    // Dynamic import of Claude Agent SDK
    // This allows the code to work even if the SDK is not installed yet
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    let sessionId = input.sessionId;
    let newSessionId: string | undefined;
    let lastAssistantUuid: string | undefined;
    let messageCount = 0;
    let resultCount = 0;

    // Start polling for input messages
    inputCheckInterval = setInterval(checkInputFiles, 1000);

    // Global CLAUDE.md for non-main groups
    let globalClaudeMd: string | undefined;
    if (!input.isMain && fs.existsSync(path.join(globalDir, 'CLAUDE.md'))) {
      globalClaudeMd = fs.readFileSync(path.join(globalDir, 'CLAUDE.md'), 'utf-8');
    }

    // Allowed tools
    const allowedTools = [
      'Bash',
      'Read',
      'Write',
      'Edit',
      'Glob',
      'Grep',
      'WebSearch',
      'WebFetch',
      'Task',
      'TaskOutput',
      'TaskStop',
      'TeamCreate',
      'TeamDelete',
      'SendMessage',
      'TodoWrite',
      'ToolSearch',
      'Skill',
      'NotebookEdit',
      // MCP tools
      'mcp__nanoclaw__send_message',
      'mcp__nanoclaw__schedule_task',
      'mcp__nanoclaw__list_tasks',
      'mcp__nanoclaw__pause_task',
      'mcp__nanoclaw__resume_task',
      'mcp__nanoclaw__cancel_task',
      'mcp__nanoclaw__update_task',
      'mcp__nanoclaw__register_group',
    ];

    // MCP server configuration
    const distDir = path.dirname(fileURLToPath(import.meta.url));
    const mcpServerPath = path.join(distDir, 'mcp-stdio.js');

    // Build environment for SDK (includes LLM credentials if using third-party)
    const sdkEnv: Record<string, string | undefined> = {
      ...process.env,
    };
    if (ANTHROPIC_API_KEY) {
      sdkEnv.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;
    }
    if (ANTHROPIC_BASE_URL) {
      sdkEnv.ANTHROPIC_BASE_URL = ANTHROPIC_BASE_URL;
    }

    // Run the query
    for await (const message of query({
      prompt: stream,
      options: {
        model: MODEL,
        env: sdkEnv,
        cwd: groupDir,
        additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
        resume: sessionId,
        resumeSessionAt: undefined,
        systemPrompt: globalClaudeMd
          ? { type: 'preset' as const, preset: 'claude_code' as const, append: globalClaudeMd }
          : undefined,
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
      messageCount++;
      const msgType =
        message.type === 'system'
          ? `system/${(message as { subtype?: string }).subtype}`
          : message.type;
      logger.debug(`[msg #${messageCount}] type=${msgType}`);

      if (message.type === 'assistant' && 'uuid' in message) {
        lastAssistantUuid = (message as { uuid: string }).uuid;
      }

      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
        logger.debug(`Session initialized: ${newSessionId}`);
      }

      if (message.type === 'system' && (message as { subtype?: string }).subtype === 'task_notification') {
        const tn = message as unknown as { task_id: string; status: string; summary: string };
        logger.debug(`Task notification: task=${tn.task_id} status=${tn.status}`);
      }

      if (message.type === 'result') {
        resultCount++;
        const textResult =
          'result' in message ? (message as { result?: string }).result : null;
        logger.debug(`Result #${resultCount}: ${textResult ? textResult.slice(0, 200) : 'null'}`);

        const output: AgentOutput = {
          status: 'success',
          result: textResult || null,
          newSessionId,
        };

        if (onOutput) {
          await onOutput(output);
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info(
      {
        group: group.name,
        duration,
        messageCount,
        resultCount,
        newSessionId,
      },
      'Agent completed',
    );

    // Cleanup input watcher
    if (inputCheckInterval) {
      clearInterval(inputCheckInterval);
      stream.end();
    }

    return {
      status: 'success',
      result: null,
      newSessionId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ group: group.name, error: errorMessage }, 'Agent error');

    // Cleanup input watcher on error
    if (inputCheckInterval) {
      clearInterval(inputCheckInterval);
      stream.end();
    }

    return {
      status: 'error',
      result: null,
      error: errorMessage,
    };
  }
}

/**
 * Write tasks snapshot for the agent to read
 * (Kept for compatibility, but may not be needed without containers)
 */
export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    script?: string | null;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  const ipcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(ipcDir, { recursive: true });

  const filteredTasks = isMain ? tasks : tasks.filter((t) => t.groupFolder === groupFolder);
  const tasksFile = path.join(ipcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Write available groups snapshot for the agent to read
 */
export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  _registeredJids: Set<string>,
): void {
  const ipcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(ipcDir, { recursive: true });

  const visibleGroups = isMain ? groups : [];
  const groupsFile = path.join(ipcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
