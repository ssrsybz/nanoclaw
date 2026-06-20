import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import Database from 'better-sqlite3';

import type { AttachmentInfo, Skill, Workspace } from './types.js';
import { MAX_FILE_SIZE, parseFile, truncateText } from './file-parser.js';
import { parseSkillMd } from './skill-parser.js';

// --- System directories that should be rejected ---
// Note: /var is excluded from this list because on macOS, /var is a symlink to /private/var
// and the user temp directory is typically /var/folders/... (realpath: /private/var/folders/...).
// Including /var would reject all temp directories on macOS.
const SYSTEM_DIRS = [
  '/etc',
  '/System',
  '/usr',
  '/bin',
  '/sbin',
  '/lib',
  '/dev',
  '/proc',
  '/sys',
];

const CLAUDE_MD_TEMPLATE = `# Workspace

This is your workspace CLAUDE.md. The AI assistant will read this file when working in this workspace.

You can add project-specific instructions, conventions, and context here.
`;

const IGNORED_FILE_ENTRIES = new Set([
  '.DS_Store',
  '.git',
  '.hg',
  '.next',
  '.nuxt',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

const TEXT_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.conf',
  '.cpp',
  '.cs',
  '.css',
  '.csv',
  '.cjs',
  '.env.example',
  '.go',
  '.h',
  '.html',
  '.ini',
  '.java',
  '.js',
  '.json',
  '.jsx',
  '.log',
  '.md',
  '.mjs',
  '.py',
  '.rs',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
]);

const DOCUMENT_EXTENSIONS = new Set(['.docx', '.xlsx', '.pdf']);
const MAX_DIRECTORY_ENTRIES = 500;
const MAX_TEXT_PREVIEW_BYTES = 1024 * 1024;

export interface WorkspaceFileEntry {
  name: string;
  relativePath: string;
  type: 'file' | 'directory';
  size?: number;
  mtimeMs?: number;
  extension?: string;
  previewable: boolean;
}

export interface WorkspaceFileList {
  path: string;
  parentPath: string | null;
  entries: WorkspaceFileEntry[];
  truncated: boolean;
}

export interface WorkspaceFilePreview {
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
    throw new Error(
      `Workspace path must not contain ".." segments: ${inputPath}`,
    );
  }

  // Reject system directories — check the input path (before symlink resolution)
  const normalized = path.normalize(inputPath);
  for (const sysDir of SYSTEM_DIRS) {
    if (normalized === sysDir || normalized.startsWith(sysDir + '/')) {
      throw new Error(
        `Workspace path cannot be in system directory: ${sysDir}`,
      );
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
      throw new Error(
        `Workspace path cannot be in system directory: ${sysDir}`,
      );
    }
  }

  // Must be a directory
  const stat = fs.statSync(realpath);
  if (!stat.isDirectory()) {
    throw new Error(`Workspace path is not a directory: ${inputPath}`);
  }
}

function toWorkspaceRelativePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function normalizeWorkspaceRelativePath(relativePath?: string): string {
  const input = (relativePath || '.').trim() || '.';
  if (input.includes('\0')) {
    throw new Error('Invalid path: null byte is not allowed');
  }
  if (path.isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith('\\\\')) {
    throw new Error('Invalid path: only workspace-relative paths are allowed');
  }
  const normalized = path.normalize(input).replace(/^([.][\\/])+/, '');
  if (normalized === '.' || normalized === '') return '.';
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`) || normalized.startsWith('../')) {
    throw new Error('Invalid path: path escapes workspace');
  }
  return normalized;
}

function assertWithinWorkspace(rootRealPath: string, targetRealPath: string): void {
  const relative = path.relative(rootRealPath, targetRealPath);
  if (relative && (relative.startsWith('..') || path.isAbsolute(relative))) {
    throw new Error('Path escapes workspace');
  }
}

export function resolveWorkspaceSubpath(
  workspacePath: string,
  relativePath = '.',
): { rootRealPath: string; absolutePath: string; relativePath: string } {
  const rootRealPath = fs.realpathSync(workspacePath);
  const normalized = normalizeWorkspaceRelativePath(relativePath);
  const candidatePath = normalized === '.'
    ? rootRealPath
    : path.resolve(rootRealPath, normalized);
  const targetRealPath = fs.realpathSync(candidatePath);
  assertWithinWorkspace(rootRealPath, targetRealPath);

  const rel = path.relative(rootRealPath, targetRealPath);
  return {
    rootRealPath,
    absolutePath: targetRealPath,
    relativePath: rel ? toWorkspaceRelativePath(rel) : '.',
  };
}

function isIgnoredFileEntry(name: string): boolean {
  return IGNORED_FILE_ENTRIES.has(name);
}

function isSensitiveFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === '.env.example') return false;
  if (lower === '.env' || lower.startsWith('.env.')) return true;
  if (['.npmrc', '.pypirc', '.netrc', 'id_rsa', 'id_ed25519'].includes(lower)) return true;
  return /\.(key|pem|p12)$/i.test(lower);
}

function isPreviewableFile(name: string, size?: number): boolean {
  if (isSensitiveFile(name)) return false;
  const lower = name.toLowerCase();
  const ext = path.extname(lower);
  if (DOCUMENT_EXTENSIONS.has(ext)) return true;
  if (TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(lower)) {
    return size === undefined || size <= MAX_TEXT_PREVIEW_BYTES;
  }
  return false;
}

function isTextFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return TEXT_EXTENSIONS.has(path.extname(lower)) || TEXT_EXTENSIONS.has(lower);
}

function makeWorkspaceFileId(workspaceId: string, relativePath: string): string {
  const hash = crypto
    .createHash('sha1')
    .update(`${workspaceId}:${relativePath}`)
    .digest('hex')
    .slice(0, 16);
  return `wf_${hash}`;
}

export function listWorkspaceFiles(
  workspacePath: string,
  relativeDir = '.',
): WorkspaceFileList {
  const resolved = resolveWorkspaceSubpath(workspacePath, relativeDir);
  const stat = fs.statSync(resolved.absolutePath);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  const names = fs.readdirSync(resolved.absolutePath).filter((name) => !isIgnoredFileEntry(name));
  const limitedNames = names.slice(0, MAX_DIRECTORY_ENTRIES);
  const entries: WorkspaceFileEntry[] = [];

  for (const name of limitedNames) {
    const fullPath = path.join(resolved.absolutePath, name);
    try {
      const entryStat = fs.statSync(fullPath);
      const relativePath = resolved.relativePath === '.'
        ? name
        : toWorkspaceRelativePath(path.join(resolved.relativePath, name));
      const type = entryStat.isDirectory() ? 'directory' : 'file';
      entries.push({
        name,
        relativePath,
        type,
        size: entryStat.isFile() ? entryStat.size : undefined,
        mtimeMs: entryStat.mtimeMs,
        extension: entryStat.isFile() ? path.extname(name).toLowerCase() : undefined,
        previewable: type === 'file' && isPreviewableFile(name, entryStat.size),
      });
    } catch {
      // Skip entries that disappeared or cannot be read.
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  const parent = resolved.relativePath === '.'
    ? null
    : toWorkspaceRelativePath(path.dirname(resolved.relativePath));

  return {
    path: resolved.relativePath,
    parentPath: parent === '.' ? '.' : parent,
    entries,
    truncated: names.length > MAX_DIRECTORY_ENTRIES,
  };
}

export async function previewWorkspaceFile(
  workspacePath: string,
  relativePath: string,
): Promise<WorkspaceFilePreview> {
  const resolved = resolveWorkspaceSubpath(workspacePath, relativePath);
  const stat = fs.statSync(resolved.absolutePath);
  const filename = path.basename(resolved.absolutePath);

  if (!stat.isFile()) {
    return {
      relativePath: resolved.relativePath,
      filename,
      type: 'unsupported',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      truncated: false,
      canAttach: false,
      reason: '只能预览文件，不能预览目录',
    };
  }

  if (isSensitiveFile(filename)) {
    return {
      relativePath: resolved.relativePath,
      filename,
      type: 'unsupported',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      truncated: false,
      canAttach: false,
      reason: '该文件可能包含敏感凭证，已阻止预览',
    };
  }

  const ext = path.extname(filename).toLowerCase();
  if (DOCUMENT_EXTENSIONS.has(ext)) {
    if (stat.size > MAX_FILE_SIZE) {
      return {
        relativePath: resolved.relativePath,
        filename,
        type: 'too-large',
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        truncated: true,
        canAttach: false,
        reason: '文件过大，暂不支持加入上下文',
      };
    }
    const buffer = fs.readFileSync(resolved.absolutePath);
    const parsed = await parseFile(buffer, '', filename, resolved.relativePath);
    const truncated = parsed.text.includes('[文件内容过长，已截断');
    return {
      relativePath: resolved.relativePath,
      filename,
      type: 'document',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      content: parsed.text,
      extractedText: parsed.text,
      truncated,
      canAttach: true,
    };
  }

  if (!isTextFileName(filename)) {
    return {
      relativePath: resolved.relativePath,
      filename,
      type: 'binary',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      truncated: false,
      canAttach: false,
      reason: '该文件类型暂不支持预览',
    };
  }

  if (stat.size > MAX_TEXT_PREVIEW_BYTES) {
    return {
      relativePath: resolved.relativePath,
      filename,
      type: 'too-large',
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      truncated: true,
      canAttach: false,
      reason: '文件过大，暂不支持加入上下文',
    };
  }

  const content = fs.readFileSync(resolved.absolutePath, 'utf-8');
  const extractedText = truncateText(content, resolved.relativePath);
  return {
    relativePath: resolved.relativePath,
    filename,
    type: 'text',
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    content: extractedText,
    extractedText,
    truncated: extractedText !== content,
    canAttach: true,
  };
}

export async function workspaceFileToAttachment(
  workspaceId: string,
  workspacePath: string,
  relativePath: string,
): Promise<AttachmentInfo> {
  const preview = await previewWorkspaceFile(workspacePath, relativePath);
  if (!preview.canAttach || !preview.extractedText) {
    throw new Error(preview.reason || '该文件暂不支持加入上下文');
  }

  return {
    fileId: makeWorkspaceFileId(workspaceId, preview.relativePath),
    filename: preview.filename,
    extractedText: preview.extractedText,
    filePath: preview.relativePath,
    source: 'workspace-file',
    workspaceId,
    relativePath: preview.relativePath,
    size: preview.size,
    truncated: preview.truncated,
  };
}

// --- DB helpers ---

function rowToWorkspace(row: {
  id: string;
  name: string;
  path: string;
  enabled_skills: string;
  created_at: string;
  last_used_at: string | null;
  icon: string | null;
}): Workspace {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    enabledSkills: JSON.parse(row.enabled_skills),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    icon: row.icon,
  };
}

// --- CRUD operations ---

/**
 * Add a new workspace. Validates the path, checks for duplicates,
 * auto-creates CLAUDE.md if missing, and inserts into the database.
 */
export function addWorkspace(
  db: Database.Database,
  dirPath: string,
): Workspace {
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
    `INSERT INTO workspaces (id, name, path, enabled_skills, icon, created_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, resolvedPath, '[]', null, now, null);

  return {
    id,
    name,
    path: resolvedPath,
    enabledSkills: [],
    createdAt: now,
    lastUsedAt: null,
    icon: null,
  };
}

