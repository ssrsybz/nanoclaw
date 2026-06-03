import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, STORE_DIR } from './config.js';
import { isValidGroupFolder } from './group-folder.js';
import { logger } from './logger.js';
import {
  NewMessage,
  RegisteredGroup,
  ScheduledTask,
  TaskRunLog,
} from './types.js';

let db: Database.Database;

/**
 * Get the initialized database instance.
 * Throws if called before initDatabase().
 */
export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

function createSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TEXT,
      channel TEXT,
      is_group INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      sender_name TEXT,
      content TEXT,
      timestamp TEXT,
      is_from_me INTEGER,
      is_bot_message INTEGER DEFAULT 0,
      conversation_id TEXT,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
    CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      group_folder TEXT NOT NULL,
      chat_jid TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      next_run TEXT,
      last_run TEXT,
      last_result TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_next_run ON scheduled_tasks(next_run);
    CREATE INDEX IF NOT EXISTS idx_status ON scheduled_tasks(status);

    CREATE TABLE IF NOT EXISTS task_run_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      result TEXT,
      error TEXT,
      FOREIGN KEY (task_id) REFERENCES scheduled_tasks(id)
    );
    CREATE INDEX IF NOT EXISTS idx_task_run_logs ON task_run_logs(task_id, run_at);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      trigger_pattern TEXT NOT NULL,
      added_at TEXT NOT NULL,
      container_config TEXT,
      requires_trigger INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      enabled_skills TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      session_id TEXT,
      name TEXT NOT NULL DEFAULT '新对话',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      parts TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation ON conversation_messages(conversation_id);

    -- Launchpad tables
    CREATE TABLE IF NOT EXISTS launchpad_apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_zh TEXT,
      kind TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      bundle_id TEXT,
      icon TEXT,
      category TEXT,
      tags TEXT DEFAULT '[]',
      children TEXT,
      launch_command TEXT,
      launch_args TEXT,
      working_directory TEXT,
      env TEXT,
      usage_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      installed_at TEXT,
      description TEXT,
      version TEXT,
      developer TEXT,
      homepage TEXT,
      repository TEXT,
      store_id TEXT,
      status TEXT DEFAULT 'installed',
      update_available INTEGER DEFAULT 0,
      installed_version TEXT,
      latest_version TEXT,
      hidden INTEGER DEFAULT 0,
      pinned INTEGER DEFAULT 0,
      page_index INTEGER DEFAULT 0,
      grid_index INTEGER DEFAULT 0,
      parent_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_launchpad_apps_category ON launchpad_apps(category);
    CREATE INDEX IF NOT EXISTS idx_launchpad_apps_kind ON launchpad_apps(kind);
    CREATE INDEX IF NOT EXISTS idx_launchpad_apps_usage ON launchpad_apps(usage_count DESC);
    CREATE INDEX IF NOT EXISTS idx_launchpad_apps_status ON launchpad_apps(status);

    CREATE TABLE IF NOT EXISTS launchpad_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_zh TEXT,
      icon TEXT,
      type TEXT DEFAULT 'custom',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS launchpad_layout (
      id TEXT PRIMARY KEY DEFAULT 'default',
      columns INTEGER DEFAULT 7,
      rows INTEGER DEFAULT 5,
      icon_size INTEGER DEFAULT 64,
      show_labels INTEGER DEFAULT 1,
      animation_enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS launchpad_scan_dirs (
      path TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1,
      watch INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  // Add context_mode column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE scheduled_tasks ADD COLUMN context_mode TEXT DEFAULT 'isolated'`,
    );
  } catch {
    /* column already exists */
  }

  // Add script column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE scheduled_tasks ADD COLUMN script TEXT`);
  } catch {
    /* column already exists */
  }

  // Add is_bot_message column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE messages ADD COLUMN is_bot_message INTEGER DEFAULT 0`,
    );
    // Backfill: mark existing bot messages that used the content prefix pattern
    database
      .prepare(`UPDATE messages SET is_bot_message = 1 WHERE content LIKE ?`)
      .run(`${ASSISTANT_NAME}:%`);
  } catch {
    /* column already exists */
  }

  // Add is_main column if it doesn't exist (migration for existing DBs)
  try {
    database.exec(
      `ALTER TABLE registered_groups ADD COLUMN is_main INTEGER DEFAULT 0`,
    );
    // Backfill: existing rows with folder = 'main' are the main group
    database.exec(
      `UPDATE registered_groups SET is_main = 1 WHERE folder = 'main'`,
    );
  } catch {
    /* column already exists */
  }

  // Add channel and is_group columns if they don't exist (migration for existing DBs)
  try {
    database.exec(`ALTER TABLE chats ADD COLUMN channel TEXT`);
    database.exec(`ALTER TABLE chats ADD COLUMN is_group INTEGER DEFAULT 0`);
    // Backfill from JID patterns
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 1 WHERE jid LIKE '%@g.us'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'whatsapp', is_group = 0 WHERE jid LIKE '%@s.whatsapp.net'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'discord', is_group = 1 WHERE jid LIKE 'dc:%'`,
    );
    database.exec(
      `UPDATE chats SET channel = 'telegram', is_group = 0 WHERE jid LIKE 'tg:%'`,
    );
  } catch {
    /* columns already exist */
  }

  // Add workspace_id column if it doesn't exist (migration for existing DBs)
  try {
    database.exec('ALTER TABLE messages ADD COLUMN workspace_id TEXT');
  } catch {
    /* column already exists */
  }

  // Add conversation_id column if it doesn't exist (migration for existing DBs)
  try {
    database.exec('ALTER TABLE messages ADD COLUMN conversation_id TEXT');
  } catch {
    /* column already exists */
  }

  // Migration: add attachment column to conversation_messages
  try {
    database.exec(
      `ALTER TABLE conversation_messages ADD COLUMN attachment TEXT`,
    );
  } catch {
    // Column already exists, ignore
  }

  // Migration: add model column to conversation_messages
  try {
    database.exec(`ALTER TABLE conversation_messages ADD COLUMN model TEXT`);
  } catch {
    // Column already exists, ignore
  }

  // Migration: add api_calls column to conversation_messages
  try {
    database.exec(
      `ALTER TABLE conversation_messages ADD COLUMN api_calls TEXT`,
    );
  } catch {
    // Column already exists, ignore
  }

  // Migration: add parent_id column to launchpad_apps for folder support
  try {
    database.exec(
      `ALTER TABLE launchpad_apps ADD COLUMN parent_id TEXT`,
    );
  } catch {
    // Column already exists, ignore
  }

  // Migration: add smart launch columns
  const launchpadMigrations = [
    `ALTER TABLE launchpad_apps ADD COLUMN terminal_mode TEXT DEFAULT 'new-window'`,
    `ALTER TABLE launchpad_apps ADD COLUMN pre_launch_script TEXT`,
    `ALTER TABLE launchpad_apps ADD COLUMN post_launch_actions TEXT`,
    `ALTER TABLE launchpad_apps ADD COLUMN dependencies TEXT`,
    `ALTER TABLE launchpad_apps ADD COLUMN auto_detect INTEGER DEFAULT 1`,
  ];

  for (const sql of launchpadMigrations) {
    try {
      database.exec(sql);
    } catch {
      // Column already exists, ignore
    }
  }
}

export function initDatabase(): void {
  const dbPath = path.join(STORE_DIR, 'messages.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  createSchema(db);

  // Migrate from JSON files if they exist
  migrateJsonState();
}

/** @internal - for tests only. Creates a fresh in-memory database. */
export function _initTestDatabase(): Database.Database {
  db = new Database(':memory:');
  createSchema(db);
  return db;
}

/** @internal - for tests only. */
export function _closeDatabase(): void {
  db.close();
}

/**
 * Store chat metadata only (no message content).
 * Used for all chats to enable group discovery without storing sensitive content.
 */
export function storeChatMetadata(
  chatJid: string,
  timestamp: string,
  name?: string,
  channel?: string,
  isGroup?: boolean,
): void {
  const ch = channel ?? null;
  const group = isGroup === undefined ? null : isGroup ? 1 : 0;

  if (name) {
    // Update with name, preserving existing timestamp if newer
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        name = excluded.name,
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, name, timestamp, ch, group);
  } else {
    // Update timestamp only, preserve existing name if any
    db.prepare(
      `
      INSERT INTO chats (jid, name, last_message_time, channel, is_group) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(jid) DO UPDATE SET
        last_message_time = MAX(last_message_time, excluded.last_message_time),
        channel = COALESCE(excluded.channel, channel),
        is_group = COALESCE(excluded.is_group, is_group)
    `,
    ).run(chatJid, chatJid, timestamp, ch, group);
  }
}

/**
 * Update chat name without changing timestamp for existing chats.
 * New chats get the current time as their initial timestamp.
 * Used during group metadata sync.
 */
export function updateChatName(chatJid: string, name: string): void {
  db.prepare(
    `
    INSERT INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name
  `,
  ).run(chatJid, name, new Date().toISOString());
}

export interface ChatInfo {
  jid: string;
  name: string;
  last_message_time: string;
  channel: string;
  is_group: number;
}

/**
 * Get all known chats, ordered by most recent activity.
 */
export function getAllChats(): ChatInfo[] {
  return db
    .prepare(
      `
    SELECT jid, name, last_message_time, channel, is_group
    FROM chats
    ORDER BY last_message_time DESC
  `,
    )
    .all() as ChatInfo[];
}

/**
 * Get timestamp of last group metadata sync.
 */
export function getLastGroupSync(): string | null {
  // Store sync time in a special chat entry
  const row = db
    .prepare(`SELECT last_message_time FROM chats WHERE jid = '__group_sync__'`)
    .get() as { last_message_time: string } | undefined;
  return row?.last_message_time || null;
}

/**
 * Record that group metadata was synced.
 */
export function setLastGroupSync(): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES ('__group_sync__', '__group_sync__', ?)`,
  ).run(now);
}

