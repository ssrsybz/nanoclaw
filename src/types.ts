export interface RegisteredGroup {
  name: string;
  folder: string;
  trigger: string;
  added_at: string;
  requiresTrigger?: boolean; // Default: true for groups, false for solo chats
  isMain?: boolean; // True for the main control group (no trigger, elevated privileges)
}

export interface AttachmentInfo {
  fileId: string;
  filename: string;
  extractedText: string;
  filePath: string;
}

export interface NewMessage {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me?: boolean;
  is_bot_message?: boolean;
  workspaceId?: string;
  conversationId?: string;
  attachment?: AttachmentInfo;
  skill?: {
    name: string;
    content: string;
  };
}

export interface ScheduledTask {
  id: string;
  group_folder: string;
  chat_jid: string;
  prompt: string;
  script?: string | null;
  schedule_type: 'cron' | 'interval' | 'once';
  schedule_value: string;
  context_mode: 'group' | 'isolated';
  next_run: string | null;
  last_run: string | null;
  last_result: string | null;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface TaskRunLog {
  task_id: string;
  run_at: string;
  duration_ms: number;
  status: 'success' | 'error';
  result: string | null;
  error: string | null;
}

// --- Channel abstraction ---

export interface Channel {
  name: string;
  connect(): Promise<void>;
  sendMessage(jid: string, text: string): Promise<void>;
  isConnected(): boolean;
  ownsJid(jid: string): boolean;
  disconnect(): Promise<void>;
  // Optional: typing indicator. Channels that support it implement it.
  setTyping?(jid: string, isTyping: boolean): Promise<void>;
  // Optional: sync group/chat names from the platform.
  syncGroups?(force: boolean): Promise<void>;
  // Optional: send structured message for rich UI (streaming, thinking, tool use)
  sendStructured?(jid: string, data: StreamMessage): Promise<void>;
}

// Structured message types for streaming UI
export interface StreamMessage {
  type:
    | 'assistant'
    | 'thinking'
    | 'tool_use'
    | 'tool_result'
    | 'stream_start'
    | 'stream_end'
    | 'conversation_renamed'
    | 'ask_user_question';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  // Tool metadata for enhanced UI display
  toolMeta?: ToolMeta;
  workspaceId?: string | null;
  conversationId?: string | null;
  model?: string;
  apiCalls?: {
    total: number;
    systemInit: number;
    assistantThinking: number;
    assistantText: number;
    assistantToolUse: number;
    toolResults: number;
  };
  // For conversation_renamed event
  newName?: string;
  // For ask_user_question
  questions?: Question[];
  toolUseId?: string;
}

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

// User's answer to a question
export interface QuestionAnswer {
  question: string;
  answer: string;
  notes?: string;
  preview?: string;
}

// Response from frontend for ask_user_question
export interface AskUserQuestionResponse {
  type: 'ask_user_question_response';
  toolUseId: string;
  conversationId: string;
  answers: Record<string, string>;
  annotations?: Record<string, { preview?: string; notes?: string }>;
  cancelled?: boolean;
}

// WebSocket message types for frontend-backend communication
export const WS_MSG_TYPES = {
  SWITCH_CONVERSATION: 'switch_conversation',
  ASK_USER_QUESTION_RESPONSE: 'ask_user_question_response',
} as const;

// Tool metadata for enhanced UI display
export interface ToolMeta {
  icon: string;           // emoji icon
  displayText: string;    // friendly display text
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;        // optional detail info
}

// Callback type that channels use to deliver inbound messages
export type OnInboundMessage = (chatJid: string, message: NewMessage) => void;

// Callback for chat metadata discovery.
// name is optional — channels that deliver names inline (Telegram) pass it here;
// channels that sync names separately (via syncGroups) omit it.
export type OnChatMetadata = (
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
) => void;

// --- Workspace & Skill types ---

export interface Workspace {
  id: string;
  name: string;
  path: string;
  enabledSkills: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export type SkillCategory = 'core' | 'mcp' | 'channel' | 'system' | 'workspace';

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
