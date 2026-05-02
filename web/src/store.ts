import { create } from 'zustand';

// WebSocket message types
export const WS_MSG_TYPES = {
  SWITCH_CONVERSATION: 'switch_conversation',
  ASK_USER_QUESTION_RESPONSE: 'ask_user_question_response',
} as const;

// Helper to send WebSocket messages safely
export function sendWsMessage(msg: object) {
  const ws = (window as any).okclawWebSocket;
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export type SkillCategory = 'core' | 'mcp' | 'channel' | 'system' | 'workspace';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  enabledSkills: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Skill {
  name: string;           // English identifier
  nameZh?: string;        // Chinese name (for display)
  description: string;    // Description (Chinese preferred)
  path: string;
  enabled: boolean;
  hasSkillMd: boolean;
  category?: SkillCategory;
  icon?: string;          // Emoji icon
  isBuiltin?: boolean;    // From SDK/MCP
  isSystem?: boolean;     // From skills/ directory
}

export interface Conversation {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// ============ Stable Sorting Utilities ============
// These ensure consistent ordering even when timestamps are identical

function sortWorkspaces(workspaces: Workspace[]): Workspace[] {
  return [...workspaces].sort((a, b) => {
    // lastUsedAt DESC (non-null first)
    if (a.lastUsedAt && b.lastUsedAt) {
      const cmp = b.lastUsedAt.localeCompare(a.lastUsedAt);
      if (cmp !== 0) return cmp;
    } else if (a.lastUsedAt && !b.lastUsedAt) {
      return -1;
    } else if (!a.lastUsedAt && b.lastUsedAt) {
      return 1;
    }
    // createdAt DESC
    const createdCmp = b.createdAt.localeCompare(a.createdAt);
    if (createdCmp !== 0) return createdCmp;
    // id DESC as final tiebreaker
    return b.id.localeCompare(a.id);
  });
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    // updatedAt DESC
    const updatedCmp = b.updatedAt.localeCompare(a.updatedAt);
    if (updatedCmp !== 0) return updatedCmp;
    // id DESC as final tiebreaker
    return b.id.localeCompare(a.id);
  });
}

// Rich message content parts
export interface TextPart {
  type: 'text';
  text: string;
}

export interface ThinkingPart {
  type: 'thinking';
  text: string;
  status?: 'running' | 'complete';
  duration?: number; // thinking duration in seconds
  startTime?: number; // timestamp when thinking started (Date.now())
}

// Tool metadata for enhanced UI display
export interface ToolMeta {
  icon: string;           // emoji icon
  displayText: string;    // friendly display text
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;        // optional detail info
}

export interface ToolUsePart {
  type: 'tool_use';
  toolName: string;
  toolInput?: string;
  toolMeta?: ToolMeta;
}

export interface ToolResultPart {
  type: 'tool_result';
  content: string;
  toolUseId?: string;
  toolMeta?: ToolMeta;
}

export type ContentPart = TextPart | ThinkingPart | ToolUsePart | ToolResultPart;

// Question types for AskUserQuestion tool
export interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

// Pending question from agent
export interface PendingQuestion {
  toolUseId: string;
  conversationId: string;
  questions: Question[];
  timestamp: number;
}

// Streaming thinking state (like Claude Code's StreamingThinking)
// Lives outside the messages array — updated live during streaming,
// appended as a single part when the thinking block completes.
export type StreamingThinking = {
  thinking: string;
  isStreaming: boolean;
  streamingEndedAt?: number;
};

export interface AttachmentInfo {
  fileId: string;
  filename: string;
  extractedText: string;
  filePath: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  // Rich content parts for assistant messages
  parts?: ContentPart[];
  // File attachment info
  attachment?: AttachmentInfo;
  /** Internal: marks if this assistant turn is complete (received stream_end) */
  _turnComplete?: boolean;
  /** Model used for this response */
  model?: string;
  /** API call statistics */
  apiCalls?: {
    total: number;
    systemInit: number;
    assistantThinking: number;
    assistantText: number;
    assistantToolUse: number;
    toolResults: number;
  };
}

