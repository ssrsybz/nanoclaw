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

/**
 * Skill type distinguishes the nature of the skill:
 * - builtin: SDK/MCP tool capability, display-only, no SKILL.md
 * - operational: Pure instruction workflow (e.g., /setup, /debug)
 * - utility: SKILL.md with supporting scripts or resource files
 * - feature: Installed via skill/* branch (future)
 * - workspace: User-created workspace-local skill
 */
export type SkillType = 'builtin' | 'operational' | 'utility' | 'feature' | 'workspace';

/**
 * Skill source identifies where the skill comes from:
 * - builtin: Hardcoded in builtin-skills.ts
 * - system: From the skills/ directory at project root
 * - workspace: From {workspace}/.claude/skills/
 * - marketplace: From a plugin marketplace (future)
 */
export type SkillSource = 'builtin' | 'system' | 'workspace' | 'marketplace';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  enabledSkills: string[];
  createdAt: string;
  lastUsedAt: string | null;
  /** Workspace avatar: null = no icon, "iconify:prefix:name" = library icon, "<svg...>" = custom SVG */
  icon: string | null;
}

export interface Skill {
  name: string;           // English identifier
  nameZh?: string;        // Chinese name (for display)
  description: string;    // What this skill does and when to use it
  path: string;
  enabled: boolean;
  hasSkillMd: boolean;
  category?: SkillCategory;
  icon?: string;          // Emoji icon
  // Legacy flags
  isBuiltin?: boolean;    // From SDK/MCP
  isSystem?: boolean;     // From skills/ directory
  // New fields — NanoClaw-style skill model
  skillType?: SkillType;
  source?: SkillSource;
  allowedTools?: string[];
  dependencies?: string[];
  version?: string;
  author?: string;
  readOnly?: boolean;
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

/**
 * Find the workspaceId that contains a given conversationId.
 * Used by touchWorkspace to promote the workspace when a message arrives.
 */
function findWorkspaceIdForConversation(conversations: Record<string, Conversation[]>, conversationId: string): string | null {
  for (const [wsId, convs] of Object.entries(conversations)) {
    if (convs.some((c) => c.id === conversationId)) return wsId;
  }
  return null;
}

/**
 * Promote a workspace to the top of the sidebar (WeChat-style).
 * Updates lastUsedAt to now and re-sorts the workspace list.
 */
function touchWorkspace(state: { workspaces: Workspace[]; conversations: Record<string, Conversation[]> }, conversationId: string): { workspaces: Workspace[] } | null {
  const wsId = findWorkspaceIdForConversation(state.conversations, conversationId);
  if (!wsId) return null;
  const now = new Date().toISOString();
  const updated = state.workspaces.map((ws) =>
    ws.id === wsId ? { ...ws, lastUsedAt: now } : ws
  );
  return { workspaces: sortWorkspaces(updated) };
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
  source?: 'upload' | 'workspace-file';
  workspaceId?: string;
  relativePath?: string;
  mimeType?: string;
  size?: number;
  truncated?: boolean;
}

export interface ProjectFileEntry {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  size?: number;
  mtimeMs?: number;
  extension?: string;
  previewable: boolean;
}

export interface ProjectFilePreview {
  relativePath: string;
  filename: string;
  type: 'text' | 'document' | 'binary' | 'too-large' | 'unsupported';
  size: number;
  mtimeMs: number;
  content?: string;
  extractedText?: string;
  truncated: boolean;
  canAttach: boolean;
  reason?: string;
}

export type ResourcePanelTab = 'skills' | 'files' | 'context';

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
  // Keyed by conversationId to support concurrent agents in multiple conversations
  streamingThinking: Record<string, StreamingThinking | null>;
  setStreamingThinking: (f: ((current: Record<string, StreamingThinking | null>) => Record<string, StreamingThinking | null>) | Record<string, StreamingThinking | null>) => void;

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

  // Right resource panel
  resourcePanelTab: ResourcePanelTab;
  contextAttachments: AttachmentInfo[];

  // Workspace methods
  setConnected: (v: boolean) => void;
  fetchWorkspaces: () => Promise<void>;
  addWorkspace: (path?: string) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  /** Set or clear workspace avatar icon */
  updateWorkspaceIcon: (id: string, icon: string | null) => Promise<void>;

  // Resource panel methods
  setResourcePanelTab: (tab: ResourcePanelTab) => void;
  addContextAttachment: (attachment: AttachmentInfo) => void;
  removeContextAttachment: (fileId: string) => void;
  clearContextAttachments: () => void;

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
  /** Append a text token delta to the last assistant message's last text part */
  appendToTextPart: (conversationId: string, delta: string) => void;
  clearMessages: (conversationId: string) => void;
  /** Start a new assistant turn (create or reuse incomplete turn) */
  startAssistantTurn: (conversationId: string, messageId?: string) => void;
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
  streamingThinking: {},
  pendingQuestion: null,
  connected: false,
  typingConversations: {},
  llmConfig: null,
  resourcePanelTab: 'skills',
  contextAttachments: [],

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

