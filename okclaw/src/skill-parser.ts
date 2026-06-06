/**
 * Unified SKILL.md parser for OKClaw
 *
 * Parses YAML frontmatter from SKILL.md files following the NanoClaw convention.
 * Supports both new-format (with frontmatter) and legacy (without frontmatter) skills.
 */

import type { SkillCategory, SkillSource, SkillType } from './types.js';

// --- Frontmatter types ---

export interface SkillFrontmatter {
  name: string;
  nameZh?: string;
  description: string;
  category?: SkillCategory;
  skillType?: SkillType;
  source?: SkillSource;
  'allowed-tools'?: string[];
  dependencies?: string[];
  version?: string;
  author?: string;
  icon?: string;
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string; // Markdown content after frontmatter
  raw: string; // Original file content
  hasFrontmatter: boolean;
  warnings: string[];
  errors: string[];
}

// --- Validation ---

const SKILL_NAME_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const MAX_SKILL_LINES = 500;

/**
 * Validate a skill name: lowercase alphanumeric + hyphens, max 64 chars.
 */
export function validateSkillName(name: string): string | null {
  if (!name) return 'name is required';
  if (name.length > 64) return 'name must be 64 characters or fewer';
  if (!SKILL_NAME_REGEX.test(name)) {
    return 'name must be lowercase alphanumeric with hyphens (e.g., my-skill)';
  }
  return null;
}

// --- Parser ---

/**
 * Parse a SKILL.md file content into frontmatter + body.
 *
 * Supports standard YAML frontmatter delimited by `---`:
 *
 * ```markdown
 * ---
 * name: my-skill
 * description: What this skill does
 * skillType: operational
 * allowed-tools:
 *   - Bash
 *   - Read
 * ---
 *
 * # Skill Instructions
 * ...
 * ```
 *
 * Also handles legacy SKILL.md files without frontmatter by extracting
 * the first non-empty, non-heading line as the description.
 */
export function parseSkillMd(content: string): ParsedSkill {
  const warnings: string[] = [];
  const errors: string[] = [];

  const trimmed = content.trim();

  // Check for YAML frontmatter
  const frontmatterMatch = trimmed.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (!frontmatterMatch) {
    // Legacy format — no frontmatter
    const description = extractLegacyDescription(trimmed);
    warnings.push('No YAML frontmatter found; using legacy format');
    return {
      frontmatter: {
        name: '',
        description,
      },
      body: trimmed,
      raw: content,
      hasFrontmatter: false,
      warnings,
      errors,
    };
  }

  const yamlStr = frontmatterMatch[1];
  const body = trimmed.slice(frontmatterMatch[0].length);
  const frontmatter = parseYamlFrontmatter(yamlStr, warnings, errors);

  // Validate
  if (!frontmatter.name) {
    errors.push('name is required in frontmatter');
  } else {
    const nameError = validateSkillName(frontmatter.name);
    if (nameError) errors.push(nameError);
  }

  if (!frontmatter.description) {
    errors.push('description is required in frontmatter');
  }

  // Check line count
  const lineCount = content.split('\n').length;
  if (lineCount > MAX_SKILL_LINES) {
    warnings.push(
      `SKILL.md has ${lineCount} lines (recommended max: ${MAX_SKILL_LINES})`,
    );
  }

  return {
    frontmatter,
    body,
    raw: content,
    hasFrontmatter: true,
    warnings,
    errors,
  };
}

/**
 * Simple YAML frontmatter parser.
 * Handles: string, string[], and simple key-value pairs.
 * Does NOT handle nested objects, quoted strings with colons, or multi-line values.
 */
