import * as Lark from '@larksuiteoapi/node-sdk';

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

export interface FeishuChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

/**
 * Feishu (Lark) channel implementation using WebSocket long polling.
 * No public URL required - ideal for local development.
 */
export class FeishuChannel implements Channel {
  name = 'feishu';

  private client: Lark.Client | null = null;
  private wsClient: Lark.WSClient | null = null;
  private opts: FeishuChannelOpts;
  private appId: string;
  private appSecret: string;
  private connected = false;

  constructor(appId: string, appSecret: string, opts: FeishuChannelOpts) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // Create the main API client
    this.client = new Lark.Client({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: Lark.LoggerLevel.info,
    });

    // Create WebSocket client for event subscription
    this.wsClient = new Lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: Lark.LoggerLevel.info,
    });

    // Create event dispatcher
    const eventDispatcher = new Lark.EventDispatcher({});

    // Register message receive event handler
    eventDispatcher.register({
      'im.message.receive_v1': async (data: any) => {
        await this.handleMessage(data);
      },
    });

    // Start WebSocket connection
    try {
      await this.wsClient.start({ eventDispatcher });
      this.connected = true;
      logger.info('Feishu bot connected via WebSocket');
      console.log('\n  Feishu bot connected (WebSocket long polling)');
      console.log('  No public URL required for local development\n');
    } catch (error) {
      logger.error({ error }, 'Failed to connect Feishu WebSocket');
      throw error;
    }
  }

  private async handleMessage(event: any): Promise<void> {
    // Log full event for debugging
    logger.info({ event }, 'Feishu received event');

    // SDK v2 event format: the message is at event.message
    // and sender info is at event.sender
    const message = event.message;
    const sender = event.sender;

    if (!message) {
      logger.warn('Feishu event has no message field');
      return;
    }

    // Ignore messages from bots (including self)
    if (sender?.sender_type === 'app') {
      logger.debug('Ignoring bot message');
      return;
    }

    const chatType = message.chat_type;
    let chatJid: string;
    let chatName: string;
    let isGroup: boolean;
    let senderId: string;
    let senderName: string;

    if (chatType === 'p2p') {
      // Private chat - sender is the other user
      chatJid = `fs:p2p:${message.chat_id}`;
      chatName = 'Private Chat';
      isGroup = false;
      senderId = sender?.sender_id?.open_id || '';
      senderName = 'User';
    } else if (chatType === 'group') {
      // Group chat
      chatJid = `fs:group:${message.chat_id}`;
      chatName = `Group ${message.chat_id}`;
      isGroup = true;
      senderId = sender?.sender_id?.open_id || '';
      senderName = 'User';
    } else {
      logger.debug({ chatType }, 'Unknown Feishu chat type');
      return;
    }

    // Trigger chat metadata discovery
    this.opts.onChatMetadata(
      chatJid,
      message.create_time || new Date().toISOString(),
      chatName,
      'feishu',
      isGroup,
    );

    // Only process registered groups
    const group = this.opts.registeredGroups()[chatJid];
    if (!group) {
      logger.info({ chatJid }, 'Feishu chat not registered, skipping');
      return;
    }

    // Parse message content
    const content = this.parseContent(message);

    // Check for trigger requirement
    if (group.requiresTrigger) {
      const triggerPattern = new RegExp(
        group.trigger.replace(/\$\{ASSISTANT_NAME\}/g, '\\w+'),
        'i',
      );
      if (!triggerPattern.test(content)) {
        logger.debug(
          { chatJid, content },
          'Feishu message does not match trigger, skipping',
        );
        return;
      }
    }

    // Build the message object
    const newMessage: NewMessage = {
      id: message.message_id,
      chat_jid: chatJid,
      sender: senderId,
      sender_name: senderName,
      content,
      timestamp: new Date(message.create_time || Date.now()).toISOString(),
    };

    // Deliver the message
    this.opts.onMessage(chatJid, newMessage);
    logger.info({ chatJid, sender: senderName }, 'Feishu message received');
  }

  private parseContent(message: any): string {
    const msgType = message.message_type;
    const rawContent = message.content || '';

    switch (msgType) {
      case 'text': {
        try {
          const parsed = JSON.parse(rawContent);
          return parsed.text || rawContent;
        } catch {
          return rawContent;
        }
      }

      case 'post': {
        // Rich text message
        try {
          const post = JSON.parse(rawContent);
          const zhContent = post?.post?.zh_cn?.content;
          if (!zhContent) return '[Rich Text]';

          return zhContent
            .map((paragraph: any[]) =>
              paragraph.map((elem: any) => elem.text || '').join(''),
            )
            .join('\n');
        } catch {
          return '[Rich Text]';
        }
      }

      case 'image':
        return '[Image]';

      case 'file': {
        try {
          const file = JSON.parse(rawContent);
          return `[File: ${file.file_name || 'attachment'}]`;
        } catch {
          return '[File]';
        }
      }

      case 'audio':
        return '[Audio]';

      case 'video':
        return '[Video]';

      case 'sticker':
        return '[Sticker]';

      case 'share_card': {
        try {
          const card = JSON.parse(rawContent);
          return `[Share: ${card.title || 'card'}]`;
        } catch {
          return '[Share Card]';
        }
      }

      case 'interactive':
        return '[Interactive Card]';

      default:
        return rawContent || `[${msgType}]`;
    }
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.client) {
      logger.warn('Feishu client not initialized');
      return;
    }

    // Parse JID to get chat_id
    // Format: fs:p2p:{open_id} or fs:group:{chat_id}
    const [, type, ...rest] = jid.split(':');
    const targetId = rest.join(':');

    if (!targetId) {
      logger.warn({ jid }, 'Invalid Feishu JID format');
      return;
    }

    try {
      // For Feishu, we need to use the actual chat_id for sending
      // For p2p chats, we may need to get the chat_id first
      let receiveId = targetId;
      let receiveIdType = 'chat_id';

      if (type === 'p2p') {
        // For p2p, targetId is open_id, we need to use open_id type
        receiveIdType = 'open_id';
      }

      // Split long messages (Feishu limit: 40000 chars for text)
      const MAX_LENGTH = 40000;
      const messages =
        text.length > MAX_LENGTH ? this.splitMessage(text, MAX_LENGTH) : [text];

      for (const msg of messages) {
        await this.client.im.v1.message.create({
          params: {
            receive_id_type: receiveIdType as 'chat_id' | 'open_id',
          },
          data: {
            receive_id: receiveId,
            msg_type: 'text',
            content: JSON.stringify({ text: msg }),
          },
        });
      }

      logger.info({ jid, length: text.length }, 'Feishu message sent');
    } catch (error: any) {
      logger.error(
        { jid, error: error.message || error },
        'Failed to send Feishu message',
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
    return this.connected && this.wsClient !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('fs:');
  }

  async disconnect(): Promise<void> {
    if (this.wsClient) {
      // WSClient doesn't have a close method in the current API
      // The connection will be closed when the process exits
      this.wsClient = null;
    }
    this.client = null;
    this.connected = false;
    logger.info('Feishu bot stopped');
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    // Feishu doesn't support typing indicator via API
    // This is a no-op
  }
}

// Self-registration
registerChannel('feishu', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['FEISHU_APP_ID', 'FEISHU_APP_SECRET']);
  const appId = process.env.FEISHU_APP_ID || envVars.FEISHU_APP_ID || '';
  const appSecret =
    process.env.FEISHU_APP_SECRET || envVars.FEISHU_APP_SECRET || '';

  if (!appId || !appSecret) {
    logger.warn('Feishu: FEISHU_APP_ID and/or FEISHU_APP_SECRET not set');
    return null;
  }

  return new FeishuChannel(appId, appSecret, opts);
});