export interface LLMConfig {
  config: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  source: 'project' | 'global';
}

interface WorkspaceStore {
  // Workspace state
  workspaces: Workspace[];
  activeWorkspaceId: string | null;

  // Conversation state (keyed by workspaceId)
  conversations: Record<string, Conversation[]>;
  activeConversationId: string | null;

  // Messages (keyed by conversationId)
  messages: Record<string, ChatMessage[]>;

  // Skills
  skills: Skill[];

  // System skills (built-in)
  systemSkills: Skill[];

  // All skills by category (from discover API)
  skillsByCategory: Record<SkillCategory, Skill[]>;

  // Streaming thinking — lives outside messages array, like Claude Code's approach
  streamingThinking: StreamingThinking | null;
  setStreamingThinking: (f: ((current: StreamingThinking | null) => StreamingThinking | null) | StreamingThinking | null) => void;

  // Pending question from agent (AskUserQuestion tool)
  pendingQuestion: PendingQuestion | null;
  setPendingQuestion: (question: PendingQuestion | null) => void;
  submitQuestionAnswer: (toolUseId: string, conversationId: string, answers: Record<string, string>, annotations?: Record<string, { preview?: string; notes?: string }>, cancelled?: boolean) => void;

  // Connection state
  connected: boolean;
  // Typing state per conversation (keyed by conversationId)
  typingConversations: Record<string, boolean>;

  // LLM Config
  llmConfig: LLMConfig | null;

  // Workspace methods
  setConnected: (v: boolean) => void;
  fetchWorkspaces: () => Promise<void>;
  addWorkspace: (path?: string) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;

  // Skill methods
  fetchSkills: () => Promise<void>;
  toggleSkill: (skillName: string) => Promise<void>;
  fetchSystemSkills: () => Promise<void>;
  discoverSkills: () => Promise<Record<SkillCategory, Skill[]>>;

  // Conversation methods
  fetchConversations: (workspaceId: string) => Promise<void>;
  createConversation: (workspaceId: string) => Promise<Conversation | null>;
  switchConversation: (conversationId: string) => void;
  renameConversation: (workspaceId: string, id: string, name: string) => Promise<void>;
  deleteConversation: (workspaceId: string, id: string) => Promise<void>;

  // Message methods
  setTyping: (conversationId: string, v: boolean) => void;
  isTyping: (conversationId: string) => boolean;
  appendMessage: (conversationId: string, msg: ChatMessage) => void;
  /** Append a content part to the last assistant message */
  appendPart: (conversationId: string, part: ContentPart) => void;
  clearMessages: (conversationId: string) => void;
  /** Start a new assistant turn (create or reuse incomplete turn) */
  startAssistantTurn: (conversationId: string) => void;
  /** Mark the current assistant turn as complete */
  finishAssistantTurn: (conversationId: string, model?: string, apiCalls?: ChatMessage['apiCalls']) => void;
  /** Mark all thinking parts in the current turn as complete */
  completeThinkingParts: (conversationId: string) => void;

  // LLM Config methods
  fetchLLMConfig: () => Promise<void>;
  updateLLMConfig: (config: { apiKey?: string; baseUrl?: string; model?: string }) => Promise<boolean>;
}

const emptySkillsByCategory: Record<SkillCategory, Skill[]> = {
  core: [],
  mcp: [],
  channel: [],
  system: [],
  workspace: [],
};

// ============ Streaming Message Persistence ============
// Borrowed from Claude Code's approach: batch persist every 500ms

interface PendingPersist {
  conversationId: string;
  messageId: string | null; // null means we need to create a new message
  content: string;
  parts: ContentPart[];
}