function parseYamlFrontmatter(
  yaml: string,
  warnings: string[],
  _errors: string[],
): SkillFrontmatter {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Array item (indented with - prefix)
    if (trimmed.startsWith('- ') && currentKey && currentArray !== null) {
      currentArray.push(trimmed.slice(2).trim());
      continue;
    }

    // Flush previous array if we're moving to a new key
    if (currentKey && currentArray !== null) {
      result[currentKey] = currentArray;
      currentArray = null;
      currentKey = null;
    }

    // Key-value pair
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (!value) {
      // Empty value — might be start of an array
      currentKey = key;
      currentArray = [];
      continue;
    }

    // Remove surrounding quotes if present
    const unquoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1)
        : value;

    result[key] = unquoted;
  }

  // Flush final array
  if (currentKey && currentArray !== null) {
    result[currentKey] = currentArray;
  }

  // Map to SkillFrontmatter with known keys
  const frontmatter: SkillFrontmatter = {
    name: asString(result.name) || '',
    description: asString(result.description) || '',
  };

  if (result.nameZh) frontmatter.nameZh = asString(result.nameZh);
  if (result.category) {
    const cat = asString(result.category);
    if (
      cat &&
      ['core', 'mcp', 'channel', 'system', 'workspace'].includes(cat)
    ) {
      frontmatter.category = cat as SkillCategory;
    } else if (cat) {
      warnings.push(`Invalid category: ${cat}`);
    }
  }
  if (result.skillType) {
    const st = asString(result.skillType);
    if (
      st &&
      ['builtin', 'operational', 'utility', 'feature', 'workspace'].includes(st)
    ) {
      frontmatter.skillType = st as SkillType;
    } else if (st) {
      warnings.push(`Invalid skillType: ${st}`);
    }
  }
  if (result.source) {
    const s = asString(result.source);
    if (s && ['builtin', 'system', 'workspace', 'marketplace'].includes(s)) {
      frontmatter.source = s as SkillSource;
    } else if (s) {
      warnings.push(`Invalid source: ${s}`);
    }
  }
  if (result['allowed-tools']) {
    frontmatter['allowed-tools'] = asStringArray(result['allowed-tools']);
  }
  if (result.dependencies) {
    frontmatter.dependencies = asStringArray(result.dependencies);
  }
  if (result.version) frontmatter.version = asString(result.version);
  if (result.author) frontmatter.author = asString(result.author);
  if (result.icon) frontmatter.icon = asString(result.icon);

  return frontmatter;
}

function asString(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  return undefined;
}

function asStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string') return [val];
  return [];
}

/**
 * Extract a description from a legacy SKILL.md (no frontmatter).
 * Returns the first non-empty, non-heading line.
 */
function extractLegacyDescription(content: string): string {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      return trimmed;
    }
  }
  return '';
}

/**
 * Scan a directory for skill subdirectories with SKILL.md files.
 * Returns parsed skill metadata for each found skill.
 */
export function scanSkillDirectory(
  dirPath: string,
  options?: {
    enabledSkills?: string[];
    source?: SkillSource;
    defaultSkillType?: SkillType;
    readOnly?: boolean;
  },
): Array<{
  name: string;
  description: string;
  nameZh?: string;
  path: string;
  hasSkillMd: boolean;
  enabled: boolean;
  category?: SkillCategory;
  skillType?: SkillType;
  source?: SkillSource;
  allowedTools?: string[];
  dependencies?: string[];
  icon?: string;
  readOnly?: boolean;
  warnings: string[];
  errors: string[];
}> {
  const fs = await_import_fs();
  const results: Array<{
    name: string;
    description: string;
    nameZh?: string;
    path: string;
    hasSkillMd: boolean;
    enabled: boolean;
    category?: SkillCategory;
    skillType?: SkillType;
    source?: SkillSource;
    allowedTools?: string[];
    dependencies?: string[];
    icon?: string;
    readOnly?: boolean;
    warnings: string[];
    errors: string[];
  }> = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(dirPath);
  } catch {
    return results;
  }

  const enabledSkills = options?.enabledSkills ?? [];
  const source = options?.source;
  const defaultSkillType = options?.defaultSkillType;
  const readOnly = options?.readOnly ?? false;

  for (const entry of entries) {
    const skillPath = `${dirPath}/${entry}`;
    let stat;
    try {
      stat = fs.statSync(skillPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const skillMdPath = `${skillPath}/SKILL.md`;
    const hasSkillMd = fs.existsSync(skillMdPath);

    if (!hasSkillMd) {
      // Directory without SKILL.md — skip
      continue;
    }

    let content: string;
    try {
      content = fs.readFileSync(skillMdPath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = parseSkillMd(content);
    const fm = parsed.frontmatter;

    // Use directory name as fallback for skill name
    const name = fm.name || entry;

    results.push({
      name,
      description: fm.description || '',
      nameZh: fm.nameZh,
      path: skillPath,
      hasSkillMd: true,
      enabled: enabledSkills.includes(name),
      category: fm.category,
      skillType: fm.skillType || defaultSkillType,
      source: fm.source || source,
      allowedTools: fm['allowed-tools'],
      dependencies: fm.dependencies,
      icon: fm.icon,
      readOnly,
      warnings: parsed.warnings,
      errors: parsed.errors,
    });
  }

  return results;
}

/**
 * Lazy import of fs to support both ESM and test environments.
 */
function await_import_fs() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('fs');
}
