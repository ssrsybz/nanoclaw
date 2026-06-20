import { useEffect, useMemo, useState } from 'react';
import { useStore, type AttachmentInfo, type ProjectFileEntry, type ProjectFilePreview } from '../../store';

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parentPath(path: string): string {
  if (!path || path === '.') return '.';
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  return parts.length ? parts.join('/') : '.';
}

function fileIcon(entry: ProjectFileEntry): string {
  if (entry.type === 'directory') return '📁';
  const ext = entry.extension || '';
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) return 'TS';
  if (ext === '.md') return 'MD';
  if (ext === '.json') return '{}';
  if (['.pdf', '.docx', '.xlsx'].includes(ext)) return 'DOC';
  return 'TXT';
}

function PreviewBlock({ preview }: { preview: ProjectFilePreview }) {
  const text = preview.content || preview.extractedText || preview.reason || '暂无可预览内容';
  return (
    <pre className="text-[11px] text-ink-sub whitespace-pre-wrap font-mono leading-relaxed bg-inset border border-line-soft rounded-lg p-2 max-h-56 overflow-auto">
      {text}
    </pre>
  );
}

export default function ProjectFilesTab({ workspaceId }: { workspaceId: string }) {
  const addContextAttachment = useStore((s) => s.addContextAttachment);
  const contextAttachments = useStore((s) => s.contextAttachments);
  const [currentPath, setCurrentPath] = useState('.');
  const [entries, setEntries] = useState<ProjectFileEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [selected, setSelected] = useState<ProjectFileEntry | null>(null);
  const [preview, setPreview] = useState<ProjectFilePreview | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [addingContext, setAddingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAlreadyAttached = useMemo(() => {
    if (!selected) return false;
    return contextAttachments.some((a) => a.relativePath === selected.relativePath || a.filePath === selected.relativePath);
  }, [contextAttachments, selected]);

  const loadFiles = async (path = currentPath) => {
    setLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams({ path });
      const res = await fetch(`/api/workspaces/${workspaceId}/files?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载项目文件失败');
      setCurrentPath(data.path || '.');
      setEntries(data.entries || []);
      setTruncated(Boolean(data.truncated));
      setSelected(null);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载项目文件失败');
    } finally {
      setLoadingList(false);
    }
  };

  const loadPreview = async (entry: ProjectFileEntry) => {
    setSelected(entry);
    setPreview(null);
    setError(null);
    if (entry.type === 'directory') {
      await loadFiles(entry.relativePath);
      return;
    }
    setLoadingPreview(true);
    try {
      const params = new URLSearchParams({ path: entry.relativePath });
      const res = await fetch(`/api/workspaces/${workspaceId}/files/preview?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载文件预览失败');
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载文件预览失败');
    } finally {
      setLoadingPreview(false);
    }
  };

  const addToContext = async () => {
    if (!selected || !preview?.canAttach) return;
    setAddingContext(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/files/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selected.relativePath }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加入上下文失败');
      addContextAttachment(data.attachment as AttachmentInfo);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加入上下文失败');
    } finally {
      setAddingContext(false);
    }
  };

  useEffect(() => {
    setCurrentPath('.');
    loadFiles('.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-3 py-2 border-b border-line-soft space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadFiles(parentPath(currentPath))}
            disabled={currentPath === '.' || loadingList}
            className="w-7 h-7 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="返回上级"
          >
            ←
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-ink truncate" title={currentPath}>/{currentPath === '.' ? '' : currentPath}</div>
            <div className="text-[10px] text-ink-faint">当前工作空间项目文件</div>
          </div>
          <button
            onClick={() => loadFiles(currentPath)}
            disabled={loadingList}
            className="w-7 h-7 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-black/5 disabled:opacity-30 transition-colors"
            title="刷新"
          >
            ↻
          </button>
        </div>
        {selected && preview && (
          <button
            onClick={() => { setSelected(null); setPreview(null); }}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            ← 返回文件列表
          </button>
        )}
      </div>

      {error && (
        <div className="mx-3 mt-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {selected && (loadingPreview || preview) ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-surface border border-line-soft p-3">
              <div className="text-sm font-medium text-ink truncate" title={selected.relativePath}>{selected.name}</div>
              <div className="text-[10px] text-ink-faint truncate mt-0.5" title={selected.relativePath}>{selected.relativePath}</div>
              <div className="text-[10px] text-ink-faint mt-1">
                {preview ? `${preview.type} · ${formatBytes(preview.size)}${preview.truncated ? ' · 已截断' : ''}` : '加载中...'}
              </div>
            </div>

            {loadingPreview ? (
              <div className="text-center text-xs text-ink-faint py-6">加载预览中...</div>
            ) : preview ? (
              <>
                <PreviewBlock preview={preview} />
                {preview.reason && (
                  <div className="text-xs text-ink-faint bg-black/5 rounded-md px-3 py-2">{preview.reason}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={addToContext}
                    disabled={!preview.canAttach || addingContext || selectedAlreadyAttached}
                    className="flex-1 px-3 py-2 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {selectedAlreadyAttached ? '已加入上下文' : addingContext ? '加入中...' : '加入上下文'}
                  </button>
                  <button
                    onClick={() => navigator.clipboard?.writeText(selected.relativePath)}
                    className="px-3 py-2 rounded-lg bg-surface border border-line-soft text-xs text-ink-sub hover:text-ink hover:bg-black/5 transition-colors"
                  >
                    复制路径
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : loadingList ? (
          <div className="text-center text-xs text-ink-faint py-8">加载项目文件中...</div>
        ) : entries.length === 0 ? (
          <div className="text-center text-xs text-ink-faint py-8">当前目录为空</div>
        ) : (
          <div className="space-y-1">
            {entries.map((entry) => (
              <button
                key={entry.relativePath}
                onClick={() => loadPreview(entry)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-left hover:bg-black/5 transition-colors group"
              >
                <span className="w-7 text-[10px] text-center text-ink-faint font-mono flex-shrink-0">
                  {fileIcon(entry)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-ink truncate">{entry.name}</span>
                  {entry.type === 'file' && (
                    <span className="block text-[10px] text-ink-faint">{formatBytes(entry.size)}{!entry.previewable ? ' · 不可预览' : ''}</span>
                  )}
                </span>
                {entry.type === 'directory' && <span className="text-xs text-ink-faint">›</span>}
              </button>
            ))}
            {truncated && (
              <div className="px-2 py-2 text-[10px] text-ink-faint">目录过大，仅显示前部分文件</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
