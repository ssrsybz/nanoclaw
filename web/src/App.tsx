import { useEffect, useRef, useCallback } from 'react';
import { useStore } from './store';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import ChatPanel from './components/ChatPanel';
import SkillsPanel from './components/SkillsPanel';

export default function App() {
  const { fetchWorkspaces, setConnected, setTyping, appendMessage, activeWorkspaceId } = useStore();
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    const loc = window.location;
    const wsPort = loc.port || '3100';
    const wsUrl = `ws://${loc.hostname}:${wsPort}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          connectWebSocket();
        }
      }, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          setConnected(true);
        } else if (data.type === 'message' && data.content) {
          setTyping(false);
          const workspaceId = data.workspaceId || activeWorkspaceId;
          if (workspaceId) {
            appendMessage(workspaceId, { role: 'assistant', content: data.content });
          }
        } else if (data.type === 'typing') {
          setTyping(true);
        }
      } catch {
        // ignore non-JSON messages
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };
  }, [setConnected, setTyping, appendMessage, activeWorkspaceId]);

  useEffect(() => {
    fetchWorkspaces();
    connectWebSocket();

    return () => {
      wsRef.current?.close();
    };
  }, [fetchWorkspaces, connectWebSocket]);

  const sendMessage = useCallback((content: string) => {
    if (!activeWorkspaceId) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    appendMessage(activeWorkspaceId, { role: 'user', content });
    ws.send(JSON.stringify({
      type: 'message',
      content,
      workspaceId: activeWorkspaceId,
    }));
  }, [activeWorkspaceId, appendMessage]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1a2e]">
      <WorkspaceSidebar />
      <ChatPanel sendMessage={sendMessage} />
      <SkillsPanel />
    </div>
  );
}
