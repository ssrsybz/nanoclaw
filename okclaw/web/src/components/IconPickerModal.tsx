import { useState, useEffect, useRef, useCallback } from 'react';

interface IconPickerModalProps {
  /** Called when user confirms a selection. Receives: "iconify:prefix:name", raw SVG, or null (clear). */
  onSelect: (icon: string | null) => void;
  /** Called when user dismisses the modal without selecting. */
  onClose: () => void;
  /** Current icon value (for preview / clear context). */
  currentIcon?: string | null;
}

/** Popular Iconify collections for the filter dropdown. */
const COLLECTIONS = [
  { value: '', label: '全部集合' },
  { value: 'lucide', label: 'Lucide' },
  { value: 'mdi', label: 'Material Design' },
  { value: 'tabler', label: 'Tabler' },
  { value: 'heroicons', label: 'Heroicons' },
  { value: 'ph', label: 'Phosphor' },
  { value: 'ri', label: 'Remix Icon' },
  { value: 'carbon', label: 'Carbon' },
  { value: 'solar', label: 'Solar' },
  { value: 'mingcute', label: 'MingCute' },
  { value: 'fluent', label: 'Fluent' },
];

const DEBOUNCE_MS = 300;
const SEARCH_LIMIT = 48;

/**
 * Modal dialog for selecting a workspace icon.
 *
 * Features:
 * - Search Iconify library (debounced, proxied via backend)
 * - Filter by icon collection
 * - Custom SVG file upload
 * - Clear icon button
 * - Live preview of selected icon
 */
export default function IconPickerModal({ onSelect, onClose, currentIcon }: IconPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collection, setCollection] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [selectedIconSvg, setSelectedIconSvg] = useState<string | null>(null);
  const [customSvg, setCustomSvg] = useState<string | null>(null);
  const [customSvgName, setCustomSvgName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ query: searchQuery, limit: String(SEARCH_LIMIT) });
      if (collection) params.set('prefix', collection);
      fetch(`/api/icons/search?${params}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('搜索失败'))))
        .then((data) => setSearchResults(data.icons || []))
        .catch((err) => {
          setSearchResults([]);
          setError(err.message || '搜索失败，请稍后重试');
        })
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, collection]);

  // Fetch SVG for selected icon
  const handleSelectIcon = useCallback(async (iconName: string) => {
    setSelectedIcon(iconName);
    setCustomSvg(null);
    setCustomSvgName('');
    setSelectedIconSvg(null);
    try {
      const res = await fetch(`/api/icons/svg?icon=${encodeURIComponent(iconName)}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedIconSvg(data.svg);
      }
    } catch {
      // Preview failure is non-critical; confirm will still work
    }
  }, []);

  // Custom SVG upload handler
  const handleSvgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.svg')) {
      setError('仅支持 .svg 文件');
      return;
    }
    if (file.size > 100 * 1024) {
      setError('SVG 文件过大（最大 100KB）');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCustomSvg(text);
      setSelectedIcon(null);
      setSelectedIconSvg(null);
      setCustomSvgName(file.name);
      setError(null);
    };
    reader.readAsText(file);
  };

  // Confirm selection
  const handleConfirm = () => {
    if (selectedIcon) {
      onSelect(`iconify:${selectedIcon}`);
    } else if (customSvg) {
      onSelect(customSvg);
    } else {
      onSelect(null);
    }
  };

  // Click outside to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // ESC to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const hasSelection = selectedIcon || customSvg;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={handleOverlayClick}
    >
      <div
        ref={modalRef}
        className="bg-surface rounded-xl shadow-2xl border border-line w-[520px] max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h2 className="text-base font-semibold text-ink">选择图标</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-ink-faint hover:text-ink hover:bg-black/5 text-sm"
          >
            ✕
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-line flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索图标（至少 2 个字符）"
            className="flex-1 px-3 py-2 text-sm bg-app border border-line rounded-lg text-ink placeholder:text-ink-faint outline-none focus:border-accent"
            autoFocus
          />
          <select
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="px-2 py-2 text-sm bg-app border border-line rounded-lg text-ink outline-none focus:border-accent"
          >
            {COLLECTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Results grid */}
        <div className="flex-1 overflow-y-auto px-5 py-3 min-h-[200px]">
          {loading && (
            <div className="flex items-center justify-center py-8 text-ink-faint text-sm">
              搜索中...
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-8 text-red-500 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="flex items-center justify-center py-8 text-ink-faint text-sm">
              未找到匹配的图标
            </div>
          )}

          {!loading && searchQuery.length < 2 && (
            <div className="flex items-center justify-center py-8 text-ink-faint text-sm">
              输入关键词搜索图标
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="grid grid-cols-6 gap-2">
              {searchResults.map((iconName) => {
                const [prefix, name] = iconName.split(':');
                const isSelected = selectedIcon === iconName;
                return (
                  <button
                    key={iconName}
                    onClick={() => handleSelectIcon(iconName)}
                    className={`p-2 rounded-lg border transition-colors flex flex-col items-center ${
                      isSelected
                        ? 'border-accent bg-accent-soft'
                        : 'border-transparent hover:border-line hover:bg-black/5'
                    }`}
                    title={iconName}
                  >
                    <img
                      src={`https://api.iconify.design/${prefix}/${name}.svg?color=%23666`}
                      alt={name}
                      className="w-6 h-6"
                      loading="lazy"
                    />
                    <span className="text-[9px] text-ink-faint mt-1 truncate w-full text-center leading-tight">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom SVG upload */}
        <div className="px-5 py-3 border-t border-line">
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-faint shrink-0">或上传自定义 SVG</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".svg"
              onChange={handleSvgUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs border border-line rounded-lg text-ink-faint hover:text-ink hover:bg-black/5 transition-colors"
            >
              📄 选择文件
            </button>
            {customSvg && (
              <span className="text-xs text-ink-sub truncate">{customSvgName}</span>
            )}
          </div>
        </div>

        {/* Preview + Footer */}
        <div className="px-5 py-4 border-t border-line flex items-center justify-between">
          {/* Preview */}
          <div className="flex items-center gap-3">
            {hasSelection ? (
              <>
                <div
                  className="w-10 h-10 flex items-center justify-center rounded-lg bg-accent-soft overflow-hidden"
                  dangerouslySetInnerHTML={{
                    __html: selectedIconSvg || customSvg || '',
                  }}
                />
                <span className="text-xs text-ink-sub">
                  {selectedIcon ? selectedIcon.split(':')[1] : customSvgName}
                </span>
              </>
            ) : (
              <span className="text-xs text-ink-faint">未选择图标</span>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {currentIcon && (
              <button
                onClick={() => onSelect(null)}
                className="px-3 py-1.5 text-xs border border-line rounded-lg text-ink-faint hover:text-red-500 hover:border-red-300 transition-colors"
              >
                清除
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-line rounded-lg text-ink-faint hover:text-ink hover:bg-black/5 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!hasSelection}
              className="px-4 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              确认
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
