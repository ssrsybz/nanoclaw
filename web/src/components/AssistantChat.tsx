import { useState } from 'react';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
} from '@assistant-ui/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useChatRuntime } from '../useChatRuntime';
import { useStore, type ThinkingPart, type ContentPart } from '../store';

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

  return (
    <div className="space-y-4">
      {messages.map((msg, i) =>
        msg.role === 'user' ? (
          <UserMessage key={i} content={msg.content} />
        ) : (
          <AssistantMessage key={i} parts={msg.parts} content={msg.content} />
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

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-md bg-indigo-600 text-white text-sm whitespace-pre-wrap">
        {content}
      </div>
    </div>
  );
}

function AssistantMessage({ content, parts }: { content: string; parts?: ContentPart[] }) {
  const [thinkingOpen, setThinkingOpen] = useState(false);

  // Extract thinking parts only
  const thinkingParts = parts?.filter((p): p is ThinkingPart => p.type === 'thinking') || [];
  const hasThinking = thinkingParts.length > 0;

  return (
    <div className="flex justify-start group/message">
      <div className="flex flex-col gap-1 max-w-[85%]">
        {/* Thinking section (collapsible) */}
        {hasThinking && (
          <button
            onClick={() => setThinkingOpen(!thinkingOpen)}
            className="flex items-center gap-1.5 text-xs text-indigo-400/70 hover:text-indigo-400 transition-colors px-1"
          >
            <svg
              className={`w-3 h-3 transition-transform ${thinkingOpen ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {thinkingOpen ? '隐藏思考过程' : `思考过程 (${thinkingParts.length})`}
          </button>
        )}
        {hasThinking && thinkingOpen && (
          <div className="px-4 py-3 rounded-xl bg-[#0f0f1a] border border-indigo-500/20 text-white/50 text-xs space-y-2">
            {thinkingParts.map((p, i) => (
              <p key={i} className="whitespace-pre-wrap">{p.text}</p>
            ))}
          </div>
        )}

        {/* Main content with Markdown */}
        <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-[#16213e] text-white/90 text-sm border border-white/5">
          <div className="markdown-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code(props) {
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
                pre({ children }) {
                  return <>{children}</>;
                },
                a({ href, children }) {
                  return <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{children}</a>;
                },
                blockquote({ children }) {
                  return <blockquote className="border-l-3 border-indigo-500 pl-3 my-2 text-white/60">{children}</blockquote>;
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}

function Composer() {
  return (
    <div className="px-4 py-3 border-t border-white/10">
      <ComposerPrimitive.Root className="flex items-end gap-2 bg-[#16213e] rounded-xl border border-white/10 px-3 py-2 focus-within:border-indigo-500">
        <ComposerPrimitive.Input
          placeholder="Type a message..."
          className="flex-1 bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-white/20 max-h-[150px] py-1"
          rows={1}
        />
        <ComposerPrimitive.Send className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm transition-colors flex-shrink-0">
          Send
        </ComposerPrimitive.Send>
        <ComposerPrimitive.Cancel className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors flex-shrink-0">
          Stop
        </ComposerPrimitive.Cancel>
      </ComposerPrimitive.Root>
      <p className="text-[10px] text-white/20 mt-1 text-center">Ctrl+Enter to send</p>
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
