/**
 * Built-in skills definition for OKClaw
 * These are SDK/MCP capabilities exposed as skill entries with Chinese names.
 * They are display-only metadata — no SKILL.md files exist for these.
 * skillType is 'builtin', source is 'builtin', readOnly is true.
 */

import type { SkillCategory, SkillType, SkillSource } from './types.js';

export interface BuiltinSkill {
  name: string; // English identifier (used for command)
  nameZh: string; // Chinese name (for display)
  description: string; // Chinese description
  category: SkillCategory;
  icon?: string; // Emoji icon
  skillType: SkillType;
  source: SkillSource;
  readOnly: true;
}

/**
 * Built-in skills from SDK and MCP tools
 */
export const BUILTIN_SKILLS: BuiltinSkill[] = [
  // Core SDK capabilities
  {
    name: 'plan',
    nameZh: '规划模式',
    description: '进入规划模式，先分析问题设计方案，再执行',
    category: 'core',
    icon: '📋',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'team',
    nameZh: '团队协作',
    description: '创建多个 Agent 协作完成任务',
    category: 'core',
    icon: '👥',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'search',
    nameZh: '网络搜索',
    description: '搜索互联网获取最新信息',
    category: 'core',
    icon: '🔍',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'fetch',
    nameZh: '网页抓取',
    description: '抓取网页内容进行分析',
    category: 'core',
    icon: '🌐',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'bash',
    nameZh: '执行命令',
    description: '在沙盒环境中执行 Shell 命令',
    category: 'core',
    icon: '⚡',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'read',
    nameZh: '读取文件',
    description: '读取本地文件内容',
    category: 'core',
    icon: '📄',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'write',
    nameZh: '写入文件',
    description: '创建或覆盖写入文件',
    category: 'core',
    icon: '✏️',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'edit',
    nameZh: '编辑文件',
    description: '对现有文件进行精确编辑',
    category: 'core',
    icon: '🔧',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },

  // MCP tools
  {
    name: 'send-message',
    nameZh: '发送消息',
    description: '向用户或群组发送消息',
    category: 'mcp',
    icon: '💬',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'schedule',
    nameZh: '定时任务',
    description: '创建定时或周期性任务',
    category: 'mcp',
    icon: '⏰',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
  {
    name: 'list-tasks',
    nameZh: '任务列表',
    description: '查看所有定时任务',
    category: 'mcp',
    icon: '📝',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },

  // Channel tools
  {
    name: 'register-group',
    nameZh: '注册群组',
    description: '注册新的聊天群组',
    category: 'channel',
    icon: '📢',
    skillType: 'builtin',
    source: 'builtin',
    readOnly: true,
  },
];

/**
 * Get skills grouped by category
 */
export function getSkillsByCategory(): Record<SkillCategory, BuiltinSkill[]> {
  const result: Record<SkillCategory, BuiltinSkill[]> = {
    core: [],
    mcp: [],
    channel: [],
    system: [],
    workspace: [],
  };

  for (const skill of BUILTIN_SKILLS) {
    result[skill.category].push(skill);
  }

  return result;
}

/**
 * Find a builtin skill by name (English or Chinese)
 */
export function findBuiltinSkill(name: string): BuiltinSkill | undefined {
  return BUILTIN_SKILLS.find((s) => s.name === name || s.nameZh === name);
}
