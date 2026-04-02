import { WechatyBuilder, Contact, Message, Room } from 'wechaty';
import { FileBox } from 'file-box';
import path from 'path';
import os from 'os';

import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
  NewMessage,
} from '../types.js';

export interface WechatChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
}

// Session storage path
const WECHATY_SESSION_DIR = path.join(os.homedir(), '.nanoclaw', 'wechaty');

/**
 * WeChat channel implementation using Wechaty.
 * Uses personal WeChat account via web protocol.
 *
 * ⚠️ Warning: Wechaty has account ban risk. Use a test account only.
 */
export class WechatChannel implements Channel {
  name = 'wechat';

  private bot: any = null;
  private opts: WechatChannelOpts;
  private connected = false;

  constructor(opts: WechatChannelOpts) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // Build the Wechaty instance with session persistence
    this.bot = WechatyBuilder.build({
      name: 'nanoclaw-wechat', // Session name for persistence
      puppet: 'wechaty-puppet-wechat4u',
      puppetOptions: {
        // Session data will be stored in ~/.wechaty/nanoclaw-wechat/
      },
    });

    // Handle scan event (QR code for login)
    this.bot.on('scan', (qrcode: string, status: string) => {
      const qrUrl = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
      console.log('\n');
      console.log('='.repeat(60));
      console.log('  Scan QR Code with WeChat to login:');
      console.log(`  ${qrUrl}`);
      console.log('='.repeat(60));
      console.log('\n');
      logger.info({ qrUrl }, 'WeChat QR code generated');
    });

    // Handle login event
    this.bot.on('login', (user: Contact) => {
      this.connected = true;
      const name = user.name();
      console.log(`\n  WeChat bot logged in as: ${name}\n`);
      logger.info({ name }, 'WeChat bot logged in');
    });

    // Handle logout event
    this.bot.on('logout', (user: Contact) => {
      this.connected = false;
      const name = user.name();
      console.log(`\n  WeChat bot logged out: ${name}\n`);
      logger.info({ name }, 'WeChat bot logged out');
    });

    // Handle incoming messages
    this.bot.on('message', async (message: Message) => {
      await this.handleMessage(message);
    });

    // Handle errors
    this.bot.on('error', (error: Error) => {
      logger.error({ error: error.message }, 'WeChat bot error');
    });

    // Start the bot
    try {
      await this.bot.start();
      logger.info('WeChat bot started, waiting for login');
      console.log('\n  WeChat bot starting...');
      console.log('  Waiting for QR code scan to login\n');
    } catch (error) {
      logger.error({ error }, 'Failed to start WeChat bot');
      throw error;
    }
  }

  private async handleMessage(message: Message): Promise<void> {
    // Ignore messages from self
    if (message.self()) {
      return;
    }

    // Get message details
    const talker = message.talker();
    const room = message.room();
    const content = message.text();
    const type = message.type();

    // Skip non-text messages (media, etc.)
    if (type !== Message.Type.Text) {
      logger.debug({ type }, 'WeChat non-text message, skipping');
      return;
    }

    let chatJid: string;
    let chatName: string;
    let isGroup: boolean;
    let senderId: string;
    let senderName: string;

    if (room) {
      // Group chat
      const roomId = room.id;
      chatJid = `wc:room:${roomId}`;
      chatName = (await room.topic()) || `Group ${roomId}`;
      isGroup = true;
      senderId = talker.id;
      senderName = talker.name() || 'Unknown';
    } else {
      // Private chat
      chatJid = `wc:user:${talker.id}`;
      chatName = talker.name() || 'Private Chat';
      isGroup = false;
      senderId = talker.id;
      senderName = talker.name() || 'Unknown';
    }

    // Trigger chat metadata discovery
    this.opts.onChatMetadata(
      chatJid,
      message.date().toISOString(),
      chatName,
      'wechat',
      isGroup,
    );

    // Only process registered groups
    const group = this.opts.registeredGroups()[chatJid];
    if (!group) {
      logger.debug({ chatJid }, 'WeChat chat not registered, skipping');
      return;
    }

    // Check for trigger requirement
    if (group.requiresTrigger) {
      const triggerPattern = new RegExp(
        group.trigger.replace(/\$\{ASSISTANT_NAME\}/g, '\\w+'),
        'i',
      );
      if (!triggerPattern.test(content)) {
        logger.debug(
          { chatJid, content },
          'WeChat message does not match trigger, skipping',
        );
        return;
      }
    }

    // Build the message object
    const newMessage: NewMessage = {
      id: message.id || `${Date.now()}`,
      chat_jid: chatJid,
      sender: senderId,
      sender_name: senderName,
      content,
      timestamp: message.date().toISOString(),
    };

    // Deliver the message
    this.opts.onMessage(chatJid, newMessage);
    logger.info({ chatJid, sender: senderName }, 'WeChat message received');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot || !this.connected) {
      logger.warn('WeChat bot not connected');
      return;
    }

    // Parse JID
    // Format: wc:user:{user_id} | wc:room:{room_id}
    const [, type, ...rest] = jid.split(':');
    const targetId = rest.join(':');

    try {
      // Split long messages (WeChat limit is lower)
      const MAX_LENGTH = 2000;
      const messages =
        text.length > MAX_LENGTH ? this.splitMessage(text, MAX_LENGTH) : [text];

      for (const msg of messages) {
        if (type === 'room') {
          // Group chat
          const room = await this.bot.Room.find({ id: targetId });
          if (room) {
            await room.say(msg);
          } else {
            logger.warn({ targetId }, 'WeChat room not found');
          }
        } else if (type === 'user') {
          // Private chat
          const contact = await this.bot.Contact.find({ id: targetId });
          if (contact) {
            await contact.say(msg);
          } else {
            logger.warn({ targetId }, 'WeChat contact not found');
          }
        } else {
          logger.warn({ jid }, 'Unknown WeChat JID type');
        }
      }

      logger.info({ jid, length: text.length }, 'WeChat message sent');
    } catch (error: any) {
      logger.error(
        { jid, error: error.message || error },
        'Failed to send WeChat message',
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
    return jid.startsWith('wc:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      await this.bot.stop();
      this.bot = null;
    }
    this.connected = false;
    logger.info('WeChat bot stopped');
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    // WeChat doesn't support typing indicator
    // This is a no-op
  }
}

// Self-registration
registerChannel('wechat', (opts: ChannelOpts) => {
  // Wechaty doesn't require environment variables
  // Login is done via QR code scan
  return new WechatChannel(opts);
});
