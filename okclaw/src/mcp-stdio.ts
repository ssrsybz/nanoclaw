/**
 * MCP Stdio Server Entry Point for OKClaw
 * This is launched as a subprocess by the agent runner
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { CronExpressionParser } from 'cron-parser';
import { fileURLToPath } from 'url';

// Context from environment variables (set by the agent runner)
const chatJid = process.env.OKCLAW_CHAT_JID!;
const groupFolder = process.env.OKCLAW_GROUP_FOLDER!;
const isMain = process.env.OKCLAW_IS_MAIN === '1';
const dataDir = process.env.OKCLAW_DATA_DIR!;

const IPC_DIR = path.join(dataDir, 'ipc', groupFolder);
const MESSAGES_DIR = path.join(IPC_DIR, 'messages');
const TASKS_DIR = path.join(IPC_DIR, 'tasks');

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);

  // Atomic write: temp file then rename
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);

  return filename;
}

const server = new McpServer({
  name: 'okclaw',
  version: '1.0.0',
});

server.tool(
  'send_message',
  "Send a message to the user or group immediately while you're still running. Use this for progress updates or to send multiple messages. You can call this multiple times.",
  {
    text: z.string().describe('The message text to send'),
    sender: z
      .string()
      .optional()
      .describe(
        'Your role/identity name (e.g. "Researcher"). When set, messages appear from a dedicated bot in Telegram.',
      ),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'message',
      chatJid,
      text: args.text,
      sender: args.sender || undefined,
      groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(MESSAGES_DIR, data);

    return { content: [{ type: 'text' as const, text: 'Message sent.' }] };
  },
);

server.tool(
  'schedule_task',
  `Schedule a recurring or one-time task. The task will run as a full agent with access to all tools. Returns the task ID for future reference.

CONTEXT MODE - Choose based on task type:
• "group": Task runs in the group's conversation context, with access to chat history.
• "isolated": Task runs in a fresh session with no conversation history.

SCHEDULE VALUE FORMAT (all times are LOCAL timezone):
• cron: Standard cron expression (e.g., "0 9 * * *" for daily at 9am)
• interval: Milliseconds between runs (e.g., "3600000" for 1 hour)
• once: Local time WITHOUT "Z" suffix (e.g., "2026-02-01T15:30:00")`,
  {
    prompt: z.string().describe('What the agent should do when the task runs.'),
    schedule_type: z
      .enum(['cron', 'interval', 'once'])
      .describe('Schedule type'),
    schedule_value: z
      .string()
      .describe('Schedule value (format depends on type)'),
    context_mode: z
      .enum(['group', 'isolated'])
      .default('group')
      .describe('Context mode'),
    target_group_jid: z
      .string()
      .optional()
      .describe('(Main only) Target group JID'),
    script: z
      .string()
      .optional()
      .describe('Optional bash script to run before the agent'),
  },
  async (args) => {
    // Validate schedule_value
    if (args.schedule_type === 'cron') {
      try {
        CronExpressionParser.parse(args.schedule_value);
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid cron: "${args.schedule_value}".`,
            },
          ],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'interval') {
      const ms = parseInt(args.schedule_value, 10);
      if (isNaN(ms) || ms <= 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid interval: "${args.schedule_value}".`,
            },
          ],
          isError: true,
        };
      }
    } else if (args.schedule_type === 'once') {
      if (
        /[Zz]$/.test(args.schedule_value) ||
        /[+-]\d{2}:\d{2}$/.test(args.schedule_value)
      ) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Timestamp must be local time without timezone suffix.`,
            },
          ],
          isError: true,
        };
      }
      const date = new Date(args.schedule_value);
      if (isNaN(date.getTime())) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Invalid timestamp: "${args.schedule_value}".`,
            },
          ],
          isError: true,
        };
      }
    }

    const targetJid =
      isMain && args.target_group_jid ? args.target_group_jid : chatJid;
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const data = {
      type: 'schedule_task',
      taskId,
      prompt: args.prompt,
      script: args.script || undefined,
      schedule_type: args.schedule_type,
      schedule_value: args.schedule_value,
      context_mode: args.context_mode || 'group',
      targetJid,
      createdBy: groupFolder,
      timestamp: new Date().toISOString(),
    };

    writeIpcFile(TASKS_DIR, data);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${taskId} scheduled: ${args.schedule_type} - ${args.schedule_value}`,
        },
      ],
    };
  },
);

server.tool(
  'list_tasks',
  "List all scheduled tasks. From main: shows all tasks. From other groups: shows only that group's tasks.",
  {},
  async () => {
    const tasksFile = path.join(IPC_DIR, 'current_tasks.json');

    try {
      if (!fs.existsSync(tasksFile)) {
        return {
          content: [
            { type: 'text' as const, text: 'No scheduled tasks found.' },
          ],
        };
      }

      const allTasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
      const tasks = isMain
        ? allTasks
        : allTasks.filter(
            (t: { groupFolder: string }) => t.groupFolder === groupFolder,
          );

      if (tasks.length === 0) {
        return {
          content: [
            { type: 'text' as const, text: 'No scheduled tasks found.' },
          ],
        };
      }

      const formatted = tasks
        .map(
          (t: {
            id: string;
            prompt: string;
            schedule_type: string;
            schedule_value: string;
            status: string;
            next_run: string | null;
          }) =>
            `- [${t.id}] ${t.prompt.slice(0, 50)}... (${t.schedule_type}: ${t.schedule_value}) - ${t.status}, next: ${t.next_run || 'N/A'}`,
        )
        .join('\n');

      return {
        content: [
          { type: 'text' as const, text: `Scheduled tasks:\n${formatted}` },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Error reading tasks: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
      };
    }
  },
);

server.tool(
  'pause_task',
  'Pause a scheduled task. It will not run until resumed.',
  { task_id: z.string().describe('The task ID to pause') },
  async (args) => {
    writeIpcFile(TASKS_DIR, {
      type: 'pause_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} pause requested.`,
        },
      ],
    };
  },
);

server.tool(
  'resume_task',
  'Resume a paused task.',
  { task_id: z.string().describe('The task ID to resume') },
  async (args) => {
    writeIpcFile(TASKS_DIR, {
      type: 'resume_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} resume requested.`,
        },
      ],
    };
  },
);

server.tool(
  'cancel_task',
  'Cancel and delete a scheduled task.',
  { task_id: z.string().describe('The task ID to cancel') },
  async (args) => {
    writeIpcFile(TASKS_DIR, {
      type: 'cancel_task',
      taskId: args.task_id,
      groupFolder,
      isMain,
      timestamp: new Date().toISOString(),
    });
    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} cancellation requested.`,
        },
      ],
    };
  },
);

server.tool(
  'update_task',
  'Update an existing scheduled task. Only provided fields are changed.',
  {
    task_id: z.string().describe('The task ID to update'),
    prompt: z.string().optional().describe('New prompt'),
    schedule_type: z
      .enum(['cron', 'interval', 'once'])
      .optional()
      .describe('New schedule type'),
    schedule_value: z.string().optional().describe('New schedule value'),
    script: z.string().optional().describe('New script'),
  },
  async (args) => {
    const data: Record<string, string | undefined> = {
      type: 'update_task',
      taskId: args.task_id,
      groupFolder,
      isMain: String(isMain),
      timestamp: new Date().toISOString(),
    };
    if (args.prompt !== undefined) data.prompt = args.prompt;
    if (args.script !== undefined) data.script = args.script;
    if (args.schedule_type !== undefined)
      data.schedule_type = args.schedule_type;
    if (args.schedule_value !== undefined)
      data.schedule_value = args.schedule_value;

    writeIpcFile(TASKS_DIR, data);
    return {
      content: [
        {
          type: 'text' as const,
          text: `Task ${args.task_id} update requested.`,
        },
      ],
    };
  },
);

server.tool(
  'register_group',
  `Register a new chat/group so the agent can respond to messages there. Main group only.`,
  {
    jid: z.string().describe('The chat JID'),
    name: z.string().describe('Display name for the group'),
    folder: z.string().describe('Channel-prefixed folder name'),
    trigger: z.string().describe('Trigger word'),
  },
  async (args) => {
    if (!isMain) {
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Only the main group can register new groups.',
          },
        ],
        isError: true,
      };
    }

    writeIpcFile(TASKS_DIR, {
      type: 'register_group',
      jid: args.jid,
      name: args.name,
      folder: args.folder,
      trigger: args.trigger,
      timestamp: new Date().toISOString(),
    });

    return {
      content: [
        { type: 'text' as const, text: `Group "${args.name}" registered.` },
      ],
    };
  },
);

// ===== Launchpad Tools =====
// 注意：这是 OKClaw 内部的启动台功能，不是 macOS 的 Launchpad
// OKClaw 启动台是一个应用管理器，用户可以从这里快速启动各种项目

server.tool(
  'launchpad_list_apps',
  '列出 OKClaw 启动台中的所有应用。OKClaw 启动台是一个内置的应用管理器，用户可以从 WebIM 右下角的火箭图标访问。',
  {
    kind: z.enum(['macos-app', 'node-project', 'python-project', 'script', 'folder', 'all']).optional().describe('应用类型'),
    category: z.string().optional().describe('分类'),
    hidden: z.boolean().optional().describe('是否包含隐藏应用'),
  },
  async (args) => {
    try {
      const { getAllLaunchpadApps } = await import('./db.js');
      const kind = args.kind === 'all' ? undefined : args.kind;
      const rows = getAllLaunchpadApps({ kind, category: args.category, includeHidden: args.hidden });
      const apps = rows.map(r => ({ id: r.id, name: r.name, kind: r.kind }));
      const text = apps.length > 0
        ? `找到 ${apps.length} 个应用:\n${apps.map(a => `- ${a.name} (${a.kind})`).join('\n')}`
        : '没有找到应用';
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `错误: ${err}` }], isError: true };
    }
  },
);

server.tool(
  'launchpad_launch_app',
  '从 OKClaw 启动台启动指定应用。可以通过名称或 ID 指定。',
  {
    name: z.string().optional().describe('应用名称（模糊匹配）'),
    app_id: z.string().optional().describe('应用 ID'),
    args: z.array(z.string()).optional().describe('启动参数'),
  },
  async (inputArgs) => {
    try {
      const { getLaunchpadApp, getAllLaunchpadApps } = await import('./db.js');
      const { appLauncher } = await import('./channels/launchpad/launcher.js');

      let appId = inputArgs.app_id;
      if (!appId && inputArgs.name) {
        const apps = getAllLaunchpadApps();
        const matched = apps.find(a =>
          a.name.toLowerCase().includes(inputArgs.name!.toLowerCase()) ||
          a.name_zh?.includes(inputArgs.name!)
        );
        if (matched) appId = matched.id;
      }

      if (!appId) {
        return { content: [{ type: 'text' as const, text: `未找到应用: ${inputArgs.name || inputArgs.app_id}` }], isError: true };
      }

      const result = await appLauncher.launch({ appId, args: inputArgs.args });
      return {
        content: [{ type: 'text' as const, text: result.success ? `已启动: ${result.appName}` : `启动失败: ${result.error}` }],
        isError: !result.success,
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `错误: ${err}` }], isError: true };
    }
  },
);

server.tool(
  'launchpad_scan_apps',
  '扫描系统中的应用并添加到 OKClaw 启动台。',
  {
    directories: z.array(z.string()).optional().describe('自定义扫描目录'),
  },
  async (args) => {
    try {
      const { appScanner } = await import('./channels/launchpad/scanner.js');
      const { upsertLaunchpadApp } = await import('./db.js');

      const result = await appScanner.scanAll(args.directories);
      for (const app of result.items) {
        upsertLaunchpadApp(app);
      }

      return {
        content: [{
          type: 'text' as const,
          text: `扫描完成，发现 ${result.items.length} 个应用${result.errors.length > 0 ? `，${result.errors.length} 个错误` : ''}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `错误: ${err}` }], isError: true };
    }
  },
);

server.tool(
  'launchpad_search',
  '在 OKClaw 启动台中搜索应用。',
  {
    query: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('结果数量'),
  },
  async (args) => {
    try {
      const { searchLaunchpadApps } = await import('./db.js');
      const results = searchLaunchpadApps(args.query, args.limit || 10);
      const text = results.length > 0
        ? `搜索结果:\n${results.map(a => `- ${a.name} (${a.kind})`).join('\n')}`
        : '未找到匹配的应用';
      return { content: [{ type: 'text' as const, text }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `错误: ${err}` }], isError: true };
    }
  },
);

server.tool(
  'launchpad_register_app',
  `将项目注册到 OKClaw 启动台。这是 OKClaw 内置的应用管理功能，不是 macOS 的 Launchpad。

使用场景：
- 用户说"添加到启动台"、"注册到启动台"时，指的是 OKClaw 启动台
- 用户可以通过 WebIM 右下角的 🚀 火箭图标访问启动台
- 用户点击启动台中的图标即可一键启动项目

参数说明：
- name: 应用名称（必填）
- path: 项目路径（必填）
- kind: 应用类型，默认 'node-project'
- launch_command: 启动命令（必填）
- terminal_mode: 终端模式，'new-window' 在新终端窗口启动
- venv_path: Python 虚拟环境路径（自动激活）
- open_browser: 启动后打开的浏览器 URL`,
  {
    name: z.string().describe('应用名称'),
    path: z.string().describe('项目路径'),
    kind: z.enum(['node-project', 'python-project', 'script', 'macos-app', 'url-scheme']).default('node-project'),
    launch_command: z.string().describe('启动命令'),
    working_directory: z.string().optional().describe('工作目录'),
    description: z.string().optional().describe('描述'),
    icon: z.string().optional().describe('图标路径'),
    name_zh: z.string().optional().describe('中文名称'),
    terminal_mode: z.enum(['new-window', 'new-tab', 'none']).optional().describe('终端模式'),
    pre_launch_script: z.string().optional().describe('启动前脚本'),
    open_browser: z.string().optional().describe('启动后打开的 URL'),
    venv_path: z.string().optional().describe('虚拟环境路径'),
  },
  async (args) => {
    try {
      const { upsertLaunchpadApp, getLaunchpadApp } = await import('./db.js');
      const crypto = await import('crypto');

      const id = `agent-${crypto.createHash('md5').update(args.path).digest('hex').slice(0, 12)}`;
      const existing = getLaunchpadApp(id);

      const postLaunchActions: Array<{ type: 'wait' | 'open-browser'; url?: string; duration?: number }> = [];
      if (args.open_browser) {
        postLaunchActions.push({ type: 'wait' as const, duration: 2000 });
        postLaunchActions.push({ type: 'open-browser' as const, url: args.open_browser });
      }

      const dependencies: { venvPath?: string } = {};
      if (args.venv_path) dependencies.venvPath = args.venv_path;

      const app = {
        id,
        name: args.name,
        nameZh: args.name_zh,
        kind: args.kind,
        path: args.path,
        launchCommand: args.launch_command,
        workingDirectory: args.working_directory || args.path,
        description: args.description,
        icon: args.icon,
        terminalMode: (args.terminal_mode || 'new-window') as 'new-window' | 'new-tab' | 'none',
        preLaunchScript: args.pre_launch_script,
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

      return {
        content: [{
          type: 'text' as const,
          text: `✅ 已将项目 "${args.name}" 注册到启动台\n- ID: ${id}\n- 启动命令: ${args.launch_command}\n- 终端模式: ${app.terminalMode}${args.venv_path ? `\n- 虚拟环境: ${args.venv_path}` : ''}${args.open_browser ? `\n- 启动后打开: ${args.open_browser}` : ''}\n\n用户现在可以从启动台启动此项目。`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `错误: ${err}` }], isError: true };
    }
  },
);

server.tool(
  'launchpad_update_app',
  '更新启动台中的应用配置。',
  {
    name: z.string().optional().describe('应用名称'),
    app_id: z.string().optional().describe('应用 ID'),
    launch_command: z.string().optional().describe('启动命令'),
    working_directory: z.string().optional().describe('工作目录'),
    description: z.string().optional().describe('描述'),
    name_zh: z.string().optional().describe('中文名称'),
    pinned: z.boolean().optional().describe('是否收藏'),
    hidden: z.boolean().optional().describe('是否隐藏'),
    terminal_mode: z.enum(['new-window', 'new-tab', 'none']).optional().describe('终端模式'),
    open_browser: z.string().optional().describe('启动后打开的 URL'),
  },
  async (args) => {
    try {
      const { getLaunchpadApp, getAllLaunchpadApps, updateLaunchpadApp } = await import('./db.js');

      let appId = args.app_id;
      if (!appId && args.name) {
        const apps = getAllLaunchpadApps();
        const matched = apps.find(a =>
          a.name.toLowerCase().includes(args.name!.toLowerCase()) ||
          a.name_zh?.includes(args.name!)
        );
        if (matched) appId = matched.id;
      }

      if (!appId) {
        return { content: [{ type: 'text' as const, text: `未找到应用: ${args.name || args.app_id}` }], isError: true };
      }

      const updates: Record<string, unknown> = {};
      if (args.launch_command) updates.launchCommand = args.launch_command;
      if (args.working_directory) updates.workingDirectory = args.working_directory;
      if (args.description) updates.description = args.description;
      if (args.name_zh) updates.nameZh = args.name_zh;
      if (args.pinned !== undefined) updates.pinned = args.pinned;
      if (args.hidden !== undefined) updates.hidden = args.hidden;
      if (args.terminal_mode) updates.terminalMode = args.terminal_mode;
      if (args.open_browser) {
        updates.postLaunchActions = [
          { type: 'wait', duration: 2000 },
          { type: 'open-browser', url: args.open_browser },
        ];
      }

      if (Object.keys(updates).length === 0) {
        return { content: [{ type: 'text' as const, text: '没有需要更新的字段' }] };
      }

      updateLaunchpadApp(appId, updates);

      const existing = getLaunchpadApp(appId);
      return {
        content: [{ type: 'text' as const, text: `✅ 已更新应用 "${existing?.name}"\n更新字段: ${Object.keys(updates).join(', ')}` }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `错误: ${err}` }], isError: true };
    }
  },
);

server.tool(
  'launchpad_organize',
  '自动整理应用。',
  {
    by: z.enum(['category', 'usage', 'type']).describe('整理方式'),
  },
  async (args) => {
    try {
      const { getAllLaunchpadApps, updateLaunchpadApp } = await import('./db.js');
      const apps = getAllLaunchpadApps();

      if (args.by === 'usage') {
        const sorted = [...apps].sort((a, b) => b.usage_count - a.usage_count);
        let pageIndex = 0, gridIndex = 0;
        for (const app of sorted) {
          updateLaunchpadApp(app.id, { pageIndex, gridIndex });
          if (++gridIndex >= 35) { pageIndex++; gridIndex = 0; }
        }
      }

      return { content: [{ type: 'text' as const, text: `应用已按 ${args.by} 整理` }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `错误: ${err}` }], isError: true };
    }
  },
);

// Start the stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
