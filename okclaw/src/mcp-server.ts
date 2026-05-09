/**
 * In-process MCP Server for OKClaw
 * Provides MCP tools directly callable by the agent without stdio transport
 */
import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';

/**
 * Context for MCP tools
 */
export interface McpContext {
  chatJid: string;
  groupFolder: string;
  isMain: boolean;
  dataDir: string;
}

/**
 * Callbacks for MCP tool actions
 */
export interface McpCallbacks {
  sendMessage: (
    chatJid: string,
    text: string,
    sender?: string,
  ) => Promise<void>;
  scheduleTask: (task: {
    id: string;
    prompt: string;
    script?: string;
    schedule_type: 'cron' | 'interval' | 'once';
    schedule_value: string;
    context_mode: 'group' | 'isolated';
    targetJid: string;
    createdBy: string;
  }) => Promise<void>;
  pauseTask: (
    taskId: string,
    groupFolder: string,
    isMain: boolean,
  ) => Promise<void>;
  resumeTask: (
    taskId: string,
    groupFolder: string,
    isMain: boolean,
  ) => Promise<void>;
  cancelTask: (
    taskId: string,
    groupFolder: string,
    isMain: boolean,
  ) => Promise<void>;
  updateTask: (
    taskId: string,
    updates: Record<string, string | undefined>,
    groupFolder: string,
    isMain: boolean,
  ) => Promise<void>;
  registerGroup: (
    jid: string,
    name: string,
    folder: string,
    trigger: string,
  ) => Promise<void>;
  listTasks: (
    groupFolder: string,
    isMain: boolean,
  ) => Promise<
    Array<{
      id: string;
      prompt: string;
      schedule_type: string;
      schedule_value: string;
      status: string;
      next_run: string | null;
    }>
  >;
  listAvailableGroups: (isMain: boolean) => Promise<
    Array<{
      jid: string;
      name: string;
      isRegistered: boolean;
    }>
  >;
}

/**
 * MCP Tool definition compatible with Claude Agent SDK
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<any>;
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}

/**
 * Create MCP tools with the given context and callbacks
 */
