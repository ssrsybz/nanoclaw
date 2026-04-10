import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { _initTestDatabase } from './db.js';
import type Database from 'better-sqlite3';

import {
  validateWorkspacePath,
  addWorkspace,
  removeWorkspace,
  listWorkspaces,
  getWorkspace,
  getWorkspaceByPath,
  updateLastUsed,
  setEnabledSkills,
  getEnabledSkills,
  readClaudeMd,
  writeClaudeMd,
  scanSkills,
  readSkillFile,
  writeSkillFile,
} from './workspace.js';

let db: Database.Database;
let tempDir: string;

beforeEach(() => {
  db = _initTestDatabase();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-test-'));
});

afterEach(() => {
  // Clean up temp directory
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// --- validateWorkspacePath ---

describe('validateWorkspacePath', () => {
  it('rejects relative paths', () => {
    expect(() => validateWorkspacePath('relative/path')).toThrow(
      'Workspace path must be absolute',
    );
  });

  it('rejects .. segments', () => {
    expect(() => validateWorkspacePath('/some/../etc/passwd')).toThrow(
      'must not contain ".."',
    );
  });

  it('rejects system directories', () => {
    expect(() => validateWorkspacePath('/etc')).toThrow('system directory');
    expect(() => validateWorkspacePath('/usr')).toThrow('system directory');
    expect(() => validateWorkspacePath('/etc/something')).toThrow('system directory');
    expect(() => validateWorkspacePath('/usr/local')).toThrow('system directory');
  });

  it('rejects non-existent paths', () => {
    expect(() =>
      validateWorkspacePath('/this/path/does/not/exist'),
    ).toThrow('does not exist');
  });

  it('rejects file paths (not directory)', () => {
    const filePath = path.join(tempDir, 'file.txt');
    fs.writeFileSync(filePath, 'test');
    expect(() => validateWorkspacePath(filePath)).toThrow('not a directory');
  });

  it('accepts valid directory paths', () => {
    expect(() => validateWorkspacePath(tempDir)).not.toThrow();
  });
});

// --- addWorkspace ---

describe('addWorkspace', () => {
  it('creates record and returns workspace', () => {
    const ws = addWorkspace(db, tempDir);

    expect(ws.id).toBeDefined();
    expect(ws.path).toBe(fs.realpathSync(tempDir));
    expect(ws.name).toBe(path.basename(fs.realpathSync(tempDir)));
    expect(ws.enabledSkills).toEqual([]);
    expect(ws.createdAt).toBeDefined();
    expect(ws.lastUsedAt).toBeNull();

    // Verify persisted
    const stored = getWorkspace(db, ws.id);
    expect(stored).toBeDefined();
    expect(stored!.path).toBe(ws.path);
  });

  it('creates CLAUDE.md if missing', () => {
    addWorkspace(db, tempDir);

    const claudeMdPath = path.join(tempDir, 'CLAUDE.md');
    expect(fs.existsSync(claudeMdPath)).toBe(true);
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    expect(content).toContain('Workspace');
  });

  it('preserves existing CLAUDE.md', () => {
    const claudeMdPath = path.join(tempDir, 'CLAUDE.md');
    const existingContent = '# My Project\n\nCustom instructions here.';
    fs.writeFileSync(claudeMdPath, existingContent, 'utf-8');

    addWorkspace(db, tempDir);

    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    expect(content).toBe(existingContent);
  });

  it('rejects non-existent path', () => {
    expect(() => addWorkspace(db, '/nonexistent/path')).toThrow();
  });

  it('rejects file path (not directory)', () => {
    const filePath = path.join(tempDir, 'not-a-dir.txt');
    fs.writeFileSync(filePath, 'test');
    expect(() => addWorkspace(db, filePath)).toThrow();
  });

  it('rejects duplicate path', () => {
    addWorkspace(db, tempDir);
    expect(() => addWorkspace(db, tempDir)).toThrow('already exists');
  });
});

// --- removeWorkspace ---

describe('removeWorkspace', () => {
  it('deletes record only (not files)', () => {
    const ws = addWorkspace(db, tempDir);

    // Verify CLAUDE.md exists
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);

    removeWorkspace(db, ws.id);

    // Record removed
    expect(getWorkspace(db, ws.id)).toBeNull();

    // Files still exist
    expect(fs.existsSync(path.join(tempDir, 'CLAUDE.md'))).toBe(true);
  });
});

// --- listWorkspaces ---

describe('listWorkspaces', () => {
  it('returns ordered by lastUsedAt', async () => {
    // Create 3 temp directories
    const dir1 = fs.mkdtempSync(path.join(os.tmpdir(), 'ws1-'));
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ws2-'));
    const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'ws3-'));

    try {
      const ws1 = addWorkspace(db, dir1);
      const ws2 = addWorkspace(db, dir2);
      const ws3 = addWorkspace(db, dir3);

      // Update lastUsedAt for ws1 and ws3 only
      updateLastUsed(db, ws1.id);
      // Small delay to ensure different timestamps
      await new Promise((r) => setTimeout(r, 10));
      updateLastUsed(db, ws3.id);

      const list = listWorkspaces(db);

      // ws3 has newest lastUsedAt, then ws1, then ws2 (null)
      expect(list[0].id).toBe(ws3.id);
      expect(list[1].id).toBe(ws1.id);
      expect(list[2].id).toBe(ws2.id);
    } finally {
      fs.rmSync(dir1, { recursive: true, force: true });
      fs.rmSync(dir2, { recursive: true, force: true });
      fs.rmSync(dir3, { recursive: true, force: true });
    }
  });

  it('returns empty array when no workspaces', () => {
    const list = listWorkspaces(db);
    expect(list).toEqual([]);
  });
});

