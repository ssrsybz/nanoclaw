import { useStore } from '../../store';

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ContextTab() {
  const contextAttachments = useStore((s) => s.contextAttachments);
  const removeContextAttachment = useStore((s) => s.removeContextAttachment);
  const clearContextAttachments = useStore((s) => s.clearContextAttachments);
  const setResourcePanelTab = useStore((s) => s.setResourcePanelTab);

  if (contextAttachments.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-5 text-center">
        <div className="text-3xl mb-3">📎</div>
        <div className="text-sm font-medium text-ink-sub">暂无上下文文件</div>
        <p className="text-xs text-ink-faint mt-2 leading-relaxed">
          在项目文件中选择文件并加入上下文，它会随下一条消息发送给 Agent。
        </p>
        <button
          onClick={() => setResourcePanelTab('files')}
          className="mt-4 px-3 py-1.5 rounded-lg bg-accent-soft text-accent hover:bg-accent/20 text-xs transition-colors"
        >
          去选择项目文件
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-line-soft">
        <div className="text-sm font-semibold text-ink">当前上下文</div>
        <div className="text-[10px] text-ink-faint mt-1">
          将随下一条消息发送给 Agent · 当前版本暂支持 1 个文件
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
        {contextAttachments.map((attachment) => (
          <div key={attachment.fileId} className="rounded-lg bg-surface border border-line-soft p-3">
            <div className="flex items-start gap-2">
              <div className="w-7 h-7 rounded-md bg-accent-soft text-accent flex items-center justify-center text-xs flex-shrink-0">
                📄
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate" title={attachment.filename}>{attachment.filename}</div>
                <div className="text-[10px] text-ink-faint truncate mt-0.5" title={attachment.relativePath || attachment.filePath}>
                  {attachment.relativePath || attachment.filePath}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2 text-[10px] text-ink-faint">
                  <span className="px-1.5 py-0.5 rounded bg-black/5">
                    {attachment.source === 'workspace-file' ? '项目文件' : '上传附件'}
                  </span>
                  {attachment.size !== undefined && (
                    <span className="px-1.5 py-0.5 rounded bg-black/5">{formatBytes(attachment.size)}</span>
                  )}
                  {attachment.truncated && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">已截断</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeContextAttachment(attachment.fileId)}
                className="text-ink-faint hover:text-red-500 transition-colors text-sm"
                title="移除上下文"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-line-soft space-y-2">
        <button
          onClick={clearContextAttachments}
          className="w-full px-3 py-2 rounded-lg bg-surface border border-line-soft text-xs text-ink-sub hover:text-ink hover:bg-black/5 transition-colors"
        >
          清空上下文
        </button>
        <p className="text-[10px] text-ink-faint leading-relaxed">
          发送消息后，上下文会自动清空，避免误带到下一轮对话。
        </p>
      </div>
    </div>
  );
}
