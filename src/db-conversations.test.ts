import { describe, it, expect, beforeEach } from 'vitest';
import {
  _initTestDatabase,
  createConversation,
  getConversationsByWorkspace,
  getConversation,
  updateConversation,
  updateConversationSession,
  deleteConversation,
  addConversationMessage,
  getConversationMessages,
} from './db.js';

describe('conversation CRUD', () => {
  let db: ReturnType<typeof _initTestDatabase>;

  beforeEach(() => {
    db = _initTestDatabase();
    // Insert minimal workspace rows for FK constraints
    db.exec(`
      INSERT INTO workspaces (id, name, path, enabled_skills, created_at, last_used_at)
      VALUES ('ws-1', 'Test Workspace 1', '/tmp/ws1', '[]', datetime('now'), NULL);
      INSERT INTO workspaces (id, name, path, enabled_skills, created_at, last_used_at)
      VALUES ('ws-2', 'Test Workspace 2', '/tmp/ws2', '[]', datetime('now'), NULL);
    `);
  });

  it('creates a conversation with default name', () => {
    const conv = createConversation(db, 'ws-1');
    expect(conv.name).toBe('新对话');
    expect(conv.workspace_id).toBe('ws-1');
    expect(conv.session_id).toBeNull();
  });

  it('lists conversations by workspace ordered by updated_at desc', () => {
    const conv1 = createConversation(db, 'ws-1');
    const conv2 = createConversation(db, 'ws-1');
    const conv3 = createConversation(db, 'ws-2');
    // Update conv1 to make it newer
    updateConversation(db, conv1.id, 'Updated');
    const ws1Convs = getConversationsByWorkspace(db, 'ws-1');
    expect(ws1Convs.length).toBe(2);
    // conv1 should be first due to updated_at
    expect(ws1Convs[0].id).toBe(conv1.id);
  });

  it('updates conversation name', () => {
    const conv = createConversation(db, 'ws-1');
    updateConversation(db, conv.id, '新名称');
    const updated = getConversation(db, conv.id);
    expect(updated?.name).toBe('新名称');
  });

  it('updates conversation session_id', () => {
    const conv = createConversation(db, 'ws-1');
    expect(conv.session_id).toBeNull();
    updateConversationSession(db, conv.id, 'session-abc');
    const updated = getConversation(db, conv.id);
    expect(updated?.session_id).toBe('session-abc');
  });

  it('deletes conversation and its messages', () => {
    const conv = createConversation(db, 'ws-1');
    addConversationMessage(db, conv.id, 'user', 'Hello');
    addConversationMessage(db, conv.id, 'assistant', 'Hi');
    deleteConversation(db, conv.id);
    expect(getConversationsByWorkspace(db, 'ws-1').find(c => c.id === conv.id)).toBeUndefined();
    expect(getConversationMessages(db, conv.id).length).toBe(0);
  });

  it('adds and retrieves messages with parts', () => {
    const conv = createConversation(db, 'ws-1');
    const parts = JSON.stringify([{ type: 'thinking', text: '思考中...' }]);
    addConversationMessage(db, conv.id, 'user', 'Hello', undefined);
    addConversationMessage(db, conv.id, 'assistant', 'Hi there', parts);
    const messages = getConversationMessages(db, conv.id);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(JSON.parse(messages[1].parts!)).toEqual([{ type: 'thinking', text: '思考中...' }]);
  });

  it('message count returns correct total', () => {
    const conv = createConversation(db, 'ws-1');
    addConversationMessage(db, conv.id, 'user', 'Hello');
    addConversationMessage(db, conv.id, 'assistant', 'Hi');
    addConversationMessage(db, conv.id, 'user', 'How are you?');
    const messages = getConversationMessages(db, conv.id);
    expect(messages.length).toBe(3);
  });
});