/**
 * Store a message with full content.
 * Only call this for registered groups where message history is needed.
 */
export function storeMessage(msg: NewMessage): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message, workspace_id, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
    msg.workspaceId ?? null,
    msg.conversationId ?? null,
  );

  // Note: conversation_messages are persisted by the frontend (POST /messages)
  // and by stream_end for assistant turns.  We skip writing here to avoid:
  //   1. Duplicate messages (frontend POST + backend storeMessage use different IDs)
  //   2. Overwriting the user's original content with enriched attachment text
  // The `messages` table above still stores the enriched content for agent context.
}

/**
 * Store a message directly.
 */
export function storeMessageDirect(msg: {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message?: boolean;
}): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    msg.id,
    msg.chat_jid,
    msg.sender,
    msg.sender_name,
    msg.content,
    msg.timestamp,
    msg.is_from_me ? 1 : 0,
    msg.is_bot_message ? 1 : 0,
  );
}

export function getNewMessages(
  jids: string[],
  lastTimestamp: string,
  botPrefix: string,
  limit: number = 200,
): { messages: NewMessage[]; newTimestamp: string } {
  if (jids.length === 0) return { messages: [], newTimestamp: lastTimestamp };

  const placeholders = jids.map(() => '?').join(',');
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  // Subquery takes the N most recent, outer query re-sorts chronologically.
  const sql = `
    SELECT * FROM (
      SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, workspace_id as workspaceId
      FROM messages
      WHERE timestamp > ? AND chat_jid IN (${placeholders})
        AND is_bot_message = 0 AND content NOT LIKE ?
        AND content != '' AND content IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT ?
    ) ORDER BY timestamp
  `;

  const rows = db
    .prepare(sql)
    .all(lastTimestamp, ...jids, `${botPrefix}:%`, limit) as NewMessage[];

  let newTimestamp = lastTimestamp;
  for (const row of rows) {
    if (row.timestamp > newTimestamp) newTimestamp = row.timestamp;
  }

  return { messages: rows, newTimestamp };
}