// Pending persists keyed by conversationId
const pendingPersists = new Map<string, PendingPersist>();
let persistTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Queue a message for persistence. Called on every appendPart.
 * The actual persist happens every 500ms via batchPersist.
 */
function queuePersist(conversationId: string, content: string, parts: ContentPart[]) {
  pendingPersists.set(conversationId, {
    conversationId,
    messageId: null, // Will be resolved during persist
    content,
    parts,
  });

  // Start timer if not running
  if (!persistTimer) {
    persistTimer = setInterval(batchPersist, 500);
  }
}

/**
 * Batch persist all pending messages to backend.
 * Uses fire-and-forget to avoid blocking the UI.
 */
async function batchPersist() {
  if (pendingPersists.size === 0) {
    if (persistTimer) {
      clearInterval(persistTimer);
      persistTimer = null;
    }
    return;
  }

  // Take a snapshot of pending persists
  const entries = Array.from(pendingPersists.entries());
  pendingPersists.clear();

  for (const [conversationId, pending] of entries) {
    try {
      // First, get or create the message ID
      let messageId = pending.messageId;

      if (!messageId) {
        // Check if there's an existing assistant message
        const lastMsgRes = await fetch(`/api/conversations/${conversationId}/messages/last-assistant`);
        const lastMsgData = await lastMsgRes.json();

        if (lastMsgData.message?.id) {
          messageId = lastMsgData.message.id;
        } else {
          // Create new message
          const { conversations } = useStore.getState();
          let workspaceId: string | null = null;
          for (const [wsId, convList] of Object.entries(conversations)) {
            if (convList.some(c => c.id === conversationId)) {
              workspaceId = wsId;
              break;
            }
          }
          if (!workspaceId) continue;

          const createRes = await fetch(`/api/workspaces/${workspaceId}/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              role: 'assistant',
              content: pending.content,
              parts: pending.parts,
            }),
          });
          const createData = await createRes.json();
          messageId = createData.message?.id;
        }
      }

      if (messageId) {
        // Update the message
        await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: pending.content,
            parts: pending.parts,
          }),
        });
      }
    } catch (err) {
      console.error('Failed to persist streaming message:', err);
    }
  }
}

/**
 * Stop the persist timer (call on stream_end or component unmount)
 * Currently unused but kept for future use
 */
export function stopPersistTimer() {
  if (persistTimer) {
    clearInterval(persistTimer);
    persistTimer = null;
  }
}

export const useStore = create<WorkspaceStore>((set, get) => ({
  // Initial state
  workspaces: [],
  activeWorkspaceId: null,
  conversations: {},
  activeConversationId: null,
  messages: {},
  skills: [],
  systemSkills: [],
  skillsByCategory: emptySkillsByCategory,
  streamingThinking: null,
  pendingQuestion: null,
  connected: false,
  typingConversations: {},
  llmConfig: null,

  setStreamingThinking: (f) =>
    set((state) => ({
      streamingThinking:
        typeof f === 'function' ? f(state.streamingThinking) : f,
    })),

  setPendingQuestion: (question) => set({ pendingQuestion: question }),

  submitQuestionAnswer: (toolUseId, conversationId, answers, annotations, cancelled = false) => {
    sendWsMessage({
      type: WS_MSG_TYPES.ASK_USER_QUESTION_RESPONSE,
      toolUseId,
      conversationId,
      answers,
      annotations,
      cancelled,
    });
    set({ pendingQuestion: null });
  },

  // Connection state
  setConnected: (v) => set({ connected: v }),
  setTyping: (conversationId, v) => set((state) => ({
    typingConversations: { ...state.typingConversations, [conversationId]: v },
  })),
  isTyping: (conversationId) => get().typingConversations[conversationId] || false,

  // --- Workspace methods ---

  fetchWorkspaces: async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      // Sort workspaces to ensure stable ordering
      const sorted = sortWorkspaces(data.workspaces || []);
      set({ workspaces: sorted });
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
  },

  addWorkspace: async (folderPath?: string) => {
    try {
      let wsPath = folderPath;
      if (!wsPath) {
        // Fallback to native folder picker
        const pickerRes = await fetch('/api/folder-picker', { method: 'POST' });
        const pickerData = await pickerRes.json();
        if (!pickerData.path) return;
        wsPath = pickerData.path;
      }

      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: wsPath }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '选择工作文件夹失败');
        return;
      }
      if (data.workspace || data.id) {
        const ws = data.workspace || data;
        set((state) => {
          const newWorkspaces = sortWorkspaces([...state.workspaces, ws]);
          return {
            workspaces: newWorkspaces,
            activeWorkspaceId: ws.id,
            activeConversationId: null,
            messages: {},
          };
        });
        await get().fetchSkills();
        await get().createConversation(ws.id);
      }
    } catch (err) {
      console.error('Failed to add workspace:', err);
      alert('选择工作文件夹失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  },

  removeWorkspace: async (id) => {
    try {
      await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
      set((state) => {
        const newWorkspaces = state.workspaces.filter((w) => w.id !== id);
        const isActive = state.activeWorkspaceId === id;
        const { [id]: _, ...restConversations } = state.conversations;
        return {
          workspaces: newWorkspaces,
          activeWorkspaceId: isActive ? null : state.activeWorkspaceId,
          conversations: restConversations,
          activeConversationId: isActive ? null : state.activeConversationId,
          skills: isActive ? [] : state.skills,
          messages: isActive ? {} : state.messages,
        };
      });
    } catch (err) {
      console.error('Failed to remove workspace:', err);
    }
  },

  switchWorkspace: async (id) => {
    // Only switch workspace, don't clear messages
    set({ activeWorkspaceId: id, activeConversationId: null });
    try {
      await fetch(`/api/workspaces/${id}/last-used`, { method: 'PUT' });
    } catch {
      // non-critical
    }
    await get().fetchSkills();
    await get().fetchConversations(id);
    // Auto-select first conversation or create new
    const convs = get().conversations[id];
    if (convs && convs.length > 0) {
      set({ activeConversationId: convs[0].id });
      // Load messages for the selected conversation
      await get().switchConversation(convs[0].id);
    } else {
      await get().createConversation(id);
    }
  },

  // --- Skill methods ---

  fetchSkills: async () => {
    const { activeWorkspaceId } = get();
    if (!activeWorkspaceId) {
      set({ skills: [] });
      return;
    }
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/skills`);
      const data = await res.json();
      set({ skills: data.skills || [] });
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  },

  toggleSkill: async (skillName) => {
    const { activeWorkspaceId, skills } = get();
    if (!activeWorkspaceId) return;

    const updated = skills.map((s) =>
      s.name === skillName ? { ...s, enabled: !s.enabled } : s
    );
    set({ skills: updated });

    try {
      await fetch(`/api/workspaces/${activeWorkspaceId}/enabled-skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skills: updated.filter((s) => s.enabled).map((s) => s.name) }),
      });
    } catch (err) {
      console.error('Failed to toggle skill:', err);
      set({ skills });
    }
  },

  fetchSystemSkills: async () => {
    try {
      const res = await fetch('/api/system-skills');
      const data = await res.json();
      set({ systemSkills: data.skills || [] });
    } catch (err) {
      console.error('Failed to fetch system skills:', err);
    }
  },

  discoverSkills: async () => {
    const { activeWorkspaceId } = get();
    try {
      const url = activeWorkspaceId
        ? `/api/skills/discover?workspaceId=${activeWorkspaceId}`
        : '/api/skills/discover';
      const res = await fetch(url);
      const data = await res.json();
      const skillsByCategory: Record<SkillCategory, Skill[]> = (data.skills || emptySkillsByCategory) as Record<SkillCategory, Skill[]>;
      set({ skillsByCategory });

      // Also update systemSkills for backward compatibility
      const allSkills: Skill[] = (Object.values(skillsByCategory) as Skill[][]).flat();
      set({ systemSkills: allSkills.filter((s: Skill) => s.isBuiltin || s.isSystem) });

      return skillsByCategory;
    } catch (err) {
      console.error('Failed to discover skills:', err);
      return emptySkillsByCategory;
    }
  },

  // --- Conversation methods ---

  fetchConversations: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/conversations`);
      const data = await res.json();
      // Sort conversations to ensure stable ordering
      const sorted = sortConversations(data.conversations || []);
      set((state) => ({
        conversations: {
          ...state.conversations,
          [workspaceId]: sorted,
        },
      }));
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  },

  createConversation: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/conversations`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.conversation) {
        const conv = data.conversation;
        set((state) => {
          const newConversations = sortConversations([
            ...(state.conversations[workspaceId] || []),
            conv,
          ]);
          return {
            conversations: {
              ...state.conversations,
              [workspaceId]: newConversations,
            },
            activeConversationId: conv.id,
            messages: {
              ...state.messages,
              [conv.id]: [],
            },
          };
        });
        return conv;
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
    return null;
  },

  switchConversation: async (conversationId) => {
    set({ activeConversationId: conversationId });
    const { activeWorkspaceId } = get();
    if (!activeWorkspaceId || !conversationId) return;

    sendWsMessage({
      type: WS_MSG_TYPES.SWITCH_CONVERSATION,
      workspaceId: activeWorkspaceId,
      conversationId,
    });

    try {
      const res = await fetch(`/api/workspaces/${activeWorkspaceId}/conversations/${conversationId}/messages`);
      const data = await res.json();
      if (data.messages) {
        set((state) => {
          const existingMessages = state.messages[conversationId] || [];
          // Merge: preserve metadata from existing messages, update content from DB
          const existingMap = new Map(existingMessages.map((m) => [m.id, m]));
          const mergedMessages = data.messages.map((m: any) => {
            const existing = existingMap.get(m.id);
            return {
              id: m.id,
              role: m.role,
              content: m.content,
              parts: m.parts,
              attachment: m.attachment,
              _turnComplete: true,
              // Preserve metadata from existing message if available
              model: existing?.model || m.model || undefined,
              apiCalls: existing?.apiCalls || m.apiCalls || undefined,
            };
          });
          return {
            messages: {
              ...state.messages,
              [conversationId]: mergedMessages,
            },
          };
        });
      }
    } catch (err) {
      console.error('Failed to load conversation messages:', err);
    }
  },

  renameConversation: async (workspaceId, id, name) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        console.error('Failed to rename conversation:', res.status, await res.text());
        return;
      }
      set((state) => {
        const updated = state.conversations[workspaceId]?.map((c) =>
          c.id === id ? { ...c, name } : c
        ) || [];
        return {
          conversations: {
            ...state.conversations,
            [workspaceId]: sortConversations(updated),
          },
        };
      });
    } catch (err) {
      console.error('Failed to rename conversation:', err);
    }
  },

  deleteConversation: async (workspaceId, id) => {
    try {
      await fetch(`/api/workspaces/${workspaceId}/conversations/${id}`, {
        method: 'DELETE',
      });
      set((state) => {
        const { [id]: _, ...restMessages } = state.messages;
        const newConversations = sortConversations(
          state.conversations[workspaceId]?.filter((c) => c.id !== id) || []
        );
        return {
          conversations: {
            ...state.conversations,
            [workspaceId]: newConversations,
          },
          messages: restMessages,
          activeConversationId:
            state.activeConversationId === id ? newConversations[0]?.id || null : state.activeConversationId,
        };
      });
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  },

  // --- Message methods ---

  appendMessage: (conversationId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [...(state.messages[conversationId] || []), msg],
      },
    })),

  appendPart: (conversationId, part) => {
    set((state) => {
      const msgs = state.messages[conversationId] || [];
      if (msgs.length === 0) return state;

      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.role !== 'assistant') return state;

      const existingParts = lastMsg.parts || [];

      // When a tool_result arrives, mark the last running tool_use as complete
      let partsWithStatus = existingParts;
      if (part.type === 'tool_result') {
        let marked = false;
        partsWithStatus = existingParts.map((p) => {
          if (!marked && p.type === 'tool_use') {
            const status = p.toolMeta?.status;
            if (!status || status === 'running' || status === 'pending') {
              marked = true;
              return {
                ...p,
                toolMeta: { ...(p.toolMeta || { icon: '🔧', displayText: p.toolName, status: 'pending' }), status: 'complete' as const },
              };
            }
          }
          return p;
        });
      }

      const updatedParts = [...partsWithStatus, part];
      const updatedContent =
        part.type === 'text'
          ? (lastMsg.content || '') + part.text
          : lastMsg.content;

      // Queue for persistence (fire-and-forget)
      queuePersist(conversationId, updatedContent, updatedParts);

      return {
        messages: {
          ...state.messages,
          [conversationId]: [
            ...msgs.slice(0, -1),
            { ...lastMsg, content: updatedContent, parts: updatedParts },
          ],
        },
      };
    });
  },

  clearMessages: (conversationId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: [],
      },
    })),

  startAssistantTurn: (conversationId) =>
    set((state) => {
      const msgs = state.messages[conversationId] || [];
      // If last message is an incomplete assistant turn, reuse it
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg?.role === 'assistant' && !lastMsg._turnComplete) {
        return state; // Reuse existing
      }
      // Otherwise create new empty assistant message
      return {
        messages: {
          ...state.messages,
          [conversationId]: [
            ...msgs,
            { role: 'assistant' as const, content: '', parts: [] as ContentPart[] },
          ],
        },
      };
    }),

  finishAssistantTurn: (conversationId, model, apiCalls) => {
    // Remove from pending persists - the final persist will be done by stream_end handler
    pendingPersists.delete(conversationId);

    set((state) => {
      const msgs = state.messages[conversationId] || [];
      if (msgs.length === 0) return state;
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg?.role === 'assistant' && !lastMsg._turnComplete) {
        return {
          messages: {
            ...state.messages,
            [conversationId]: [
              ...msgs.slice(0, -1),
              { ...lastMsg, _turnComplete: true, model, apiCalls },
            ],
          },
        };
      }
      return state;
    });
  },

  completeThinkingParts: (conversationId) =>
    set((state) => {
      const msgs = state.messages[conversationId] || [];
      if (msgs.length === 0) return state;

      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.role !== 'assistant' || !lastMsg.parts) return state;

      const now = Date.now();
      let anyChanged = false;

      const updatedParts = lastMsg.parts.map((part) => {
        if (part.type === 'thinking' && part.status === 'running') {
          anyChanged = true;
          const { startTime, ...rest } = part;
          const duration = startTime
            ? Math.round((now - startTime) / 100) / 10
            : undefined;
          return { ...rest, status: 'complete' as const, duration };
        }
        return part;
      });

      if (!anyChanged) return state;

      return {
        messages: {
          ...state.messages,
          [conversationId]: [
            ...msgs.slice(0, -1),
            { ...lastMsg, parts: updatedParts },
          ],
        },
      };
    }),

  // --- LLM Config methods ---

  fetchLLMConfig: async () => {
    try {
      const res = await fetch('/api/llm-config');
      const data = await res.json();
      set({ llmConfig: data });
    } catch (err) {
      console.error('Failed to fetch LLM config:', err);
    }
  },

  updateLLMConfig: async (config) => {
    try {
      const res = await fetch('/api/llm-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) return false;
      await res.json();
      // Refresh config after update
      await get().fetchLLMConfig();
      return true;
    } catch (err) {
      console.error('Failed to update LLM config:', err);
      return false;
    }
  },
}));
