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
  ASSISTANT_NAME,
  DATA_DIR,
  GROUPS_DIR,
  TIMEZONE,
} from './config.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';
import { pushStatus } from './star-office-reporter.js';

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
  workspacePath?: string; // If set, overrides group folder as cwd
  enabledSkills?: string[]; // Skills to inject into systemPrompt
  workspaceId?: string; // If set, namespaces session directory per workspace
}

export interface AgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
  // Streaming fields for real-time UI updates
  streamType?: 'assistant' | 'thinking' | 'tool_use' | 'tool_result' | 'result';
  streamData?: {
    text?: string;
    thinking?: string;
    toolName?: string;
    toolInput?: string;
    toolOutput?: string;
  };
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
 * Get the path to the group's sessions directory.
 * When workspaceId is provided, sessions are namespaced per workspace:
 * data/sessions/{groupFolder}--ws-{workspaceId}/.claude
 */
function getGroupSessionsDir(
  groupFolder: string,
  workspaceId?: string,
): string {
  if (workspaceId) {
    return path.join(
      DATA_DIR,
      'sessions',
      `${groupFolder}--ws-${workspaceId}`,
      '.claude',
    );
  }
  return path.join(DATA_DIR, 'sessions', groupFolder, '.claude');
}

/**
 * Ensure the sessions directory exists with proper settings.
 * When workspaceId is provided, sessions are namespaced per workspace.
 */
