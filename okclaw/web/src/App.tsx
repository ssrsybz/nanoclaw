import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore, WS_MSG_TYPES, sendWsMessage, type Skill } from './store';
import WorkspaceSidebar from './components/WorkspaceSidebar';
import AssistantChat from './components/AssistantChat';
import SkillsPanel from './components/SkillsPanel';
import QuestionDialog from './components/QuestionDialog';
import RemoteControlPanel from './components/RemoteControlPanel';

export default function App() {
  const [showRemoteControl, setShowRemoteControl] = useState(false);
  const {
    fetchWorkspaces,
    switchWorkspace,
    setConnected,
    setTyping,
    appendMessage,
    appendPart,
    appendToTextPart,
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

        // Request reconnection recovery for active conversation
        const msgs = useStore.getState().messages[activeConversationId] || [];
        const lastAssistant = [...msgs].reverse().find((m: any) => m.role === 'assistant');
        const lastReceivedIndex = lastAssistant?.parts?.length || 0;
        sendWsMessage({
          type: 'resume',
          conversationId: activeConversationId,
          lastReceivedIndex,
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

          case 'text_delta':
            // Token-level text streaming: append the fragment to the running
            // turn's last text part (typing-style UI). The full block is still
            // emitted as 'assistant' / persisted at stream_end.
            if (data.content) {
              appendToTextPart(conversationId, data.content);
            }
            break;

          case 'thinking_delta':
            // Token-level thinking streaming: accumulate into the dedicated
            // streaming thinking state (not parts, per existing design).
            // Keyed by conversationId to support concurrent agents.
            if (data.content) {
              setStreamingThinking((cur) => ({
                ...cur,
                [conversationId]: {
                  thinking: (cur[conversationId]?.thinking || '') + data.content,
                  isStreaming: true,
                },
              }));
            }
            break;

          case 'stream_start':
            // Agent starts working — create empty assistant turn container
            // Backend pre-generates messageId for stable frontend state
            setTyping(conversationId, true);
            startAssistantTurn(conversationId, data.messageId);
            // Clear stale streaming thinking for this conversation
            setStreamingThinking((cur) => ({ ...cur, [conversationId]: null }));
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
            // Keyed by conversationId for concurrent agent support.
            setStreamingThinking((cur) => ({
              ...cur,
              [conversationId]: {
                thinking: data.content,
                isStreaming: true,
              },
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
            const allThinking = useStore.getState().streamingThinking;
            const finalThinking = allThinking[conversationId];
            if (finalThinking && finalThinking.thinking) {
              appendPart(conversationId, {
                type: 'thinking',
                text: finalThinking.thinking,
                status: 'complete',
              });
            }
            // Mark streaming thinking as complete (will auto-hide after 30s in UI)
            setStreamingThinking((current) => ({
              ...current,
              [conversationId]: current[conversationId]
                ? { ...current[conversationId], isStreaming: false, streamingEndedAt: Date.now() }
                : null,
            }));

            completeThinkingParts(conversationId);
            // The backend is now the sole persistence point (it writes the complete
            // assistant turn to conversation_messages at stream_end). The frontend only
            // finalizes the local turn state here.
            finishAssistantTurn(conversationId, data.model, data.apiCalls);
            setTyping(conversationId, false);
            break;
          }

          case 'agent_state_changed': {
            // Real-time running-state broadcast: another conversation in this
            // workspace started/finished running. Keep the sidebar indicator fresh.
            if (data.conversationId && data.status) {
              setTyping(data.conversationId, data.status === 'running');
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

          case 'agent_resumed': {
            // Reconnection recovery: replay missed messages
            const { missedMessages } = data;
            if (missedMessages && missedMessages.length > 0) {
              // Start a new assistant turn if needed
              const msgs = useStore.getState().messages[conversationId] || [];
              const lastMsg = msgs[msgs.length - 1];
              if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg._turnComplete) {
                startAssistantTurn(conversationId);
              }
              // Replay each missed message
              for (const msg of missedMessages) {
                if (msg.type === 'assistant' && msg.data?.content) {
                  appendPart(conversationId, { type: 'text', text: msg.data.content });
                } else if (msg.type === 'thinking' && msg.data?.content) {
                  setStreamingThinking((cur) => ({
                    ...cur,
                    [conversationId]: {
                      thinking: msg.data.content,
                      isStreaming: true,
                    },
                  }));
                } else if (msg.type === 'tool_use') {
                  appendPart(conversationId, {
                    type: 'tool_use',
                    toolName: msg.data?.toolName,
                    toolInput: msg.data?.toolInput,
                    toolMeta: msg.data?.toolMeta,
                  });
                } else if (msg.type === 'tool_result' && msg.data?.content) {
                  appendPart(conversationId, {
                    type: 'tool_result',
                    content: msg.data.content,
                    toolMeta: msg.data?.toolMeta,
                  });
                }
              }
            }
            setTyping(conversationId, true);
            break;
          }

          case 'agent_state': {
            // Agent state response on reconnection
            if (data.status === 'none' || data.status === 'complete' || data.status === 'error') {
              // Check if there's an incomplete assistant turn in the frontend
              const msgs = useStore.getState().messages[conversationId] || [];
              const lastMsg = [...msgs].reverse().find((m: any) => m.role === 'assistant');
              if (lastMsg && !(lastMsg as any)._turnComplete) {
                // Agent is gone (server restart or error) — mark the turn as complete
                // with a recovery hint
                appendPart(conversationId, {
                  type: 'text',
                  text: '\n\n⚠️ 连接已恢复，但之前的任务状态丢失。请重新发送消息继续。',
                });
                finishAssistantTurn(conversationId);
                setTyping(conversationId, false);
              }
            }
            break;
          }

          case 'connection_replaced': {
            // Another tab/window has taken over this conversation
            // Show a brief notification and let the old connection close gracefully
            console.warn('WebSocket connection replaced by another tab:', data.message);
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
  }, [setConnected, setTyping, appendMessage, appendPart, appendToTextPart, startAssistantTurn, finishAssistantTurn, setStreamingThinking]);

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
        // Search across all skill sources: skillsByCategory (builtin + system + feature) + workspace skills
        const { skillsByCategory, skills } = useStore.getState();
        const allSkills = [...(Object.values(skillsByCategory) as Skill[][]).flat(), ...skills];
        const skill = allSkills.find(s => s.name === skillName || s.name === `/${skillName}`);

        if (skill) {
          try {
            // Use unified /api/skills/content endpoint with correct source parameter
            const source = skill.source === 'workspace' ? 'workspace'
              : skill.skillType === 'feature' ? 'feature'
              : 'system';
            const params = new URLSearchParams({ source, name: skillName });
            if (source === 'workspace' && workspaceId) {
              params.set('workspaceId', workspaceId);
            }
            const res = await fetch(`/api/skills/content?${params}`);
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
      // Store user message immediately for instant display.
      // The backend persists the user message on receipt (web channel onMessage),
      // so the frontend no longer POSTs it — avoids a double write and keeps the
      // history complete even if the frontend is not subscribed.
      appendMessage(conversationId, { role: 'user', content: content || '', attachment });

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
    <div className="flex h-screen w-screen overflow-hidden bg-app">
      <WorkspaceSidebar />
      <AssistantChat />
      <SkillsPanel />
      <QuestionDialog />

      {/* Remote Control Floating Button */}
      <button
        onClick={() => setShowRemoteControl(true)}
        className="fixed bottom-4 right-4 bg-accent hover:bg-accent-hover text-white p-3 rounded-full shadow-lg z-40"
        title="远程控制"
      >
        📱
      </button>

      {/* Remote Control Panel */}
      {showRemoteControl && (
        <RemoteControlPanel onClose={() => setShowRemoteControl(false)} />
      )}
    </div>
  );
}

