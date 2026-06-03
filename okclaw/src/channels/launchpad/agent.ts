/**
 * 启动台 Agent
 * 独立的分析和启动服务，接收项目路径，自动检测启动配置
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { LaunchpadItem, AppKind, TerminalMode, PostLaunchAction, LaunchDependencies } from './types.js';
import { logger } from '../../logger.js';

/**
 * 项目分析请求
 */
export interface AnalyzeRequest {
  projectPath: string;
  name?: string;
  description?: string;
  hints?: {
    preferredCommand?: string;
    requiresTerminal?: boolean;
    openBrowser?: string;
  };
}

/**
 * 项目分析结果
 */
export interface AnalyzeResult {
  success: boolean;
  item?: LaunchpadItem;
  error?: string;
  detected: {
    kind: AppKind;
    launchCommand: string;
    terminalMode: TerminalMode;
    dependencies: LaunchDependencies;
    postLaunchActions: PostLaunchAction[];
  };
  reasoning: string[];
}

/**
 * 启动台 Agent
 * 负责：
 * 1. 分析项目结构，检测启动方式
 * 2. 自动配置启动参数
 * 3. 执行智能启动
 */
export class LaunchpadAgent {
  /**
   * 分析项目，生成启动配置
   */
  async analyzeProject(request: AnalyzeRequest): Promise<AnalyzeResult> {
    const { projectPath } = request;
    const reasoning: string[] = [];

    // 检查路径是否存在
    if (!fs.existsSync(projectPath)) {
      return {
        success: false,
        error: `路径不存在: ${projectPath}`,
        detected: this.getDefaultConfig(),
        reasoning: ['路径检查失败'],
      };
    }

    reasoning.push(`分析项目: ${projectPath}`);

    // 检测项目类型
    const kind = this.detectProjectKind(projectPath, reasoning);
    reasoning.push(`检测到类型: ${kind}`);

    // 检测启动命令
    const launchCommand = request.hints?.preferredCommand ||
      this.detectLaunchCommand(projectPath, kind, reasoning);
    reasoning.push(`启动命令: ${launchCommand}`);

    // 检测终端模式
    const terminalMode = request.hints?.requiresTerminal !== undefined
      ? (request.hints?.requiresTerminal ? 'new-window' : 'none')
      : this.detectTerminalMode(projectPath, kind, launchCommand, reasoning);
    reasoning.push(`终端模式: ${terminalMode}`);

    // 检测依赖
    const dependencies = this.detectDependencies(projectPath, kind, reasoning);

    // 检测启动后动作
    const postLaunchActions = this.detectPostLaunchActions(
      projectPath,
      kind,
      request.hints?.openBrowser,
      reasoning
    );

    // 生成项目名称
    const name = request.name || path.basename(projectPath);

    // 生成 LaunchpadItem
    const item: LaunchpadItem = {
      id: `agent-${this.hashPath(projectPath)}`,
      name,
      kind,
      path: projectPath,
      launchCommand,
      workingDirectory: projectPath,
      terminalMode,
      dependencies,
      postLaunchActions,
      autoDetect: true,
      usageCount: 0,
      status: 'installed',
      hidden: false,
      pinned: false,
      pageIndex: 0,
      gridIndex: 0,
      description: request.description,
    };

    return {
      success: true,
      item,
      detected: {
        kind,
        launchCommand,
        terminalMode,
        dependencies,
        postLaunchActions,
      },
      reasoning,
    };
  }

