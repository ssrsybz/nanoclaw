# QQ 接入 NanoClaw 渠道对接文档

## 一、概述

QQ 机器人是腾讯官方的机器人开放平台，支持频道、群聊、单聊三大场景。QQ 机器人支持 **WebSocket** 和 **Webhook** 两种连接方式，相比企业微信更易于本地开发。

### 官方资源链接

| 资源 | 链接 |
|------|------|
| **QQ 机器人官网** | https://bot.qq.com/ |
| **QQ 机器人开发者文档** | https://bot.q.qq.com/wiki/ |
| **官方 Node.js SDK** | https://www.npmjs.com/package/qq-official-bot |
| **SDK 文档** | https://zhinjs.github.io/qq-official-bot/ |

### 三种接入方式对比

| 方案 | SDK | 本地运行 | 说明 |
|------|-----|---------|------|
| **WebSocket（推荐）** | `qq-official-bot` | ✅ 可本地运行 | 机器人主动连接 QQ 服务器，无需公网 IP |
| **Webhook** | `qq-official-bot` | ⚠️ 需要公网 URL | QQ 服务器推送事件到回调地址 |
| **第三方适配器** | `@onebots/adapter-qq` | ✅ 可本地运行 | 支持 OneBot V11 协议 |

---

## 二、官方 QQ 机器人接入

### 2.1 创建 QQ 机器人应用

#### 步骤 1：注册开发者账号