/**
 * Remove a workspace by ID. Only deletes the database record.
 */
export function removeWorkspace(db: Database.Database, id: string): void {
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
}

/**
 * List all workspaces, ordered by last_used_at DESC (NULLS LAST), then created_at DESC, then id DESC.
 * The id tiebreaker ensures stable ordering even when timestamps are identical.
 */
export function listWorkspaces(db: Database.Database): Workspace[] {
  const rows = db
    .prepare(
      `SELECT * FROM workspaces ORDER BY last_used_at DESC, created_at DESC, id DESC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    path: string;
    enabled_skills: string;
    created_at: string;
    last_used_at: string | null;
    icon: string | null;
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
    const createdCmp = b.createdAt.localeCompare(a.createdAt);
    if (createdCmp !== 0) return createdCmp;
    // Final tiebreaker: id DESC for stable ordering
    return b.id.localeCompare(a.id);
  });

  return workspaces;
}

/**
 * Get a workspace by ID.
 */
export function getWorkspace(
  db: Database.Database,
  id: string,
): Workspace | null {
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        path: string;
        enabled_skills: string;
        created_at: string;
        last_used_at: string | null;
        icon: string | null;
      }
    | undefined;
  return row ? rowToWorkspace(row) : null;
}

/**
 * Get a workspace by its filesystem path.
 */
export function getWorkspaceByPath(
  db: Database.Database,
  wsPath: string,
): Workspace | null {
  let resolved: string;
  try {
    resolved = fs.realpathSync(path.resolve(wsPath));
  } catch {
    return null;
  }
  const row = db
    .prepare('SELECT * FROM workspaces WHERE path = ?')
    .get(resolved) as
    | {
        id: string;
        name: string;
        path: string;
        enabled_skills: string;
        created_at: string;
        last_used_at: string | null;
        icon: string | null;
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
export function setEnabledSkills(
  db: Database.Database,
  id: string,
  skills: string[],
): void {
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

/**
 * Set the icon for a workspace.
 *
 * Icon value semantics:
 * - null         → remove icon (fallback to letter avatar)
 * - "iconify:prefix:name" → reference to an Iconify library icon
 * - "<svg ...>...</svg>"   → custom SVG markup uploaded by user
 *
 * Validation:
 * - Iconify references must follow "iconify:prefix:name" format (3 segments, all non-empty)
 * - Custom SVG must start with "<svg" and end with "</svg>"
 * - Custom SVG is sanitized: rejects <script> tags and inline event handlers (onload, onclick, onerror)
 * - Icon content must not exceed 64KB
 */
export function setWorkspaceIcon(
  db: Database.Database,
  id: string,
  icon: string | null,
): void {
  // Treat empty string as null (clear icon)
  if (icon === '') icon = null;

  if (icon !== null) {
    // Size limit
    if (icon.length > 65536) {
      throw new Error('SVG content too large (max 64KB)');
    }

    if (icon.startsWith('iconify:')) {
      // Validate iconify reference format: iconify:prefix:name
      const parts = icon.split(':');
      if (parts.length !== 3 || !parts[1] || !parts[2]) {
        throw new Error('Invalid iconify reference format. Expected: iconify:prefix:name');
      }
    } else {
      // Validate SVG markup
      const trimmed = icon.trim();
      if (!trimmed.startsWith('<svg') || !trimmed.endsWith('</svg>')) {
        throw new Error('Invalid SVG markup. Must start with <svg and end with </svg>');
      }
      // Sanitize: reject SVGs with script tags or any inline event handlers.
      // The on\w+= pattern catches all on* attributes (onload, onclick, onerror,
      // onmouseover, onfocus, onblur, onbegin, onend, etc.)
      const lower = trimmed.toLowerCase();
      if (lower.includes('<script') || /\bon\w+\s*=/i.test(trimmed)) {
        throw new Error('SVG contains disallowed script content');
      }
    }
  }

  db.prepare('UPDATE workspaces SET icon = ? WHERE id = ?').run(icon, id);
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
 * Uses the unified skill-parser for frontmatter parsing.
 */
export function scanSkills(
  workspacePath: string,
  enabledSkills: string[],
): Skill[] {
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
    let stat: fs.Stats;
    try {
      stat = fs.statSync(skillPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    const hasSkillMd = fs.existsSync(skillMdPath);

    let description = '';
    let nameZh: string | undefined;
    let skillType: Skill['skillType'];
    let source: Skill['source'];
    let allowedTools: string[] | undefined;
    let dependencies: string[] | undefined;
    let icon: string | undefined;
    let category: Skill['category'];

    if (hasSkillMd) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const parsed = parseSkillMd(content);
        const fm = parsed.frontmatter;
        description = fm.description || '';
        nameZh = fm.nameZh;
        skillType = fm.skillType || 'workspace';
        source = fm.source || 'workspace';
        allowedTools = fm['allowed-tools'];
        dependencies = fm.dependencies;
        icon = fm.icon;
        category = fm.category;
      } catch {
        // Ignore read errors — description stays empty
      }
    }

    skills.push({
      name: entry,
      description,
      nameZh,
      path: skillPath,
      enabled: enabledSkills.includes(entry),
      hasSkillMd,
      category: category || 'workspace',
      icon,
      skillType: skillType || 'workspace',
      source: source || 'workspace',
      allowedTools,
      dependencies,
      readOnly: false, // Workspace skills are always editable
    });
  }

  return skills;
}

/**
 * Read the content of a skill's SKILL.md file.
 */
export function readSkillFile(
  workspacePath: string,
  skillName: string,
): string {
  const filePath = path.join(
    workspacePath,
    '.claude',
    'skills',
    skillName,
    'SKILL.md',
  );
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
export function writeSkillFile(
  workspacePath: string,
  skillName: string,
  content: string,
): void {
  const skillDir = path.join(workspacePath, '.claude', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const filePath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(filePath, content, 'utf-8');
}

// --- Folder picker ---

/**
 * Open a native folder picker dialog.
 * Uses osascript on macOS, zenity on Linux, PowerShell on Windows.
 * Returns null on unsupported platforms or if user cancels.
 */
export async function openFolderPicker(): Promise<string | null> {
  const platform = os.platform();

  if (platform === 'darwin') {
    const { execFile } = await import('child_process');
    return new Promise((resolve) => {
      const script = `
        set chosenFolder to choose folder with prompt "选择工作文件夹"
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
      execFile(
        'zenity',
        ['--file-selection', '--directory', '--title=选择工作文件夹'],
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          const result = stdout.trim();
          resolve(result || null);
        },
      );
    });
  }

  if (platform === 'win32') {
    const { exec } = await import('child_process');
    return new Promise((resolve) => {
      // Use PowerShell with FolderBrowserDialog on Windows
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "选择工作文件夹"
        $dialog.ShowNewFolderButton = $true
        if ($dialog.ShowDialog() -eq 'OK') {
          Write-Output $dialog.SelectedPath
        }
      `.trim();
      exec(
        `powershell -NoProfile -Command "${script.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        (err, stdout) => {
          if (err) {
            resolve(null);
            return;
          }
          const result = stdout.trim();
          resolve(result || null);
        },
      );
    });
  }

  return null;
}
