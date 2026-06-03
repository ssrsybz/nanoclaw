/**
 * 启动台类型定义
 */

/**
 * 应用类型枚举
 */
export type AppKind =
  | 'macos-app'      // macOS .app 包
  | 'node-project'   // Node.js 项目
  | 'python-project' // Python 项目
  | 'script'         // 脚本文件
  | 'url-scheme'     // URL Scheme
  | 'folder';        // 文件夹

/**
 * 应用状态
 */
export type AppStatus =
  | 'installed'
  | 'updating'
  | 'error'
  | 'available';

/**
 * 终端模式
 */
export type TerminalMode =
  | 'none'            // 不需要终端，后台运行
  | 'new-window'      // 在新终端窗口运行
  | 'new-tab'         // 在新标签页运行
  | 'current';        // 当前终端（如果有的话）

/**
 * 启动后动作
 */
export interface PostLaunchAction {
  type: 'open-browser' | 'run-script' | 'wait' | 'notify';
  url?: string;           // open-browser: 打开的 URL
  script?: string;        // run-script: 要执行的脚本
  duration?: number;      // wait: 等待时间（毫秒）
  message?: string;       // notify: 通知消息
}

/**
 * 启动依赖
 */
export interface LaunchDependencies {
  venvPath?: string;      // Python 虚拟环境路径
  nodeModules?: boolean;  // 是否需要 npm install
  dockerCompose?: string; // docker-compose 文件路径
  envFile?: string;       // .env 文件路径
  requiredPorts?: number[]; // 需要的端口
  requiredCommands?: string[]; // 需要的命令（如 docker, redis-cli）
}

/**
 * 启动台项目 - 统一表示所有类型的应用
 */
export interface LaunchpadItem {
  id: string;                    // 唯一标识 (路径的 hash 或 bundleId)
  name: string;                  // 显示名称
  nameZh?: string;               // 中文名称
  kind: AppKind;                 // 应用类型
  path: string;                  // 文件路径或 URL
  bundleId?: string;             // macOS bundle identifier
  icon?: string;                 // 图标路径或 base64
  iconUrl?: string;              // 图标 URL

  // 分类与组织
  category?: string;             // 分类 ID
  tags?: string[];               // 用户标签

  // 文件夹支持
  children?: LaunchpadItem[];    // 文件夹内容
  parentId?: string | null;      // 所属文件夹 ID

  // ===== 增强型启动配置 =====
  launchCommand?: string;        // 自定义启动命令
  launchArgs?: string[];         // 启动参数
  workingDirectory?: string;     // 工作目录
  env?: Record<string, string>;  // 环境变量

  // 新增：智能启动配置
  terminalMode?: TerminalMode;   // 终端模式
  preLaunchScript?: string;      // 启动前脚本（激活虚拟环境等）
  postLaunchActions?: PostLaunchAction[]; // 启动后动作
  dependencies?: LaunchDependencies; // 运行依赖
  autoDetect?: boolean;          // 是否自动检测启动配置（默认 true）

  // 启动脚本（完整脚本，优先于 launchCommand）
  launchScript?: string;         // 完整启动脚本内容
  launchScriptPath?: string;     // 启动脚本文件路径

  // 使用统计
  usageCount: number;            // 启动次数
  lastUsedAt?: string;           // 最后使用时间
  installedAt?: string;          // 安装时间

  // 元数据
  description?: string;          // 描述
  version?: string;              // 版本号
  developer?: string;            // 开发者
  homepage?: string;             // 主页 URL
  repository?: string;           // 仓库 URL

  // 应用商店
  storeId?: string;              // 商店应用 ID
  status: AppStatus;             // 状态
  updateAvailable?: boolean;     // 有更新可用
  installedVersion?: string;     // 已安装版本
  latestVersion?: string;        // 最新版本

  // 用户配置
  hidden: boolean;               // 是否隐藏
  pinned: boolean;               // 是否固定
  pageIndex: number;             // 页码
  gridIndex: number;             // 网格位置
}

/**
 * 应用分类
 */
export interface AppCategory {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
  type: 'system' | 'custom';
}

/**
 * 应用扫描配置
 */
export interface ScanConfig {
  directories: string[];         // 扫描目录
  excludePatterns: string[];     // 排除模式
  maxDepth: number;              // 最大深度
  watchForChanges: boolean;      // 实时监控
}

/**
 * 启动台布局
 */
export interface LaunchpadLayout {
  columns: number;               // 列数
  rows: number;                  // 行数
  iconSize: number;              // 图标大小
  showLabels: boolean;           // 显示标签
  animationEnabled: boolean;     // 启用动画
}

/**
 * 应用安装请求
 */
export interface InstallRequest {
  source: 'url' | 'file' | 'store';
  url?: string;                  // 下载 URL
  filePath?: string;             // 本地文件路径
  storeId?: string;              // 商店应用 ID
  name?: string;                 // 自定义名称
  installPath?: string;          // 安装路径
}

/**
 * 应用启动结果
 */
export interface LaunchResult {
  success: boolean;
  appName?: string;
  error?: string;
  pid?: number;
}

/**
 * 扫描结果
 */
export interface ScanResult {
  items: LaunchpadItem[];
  errors: Array<{ path: string; error: string }>;
  duration: number;
}

/**
 * WebSocket 消息类型
 */
export type LaunchpadWSMessage =
  | { type: 'apps_updated'; apps: LaunchpadItem[] }
  | { type: 'app_launched'; appId: string; appName: string }
  | { type: 'app_installed'; app: LaunchpadItem }
  | { type: 'app_updated'; app: LaunchpadItem }
  | { type: 'app_uninstalled'; appId: string }
  | { type: 'scan_started' }
  | { type: 'scan_completed'; count: number };
