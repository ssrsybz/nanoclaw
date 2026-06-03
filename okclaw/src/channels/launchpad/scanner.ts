/**
 * 应用扫描服务
 * 参考 Swift 启动台项目的扫描实现模式
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import crypto from 'crypto';
import { LaunchpadItem, AppKind, ScanConfig, ScanResult } from './types.js';
import { logger } from '../../logger.js';

/**
 * 默认扫描目录
 */
const DEFAULT_SCAN_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications',
    '/System/Applications',
    '/System/Library/CoreServices/Applications',
    path.join(os.homedir(), 'Applications'),
  ],
  linux: [
    '/usr/share/applications',
    '/usr/local/share/applications',
    path.join(os.homedir(), '.local/share/applications'),
  ],
  win32: [
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    path.join(os.homedir(), 'AppData\\Local\\Programs'),
  ],
};

/**
 * 默认排除模式
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/.DS_Store',
  '**/.*',
];

/**
 * 应用扫描器
 */
export class AppScanner {
  private config: ScanConfig;
  private watchHandles: Map<string, fs.FSWatcher> = new Map();
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(config?: Partial<ScanConfig>) {
    this.config = {
      directories: DEFAULT_SCAN_PATHS[process.platform] || [],
      excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
      maxDepth: 3,
      watchForChanges: true,
      ...config,
    };
  }

