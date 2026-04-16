import { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store';

// ============ Add Workspace Modal ============
function AddWorkspaceModal({ onClose }: { onClose: () => void }) {
  const addWorkspace = useStore((s) => s.addWorkspace);
  const [tab, setTab] = useState<'input' | 'browse'>('input');
  const [inputPath, setInputPath] = useState('');
  const [loading, setLoading] = useState(false);

  // Browse state
  const [currentDir, setCurrentDir] = useState('/');
  const [directories, setDirectories] = useState<{ name: string; path: string }[]>([]);
  const [dirLoading, setDirLoading] = useState(false);

  const fetchDirectories = useCallback(async (dirPath: string) => {
    setDirLoading(true);
    try {
      const res = await fetch(`/api/directory-list?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      setCurrentDir(data.path);
      setDirectories(data.directories || []);
    } catch {
      setDirectories([]);
    } finally {
      setDirLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'browse') {
      fetchDirectories('/');
    }
  }, [tab, fetchDirectories]);

  const handleSubmit = async () => {
    const wsPath = tab === 'input' ? inputPath.trim() : currentDir;
    if (!wsPath) return;
    setLoading(true);
    await addWorkspace(wsPath);
    setLoading(false);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-[420px] bg-[#1a1a2e] border border-white/10 rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-sm">添加工作空间</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-lg">&times;</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setTab('input')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === 'input' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-white/40 hover:text-white/60'
            }`}
          >
            手动输入路径
          </button>
          <button
            onClick={() => setTab('browse')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === 'browse' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-white/40 hover:text-white/60'
            }`}
          >
            浏览服务器目录
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {tab === 'input' ? (
            <div>
              <label className="block text-xs text-white/50 mb-2">输入服务器上的目录路径</label>
              <input
                type="text"
                value={inputPath}
                onChange={(e) => setInputPath(e.target.value)}
                placeholder="/home/admin1/my-project"
                className="w-full px-3 py-2.5 bg-[#0f0f1a] border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500 placeholder:text-white/20"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && inputPath.trim()) handleSubmit(); }}
              />
            </div>
          ) : (
            <div>
              {/* Current path + parent button */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => {
                    const parent = currentDir.split('/').slice(0, -1).join('/') || '/';
                    fetchDirectories(parent);
                  }}
                  className="px-2 py-1 text-xs text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded transition-colors"
                  title="上级目录"
                >
                  ..
                </button>
                <div className="flex-1 px-3 py-1.5 bg-[#0f0f1a] border border-white/10 rounded text-xs text-white/70 font-mono truncate">
                  {currentDir}
                </div>
              </div>

              {/* Directory list */}
              <div className="h-56 overflow-y-auto rounded-lg border border-white/10 bg-[#0f0f1a]">
                {dirLoading ? (
                  <div className="flex items-center justify-center h-full text-white/30 text-xs">加载中...</div>
                ) : directories.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-white/30 text-xs">无子目录</div>
                ) : (
                  <div className="py-1">
                    {directories.map((dir) => (
                      <button
                        key={dir.path}
                        onClick={() => fetchDirectories(dir.path)}
                        className="w-full text-left px-3 py-2 text-xs text-white/70 hover:text-white hover:bg-indigo-600/20 transition-colors flex items-center gap-2"
                      >
                        <span className="text-white/30">📁</span>
                        <span className="truncate">{dir.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-white/50 hover:text-white transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (tab === 'input' && !inputPath.trim())}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
          >
            {loading ? '添加中...' : tab === 'browse' ? '选择此目录' : '确认'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ Main Sidebar ============
export default function WorkspaceSidebar() {
  const {
    workspaces,
    activeWorkspaceId,
    conversations,
    activeConversationId,
    connected,
    removeWorkspace,
    switchWorkspace,
    switchConversation,
    createConversation,
    deleteConversation,
    renameConversation,
  } = useStore();

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeWorkspace(id);
  };

  const handleDeleteConversation = (e: React.MouseEvent, workspaceId: string, conversationId: string) => {
    e.stopPropagation();
    if (window.confirm('删除此对话？')) {
      deleteConversation(workspaceId, conversationId);
    }
  };

  const handleStartRename = (e: React.MouseEvent, _workspaceId: string, conversationId: string, currentName: string) => {
    e.stopPropagation();
    setEditingId(conversationId);
    setEditingName(currentName);
  };

  const handleFinishRename = (workspaceId: string, conversationId: string) => {
    if (editingName.trim()) {
      renameConversation(workspaceId, conversationId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, workspaceId: string, conversationId: string) => {
    if (e.key === 'Enter') {
      handleFinishRename(workspaceId, conversationId);
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditingName('');
    }
  };

  const handleNewConversation = (e: React.MouseEvent, workspaceId: string) => {
    e.stopPropagation();
    createConversation(workspaceId);
  };

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
    <>
      {showAddModal && <AddWorkspaceModal onClose={() => setShowAddModal(false)} />}

      <div className="w-60 flex-shrink-0 flex flex-col bg-[#16213e] border-r border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">NanoClaw</span>
            <span
              className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
              title={connected ? 'Connected' : 'Disconnected'}
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-lg transition-colors"
            title="添加工作空间"
          >
            +
          </button>
        </div>

        {/* Workspace list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {workspaces.length === 0 && (
            <div className="text-center text-white/30 text-sm py-8 px-4">
              点击 + 添加工作空间
            </div>
          )}
          {workspaces.map((ws) => {
            const isActive = ws.id === activeWorkspaceId;
            const wsConversations = conversations[ws.id] || [];
            const isHovered = hoveredId === ws.id;

            return (
              <div key={ws.id}>
                {/* Workspace item */}
                <div
                  onClick={() => switchWorkspace(ws.id)}
                  onMouseEnter={() => setHoveredId(ws.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`relative p-3 rounded-lg cursor-pointer transition-colors group ${
                    isActive
                      ? 'bg-indigo-600/20 border border-indigo-500/50'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="font-medium text-sm text-white truncate">{ws.name}</div>
                  <div className="text-xs text-white/40 truncate mt-0.5">{ws.path}</div>
                  {isHovered && (
                    <button
                      onClick={(e) => handleRemove(e, ws.id)}
                      className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 text-xs transition-colors"
                      title="Remove workspace (files will not be deleted)"
                    >
                      x
                    </button>
                  )}
                </div>

                {/* Conversations for active workspace */}
                {isActive && (
                  <div className="ml-2 mt-1 space-y-0.5">
                    {wsConversations.length === 0 && (
                      <div className="text-xs text-white/30 py-2 px-3">
                        No conversations
                      </div>
                    )}
                    {wsConversations.map((conv) => {
                      const isConvActive = conv.id === activeConversationId;
                      const isEditing = editingId === conv.id;

                      if (isEditing) {
                        return (
                          <input
                            key={conv.id}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={() => handleFinishRename(ws.id, conv.id)}
                            onKeyDown={(e) => handleKeyDown(e, ws.id, conv.id)}
                            className="w-full px-3 py-1.5 text-xs bg-white/10 border border-indigo-500/50 rounded text-white outline-none"
                            autoFocus
                          />
                        );
                      }

                      return (
                        <div
                          key={conv.id}
                          onClick={() => switchConversation(conv.id)}
                          className={`group relative flex items-center justify-between px-3 py-1.5 rounded cursor-pointer transition-colors ${
                            isConvActive
                              ? 'bg-indigo-600/30 text-white'
                              : 'hover:bg-white/5 text-white/70'
                          }`}
                        >
                          <span
                            className="text-xs truncate flex-1"
                            onDoubleClick={(e) => handleStartRename(e, ws.id, conv.id, conv.name)}
                          >
                            {conv.name}
                          </span>
                          <div className="hidden group-hover:flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleStartRename(e, ws.id, conv.id, conv.name); }}
                              className="w-4 h-4 flex items-center justify-center text-white/30 hover:text-white text-xs"
                              title="Rename"
                            >
                              +
                            </button>
                            <button
                              onClick={(e) => handleDeleteConversation(e, ws.id, conv.id)}
                              className="w-4 h-4 flex items-center justify-center text-white/30 hover:text-red-400 text-xs"
                              title="Delete"
                            >
                              x
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    {/* New conversation button */}
                    <button
                      onClick={(e) => handleNewConversation(e, ws.id)}
                      className="w-full flex items-center gap-1 px-3 py-1.5 text-xs text-white/40 hover:text-white hover:bg-white/5 rounded cursor-pointer transition-colors"
                    >
                      <span className="w-4 h-4 flex items-center justify-center">+</span>
                      <span>新对话</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Active workspace info */}
        {activeWorkspace && (
          <div className="p-3 border-t border-white/10">
            <div className="text-xs text-white/50 truncate">
              {activeWorkspace.name}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