function ensureSessionsDir(groupFolder: string, workspaceId?: string): string {
  const sessionsDir = getGroupSessionsDir(groupFolder, workspaceId);
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
async function runScript(
  script: string,
): Promise<{ wakeAgent: boolean; data?: unknown } | null> {
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
          logger.warn(
            `Script output is not valid JSON: ${lastLine.slice(0, 200)}`,
          );
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
function getSessionSummary(
  sessionId: string,
  transcriptPath: string,
): string | null {
  const projectDir = path.dirname(transcriptPath);
  const indexPath = path.join(projectDir, 'sessions-index.json');

  if (!fs.existsSync(indexPath)) {
    return null;
  }

  try {
    const index: SessionsIndex = JSON.parse(
      fs.readFileSync(indexPath, 'utf-8'),
    );
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
      msg.content.length > 2000
        ? msg.content.slice(0, 2000) + '...'
        : msg.content;
    lines.push(`**${sender}**: ${content}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse transcript content into messages
 */
function parseTranscript(
  content: string,
): Array<{ role: 'user' | 'assistant'; content: string }> {
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
  const groupDir = input.workspacePath || getGroupWorkingDir(input.groupFolder);
  const sessionsDir = ensureSessionsDir(input.groupFolder, input.workspaceId);

  logger.info(
    {
      group: group.name,
      groupFolder: input.groupFolder,
      isMain: input.isMain,
      isScheduledTask: input.isScheduledTask,
    },
    'Starting agent',
  );

  // Push status to Star Office UI
  void pushStatus('executing', `正在为 ${group.name} 处理任务...`);

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
      const reason = scriptResult
        ? 'wakeAgent=false'
        : 'script error/no output';
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
      logger.debug(
        `MCP schedule_task: ${JSON.stringify(params).slice(0, 100)}...`,
      );
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
      const files = fs.readdirSync(inputDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        if (processedFiles.has(file)) continue;
        processedFiles.add(file);

        const filePath = path.join(inputDir, file);
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (data.type === 'message' && data.text) {
            logger.debug(
              { file },
              'IPC input message received, pushing to agent stream',
            );
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
    // NOTE: We intentionally do NOT validate the session transcript file here.
    // The Claude CLI stores session transcripts in its own internal directory
    // (typically ~/.claude/projects/{cwd-hash}/sessions/), NOT in our
    // data/sessions/ directory. Validating against the wrong path would
    // always fail, causing every message to start a new session and lose
    // all conversation context. Trust the session ID returned by the SDK.
    logger.info(
      {
        sessionId: sessionId || '(new session)',
        groupFolder: input.groupFolder,
        workspaceId: input.workspaceId,
      },
      'Resuming agent session',
    );
    let newSessionId: string | undefined;
    let lastAssistantUuid: string | undefined;
    let messageCount = 0;
    let resultCount = 0;

    // Start polling for input messages
    inputCheckInterval = setInterval(checkInputFiles, 1000);

    // Global CLAUDE.md for non-main groups
    let globalClaudeMd: string | undefined;
    if (!input.isMain && fs.existsSync(path.join(globalDir, 'CLAUDE.md'))) {
      globalClaudeMd = fs.readFileSync(
        path.join(globalDir, 'CLAUDE.md'),
        'utf-8',
      );
    }

    // Inject enabled skills into systemPrompt
    let skillContent = '';
    if (
      input.enabledSkills &&
      input.enabledSkills.length > 0 &&
      input.workspacePath
    ) {
      const MAX_SKILL_BYTES = 32 * 1024;
      let totalBytes = 0;
      for (const skillName of input.enabledSkills) {
        const skillMdPath = path.join(
          input.workspacePath,
          '.claude',
          'skills',
          skillName,
          'SKILL.md',
        );
        if (fs.existsSync(skillMdPath)) {
          const content = fs.readFileSync(skillMdPath, 'utf-8');
          const wrapped = `\n<!-- SKILL: ${skillName} -->\n${content}\n<!-- END SKILL: ${skillName} -->\n`;
          if (totalBytes + wrapped.length > MAX_SKILL_BYTES) break;
          skillContent += wrapped;
          totalBytes += wrapped.length;
        }
      }
    }

    const systemPrompt =
      (globalClaudeMd || 'You are a helpful AI assistant.') + skillContent;

    // Allowed tools — only standard tools; MCP tool names are added
    // dynamically when mcpServers is configured.
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
    ];

    // MCP server configuration
    const distDir = path.dirname(fileURLToPath(import.meta.url));
    const mcpServerPath = path.join(distDir, 'mcp-stdio.js');

    // Build MCP config: only enable when the server binary exists
    let mcpServersConfig: Record<string, unknown> | undefined;
    if (fs.existsSync(mcpServerPath)) {
      mcpServersConfig = {
        nanoclaw: {
          command: process.execPath,
          args: [mcpServerPath],
          env: { ...process.env },
        },
      };
      // Add MCP tools to allowed list only when MCP is active
      allowedTools.push(
        'mcp__nanoclaw__send_message',
        'mcp__nanoclaw__schedule_task',
        'mcp__nanoclaw__list_tasks',
        'mcp__nanoclaw__pause_task',
        'mcp__nanoclaw__resume_task',
        'mcp__nanoclaw__cancel_task',
        'mcp__nanoclaw__update_task',
        'mcp__nanoclaw__register_group',
      );
    }

    // Run the query
    for await (const message of query({
      prompt: prompt,
      options: {
        cwd: groupDir,
        additionalDirectories: extraDirs.length > 0 ? extraDirs : undefined,
        resume: sessionId,
        resumeSessionAt: undefined,
        systemPrompt: systemPrompt,
        allowedTools,
        permissionMode: 'bypassPermissions',
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: '/opt/homebrew/bin/claude',
        stderr: (data) => {
          const stderrStr = typeof data === 'string' ? data : String(data);
          logger.debug(`Claude stderr: ${stderrStr.slice(0, 500)}`);
        },
        mcpServers: mcpServersConfig as
          | Record<
              string,
              import('@anthropic-ai/claude-agent-sdk').McpServerConfig
            >
          | undefined,
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

        // Forward assistant message parts (text, thinking, tool_use) for streaming
        const assistantMsg = message as unknown as {
          message?: {
            content?: Array<{
              type: string;
              text?: string;
              thinking?: string;
              name?: string;
              input?: unknown;
            }>;
          };
        };
        if (onOutput && assistantMsg.message?.content) {
          for (const part of assistantMsg.message.content) {
            if (part.type === 'text' && part.text) {
              await onOutput({
                status: 'success',
                result: null,
                newSessionId,
                streamType: 'assistant',
                streamData: { text: part.text },
              });
            } else if (part.type === 'thinking' && part.thinking) {
              await onOutput({
                status: 'success',
                result: null,
                newSessionId,
                streamType: 'thinking',
                streamData: { thinking: part.thinking },
              });
            } else if (part.type === 'tool_use' && part.name) {
              await onOutput({
                status: 'success',
                result: null,
                newSessionId,
                streamType: 'tool_use',
                streamData: {
                  toolName: part.name,
                  toolInput:
                    typeof part.input === 'string'
                      ? part.input
                      : JSON.stringify(part.input, null, 2),
                },
              });
            }
          }
        }
      }

      // Handle tool_result parts from user messages (SDK puts tool results in user messages)
      if (message.type === 'user' && onOutput) {
        const userMsg = message as unknown as {
          message?: {
            content?: Array<{
              type: string;
              tool_use_id?: string;
              content?: string | Array<{ type: string; text?: string }>;
            }>;
          };
        };
        if (userMsg.message?.content) {
          for (const part of userMsg.message.content) {
            if (part.type === 'tool_result') {
              let text = '';
              if (typeof part.content === 'string') {
                text = part.content;
              } else if (Array.isArray(part.content)) {
                text = part.content
                  .filter((b: { type: string }) => b.type === 'text')
                  .map((b: { text?: string }) => b.text || '')
                  .join('');
              }
              if (text) {
                await onOutput({
                  status: 'success',
                  result: null,
                  newSessionId,
                  streamType: 'tool_result',
                  streamData: { toolOutput: text },
                });
              }
            }
          }
        }
      }

      if (message.type === 'system' && message.subtype === 'init') {
        newSessionId = message.session_id;
        logger.info(
          {
            sessionId: newSessionId,
            previousSessionId: sessionId || '(none)',
            isNewSession: !sessionId,
          },
          'Session initialized',
        );
      }

      if (
        message.type === 'system' &&
        (message as { subtype?: string }).subtype === 'task_notification'
      ) {
        const tn = message as unknown as {
          task_id: string;
          status: string;
          summary: string;
        };
        logger.debug(
          `Task notification: task=${tn.task_id} status=${tn.status}`,
        );
      }

      if (message.type === 'result') {
        resultCount++;
        const textResult =
          'result' in message ? (message as { result?: string }).result : null;
        logger.debug(
          `Result #${resultCount}: ${textResult ? textResult.slice(0, 200) : 'null'}`,
        );

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

    // Push idle status to Star Office UI
    void pushStatus('idle', '任务完成，待命中...');

    return {
      status: 'success',
      result: null,
      newSessionId,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ group: group.name, error: errorMessage }, 'Agent error');

    // Push error status to Star Office UI
    void pushStatus('error', '任务执行出错，排查中...');

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

  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);
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