export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  botPrefix: string,
  limit: number = 200,
  workspaceId?: string,
): NewMessage[] {
  // Filter bot messages using both the is_bot_message flag AND the content
  // prefix as a backstop for messages written before the migration ran.
  // Subquery takes the N most recent, outer query re-sorts chronologically.
  // When workspaceId is provided, scope to that workspace for isolation.
  const sql = `
    SELECT * FROM (
      SELECT id, chat_jid, sender, sender_name, content, timestamp, is_from_me, workspace_id as workspaceId, conversation_id as conversationId
      FROM messages
      WHERE chat_jid = ? AND timestamp > ?
        AND is_bot_message = 0 AND content NOT LIKE ?
        AND content != '' AND content IS NOT NULL
        ${workspaceId ? 'AND workspace_id = ?' : ''}
      ORDER BY timestamp DESC
      LIMIT ?
    ) ORDER BY timestamp
  `;
  const params: (string | number)[] = workspaceId
    ? [chatJid, sinceTimestamp, `${botPrefix}:%`, workspaceId, limit]
    : [chatJid, sinceTimestamp, `${botPrefix}:%`, limit];
  return db.prepare(sql).all(...params) as NewMessage[];
}

export function getLastBotMessageTimestamp(
  chatJid: string,
  botPrefix: string,
): string | undefined {
  const row = db
    .prepare(
      `SELECT MAX(timestamp) as ts FROM messages
       WHERE chat_jid = ? AND (is_bot_message = 1 OR content LIKE ?)`,
    )
    .get(chatJid, `${botPrefix}:%`) as { ts: string | null } | undefined;
  return row?.ts ?? undefined;
}

