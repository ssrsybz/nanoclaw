/**
 * OKClaw Launchpad MCP Server
 * 独立的启动台 MCP 服务，供 Claude Code 使用
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 动态导入数据库模块
const dbPath = path.join(__dirname, 'dist', 'db.js');
const launcherPath = path.join(__dirname, 'dist', 'channels', 'launchpad', 'launcher.js');
const scannerPath = path.join(__dirname, 'dist', 'channels', 'launchpad', 'scanner.js');

const server = new McpServer({
  name: 'okclaw-launchpad',
  version: '1.0.0',
});

// ===== launchpad_list_apps =====
server.tool(
  'launchpad_list_apps',
  '列出 OKClaw 启动台中的所有应用。可通过 WebIM 右下角火箭图标访问。',
  {
    kind: z.enum(['macos-app', 'node-project', 'python-project', 'script', 'folder', 'all']).optional().describe('应用类型'),
    category: z.string().optional().describe('分类'),
    hidden: z.boolean().optional().describe('是否包含隐藏应用'),
  },
  async (args) => {
    try {
      const { getAllLaunchpadApps } = await import(dbPath);
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

// ===== launchpad_launch_app =====
server.tool(
  'launchpad_launch_app',
  '从 OKClaw 启动台启动指定应用。',
  {
    name: z.string().optional().describe('应用名称（模糊匹配）'),
    app_id: z.string().optional().describe('应用 ID'),
    args: z.array(z.string()).optional().describe('启动参数'),
  },
  async (inputArgs) => {
    try {
      const { getLaunchpadApp, getAllLaunchpadApps } = await import(dbPath);
      const { appLauncher } = await import(launcherPath);

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

// ===== launchpad_scan_apps =====
server.tool(
  'launchpad_scan_apps',
  '扫描系统中的应用并添加到启动台。',
  {
    directories: z.array(z.string()).optional().describe('自定义扫描目录'),
  },
  async (args) => {
    try {
      const { appScanner } = await import(scannerPath);
      const { upsertLaunchpadApp } = await import(dbPath);

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

// ===== launchpad_search =====
server.tool(
  'launchpad_search',
  '在启动台中搜索应用。',
  {
    query: z.string().describe('搜索关键词'),
    limit: z.number().optional().describe('结果数量'),
  },
  async (args) => {
    try {
      const { searchLaunchpadApps } = await import(dbPath);
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

// ===== launchpad_register_app =====
server.tool(
  'launchpad_register_app',
  `将项目注册到 OKClaw 启动台。用户可通过 WebIM 右下角火箭图标访问。

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
      const { upsertLaunchpadApp, getLaunchpadApp } = await import(dbPath);
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
          text: `✅ 已将项目 "${args.name}" 注册到启动台\n- ID: ${id}\n- 启动命令: ${args.launch_command}\n- 终端模式: ${app.terminalMode}${args.venv_path ? `\n- 虚拟环境: ${args.venv_path}` : ''}${args.open_browser ? `\n- 启动后打开: ${args.open_browser}` : ''}`,
        }],
      };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `错误: ${err}` }], isError: true };
    }
  },
);

// ===== launchpad_update_app =====
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
      const { getLaunchpadApp, getAllLaunchpadApps, updateLaunchpadApp } = await import(dbPath);

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

// 启动服务
const transport = new StdioServerTransport();
await server.connect(transport);
