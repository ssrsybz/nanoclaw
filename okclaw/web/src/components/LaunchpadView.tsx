/**
 * 启动台主视图组件
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LaunchpadItem, LaunchpadLayout } from '../types/launchpad';

interface LaunchpadViewProps {
  onClose?: () => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  app: LaunchpadItem | null;
}

interface CreateFolderModalState {
  visible: boolean;
  selectedApps: string[];
  folderName: string;
}

interface EditModalState {
  visible: boolean;
  app: LaunchpadItem | null;
  name: string;
  nameZh: string;
  category: string;
}

export default function LaunchpadView({ onClose }: LaunchpadViewProps) {
  const [apps, setApps] = useState<LaunchpadItem[]>([]);
  const [layout, setLayout] = useState<LaunchpadLayout>({
    columns: 7,
    rows: 5,
    iconSize: 64,
    showLabels: true,
    animationEnabled: true,
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<LaunchpadItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    app: null,
  });
  const [createFolderModal, setCreateFolderModal] = useState<CreateFolderModalState>({
    visible: false,
    selectedApps: [],
    folderName: '',
  });
  const [editModal, setEditModal] = useState<EditModalState>({
    visible: false,
    app: null,
    name: '',
    nameZh: '',
    category: '',
  });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // 获取应用列表
  const fetchApps = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('http://localhost:3101/api/launchpad/apps');
      const data = await res.json();
      setApps(data.apps || []);
    } catch (err) {
      console.error('Failed to fetch apps:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 获取布局配置
  const fetchLayout = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:3101/api/launchpad/layout');
      const data = await res.json();
      if (data.layout) {
        setLayout(data.layout);
      }
    } catch (err) {
      console.error('Failed to fetch layout:', err);
    }
  }, []);

  // 初始化
  useEffect(() => {
    fetchApps();
    fetchLayout();
  }, [fetchApps, fetchLayout]);

  // 点击外部关闭右键菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // 启动应用
  const launchApp = async (app: LaunchpadItem) => {
    try {
      const res = await fetch('http://localhost:3101/api/launchpad/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId: app.id }),
      });
      const result = await res.json();
      if (result.success) {
        setApps((prev) =>
          prev.map((a) =>
            a.id === app.id ? { ...a, usageCount: a.usageCount + 1 } : a
          )
        );
      }
    } catch (err) {
      console.error('Failed to launch app:', err);
    }
  };

  // 搜索应用
  const searchApps = async (query: string) => {
    if (!query) {
      fetchApps();
      return;
    }
    try {
      const res = await fetch(
        `http://localhost:3101/api/launchpad/search?q=${encodeURIComponent(query)}`
      );
      const data = await res.json();
      setApps(data.results || []);
    } catch (err) {
      console.error('Failed to search apps:', err);
    }
  };

  // 扫描应用
  const scanApps = async () => {
    setIsLoading(true);
    try {
      await fetch('http://localhost:3101/api/launchpad/scan', { method: 'POST' });
      fetchApps();
    } catch (err) {
      console.error('Failed to scan apps:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 右键菜单处理
  const handleContextMenu = (e: React.MouseEvent, app: LaunchpadItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      app,
    });
  };

  // 收藏/取消收藏
  const togglePin = async (app: LaunchpadItem) => {
    try {
      const action = app.pinned ? 'unpin' : 'pin';
      await fetch(`http://localhost:3101/api/launchpad/apps/${app.id}/${action}`, {
        method: 'POST',
      });
      fetchApps();
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  // 删除应用
  const deleteApp = async (app: LaunchpadItem) => {
    if (!confirm(`确定要删除 "${app.name}" 吗？`)) return;
    try {
      await fetch(`http://localhost:3101/api/launchpad/apps/${app.id}`, {
        method: 'DELETE',
      });
      fetchApps();
    } catch (err) {
      console.error('Failed to delete app:', err);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  // 打开编辑弹窗
  const openEditModal = (app: LaunchpadItem) => {
    setEditModal({
      visible: true,
      app,
      name: app.name,
      nameZh: app.nameZh || '',
      category: app.category || '',
    });
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  // 保存编辑
  const saveEdit = async () => {
    if (!editModal.app) return;
    try {
      await fetch(`http://localhost:3101/api/launchpad/apps/${editModal.app.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editModal.name,
          nameZh: editModal.nameZh,
          category: editModal.category,
        }),
      });
      fetchApps();
    } catch (err) {
      console.error('Failed to save edit:', err);
    }
    setEditModal((prev) => ({ ...prev, visible: false }));
  };

  // 创建文件夹
  const createFolder = async () => {
    if (createFolderModal.selectedApps.length < 2) {
      alert('请至少选择 2 个应用');
      return;
    }
    if (!createFolderModal.folderName.trim()) {
      alert('请输入文件夹名称');
      return;
    }
    try {
      await fetch('http://localhost:3101/api/launchpad/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createFolderModal.folderName,
          appIds: createFolderModal.selectedApps,
        }),
      });
      fetchApps();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
    setCreateFolderModal((prev) => ({ ...prev, visible: false }));
    setSelectMode(false);
    setSelectedAppIds(new Set());
  };

  // 删除文件夹
  const deleteFolder = async (folder: LaunchpadItem) => {
    if (!confirm(`确定要删除文件夹 "${folder.name}" 吗？应用将移出到主界面。`)) return;
    try {
      await fetch(`http://localhost:3101/api/launchpad/folders/${folder.id}`, {
        method: 'DELETE',
      });
      fetchApps();
    } catch (err) {
      console.error('Failed to delete folder:', err);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu.visible) {
          setContextMenu((prev) => ({ ...prev, visible: false }));
        } else if (editModal.visible) {
          setEditModal((prev) => ({ ...prev, visible: false }));
        } else if (createFolderModal.visible) {
          setCreateFolderModal((prev) => ({ ...prev, visible: false }));
        } else if (selectMode) {
          setSelectMode(false);
          setSelectedAppIds(new Set());
        } else if (selectedFolder) {
          setSelectedFolder(null);
        } else {
          onClose?.();
        }
      }
      if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        document.getElementById('launchpad-search')?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFolder, onClose, contextMenu.visible, editModal.visible, createFolderModal.visible, selectMode]);

  // 获取显示的应用列表
  const getDisplayApps = () => {
    if (selectedFolder) {
      return apps.filter((a) => a.parentId === selectedFolder.id);
    }
    // 主界面显示未隐藏且没有父文件夹的应用
    return apps.filter((a) => !a.hidden && !a.parentId);
  };

  // 获取收藏的应用
  const pinnedApps = apps.filter((a) => a.pinned && !a.hidden && !a.parentId);

  const displayApps = getDisplayApps();

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xl flex flex-col">
      {/* 搜索栏 */}
      <div className="flex justify-center pt-8 pb-4">
        <div className="relative flex items-center bg-white/10 rounded-full backdrop-blur-md px-4 py-3 w-96">
          <span className="text-white/50 mr-3">🔍</span>
          <input
            id="launchpad-search"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchApps(e.target.value);
            }}
            placeholder="搜索应用..."
            className="flex-1 bg-transparent text-white text-lg placeholder:text-white/50 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                fetchApps();
              }}
              className="text-white/50 hover:text-white/80 ml-2"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 overflow-auto p-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-white/50 text-lg">加载中...</div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            {/* 返回按钮 */}
            {selectedFolder && (
              <button
                onClick={() => setSelectedFolder(null)}
                className="mb-4 text-white/70 hover:text-white flex items-center gap-2"
              >
                ← 返回主界面
              </button>
            )}

            {/* 文件夹标题 */}
            {selectedFolder && (
              <h2 className="text-white text-xl mb-4">{selectedFolder.name}</h2>
            )}

            {/* 收藏栏 */}
            {!selectedFolder && pinnedApps.length > 0 && (
              <div className="mb-8">
                <h3 className="text-white/50 text-sm mb-3 text-center">收藏</h3>
                <div
                  className="grid gap-6 p-4 justify-center"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(pinnedApps.length, layout.columns)}, ${layout.iconSize + 32}px)`,
                  }}
                >
                  {pinnedApps.map((app) => (
                    <AppIcon
                      key={app.id}
                      app={app}
                      size={layout.iconSize}
                      showLabel={layout.showLabels}
                      selectMode={false}
                      selected={false}
                      onClick={() => launchApp(app)}
                      onContextMenu={(e) => handleContextMenu(e, app)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 选择模式提示 */}
            {selectMode && !selectedFolder && (
              <div className="mb-4 text-white/70 text-sm">
                已选择 {selectedAppIds.size} 个应用
                <button
                  onClick={() => {
                    setSelectMode(false);
                    setSelectedAppIds(new Set());
                  }}
                  className="ml-4 text-red-400 hover:text-red-300"
                >
                  取消选择
                </button>
                {selectedAppIds.size >= 2 && (
                  <button
                    onClick={() =>
                      setCreateFolderModal({
                        visible: true,
                        selectedApps: Array.from(selectedAppIds),
                        folderName: '',
                      })
                    }
                    className="ml-4 text-blue-400 hover:text-blue-300"
                  >
                    创建文件夹
                  </button>
                )}
              </div>
            )}

            {/* 应用网格 */}
            <div
              className="grid gap-6 p-4 justify-center"
              style={{
                gridTemplateColumns: `repeat(${layout.columns}, ${layout.iconSize + 32}px)`,
              }}
            >
              {displayApps.map((app) => (
                <AppIcon
                  key={app.id}
                  app={app}
                  size={layout.iconSize}
                  showLabel={layout.showLabels}
                  selectMode={selectMode}
                  selected={selectedAppIds.has(app.id)}
                  onClick={() => {
                    if (selectMode) {
                      const newSet = new Set(selectedAppIds);
                      if (newSet.has(app.id)) {
                        newSet.delete(app.id);
                      } else {
                        newSet.add(app.id);
                      }
                      setSelectedAppIds(newSet);
                    } else if (app.kind === 'folder') {
                      setSelectedFolder(app);
                    } else {
                      launchApp(app);
                    }
                  }}
                  onContextMenu={(e) => handleContextMenu(e, app)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部工具栏 */}
      <div className="flex justify-center pb-4 gap-4">
        <button
          onClick={() => {
            setSelectMode(!selectMode);
            setSelectedAppIds(new Set());
          }}
          className={`px-4 py-2 rounded-lg ${
            selectMode
              ? 'bg-blue-600 text-white'
              : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
          }`}
        >
          {selectMode ? '完成选择' : '选择应用'}
        </button>
        <button
          onClick={scanApps}
          className="px-4 py-2 bg-white/10 rounded-lg text-white/70 hover:bg-white/20 hover:text-white"
        >
          刷新
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-white/10 rounded-lg text-white/70 hover:bg-white/20 hover:text-white"
        >
          关闭
        </button>
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.app && (
        <div
          ref={contextMenuRef}
          className="fixed bg-gray-800/95 backdrop-blur-md rounded-lg shadow-xl py-2 min-w-[160px] z-60"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 180),
            top: Math.min(contextMenu.y, window.innerHeight - 200),
          }}
        >
          <ContextMenuItem
            icon={contextMenu.app.pinned ? '📌' : '📍'}
            label={contextMenu.app.pinned ? '取消收藏' : '添加收藏'}
            onClick={() => togglePin(contextMenu.app!)}
          />
          <ContextMenuItem
            icon="✏️"
            label="编辑"
            onClick={() => openEditModal(contextMenu.app!)}
          />
          {contextMenu.app.kind === 'folder' && (
            <ContextMenuItem
              icon="📂"
              label="打开文件夹"
              onClick={() => {
                    setSelectedFolder(contextMenu.app!);
                    setContextMenu((prev) => ({ ...prev, visible: false }));
                  }}
            />
          )}
          {contextMenu.app.kind === 'folder' && (
            <ContextMenuItem
              icon="🗑️"
              label="删除文件夹"
              danger
              onClick={() => deleteFolder(contextMenu.app!)}
            />
          )}
          {contextMenu.app.kind !== 'folder' && (
            <ContextMenuItem
              icon="🗑️"
              label="移除"
              danger
              onClick={() => deleteApp(contextMenu.app!)}
            />
          )}
        </div>
      )}

      {/* 创建文件夹弹窗 */}
      {createFolderModal.visible && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 w-80">
            <h3 className="text-white text-lg mb-4">创建文件夹</h3>
            <input
              type="text"
              value={createFolderModal.folderName}
              onChange={(e) =>
                setCreateFolderModal((prev) => ({ ...prev, folderName: e.target.value }))
              }
              placeholder="文件夹名称"
              className="w-full bg-white/10 rounded-lg px-4 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <p className="text-white/50 text-sm mb-4">
              将 {createFolderModal.selectedApps.length} 个应用放入文件夹
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setCreateFolderModal((prev) => ({ ...prev, visible: false }))
                }
                className="flex-1 px-4 py-2 bg-white/10 rounded-lg text-white/70 hover:bg-white/20"
              >
                取消
              </button>
              <button
                onClick={createFolder}
                className="flex-1 px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editModal.visible && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="bg-gray-800 rounded-xl p-6 w-80">
            <h3 className="text-white text-lg mb-4">编辑应用</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={editModal.name}
                onChange={(e) =>
                  setEditModal((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="名称"
                className="w-full bg-white/10 rounded-lg px-4 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={editModal.nameZh}
                onChange={(e) =>
                  setEditModal((prev) => ({ ...prev, nameZh: e.target.value }))
                }
                placeholder="中文名称"
                className="w-full bg-white/10 rounded-lg px-4 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={editModal.category}
                onChange={(e) =>
                  setEditModal((prev) => ({ ...prev, category: e.target.value }))
                }
                placeholder="分类"
                className="w-full bg-white/10 rounded-lg px-4 py-2 text-white placeholder:text-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setEditModal((prev) => ({ ...prev, visible: false }))}
                className="flex-1 px-4 py-2 bg-white/10 rounded-lg text-white/70 hover:bg-white/20"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                className="flex-1 px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 右键菜单项
 */
function ContextMenuItem({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: string;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2 text-left ${
        danger
          ? 'text-red-400 hover:bg-red-500/20'
          : 'text-white/90 hover:bg-white/10'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

/**
 * 应用图标组件
 */
function AppIcon({
  app,
  size,
  showLabel,
  selectMode,
  selected,
  onClick,
  onContextMenu,
}: {
  app: LaunchpadItem;
  size: number;
  showLabel: boolean;
  selectMode: boolean;
  selected: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  // 根据 kind 显示不同图标
  const getIconPlaceholder = () => {
    switch (app.kind) {
      case 'node-project':
        return '📦';
      case 'python-project':
        return '🐍';
      case 'script':
        return '📜';
      case 'folder':
        return '📁';
      default:
        return '📱';
    }
  };

  const iconSrc = app.icon
    ? app.icon.startsWith('data:') || app.icon.startsWith('http')
      ? app.icon
      : `http://localhost:3101/api/launchpad/apps/${app.id}/icon`
    : null;

  return (
    <div
      className={`flex flex-col items-center cursor-pointer select-none group relative ${
        selectMode ? 'p-1' : ''
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* 选择模式勾选框 */}
      {selectMode && (
        <div
          className={`absolute -top-1 -left-1 w-5 h-5 rounded-full border-2 flex items-center justify-center z-10 ${
            selected
              ? 'bg-blue-500 border-blue-500'
              : 'bg-transparent border-white/50'
          }`}
        >
          {selected && <span className="text-white text-xs">✓</span>}
        </div>
      )}

      {/* 图标容器 */}
      <div
        className={`relative rounded-xl overflow-hidden shadow-lg transition-all duration-200 group-hover:scale-110 group-hover:shadow-xl group-active:scale-95 ${
          selectMode && selected ? 'ring-2 ring-blue-500' : ''
        }`}
        style={{ width: size, height: size }}
      >
        {iconSrc ? (
          <img
            src={iconSrc}
            alt={app.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900 text-4xl">
            {getIconPlaceholder()}
          </div>
        )}

        {/* 更新徽章 */}
        {app.updateAvailable && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full" />
        )}

        {/* 收藏徽章 */}
        {app.pinned && !selectMode && (
          <div className="absolute -bottom-1 -right-1 w-4 h-4 flex items-center justify-center">
            📌
          </div>
        )}
      </div>

      {/* 标签 */}
      {showLabel && (
        <div className="mt-2 text-center max-w-[100px]">
          <p className="text-sm text-white/90 truncate">
            {app.nameZh || app.name}
          </p>
          {app.kind !== 'macos-app' && app.kind !== 'folder' && (
            <p className="text-xs text-white/50">{app.kind}</p>
          )}
        </div>
      )}
    </div>
  );
}