export function createTask(
  task: Omit<ScheduledTask, 'last_run' | 'last_result'>,
): void {
  db.prepare(
    `
    INSERT INTO scheduled_tasks (id, group_folder, chat_jid, prompt, script, schedule_type, schedule_value, context_mode, next_run, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    task.id,
    task.group_folder,
    task.chat_jid,
    task.prompt,
    task.script || null,
    task.schedule_type,
    task.schedule_value,
    task.context_mode || 'isolated',
    task.next_run,
    task.status,
    task.created_at,
  );
}

export function getTaskById(id: string): ScheduledTask | undefined {
  return db.prepare('SELECT * FROM scheduled_tasks WHERE id = ?').get(id) as
    | ScheduledTask
    | undefined;
}

export function getTasksForGroup(groupFolder: string): ScheduledTask[] {
  return db
    .prepare(
      'SELECT * FROM scheduled_tasks WHERE group_folder = ? ORDER BY created_at DESC',
    )
    .all(groupFolder) as ScheduledTask[];
}

export function getAllTasks(): ScheduledTask[] {
  return db
    .prepare('SELECT * FROM scheduled_tasks ORDER BY created_at DESC')
    .all() as ScheduledTask[];
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      ScheduledTask,
      | 'prompt'
      | 'script'
      | 'schedule_type'
      | 'schedule_value'
      | 'next_run'
      | 'status'
    >
  >,
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.script !== undefined) {
    fields.push('script = ?');
    values.push(updates.script || null);
  }
  if (updates.schedule_type !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.schedule_type);
  }
  if (updates.schedule_value !== undefined) {
    fields.push('schedule_value = ?');
    values.push(updates.schedule_value);
  }
  if (updates.next_run !== undefined) {
    fields.push('next_run = ?');
    values.push(updates.next_run);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(
    `UPDATE scheduled_tasks SET ${fields.join(', ')} WHERE id = ?`,
  ).run(...values);
}

export function deleteTask(id: string): void {
  // Delete child records first (FK constraint)
  db.prepare('DELETE FROM task_run_logs WHERE task_id = ?').run(id);
  db.prepare('DELETE FROM scheduled_tasks WHERE id = ?').run(id);
}

export function getDueTasks(): ScheduledTask[] {
  const now = new Date().toISOString();
  return db
    .prepare(
      `
    SELECT * FROM scheduled_tasks
    WHERE status = 'active' AND next_run IS NOT NULL AND next_run <= ?
    ORDER BY next_run
  `,
    )
    .all(now) as ScheduledTask[];
}

export function updateTaskAfterRun(
  id: string,
  nextRun: string | null,
  lastResult: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE scheduled_tasks
    SET next_run = ?, last_run = ?, last_result = ?, status = CASE WHEN ? IS NULL THEN 'completed' ELSE status END
    WHERE id = ?
  `,
  ).run(nextRun, now, lastResult, nextRun, id);
}

export function logTaskRun(log: TaskRunLog): void {
  db.prepare(
    `
    INSERT INTO task_run_logs (task_id, run_at, duration_ms, status, result, error)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    log.task_id,
    log.run_at,
    log.duration_ms,
    log.status,
    log.result,
    log.error,
  );
}

// --- Router state accessors ---

export function getRouterState(key: string): string | undefined {
  const row = db
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
  ).run(key, value);
}

// --- Session accessors ---

export function getSession(groupFolder: string): string | undefined {
  const row = db
    .prepare('SELECT session_id FROM sessions WHERE group_folder = ?')
    .get(groupFolder) as { session_id: string } | undefined;
  return row?.session_id;
}

export function setSession(groupFolder: string, sessionId: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
  ).run(groupFolder, sessionId);
}

export function getAllSessions(): Record<string, string> {
  const rows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.group_folder] = row.session_id;
  }
  return result;
}

// --- Registered group accessors ---

export function getRegisteredGroup(
  jid: string,
): (RegisteredGroup & { jid: string }) | undefined {
  const row = db
    .prepare('SELECT * FROM registered_groups WHERE jid = ?')
    .get(jid) as
    | {
        jid: string;
        name: string;
        folder: string;
        trigger_pattern: string;
        added_at: string;
        container_config: string | null;
        requires_trigger: number | null;
        is_main: number | null;
      }
    | undefined;
  if (!row) return undefined;
  if (!isValidGroupFolder(row.folder)) {
    logger.warn(
      { jid: row.jid, folder: row.folder },
      'Skipping registered group with invalid folder',
    );
    return undefined;
  }
  return {
    jid: row.jid,
    name: row.name,
    folder: row.folder,
    trigger: row.trigger_pattern,
    added_at: row.added_at,
    requiresTrigger:
      row.requires_trigger === null ? undefined : row.requires_trigger === 1,
    isMain: row.is_main === 1 ? true : undefined,
  };
}

export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  if (!isValidGroupFolder(group.folder)) {
    throw new Error(`Invalid group folder "${group.folder}" for JID ${jid}`);
  }
  db.prepare(
    `INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, requires_trigger, is_main)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    jid,
    group.name,
    group.folder,
    group.trigger,
    group.added_at,
    group.requiresTrigger === undefined ? 1 : group.requiresTrigger ? 1 : 0,
    group.isMain ? 1 : 0,
  );
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  const rows = db.prepare('SELECT * FROM registered_groups').all() as Array<{
    jid: string;
    name: string;
    folder: string;
    trigger_pattern: string;
    added_at: string;
    container_config: string | null;
    requires_trigger: number | null;
    is_main: number | null;
  }>;
  const result: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    if (!isValidGroupFolder(row.folder)) {
      logger.warn(
        { jid: row.jid, folder: row.folder },
        'Skipping registered group with invalid folder',
      );
      continue;
    }
    result[row.jid] = {
      name: row.name,
      folder: row.folder,
      trigger: row.trigger_pattern,
      added_at: row.added_at,
      requiresTrigger:
        row.requires_trigger === null ? undefined : row.requires_trigger === 1,
      isMain: row.is_main === 1 ? true : undefined,
    };
  }
  return result;
}

