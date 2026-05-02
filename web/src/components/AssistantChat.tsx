import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
} from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useChatRuntime } from '../useChatRuntime';
import { useStore, type ContentPart, type Skill, type SkillCategory } from '../store';
import { getRandomThinkingVerb } from '../utils/thinking-verbs';

// Extracted markdown components to avoid re-creating on each render
const markdownComponents = {
  code(props: any) {
    const { children, className, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    const inline = !match;
    return inline ? (
      <code className="bg-[#0f0f1a] text-indigo-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono" {...rest}>
        {children}
      </code>
    ) : (
      <SyntaxHighlighter
        style={oneDark}
        language={match[1]}
        PreTag="div"
        className="!bg-[#0f0f1a] !rounded-lg !my-2 !border !border-white/10"
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    );
  },
  pre({ children }: any) {
    return <>{children}</>;
  },
  a({ href, children }: any) {
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{children}</a>;
  },
  blockquote({ children }: any) {
    return <blockquote className="border-l-3 border-indigo-500 pl-3 my-2 text-white/60">{children}</blockquote>;
  },
};

function Thread() {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <ThreadPrimitive.Root className="flex-1 flex flex-col min-w-0">
      <ThreadPrimitive.Viewport ref={viewportRef} className="flex-1 overflow-y-auto px-5 py-4">
        <ThreadPrimitive.Empty>
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-4xl mb-4">🐾</div>
              <h2 className="text-lg font-semibold text-white/60">OKClaw</h2>
              <p className="text-white/30 mt-2 text-sm">发消息开始对话</p>
            </div>
          </div>
        </ThreadPrimitive.Empty>
        {/* Render messages from store directly for full Markdown support */}
        <MessageList viewportRef={viewportRef} />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}

function MessageList({ viewportRef }: { viewportRef: React.RefObject<HTMLDivElement | null> }) {
  const messages = useStore((s) =>
    s.activeConversationId ? s.messages[s.activeConversationId] : undefined
  ) || [];
  const activeConversationId = useStore((s) => s.activeConversationId);
  const isRunning = useStore((s) => activeConversationId ? s.isTyping(activeConversationId) : false);
  const streamingThinking = useStore((s) => s.streamingThinking);
  const setStreamingThinking = useStore((s) => s.setStreamingThinking);

  // Check if streaming thinking should be visible (streaming or within 30s timeout)
  const isStreamingThinkingVisible = useMemo(() => {
    if (!streamingThinking) return false;
    if (streamingThinking.isStreaming) return true;
    if (streamingThinking.streamingEndedAt) {
      return Date.now() - streamingThinking.streamingEndedAt < 30000;
    }
    return false;
  }, [streamingThinking]);

  // Auto-hide completed streaming thinking after 30s
  useEffect(() => {
    if (streamingThinking && !streamingThinking.isStreaming && streamingThinking.streamingEndedAt) {
      const elapsed = Date.now() - streamingThinking.streamingEndedAt;
      const remaining = 30000 - elapsed;
      if (remaining > 0) {
        const timer = setTimeout(() => setStreamingThinking(() => null), remaining);
        return () => clearTimeout(timer);
      } else {
        setStreamingThinking(() => null);
      }
    }
  }, [streamingThinking, setStreamingThinking]);

  const lastUserMessageIndexRef = useRef(-1);
  const isUserScrollingRef = useRef(false);

  const [stickyUserIndex, setStickyUserIndex] = useState<number | null>(null);
  const prevStickyIndexRef = useRef<number | null>(null);

  const elementIndexMap = useRef<Map<Element, number>>(new Map());
  const visibilityRef = useRef<Map<number, { isInViewport: boolean; isAboveTop: boolean }>>(new Map());

  const updateSticky = useCallback(() => {
    for (let i = messages.length - 2; i >= 0; i--) {
      if (messages[i].role !== 'user') continue;
      if (messages[i + 1]?.role !== 'assistant') continue;

      const userState = visibilityRef.current.get(i);
      const assistantState = visibilityRef.current.get(i + 1);

      if (userState?.isAboveTop && assistantState?.isInViewport) {
        if (prevStickyIndexRef.current !== i) {
          prevStickyIndexRef.current = i;
          setStickyUserIndex(i);
        }
        return;
      }
    }

    if (prevStickyIndexRef.current !== null) {
      prevStickyIndexRef.current = null;
      setStickyUserIndex(null);
    }
  }, [messages]);

  useEffect(() => {
    const container = viewportRef.current;
    if (!container || messages.length === 0) return;

    visibilityRef.current.clear();
    elementIndexMap.current.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const ent of entries) {
          const idx = elementIndexMap.current.get(ent.target);
          if (idx === undefined) continue;

          const isUser = messages[idx]?.role === 'user';
          const rect = ent.boundingClientRect;
          const containerRect = container.getBoundingClientRect();

          visibilityRef.current.set(idx, {
            isInViewport: ent.isIntersecting,
            isAboveTop: isUser && rect.bottom < containerRect.top + 60,
          });
        }
        updateSticky();
      },
      { root: container, threshold: 0 }
    );

    requestAnimationFrame(() => {
      const msgElements = container.querySelectorAll('[data-msg-idx]');
      msgElements.forEach((el) => {
        const idx = parseInt(el.getAttribute('data-msg-idx') || '', 10);
        if (!isNaN(idx)) {
          elementIndexMap.current.set(el, idx);
          observer.observe(el);
        }
      });
    });

    return () => observer.disconnect();
  }, [messages, viewportRef, updateSticky]);

  useEffect(() => {
    if (messages.length === 0) return;

    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    const prevUserIdx = lastUserMessageIndexRef.current;

    if (lastUserIdx > prevUserIdx && lastUserIdx >= 0) {
      isUserScrollingRef.current = false;
    } else if (isRunning && !isUserScrollingRef.current) {
      viewportRef.current?.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }

    lastUserMessageIndexRef.current = lastUserIdx;
  }, [messages, isRunning, viewportRef]);

  // Detect current tool operation from the last assistant message's parts
  const currentOperation = useMemo(() => {
    if (!streamingThinking?.isStreaming) return undefined;
    if (messages.length === 0) return undefined;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role !== 'assistant' || !lastMsg.parts) return undefined;
    for (let i = lastMsg.parts.length - 1; i >= 0; i--) {
      const p = lastMsg.parts[i];
      if (p.type === 'tool_use') {
        const status = p.toolMeta?.status;
        if (status === 'running' || status === 'pending') {
          return p.toolMeta?.displayText || p.toolName;
        }
      }
    }
    return undefined;
  }, [messages, streamingThinking?.isStreaming]);

  if (messages.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Streaming thinking indicator (like Claude Code's isStreamingThinkingVisible) */}
      {isStreamingThinkingVisible && streamingThinking && (
        <div className="flex justify-start">
          <div className="bg-[#16213e] border border-white/5 px-4 py-3 rounded-2xl rounded-bl-md max-w-[85%]">
            {streamingThinking.isStreaming ? (
              <ThinkingSpinner currentOperation={currentOperation} />
            ) : (
              <ThinkingBlock text={streamingThinking.thinking} status="complete" />
            )}
          </div>
        </div>
      )}

      {/* 消息列表 */}
      {messages.map((msg, i) => {
        const isSticky = i === stickyUserIndex;

        return msg.role === 'user' ? (
          <div
            key={i}
            data-msg-idx={i}
            className={`transition-all duration-300 ease-out ${
              isSticky
                ? 'sticky top-0 z-10 pt-2 pb-1'
                : 'flex justify-end'
            }`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 text-white text-sm whitespace-pre-wrap transition-all duration-300 ${
                isSticky
                  ? 'rounded-xl bg-indigo-600/90 backdrop-blur-sm shadow-lg shadow-indigo-600/20 py-2'
                  : 'rounded-2xl rounded-br-md bg-indigo-600'
              }`}
            >
              {msg.attachment && (
                <div className="flex items-center gap-1.5 mb-1 pb-1.5 border-b border-white/20">
                  <span>📄</span>
                  <span className="text-white/80 text-xs">{msg.attachment.filename}</span>
                </div>
              )}
              {msg.content}
            </div>
          </div>
        ) : (
          <div key={i} data-msg-idx={i}>
            <AssistantMessage parts={msg.parts} content={msg.content} model={msg.model} apiCalls={msg.apiCalls} />
          </div>
        );
      })}

    </div>
  );
}

// 工具状态颜色映射（提取复用）
const TOOL_STATUS_COLORS = {
  pending: 'border-amber-500/20 bg-amber-500/5 text-amber-400/80',
  running: 'border-blue-500/20 bg-blue-500/5 text-blue-400/80',
  complete: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400/80',
  error: 'border-red-500/20 bg-red-500/5 text-red-400/80',
} as const;

function ThinkingBlock({ text, status, duration }: { text: string; status?: 'running' | 'complete'; duration?: number }) {
  const [open, setOpen] = useState(false);

  // Show brief "thinking..." for running status (streaming thinking indicator above messages handles this now)
  const isRunning = status === 'running';
  const durationText = duration ? `${duration.toFixed(1)}秒` : '已完成';

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-indigo-400/70 hover:text-indigo-400 transition-colors px-1"
      >
        <svg
          className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {isRunning ? (
          <span className="inline-flex items-center gap-1">
            <span className="animate-pulse">·</span>
            <span className="animate-pulse" style={{ animationDelay: '150ms' }}>·</span>
            <span className="animate-pulse" style={{ animationDelay: '300ms' }}>·</span>
          </span>
        ) : open ? (
          '隐藏思考过程'
        ) : (
          <>💭 思考了 {durationText}</>
        )}
      </button>
      {open && (
        <div className="px-4 py-3 rounded-xl bg-[#0f0f1a] border border-indigo-500/20 text-white/50 text-xs">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      )}
    </>
  );
}

function ThinkingSpinner({ currentOperation }: { currentOperation?: string }) {
  const [verb, setVerb] = useState(() => getRandomThinkingVerb());

  useEffect(() => {
    const interval = setInterval(() => {
      setVerb(getRandomThinkingVerb());
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const displayText = currentOperation || verb;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-indigo-400/70">
      <span className="animate-pulse">·</span>
      <span className="animate-pulse" style={{ animationDelay: '150ms' }}>·</span>
      <span className="animate-pulse" style={{ animationDelay: '300ms' }}>·</span>
      <span className="ml-0.5">{displayText}…</span>
    </span>
  );
}

function ToolUseCard({
  toolName,
  toolInput,
  toolMeta,
}: {
  toolName: string;
  toolInput?: string;
  toolMeta?: { icon: string; displayText: string; status: string; detail?: string };
}) {
  const [open, setOpen] = useState(false);

  const colorClass = toolMeta?.status
    ? TOOL_STATUS_COLORS[toolMeta.status as keyof typeof TOOL_STATUS_COLORS] || TOOL_STATUS_COLORS.pending
    : TOOL_STATUS_COLORS.pending;

  return (
    <div className={`my-1.5 rounded-lg border ${colorClass} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {toolMeta ? (
          <>
            <span>{toolMeta.icon}</span>
            <span className="font-medium">{toolMeta.displayText}</span>
            {toolMeta.detail && (
              <span className="text-white/40 text-[10px]">{toolMeta.detail}</span>
            )}
          </>
        ) : (
          <>
            <span className="font-mono font-medium">{toolName}</span>
            <span className="text-white/30 ml-auto">tool call</span>
          </>
        )}
        {toolMeta?.status === 'running' && (
          <svg className="w-3 h-3 animate-spin ml-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </button>
      {open && toolInput && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] text-white/50 whitespace-pre-wrap font-mono bg-[#0f0f1a] rounded p-2 max-h-60 overflow-auto">
            {toolInput}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolResultCard({
  content,
  toolMeta,
}: {
  content: string;
  toolMeta?: { icon: string; displayText: string; status: string; detail?: string };
}) {
  const [open, setOpen] = useState(false);

  const colorClass = toolMeta?.status === 'error'
    ? TOOL_STATUS_COLORS.error
    : TOOL_STATUS_COLORS.complete;

  return (
    <div className={`my-1.5 rounded-lg border ${colorClass} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:opacity-80 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        {toolMeta ? (
          <>
            <span>{toolMeta.icon}</span>
            <span className="font-medium">{toolMeta.displayText}</span>
            {toolMeta.status === 'complete' && <span className="text-white/30">✓</span>}
            {toolMeta.status === 'error' && <span className="text-red-400">✗</span>}
          </>
        ) : (
          <span>tool result</span>
        )}
        <span className="text-white/30 ml-auto">{content.length} chars</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] text-white/50 whitespace-pre-wrap font-mono bg-[#0f0f1a] rounded p-2 max-h-60 overflow-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

function AssistantMessage({
  content,
  parts,
  model,
  apiCalls,
}: {
  content: string;
  parts?: ContentPart[];
  model?: string;
  apiCalls?: {
    total: number;
    systemInit: number;
    assistantThinking: number;
    assistantText: number;
    assistantToolUse: number;
    toolResults: number;
  };
}) {
  if (!parts || parts.length === 0) {
    return (
      <div className="flex justify-start">
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-[#16213e] text-white/90 text-sm border border-white/5 max-w-[85%]">
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    );
  }

  // Find the index of the LAST thinking block — only render that one,
  // hiding earlier ones (like Claude Code's lastThinkingBlockId approach).
  const lastThinkingIndex = useMemo(() => {
    let idx = -1;
    for (let i = parts.length - 1; i >= 0; i--) {
      if (parts[i].type === 'thinking') {
        idx = i;
        break;
      }
    }
    return idx;
  }, [parts]);

  const renderedParts: React.ReactNode[] = [];
  let textBuffer = '';

  const flushText = () => {
    if (textBuffer) {
      renderedParts.push(
        <div key={`text-${renderedParts.length}`} className="px-4 py-3 rounded-2xl rounded-bl-md bg-[#16213e] text-white/90 text-sm border border-white/5">
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {textBuffer}
            </ReactMarkdown>
          </div>
        </div>
      );
      textBuffer = '';
    }
  };

  parts.forEach((part, idx) => {
    if (part.type === 'text') {
      textBuffer += part.text;
    } else if (part.type === 'thinking') {
      // Only render the LAST thinking block (like Claude Code hides past thinking)
      if (idx !== lastThinkingIndex) return;
      flushText();
      renderedParts.push(
        <ThinkingBlock
          key={`think-${renderedParts.length}`}
          text={part.text}
          status={part.status}
          duration={part.duration}
        />
      );
    } else if (part.type === 'tool_use') {
      flushText();
      // Skip rendering AskUserQuestion tool_use - it's handled by QuestionDialog
      if (part.toolName === 'AskUserQuestion') {
        return; // Skip this part entirely
      }
      const resolvedToolMeta = part.toolMeta || { icon: '🔧', displayText: part.toolName, status: 'pending' as const };
      renderedParts.push(
        <ToolUseCard key={`tool-${renderedParts.length}`} toolName={part.toolName} toolInput={part.toolInput} toolMeta={resolvedToolMeta} />
      );
    } else if (part.type === 'tool_result') {
      // Skip AskUserQuestion tool results - handled by QuestionDialog
      if (part.content.startsWith('User has answered your questions')) {
        return; // Skip this part entirely
      }
      flushText();
      renderedParts.push(
        <ToolResultCard key={`result-${renderedParts.length}`} content={part.content} toolMeta={part.toolMeta} />
      );
    }
  });
  flushText();

  // Model and API call stats (only show when turn is complete)
  const showMetadata = model || apiCalls;
  const metadataSection = showMetadata && (
    <div className="mt-2 ml-1">
      <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1 rounded bg-white/5 border border-white/10">
        {model && (
          <span className="text-xs text-indigo-400 font-medium">🤖 {model}</span>
        )}
        {model && apiCalls && (
          <span className="text-xs text-white/20">|</span>
        )}
        {apiCalls && (
          <>
            <span className="text-xs text-white/70 font-medium">{apiCalls.total} 调用</span>
            {apiCalls.assistantThinking > 0 && (
              <>
                <span className="text-xs text-white/20">|</span>
                <span className="text-xs text-amber-400/80">💭 {apiCalls.assistantThinking} 思考</span>
              </>
            )}
            {apiCalls.assistantToolUse > 0 && (
              <>
                <span className="text-xs text-white/20">|</span>
                <span className="text-xs text-emerald-400/80">🔧 {apiCalls.assistantToolUse} 工具</span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex justify-start group/message">
      <div className="flex flex-col gap-1 max-w-[85%]">
        {renderedParts}
        {metadataSection}
      </div>
    </div>
  );
}

// Category configuration
const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  core: { label: '核心能力', icon: '🔧' },
  mcp: { label: 'MCP 工具', icon: '🔌' },
  channel: { label: '频道工具', icon: '📢' },
  system: { label: '系统技能', icon: '⚙️' },
  workspace: { label: '工作空间', icon: '📁' },
};

// SkillPicker popup component
function SkillPicker({
  isOpen,
  onClose,
  onSelect,
  positionRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (skillName: string, skill: Skill) => void;
  positionRef: React.RefObject<HTMLDivElement | null>;
}) {
  const skillsByCategory = useStore((s) => s.skillsByCategory);
  const discoverSkills = useStore((s) => s.discoverSkills);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Close popup when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use mousedown to catch the event before other handlers
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Discover skills on mount
  useEffect(() => {
    if (isOpen) {
      discoverSkills();
      setSearchQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen, discoverSkills]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Flatten all skills for searching and keyboard navigation
  const allSkills = useMemo(() => {
    const result: Skill[] = [];
    const categoryOrder: SkillCategory[] = ['core', 'mcp', 'channel', 'system', 'workspace'];
    for (const cat of categoryOrder) {
      for (const skill of skillsByCategory[cat] || []) {
        result.push({ ...skill, category: cat });
      }
    }
    return result;
  }, [skillsByCategory]);

  // Filter skills by search query
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) return allSkills;
    const query = searchQuery.toLowerCase();
    return allSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.nameZh?.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query)
    );
  }, [allSkills, searchQuery]);

  // Group filtered skills by category
  const groupedSkills = useMemo(() => {
    const groups: Record<string, Skill[]> = {};
    for (const skill of filteredSkills) {
      const cat = skill.category || 'core';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(skill);
    }
    return groups;
  }, [filteredSkills]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && isOpen) {
      const selectedEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, isOpen]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredSkills.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredSkills[selectedIndex];
        if (selected) {
          onSelect(selected.name, selected);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredSkills, onSelect, onClose]);

  if (!isOpen) return null;

  // Calculate position
  const rect = positionRef.current?.getBoundingClientRect();
  const bottomOffset = rect ? window.innerHeight - rect.top + 8 : 0;

  return (
    <div
      ref={popupRef}
      className="fixed z-50 w-80 max-h-80 overflow-hidden rounded-lg border border-white/10 bg-[#16213e] shadow-xl flex flex-col"
      style={{ bottom: bottomOffset, left: rect?.left }}
    >
      {/* Search input */}
      <div className="p-2 border-b border-white/10">
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder="搜索技能..."
          className="w-full px-3 py-1.5 text-sm bg-white/5 border border-white/10 rounded text-white placeholder:text-white/30 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Skills list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filteredSkills.length === 0 ? (
          <div className="px-4 py-6 text-center text-white/30 text-sm">
            没有找到匹配的技能
          </div>
        ) : (
          Object.entries(groupedSkills).map(([category, skills]) => {
            const config = CATEGORY_CONFIG[category] || { label: category, icon: '📦' };
            return (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs text-white/40 border-b border-white/5 flex items-center gap-1.5 bg-white/5">
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                  <span className="text-white/20">({skills.length})</span>
                </div>
                {skills.map((skill) => {
                  const globalIdx = filteredSkills.indexOf(skill);
                  return (
                    <button
                      key={`${category}-${skill.name}`}
                      data-index={globalIdx}
                      onClick={() => onSelect(skill.name, skill)}
                      className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex items-center gap-2 ${
                        selectedIndex === globalIdx ? 'bg-indigo-600/20' : ''
                      }`}
                    >
                      <span className="text-base">{skill.icon || '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white/90 flex items-center gap-1.5">
                          <span>{skill.nameZh || skill.name}</span>
                          <span className="text-[10px] text-white/30 font-mono">/{skill.name}</span>
                        </div>
                        {skill.description && (
                          <div className="text-xs text-white/50 mt-0.5 truncate">{skill.description}</div>
                        )}
                      </div>
                      {skill.isBuiltin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                          SDK
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Keyboard hint */}
      <div className="px-3 py-1.5 text-[10px] text-white/30 border-t border-white/5 flex items-center gap-3 bg-white/5">
        <span>↑↓ 选择</span>
        <span>Enter 确认</span>
        <span>Esc 关闭</span>
        <span className="ml-auto">{filteredSkills.length} 个技能</span>
      </div>
    </div>
  );
}

function Composer() {
  const [input, setInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachment, setAttachment] = useState<{
    fileId: string;
    filename: string;
    extractedText: string;
    filePath: string;
  } | null>(null);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const typing = useStore((s) => activeConversationId ? s.isTyping(activeConversationId) : false);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const fetchSystemSkills = useStore((s) => s.fetchSystemSkills);

  // Fetch system skills on mount
  useEffect(() => {
    fetchSystemSkills();
  }, [fetchSystemSkills]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.docx', '.xlsx', '.pdf'].includes(ext)) {
      alert('仅支持 .docx .xlsx .pdf 格式的文件');
      return;
    }

    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      alert(`文件大小超过限制 (20MB)，请压缩后重试`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/upload?workspaceId=${activeWorkspaceId}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '上传失败');
      }
      const data = await res.json();
      setAttachment({
        fileId: data.fileId,
        filename: data.filename,
        extractedText: data.extractedText,
        filePath: data.filePath,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : '上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = () => {
    if ((!input.trim() && !attachment) || typing || isComposing || uploading) return;
    const content = input.trim();
    setInput('');
    window.dispatchEvent(new CustomEvent('okclaw-send', {
      detail: { content, attachment },
    }));
    setAttachment(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't send if skill picker is open
    if (showSkillPicker) return;
    // 支持回车发送，但 Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  const handleSkillSelect = useCallback((skillName: string, _skill: Skill) => {
    // Prepend skill command to beginning of input
    setInput((prev) => `/${skillName} ${prev}`);
    setShowSkillPicker(false);
    // Focus textarea after selection
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 150;
      textarea.style.height = scrollHeight > maxHeight ? `${maxHeight}px` : `${scrollHeight}px`;
    }
  }, [input]);

  return (
    <div className="px-4 py-3 border-t border-white/10">
      {/* Skill Picker Popup */}
      <SkillPicker
        isOpen={showSkillPicker}
        onClose={() => setShowSkillPicker(false)}
        onSelect={handleSkillSelect}
        positionRef={composerRef}
      />

      {/* Attachment Preview */}
      {attachment && (
        <div className="flex items-center gap-2 mb-2 px-1">
          <span className="text-xs text-white/60">📄</span>
          <span className="text-xs text-white/80 bg-white/5 px-2 py-1 rounded">{attachment.filename}</span>
          <button
            onClick={() => setAttachment(null)}
            className="text-white/30 hover:text-white/60 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Area */}
      <div
        ref={composerRef}
        className="bg-[#16213e] rounded-xl border border-white/10 focus-within:border-indigo-500"
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="输入消息..."
          className="w-full bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-white/20 px-3 pt-3 pb-2 max-h-[150px]"
          rows={2}
        />

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-t border-white/5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.xlsx,.pdf"
            onChange={handleFileSelect}
            className="hidden"
          />
          {/* Skill Button */}
          <button
            onClick={() => setShowSkillPicker(!showSkillPicker)}
            className={`px-2 py-1 rounded text-sm transition-colors ${
              showSkillPicker
                ? 'bg-indigo-600/30 text-indigo-400'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
            title="技能"
          >
            /
          </button>
          {/* Attachment Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-2 py-1 rounded text-sm text-white/40 hover:text-white/70 hover:bg-white/5 disabled:opacity-30 transition-colors"
            title="添加附件"
          >
            {uploading ? '⏳' : '📎'}
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Send/Stop Button */}
          {typing ? (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('okclaw-cancel'))}
              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() && !attachment}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-white/20 mt-1 text-center">Enter 发送 · Shift+Enter 换行</p>
    </div>
  );
}

export default function AssistantChat() {
  const runtime = useChatRuntime();
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
