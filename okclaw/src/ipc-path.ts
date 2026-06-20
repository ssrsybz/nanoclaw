import path from 'path';

import { DATA_DIR } from './config.js';

/**
 * Compute the IPC key for a given agent session.
 *
 * This key determines the IPC directory path used for follow-up messages
 * (piped messages sent while an agent is already running). Both the writer
 * (group-queue.sendMessage) and the reader (agent-runner) MUST call this
 * function so they always agree on the same path.
 *
 * @param groupFolder  The group's folder property (e.g. "web-main", "discord-main")
 * @param conversationId  If set, produces "web-main--conv-{id}"
 * @param workspaceId  If set (and no conversationId), produces "web-main--ws-{id}"
 * @returns The IPC key — use with getIpcInputDir() to get the full path
 */
export function getIpcKey(
  groupFolder: string,
  conversationId?: string,
  workspaceId?: string,
): string {
  if (conversationId) return `${groupFolder}--conv-${conversationId}`;
  if (workspaceId) return `${groupFolder}--ws-${workspaceId}`;
  return groupFolder;
}

/**
 * Get the IPC input directory path for a given IPC key.
 *
 * Follow-up messages are written to files in this directory by
 * group-queue.sendMessage() and consumed by the agent's IPC input watcher.
 */
export function getIpcInputDir(ipcKey: string): string {
  return path.join(DATA_DIR, 'ipc', ipcKey, 'input');
}
