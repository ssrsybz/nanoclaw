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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  skills: Skill[];
  connected: boolean;
  messages: Record<string, ChatMessage[]>;
  typing: boolean;

  setConnected: (v: boolean) => void;
  setTyping: (v: boolean) => void;
  appendMessage: (workspaceId: string, msg: ChatMessage) => void;
  clearMessages: (workspaceId: string) => void;
  fetchWorkspaces: () => Promise<void>;
  addWorkspace: () => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  fetchSkills: () => Promise<void>;
  toggleSkill: (skillName: string) => Promise<void>;
}

export const useStore = create<WorkspaceStore>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  skills: [],
  connected: false,
  messages: {},
  typing: false,

  setConnected: (v) => set({ connected: v }),
  setTyping: (v) => set({ typing: v }),

  appendMessage: (workspaceId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [workspaceId]: [...(state.messages[workspaceId] || []), msg],
      },
    })),

  clearMessages: (workspaceId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [workspaceId]: [],
      },
    })),

  fetchWorkspaces: async () => {
    try {
      const res = await fetch('/api/workspaces');
      const data = await res.json();
      set({ workspaces: data.workspaces || [] });
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
  },

  addWorkspace: async () => {
    try {
      const pickerRes = await fetch('/api/folder-picker', { method: 'POST' });
      const pickerData = await pickerRes.json();
      if (!pickerData.path) return;

      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pickerData.path }),
      });
      const data = await res.json();
      if (data.workspace) {
        set((state) => ({
          workspaces: [...state.workspaces, data.workspace],
          activeWorkspaceId: data.workspace.id,
        }));
        await get().fetchSkills();
      }
    } catch (err) {
      console.error('Failed to add workspace:', err);
    }
  },

  removeWorkspace: async (id) => {
    try {
      await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
      set((state) => {
        const newWorkspaces = state.workspaces.filter((w) => w.id !== id);
        const isActive = state.activeWorkspaceId === id;
        return {
          workspaces: newWorkspaces,
          activeWorkspaceId: isActive ? null : state.activeWorkspaceId,
          skills: isActive ? [] : state.skills,
        };
      });
    } catch (err) {
      console.error('Failed to remove workspace:', err);
    }
  },

  switchWorkspace: async (id) => {
    set({ activeWorkspaceId: id });
    try {
      await fetch(`/api/workspaces/${id}/last-used`, { method: 'PUT' });
    } catch {
      // non-critical
    }
    await get().fetchSkills();
  },

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
}));