// --- JSON migration ---

function migrateJsonState(): void {
  const migrateFile = (filename: string) => {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      fs.renameSync(filePath, `${filePath}.migrated`);
      return data;
    } catch {
      return null;
    }
  };

  // Migrate router_state.json
  const routerState = migrateFile('router_state.json') as {
    last_timestamp?: string;
    last_agent_timestamp?: Record<string, string>;
  } | null;
  if (routerState) {
    if (routerState.last_timestamp) {
      setRouterState('last_timestamp', routerState.last_timestamp);
    }
    if (routerState.last_agent_timestamp) {
      setRouterState(
        'last_agent_timestamp',
        JSON.stringify(routerState.last_agent_timestamp),
      );
    }
  }

  // Migrate sessions.json
  const sessions = migrateFile('sessions.json') as Record<
    string,
    string
  > | null;
  if (sessions) {
    for (const [folder, sessionId] of Object.entries(sessions)) {
      setSession(folder, sessionId);
    }
  }

  // Migrate registered_groups.json
  const groups = migrateFile('registered_groups.json') as Record<
    string,
    RegisteredGroup
  > | null;
  if (groups) {
    for (const [jid, group] of Object.entries(groups)) {
      try {
        setRegisteredGroup(jid, group);
      } catch (err) {
        logger.warn(
          { jid, folder: group.folder, err },
          'Skipping migrated registered group with invalid folder',
        );
      }
    }
  }
}

// --- Conversation helpers ---

export interface ConversationRow {
  id: string;
  workspace_id: string;
  session_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  parts: string | null;
  attachment: string | null;
  model: string | null;
  api_calls: string | null;
  created_at: string;
}

export function createConversation(
  db: Database.Database,
  workspaceId: string,
): ConversationRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversations (id, workspace_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, workspaceId, '新对话', now, now);
  return {
    id,
    workspace_id: workspaceId,
    session_id: null,
    name: '新对话',
    created_at: now,
    updated_at: now,
  };
}

export function getConversationsByWorkspace(
  db: Database.Database,
  workspaceId: string,
): ConversationRow[] {
  // Stable sort: updated_at DESC, then id DESC as tiebreaker
  // This ensures consistent ordering even when updated_at values are identical
  return db
    .prepare(
      `SELECT * FROM conversations WHERE workspace_id = ? ORDER BY updated_at DESC, id DESC`,
    )
    .all(workspaceId) as ConversationRow[];
}

export function getConversation(
  db: Database.Database,
  id: string,
): ConversationRow | null {
  return db
    .prepare(`SELECT * FROM conversations WHERE id = ?`)
    .get(id) as ConversationRow | null;
}

export function updateConversation(
  db: Database.Database,
  id: string,
  name: string,
): void {
  db.prepare(
    `UPDATE conversations SET name = ?, updated_at = ? WHERE id = ?`,
  ).run(name, new Date().toISOString(), id);
}

export function updateConversationSession(
  db: Database.Database,
  id: string,
  sessionId: string,
): void {
  db.prepare(
    `UPDATE conversations SET session_id = ?, updated_at = ? WHERE id = ?`,
  ).run(sessionId, new Date().toISOString(), id);
}

