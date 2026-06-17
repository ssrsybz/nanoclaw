import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
} from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useChatRuntime } from '../useChatRuntime';
import { useStore, type ContentPart, type Skill, type SkillCategory } from '../store';
import { getRandomThinkingVerb } from '../utils/thinking-verbs';

// 全局 Markdown 样式（注入到页面）
const markdownGlobalStyles = `
/* 表格斑马纹 */
.markdown-body tbody tr:nth-child(odd) {
  background: rgba(0, 0, 0, 0.02);
}
.markdown-body tbody tr:nth-child(even) {
  background: rgba(0, 0, 0, 0.04);
}

/* 嵌套列表样式 */
.markdown-body ul ul,
.markdown-body ol ol,
.markdown-body ul ol,
.markdown-body ol ul {
  margin-top: 0.25rem;
}

/* 表格悬停效果 */
.markdown-body tbody tr:hover {
  background: rgba(47, 107, 94, 0.08);
}
`;

// 代码块复制按钮组件
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-black/5 hover:bg-black/10 transition-colors group"
      title={copied ? '已复制!' : '复制代码'}
    >
      {copied ? (
        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-4 h-4 text-ink-sub group-hover:text-ink transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

// Markdown 组件配置 - 参考 Claude Code CLI 渲染风格
const markdownComponents = {
  // 标题样式：H1 粗体+下划线，H2+ 粗体，各级别有不同字号
  h1({ children }: any) {
    return <h1 className="text-xl font-bold underline decoration-accent decoration-2 underline-offset-4 my-3 pb-1">{children}</h1>;
  },
  h2({ children }: any) {
    return <h2 className="text-lg font-bold my-2.5 pb-0.5 border-b border-line">{children}</h2>;
  },
  h3({ children }: any) {
    return <h3 className="text-base font-bold my-2">{children}</h3>;
  },
  h4({ children }: any) {
    return <h4 className="text-sm font-bold my-1.5">{children}</h4>;
  },
  h5({ children }: any) {
    return <h5 className="text-sm font-bold text-ink-sub my-1.5">{children}</h5>;
  },
  h6({ children }: any) {
    return <h6 className="text-xs font-bold text-ink-faint my-1">{children}</h6>;
  },
  // 代码块和行内代码
  code(props: any) {
    const { children, className, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    const inline = !match;
    const codeContent = String(children).replace(/\n$/, '');

    return inline ? (
      <code className="bg-inset text-[#9a6a2e] px-1.5 py-0.5 rounded text-[0.85em] font-mono border border-line-soft" {...rest}>
        {children}
      </code>
    ) : (
      <div className="relative group">
        <SyntaxHighlighter
          style={oneLight}
          language={match[1]}
          PreTag="div"
          className="!bg-inset !rounded-lg !my-2 !border !border-line !shadow-sm !pr-12"
        >
          {codeContent}
        </SyntaxHighlighter>
        <CopyButton code={codeContent} />
      </div>
    );
  },
  pre({ children }: any) {
    return <>{children}</>;
  },
  // 链接：点击直接打开外部链接
  a({ href, children }: any) {
    const handleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      if (href) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    };

    return (
      <a
        href={href}
        onClick={handleClick}
        className="text-accent-ink hover:text-accent hover:underline underline-offset-2 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
      >
        {children}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    );
  },
  // 引用块：左侧边框 + 斜体 + 暗淡背景
  blockquote({ children }: any) {
    return (
      <blockquote className="border-l-4 border-accent pl-4 pr-3 py-2 my-3 bg-accent-soft rounded-r-lg italic text-ink-sub">
        {children}
      </blockquote>
    );
  },
  // 表格：圆角边框 + 斑马纹 + 居中表头
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }: any) {
    return <thead className="bg-accent-soft">{children}</thead>;
  },
  tbody({ children }: any) {
    return <tbody>{children}</tbody>;
  },
  tr({ children }: any) {
    return <tr className="border-b border-line last:border-0">{children}</tr>;
  },
  th({ children, align }: any) {
    const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
    return (
      <th className={`px-3 py-2 font-semibold text-ink ${alignClass} border-r border-line last:border-0`}>
        {children}
      </th>
    );
  },
  td({ children, align }: any) {
    const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
    return (
      <td className={`px-3 py-2 ${alignClass} border-r border-line-soft last:border-0`}>
        {children}
      </td>
    );
  },
  // 列表：改进缩进和标记
  ul({ children, depth }: any) {
    const indentClass = depth === 0 ? '' : depth === 1 ? 'ml-4' : 'ml-6';
    return <ul className={`my-2 space-y-1 list-disc list-outside marker:text-accent ${indentClass}`}>{children}</ul>;
  },
  ol({ children, depth }: any) {
    const indentClass = depth === 0 ? '' : depth === 1 ? 'ml-4' : 'ml-6';
    return <ol className={`my-2 space-y-1 list-decimal list-outside marker:text-accent ${indentClass}`}>{children}</ol>;
  },
  li({ children }: any) {
    return <li className="text-ink pl-1">{children}</li>;
  },
  // 水平分隔线
  hr() {
    return <hr className="my-4 border-0 h-px bg-gradient-to-r from-transparent via-line to-transparent" />;
  },
  // 段落
  p({ children }: any) {
    return <p className="my-2 leading-relaxed">{children}</p>;
  },
  // 强调和粗体
  strong({ children }: any) {
    return <strong className="font-bold text-ink">{children}</strong>;
  },
  em({ children }: any) {
    return <em className="italic text-accent-ink">{children}</em>;
  },
  // 删除线
  del({ children }: any) {
    return <del className="line-through text-ink-faint">{children}</del>;
  },
};

