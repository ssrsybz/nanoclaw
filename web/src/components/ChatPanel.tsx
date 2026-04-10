import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';

export default function ChatPanel({ sendMessage }: { sendMessage: (content: string) => void }) {
  const { workspaces, activeWorkspaceId, messages, typing } = useStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const chatMessages = activeWorkspaceId ? (messages[activeWorkspaceId] || []) : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length, typing]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !activeWorkspaceId) return;
    sendMessage(trimmed);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  };

  if (!activeWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#1a1a2e]">
        <div className="text-center">
          <div className="text-5xl mb-4">&#128062;</div>
          <h2 className="text-xl font-bold text-white/60">NanoClaw</h2>
          <p className="text-white/30 mt-2">Select a workspace to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#1a1a2e] min-w-0">
      {/* Header */}
      <div className="px-5 py-3 border-b border-white/10">
        <h2 className="font-semibold text-white truncate">{activeWorkspace.name}</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {chatMessages.length === 0 && !typing && (
          <div className="text-center text-white/20 text-sm py-12">
            Start a conversation with the agent
          </div>
        )}
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-md'
                  : 'bg-[#16213e] text-white/90 rounded-bl-md border border-white/5'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {typing && (
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
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex items-end gap-2 bg-[#16213e] rounded-xl border border-white/10 px-3 py-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-white/20 max-h-[150px] py-1"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm transition-colors flex-shrink-0"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-white/20 mt-1 text-center">Ctrl+Enter to send</p>
      </div>
    </div>
  );
}
