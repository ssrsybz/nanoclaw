import { useMemo, useRef } from 'react';
import { useExternalStoreRuntime, type AppendMessage } from '@assistant-ui/react';
import { useStore } from './store';

const EMPTY_MESSAGES: never[] = [];

export function useChatRuntime() {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const activeConversationId = useStore((s) => s.activeConversationId);
  const appendMessage = useStore((s) => s.appendMessage);
  const isTyping = useStore((s) => s.isTyping);
  const isRunning = activeConversationId ? isTyping(activeConversationId) : false;

  const rawMessages = useStore((s) =>
    s.activeWorkspaceId ? s.messages[s.activeWorkspaceId] : undefined
  );
  const messages = rawMessages ?? EMPTY_MESSAGES;

  const activeWorkspaceIdRef = useRef(activeWorkspaceId);
  activeWorkspaceIdRef.current = activeWorkspaceId;

  const adapter = useMemo(
    () => ({
      isRunning,
      messages,
      convertMessage: (msg: { role: 'user' | 'assistant'; content: string }) => ({
        role: msg.role,
        content: msg.content,
      }),
      onNew: async (message: AppendMessage) => {
        // Extract text from AppendMessage content
        let content = '';
        if (typeof message.content === 'string') {
          content = message.content;
        } else if (Array.isArray(message.content)) {
          content = message.content
            .filter((p): p is { type: 'text'; text: string } => 'text' in p && p.type === 'text')
            .map((p) => p.text)
            .join('');
        }

        if (!content.trim()) return;
        const wsId = activeWorkspaceIdRef.current;
        if (!wsId) return;

        appendMessage(wsId, { role: 'user', content });
        window.dispatchEvent(
          new CustomEvent('okclaw-send', { detail: { content, workspaceId: wsId } })
        );
      },
      onCancel: async () => {
        window.dispatchEvent(new CustomEvent('okclaw-cancel'));
      },
    }),
    [messages, isRunning, appendMessage]
  );

  return useExternalStoreRuntime(adapter);
}
