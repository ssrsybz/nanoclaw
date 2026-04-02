import { Bot, ReceiverMode } from 'qq-official-bot';

import { logger } from '../logger.js';
import { readEnvFile } from '../env.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
  NewMessage,
} from '../types.js';

export interface QQChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

/**
 * QQ bot channel implementation using WebSocket mode.
 * No public URL required - ideal for local development.
 */
export class QQChannel implements Channel {
  name = 'qq';

  private bot: Bot | null = null;
  private opts: QQChannelOpts;
  private appId: string;
  private appSecret: string;
  private sandbox: boolean;
  private connected = false;

  constructor(
    appId: string,
    appSecret: string,
    sandbox: boolean,
    opts: QQChannelOpts,
  ) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.sandbox = sandbox;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.bot = new Bot({
      appid: this.appId,
      secret: this.appSecret,
      sandbox: this.sandbox,
      removeAt: true, // Automatically remove @bot from message content
      intents: [
        'GUILD_MESSAGES', // Guild channel messages
        'DIRECT_MESSAGE', // Guild direct messages
        'GROUP_AT_MESSAGE_CREATE', // Group @mention messages
        'C2C_MESSAGE_CREATE', // Private chat messages
      ],
      mode: ReceiverMode.WEBSOCKET,
    });

    // Handle incoming messages
    this.bot.on('message', async (event: any) => {
      await this.handleMessage(event);
    });

    // Handle errors
    this.bot.on('error', (error: Error) => {
      logger.error({ error: error.message }, 'QQ bot error');
    });

    // Start the bot
    try {
      await this.bot.start();
      this.connected = true;
      logger.info('QQ bot connected via WebSocket');
      console.log('\n  QQ bot connected (WebSocket mode)');
      console.log('  No public URL required for local development\n');
    } catch (error) {
      logger.error({ error }, 'Failed to connect QQ bot');
      throw error;
    }
  }

  private async handleMessage(event: any): Promise<void> {
    const {
      content,
      channel_id,
      guild_id,
      group_openid,
      user_openid,
      author,
      id,
      timestamp,
    } = event;

    let chatJid: string;
    let chatName: string;
    let isGroup: boolean;
    let senderId: string;
    let senderName: string;

    if (group_openid) {
      // Group chat
      chatJid = `qq:group:${group_openid}`;
      chatName = `QQ群:${group_openid}`;
      isGroup = true;
      senderId = author?.member_openid || '';
      senderName = author?.username || 'Unknown';
    } else if (guild_id && channel_id) {
      // Guild channel
      chatJid = `qq:guild:${guild_id}:${channel_id}`;
      chatName = `QQ频道:${channel_id}`;
      isGroup = false;
      senderId = author?.id || '';
      senderName = author?.username || 'Unknown';
    } else if (user_openid) {
      // Private chat (C2C)
      chatJid = `qq:user:${user_openid}`;
      chatName = senderName || 'Private Chat';
      isGroup = false;
      senderId = user_openid;
      senderName = author?.username || 'Unknown';
    } else {
      logger.debug({ event }, 'Unknown QQ message type');
      return;
    }

    // Trigger chat metadata discovery
    this.opts.onChatMetadata(
      chatJid,
      timestamp || new Date().toISOString(),
      chatName,
      'qq',
      isGroup,
    );

    // Only process registered groups
    const group = this.opts.registeredGroups()[chatJid];
    if (!group) {
      logger.debug({ chatJid }, 'QQ chat not registered, skipping');
      return;
    }

    // Check for trigger requirement
    if (group.requiresTrigger) {
      // For QQ, @mentions are handled by the intents
      // GROUP_AT_MESSAGE_CREATE only fires when bot is @mentioned
      // For other message types, we check the trigger pattern
      if (!group_openid && !user_openid) {
        const triggerPattern = new RegExp(
          group.trigger.replace(/\$\{ASSISTANT_NAME\}/g, '\\w+'),
          'i',
        );
        if (!triggerPattern.test(content || '')) {
          logger.debug(
            { chatJid, content },
            'QQ message does not match trigger, skipping',
          );
          return;
        }
      }
    }

    // Build the message object
    const newMessage: NewMessage = {
      id: id || `${Date.now()}`,
      chat_jid: chatJid,
      sender: senderId,
      sender_name: senderName,
      content: content || '',
      timestamp: timestamp || new Date().toISOString(),
    };

    // Deliver the message
    this.opts.onMessage(chatJid, newMessage);
    logger.info({ chatJid, sender: senderName }, 'QQ message received');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) {
      logger.warn('QQ bot not initialized');
      return;
    }

    // Parse JID
    // Format: qq:group:{group_openid} | qq:user:{user_openid} | qq:guild:{guild_id}:{channel_id}
    const [, type, ...rest] = jid.split(':');

    try {
      // QQ has message length limits, split if needed
      const MAX_LENGTH = 2000;
      const messages =
        text.length > MAX_LENGTH ? this.splitMessage(text, MAX_LENGTH) : [text];

      for (const msg of messages) {
        if (type === 'group') {
          const groupOpenid = rest.join(':');
          await this.bot.groupApi.postMessage(groupOpenid, {
            content: msg,
          });
        } else if (type === 'user') {
          const userOpenid = rest.join(':');
          await this.bot.c2cApi.postMessage(userOpenid, {
            content: msg,
          });
        } else if (type === 'guild') {
          const [guildId, channelId] = rest;
          await this.bot.messageService.sendGuildMessage(channelId, msg);
        } else {
          logger.warn({ jid }, 'Unknown QQ JID type');
        }
      }

      logger.info({ jid, length: text.length }, 'QQ message sent');
    } catch (error: any) {
      logger.error(
        { jid, error: error.message || error },
        'Failed to send QQ message',
      );
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxLength) {
      chunks.push(text.slice(i, i + maxLength));
    }
    return chunks;
  }

  isConnected(): boolean {
    return this.connected && this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('qq:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.close();
      this.bot = null;
    }
    this.connected = false;
    logger.info('QQ bot stopped');
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    // QQ doesn't support typing indicator via API
    // This is a no-op
  }
}

// Self-registration
registerChannel('qq', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['QQ_BOT_APP_ID', 'QQ_BOT_APP_SECRET']);
  const appId = process.env.QQ_BOT_APP_ID || envVars.QQ_BOT_APP_ID || '';
  const appSecret =
    process.env.QQ_BOT_APP_SECRET || envVars.QQ_BOT_APP_SECRET || '';
  const sandbox = process.env.QQ_BOT_SANDBOX === 'true';

  if (!appId || !appSecret) {
    logger.warn('QQ: QQ_BOT_APP_ID and/or QQ_BOT_APP_SECRET not set');
    return null;
  }

  return new QQChannel(appId, appSecret, sandbox, opts);
});
