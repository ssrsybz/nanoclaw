/**
 * 应用启动服务
 * 支持智能启动：终端模式、预启动脚本、启动后动作
 */

import { spawn } from 'child_process';
import path from 'path';
import { LaunchpadItem, LaunchResult, TerminalMode, PostLaunchAction } from './types.js';
import { getLaunchpadApp, incrementLaunchpadAppUsage, type LaunchpadAppRow } from '../../db.js';
import { logger } from '../../logger.js';

/**
 * 应用启动器
 */
export class AppLauncher {
  /**
   * 启动应用
   */
  async launch(appIdOrOptions: {
    appId?: string;
    name?: string;
    path?: string;
    args?: string[];
  }): Promise<LaunchResult> {
    let app: LaunchpadItem | null = null;

    // 根据 ID 查找应用
    if (appIdOrOptions.appId) {
      const row = getLaunchpadApp(appIdOrOptions.appId);
      if (row) {
        app = this.rowToItem(row);
      }
    }

    // 如果找不到应用，返回错误
    if (!app) {
      return {
        success: false,
        error: `Application not found: ${appIdOrOptions.appId || appIdOrOptions.name || appIdOrOptions.path}`,
      };
    }

    return this.launchApp(app, appIdOrOptions.args);
  }

  /**
   * 启动应用（根据应用对象）
   */
  async launchApp(app: LaunchpadItem, extraArgs?: string[]): Promise<LaunchResult> {
    try {
      const platform = process.platform;

      // macOS .app 特殊处理
      if (app.kind === 'macos-app' && platform === 'darwin') {
        return this.launchMacOSApp(app, extraArgs);
      }

      // 构建完整启动脚本
      const script = this.buildLaunchScript(app, extraArgs);

      // 根据终端模式执行
      const terminalMode = app.terminalMode || 'new-window';
      let result: { success: boolean; error?: string; pid?: number };

      if (terminalMode === 'none') {
        // 后台运行
        result = await this.executeInBackground(script, app.workingDirectory || app.path);
      } else {
        // 在新终端窗口运行
        result = this.executeInTerminal(script, app.name, terminalMode);
      }

      if (result.success) {
        // 更新使用统计
        incrementLaunchpadAppUsage(app.id);
        logger.info({ appId: app.id, appName: app.name, terminalMode }, 'Application launched');

        // 执行启动后动作
        if (app.postLaunchActions && app.postLaunchActions.length > 0) {
          this.executePostLaunchActions(app.postLaunchActions);
        }
      }

      return {
        success: result.success,
        appName: app.name,
        error: result.error,
        pid: result.pid,
      };
    } catch (err) {
      logger.error({ app, err }, 'Failed to launch application');
      return {
        success: false,
        error: String(err),
      };
    }
  }

  /**
   * 构建完整的启动脚本
   */
  private buildLaunchScript(app: LaunchpadItem, extraArgs?: string[]): string {
    const lines: string[] = [];
    const cwd = app.workingDirectory || app.path;

    // 进入工作目录
    lines.push(`cd "${cwd}"`);

    // 激活虚拟环境
    if (app.dependencies?.venvPath) {
      lines.push(`source "${app.dependencies.venvPath}/bin/activate"`);
    }

    // 加载 .env 文件
    if (app.dependencies?.envFile) {
      lines.push(`export $(cat "${app.dependencies.envFile}" | grep -v '^#' | xargs)`);
    }

    // 执行预启动脚本
    if (app.preLaunchScript) {
      lines.push(app.preLaunchScript);
    }

    // 执行启动命令
    let launchCommand = app.launchCommand || this.getDefaultLaunchCommand(app);
    if (extraArgs && extraArgs.length > 0) {
      launchCommand = `${launchCommand} ${extraArgs.join(' ')}`;
    }
    lines.push(launchCommand);

    return lines.join('\n');
  }

  /**
   * 获取默认启动命令
   */
  private getDefaultLaunchCommand(app: LaunchpadItem): string {
    switch (app.kind) {
      case 'node-project':
        return 'npm start';
      case 'python-project':
        return 'python3 main.py';
      case 'script':
        return `"${app.path}"`;
      default:
        return `"${app.path}"`;
    }
  }