export function deleteConversation(db: Database.Database, id: string): void {
  db.prepare(`DELETE FROM conversation_messages WHERE conversation_id = ?`).run(
    id,
  );
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

export function addConversationMessage(
  db: Database.Database,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  parts?: string,
  attachment?: string,
  model?: string,
  apiCalls?: string,
): ConversationMessageRow {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO conversation_messages (id, conversation_id, role, content, parts, attachment, model, api_calls, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    conversationId,
    role,
    content,
    parts ?? null,
    attachment ?? null,
    model ?? null,
    apiCalls ?? null,
    now,
  );
  // Update conversation updated_at
  db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(
    now,
    conversationId,
  );
  return {
    id,
    conversation_id: conversationId,
    role,
    content,
    parts: parts ?? null,
    attachment: attachment ?? null,
    model: model ?? null,
    api_calls: apiCalls ?? null,
    created_at: now,
  };
}

/**
 * Update an existing conversation message (for streaming updates).
 * Used to persist thinking/tool_use parts before stream_end.
 */
export function updateConversationMessage(
  db: Database.Database,
  messageId: string,
  updates: {
    content?: string;
    parts?: string;
    model?: string;
    apiCalls?: string;
  },
): boolean {
  const setClauses: string[] = [];
  const values: (string | null)[] = [];

  if (updates.content !== undefined) {
    setClauses.push('content = ?');
    values.push(updates.content);
  }
  if (updates.parts !== undefined) {
    setClauses.push('parts = ?');
    values.push(updates.parts);
  }
  if (updates.model !== undefined) {
    setClauses.push('model = ?');
    values.push(updates.model);
  }
  if (updates.apiCalls !== undefined) {
    setClauses.push('api_calls = ?');
    values.push(updates.apiCalls);
  }

  if (setClauses.length === 0) return false;

  values.push(messageId);
  const result = db
    .prepare(
      `UPDATE conversation_messages SET ${setClauses.join(', ')} WHERE id = ?`,
    )
    .run(...values);

  return result.changes > 0;
}

/**
 * Get the last assistant message in a conversation (for streaming updates).
 */
export function getLastAssistantMessage(
  db: Database.Database,
  conversationId: string,
): ConversationMessageRow | null {
  return db
    .prepare(
      `SELECT * FROM conversation_messages WHERE conversation_id = ? AND role = 'assistant' ORDER BY created_at DESC LIMIT 1`,
    )
    .get(conversationId) as ConversationMessageRow | null;
}

export function getConversationMessages(
  db: Database.Database,
  conversationId: string,
  limit = 100,
  before?: string,
): ConversationMessageRow[] {
  if (before) {
    // Pagination: load older messages before 'before' timestamp, in chronological order
    // so they can be prepended to the existing message list
    // Use rowid ASC as tiebreaker for stable ordering (monotonically increasing)
    return db
      .prepare(
        `SELECT * FROM conversation_messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at ASC, rowid ASC LIMIT ?`,
      )
      .all(conversationId, before, limit) as ConversationMessageRow[];
  }
  // Default: return the newest N messages in chronological order (oldest-first)
  // so the chat UI shows newest at the bottom. Uses a subquery to first pick
  // the newest N messages (DESC), then re-sorts them ASC for display.
  // rowid guarantees insertion-order stability when timestamps are equal.
  return db
    .prepare(
      `SELECT * FROM (
        SELECT *, rowid AS _rowid FROM conversation_messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?
      ) ORDER BY created_at ASC, _rowid ASC`,
    )
    .all(conversationId, limit) as ConversationMessageRow[];
}

// --- Launchpad helpers ---

import type { LaunchpadItem, LaunchpadLayout, AppCategory } from './channels/launchpad/types.js';

export interface LaunchpadAppRow {
  id: string;
  name: string;
  name_zh: string | null;
  kind: string;
  path: string;
  bundle_id: string | null;
  icon: string | null;
  category: string | null;
  tags: string | null;
  children: string | null;
  launch_command: string | null;
  launch_args: string | null;
  working_directory: string | null;
  env: string | null;
  usage_count: number;
  last_used_at: string | null;
  installed_at: string | null;
  description: string | null;
  version: string | null;
  developer: string | null;
  homepage: string | null;
  repository: string | null;
  store_id: string | null;
  status: string;
  update_available: number;
  installed_version: string | null;
  latest_version: string | null;
  hidden: number;
  pinned: number;
  page_index: number;
  grid_index: number;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

export function getAllLaunchpadApps(options?: {
  kind?: string;
  category?: string;
  includeHidden?: boolean;
}): LaunchpadAppRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options?.kind && options.kind !== 'all') {
    conditions.push('kind = ?');
    params.push(options.kind);
  }
  if (options?.category) {
    conditions.push('category = ?');
    params.push(options.category);
  }
  if (!options?.includeHidden) {
    conditions.push('hidden = 0');
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM launchpad_apps ${whereClause} ORDER BY name ASC`)
    .all(...params) as LaunchpadAppRow[];
}

export function getLaunchpadApp(id: string): LaunchpadAppRow | null {
  return db.prepare('SELECT * FROM launchpad_apps WHERE id = ?').get(id) as LaunchpadAppRow | null;
}

export function getLaunchpadAppByPath(path: string): LaunchpadAppRow | null {
  return db.prepare('SELECT * FROM launchpad_apps WHERE path = ?').get(path) as LaunchpadAppRow | null;
}

export function upsertLaunchpadApp(app: Partial<LaunchpadItem> & { id: string; name: string; kind: string; path: string; parentId?: string | null }): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO launchpad_apps (
      id, name, name_zh, kind, path, bundle_id, icon, category, tags, children,
      launch_command, launch_args, working_directory, env, usage_count,
      last_used_at, installed_at, description, version, developer,
      homepage, repository, store_id, status, update_available,
      installed_version, latest_version, hidden, pinned, page_index, grid_index, parent_id,
      terminal_mode, pre_launch_script, post_launch_actions, dependencies, auto_detect,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      name_zh = COALESCE(excluded.name_zh, name_zh),
      icon = COALESCE(excluded.icon, icon),
      category = COALESCE(excluded.category, category),
      launch_command = COALESCE(excluded.launch_command, launch_command),
      working_directory = COALESCE(excluded.working_directory, working_directory),
      version = COALESCE(excluded.version, version),
      description = COALESCE(excluded.description, description),
      parent_id = COALESCE(excluded.parent_id, parent_id),
      terminal_mode = COALESCE(excluded.terminal_mode, terminal_mode),
      pre_launch_script = COALESCE(excluded.pre_launch_script, pre_launch_script),
      post_launch_actions = COALESCE(excluded.post_launch_actions, post_launch_actions),
      dependencies = COALESCE(excluded.dependencies, dependencies),
      updated_at = excluded.updated_at
  `).run(
    app.id,
    app.name,
    app.nameZh ?? null,
    app.kind,
    app.path,
    app.bundleId ?? null,
    app.icon ?? null,
    app.category ?? null,
    JSON.stringify(app.tags ?? []),
    app.children ? JSON.stringify(app.children) : null,
    app.launchCommand ?? null,
    app.launchArgs ? JSON.stringify(app.launchArgs) : null,
    app.workingDirectory ?? null,
    app.env ? JSON.stringify(app.env) : null,
    app.usageCount ?? 0,
    app.lastUsedAt ?? null,
    app.installedAt ?? now,
    app.description ?? null,
    app.version ?? null,
    app.developer ?? null,
    app.homepage ?? null,
    app.repository ?? null,
    app.storeId ?? null,
    app.status ?? 'installed',
    app.updateAvailable ? 1 : 0,
    app.installedVersion ?? null,
    app.latestVersion ?? null,
    app.hidden ? 1 : 0,
    app.pinned ? 1 : 0,
    app.pageIndex ?? 0,
    app.gridIndex ?? 0,
    app.parentId ?? null,
    app.terminalMode ?? 'new-window',
    app.preLaunchScript ?? null,
    app.postLaunchActions ? JSON.stringify(app.postLaunchActions) : null,
    app.dependencies ? JSON.stringify(app.dependencies) : null,
    app.autoDetect ? 1 : 0,
    now,
    now,
  );
}

