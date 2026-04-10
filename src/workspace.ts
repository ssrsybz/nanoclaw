import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import Database from 'better-sqlite3';

import type { Skill, Workspace } from './types.js';

// --- System directories that should be rejected ---
// Note: /var is excluded from this list because on macOS, /var is a symlink to /private/var
// and the user temp directory is typically /var/folders/... (realpath: /private/var/folders/...).
// Including /var would reject all temp directories on macOS.
const SYSTEM_DIRS = ['/etc', '/System', '/usr', '/bin', '/sbin', '/lib', '/dev', '/proc', '/sys'];

const CLAUDE_MD_TEMPLATE = `# Workspace

This is your workspace CLAUDE.md. The AI assistant will read this file when working in this workspace.

You can add project-specific instructions, conventions, and context here.
`;

// --- Path validation ---

/**
 * Validates that a workspace path is safe to use.
 * Throws on relative paths, non-existent paths, non-directory paths,
 * system directories, and paths with traversal segments.
 */
export function validateWorkspacePath(inputPath: string): void {
  // Must be absolute
  if (!path.isAbsolute(inputPath)) {
    throw new Error(`Workspace path must be absolute: ${inputPath}`);
  }

  // Reject path traversal segments (check before normalization)
  if (inputPath.includes('..')) {
    throw new Error(`Workspace path must not contain ".." segments: ${inputPath}`);
  }

  // Reject system directories — check the input path (before symlink resolution)
  const normalized = path.normalize(inputPath);
  for (const sysDir of SYSTEM_DIRS) {
    if (normalized === sysDir || normalized.startsWith(sysDir + '/')) {
      throw new Error(`Workspace path cannot be in system directory: ${sysDir}`);
    }
  }

  // Must exist
  let realpath: string;
  try {
    realpath = fs.realpathSync(inputPath);
  } catch {
    throw new Error(`Workspace path does not exist: ${inputPath}`);
  }

  // Also check resolved path against system directories (catches symlinks into system dirs)
  for (const sysDir of SYSTEM_DIRS) {
    if (realpath === sysDir || realpath.startsWith(sysDir + '/')) {
      throw new Error(`Workspace path cannot be in system directory: ${sysDir}`);
    }
  }

  // Must be a directory
  const stat = fs.statSync(realpath);
  if (!stat.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${inputPath}`);
  }
}

// --- DB helpers ---

function rowToWorkspace(row: {
  id: string;
  name: string;
  path: string;
  enabled_skills: string;
  created_at: string;
  last_used_at: string | null;
}): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    enabledSkills: JSON.parse(row.enabled_skills),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

// --- CRUD operations ---

/**
 * Add a new workspace. Validates the path, checks for duplicates,
 * auto-creates CLAUDE.md if missing, and inserts into the database.
 */
export function addWorkspace(db: Database.Database, dirPath: string): Workspace {
  // Resolve symlinks for consistent path comparison
  const resolvedPath = fs.realpathSync(path.resolve(dirPath));

  validateWorkspacePath(resolvedPath);

  // Check for duplicate path
  const existing = db
    .prepare('SELECT id FROM workspaces WHERE path = ?')
    .get(resolvedPath) as { id: string } | undefined;
  if (existing) {
    throw new Error(`Workspace already exists at path: ${resolvedPath}`);
  }

  const id = crypto.randomUUID();
  const name = path.basename(resolvedPath);
  const now = new Date().toISOString();

  // Auto-create CLAUDE.md if missing
  const claudeMdPath = path.join(resolvedPath, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    fs.writeFileSync(claudeMdPath, CLAUDE_MD_TEMPLATE, 'utf-8');
  }

  db.prepare(
    `INSERT INTO workspaces (id, name, path, enabled_skills, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, name, resolvedPath, '[]', now, null);

  return {
    id,
    name,
    path: resolvedPath,
    enabledSkills: [],
    createdAt: now,
    lastUsedAt: null,
  };
}

/**
 * Remove a workspace by ID. Only deletes the database record.
 */
export function removeWorkspace(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
}

/**
 * List all workspaces, ordered by last_used_at DESC (NULLS LAST), then created_at DESC.
 */
export function listWorkspaces(db: Database.Database): Workspace[] {
  const rows = db
    .prepare(
      `SELECT * FROM workspaces ORDER BY last_used_at DESC, created_at DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    path: string;
    enabled_skills: string;
    created_at: string;
    last_used_at: string | null;
  }>;

  // SQLite sorts NULLs first in DESC, but we want NULLs last.
  // We'll sort in JS to guarantee correct behavior across SQLite versions.
  const workspaces = rows.map(rowToWorkspace);
  workspaces.sort((a, b) => {
    // Both have lastUsedAt — compare directly
    if (a.lastUsedAt && b.lastUsedAt) {
      const cmp = b.lastUsedAt.localeCompare(a.lastUsedAt);
      if (cmp !== 0) return cmp;
    }
    // One has lastUsedAt, the other doesn't — non-null comes first
    if (a.lastUsedAt && !b.lastUsedAt) return -1;
    if (!a.lastUsedAt && b.lastUsedAt) return 1;
    // Both null — fall through to createdAt
    return b.createdAt.localeCompare(a.createdAt);
  });

  return workspaces;
}

/**
 * Get a workspace by ID.
 */
export function getWorkspace(db: Database.Database, id: string): Workspace | null {
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        path: string;
        enabled_skills: string;
        created_at: string;
        last_used_at: string | null;
      }
    | undefined;
  return row ? rowToWorkspace(row) : null;
}

/**
 * Get a workspace by its filesystem path.
 */
export function getWorkspaceByPath(db: Database.Database, wsPath: string): Workspace | null {
  let resolved: string;
  try {
    resolved = fs.realpathSync(path.resolve(wsPath));
  } catch {
    return null;
  }
  const row = db.prepare('SELECT * FROM workspaces WHERE path = ?').get(resolved) as
    | {
        id: string;
        name: string;
        path: string;
        enabled_skills: string;
        created_at: string;
        last_used_at: string | null;
      }
    | undefined;
  return row ? rowToWorkspace(row) : null;
}

/**
 * Update the last_used_at timestamp for a workspace.
 */
export function updateLastUsed(db: Database.Database, id: string): void {
  db.prepare('UPDATE workspaces SET last_used_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id,
  );
}

/**
 * Set the enabled skills list for a workspace.
 */
export function setEnabledSkills(db: Database.Database, id: string, skills: string[]): void {
  db.prepare('UPDATE workspaces SET enabled_skills = ? WHERE id = ?').run(
    JSON.stringify(skills),
    id,
  );
}

/**
 * Get the enabled skills list for a workspace.
 */
export function getEnabledSkills(db: Database.Database, id: string): string[] {
  const row = db
    .prepare('SELECT enabled_skills FROM workspaces WHERE id = ?')
    .get(id) as { enabled_skills: string } | undefined;
  if (!row) return [];
  return JSON.parse(row.enabled_skills);
}

// --- CLAUDE.md I/O ---

/**
 * Read the workspace's CLAUDE.md file. Returns empty string if missing.
 */
export function readClaudeMd(workspacePath: string): string {
  const filePath = path.join(workspacePath, 'CLAUDE.md');
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Write content to the workspace's CLAUDE.md file.
 */
export function writeClaudeMd(workspacePath: string, content: string): void {
  const filePath = path.join(workspacePath, 'CLAUDE.md');
  fs.writeFileSync(filePath, content, 'utf-8');
}

// --- Skill scanning ---

/**
 * Scan the .claude/skills/ directory for available skills.
 * Returns all found skills, marking which are enabled and which have SKILL.md files.
 */
export function scanSkills(workspacePath: string, enabledSkills: string[]): Skill[] {
  const skillsDir = path.join(workspacePath, '.claude', 'skills');
  const skills: Skill[] = [];

  let entries: string[];
  try {
    entries = fs.readdirSync(skillsDir);
  } catch {
    return skills;
  }

  for (const entry of entries) {
    const skillPath = path.join(skillsDir, entry);
    const stat = fs.statSync(skillPath);
    if (!stat.isDirectory()) continue;

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const hasSkillMd = fs.existsSync(skillMdPath);

    let description = '';
    if (hasSkillMd) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        // Extract first non-empty, non-heading line as description
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            description = trimmed;
            break;
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    skills.push({
      name: entry,
      description,
      path: skillPath,
      enabled: enabledSkills.includes(entry),
      hasSkillMd,
    });
  }

  return skills;
}

/**
 * Read the content of a skill's SKILL.md file.
 */
export function readSkillFile(workspacePath: string, skillName: string): string {
  const filePath = path.join(workspacePath, '.claude', 'skills', skillName, 'SKILL.md');
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Write content to a skill's SKILL.md file.
 * Creates the skill directory if it doesn't exist.
 */
export function writeSkillFile(workspacePath: string, skillName: string, content: string): void {
  const skillDir = path.join(workspacePath, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const filePath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(filePath, content, 'utf-8');
}

// --- Folder picker ---

/**
 * Open a native folder picker dialog.
 * Uses osascript on macOS, zenity on Linux, returns null on unsupported platforms.
 */
export async function openFolderPicker(): Promise<string | null> {
  const platform = os.platform();

  if (platform === 'darwin') {
    const { execFile } = await import('child_process');
    return new Promise((resolve) => {
      const script = `
        set chosenFolder to choose folder with prompt "Select workspace folder"
        return POSIX path of chosenFolder
      `.trim();
      execFile('osascript', ['-e', script], (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const result = stdout.trim();
        resolve(result || null);
      });
    });
  }

  if (platform === 'linux') {
    const { execFile } = await import('child_process');
    return new Promise((resolve) => {
      execFile('zenity', ['--file-selection', '--directory', '--title=Select workspace folder'], (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const result = stdout.trim();
        resolve(result || null);
      });
    });
  }

  return null;
}
