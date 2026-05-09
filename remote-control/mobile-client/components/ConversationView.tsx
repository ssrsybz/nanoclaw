/**
 * 对话视图组件
 */

import React, { useState, useRef, useEffect } from 'react';
import { Message } from '../services/SessionManager';

interface ConversationViewProps {
  messages: Message[];
  streamingContent?: string;
  onSendMessage: (content: string) => void;
}

export const ConversationView: React.FC<ConversationViewProps> = ({
  messages,
  streamingContent,
  onSendMessage
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // 发送消息
  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  // 键盘事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="conversation-view">
      {/* 消息列表 */}
      <div className="messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.type}`}>
            <div className="message-header">
              <span className="message-type">{msg.type}</span>
              <span className="message-time">
                {msg.timestamp.toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {/* 流式输出 */}
        {streamingContent && (
          <div className="message message-assistant streaming">
            <div className="message-header">
              <span className="message-type">assistant</span>
            </div>
            <div className="message-content">{streamingContent}</div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <div className="input-container">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          rows={3}
        />
        <button onClick={handleSend} disabled={!input.trim()}>
          Send
        </button>
      </div>

      <style>{`
        .conversation-view {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .messages-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .message {
          margin-bottom: 16px;
          padding: 12px;
          border-radius: 8px;
        }

        .message-user {
          background: #e3f2fd;
          margin-left: 20%;
        }

        .message-assistant {
          background: #f5f5f5;
          margin-right: 20%;
        }

        .message-system {
          background: #fff3e0;
          font-size: 0.9em;
        }

        .message-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 0.8em;
          color: #666;
        }

        .message-content {
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .streaming {
          opacity: 0.8;
        }

        .input-container {
          display: flex;
          padding: 16px;
          border-top: 1px solid #ddd;
          background: #fff;
        }

        .input-container textarea {
          flex: 1;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          resize: none;
          font-family: inherit;
        }

        .input-container button {
          margin-left: 8px;
          padding: 8px 16px;
          background: #1976d2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }

        .input-container button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};