export function updateLaunchpadApp(id: string, updates: Partial<LaunchpadItem>): void {
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    values.push(updates.name);
  }
  if (updates.nameZh !== undefined) {
    setClauses.push('name_zh = ?');
    values.push(updates.nameZh);
  }
  if (updates.icon !== undefined) {
    setClauses.push('icon = ?');
    values.push(updates.icon);
  }
  if (updates.category !== undefined) {
    setClauses.push('category = ?');
    values.push(updates.category);
  }
  if (updates.hidden !== undefined) {
    setClauses.push('hidden = ?');
    values.push(updates.hidden ? 1 : 0);
  }
  if (updates.pinned !== undefined) {
    setClauses.push('pinned = ?');
    values.push(updates.pinned ? 1 : 0);
  }
  if (updates.usageCount !== undefined) {
    setClauses.push('usage_count = ?');
    values.push(updates.usageCount);
  }
  if (updates.lastUsedAt !== undefined) {
    setClauses.push('last_used_at = ?');
    values.push(updates.lastUsedAt);
  }
  if (updates.pageIndex !== undefined) {
    setClauses.push('page_index = ?');
    values.push(updates.pageIndex);
  }
  if (updates.gridIndex !== undefined) {
    setClauses.push('grid_index = ?');
    values.push(updates.gridIndex);
  }
  if ('parentId' in updates) {
    setClauses.push('parent_id = ?');
    values.push((updates as { parentId: string | null }).parentId ?? null);
  }

  // Smart launch fields
  if (updates.launchCommand !== undefined) {
    setClauses.push('launch_command = ?');
    values.push(updates.launchCommand);
  }
  if (updates.workingDirectory !== undefined) {
    setClauses.push('working_directory = ?');
    values.push(updates.workingDirectory);
  }
  if (updates.terminalMode !== undefined) {
    setClauses.push('terminal_mode = ?');
    values.push(updates.terminalMode);
  }
  if (updates.preLaunchScript !== undefined) {
    setClauses.push('pre_launch_script = ?');
    values.push(updates.preLaunchScript);
  }
  if (updates.postLaunchActions !== undefined) {
    setClauses.push('post_launch_actions = ?');
    values.push(JSON.stringify(updates.postLaunchActions));
  }
  if (updates.dependencies !== undefined) {
    setClauses.push('dependencies = ?');
    values.push(JSON.stringify(updates.dependencies));
  }

  if (setClauses.length === 0) return;

  setClauses.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE launchpad_apps SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteLaunchpadApp(id: string): void {
  db.prepare('DELETE FROM launchpad_apps WHERE id = ?').run(id);
}