  /**
   * 启动 macOS .app
   */
  private launchMacOSApp(app: LaunchpadItem, extraArgs?: string[]): LaunchResult {
    try {
      const args = ['-a', app.path];
      if (extraArgs) args.push(...extraArgs);

      const child = spawn('open', args, { detached: true, stdio: 'ignore' });
      child.unref();

      incrementLaunchpadAppUsage(app.id);
      logger.info({ appId: app.id, appName: app.name }, 'macOS app launched');

      return { success: true, appName: app.name, pid: child.pid };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * 在新终端窗口执行
   */
  private executeInTerminal(
    script: string,
    name: string,
    mode: TerminalMode
  ): { success: boolean; error?: string; pid?: number } {
    const platform = process.platform;

    try {
      if (platform === 'darwin') {
        // macOS: 使用 osascript 打开新终端窗口
        const escapedScript = script.replace(/"/g, '\\"').replace(/'/g, "'\\''");
        const appleScript = `
          tell application "Terminal"
            activate
            do script "${escapedScript}"
          end tell
        `;
        const child = spawn('osascript', ['-e', appleScript], { detached: true });
        child.unref();
        logger.info({ name, mode }, 'Launched in new Terminal window');
        return { success: true };
      } else if (platform === 'linux') {
        // Linux: 尝试使用 gnome-terminal 或 xterm
        const terminal = process.env.TERM_PROGRAM || 'gnome-terminal';
        const child = spawn(terminal, ['-e', 'bash', '-c', script], { detached: true });
        child.unref();
        return { success: true };
      } else {
        // Windows
        const child = spawn('cmd', ['/c', 'start', 'cmd', '/k', script], { detached: true });
        child.unref();
        return { success: true };
      }
    } catch (err) {
      logger.error({ err, name }, 'Failed to launch in terminal');
      return { success: false, error: String(err) };
    }
  }

  /**
   * 后台执行
   */
  private executeInBackground(
    script: string,
    cwd: string
  ): Promise<{ success: boolean; error?: string; pid?: number }> {
    return new Promise((resolve) => {
      try {
        const child = spawn('bash', ['-c', script], {
          cwd,
          detached: true,
          stdio: 'ignore',
        });
        child.unref();

        if (child.pid) {
          resolve({ success: true, pid: child.pid });
        } else {
          setTimeout(() => resolve({ success: true, pid: child.pid }), 100);
        }
      } catch (err) {
        resolve({ success: false, error: String(err) });
      }
    });
  }

  /**
   * 执行启动后动作
   */
  private executePostLaunchActions(actions: PostLaunchAction[]): void {
    for (const action of actions) {
      switch (action.type) {
        case 'open-browser':
          if (action.url) {
            // 延迟打开浏览器（等待服务启动）
            const delay = 2000;
            setTimeout(() => {
              const platform = process.platform;
              const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
              spawn(cmd, [action.url!], { detached: true });
              logger.info({ url: action.url }, 'Opened browser');
            }, delay);
          }
          break;

        case 'wait':
          // 等待动作已在上面的 setTimeout 中处理
          break;

        case 'notify':
          if (action.message) {
            logger.info({ message: action.message }, 'Post-launch notification');
          }
          break;

        case 'run-script':
          if (action.script) {
            spawn('bash', ['-c', action.script], { detached: true });
          }
          break;
      }
    }
  }

  /**
   * 数据库行转换为 LaunchpadItem
   */
  private rowToItem(row: LaunchpadAppRow): LaunchpadItem {
    return {
      id: row.id,
      name: row.name,
      nameZh: row.name_zh ?? undefined,
      kind: row.kind as LaunchpadItem['kind'],
      path: row.path,
      bundleId: row.bundle_id ?? undefined,
      icon: row.icon ?? undefined,
      category: row.category ?? undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      launchCommand: row.launch_command ?? undefined,
      workingDirectory: row.working_directory ?? undefined,
      usageCount: row.usage_count || 0,
      lastUsedAt: row.last_used_at ?? undefined,
      status: (row.status as LaunchpadItem['status']) || 'installed',
      version: row.version ?? undefined,
      description: row.description ?? undefined,
      hidden: !!row.hidden,
      pinned: !!row.pinned,
      pageIndex: row.page_index || 0,
      gridIndex: row.grid_index || 0,
    };
  }
}

// 导出单例
export const appLauncher = new AppLauncher();
