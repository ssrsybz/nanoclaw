import { create } from 'zustand';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  enabledSkills: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Skill {
  name: string;
  description: string;
  path: string;
  enabled: boolean;
  hasSkillMd: boolean;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// Rich message content parts
export interface TextPart {
  type: 'text';
  text: string;
}

export interface ThinkingPart {
  type: 'thinking';
  text: string;
}

export interface ToolUsePart {
  type: 'tool_use';
  toolName: string;
  toolInput?: string;
}

export interface ToolResultPart {
  type: 'tool_result';
  content: string;
  toolUseId?: string;
}

export type ContentPart = TextPart | ThinkingPart | ToolUsePart | ToolResultPart;

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

  // Connection state
  connected: boolean;
  typing: boolean;

  // Workspace methods
  setConnected: (v: boolean) => void;
  fetchWorkspaces: () => Promise<void>;
  addWorkspace: (path?: string) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;

  // Skill methods
  fetchSkills: () => Promise<void>;
  toggleSkill: (skillName: string) => Promise<void>;

  // Conversation methods
  fetchConversations: (workspaceId: string) => Promise<void>;
  createConversation: (workspaceId: string) => Promise<Conversation | null>;
  switchConversation: (conversationId: string) => void;
  renameConversation: (workspaceId: string, id: string, name: string) => Promise<void>;
  deleteConversation: (workspaceId: string, id: string) => Promise<void>;

  // Message methods
  setTyping: (v: boolean) => void;
  appendMessage: (conversationId: string, msg: ChatMessage) => void;
  /** Append a content part to the last assistant message */
  appendPart: (conversationId: string, part: ContentPart) => void;
  clearMessages: (conversationId: string) => void;
  /** Start a new assistant turn (create or reuse incomplete turn) */
  startAssistantTurn: (conversationId: string) => void;
  /** Mark the current assistant turn as complete */
  finishAssistantTurn: (conversationId: string, model?: string, apiCalls?: ChatMessage['apiCalls']) => void;
}

export const useStore = create<WorkspaceStore>((set, get) => ({
  // Initial state
  workspaces: [],
  activeWorkspaceId: null,
  conversations: {},
  activeConversationId: null,
  messages: {},
  skills: [],
  connected: false,
  typing: false,

  // Connection state
  setConnected: (v) => set({ connected: v }),
  setTyping: (v) => set({ typing: v }),

  // --- Workspace methods ---

  fetchWorkspaces: async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      set({ workspaces: data.workspaces || [] });
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
        alert(data.error || '添加工作空间失败');
        return;
      }
      if (data.workspace || data.id) {
        const ws = data.workspace || data;
        set((state) => ({
          workspaces: [...state.workspaces, ws],
          activeWorkspaceId: ws.id,
          activeConversationId: null,
          messages: {},
        }));
        await get().fetchSkills();
        await get().createConversation(ws.id);
      }
    } catch (err) {
      console.error('Failed to add workspace:', err);
      alert('添加工作空间失败: ' + (err instanceof Error ? err.message : String(err)));
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
    set({ activeWorkspaceId: id, activeConversationId: null, messages: {} });
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

  // --- Conversation methods ---

  fetchConversations: async (workspaceId) => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/conversations`);
      const data = await res.json();
      set((state) => ({
        conversations: {
          ...state.conversations,
          [workspaceId]: data.conversations || [],
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
        set((state) => ({
          conversations: {
            ...state.conversations,
            [workspaceId]: [...(state.conversations[workspaceId] || []), conv],
          },
          activeConversationId: conv.id,
          messages: {
            ...state.messages,
            [conv.id]: [],
          },
        }));
        return conv;
      }
    } catch (err) {
      console.error('Failed to create conversation:', err);
    }
    return null;
  },

  switchConversation: async (conversationId) => {
    set({ activeConversationId: conversationId });
    // Load messages for the conversation from backend
    const { activeWorkspaceId } = get();
    if (!activeWorkspaceId || !conversationId) return;
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
      await fetch(`/api/workspaces/${workspaceId}/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      set((state) => ({
        conversations: {
          ...state.conversations,
          [workspaceId]: state.conversations[workspaceId]?.map((c) =>
            c.id === id ? { ...c, name } : c
          ) || [],
        },
      }));
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
        const newConversations = state.conversations[workspaceId]?.filter((c) => c.id !== id) || [];
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

  appendPart: (conversationId, part) =>
    set((state) => {
      const msgs = state.messages[conversationId] || [];
      if (msgs.length === 0) return state;

      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.role !== 'assistant') return state;

      const updatedParts = [...(lastMsg.parts || []), part];
      const updatedContent =
        part.type === 'text'
          ? (lastMsg.content || '') + part.text
          : lastMsg.content;

      return {
        messages: {
          ...state.messages,
          [conversationId]: [
            ...msgs.slice(0, -1),
            { ...lastMsg, content: updatedContent, parts: updatedParts },
          ],
        },
      };
    }),

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

  finishAssistantTurn: (conversationId, model, apiCalls) =>
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
    }),
}));
