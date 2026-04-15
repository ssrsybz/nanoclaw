import { useEffect, useRef, useCallback } from 'react';
import { useStore } from './store';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import AssistantChat from './components/AssistantChat';
import SkillsPanel from './components/SkillsPanel';

export default function App() {
  const {
    fetchWorkspaces,
    switchWorkspace,
    setConnected,
    setTyping,
    appendMessage,
    appendPart,
    startAssistantTurn,
    finishAssistantTurn,
    activeWorkspaceId,
    activeConversationId,
  } = useStore();

  const wsRef = useRef<WebSocket | null>(null);
  const activeConversationIdRef = useRef(activeConversationId);
  const activeWorkspaceIdRef = useRef(activeWorkspaceId);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    activeWorkspaceIdRef.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  const connectWebSocket = useCallback(() => {
    const loc = window.location;
    const wsPort = loc.port === '5173' ? '3100' : (loc.port || '3100');
    const wsUrl = `ws://${loc.hostname}:${wsPort}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const conversationId = data.conversationId || activeConversationIdRef.current;
        if (!conversationId) return;

        switch (data.type) {
          case 'connected':
            setConnected(true);
            break;

          case 'typing':
            setTyping(true);
            break;

          case 'stream_start':
            // Agent starts working — create empty assistant turn container
            setTyping(true);
            startAssistantTurn(conversationId);
            break;

          case 'assistant': {
            // Check if there's an in-progress assistant turn to append to
            const msgs = useStore.getState().messages[conversationId] || [];
            const lastMsg = msgs[msgs.length - 1];
            if (lastMsg?.role === 'assistant' && !lastMsg._turnComplete) {
              // Append to existing turn
              appendPart(conversationId, { type: 'text', text: data.content });
            } else {
              // Create new turn (backward compat for non-stream_start servers)
              appendMessage(conversationId, {
                role: 'assistant',
                content: data.content,
                parts: [{ type: 'text', text: data.content }],
              });
            }
            break;
          }

          case 'thinking':
            appendPart(conversationId, { type: 'thinking', text: data.content });
            break;

          case 'tool_use':
            appendPart(conversationId, { type: 'tool_use', toolName: data.toolName, toolInput: data.toolInput });
            break;

          case 'tool_result':
            if (data.content) {
              appendPart(conversationId, { type: 'tool_result', content: data.content });
            }
            break;

          case 'stream_end': {
            // Debug: log received data
            console.log('[stream_end] Received:', { model: data.model, apiCalls: data.apiCalls });
            // Persist the complete assistant turn to backend
            finishAssistantTurn(conversationId, data.model, data.apiCalls);
            setTyping(false);
            // Persist complete turn (including parts) to backend
            const currentMsgs = useStore.getState().messages[conversationId] || [];
            const lastAssistant = [...currentMsgs].reverse().find((m) => m.role === 'assistant' && m._turnComplete);
            if (lastAssistant && activeWorkspaceIdRef.current) {
              fetch(`/api/workspaces/${activeWorkspaceIdRef.current}/conversations/${conversationId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  role: 'assistant',
                  content: lastAssistant.content,
                  parts: lastAssistant.parts,
                }),
              }).catch((err) => console.error('Failed to persist assistant turn:', err));
            }
            break;
          }

          // Legacy fallback
          case 'message':
            if (data.content) {
              setTyping(false);
              appendMessage(conversationId, { role: 'assistant', content: data.content });
            }
            break;
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, [setConnected, setTyping, appendMessage, appendPart, startAssistantTurn, finishAssistantTurn]);

  useEffect(() => {
    fetchWorkspaces().then(() => {
      // After fetching workspaces, switch to first workspace to trigger conversation loading
      const { workspaces, activeWorkspaceId: wsId } = useStore.getState();
      if (workspaces.length > 0 && !wsId) {
        switchWorkspace(workspaces[0].id);
      } else if (wsId) {
        switchWorkspace(wsId);
      }
    });
    connectWebSocket();
    return () => { wsRef.current?.close(); };
  }, [fetchWorkspaces, switchWorkspace, connectWebSocket]);

  // Forward send/cancel events from AssistantChat to WebSocket
  useEffect(() => {
    const handleSend = async (e: Event) => {
      const { content, attachment } = (e as CustomEvent).detail;
      const ws = wsRef.current;
      const conversationId = activeConversationIdRef.current;
      const workspaceId = activeWorkspaceIdRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (!conversationId || !workspaceId) return;

      if (!content && !attachment) return;

      setTyping(true);
      // Store user message immediately for instant display
      appendMessage(conversationId, { role: 'user', content: content || '', attachment });

      // Persist message to backend via API
      try {
        await fetch(`/api/workspaces/${workspaceId}/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'user',
            content: content || `[附件: ${attachment?.filename}]`,
            attachment,
          }),
        });
      } catch (err) {
        console.error('Failed to persist message:', err);
      }

      ws.send(JSON.stringify({
        type: 'message',
        content: content || `[附件: ${attachment?.filename}]`,
        workspaceId,
        conversationId,
        attachment,
      }));
    };

    const handleCancel = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
      }
      setTyping(false);
    };

    window.addEventListener('nanoclaw-send', handleSend);
    window.addEventListener('nanoclaw-cancel', handleCancel);
    return () => {
      window.removeEventListener('nanoclaw-send', handleSend);
      window.removeEventListener('nanoclaw-cancel', handleCancel);
    };
  }, [setTyping]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1a2e]">
      <WorkspaceSidebar />
      <AssistantChat />
      <SkillsPanel />
    </div>
  );
}
