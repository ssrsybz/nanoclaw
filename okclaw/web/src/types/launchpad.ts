/**
 * 启动台前端类型定义
 */

export type AppKind =
  | 'macos-app'
  | 'node-project'
  | 'python-project'
  | 'script'
  | 'url-scheme'
  | 'folder';

export type AppStatus = 'installed' | 'updating' | 'error' | 'available';

export interface LaunchpadItem {
  id: string;
  name: string;
  nameZh?: string;
  kind: AppKind;
  path: string;
  bundleId?: string;
  icon?: string;
  iconUrl?: string;
  category?: string;
  tags?: string[];
  children?: LaunchpadItem[];
  parentId?: string | null;
  launchCommand?: string;
  launchArgs?: string[];
  workingDirectory?: string;
  env?: Record<string, string>;
  usageCount: number;
  lastUsedAt?: string;
  installedAt?: string;
  description?: string;
  version?: string;
  developer?: string;
  homepage?: string;
  repository?: string;
  storeId?: string;
  status: AppStatus;
  updateAvailable?: boolean;
  installedVersion?: string;
  latestVersion?: string;
  hidden: boolean;
  pinned: boolean;
  pageIndex: number;
  gridIndex: number;
}

export interface AppCategory {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
  type: 'system' | 'custom';
}

export interface LaunchpadLayout {
  columns: number;
  rows: number;
  iconSize: number;
  showLabels: boolean;
  animationEnabled: boolean;
}

export interface LaunchpadState {
  apps: LaunchpadItem[];
  layout: LaunchpadLayout;
  searchQuery: string;
  selectedFolder: LaunchpadItem | null;
  isLoading: boolean;
  error: string | null;
}
