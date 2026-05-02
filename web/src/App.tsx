import { useEffect, useRef, useCallback } from 'react';
import { useStore, WS_MSG_TYPES, sendWsMessage } from './store';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import AssistantChat from './components/AssistantChat';
import SkillsPanel from './components/SkillsPanel';
import QuestionDialog from './components/QuestionDialog';

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
    completeThinkingParts,
    setStreamingThinking,
    setPendingQuestion,
    fetchSystemSkills,
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

    // Expose WebSocket for QuestionDialog to submit answers
    (window as any).okclawWebSocket = ws;

    ws.onopen = () => {
      setConnected(true);
      const { activeWorkspaceId, activeConversationId } = useStore.getState();
      if (activeWorkspaceId && activeConversationId) {
        sendWsMessage({
          type: WS_MSG_TYPES.SWITCH_CONVERSATION,
          workspaceId: activeWorkspaceId,
          conversationId: activeConversationId,
        });
      }
    };
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

        // For connection status, handle globally
        if (data.type === 'connected') {
          setConnected(true);
          return;
        }

        // All other messages must have conversationId
        const conversationId = data.conversationId;
        if (!conversationId) return;

        switch (data.type) {
          case 'typing':
            setTyping(conversationId, true);
            break;

          case 'stream_start':
            // Agent starts working — create empty assistant turn container
            setTyping(conversationId, true);
            startAssistantTurn(conversationId);
            // Clear stale streaming thinking from previous turn
            setStreamingThinking(() => null);
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
            // Update streaming thinking state (like Claude Code's approach).
            // Don't append to parts during streaming — a single completed part
            // will be appended when the thinking block finishes.
            setStreamingThinking(() => ({
              thinking: data.content,
              isStreaming: true,
            }));
            break;

          case 'tool_use':
            appendPart(conversationId, {
              type: 'tool_use',
              toolName: data.toolName,
              toolInput: data.toolInput,
              toolMeta: data.toolMeta,
            });
            break;

          case 'tool_result':
            if (data.content) {
              appendPart(conversationId, {
                type: 'tool_result',
                content: data.content,
                toolMeta: data.toolMeta,
              });
            }
            break;

          case 'ask_user_question':
            // Agent is asking the user questions - show dialog
            if (data.questions && data.toolUseId) {
              setPendingQuestion({
                toolUseId: data.toolUseId,
                conversationId,
                questions: data.questions,
                timestamp: Date.now(),
              });
            }
            break;

          case 'stream_end': {
            // Snapshot final streaming thinking and append as a single complete part
            const finalThinking = useStore.getState().streamingThinking;
            if (finalThinking && finalThinking.thinking) {
              appendPart(conversationId, {
                type: 'thinking',
                text: finalThinking.thinking,
                status: 'complete',
              });
            }
            // Mark streaming thinking as complete (will auto-hide after 30s in UI)
            setStreamingThinking((current) =>
              current ? { ...current, isStreaming: false, streamingEndedAt: Date.now() } : null
            );

            completeThinkingParts(conversationId);
            // Persist the complete assistant turn to backend
            finishAssistantTurn(conversationId, data.model, data.apiCalls);
            setTyping(conversationId, false);
            // Persist complete turn (including parts) to backend
            // Find the workspaceId from the conversation (not from activeWorkspaceIdRef)
            const { conversations } = useStore.getState();
            let workspaceIdForPersist: string | null = null;
            for (const [wsId, convList] of Object.entries(conversations)) {
              if (convList.some(c => c.id === conversationId)) {
                workspaceIdForPersist = wsId;
                break;
              }
            }
            const currentMsgs = useStore.getState().messages[conversationId] || [];
            const lastAssistant = [...currentMsgs].reverse().find((m) => m.role === 'assistant' && m._turnComplete);

            // Persist assistant message and then generate title
            if (workspaceIdForPersist) {
              const persistPromise = lastAssistant
                ? fetch(`/api/workspaces/${workspaceIdForPersist}/conversations/${conversationId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      role: 'assistant',
                      content: lastAssistant.content,
                      parts: lastAssistant.parts,
                      model: data.model,
                      apiCalls: data.apiCalls,
                    }),
                  }).catch((err) => console.error('Failed to persist assistant turn:', err))
                : Promise.resolve();

              // Wait for persistence to complete
              persistPromise.catch(err => console.error('Failed to persist:', err));
            }
            break;
          }

          case 'conversation_renamed': {
            // Server generated a new title for the conversation
            const { workspaceId: wsId, newName } = data;
            if (wsId && newName) {
              useStore.getState().renameConversation(wsId, conversationId, newName);
            }
            break;
          }

          // Legacy fallback
          case 'message':
            if (data.content) {
              setTyping(conversationId, false);
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
  }, [setConnected, setTyping, appendMessage, appendPart, startAssistantTurn, finishAssistantTurn, setStreamingThinking]);

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
    fetchSystemSkills();
    connectWebSocket();
    return () => { wsRef.current?.close(); };
  }, [fetchWorkspaces, switchWorkspace, connectWebSocket, fetchSystemSkills]);

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

      // Parse skill command
      let skillData: { name: string; content: string } | undefined;
      let processedContent = content || '';
      const skillMatch = processedContent.match(/^\/([a-zA-Z0-9_-]+)\s*/);
      if (skillMatch) {
        const skillName = skillMatch[1];
        const { systemSkills, skills } = useStore.getState();
        const allSkills = [...systemSkills, ...skills];
        const skill = allSkills.find(s => s.name === skillName || s.name === `/${skillName}`);

        if (skill) {
          try {
            const isSystem = skill.isSystem || systemSkills.includes(skill);
            const res = isSystem
              ? await fetch(`/api/system-skills/${skillName}/content`)
              : await fetch(`/api/workspaces/${workspaceId}/skills/${skillName}/content`);
            const data = await res.json();
            if (data.content) {
              skillData = { name: skillName, content: data.content };
              // Remove skill command prefix from content
              processedContent = processedContent.replace(/^\/[a-zA-Z0-9_-]+\s*/, '');
            }
          } catch (err) {
            console.error('Failed to fetch skill content:', err);
          }
        }
      }

      setTyping(conversationId, true);
      // Store user message immediately for instant display
      // Display original content (with skill prefix if present) to user
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
        content: processedContent || `[附件: ${attachment?.filename}]`,
        workspaceId,
        conversationId,
        attachment,
        skill: skillData,
      }));
    };

    const handleCancel = () => {
      const ws = wsRef.current;
      const conversationId = activeConversationIdRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stop' }));
      }
      if (conversationId) {
        setTyping(conversationId, false);
      }
    };

    window.addEventListener('okclaw-send', handleSend);
    window.addEventListener('okclaw-cancel', handleCancel);
    return () => {
      window.removeEventListener('okclaw-send', handleSend);
      window.removeEventListener('okclaw-cancel', handleCancel);
    };
  }, [setTyping]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#1a1a2e]">
      <WorkspaceSidebar />
      <AssistantChat />
      <SkillsPanel />
      <QuestionDialog />
    </div>
  );
}