function Thread() {
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <>
      {/* 注入 Markdown 全局样式 */}
      <style>{markdownGlobalStyles}</style>
      <ThreadPrimitive.Root className="flex-1 flex flex-col min-w-0">
        <ThreadPrimitive.Viewport ref={viewportRef} className="flex-1 overflow-y-auto px-5 py-4">
          <ThreadPrimitive.Empty>
            <div className="flex-1 flex items-center justify-center py-20">
              <div className="text-center">
                <div className="text-4xl mb-4">🐾</div>
                <h2 className="text-lg font-semibold text-ink-sub">OKClaw</h2>
                <p className="text-ink-faint mt-2 text-sm">发消息开始对话</p>
              </div>
            </div>
          </ThreadPrimitive.Empty>
          {/* Render messages from store directly for full Markdown support */}
          <MessageList viewportRef={viewportRef} />
        </ThreadPrimitive.Viewport>
        <Composer />
      </ThreadPrimitive.Root>
    </>
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

  // Simplified sticky state: just the message content to show in sticky header
  const [stickyMessage, setStickyMessage] = useState<{ content: string; attachment?: { filename: string } } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastStickyRef = useRef<{ content: string; attachment?: { filename: string } } | null>(null);

  // Scroll handler to find which user message should be sticky
  useEffect(() => {
    const container = viewportRef.current;
    if (!container || messages.length === 0) return;

    const updateSticky = () => {
      const containerRect = container.getBoundingClientRect();
      const stickyThreshold = containerRect.top + 60;

      // Find the last user message that's above the threshold
      // and whose assistant reply is still visible
      let candidate: { content: string; attachment?: { filename: string } } | null = null;

      for (let i = messages.length - 2; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role !== 'user') continue;

        const userEl = container.querySelector(`[data-msg-idx="${i}"]`);
        const assistantEl = container.querySelector(`[data-msg-idx="${i + 1}"]`);

        if (!userEl || !assistantEl) continue;

        const userRect = userEl.getBoundingClientRect();
        const assistantRect = assistantEl.getBoundingClientRect();

        // User message is above viewport, assistant reply is at least partially visible
        if (userRect.bottom < stickyThreshold && assistantRect.bottom > containerRect.top) {
          candidate = { content: msg.content, attachment: msg.attachment };
          break;
        }
      }

      // Only update state if content changed
      if (
        candidate?.content !== lastStickyRef.current?.content ||
        candidate?.attachment?.filename !== lastStickyRef.current?.attachment?.filename
      ) {
        lastStickyRef.current = candidate;
        setStickyMessage(candidate);
      }
    };

    const onScroll = () => {
      // Throttle with requestAnimationFrame
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        updateSticky();
      });
    };

    // Initial check
    updateSticky();

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [messages, viewportRef]);

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
      {/* Single sticky header - always at top, shows content when needed */}
      {stickyMessage && (
        <div className="sticky top-0 z-10 pt-2 pb-1 flex justify-end">
          <div className="max-w-[80%] px-4 py-2 text-white text-sm whitespace-pre-wrap rounded-xl bg-accent shadow-lg shadow-accent/20">
            {stickyMessage.attachment && (
              <div className="flex items-center gap-1.5 mb-1 pb-1.5 border-b border-white/20">
                <span>📄</span>
                <span className="text-white/80 text-xs">{stickyMessage.attachment.filename}</span>
              </div>
            )}
            {stickyMessage.content}
          </div>
        </div>
      )}

      {/* 消息列表 - no sticky logic here */}
      {messages.map((msg, i) => {
        if (msg.role === 'user') {
          return (
            <div
              key={i}
              data-msg-idx={i}
              className="flex justify-end"
            >
              <div className="max-w-[80%] px-4 py-2.5 text-white text-sm whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent">
                {msg.attachment && (
                  <div className="flex items-center gap-1.5 mb-1 pb-1.5 border-b border-white/20">
                    <span>📄</span>
                    <span className="text-white/80 text-xs">{msg.attachment.filename}</span>
                  </div>
                )}
                {msg.content}
              </div>
            </div>
          );
        }
        return (
          <div key={i} data-msg-idx={i}>
            <AssistantMessage parts={msg.parts} content={msg.content} model={msg.model} apiCalls={msg.apiCalls} />
          </div>
        );
      })}

      {/* Streaming thinking indicator - after last message */}
      {isStreamingThinkingVisible && streamingThinking && (
        <div className="flex justify-start">
          <div className="bg-surface border border-line-soft px-4 py-3 rounded-2xl rounded-bl-md max-w-[85%]">
            {streamingThinking.isStreaming ? (
              <ThinkingSpinner currentOperation={currentOperation} />
            ) : (
              <ThinkingBlock text={streamingThinking.thinking} status="complete" />
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// 工具状态颜色映射（提取复用）—— 浅色背景：深字 + 极淡底，保留语义
const TOOL_STATUS_COLORS = {
  pending: 'border-amber-400/40 bg-amber-50 text-amber-700',
  running: 'border-blue-400/40 bg-blue-50 text-blue-700',
  complete: 'border-emerald-400/40 bg-emerald-50 text-emerald-700',
  error: 'border-red-400/40 bg-red-50 text-red-700',
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
        className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors px-1"
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
        <div className="px-4 py-3 rounded-xl bg-inset border border-accent/30 text-ink-sub text-xs">
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
    <span className="inline-flex items-center gap-1 text-xs text-accent">
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
              <span className="text-ink-faint text-[10px]">{toolMeta.detail}</span>
            )}
          </>
        ) : (
          <>
            <span className="font-mono font-medium">{toolName}</span>
            <span className="text-ink-faint ml-auto">tool call</span>
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
          <pre className="text-[11px] text-ink-sub whitespace-pre-wrap font-mono bg-inset rounded p-2 max-h-60 overflow-auto">
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
            {toolMeta.status === 'complete' && <span className="text-emerald-600">✓</span>}
            {toolMeta.status === 'error' && <span className="text-red-500">✗</span>}
          </>
        ) : (
          <span>tool result</span>
        )}
        <span className="text-ink-faint ml-auto">{content.length} chars</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <pre className="text-[11px] text-ink-sub whitespace-pre-wrap font-mono bg-inset rounded p-2 max-h-60 overflow-auto">
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
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-surface text-ink text-sm border border-line-soft max-w-[85%]">
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
        <div key={`text-${renderedParts.length}`} className="px-4 py-3 rounded-2xl rounded-bl-md bg-surface text-ink text-sm border border-line-soft">
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
      <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1 rounded bg-black/5 border border-line-soft">
        {model && (
          <span className="text-xs text-accent font-medium">🤖 {model}</span>
        )}
        {model && apiCalls && (
          <span className="text-xs text-ink-faint">|</span>
        )}
        {apiCalls && (
          <>
            <span className="text-xs text-ink-sub font-medium">{apiCalls.total} 调用</span>
            {apiCalls.assistantThinking > 0 && (
              <>
                <span className="text-xs text-ink-faint">|</span>
                <span className="text-xs text-amber-600">💭 {apiCalls.assistantThinking} 思考</span>
              </>
            )}
            {apiCalls.assistantToolUse > 0 && (
              <>
                <span className="text-xs text-ink-faint">|</span>
                <span className="text-xs text-emerald-700">🔧 {apiCalls.assistantToolUse} 工具</span>
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

// Skill type badge config for the picker —— 浅底深字
const SKILL_TYPE_BADGE: Record<string, { label: string; color: string }> = {
  builtin: { label: 'SDK', color: 'bg-gray-200 text-gray-700' },
  operational: { label: '指令', color: 'bg-emerald-100 text-emerald-700' },
  utility: { label: '工具', color: 'bg-blue-100 text-blue-700' },
  feature: { label: '功能', color: 'bg-orange-100 text-orange-700' },
  workspace: { label: '空间', color: 'bg-purple-100 text-purple-700' },
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
      className="fixed z-50 w-80 max-h-80 overflow-hidden rounded-lg border border-line bg-panel shadow-xl flex flex-col"
      style={{ bottom: bottomOffset, left: rect?.left }}
    >
      {/* Search input */}
      <div className="p-2 border-b border-line">
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSelectedIndex(0);
          }}
          placeholder="搜索技能..."
          className="w-full px-3 py-1.5 text-sm bg-surface border border-line-soft rounded text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent"
        />
      </div>

      {/* Skills list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {filteredSkills.length === 0 ? (
          <div className="px-4 py-6 text-center text-ink-faint text-sm">
            没有找到匹配的技能
          </div>
        ) : (
          Object.entries(groupedSkills).map(([category, skills]) => {
            const config = CATEGORY_CONFIG[category] || { label: category, icon: '📦' };
            return (
              <div key={category}>
                <div className="px-3 py-1.5 text-xs text-ink-faint border-b border-line-soft flex items-center gap-1.5 bg-black/5">
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                  <span className="text-ink-faint">({skills.length})</span>
                </div>
                {skills.map((skill) => {
                  const globalIdx = filteredSkills.indexOf(skill);
                  const typeBadge = skill.skillType && SKILL_TYPE_BADGE[skill.skillType];
                  return (
                    <button
                      key={`${category}-${skill.name}`}
                      data-index={globalIdx}
                      onClick={() => onSelect(skill.name, skill)}
                      className={`w-full px-3 py-2 text-left hover:bg-black/5 transition-colors flex items-center gap-2 ${
                        selectedIndex === globalIdx ? 'bg-accent-soft' : ''
                      }`}
                    >
                      <span className="text-base">{skill.icon || '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink flex items-center gap-1.5">
                          <span>{skill.nameZh || skill.name}</span>
                          <span className="text-[10px] text-ink-faint font-mono">/{skill.name}</span>
                        </div>
                        {skill.description && (
                          <div className="text-xs text-ink-sub mt-0.5 truncate">{skill.description}</div>
                        )}
                      </div>
                      {typeBadge ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeBadge.color}`}>
                          {typeBadge.label}
                        </span>
                      ) : skill.isBuiltin ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                          SDK
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {/* Keyboard hint */}
      <div className="px-3 py-1.5 text-[10px] text-ink-faint border-t border-line-soft flex items-center gap-3 bg-black/5">
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

  // Listen for okclaw-insert-text events from SkillsPanel install button
  useEffect(() => {
    const handleInsertText = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.text) {
        setInput(detail.text);
        // Focus the textarea after inserting
        setTimeout(() => textareaRef.current?.focus(), 0);
      }
    };
    window.addEventListener('okclaw-insert-text', handleInsertText);
    return () => window.removeEventListener('okclaw-insert-text', handleInsertText);
  }, []);

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
    <div className="px-4 py-3 border-t border-line">
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
          <span className="text-xs text-ink-sub">📄</span>
          <span className="text-xs text-ink bg-surface border border-line-soft px-2 py-1 rounded">{attachment.filename}</span>
          <button
            onClick={() => setAttachment(null)}
            className="text-ink-faint hover:text-ink-sub text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Input Area */}
      <div
        ref={composerRef}
        className="bg-surface rounded-xl border border-line focus-within:border-accent"
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
          className="w-full bg-transparent text-ink text-sm resize-none focus:outline-none placeholder:text-ink-faint px-3 pt-3 pb-2 max-h-[150px]"
          rows={2}
        />

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 py-2 border-t border-line-soft">
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
                ? 'bg-accent-soft text-accent'
                : 'text-ink-faint hover:text-ink-sub hover:bg-black/5'
            }`}
            title="技能"
          >
            /
          </button>
          {/* Attachment Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-2 py-1 rounded text-sm text-ink-faint hover:text-ink-sub hover:bg-black/5 disabled:opacity-30 transition-colors"
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
              className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm transition-colors"
            >
              Send
            </button>
          )}
        </div>
      </div>

      {/* Hint */}
      <p className="text-[10px] text-ink-faint mt-1 text-center">Enter 发送 · Shift+Enter 换行</p>
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