  /**
   * 检测项目类型
   */
  private detectProjectKind(projectPath: string, reasoning: string[]): AppKind {
    const stat = fs.statSync(projectPath);

    // macOS .app
    if (projectPath.endsWith('.app') && stat.isDirectory()) {
      reasoning.push('检测到 macOS .app 包');
      return 'macos-app';
    }

    // 脚本文件
    if (stat.isFile()) {
      const ext = path.extname(projectPath);
      const scriptExts = ['.sh', '.py', '.js', '.ts', '.rb', '.go', '.rs'];
      if (scriptExts.includes(ext)) {
        reasoning.push(`检测到脚本文件: ${ext}`);
        return 'script';
      }
    }

    // 目录：检测项目类型
    if (stat.isDirectory()) {
      // Node.js 项目
      if (fs.existsSync(path.join(projectPath, 'package.json'))) {
        reasoning.push('检测到 package.json → Node.js 项目');
        return 'node-project';
      }

      // Python 项目
      const pythonMarkers = ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'];
      for (const marker of pythonMarkers) {
        if (fs.existsSync(path.join(projectPath, marker))) {
          reasoning.push(`检测到 ${marker} → Python 项目`);
          return 'python-project';
        }
      }

      // Makefile 项目
      if (fs.existsSync(path.join(projectPath, 'Makefile'))) {
        reasoning.push('检测到 Makefile');
        return 'script';
      }
    }

    reasoning.push('未检测到特定类型，默认为脚本');
    return 'script';
  }

  /**
   * 检测启动命令
   */
  private detectLaunchCommand(
    projectPath: string,
    kind: AppKind,
    reasoning: string[]
  ): string {
    switch (kind) {
      case 'macos-app':
        reasoning.push('macOS 应用使用 `open` 命令');
        return `open "${projectPath}"`;

      case 'node-project': {
        const pkgPath = path.join(projectPath, 'package.json');
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.scripts?.dev) {
            reasoning.push('检测到 npm run dev 脚本');
            return 'npm run dev';
          }
          if (pkg.scripts?.start) {
            reasoning.push('检测到 npm start 脚本');
            return 'npm start';
          }
          if (pkg.main) {
            reasoning.push(`检测到 main 入口: ${pkg.main}`);
            return `node ${pkg.main}`;
          }
        } catch {
          // 忽略解析错误
        }
        reasoning.push('默认使用 npm start');
        return 'npm start';
      }

      case 'python-project': {
        // 检测入口文件
        const entryFiles = ['main.py', 'app.py', 'run.py', 'server.py', 'manage.py'];
        for (const file of entryFiles) {
          if (fs.existsSync(path.join(projectPath, file))) {
            reasoning.push(`检测到入口文件: ${file}`);
            return `python3 ${file}`;
          }
        }

        // 检测是否是 CLI 工具
        const pyprojectPath = path.join(projectPath, 'pyproject.toml');
        if (fs.existsSync(pyprojectPath)) {
          try {
            const content = fs.readFileSync(pyprojectPath, 'utf-8');
            if (content.includes('[project.scripts]')) {
              reasoning.push('检测到 CLI 入口定义');
              return 'python3 -m .';
            }
          } catch {
            // 忽略
          }
        }

        reasoning.push('默认使用 python3 main.py');
        return 'python3 main.py';
      }

      case 'script': {
        const ext = path.extname(projectPath);
        const interpreters: Record<string, string> = {
          '.sh': 'bash',
          '.py': 'python3',
          '.js': 'node',
          '.ts': 'npx ts-node',
          '.rb': 'ruby',
        };
        const interpreter = interpreters[ext] || '';
        const cmd = interpreter ? `${interpreter} "${projectPath}"` : `"${projectPath}"`;
        reasoning.push(`脚本启动命令: ${cmd}`);
        return cmd;
      }