1. 访问 [QQ 开放平台](https://bot.qq.com/)
2. 点击「立即注册」
3. 选择 **个人** 或 **企业** 主体
4. 填写邮箱、激活账号、绑定管理员

> 注意：企业主体入驻需要工商信息审核，个人主体可直接入驻。

#### 步骤 2：创建机器人

1. 登录后进入应用管理页
2. 点击「创建机器人」
3. 填写机器人资料（名称、描述、图标）
4. 获取 `AppID` 和 `AppSecret`

#### 步骤 3：获取凭证

```
AppID: 1234567890
AppSecret: xxxxxxxxxxxxxxxxxxxxxxxx
```

```
环境变量配置：
QQ_BOT_APP_ID=1234567890
QQ_BOT_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

### 2.2 安装官方 SDK

```bash
npm install qq-official-bot
# 或
pnpm add qq-official-bot
```

### 2.3 WebSocket 连接模式（推荐本地开发）

```typescript
// src/channels/qq.ts
import { Bot, ReceiverMode } from 'qq-official-bot';

export class QQChannel implements Channel {
  name = 'qq';

  private bot: Bot;
  private opts: QQChannelOpts;

  constructor(opts: QQChannelOpts) {
    this.opts = opts;
    this.bot = new Bot({
      appid: process.env.QQ_BOT_APP_ID!,
      secret: process.env.QQ_BOT_APP_SECRET!,
      sandbox: process.env.NODE_ENV !== 'production',
      removeAt: true,
      intents: [
        'GUILD_MESSAGES',
        'GUILD_MESSAGE_REACTIONS',
        'DIRECT_MESSAGE',
        'GROUP_AT_MESSAGE_CREATE',
        'C2C_MESSAGE_CREATE',
      ],
      mode: ReceiverMode.WEBSOCKET,
    });

    this.bot.on('message', async (event) => {
      const { content, channel_id, guild_id, group_openid, user_openid } = event;

      let chatJid: string;
      let chatName: string;
      let isGroup: boolean;
      let senderId: string;
      let senderName: string;

      if (group_openid) {
        chatJid = `qq:group:${group_openid}`;
        isGroup = true;
        senderId = event.author?.member_openid || '';
        senderName = event.author?.username || 'Unknown';
        chatName = `QQ群:${group_openid}`;
      } else if (guild_id && channel_id) {
        chatJid = `qq:guild:${guild_id}:${channel_id}`;
        isGroup = false;
        senderId = event.author?.id || '';
        senderName = event.author?.username || 'Unknown';
        chatName = `QQ频道:${channel_id}`;
      } else if (user_openid) {
        chatJid = `qq:user:${user_openid}`;
        isGroup = false;
        senderId = user_openid;
        senderName = event.author?.username || 'Unknown';
        chatName = senderName;
      } else {
        return;
      }

      this.opts.onChatMetadata(chatJid, event.timestamp || new Date().toISOString(), chatName, 'qq', isGroup);

      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      this.opts.onMessage(chatJid, {
        id: event.id,
        chat_jid: chatJid,
        sender: senderId,
        sender_name: senderName,
        content: content || '',
        timestamp: event.timestamp || new Date().toISOString(),
        msg_seq: (event as any).seq,
      });
    });

    this.bot.on('error', (error) => {
      console.error('QQ Bot error:', error);
    });
  }

  async connect(): Promise<void> {
    await this.bot.start();
    console.log('QQ Bot started');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const [, type, ...rest] = jid.split(':');

    if (type === 'group') {
      const groupOpenid = rest.join(':');
      await this.bot.groupApi.postMessage(groupOpenid, {
        content: text,
      });
    } else if (type === 'user') {
      const userOpenid = rest.join(':');
      await this.bot.c2cApi.postMessage(userOpenid, {
        content: text,
      });
    } else if (type === 'guild') {
      const [guildId, channelId] = rest;
      await this.bot.messageService.sendGuildMessage(channelId, text);
    }
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('qq:');
  }

  async disconnect(): Promise<void> {
    this.bot.close();
  }
}

registerChannel('qq', (opts) => new QQChannel(opts));
```

### 2.4 Webhook 连接模式

Webhook 模式需要公网可访问的回调地址：

```typescript
import { Bot, ReceiverMode } from 'qq-official-bot';

const bot = new Bot({
  appid: process.env.QQ_BOT_APP_ID!,
  secret: process.env.QQ_BOT_APP_SECRET!,
  sandbox: false,
  intents: ['GUILD_MESSAGES', 'DIRECT_MESSAGE', 'GROUP_AT_MESSAGE_CREATE', 'C2C_MESSAGE_CREATE'],
  mode: ReceiverMode.WEBHOOK,
  port: 3000,
  path: '/webhook',
});

bot.on('message', async (event) => {
  await event.reply(`你发送了: ${event.content}`);
});

bot.start();
```

> ⚠️ Webhook 要求：
> - 必须使用 HTTPS
> - 端口必须为 443 或其他标准 HTTPS 端口
> - 本地开发需要内网穿透（如 ngrok）

### 2.5 中间件模式（集成到现有 Express/Koa）

```typescript
import { Bot, ReceiverMode, ApplicationPlatform } from 'qq-official-bot';
import express from 'express';

const bot = new Bot({
  appid: process.env.QQ_BOT_APP_ID!,
  secret: process.env.QQ_BOT_APP_SECRET!,
  sandbox: false,
  intents: ['GUILD_MESSAGES', 'DIRECT_MESSAGE'],
  mode: ReceiverMode.MIDDLEWARE,
  application: ApplicationPlatform.EXPRESS,
});

const app = express();
app.use('/bot', bot.middleware());

bot.on('message', async (event) => {
  await event.reply(`收到消息: ${event.content}`);
});

app.listen(3000, () => {
  console.log('服务器启动在端口 3000');
  bot.start();
});
```

---

## 三、NanoClaw QQ 渠道实现要点

### 3.1 JID 格式设计

| QQ 场景 | JID 格式 | 示例 |
|---------|----------|------|
| 群聊 | `qq:group:{group_openid}` | `qq:group:C9F778FE6ADF9D1D1DBE395BF744A33A` |
| 单聊 | `qq:user:{user_openid}` | `qq:user:E4F4AEA33253A2797FB897C50B81D7ED` |
| 频道 | `qq:guild:{guild_id}:{channel_id}` | `qq:guild:18700000000001:100010` |
| 频道私信 | `qq:direct:{guild_id}:{channel_id}` | `qq:direct:18700000000001:100010` |

### 3.2 环境变量配置

```bash
# .env 文件

# QQ 机器人凭证（必填）
QQ_BOT_APP_ID=1234567890
QQ_BOT_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxx

# 可选：沙箱环境（开发环境设为 true）
QQ_BOT_SANDBOX=false

# Webhook 模式需要（本地开发用 ngrok）
# QQ_BOT_WEBHOOK_URL=https://abc123.ngrok.io
```

### 3.3 Intents 配置说明

| Intent | 说明 | 使用场景 |
|--------|------|----------|
| `GUILDS` | 频道变更事件 | 监听频道创建/删除 |
| `GUILD_MEMBERS` | 频道成员变更 | 监听成员加入/离开 |
| `GUILD_MESSAGES` | 频道消息（私域） | 接收频道消息 |
| `PUBLIC_GUILD_MESSAGES` | 频道消息（公域） | 接收公域频道消息 |
| `GUILD_MESSAGE_REACTIONS` | 频道消息表态 | 监听表情反应 |
| `DIRECT_MESSAGE` | 频道私信 | 接收频道私信 |
| `GROUP_AT_MESSAGE_CREATE` | 群聊@消息 | 接收群聊@消息 |
| `C2C_MESSAGE_CREATE` | 单聊消息 | 接收私聊消息 |
| `MESSAGE_AUDIT` | 消息审核事件 | 审核结果回调 |
| `INTERACTION` | 互动事件 | 按钮/菜单交互 |

### 3.4 消息类型解析

| msg_type | content 格式 | 解析方式 |
|----------|-------------|----------|
| 0 | 文本内容 | 直接使用 `content` 字段 |
| 2 | Markdown | 使用 `markdown` 对象 |
| 3 | Ark 消息 | 使用 `ark` 对象 |
| 4 | Embed 消息 | 使用 `embed` 对象 |
| 7 | 富媒体 | 使用 `media` 对象，配合 `file_info` |

### 3.5 消息发送限制

| 场景 | 主动消息限制 | 被动回复限制 |
|------|-------------|-------------|
| **单聊** | 每月 4 条/用户 | 60 分钟内可回复 5 次 |
| **群聊** | 每月 4 条/群 | 5 分钟内可回复 5 次 |
| **文字子频道** | 每天 20 条/子频道，每天 2 个子频道 | 5 分钟内可回复 |
| **频道私信** | 每天 2 条/用户，每天累计 200 条 | 5 分钟内可回复 |

---

## 四、第三方适配器方案

### 4.1 @onebots/adapter-qq

支持 OneBot V11 协议，适合已有 OneBot 生态的开发者：

```bash
npm install @onebots/adapter-qq
```

```typescript
// 配置示例
qq.my_bot:
  appId: 'your_app_id'
  secret: 'your_app_secret'
  mode: 'websocket'  # 或 'webhook'
  intents:
    - 'GROUP_AT_MESSAGE_CREATE'
    - 'C2C_MESSAGE_CREATE'
    - 'DIRECT_MESSAGE'
    - 'GUILDS'
```

### 4.2 @karinjs/adapter-qqbot

功能丰富的 QQ 适配器：

```bash
pnpm add @karinjs/adapter-qqbot
```

Webhook 配置示例：
```json
{
  "appId": "你的AppID",
  "secret": "你的Secret",
  "event": { "type": 1 }
}
```

> Webhook 回调地址要求：HTTPS + 443 端口

---

## 五、与飞书/企业微信对比

| 对比维度 | QQ 机器人 | 企业微信 | 飞书 |
|----------|----------|---------|------|
| **连接方式** | WebSocket / Webhook | HTTP 回调 | WebSocket |
| **本地运行** | ✅ WebSocket 可本地 | ❌ 需要公网 URL | ✅ 可本地 |
| **SDK 支持** | 官方 + 第三方 | 官方多种语言 | 官方 Node.js SDK |
| **消息格式** | JSON | XML | JSON |
| **消息长度** | 较长 | 文本限制严格 | 40000 字符 |
| **主动消息** | 每月 4 条/用户 | 有频率限制 | 无明确限制 |
| **应用创建** | 需要审核 | 自建应用即可 | 自建应用即可 |
| **认证要求** | 需实名认证 | 企业认证 | 企业/个人 |

---

## 六、方案选择建议

### 6.1 根据使用场景选择

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| **本地开发测试** | QQ WebSocket | 无需公网，直接运行 |
| **已有 OneBot 生态** | @onebots/adapter-qq | 协议兼容 |
| **追求稳定性** | 官方 qq-official-bot | 官方维护 |
| **企业用户为主** | 企业微信 | 官方支持企业场景 |

### 6.2 混合方案建议

```
QQ 机器人（主要渠道）+ 企业微信（企业用户）+ 飞书（飞书用户）
```

### 6.3 本地运行的优势

相比企业微信和微信公众号，**QQ 机器人的 WebSocket 模式更适合 NanoClaw 本地运行**：

- ✅ 无需配置公网回调 URL
- ✅ 无需内网穿透
- ✅ 机器人主动连接，消息实时推送
- ✅ 开发调试方便

---

## 七、后续步骤

完成本文档的准备工作后，可以选择以下方式开始实现：

### QQ 机器人实现：
1. 在 [QQ 开放平台](https://bot.qq.com/) 创建机器人应用
2. `npm install qq-official-bot`
3. 参考本文档 2.3 节实现 `src/channels/qq.ts`
4. 参考 `add-discord/SKILL.md` 创建 `add-qq/SKILL.md`

### 调试建议：
1. 先使用沙箱环境 (`sandbox: true`) 进行测试
2. 配置正确的 Intents 以接收所需事件
3. 使用 `removeAt: true` 自动移除 @机器人 文本
4. 处理重复消息（QQ 可能推送相同 msg_id）

---

## 八、参考资料

| 类型 | 资源 |
|------|------|
| **QQ 机器人官网** | https://bot.qq.com/ |
| **QQ 机器人文档** | https://bot.q.qq.com/wiki/ |
| **官方 SDK npm** | https://www.npmjs.com/package/qq-official-bot |
| **SDK 文档** | https://zhinjs.github.io/qq-official-bot/ |
| **@onebots/adapter-qq** | https://www.npmjs.com/package/@onebots/adapter-qq |
| **@karinjs/adapter-qqbot** | https://www.npmjs.com/package/@karinjs/adapter-qqbot |
| **ngrok 下载** | https://ngrok.com/download |

---

*文档版本：2026-03-31*
*基于 QQ 机器人官方文档和 qq-official-bot SDK 最新资料整理*
