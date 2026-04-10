import { useState } from 'react';
import { useStore } from '../store';

export default function WorkspaceSidebar() {
  const { workspaces, activeWorkspaceId, connected, addWorkspace, removeWorkspace, switchWorkspace } = useStore();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleRemove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeWorkspace(id);
  };

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
          return (
            <div
              key={ws.id}
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
              {hoveredId === ws.id && (
                <button
                  onClick={(e) => handleRemove(e, ws.id)}
                  className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-white/30 hover:text-red-400 hover:bg-red-400/10 text-xs transition-colors"
                  title="Remove workspace (files will not be deleted)"
                >
                  x
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