export function createMcpTools(
  context: McpContext,
  callbacks: McpCallbacks,
): McpTool[] {
  const { chatJid, groupFolder, isMain } = context;

  return [
    {
      name: 'send_message',
      description:
        "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times.",
      inputSchema: z.object({
        text: z.string().describe('The message text to send'),
        sender: z
          .string()
          .optional()
          .describe(
            'Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.',
          ),
      }),
      handler: async (args) => {
        await callbacks.sendMessage(
          chatJid,
          args.text as string,
          args.sender as string | undefined,
        );
        return { content: [{ type: 'text', text: 'Message sent.' }] };
      },
    },

    {
      name: 'schedule_task',
      description: `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools. Returns the task ID for future reference. To modify an existing task, use update_task instead.

CONTEXT MODE - Choose based on task type:
• "group": Task runs in the group's conversation context, with access to chat history. Use for tasks that need context about ongoing discussions, user preferences, or recent interactions.
• "isolated": Task runs in a fresh session with no conversation history. Use for independent tasks that don't need prior context. When using isolated mode, include all necessary context in the prompt itself.

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
• cron: Standard cron expression (e.g., "*/5 * * * *" for every 5 minutes, "0 9 * * *" for daily at 9am LOCAL time)
• interval: Milliseconds between runs (e.g., "300000" for 5 minutes, "3600000" for 1 hour)
• once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00"). Do NOT use UTC/Z suffix.`,
      inputSchema: z.object({
        prompt: z
          .string()
          .describe(
            'What the agent should do when the task runs. For isolated mode, include all necessary context here.',
          ),
        schedule_type: z
          .enum(['cron', 'interval', 'once'])
          .describe(
            'cron=recurring at specific times, interval=recurring every N ms, once=run once at specific time',
          ),
        schedule_value: z
          .string()
          .describe(
            'cron: "*/5 * * * *" | interval: milliseconds like "300000" | once: local timestamp like "2026-02-01T15:30:00" (no Z suffix!)',
          ),
        context_mode: z
          .enum(['group', 'isolated'])
          .default('group')
          .describe(
            'group=runs with chat history and memory, isolated=fresh session (include context in prompt)',
          ),
        target_group_jid: z
          .string()
          .optional()
          .describe(
            '(Main group only) JID of the group to schedule the task for. Defaults to the current group.',
          ),
        script: z
          .string()
          .optional()
          .describe('Optional bash script to run before waking the agent.'),
      }),
      handler: async (args) => {
        const scheduleType = args.schedule_type as 'cron' | 'interval' | 'once';
        const scheduleValue = args.schedule_value as string;

        // Validate schedule_value
        if (scheduleType === 'cron') {
          try {
            CronExpressionParser.parse(scheduleValue);
          } catch {
            return {
              content: [
                {
                  type: 'text',
                  text: `Invalid cron: "${scheduleValue}". Use format like "0 9 * * *" (daily 9am) or "*/5 * * * *" (every 5 min).`,
                },
              ],
              isError: true,
            };
          }
        } else if (scheduleType === 'interval') {
          const ms = parseInt(scheduleValue, 10);
          if (isNaN(ms) || ms <= 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Invalid interval: "${scheduleValue}". Must be positive milliseconds (e.g., "300000" for 5 min).`,
                },
              ],
              isError: true,
            };
          }
        } else if (scheduleType === 'once') {
          if (
            /[Zz]$/.test(scheduleValue) ||
            /[+-]\d{2}:\d{2}$/.test(scheduleValue)
          ) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Timestamp must be local time without timezone suffix. Got "${scheduleValue}" — use format like "2026-02-01T15:30:00".`,
                },
              ],
              isError: true,
            };
          }
          const date = new Date(scheduleValue);
          if (isNaN(date.getTime())) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Invalid timestamp: "${scheduleValue}". Use local time format like "2026-02-01T15:30:00".`,
                },
              ],
              isError: true,
            };
          }
        }

        const targetJid =
          isMain && args.target_group_jid
            ? (args.target_group_jid as string)
            : chatJid;
        const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        await callbacks.scheduleTask({
          id: taskId,
          prompt: args.prompt as string,
          script: args.script as string | undefined,
          schedule_type: scheduleType,
          schedule_value: scheduleValue,
          context_mode: (args.context_mode as 'group' | 'isolated') || 'group',
          targetJid,
          createdBy: groupFolder,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Task ${taskId} scheduled: ${scheduleType} - ${scheduleValue}`,
            },
          ],
        };
      },
    },

    {
      name: 'list_tasks',
      description:
        "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
      inputSchema: z.object({}),
      handler: async () => {
        const tasks = await callbacks.listTasks(groupFolder, isMain);

        if (tasks.length === 0) {
          return {
            content: [{ type: 'text', text: 'No scheduled tasks found.' }],
          };
        }

        const formatted = tasks
          .map(
            (t) =>
              `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
          )
          .join('\n');

        return {
          content: [{ type: 'text', text: `Scheduled tasks:\n${formatted}` }],
        };
      },
    },

    {
      name: 'pause_task',
      description: 'Pause a scheduled task. It will not run until resumed.',
      inputSchema: z.object({
        task_id: z.string().describe('The task ID to pause'),
      }),
      handler: async (args) => {
        await callbacks.pauseTask(args.task_id as string, groupFolder, isMain);
        return {
          content: [
            { type: 'text', text: `Task ${args.task_id} pause requested.` },
          ],
        };
      },
    },

    {
      name: 'resume_task',
      description: 'Resume a paused task.',
      inputSchema: z.object({
        task_id: z.string().describe('The task ID to resume'),
      }),
      handler: async (args) => {
        await callbacks.resumeTask(args.task_id as string, groupFolder, isMain);
        return {
          content: [
            { type: 'text', text: `Task ${args.task_id} resume requested.` },
          ],
        };
      },
    },

    {
      name: 'cancel_task',
      description: 'Cancel and delete a scheduled task.',
      inputSchema: z.object({
        task_id: z.string().describe('The task ID to cancel'),
      }),
      handler: async (args) => {
        await callbacks.cancelTask(args.task_id as string, groupFolder, isMain);
        return {
          content: [
            {
              type: 'text',
              text: `Task ${args.task_id} cancellation requested.`,
            },
          ],
        };
      },
    },

    {
      name: 'update_task',
      description:
        'Update an existing scheduled task. Only provided fields are changed; omitted fields stay the same.',
      inputSchema: z.object({
        task_id: z.string().describe('The task ID to update'),
        prompt: z.string().optional().describe('New prompt for the task'),
        schedule_type: z
          .enum(['cron', 'interval', 'once'])
          .optional()
          .describe('New schedule type'),
        schedule_value: z
          .string()
          .optional()
          .describe('New schedule value (see schedule_task for format)'),
        script: z
          .string()
          .optional()
          .describe(
            'New script for the task. Set to empty string to remove the script.',
          ),
      }),
      handler: async (args) => {
        const updates: Record<string, string | undefined> = {};
        if (args.prompt !== undefined) updates.prompt = args.prompt as string;
        if (args.script !== undefined) updates.script = args.script as string;
        if (args.schedule_type !== undefined)
          updates.schedule_type = args.schedule_type as string;
        if (args.schedule_value !== undefined)
          updates.schedule_value = args.schedule_value as string;

        await callbacks.updateTask(
          args.task_id as string,
          updates,
          groupFolder,
          isMain,
        );
        return {
          content: [
            { type: 'text', text: `Task ${args.task_id} update requested.` },
          ],
        };
      },
    },

    {
      name: 'register_group',
      description: `Register a new chat/group so the agent can respond to messages there. Main group only.

Use available_groups.json to find the JID for a group. The folder name must be channel-prefixed: "{channel}_{group-name}" (e.g., "whatsapp_family-chat", "telegram_dev-team", "discord_general"). Use lowercase with hyphens for the group name part.`,
      inputSchema: z.object({
        jid: z
          .string()
          .describe(
            'The chat JID (e.g., "120363336345536173@g.us", "tg:-1001234567890", "dc:1234567890123456")',
          ),
        name: z.string().describe('Display name for the group'),
        folder: z
          .string()
          .describe(
            'Channel-prefixed folder name (e.g., "whatsapp_family-chat", "telegram_dev-team")',
          ),
        trigger: z.string().describe('Trigger word (e.g., "@Andy")'),
      }),
      handler: async (args) => {
        if (!isMain) {
          return {
            content: [
              {
                type: 'text',
                text: 'Only the main group can register new groups.',
              },
            ],
            isError: true,
          };
        }

        await callbacks.registerGroup(
          args.jid as string,
          args.name as string,
          args.folder as string,
          args.trigger as string,
        );

        return {
          content: [
            {
              type: 'text',
              text: `Group "${args.name}" registered. It will start receiving messages immediately.`,
            },
          ],
        };
      },
    },
  ];
}

/**
 * Convert MCP tools to the format expected by Claude Agent SDK
 * This creates a tool definition that can be used with allowedTools
 */
export function getMcpToolNames(): string[] {
  return [
    'mcp__okclaw__send_message',
    'mcp__okclaw__schedule_task',
    'mcp__okclaw__list_tasks',
    'mcp__okclaw__pause_task',
    'mcp__okclaw__resume_task',
    'mcp__okclaw__cancel_task',
    'mcp__okclaw__update_task',
    'mcp__okclaw__register_group',
  ];
}
