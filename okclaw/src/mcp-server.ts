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
  inputSchema: z.ZodType<unknown>;
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

    // ===== Launchpad MCP Tools =====

    {
      name: 'launchpad_list_apps',
      description: '列出启动台中的所有应用。支持按类型、分类筛选。可用于快速查看用户有哪些应用可以启动。',
      inputSchema: z.object({
        kind: z
          .enum(['macos-app', 'node-project', 'python-project', 'script', 'folder', 'all'])
          .optional()
          .describe('应用类型筛选'),
        category: z.string().optional().describe('分类筛选'),
        hidden: z.boolean().optional().describe('是否包含隐藏应用'),
      }),
      handler: async (args) => {
        const { getAllLaunchpadApps } = await import('./db.js');
        const kind = args.kind === 'all' ? undefined : (args.kind as string | undefined);
        const category = args.category as string | undefined;
        const includeHidden = args.hidden as boolean | undefined;
        const rows = getAllLaunchpadApps({
          kind,
          category,
          includeHidden,
        });
        const apps = rows.map((row) => ({
          id: row.id,
          name: row.name,
          kind: row.kind,
          hidden: !!row.hidden,
        }));
        return {
          content: [
            {
              type: 'text',
              text:
                apps.length > 0
                  ? `找到 ${apps.length} 个应用:\n${apps
                      .map((a) => `- ${a.name} (${a.kind})${a.hidden ? ' [隐藏]' : ''}`)
                      .join('\n')}`
                  : '没有找到应用',
            },
          ],
        };
      },
    },

    {
      name: 'launchpad_launch_app',
      description: '启动指定应用。可以通过应用名称、ID 或路径指定。应用将在后台启动。',
      inputSchema: z.object({
        name: z.string().optional().describe('应用名称（支持模糊匹配）'),
        app_id: z.string().optional().describe('应用 ID'),
        path: z.string().optional().describe('应用路径'),
        args: z.array(z.string()).optional().describe('启动参数'),
      }),
      handler: async (args) => {
        const { getAllLaunchpadApps } = await import('./db.js');
        const { appLauncher } = await import('./channels/launchpad/launcher.js');

        let appId = args.app_id as string | undefined;

        // 如果提供了名称，尝试模糊匹配
        if (!appId && args.name) {
          const apps = getAllLaunchpadApps();
          const matched = apps.find(
            (a) =>
              a.name.toLowerCase().includes((args.name as string).toLowerCase()) ||
              a.name_zh?.includes(args.name as string),
          );
          if (matched) {
            appId = matched.id;
          }
        }

        // 如果提供了路径
        if (!appId && args.path) {
          const app = getAllLaunchpadApps().find((a) => a.path === args.path);
          if (app) {
            appId = app.id;
          }
        }

        if (!appId) {
          return {
            content: [
              { type: 'text', text: `未找到应用: ${args.name || args.app_id || args.path}` },
            ],
            isError: true,
          };
        }

        const result = await appLauncher.launch({
          appId,
          args: args.args as string[] | undefined,
        });

        if (result.success) {
          return {
            content: [{ type: 'text', text: `已启动应用: ${result.appName}` }],
          };
        } else {
          return {
            content: [{ type: 'text', text: `启动失败: ${result.error}` }],
            isError: true,
          };
        }
      },
    },

    {
      name: 'launchpad_scan_apps',
      description: '扫描系统中的应用并更新启动台。扫描目录包括 /Applications、~/Applications 等。',
      inputSchema: z.object({
        directories: z.array(z.string()).optional().describe('自定义扫描目录'),
      }),
      handler: async (args) => {
        const { appScanner } = await import('./channels/launchpad/scanner.js');
        const { upsertLaunchpadApp } = await import('./db.js');

        const result = await appScanner.scanAll(args.directories as string[] | undefined);

        // 更新数据库
        for (const app of result.items) {
          upsertLaunchpadApp(app);
        }

        return {
          content: [
            {
              type: 'text',
              text: `扫描完成，发现 ${result.items.length} 个应用${result.errors.length > 0 ? `，${result.errors.length} 个错误` : ''}`,
            },
          ],
        };
      },
    },

    {
      name: 'launchpad_organize',
      description: '自动整理应用到文件夹。可以按分类、使用频率等整理。',
      inputSchema: z.object({
        by: z
          .enum(['category', 'usage', 'type'])
          .describe('整理方式：category=按分类, usage=按使用频率, type=按类型'),
        create_folders: z.boolean().optional().describe('是否创建文件夹'),
      }),
      handler: async (args) => {
        const { getAllLaunchpadApps, updateLaunchpadApp } = await import('./db.js');

        const apps = getAllLaunchpadApps();
        const by = args.by as string;

        if (by === 'usage') {
          // 按使用频率排序
          const sorted = [...apps].sort((a, b) => b.usage_count - a.usage_count);
          let pageIndex = 0;
          let gridIndex = 0;
          const itemsPerPage = 35; // 7x5

          for (const app of sorted) {
            updateLaunchpadApp(app.id, { pageIndex, gridIndex });
            gridIndex++;
            if (gridIndex >= itemsPerPage) {
              pageIndex++;
              gridIndex = 0;
            }
          }
        } else if (by === 'type') {
          // 按类型分组
          const byType: Record<string, typeof apps> = {};
          for (const app of apps) {
            if (!byType[app.kind]) byType[app.kind] = [];
            byType[app.kind].push(app);
          }

          let pageIndex = 0;
          for (const [_type, typeApps] of Object.entries(byType)) {
            let gridIndex = 0;
            for (const app of typeApps) {
              updateLaunchpadApp(app.id, { pageIndex, gridIndex });
              gridIndex++;
            }
            pageIndex++;
          }
        }

        return {
          content: [{ type: 'text', text: `应用已按 ${by} 整理` }],
        };
      },
    },

    {
      name: 'launchpad_search',
      description: '搜索应用。支持拼音搜索和模糊匹配。',
      inputSchema: z.object({
        query: z.string().describe('搜索关键词'),
        limit: z.number().optional().describe('结果数量限制'),
      }),
      handler: async (args) => {
        const { searchLaunchpadApps } = await import('./db.js');

        const results = searchLaunchpadApps(args.query as string, (args.limit as number) || 10);

        return {
          content: [
            {
              type: 'text',
              text:
                results.length > 0
                  ? `搜索结果:\n${results.map((a) => `- ${a.name} (${a.kind})`).join('\n')}`
                  : '未找到匹配的应用',
            },
          ],
        };
      },
    },

    {
      name: 'launchpad_register_app',
      description: `将项目注册到启动台。当完成一个项目开发后，使用此工具将项目添加到启动台，方便用户后续快速启动。

使用场景：
- Agent 完成了一个代码项目的开发，想让用户能快速启动它
- 创建了一个新的脚本工具，想让用户能从启动台调用
- 部署了一个服务，想让用户能一键启动

参数说明：
- name: 应用名称（必填）
- path: 项目路径（必填）
- kind: 应用类型，默认 'node-project'
- launch_command: 启动命令，如 'npm start'、'python3 main.py'（必填）
- working_directory: 工作目录，默认为项目路径
- description: 应用描述
- icon: 图标路径（可选）
- terminal_mode: 终端模式，'new-window'（新终端窗口）、'none'（后台运行）
- pre_launch_script: 启动前执行的脚本（如激活虚拟环境）
- open_browser: 启动后打开的浏览器 URL（如 http://localhost:3000）
- venv_path: Python 虚拟环境路径`,
      inputSchema: z.object({
        name: z.string().describe('应用名称'),
        path: z.string().describe('项目路径'),
        kind: z
          .enum(['node-project', 'python-project', 'script', 'macos-app', 'url-scheme'])
          .default('node-project')
          .describe('应用类型'),
        launch_command: z.string().describe('启动命令，如 npm start, python3 main.py'),
        working_directory: z.string().optional().describe('工作目录，默认为项目路径'),
        description: z.string().optional().describe('应用描述'),
        icon: z.string().optional().describe('图标路径'),
        name_zh: z.string().optional().describe('中文名称'),
        // 智能启动配置
        terminal_mode: z
          .enum(['new-window', 'new-tab', 'none'])
          .optional()
          .describe('终端模式：new-window=新终端窗口，none=后台运行'),
        pre_launch_script: z.string().optional().describe('启动前脚本（如激活虚拟环境）'),
        open_browser: z.string().optional().describe('启动后打开的 URL'),
        venv_path: z.string().optional().describe('Python 虚拟环境路径'),
      }),
      handler: async (args) => {
        const { upsertLaunchpadApp, getLaunchpadApp } = await import('./db.js');
        const crypto = await import('crypto');

        const name = args.name as string;
        const projectPath = args.path as string;
        const launchCommand = args.launch_command as string;

        // 生成唯一 ID
        const id = `agent-${crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 12)}`;

        // 检查是否已存在
        const existing = getLaunchpadApp(id);

        // 构建启动后动作
        const postLaunchActions: Array<{ type: 'wait' | 'open-browser'; url?: string; duration?: number }> = [];
        if (args.open_browser) {
          postLaunchActions.push({ type: 'wait' as const, duration: 2000 });
          postLaunchActions.push({ type: 'open-browser' as const, url: args.open_browser as string });
        }

        // 构建依赖配置
        const dependencies: { venvPath?: string; envFile?: string } = {};
        if (args.venv_path) {
          dependencies.venvPath = args.venv_path as string;
        }

        const app = {
          id,
          name,
          nameZh: args.name_zh as string | undefined,
          kind: args.kind as 'node-project' | 'python-project' | 'script' | 'macos-app' | 'url-scheme',
          path: projectPath,
          launchCommand,
          workingDirectory: (args.working_directory as string) || projectPath,
          description: args.description as string | undefined,
          icon: args.icon as string | undefined,
          // 智能启动配置
          terminalMode: (args.terminal_mode as 'new-window' | 'new-tab' | 'none') || 'new-window',
          preLaunchScript: args.pre_launch_script as string | undefined,
          postLaunchActions: postLaunchActions.length > 0 ? postLaunchActions : undefined,
          dependencies: Object.keys(dependencies).length > 0 ? dependencies : undefined,
          usageCount: existing?.usage_count || 0,
          status: 'installed' as const,
          hidden: false,
          pinned: false,
          pageIndex: 0,
          gridIndex: 0,
        };

        upsertLaunchpadApp(app);

        const configSummary = [
          `- ID: ${id}`,
          `- 启动命令: ${launchCommand}`,
          `- 工作目录: ${app.workingDirectory}`,
          args.terminal_mode ? `- 终端模式: ${args.terminal_mode}` : null,
          args.venv_path ? `- 虚拟环境: ${args.venv_path}` : null,
          args.open_browser ? `- 启动后打开: ${args.open_browser}` : null,
        ].filter(Boolean).join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `✅ 已将项目 "${name}" 注册到启动台\n${configSummary}\n\n用户现在可以从启动台启动此项目。`,
            },
          ],
        };
      },
    },

    {
      name: 'launchpad_update_app',
      description: `更新启动台中的应用配置。用于修改启动命令、工作目录等设置。

可以通过应用名称或 ID 指定要更新的应用。`,
      inputSchema: z.object({
        name: z.string().optional().describe('应用名称（模糊匹配）'),
        app_id: z.string().optional().describe('应用 ID'),
        launch_command: z.string().optional().describe('新的启动命令'),
        working_directory: z.string().optional().describe('新的工作目录'),
        description: z.string().optional().describe('新的描述'),
        name_zh: z.string().optional().describe('中文名称'),
        pinned: z.boolean().optional().describe('是否收藏'),
        hidden: z.boolean().optional().describe('是否隐藏'),
        terminal_mode: z.enum(['new-window', 'new-tab', 'none']).optional().describe('终端模式'),
        pre_launch_script: z.string().optional().describe('启动前脚本'),
        open_browser: z.string().optional().describe('启动后打开的 URL'),
      }),
      handler: async (args) => {
        const { getLaunchpadApp, getAllLaunchpadApps, updateLaunchpadApp } = await import('./db.js');

        let appId = args.app_id as string | undefined;

        // 如果提供了名称，尝试模糊匹配
        if (!appId && args.name) {
          const apps = getAllLaunchpadApps();
          const matched = apps.find(
            (a) =>
              a.name.toLowerCase().includes((args.name as string).toLowerCase()) ||
              a.name_zh?.includes(args.name as string),
          );
          if (matched) {
            appId = matched.id;
          }
        }

        if (!appId) {
          return {
            content: [
              { type: 'text', text: `未找到应用: ${args.name || args.app_id}` },
            ],
            isError: true,
          };
        }

        const existing = getLaunchpadApp(appId);
        if (!existing) {
          return {
            content: [{ type: 'text', text: `应用不存在: ${appId}` }],
            isError: true,
          };
        }

        // 构建更新对象
        const updates: Record<string, unknown> = {};
        if (args.launch_command !== undefined) updates.launchCommand = args.launch_command;
        if (args.working_directory !== undefined) updates.workingDirectory = args.working_directory;
        if (args.description !== undefined) updates.description = args.description;
        if (args.name_zh !== undefined) updates.nameZh = args.name_zh;
        if (args.pinned !== undefined) updates.pinned = args.pinned;
        if (args.hidden !== undefined) updates.hidden = args.hidden;

        if (Object.keys(updates).length === 0) {
          return {
            content: [{ type: 'text', text: '没有需要更新的字段' }],
          };
        }

        updateLaunchpadApp(appId, updates);

        return {
          content: [
            {
              type: 'text',
              text: `✅ 已更新应用 "${existing.name}"\n更新字段: ${Object.keys(updates).join(', ')}`,
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
    // Launchpad tools
    'mcp__okclaw__launchpad_list_apps',
    'mcp__okclaw__launchpad_launch_app',
    'mcp__okclaw__launchpad_scan_apps',
    'mcp__okclaw__launchpad_organize',
    'mcp__okclaw__launchpad_search',
    'mcp__okclaw__launchpad_register_app',
    'mcp__okclaw__launchpad_update_app',
  ];
}
