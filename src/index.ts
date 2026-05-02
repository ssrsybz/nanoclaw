import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  DEFAULT_TRIGGER,
  getTriggerPattern,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  MAX_MESSAGES_PER_PROMPT,
  POLL_INTERVAL,
  TIMEZONE,
} from './config.js';
import './channels/index.js';
import {
  getChannelFactory,
  getRegisteredChannelNames,
} from './channels/registry.js';
import {
  AgentOutput,
  runAgentDirect,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './agent-runner.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getConversation,
  getDb,
  getLastBotMessageTimestamp,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  storeChatMetadata,
  storeMessage,
  updateConversation,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { resolveGroupFolderPath } from './group-folder.js';
import { startIpcWatcher } from './ipc.js';
import { findChannel, formatMessages, formatOutbound } from './router.js';
import {
  restoreRemoteControl,
  startRemoteControl,
  stopRemoteControl,
} from './remote-control.js';
import {
  isSenderAllowed,
  isTriggerAllowed,
  loadSenderAllowlist,
  shouldDropMessage,
} from './sender-allowlist.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { Channel, NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';
import { initStatusReporter, pushStatus } from './star-office-reporter.js';
import { getWorkspace } from './workspace.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

const channels: Channel[] = [];
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

/**
 * Return the message cursor for a group, recovering from the last bot reply
 * if lastAgentTimestamp is missing (new group, corrupted state, restart).
 */
function getOrRecoverCursor(chatJid: string): string {
  const existing = lastAgentTimestamp[chatJid];
  if (existing) return existing;

  const botTs = getLastBotMessageTimestamp(chatJid, ASSISTANT_NAME);
  if (botTs) {
    logger.info(
      { chatJid, recoveredFrom: botTs },
      'Recovered message cursor from last bot reply',
    );
    lastAgentTimestamp[chatJid] = botTs;
    saveState();
    return botTs;
  }
  return '';
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  let groupDir: string;
  try {
    groupDir = resolveGroupFolderPath(group.folder);
  } catch (err) {
    logger.warn(
      { jid, folder: group.folder, err },
      'Rejecting group registration with invalid folder',
    );
    return;
  }

  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  // Copy CLAUDE.md template into the new group folder so agents have
  // identity and instructions from the first run.  (Fixes #1391)
  const groupMdFile = path.join(groupDir, 'CLAUDE.md');
  if (!fs.existsSync(groupMdFile)) {
    const templateFile = path.join(
      GROUPS_DIR,
      group.isMain ? 'main' : 'global',
      'CLAUDE.md',
    );
    if (fs.existsSync(templateFile)) {
      let content = fs.readFileSync(templateFile, 'utf-8');
      if (ASSISTANT_NAME !== 'Andy') {
        content = content.replace(/^# Andy$/m, `# ${ASSISTANT_NAME}`);
        content = content.replace(/You are Andy/g, `You are ${ASSISTANT_NAME}`);
      }
      fs.writeFileSync(groupMdFile, content);
      logger.info({ folder: group.folder }, 'Created CLAUDE.md from template');
    }
  }

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

/**
 * Get available groups list for the agent.
 * Returns groups ordered by most recent activity.
 */
export function getAvailableGroups(): import('./agent-runner.js').AvailableGroup[] {
  const chats = getAllChats();
  const registeredJids = new Set(Object.keys(registeredGroups));

  return chats
    .filter((c) => c.jid !== '__group_sync__' && c.is_group)
    .map((c) => ({
      jid: c.jid,
      name: c.name,
      lastActivity: c.last_message_time,
      isRegistered: registeredJids.has(c.jid),
    }));
}

/** @internal - exported for testing */
export function _setRegisteredGroups(
  groups: Record<string, RegisteredGroup>,
): void {
  registeredGroups = groups;
}

/**
 * Process all pending messages for a group.
 * Called by the GroupQueue when it's this group's turn.
 */
async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const channel = findChannel(channels, chatJid);
  if (!channel) {
    logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
    return true;
  }

  const isMainGroup = group.isMain === true;

  const cursor = getOrRecoverCursor(chatJid);
  const missedMessages = getMessagesSince(
    chatJid,
    cursor,
    ASSISTANT_NAME,
    MAX_MESSAGES_PER_PROMPT,
  );

  logger.info(
    { chatJid, cursor, missedCount: missedMessages.length },
    'processGroupMessages called',
  );
  if (missedMessages.length === 0) return true;

  // Resolve workspace context from the LAST message that carries workspaceId
  // (missedMessages is sorted oldest-first; get the last one with workspaceId)
  let workspaceId: string | undefined;
  let workspacePath: string | undefined;
  let enabledSkills: string[] | undefined;
  const messagesWithWorkspace = missedMessages.filter((m) => m.workspaceId);
  const withWorkspace = messagesWithWorkspace[messagesWithWorkspace.length - 1];
  if (withWorkspace?.workspaceId) {
    workspaceId = withWorkspace.workspaceId;
    const ws = getWorkspace(getDb(), workspaceId);
    if (ws) {
      // Validate that the workspace directory exists before using it
      if (fs.existsSync(ws.path) && fs.statSync(ws.path).isDirectory()) {
        workspacePath = ws.path;
        enabledSkills = ws.enabledSkills;
      } else {
        // Workspace directory doesn't exist, fall back to default group folder
        logger.warn(
          { workspaceId, workspacePath: ws.path },
          'Workspace directory not found, using default group folder',
        );
        workspaceId = undefined;
      }
    }
  }

  // Resolve conversationId from the LAST message that carries it
  let conversationId: string | undefined;
  const messagesWithConversation = missedMessages.filter(
    (m) => m.conversationId,
  );
  const withConversation =
    messagesWithConversation[messagesWithConversation.length - 1];
  if (withConversation?.conversationId) {
    conversationId = withConversation.conversationId;
  }

  // Filter messages to only include those from the same workspace.
  // This ensures workspace isolation when multiple workspaces share a chatJid.
  const filteredMessages = workspaceId
    ? missedMessages.filter(
        (m) => !m.workspaceId || m.workspaceId === workspaceId,
      )
    : missedMessages;

  if (filteredMessages.length === 0) return true;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const triggerPattern = getTriggerPattern(group.trigger);
    const allowlistCfg = loadSenderAllowlist();
    const hasTrigger = filteredMessages.some(
      (m) =>
        triggerPattern.test(m.content.trim()) &&
        (m.is_from_me || isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
    );
    if (!hasTrigger) return true;
  }

  // Check for skill injection from messages
  const skillMsg = filteredMessages.find((m) => m.skill);
  let prompt = formatMessages(filteredMessages, TIMEZONE);
  if (skillMsg?.skill) {
    prompt = `[SKILL: ${skillMsg.skill.name}]\n${skillMsg.skill.content}\n[/SKILL]\n\n${prompt}`;
    logger.info(
      { skillName: skillMsg.skill.name, chatJid },
      'Injected skill content into prompt',
    );
  }

  // Advance cursor so the piping path in startMessageLoop won't re-fetch
  // these messages. Save the old cursor so we can roll back on error.
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] =
    filteredMessages[filteredMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: filteredMessages.length, workspaceId },
    'Processing messages',
  );

  await channel.setTyping?.(chatJid, true);
  let hadError = false;
  let outputSentToUser = false;

  // Send stream_start event to mark the beginning of an Agent turn
  if (channel.sendStructured) {
    await channel.sendStructured(chatJid, {
      type: 'stream_start',
      workspaceId: workspaceId ?? null,
      conversationId: conversationId ?? null,
    });
  }

  let streamingSent = false;
  const agentResult = await runAgent(
    group,
    prompt,
    chatJid,
    workspacePath,
    enabledSkills,
    workspaceId,
    conversationId,
    async (result) => {
      // Handle streaming messages (assistant, thinking, tool_use)
      if (result.streamType && channel.sendStructured) {
        streamingSent = true;

        if (result.streamType === 'assistant' && result.streamData?.text) {
          await channel.sendStructured(chatJid, {
            type: 'assistant',
            content: result.streamData.text,
            workspaceId: workspaceId ?? null,
            conversationId: conversationId ?? null,
          });
          outputSentToUser = true;
        } else if (
          result.streamType === 'thinking' &&
          result.streamData?.thinking
        ) {
          await channel.sendStructured(chatJid, {
            type: 'thinking',
            content: result.streamData.thinking,
            workspaceId: workspaceId ?? null,
            conversationId: conversationId ?? null,
          });
        } else if (result.streamType === 'tool_use') {
          await channel.sendStructured(chatJid, {
            type: 'tool_use',
            toolName: result.streamData?.toolName,
            toolInput: result.streamData?.toolInput,
            toolMeta: result.streamData?.toolMeta,
            workspaceId: workspaceId ?? null,
            conversationId: conversationId ?? null,
          });
        } else if (result.streamType === 'tool_result' && result.streamData?.toolOutput) {
          await channel.sendStructured(chatJid, {
            type: 'tool_result',
            content: result.streamData.toolOutput,
            toolMeta: result.streamData?.toolMeta,
            workspaceId: workspaceId ?? null,
            conversationId: conversationId ?? null,
          });
        } else if (result.streamType === 'ask_user_question' && result.streamData?.questions) {
          // Forward AskUserQuestion to frontend for dialog display
          await channel.sendStructured(chatJid, {
            type: 'ask_user_question',
            questions: result.streamData.questions,
            toolUseId: result.streamData.toolUseId,
            workspaceId: workspaceId ?? null,
            conversationId: conversationId ?? null,
          });
        }
        return;
      }

      // Skip result if we already sent streaming messages (avoids duplicates)
      if (streamingSent) return;

      // Legacy: final result text (only when no streaming)
      if (result.result) {
        const raw =
          typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result);
        const text = raw.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
        logger.info({ group: group.name }, `Agent output: ${raw.length} chars`);
        if (text && channel.sendStructured) {
          await channel.sendStructured(chatJid, {
            type: 'assistant',
            content: text,
            workspaceId: workspaceId ?? null,
            conversationId: conversationId ?? null,
          });
        } else if (text) {
          await channel.sendMessage(chatJid, text);
        }
        outputSentToUser = true;
      }

      if (result.status === 'error') {
        hadError = true;
      }
    },
  );

  // Send stream_end event to mark the end of an Agent turn
  if (channel.sendStructured) {
    await channel.sendStructured(chatJid, {
      type: 'stream_end',
      workspaceId: workspaceId ?? null,
      conversationId: conversationId ?? null,
      model: agentResult.model,
      apiCalls: agentResult.apiCalls,
    });
  }
  await channel.setTyping?.(chatJid, false);

  // Generate title for new conversations (silent background call)
  if (conversationId && workspaceId && agentResult.status === 'success') {
    try {
      const db = getDb();
      const conversation = getConversation(db, conversationId);
      if (conversation && conversation.name === '新对话') {
        // Use the same session to generate a title
        const sessionKey = `${group.folder}--conv-${conversationId}`;
        const currentSessionId = sessions[sessionKey] || agentResult.newSessionId;

        // Silently call agent to generate title (no onOutput = no UI update)
        let generatedTitle = '';
        const titleResult = await runAgentDirect(
          group,
          {
            prompt: '请为我们的对话生成一个2-6个汉字的简短标题，只输出标题本身，不要任何标点符号、引号或其他内容。',
            sessionId: currentSessionId,
            groupFolder: group.folder,
            chatJid,
            isMain: group.isMain === true,
            assistantName: ASSISTANT_NAME,
            workspacePath,
            enabledSkills,
            workspaceId,
          },
          // Silent output handler - captures title but doesn't send to user
          async (output) => {
            if (output.streamType === 'assistant' && output.streamData?.text) {
              generatedTitle += output.streamData.text;
            }
            if (output.newSessionId) {
              sessions[sessionKey] = output.newSessionId;
              setSession(sessionKey, output.newSessionId);
            }
          },
        );

        // Clean and validate title
        const cleanTitle = generatedTitle
          .replace(/^["'"]|["']$/g, '')
          .replace(/[，。！？、：；""''【】（）\n\r]/g, '')
          .replace(/[.,!?;:()[\]{}]/g, '')
          .trim()
          .slice(0, 20);

        if (cleanTitle && cleanTitle !== '新对话' && titleResult.status === 'success') {
          updateConversation(db, conversationId, cleanTitle);
          logger.info({ convId: conversationId, title: cleanTitle }, 'Generated conversation title');

          // Notify frontend to update the conversation name
          if (channel.sendStructured) {
            await channel.sendStructured(chatJid, {
              type: 'conversation_renamed',
              workspaceId: workspaceId,
              conversationId: conversationId,
              newName: cleanTitle,
            });
          }
        }
      }
    } catch (err) {
      logger.warn({ err, convId: conversationId }, 'Failed to generate title');
    }
  }

  if (agentResult.status === 'error' || hadError) {
    // If we already sent output to the user, don't roll back the cursor —
    // the user got their response and re-processing would send duplicates.
    if (outputSentToUser) {
      logger.warn(
        { group: group.name },
        'Agent error after output was sent, skipping cursor rollback to prevent duplicates',
      );
      return true;
    }
    // Roll back cursor so retries can re-process these messages
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  workspacePath?: string,
  enabledSkills?: string[],
  workspaceId?: string,
  conversationId?: string,
  onOutput?: (output: AgentOutput) => Promise<void>,
): Promise<{ status: 'success' | 'error'; model?: string; apiCalls?: AgentOutput['apiCalls']; newSessionId?: string }> {
  const isMain = group.isMain === true;
  // Use conversation-aware session key so each conversation has isolated context
  const sessionKey = conversationId
    ? `${group.folder}--conv-${conversationId}`
    : workspaceId
      ? `${group.folder}--ws-${workspaceId}`
      : group.folder;
  const sessionId = sessions[sessionKey];

  logger.info(
    {
      group: group.name,
      sessionKey,
      sessionId: sessionId || '(new)',
      workspaceId,
    },
    'Agent session lookup',
  );

  // Update tasks snapshot for agent to read (filtered by group)
  const tasks = getAllTasks();
  writeTasksSnapshot(
    group.folder,
    isMain,
    tasks.map((t) => ({
      id: t.id,
      groupFolder: t.group_folder,
      prompt: t.prompt,
      script: t.script || undefined,
      schedule_type: t.schedule_type,
      schedule_value: t.schedule_value,
      status: t.status,
      next_run: t.next_run,
    })),
  );

  // Update available groups snapshot (main group only can see all groups)
  const availableGroups = getAvailableGroups();
  writeGroupsSnapshot(
    group.folder,
    isMain,
    availableGroups,
    new Set(Object.keys(registeredGroups)),
  );

  // Wrap onOutput to track session ID from streamed results
  const wrappedOnOutput = onOutput
    ? async (output: AgentOutput) => {
        if (output.newSessionId) {
          sessions[sessionKey] = output.newSessionId;
          setSession(sessionKey, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    // Register this agent session with the queue (keyed by chatJid so piping works per-JID)
    queue.registerAgent(chatJid, sessionKey);

    const output = await runAgentDirect(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        assistantName: ASSISTANT_NAME,
        workspacePath,
        enabledSkills,
        workspaceId,
        conversationId,
      },
      wrappedOnOutput,
    );

    if (output.newSessionId) {
      sessions[sessionKey] = output.newSessionId;
      setSession(sessionKey, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error({ group: group.name, error: output.error }, 'Agent error');
      return { status: 'error' };
    }

    return {
      status: 'success',
      model: output.model,
      apiCalls: output.apiCalls,
      newSessionId: output.newSessionId,
    };
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return { status: 'error' };
  } finally {
    queue.unregisterAgent(chatJid);
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`OKClaw running (default trigger: ${DEFAULT_TRIGGER})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        // Advance the "seen" cursor for all messages immediately
        lastTimestamp = newTimestamp;
        saveState();

        // Deduplicate by group
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const channel = findChannel(channels, chatJid);
          if (!channel) {
            logger.warn({ chatJid }, 'No channel owns JID, skipping messages');
            continue;
          }

          const isMainGroup = group.isMain === true;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          // For non-main groups, only act on trigger messages.
          // Non-trigger messages accumulate in DB and get pulled as
          // context when a trigger eventually arrives.
          if (needsTrigger) {
            const triggerPattern = getTriggerPattern(group.trigger);
            const allowlistCfg = loadSenderAllowlist();
            const hasTrigger = groupMessages.some(
              (m) =>
                triggerPattern.test(m.content.trim()) &&
                (m.is_from_me ||
                  isTriggerAllowed(chatJid, m.sender, allowlistCfg)),
            );
            if (!hasTrigger) continue;
          }

          // Pull all messages since lastAgentTimestamp so non-trigger
          // context that accumulated between triggers is included.
          const allPending = getMessagesSince(
            chatJid,
            getOrRecoverCursor(chatJid),
            ASSISTANT_NAME,
            MAX_MESSAGES_PER_PROMPT,
          );
          const messagesToSend =
            allPending.length > 0 ? allPending : groupMessages;

          // Extract workspaceId from messages to check workspace isolation
          const msgWorkspaceIds = [
            ...new Set(
              messagesToSend.map((m) => m.workspaceId).filter(Boolean),
            ),
          ];
          const firstWorkspaceId =
            msgWorkspaceIds.length === 1 ? msgWorkspaceIds[0] : undefined;

          // Check if active session matches the workspace of incoming messages.
          // If there's an active session for a DIFFERENT workspace, enqueue instead of piping
          // to prevent cross-workspace conversation mixing.
          const activeSessionKey = queue.getActiveSessionKey(chatJid);
          const activeSessionWorkspaceId = activeSessionKey?.includes('--ws-')
            ? activeSessionKey.split('--ws-')[1]
            : undefined;
          const workspaceMismatch =
            firstWorkspaceId &&
            activeSessionWorkspaceId &&
            firstWorkspaceId !== activeSessionWorkspaceId;

          const formatted = formatMessages(messagesToSend, TIMEZONE);

          if (!workspaceMismatch && queue.sendMessage(chatJid, formatted)) {
            logger.debug(
              { chatJid, count: messagesToSend.length },
              'Piped messages to active agent session',
            );
            lastAgentTimestamp[chatJid] =
              messagesToSend[messagesToSend.length - 1].timestamp;
            saveState();
            // Show typing indicator while the agent processes the piped message
            channel
              .setTyping?.(chatJid, true)
              ?.catch((err) =>
                logger.warn({ chatJid, err }, 'Failed to set typing indicator'),
              );
          } else {
            // No active agent session — enqueue for a new one
            queue.enqueueMessageCheck(chatJid);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, 'Error in message loop');
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

/**
 * Startup recovery: check for unprocessed messages in registered groups.
 * Handles crash between advancing lastTimestamp and processing messages.
 */
function recoverPendingMessages(): void {
  for (const [chatJid, group] of Object.entries(registeredGroups)) {
    const pending = getMessagesSince(
      chatJid,
      getOrRecoverCursor(chatJid),
      ASSISTANT_NAME,
      MAX_MESSAGES_PER_PROMPT,
    );
    if (pending.length > 0) {
      logger.info(
        { group: group.name, pendingCount: pending.length },
        'Recovery: found unprocessed messages',
      );
      queue.enqueueMessageCheck(chatJid);
    }
  }
}

async function main(): Promise<void> {
  initDatabase();
  logger.info('Database initialized');
  loadState();

  // Initialize Star Office UI status reporter
  initStatusReporter();

  restoreRemoteControl();

  // Graceful shutdown handlers
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await queue.shutdown(10000);
    for (const ch of channels) await ch.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle /remote-control and /remote-control-end commands
  async function handleRemoteControl(
    command: string,
    chatJid: string,
    msg: NewMessage,
  ): Promise<void> {
    const group = registeredGroups[chatJid];
    if (!group?.isMain) {
      logger.warn(
        { chatJid, sender: msg.sender },
        'Remote control rejected: not main group',
      );
      return;
    }

    const channel = findChannel(channels, chatJid);
    if (!channel) return;

    if (command === '/remote-control') {
      const result = await startRemoteControl(
        msg.sender,
        chatJid,
        process.cwd(),
      );
      if (result.ok) {
        await channel.sendMessage(chatJid, result.url);
      } else {
        await channel.sendMessage(
          chatJid,
          `Remote Control failed: ${result.error}`,
        );
      }
    } else {
      const result = stopRemoteControl();
      if (result.ok) {
        await channel.sendMessage(chatJid, 'Remote Control session ended.');
      } else {
        await channel.sendMessage(chatJid, result.error);
      }
    }
  }

  // Channel callbacks (shared by all channels)
  const channelOpts = {
    onMessage: (chatJid: string, msg: NewMessage) => {
      // Push status to Star Office UI when receiving a message
      const group = registeredGroups[chatJid];
      if (group) {
        void pushStatus('writing', `收到 ${group.name} 的新消息...`);
      }

      // Remote control commands — intercept before storage
      const trimmed = msg.content.trim();
      if (trimmed === '/remote-control' || trimmed === '/remote-control-end') {
        handleRemoteControl(trimmed, chatJid, msg).catch((err) =>
          logger.error({ err, chatJid }, 'Remote control command error'),
        );
        return;
      }

      // Sender allowlist drop mode: discard messages from denied senders before storing
      if (!msg.is_from_me && !msg.is_bot_message && registeredGroups[chatJid]) {
        const cfg = loadSenderAllowlist();
        if (
          shouldDropMessage(chatJid, cfg) &&
          !isSenderAllowed(chatJid, msg.sender, cfg)
        ) {
          if (cfg.logDenied) {
            logger.debug(
              { chatJid, sender: msg.sender },
              'sender-allowlist: dropping message (drop mode)',
            );
          }
          return;
        }
      }
      storeMessage(msg);
    },
    onChatMetadata: (
      chatJid: string,
      timestamp: string,
      name?: string,
      channel?: string,
      isGroup?: boolean,
    ) => storeChatMetadata(chatJid, timestamp, name, channel, isGroup),
    registeredGroups: () => registeredGroups,
    registerGroup,
  };

  // Create and connect all registered channels.
  // Each channel self-registers via the barrel import above.
  // Factories return null when credentials are missing, so unconfigured channels are skipped.
  for (const channelName of getRegisteredChannelNames()) {
    const factory = getChannelFactory(channelName)!;
    const channel = factory(channelOpts);
    if (!channel) {
      logger.warn(
        { channel: channelName },
        'Channel installed but credentials missing — skipping. Check .env or re-run the channel skill.',
      );
      continue;
    }
    channels.push(channel);
    await channel.connect();
  }
  if (channels.length === 0) {
    logger.fatal('No channels connected');
    process.exit(1);
  }

  // Start subsystems (independently of connection handler)
  startSchedulerLoop({
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    sendMessage: async (jid, rawText) => {
      const channel = findChannel(channels, jid);
      if (!channel) {
        logger.warn({ jid }, 'No channel owns JID, cannot send message');
        return;
      }
      const text = formatOutbound(rawText);
      if (text) await channel.sendMessage(jid, text);
    },
  });
  startIpcWatcher({
    sendMessage: (jid, text) => {
      const channel = findChannel(channels, jid);
      if (!channel) throw new Error(`No channel for JID: ${jid}`);
      return channel.sendMessage(jid, text);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    syncGroups: async (force: boolean) => {
      await Promise.all(
        channels
          .filter((ch) => ch.syncGroups)
          .map((ch) => ch.syncGroups!(force)),
      );
    },
    getAvailableGroups,
    writeGroupsSnapshot: (gf, im, ag, rj) =>
      writeGroupsSnapshot(gf, im, ag, rj),
    onTasksChanged: () => {
      const tasks = getAllTasks();
      const taskRows = tasks.map((t) => ({
        id: t.id,
        groupFolder: t.group_folder,
        prompt: t.prompt,
        script: t.script || undefined,
        schedule_type: t.schedule_type,
        schedule_value: t.schedule_value,
        status: t.status,
        next_run: t.next_run,
      }));
      for (const group of Object.values(registeredGroups)) {
        writeTasksSnapshot(group.folder, group.isMain === true, taskRows);
      }
    },
  });
  queue.setProcessMessagesFn(processGroupMessages);
  queue.setOnFailure(async (chatJid: string) => {
    const channel = findChannel(channels, chatJid);
    if (!channel) return;
    const errMsg = '抱歉，处理消息时发生错误，请稍后重试。';
    if (channel.sendStructured) {
      await channel.sendStructured(chatJid, { type: 'assistant', content: errMsg });
    } else {
      await channel.sendMessage(chatJid, errMsg);
    }
  });
  recoverPendingMessages();
  startMessageLoop().catch((err) => {
    logger.fatal({ err }, 'Message loop crashed unexpectedly');
    process.exit(1);
  });
}

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  main().catch((err) => {
    logger.error({ err }, 'Failed to start OKClaw');
    process.exit(1);
  });
}