  setResourcePanelTab: (tab) => set({ resourcePanelTab: tab }),
  addContextAttachment: (attachment) => set({ contextAttachments: [attachment] }),
  removeContextAttachment: (fileId) => set((state) => ({
    contextAttachments: state.contextAttachments.filter((a) => a.fileId !== fileId),
  })),
  clearContextAttachments: () => set({ contextAttachments: [] }),

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
            contextAttachments: [],
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
          contextAttachments: isActive ? [] : state.contextAttachments,
        };
      });
    } catch (err) {
      console.error('Failed to remove workspace:', err);
    }
  },

  switchWorkspace: async (id) => {
    // Only switch workspace, don't clear messages
    set({ activeWorkspaceId: id, activeConversationId: null, contextAttachments: [] });
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

  updateWorkspaceIcon: async (id, icon) => {
    try {
      const res = await fetch(`/api/workspaces/${id}/icon`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icon }),
      });
      if (!res.ok) {
        const data = await res.json();
        console.error('Failed to update workspace icon:', data.error);
        return;
      }
      const data = await res.json();
      if (data.workspace) {
        set((state) => {
          const newWorkspaces = state.workspaces.map((ws) =>
            ws.id === id ? { ...ws, icon: data.workspace.icon } : ws
          );
          return { workspaces: sortWorkspaces(newWorkspaces) };
        });
      }
    } catch (err) {
      console.error('Failed to update workspace icon:', err);
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

      // Fetch running agent states so the sidebar can show which conversations
      // are still executing in the background.
      try {
        const stRes = await fetch(`/api/workspaces/${workspaceId}/agent-states`);
        const stData = await stRes.json();
        const running: Record<string, boolean> = {};
        for (const [convId, status] of Object.entries(stData.agentStates || {})) {
          if (status === 'running') running[convId] = true;
        }
        set((state) => ({
          typingConversations: { ...state.typingConversations, ...running },
        }));
      } catch (err) {
        console.error('Failed to fetch agent states:', err);
      }
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

    // Request reconnection recovery so a conversation that is still running in the
    // background (or already completed while we were elsewhere) replays any missed
    // messages or reports its final state.
    const msgs = get().messages[conversationId] || [];
    const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
    const lastReceivedIndex = lastAssistant?.parts?.length || 0;
    sendWsMessage({
      type: 'resume',
      conversationId,
      lastReceivedIndex,
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
          // Preserve an in-flight (no id, not yet completed) assistant turn
          // being driven by the live WebSocket / resume replay. Without this,
          // the DB fetch (which only contains completed turns) would overwrite
          // the running turn, causing the streaming process to "disappear then
          // reappear" when reconnecting mid-turn.
          const lastExisting = existingMessages[existingMessages.length - 1];
          if (
            lastExisting &&
            lastExisting.role === 'assistant' &&
            !lastExisting._turnComplete &&
            !lastExisting.id
          ) {
            mergedMessages.push(lastExisting);
          }
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
      ...(touchWorkspace(state, conversationId) || {}),
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

      // Note: persistence is handled by the backend at stream_end — the frontend
      // only keeps the local display state in sync here.
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

  appendToTextPart: (conversationId, delta) => {
    if (!delta) return;
    set((state) => {
      const msgs = state.messages[conversationId] || [];
      if (msgs.length === 0) return state;

      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.role !== 'assistant' || lastMsg._turnComplete) return state;

      const parts = [...(lastMsg.parts || [])];
      // Find the last text part to append to; create one if none exists.
      let lastTextIdx = -1;
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].type === 'text') {
          lastTextIdx = i;
          break;
        }
      }
      if (lastTextIdx >= 0) {
        const tp = parts[lastTextIdx] as TextPart;
        parts[lastTextIdx] = { ...tp, text: tp.text + delta };
      } else {
        parts.push({ type: 'text', text: delta });
      }

      return {
        messages: {
          ...state.messages,
          [conversationId]: [
            ...msgs.slice(0, -1),
            {
              ...lastMsg,
              content: (lastMsg.content || '') + delta,
              parts,
            },
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

  startAssistantTurn: (conversationId, messageId?: string) =>
    set((state) => {
      const msgs = state.messages[conversationId] || [];
      // If last message is an incomplete assistant turn, reuse it
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg?.role === 'assistant' && !lastMsg._turnComplete) {
        // Still promote workspace even when reusing turn
        return { ...(touchWorkspace(state, conversationId) || {}) };
      }
      // Otherwise create new empty assistant message with pre-generated id
      return {
        ...(touchWorkspace(state, conversationId) || {}),
        messages: {
          ...state.messages,
          [conversationId]: [
            ...msgs,
            {
              id: messageId, // Stable id from backend (prevents DOM re-mount)
              role: 'assistant' as const,
              content: '',
              parts: [] as ContentPart[],
            },
          ],
        },
      };
    }),

  finishAssistantTurn: (conversationId, model, apiCalls) => {
    // The backend persists the complete turn at stream_end; here we only finalize
    // the local display state.
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