  /**
   * 扫描所有应用
   */
  async scanAll(directories?: string[]): Promise<ScanResult> {
    const startTime = Date.now();
    const items: LaunchpadItem[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    const seenIds = new Set<string>();

    const dirs = directories || this.config.directories;

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        logger.debug({ dir }, 'Scan directory does not exist, skipping');
        continue;
      }

      try {
        const dirItems = await this.scanDirectory(dir, 0);
        for (const item of dirItems) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            items.push(item);
          }
        }
      } catch (err) {
        errors.push({ path: dir, error: String(err) });
        logger.warn({ dir, err }, 'Failed to scan directory');
      }
    }

    // 按名称排序
    items.sort((a, b) => a.name.localeCompare(b.name));

    return {
      items,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 扫描单个目录
   */
  private async scanDirectory(dirPath: string, depth: number): Promise<LaunchpadItem[]> {
    if (depth > this.config.maxDepth) return [];

    const items: LaunchpadItem[] = [];
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (err) {
      logger.debug({ dirPath, err }, 'Failed to read directory');
      return items;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // 跳过隐藏文件
      if (entry.name.startsWith('.')) continue;

      // 跳过排除模式
      if (this.shouldExclude(fullPath)) continue;

      try {
        // 根据平台和文件类型检测
        const item = await this.detectItem(fullPath, entry);
        if (item) {
          items.push(item);
        } else if (entry.isDirectory()) {
          // 递归扫描子目录
          const subItems = await this.scanDirectory(fullPath, depth + 1);
          items.push(...subItems);
        }
      } catch (err) {
        logger.debug({ fullPath, err }, 'Failed to detect item');
      }
    }

    return items;
  }

  /**
   * 检测文件类型并创建项目
   */
  private async detectItem(filePath: string, entry: fs.Dirent): Promise<LaunchpadItem | null> {
    const platform = process.platform;

    // macOS .app 包
    if (platform === 'darwin' && entry.isDirectory() && entry.name.endsWith('.app')) {
      return this.parseMacOSApp(filePath);
    }

    // 代码项目检测
    if (entry.isDirectory()) {
      // Node.js 项目
      const packageJson = path.join(filePath, 'package.json');
      if (fs.existsSync(packageJson)) {
        return this.parseNodeProject(filePath);
      }

      // Python 项目
      const requirements = path.join(filePath, 'requirements.txt');
      const pyproject = path.join(filePath, 'pyproject.toml');
      const setupPy = path.join(filePath, 'setup.py');
      if (fs.existsSync(requirements) || fs.existsSync(pyproject) || fs.existsSync(setupPy)) {
        return this.parsePythonProject(filePath);
      }

      // Makefile 项目
      const makefile = path.join(filePath, 'Makefile');
      if (fs.existsSync(makefile)) {
        return this.parseMakefileProject(filePath);
      }
    }

    // 脚本文件
    if (entry.isFile()) {
      const ext = path.extname(entry.name);
      const scriptExts = ['.sh', '.py', '.js', '.ts', '.rb', '.go', '.rs'];
      if (scriptExts.includes(ext)) {
        return this.parseScriptFile(filePath);
      }
    }

    // Linux .desktop 文件
    if (platform === 'linux' && entry.isFile() && entry.name.endsWith('.desktop')) {
      return this.parseDesktopFile(filePath);
    }

    // Windows .exe/.lnk 文件
    if (platform === 'win32' && entry.isFile() && (entry.name.endsWith('.exe') || entry.name.endsWith('.lnk'))) {
      return this.parseWindowsExecutable(filePath);
    }

    return null;
  }

  /**
   * 解析 macOS .app
   */
  private async parseMacOSApp(appPath: string): Promise<LaunchpadItem | null> {
    try {
      const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
      if (!fs.existsSync(infoPlistPath)) return null;

      // 使用 plutil 解析 plist
      const plist = await this.execCommand(`plutil -convert json -o - "${infoPlistPath}"`);
      if (!plist) return null;

      const info = JSON.parse(plist);

      const bundleId = info.CFBundleIdentifier || this.generateId(appPath);
      const name = info.CFBundleDisplayName || info.CFBundleName || path.basename(appPath, '.app');

      // 获取图标路径并转换为 PNG
      const rawIconPath = this.getMacOSIconPath(appPath, info);
      let iconPath: string | undefined;
      if (rawIconPath) {
        iconPath = await this.convertIconToPng(rawIconPath, bundleId) || undefined;
      }

      return {
        id: bundleId,
        name,
        kind: 'macos-app',
        path: appPath,
        bundleId,
        icon: iconPath,
        category: info.LSApplicationCategoryType,
        usageCount: 0,
        status: 'installed',
        version: info.CFBundleShortVersionString || info.CFBundleVersion,
        developer: info.NSHumanReadableCopyright,
        hidden: false,
        pinned: false,
        pageIndex: 0,
        gridIndex: 0,
      };
    } catch (err) {
      logger.debug({ appPath, err }, 'Failed to parse macOS app');
      return null;
    }
  }

  /**
   * 解析 Node.js 项目
   */
  private parseNodeProject(projectPath: string): LaunchpadItem | null {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      const name = packageJson.name || path.basename(projectPath);
      const id = `node-${this.generateId(projectPath)}`;

      // 检测启动脚本
      let launchCommand = 'npm start';
      if (packageJson.scripts?.dev) {
        launchCommand = 'npm run dev';
      } else if (packageJson.scripts?.start) {
        launchCommand = 'npm start';
      } else if (packageJson.main) {
        launchCommand = `node ${packageJson.main}`;
      }

      // 查找项目图标
      const iconPath = this.getProjectIcon(projectPath);

      return {
        id,
        name,
        kind: 'node-project',
        path: projectPath,
        icon: iconPath,
        launchCommand,
        workingDirectory: projectPath,
        usageCount: 0,
        status: 'installed',
        version: packageJson.version,
        description: packageJson.description,
        repository: packageJson.repository?.url || packageJson.repository,
        hidden: false,
        pinned: false,
        pageIndex: 0,
        gridIndex: 0,
      };
    } catch (err) {
      logger.debug({ projectPath, err }, 'Failed to parse Node project');
      return null;
    }
  }

  /**
   * 解析 Python 项目
   */
  private parsePythonProject(projectPath: string): LaunchpadItem | null {
    const name = path.basename(projectPath);
    const id = `python-${this.generateId(projectPath)}`;

    // 检测启动方式
    let launchCommand = 'python3 main.py';
    const mainPy = path.join(projectPath, 'main.py');
    const appPy = path.join(projectPath, 'app.py');
    const runPy = path.join(projectPath, 'run.py');

    if (fs.existsSync(appPy)) {
      launchCommand = 'python3 app.py';
    } else if (fs.existsSync(runPy)) {
      launchCommand = 'python3 run.py';
    } else if (!fs.existsSync(mainPy)) {
      // 尝试找到任何入口文件
      const pyFiles = fs.readdirSync(projectPath).filter(f => f.endsWith('.py') && !f.startsWith('__'));
      if (pyFiles.length > 0) {
        launchCommand = `python3 ${pyFiles[0]}`;
      }
    }

    // 检测虚拟环境
    const venvPath = path.join(projectPath, 'venv');
    const venvPath2 = path.join(projectPath, '.venv');
    if (fs.existsSync(venvPath)) {
      launchCommand = launchCommand.replace('python3', './venv/bin/python');
    } else if (fs.existsSync(venvPath2)) {
      launchCommand = launchCommand.replace('python3', './.venv/bin/python');
    }

    // 查找项目图标
    const iconPath = this.getProjectIcon(projectPath);

    return {
      id,
      name,
      kind: 'python-project',
      path: projectPath,
      icon: iconPath,
      launchCommand,
      workingDirectory: projectPath,
      usageCount: 0,
      status: 'installed',
      hidden: false,
      pinned: false,
      pageIndex: 0,
      gridIndex: 0,
    };
  }

  /**
   * 解析 Makefile 项目
   */
  private parseMakefileProject(projectPath: string): LaunchpadItem | null {
    const name = path.basename(projectPath);
    const id = `make-${this.generateId(projectPath)}`;

    return {
      id,
      name,
      kind: 'script',
      path: projectPath,
      launchCommand: 'make run',
      workingDirectory: projectPath,
      usageCount: 0,
      status: 'installed',
      hidden: false,
      pinned: false,
      pageIndex: 0,
      gridIndex: 0,
    };
  }

  /**
   * 解析脚本文件
   */
  private parseScriptFile(scriptPath: string): LaunchpadItem | null {
    const ext = path.extname(scriptPath);
    const name = path.basename(scriptPath, ext);
    const id = `script-${this.generateId(scriptPath)}`;

    // 确定解释器
    const interpreters: Record<string, string> = {
      '.sh': 'bash',
      '.py': 'python3',
      '.js': 'node',
      '.ts': 'npx ts-node',
      '.rb': 'ruby',
      '.go': 'go run',
      '.rs': 'rustc',
    };

    let interpreter = interpreters[ext] || '';
    if (!interpreter) return null;

    // 检查 shebang
    try {
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const firstLine = content.split('\n')[0];
      if (firstLine.startsWith('#!')) {
        // 使用 shebang，设置为可执行
        interpreter = '';
      }
    } catch {
      // 忽略读取错误
    }

    const launchCommand = interpreter ? `${interpreter} "${scriptPath}"` : `"${scriptPath}"`;

    return {
      id,
      name,
      kind: 'script',
      path: scriptPath,
      launchCommand,
      workingDirectory: path.dirname(scriptPath),
      usageCount: 0,
      status: 'installed',
      hidden: false,
      pinned: false,
      pageIndex: 0,
      gridIndex: 0,
    };
  }

  /**
   * 解析 Linux .desktop 文件
   */
  private parseDesktopFile(filePath: string): LaunchpadItem | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const nameMatch = content.match(/^Name=(.+)$/m);
      const execMatch = content.match(/^Exec=(.+)$/m);
      const iconMatch = content.match(/^Icon=(.+)$/m);

      if (!nameMatch || !execMatch) return null;

      const name = nameMatch[1];
      const id = `desktop-${this.generateId(filePath)}`;

      return {
        id,
        name,
        kind: 'macos-app', // Linux 桌面应用使用相同类型
        path: filePath,
        launchCommand: execMatch[1].replace(/%[fFuUdDnNickvm]/g, ''),
        icon: iconMatch?.[1],
        usageCount: 0,
        status: 'installed',
        hidden: false,
        pinned: false,
        pageIndex: 0,
        gridIndex: 0,
      };
    } catch (err) {
      logger.debug({ filePath, err }, 'Failed to parse .desktop file');
      return null;
    }
  }

  /**
   * 解析 Windows 可执行文件
   */
  private parseWindowsExecutable(filePath: string): LaunchpadItem | null {
    const name = path.basename(filePath, path.extname(filePath));
    const id = `win-${this.generateId(filePath)}`;

    return {
      id,
      name,
      kind: 'macos-app', // Windows 应用使用相同类型
      path: filePath,
      launchCommand: `"${filePath}"`,
      usageCount: 0,
      status: 'installed',
      hidden: false,
      pinned: false,
      pageIndex: 0,
      gridIndex: 0,
    };
  }

  /**
   * 启动目录监控
   */
  startWatching(callback: () => void): void {
    if (!this.config.watchForChanges) return;

    for (const dir of this.config.directories) {
      if (!fs.existsSync(dir)) continue;

      try {
        const watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
          if (!filename) return;

          // 只关心特定文件变化
          if (
            filename.endsWith('.app') ||
            filename.includes('package.json') ||
            filename.includes('requirements.txt') ||
            filename.endsWith('.sh') ||
            filename.endsWith('.py') ||
            filename.endsWith('.js')
          ) {
            // 防抖处理
            this.debounce(callback, 1000);
          }
        });

        this.watchHandles.set(dir, watcher);
      } catch (err) {
        logger.warn({ dir, err }, 'Failed to start watching directory');
      }
    }
  }

  /**
   * 停止监控
   */
  stopWatching(): void {
    for (const [_dir, watcher] of this.watchHandles) {
      watcher.close();
    }
    this.watchHandles.clear();
  }

  /**
   * 添加扫描目录
   */
  addScanDirectory(dir: string): void {
    if (!this.config.directories.includes(dir)) {
      this.config.directories.push(dir);
    }
  }

  /**
   * 移除扫描目录
   */
  removeScanDirectory(dir: string): void {
    this.config.directories = this.config.directories.filter(d => d !== dir);
  }

  /**
   * 辅助方法：生成 ID
   */
  private generateId(filePath: string): string {
    return crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12);
  }

  /**
   * 辅助方法：执行命令
   */
  private execCommand(cmd: string): Promise<string | null> {
    return new Promise((resolve) => {
      const child = spawn('sh', ['-c', cmd], { stdio: ['ignore', 'pipe', 'ignore'] });
      let stdout = '';

      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim() || null);
        } else {
          resolve(null);
        }
      });

      child.on('error', () => {
        resolve(null);
      });
    });
  }

  /**
   * 辅助方法：获取 macOS 图标路径
   */
  private getMacOSIconPath(appPath: string, plist: Record<string, unknown>): string | undefined {
    const iconName = plist.CFBundleIconFile as string | undefined;
    if (!iconName) return undefined;

    const resourcesPath = path.join(appPath, 'Contents', 'Resources');

    // 尝试不同的图标扩展名
    const extensions = ['.icns', '.png', ''];
    for (const ext of extensions) {
      const iconPath = path.join(resourcesPath, iconName + ext);
      if (fs.existsSync(iconPath)) {
        return iconPath;
      }
    }

    // 尝试查找 AppIcon
    const appIconPatterns = ['AppIcon', 'app', 'icon', 'App'];
    for (const pattern of appIconPatterns) {
      for (const ext of ['.icns', '.png']) {
        const iconPath = path.join(resourcesPath, pattern + ext);
        if (fs.existsSync(iconPath)) {
          return iconPath;
        }
      }
    }

    return undefined;
  }

  /**
   * 将 .icns 转换为 PNG 并返回缓存路径
   */
  async convertIconToPng(iconPath: string, appId: string): Promise<string | null> {
    if (!iconPath.endsWith('.icns')) {
      return iconPath; // 已经是 PNG 或其他格式
    }

    // 创建图标缓存目录
    const cacheDir = path.join(os.tmpdir(), 'okclaw-icons');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const pngPath = path.join(cacheDir, `${appId}.png`);

    // 如果已经缓存，直接返回
    if (fs.existsSync(pngPath)) {
      return pngPath;
    }

    // 使用 sips 转换
    try {
      await this.execCommand(`sips -s format png "${iconPath}" --out "${pngPath}"`);
      if (fs.existsSync(pngPath)) {
        return pngPath;
      }
    } catch (err) {
      logger.debug({ iconPath, err }, 'Failed to convert icon');
    }

    return null;
  }

  /**
   * 获取项目图标（Node.js/Python 项目）
   */
  getProjectIcon(projectPath: string): string | undefined {
    const iconNames = ['icon', 'logo', 'app-icon', 'appicon', 'thumbnail'];
    const extensions = ['.png', '.jpg', '.jpeg', '.svg', '.icns'];

    for (const name of iconNames) {
      for (const ext of extensions) {
        const iconPath = path.join(projectPath, name + ext);
        if (fs.existsSync(iconPath)) {
          return iconPath;
        }
        // 也检查 public/ 和 assets/ 目录
        for (const subdir of ['public', 'assets', 'images', 'img', 'icons']) {
          const subIconPath = path.join(projectPath, subdir, name + ext);
          if (fs.existsSync(subIconPath)) {
            return subIconPath;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * 辅助方法：检查是否应排除
   */
  private shouldExclude(filePath: string): boolean {
    for (const pattern of this.config.excludePatterns) {
      // 简单的 glob 匹配
      const regex = new RegExp(
        '^' + pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$'
      );
      if (regex.test(filePath)) return true;
    }
    return false;
  }

  /**
   * 辅助方法：防抖
   */
  private debounce(fn: () => void, delay: number): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(fn, delay);
  }
}

// 导出单例
export const appScanner = new AppScanner();