      default:
        reasoning.push('未知类型，直接执行');
        return `"${projectPath}"`;
    }
  }

  /**
   * 检测终端模式
   */
  private detectTerminalMode(
    projectPath: string,
    kind: AppKind,
    launchCommand: string,
    reasoning: string[]
  ): TerminalMode {
    // macOS .app 不需要终端
    if (kind === 'macos-app') {
      reasoning.push('macOS 应用不需要终端');
      return 'none';
    }

    // 检测是否是交互式 CLI 工具
    const interactivePatterns = [
      /python.*hermes/i,
      /python.*cli/i,
      /node.*cli/i,
      /python.*main\.py$/i,
      /ipython/i,
      /python.*-i\b/i,
    ];

    for (const pattern of interactivePatterns) {
      if (pattern.test(launchCommand)) {
        reasoning.push(`检测到交互式命令: ${launchCommand}`);
        return 'new-window';
      }
    }

    // 检测是否是 Web 服务
    const webPatterns = [/npm run (dev|start)/i, /python.*app\.py/i, /python.*server\.py/i, /uvicorn/i, /flask/i, /django/i];
    for (const pattern of webPatterns) {
      if (pattern.test(launchCommand)) {
        reasoning.push('检测到 Web 服务，可能需要终端查看日志');
        return 'new-window';
      }
    }

    // Python 项目默认需要终端
    if (kind === 'python-project') {
      reasoning.push('Python 项目默认在新终端运行');
      return 'new-window';
    }

    reasoning.push('默认在新终端运行');
    return 'new-window';
  }

  /**
   * 检测依赖
   */
  private detectDependencies(
    projectPath: string,
    kind: AppKind,
    reasoning: string[]
  ): LaunchDependencies {
    const deps: LaunchDependencies = {};

    // Python 虚拟环境
    if (kind === 'python-project') {
      const venvPaths = ['venv', '.venv', 'env', '.env'];
      for (const venv of venvPaths) {
        const venvPath = path.join(projectPath, venv);
        if (fs.existsSync(venvPath)) {
          deps.venvPath = venvPath;
          reasoning.push(`检测到虚拟环境: ${venv}`);
          break;
        }
      }
    }

    // Node.js node_modules
    if (kind === 'node-project') {
      const nodeModules = path.join(projectPath, 'node_modules');
      deps.nodeModules = fs.existsSync(nodeModules);
      if (!deps.nodeModules) {
        reasoning.push('未检测到 node_modules，启动前需要 npm install');
      }
    }

    // Docker Compose
    const dockerComposeFiles = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml'];
    for (const file of dockerComposeFiles) {
      if (fs.existsSync(path.join(projectPath, file))) {
        deps.dockerCompose = file;
        reasoning.push(`检测到 ${file}`);
        break;
      }
    }

    // .env 文件
    const envFile = path.join(projectPath, '.env');
    if (fs.existsSync(envFile)) {
      deps.envFile = envFile;
      reasoning.push('检测到 .env 文件');
    }

    return deps;
  }

  /**
   * 检测启动后动作
   */
  private detectPostLaunchActions(
    projectPath: string,
    kind: AppKind,
    openBrowserHint: string | undefined,
    reasoning: string[]
  ): PostLaunchAction[] {
    const actions: PostLaunchAction[] = [];

    // 如果有明确的浏览器 URL 提示
    if (openBrowserHint) {
      actions.push({ type: 'open-browser', url: openBrowserHint });
      reasoning.push(`启动后打开浏览器: ${openBrowserHint}`);
      return actions;
    }

    // 检测 Web 项目
    if (kind === 'node-project') {
      const pkgPath = path.join(projectPath, 'package.json');
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const scripts = pkg.scripts || {};

        // Next.js, Nuxt, Vite 等通常是 Web 项目
        const webFrameworks = ['next', 'nuxt', 'vite', 'react-scripts', 'vue-cli-service'];
        for (const [scriptName, scriptCmd] of Object.entries(scripts)) {
          if (typeof scriptCmd === 'string') {
            for (const fw of webFrameworks) {
              if (scriptCmd.includes(fw)) {
                actions.push({ type: 'wait', duration: 3000 });
                actions.push({ type: 'open-browser', url: 'http://localhost:3000' });
                reasoning.push('检测到 Web 框架，启动后打开 localhost:3000');
                return actions;
              }
            }
          }
        }
      } catch {
        // 忽略
      }
    }

    // 检测 Python Web 框架
    if (kind === 'python-project') {
      const mainFiles = ['app.py', 'main.py', 'server.py', 'run.py'];
      for (const file of mainFiles) {
        const filePath = path.join(projectPath, file);
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            if (content.includes('flask') || content.includes('Flask')) {
              actions.push({ type: 'wait', duration: 2000 });
              actions.push({ type: 'open-browser', url: 'http://localhost:5000' });
              reasoning.push('检测到 Flask，启动后打开 localhost:5000');
              return actions;
            }
            if (content.includes('uvicorn') || content.includes('FastAPI')) {
              actions.push({ type: 'wait', duration: 2000 });
              actions.push({ type: 'open-browser', url: 'http://localhost:8000' });
              reasoning.push('检测到 FastAPI，启动后打开 localhost:8000');
              return actions;
            }
            if (content.includes('django') || content.includes('Django')) {
              actions.push({ type: 'wait', duration: 3000 });
              actions.push({ type: 'open-browser', url: 'http://localhost:8000' });
              reasoning.push('检测到 Django，启动后打开 localhost:8000');
              return actions;
            }
          } catch {
            // 忽略
          }
        }
      }
    }

    reasoning.push('未检测到需要启动后动作');
    return actions;
  }

  /**
   * 执行智能启动
   */
  async launch(item: LaunchpadItem): Promise<{ success: boolean; error?: string }> {
    const { terminalMode, preLaunchScript, launchCommand, workingDirectory, postLaunchActions, dependencies } = item;

    logger.info({ item: item.name }, 'LaunchpadAgent: 执行智能启动');

    // 构建完整的启动脚本
    const scriptLines: string[] = [];
    scriptLines.push('#!/bin/bash');
    scriptLines.push(`cd "${workingDirectory}"`);

    // 激活虚拟环境
    if (dependencies?.venvPath) {
      scriptLines.push(`source "${dependencies.venvPath}/bin/activate"`);
    }

    // 加载 .env 文件
    if (dependencies?.envFile) {
      scriptLines.push(`export $(cat "${dependencies.envFile}" | xargs)`);
    }

    // 执行预启动脚本
    if (preLaunchScript) {
      scriptLines.push(preLaunchScript);
    }

    // 执行启动命令
    if (launchCommand) {
      scriptLines.push(launchCommand);
    }

    const fullScript = scriptLines.join('\n');

    // 根据终端模式执行
    if (terminalMode === 'new-window') {
      return this.launchInNewTerminal(fullScript, item.name);
    } else if (terminalMode === 'new-tab') {
      return this.launchInNewTab(fullScript, item.name);
    } else {
      return this.launchInBackground(fullScript, workingDirectory || item.path);
    }

    // 执行启动后动作
    // TODO: 在后台执行 postLaunchActions
  }

  /**
   * 在新终端窗口启动
   */
  private launchInNewTerminal(script: string, name: string): { success: boolean; error?: string } {
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
        spawn('osascript', ['-e', appleScript], { detached: true });
        logger.info({ name }, '已在新终端窗口启动');
        return { success: true };
      } else if (platform === 'linux') {
        // Linux: 尝试使用 gnome-terminal 或 xterm
        const termCmd = process.env.TERM_PROGRAM || 'gnome-terminal';
        spawn(termCmd, ['-e', 'bash', '-c', script], { detached: true });
        return { success: true };
      } else {
        // Windows: 使用 start cmd
        spawn('cmd', ['/c', 'start', 'cmd', '/k', script], { detached: true });
        return { success: true };
      }
    } catch (err) {
      logger.error({ err, name }, '启动失败');
      return { success: false, error: String(err) };
    }
  }

  /**
   * 在新标签页启动
   */
  private launchInNewTab(script: string, name: string): { success: boolean; error?: string } {
    // macOS Terminal 不支持直接开新标签页，还是用新窗口
    return this.launchInNewTerminal(script, name);
  }

  /**
   * 后台启动
   */
  private launchInBackground(script: string, cwd: string): { success: boolean; error?: string } {
    try {
      const child = spawn('bash', ['-c', script], {
        cwd,
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      logger.info({ cwd }, '已在后台启动');
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): AnalyzeResult['detected'] {
    return {
      kind: 'script',
      launchCommand: '',
      terminalMode: 'new-window',
      dependencies: {},
      postLaunchActions: [],
    };
  }

  /**
   * 生成路径 hash
   */
  private hashPath(p: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(p).digest('hex').slice(0, 12);
  }
}

// 导出单例
export const launchpadAgent = new LaunchpadAgent();
