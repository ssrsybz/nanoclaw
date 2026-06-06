/**
 * Compose the system prompt for an agent session.
 *
 * This module implements the NanoClaw-style prompt composition:
 * 1. Base CLAUDE.md (group-specific)
 * 2. Channel-specific formatting skill (auto-detected from chatJid)
 * 3. Enabled workspace skills
 * 4. MCP tool module instructions
 *
 * The key design principle: formatting rules are auto-injected based on
 * the active channel, not manually invoked via slash commands.
 */

import fs from 'fs';
import path from 'path';

import { GROUPS_DIR, PROJECT_ROOT } from './config.js';
import { parseSkillMd } from './skill-parser.js';
import { logger } from './logger.js';

// Map of chatJid prefixes to formatting skill names
const CHANNEL_FORMATTING_MAP: Record<string, string> = {
  web: 'web-formatting',
  dc: 'discord-formatting',
  fs: 'feishu-formatting',
};

export interface ComposeOptions {
  groupFolder: string; // 'web-main', 'main', etc.
  chatJid: string; // 'web:ws-xxx', 'dc:xxx', 'fs:xxx'
  workspacePath?: string;
  enabledSkills?: string[];
}

/**
 * Compose the full system prompt for an agent session.
 *
 * Returns the composed prompt string with all skill fragments injected.
 */
export function composeSystemPrompt(options: ComposeOptions): string {
  const { groupFolder, chatJid, workspacePath, enabledSkills } = options;
  const parts: string[] = [];

  // 1. Base CLAUDE.md
  const baseClaudeMd = loadBaseClaudeMd(groupFolder);
  if (baseClaudeMd) {
    parts.push(baseClaudeMd);
  }

  // 2. Workspace context (inject working directory info)
  if (workspacePath) {
    parts.push(
      `\n<workspace_context>
Current working directory: ${workspacePath}

When the user asks you to explore, search, or work with files:
- Start from this directory (${workspacePath})
- Use this as the root for all relative paths
- Run commands with this as the current working directory
</workspace_context>\n`,
    );
    logger.debug({ workspacePath }, 'Injected workspace context into system prompt');
  }

  // 3. Channel-specific formatting skill (auto-inject based on chatJid)
  const channelSkill = detectChannelSkill(chatJid);
  if (channelSkill) {
    const channelInstructions = loadSkillInstructions(channelSkill);
    if (channelInstructions) {
      parts.push(
        `\n<channel_formatting channel="${channelSkill}">\n${channelInstructions}\n</channel_formatting>\n`,
      );
      logger.debug(
        { channelSkill, chatJid },
        'Auto-injected channel formatting skill',
      );
    }
  }

  // 4. Enabled workspace skills
  if (enabledSkills && enabledSkills.length > 0 && workspacePath) {
    const skillPrompt = buildEnabledSkillPrompt(workspacePath, enabledSkills);
    if (skillPrompt) {
      parts.push(skillPrompt);
    }
  }

  // 5. MCP tool module instructions
  const mcpInstructions = loadMcpInstructions();
  if (mcpInstructions) {
    parts.push(mcpInstructions);
  }

  const result = parts.join('\n');
  return result || 'You are a helpful AI assistant.';
}

/**
 * Load the base CLAUDE.md for a group folder.
 * Falls back to global CLAUDE.md if group-specific one doesn't exist.
 */
function loadBaseClaudeMd(groupFolder: string): string | undefined {
  // Try group-specific CLAUDE.md first
  const groupClaudeMd = path.join(GROUPS_DIR, groupFolder, 'CLAUDE.md');
  if (fs.existsSync(groupClaudeMd)) {
    return fs.readFileSync(groupClaudeMd, 'utf-8');
  }

  // Fall back to global CLAUDE.md
  const globalClaudeMd = path.join(GROUPS_DIR, 'global', 'CLAUDE.md');
  if (fs.existsSync(globalClaudeMd)) {
    return fs.readFileSync(globalClaudeMd, 'utf-8');
  }

  return undefined;
}

