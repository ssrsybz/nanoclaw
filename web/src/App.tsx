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
        // Use conversationId for routing, fallback to activeConversationId
        const conversationId = data.conversationId || activeConversationIdRef.current;
        if (!conversationId) return;

        switch (data.type) {
          case 'connected':
            setConnected(true);
            break;

          case 'typing':
            setTyping(true);
            break;

          // Legacy text message (backward compat)
          case 'message':
            if (data.content) {
              setTyping(false);
              appendMessage(conversationId, { role: 'assistant', content: data.content });
            }
            break;

          // Streaming: new assistant text chunk
          case 'assistant':
            setTyping(false);
            appendMessage(conversationId, { role: 'assistant', content: data.content, parts: [{ type: 'text', text: data.content }] });
            break;

          // Streaming: thinking/reasoning content
          case 'thinking':
            appendPart(conversationId, { type: 'thinking', text: data.content });
            break;

          // Streaming: tool use
          case 'tool_use':
            appendPart(conversationId, { type: 'tool_use', toolName: data.toolName, toolInput: data.toolInput });
            break;

          // Streaming: tool result
          case 'tool_result':
            if (data.content) {
              appendPart(conversationId, { type: 'text', text: data.content });
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
  }, [setConnected, setTyping, appendMessage, appendPart]);

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
    const handleSend = (e: Event) => {
      const { content } = (e as CustomEvent).detail;
      const ws = wsRef.current;
      const conversationId = activeConversationIdRef.current;
      const workspaceId = activeWorkspaceIdRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (!conversationId || !workspaceId) return;
      setTyping(true);
      ws.send(JSON.stringify({
        type: 'message',
        content,
        workspaceId,
        conversationId,
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
