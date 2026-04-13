import { useState } from 'react';
import { useStore } from '../store';

export default function WorkspaceSidebar() {
  const {
    workspaces,
    activeWorkspaceId,
    conversations,
    activeConversationId,
    connected,
    addWorkspace,
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

  const handleStartRename = (e: React.MouseEvent, workspaceId: string, conversationId: string, currentName: string) => {
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

  const activeWorkspaceConversations = activeWorkspaceId ? (conversations[activeWorkspaceId] || []) : [];
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  return (
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
          onClick={addWorkspace}
          className="w-7 h-7 flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-lg transition-colors"
          title="Add workspace"
        >
          +
        </button>
      </div>

      {/* Workspace list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {workspaces.length === 0 && (
          <div className="text-center text-white/30 text-sm py-8 px-4">
            Add a workspace to get started
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
  );
}
