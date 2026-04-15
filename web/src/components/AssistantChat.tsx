import { useState, useRef } from 'react';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
} from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useChatRuntime } from '../useChatRuntime';
import { useStore, type ContentPart, type AttachmentInfo } from '../store';

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
  return (
    <ThreadPrimitive.Root className="flex-1 flex flex-col min-w-0">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-5 py-4">
        <ThreadPrimitive.Empty>
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="text-4xl mb-4">🐾</div>
              <h2 className="text-lg font-semibold text-white/60">NanoClaw</h2>
              <p className="text-white/30 mt-2 text-sm">发消息开始对话</p>
            </div>
          </div>
        </ThreadPrimitive.Empty>
        {/* Render messages from store directly for full Markdown support */}
        <MessageList />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}

function MessageList() {
  const messages = useStore((s) =>
    s.activeConversationId ? s.messages[s.activeConversationId] : undefined
  ) || [];
  const isRunning = useStore((s) => s.typing);

  if (messages.length === 0) return null;

  // Debug: log messages with metadata
  const assistantMessages = messages.filter(m => m.role === 'assistant');
  if (assistantMessages.length > 0) {
    const lastAssistant = assistantMessages[assistantMessages.length - 1];
    console.log('[MessageList] Last assistant message:', {
      hasModel: !!lastAssistant.model,
      hasApiCalls: !!lastAssistant.apiCalls,
      model: lastAssistant.model,
      apiCalls: lastAssistant.apiCalls,
    });
  }

  return (
    <div className="space-y-4">
      {messages.map((msg, i) =>
        msg.role === 'user' ? (
          <UserMessage key={i} content={msg.content} attachment={msg.attachment} />
        ) : (
          <AssistantMessage key={i} parts={msg.parts} content={msg.content} model={msg.model} apiCalls={msg.apiCalls} />
        )
      )}
      {isRunning && (
        <div className="flex justify-start">
          <div className="bg-[#16213e] border border-white/5 px-4 py-3 rounded-2xl rounded-bl-md">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-white/30 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMessage({ content, attachment }: { content: string; attachment?: AttachmentInfo | null }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-indigo-600 text-white text-sm whitespace-pre-wrap">
        {attachment && (
          <div className="flex items-center gap-1.5 mb-1 pb-1.5 border-b border-white/20">
            <span>📄</span>
            <span className="text-white/80 text-xs">{attachment.filename}</span>
          </div>
        )}
        {content}
      </div>
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
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
        {open ? '隐藏思考过程' : '思考过程'}
      </button>
      {open && (
        <div className="px-4 py-3 rounded-xl bg-[#0f0f1a] border border-indigo-500/20 text-white/50 text-xs">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      )}
    </>
  );
}

function ToolUseCard({ toolName, toolInput }: { toolName: string; toolInput?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-400/80 hover:text-amber-400 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-mono font-medium">{toolName}</span>
        <span className="text-white/30 ml-auto">tool call</span>
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

function ToolResultCard({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-emerald-400/80 hover:text-emerald-400 transition-colors"
      >
        <svg
          className={`w-3 h-3 transition-transform flex-shrink-0 ${open ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span>tool result</span>
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
  // Backward compat: if no parts, render content directly
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

  // Render parts in order, merging consecutive text parts
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

  for (const part of parts) {
    if (part.type === 'text') {
      textBuffer += part.text;
    } else if (part.type === 'thinking') {
      flushText();
      renderedParts.push(
        <ThinkingBlock key={`think-${renderedParts.length}`} text={part.text} />
      );
    } else if (part.type === 'tool_use') {
      flushText();
      renderedParts.push(
        <ToolUseCard key={`tool-${renderedParts.length}`} toolName={part.toolName} toolInput={part.toolInput} />
      );
    } else if (part.type === 'tool_result') {
      flushText();
      renderedParts.push(
        <ToolResultCard key={`result-${renderedParts.length}`} content={part.content} />
      );
    }
  }
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typing = useStore((s) => s.typing);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);

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
    window.dispatchEvent(new CustomEvent('nanoclaw-send', {
      detail: { content, attachment },
    }));
    setAttachment(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 支持回车发送，但 Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  return (
    <div className="px-4 py-3 border-t border-white/10">
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
      <div className="flex items-end gap-2 bg-[#16213e] rounded-xl border border-white/10 px-3 py-2 focus-within:border-indigo-500">
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.xlsx,.pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-white/40 hover:text-white/70 disabled:opacity-30 transition-colors flex-shrink-0 text-lg leading-none"
          title="添加附件"
        >
          {uploading ? '⏳' : '📎'}
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="输入消息..."
          className="flex-1 bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-white/20 max-h-[150px] py-1"
          rows={1}
        />
        {typing ? (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('nanoclaw-cancel'))}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors flex-shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim() && !attachment}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm transition-colors flex-shrink-0"
          >
            Send
          </button>
        )}
      </div>
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
