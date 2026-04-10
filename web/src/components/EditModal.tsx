import { useState, useEffect } from 'react';

interface EditModalProps {
  workspaceId: string;
  skillName: string | null; // null means editing CLAUDE.md
  onClose: () => void;
  onSaved?: () => void;
}

export default function EditModal({ workspaceId, skillName, onClose, onSaved }: EditModalProps) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const title = skillName ? `Edit: ${skillName}` : 'Edit: CLAUDE.md';

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const url = skillName
          ? `/api/workspaces/${workspaceId}/skills/${encodeURIComponent(skillName)}`
          : `/api/workspaces/${workspaceId}/claude-md`;
        const res = await fetch(url);
        const data = await res.json();
        setContent(data.content || '');
      } catch (err) {
        console.error('Failed to fetch content:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, [workspaceId, skillName]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = skillName
        ? `/api/workspaces/${workspaceId}/skills/${encodeURIComponent(skillName)}`
        : `/api/workspaces/${workspaceId}/claude-md`;
      await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Failed to save:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-3xl mx-4 bg-[#16213e] rounded-xl shadow-2xl border border-white/10 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h2 className="text-white font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            x
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4">
          {loading ? (
            <div className="text-white/30 text-center py-8">Loading...</div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full min-h-[400px] bg-[#1a1a2e] text-white/90 font-mono text-sm p-4 rounded-lg border border-white/10 resize-y focus:outline-none focus:border-indigo-500/50"
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