export function incrementLaunchpadAppUsage(id: string): void {
  db.prepare(`
    UPDATE launchpad_apps
    SET usage_count = usage_count + 1, last_used_at = ?, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), new Date().toISOString(), id);
}

export function searchLaunchpadApps(query: string, limit = 50): LaunchpadAppRow[] {
  const searchTerm = `%${query}%`;
  return db
    .prepare(`
      SELECT * FROM launchpad_apps
      WHERE hidden = 0 AND (name LIKE ? OR name_zh LIKE ? OR description LIKE ?)
      ORDER BY usage_count DESC, name ASC
      LIMIT ?
    `)
    .all(searchTerm, searchTerm, searchTerm, limit) as LaunchpadAppRow[];
}

export function getLaunchpadLayout(): LaunchpadLayout {
  const row = db.prepare('SELECT * FROM launchpad_layout WHERE id = ?').get('default') as {
    columns: number;
    rows: number;
    icon_size: number;
    show_labels: number;
    animation_enabled: number;
  } | undefined;

  return {
    columns: row?.columns ?? 7,
    rows: row?.rows ?? 5,
    iconSize: row?.icon_size ?? 64,
    showLabels: row?.show_labels !== 0,
    animationEnabled: row?.animation_enabled !== 0,
  };
}

export function updateLaunchpadLayout(layout: Partial<LaunchpadLayout>): void {
  const current = getLaunchpadLayout();
  const updated = { ...current, ...layout };

  db.prepare(`
    INSERT OR REPLACE INTO launchpad_layout (id, columns, rows, icon_size, show_labels, animation_enabled)
    VALUES ('default', ?, ?, ?, ?, ?)
  `).run(
    updated.columns,
    updated.rows,
    updated.iconSize,
    updated.showLabels ? 1 : 0,
    updated.animationEnabled ? 1 : 0,
  );
}

export function getLaunchpadCategories(): AppCategory[] {
  return db
    .prepare('SELECT * FROM launchpad_categories ORDER BY name ASC')
    .all() as AppCategory[];
}

export function upsertLaunchpadCategory(category: AppCategory): void {
  db.prepare(`
    INSERT OR REPLACE INTO launchpad_categories (id, name, name_zh, icon, type, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    category.id,
    category.name,
    category.nameZh ?? null,
    category.icon,
    category.type,
    new Date().toISOString(),
  );
}

export function getLaunchpadScanDirs(): Array<{ path: string; enabled: boolean; watch: boolean }> {
  return db
    .prepare('SELECT path, enabled, watch FROM launchpad_scan_dirs WHERE enabled = 1')
    .all() as Array<{ path: string; enabled: boolean; watch: boolean }>;
}

export function upsertLaunchpadScanDir(path: string, watch = true): void {
  db.prepare(`
    INSERT OR REPLACE INTO launchpad_scan_dirs (path, enabled, watch, created_at)
    VALUES (?, 1, ?, ?)
  `).run(path, watch ? 1 : 0, new Date().toISOString());
}

export function deleteLaunchpadScanDir(path: string): void {
  db.prepare('DELETE FROM launchpad_scan_dirs WHERE path = ?').run(path);
}