// --- updateLastUsed ---

describe('updateLastUsed', () => {
  it('updates timestamp', async () => {
    const ws = addWorkspace(db, tempDir);
    expect(ws.lastUsedAt).toBeNull();

    const before = new Date();
    updateLastUsed(db, ws.id);
    const after = new Date();

    const updated = getWorkspace(db, ws.id)!;
    expect(updated.lastUsedAt).not.toBeNull();

    const usedAt = new Date(updated.lastUsedAt!);
    expect(usedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(usedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// --- getWorkspace / getWorkspaceByPath ---

describe('getWorkspace', () => {
  it('returns null for unknown id', () => {
    expect(getWorkspace(db, 'nonexistent')).toBeNull();
  });
});

describe('getWorkspaceByPath', () => {
  it('returns workspace by path', () => {
    const ws = addWorkspace(db, tempDir);
    const found = getWorkspaceByPath(db, tempDir);
    expect(found).toBeDefined();
    expect(found!.id).toBe(ws.id);
  });

  it('returns null for unknown path', () => {
    expect(getWorkspaceByPath(db, '/unknown/path')).toBeNull();
  });
});

// --- setEnabledSkills / getEnabledSkills ---

describe('setEnabledSkills / getEnabledSkills', () => {
  it('sets and gets enabled skills', () => {
    const ws = addWorkspace(db, tempDir);
    setEnabledSkills(db, ws.id, ['skill-a', 'skill-b']);

    const skills = getEnabledSkills(db, ws.id);
    expect(skills).toEqual(['skill-a', 'skill-b']);
  });

  it('returns empty array for unknown id', () => {
    expect(getEnabledSkills(db, 'nonexistent')).toEqual([]);
  });

  it('overwrites previous skills', () => {
    const ws = addWorkspace(db, tempDir);
    setEnabledSkills(db, ws.id, ['a']);
    setEnabledSkills(db, ws.id, ['b', 'c']);

    expect(getEnabledSkills(db, ws.id)).toEqual(['b', 'c']);
  });
});

// --- readClaudeMd / writeClaudeMd ---

describe('readClaudeMd / writeClaudeMd', () => {
  it('returns empty string when CLAUDE.md missing', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noclaude-'));
    try {
      expect(readClaudeMd(emptyDir)).toBe('');
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('reads and writes CLAUDE.md', () => {
    const content = '# My Workspace\nHello!';
    writeClaudeMd(tempDir, content);
    expect(readClaudeMd(tempDir)).toBe(content);
  });
});

// --- scanSkills ---

describe('scanSkills', () => {
  it('returns empty array when no skills directory', () => {
    expect(scanSkills(tempDir, [])).toEqual([]);
  });

  it('scans skills with SKILL.md files', () => {
    const skillDir = path.join(tempDir, '.claude', 'skills', 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      '# Test Skill\nThis is a test skill description.',
    );

    // Also create a skill without SKILL.md
    const noMdDir = path.join(tempDir, '.claude', 'skills', 'no-md-skill');
    fs.mkdirSync(noMdDir, { recursive: true });

    const skills = scanSkills(tempDir, ['test-skill']);

    expect(skills).toHaveLength(2);

    const testSkill = skills.find((s) => s.name === 'test-skill')!;
    expect(testSkill).toBeDefined();
    expect(testSkill.description).toBe('This is a test skill description.');
    expect(testSkill.enabled).toBe(true);
    expect(testSkill.hasSkillMd).toBe(true);

    const noMdSkill = skills.find((s) => s.name === 'no-md-skill')!;
    expect(noMdSkill).toBeDefined();
    expect(noMdSkill.description).toBe('');
    expect(noMdSkill.enabled).toBe(false);
    expect(noMdSkill.hasSkillMd).toBe(false);
  });
});

// --- readSkillFile / writeSkillFile ---

describe('readSkillFile / writeSkillFile', () => {
  it('returns empty string when skill file missing', () => {
    expect(readSkillFile(tempDir, 'nonexistent')).toBe('');
  });

  it('reads and writes skill files', () => {
    const content = '# My Skill\nSkill content here.';
    writeSkillFile(tempDir, 'my-skill', content);

    expect(readSkillFile(tempDir, 'my-skill')).toBe(content);

    // Verify the file exists in the right place
    const skillMdPath = path.join(tempDir, '.claude', 'skills', 'my-skill', 'SKILL.md');
    expect(fs.existsSync(skillMdPath)).toBe(true);
  });
});