/**
 * Detect which channel-specific formatting skill to use based on chatJid prefix.
 * Returns the skill name (e.g., 'web-formatting', 'discord-formatting') or undefined.
 */
function detectChannelSkill(chatJid: string): string | undefined {
  const prefix = chatJid.split(':')[0];
  return CHANNEL_FORMATTING_MAP[prefix];
}

/**
 * Load a skill's instructions.md fragment (the terse, always-injected version).
 * Falls back to the full SKILL.md body if no instructions.md exists.
 */
function loadSkillInstructions(skillName: string): string | undefined {
  const skillsDir = path.join(PROJECT_ROOT, 'skills');
  const skillDir = path.join(skillsDir, skillName);

  // Try instructions.md first (the terse always-injected version)
  const instructionsPath = path.join(skillDir, 'instructions.md');
  if (fs.existsSync(instructionsPath)) {
    return fs.readFileSync(instructionsPath, 'utf-8');
  }

  // Fall back to SKILL.md body (strip frontmatter)
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(skillMdPath)) {
    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const parsed = parseSkillMd(content);
    return parsed.body;
  }

  return undefined;
}

/**
 * Build the enabled workspace skills section of the system prompt.
 * Reads each skill's SKILL.md, strips frontmatter, and wraps in XML tags.
 * Respects the 32KB total size limit.
 */
function buildEnabledSkillPrompt(
  workspacePath: string,
  enabledSkills: string[],
): string {
  const MAX_SKILL_BYTES = 32 * 1024;
  let totalBytes = 0;
  const parts: string[] = [];

  for (const skillName of enabledSkills) {
    const skillMdPath = path.join(
      workspacePath,
      '.claude',
      'skills',
      skillName,
      'SKILL.md',
    );
    if (!fs.existsSync(skillMdPath)) continue;

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    // Strip frontmatter — only inject the body instructions
    const body = stripFrontmatter(content);
    const wrapped = `<skill name="${skillName}" source="workspace">\n${body}\n</skill>\n`;
    if (totalBytes + wrapped.length > MAX_SKILL_BYTES) break;
    parts.push(wrapped);
    totalBytes += wrapped.length;
  }

  if (parts.length === 0) return '';
  return `\n<enabled_skills>\n${parts.join('')}</enabled_skills>\n`;
}

/**
 * Load MCP tool module instructions.
 * These are key usage rules for the MCP tools that the agent should always know.
 */
function loadMcpInstructions(): string | undefined {
  // Load MCP instruction fragments from src/mcp-server.instructions.md if it exists
  const instructionsPath = path.join(
    PROJECT_ROOT,
    'src',
    'mcp-server.instructions.md',
  );
  if (fs.existsSync(instructionsPath)) {
    return fs.readFileSync(instructionsPath, 'utf-8');
  }

  return undefined;
}

/**
 * Strip YAML frontmatter from content, returning only the body.
 */
function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (match) {
    return content.slice(match[0].length);
  }
  return content;
}

/**
 * Check if a channel adapter is installed by looking at the barrel file.
 */
export function isChannelInstalled(channelName: string): boolean {
  const indexPath = path.join(PROJECT_ROOT, 'src', 'channels', 'index.ts');
  if (!fs.existsSync(indexPath)) return false;

  const content = fs.readFileSync(indexPath, 'utf-8');
  return content.includes(`import './${channelName}.js';`);
}

/**
 * Get the list of installed channel names by parsing the barrel file.
 */
export function getInstalledChannels(): string[] {
  const indexPath = path.join(PROJECT_ROOT, 'src', 'channels', 'index.ts');
  if (!fs.existsSync(indexPath)) return ['web']; // web is always present

  const content = fs.readFileSync(indexPath, 'utf-8');
  const importRegex = /import\s+'\.\/(\w+)\.js';/g;
  const channels: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    channels.push(match[1]);
  }

  return channels;
}
