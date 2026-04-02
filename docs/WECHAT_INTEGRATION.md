# 微信接入 NanoClaw 渠道对接文档

## 一、概述

微信接入是三个国内平台中最复杂的，因为微信官方**不提供个人号机器人 API**。本章档详细分析三种可行的微信接入方案，帮助你根据实际情况选择最适合的方案。

### 三种接入方案对比

| 方案 | 适用场景 | 是否需要公网 | 封号风险 | 开发难度 | 推荐度 |
|------|----------|-------------|----------|----------|--------|
| **企业微信（推荐）** | 企业用户、团队协作 | ✅ 需要回调 URL | ⚠️ 低 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **微信公众号** | 订阅号/服务号 | ✅ 需要回调 URL | ⚠️ 低 | ⭐⭐ | ⭐⭐ |
| **Wechaty 个人微信** | 个人用户、测试 | ❌ 不需要 | 🔴 高 | ⭐⭐⭐⭐ | ⭐⭐ |

---

## 二、企业微信（WeChat Work）接入方案

### 2.1 官方资源链接

| 资源 | 链接 |
|------|------|
| **企业微信开发者中心** | https://developer.work.weixin.qq.com/ |
| **消息推送文档** | https://developer.work.weixin.qq.com/document/path/90244 |
| **接收消息与事件** | https://developer.work.weixin.qq.com/document/path/91778 |
| **回调配置说明** | https://qiyeweixin.apifox.cn/doc-417850 |
| **发送消息 API** | https://qiyeweixin.apifox.cn/api-10061348 |

### 2.2 核心限制与注意事项

| 项目 | 说明 |
|------|------|
| **回调 URL** | 必须为公网可访问的 HTTPS 地址（**本地运行需要内网穿透**） |
| **消息加密** | 企业微信使用 AES 加密传输，需要处理加解密逻辑 |
| **Token 维护** | `access_token` 有效期 2 小时，需要定期刷新 |
| **消息格式** | 使用 XML 格式（非 JSON） |
| **接收消息** | 仅支持自建应用配置接收消息模式 |
| **发送限制** | 有频率限制，避免在整点或半点发送 |

### 2.3 企业微信 vs 飞书

| 对比维度 | 企业微信 | 飞书 |
|----------|---------|------|
| **连接方式** | HTTP 回调（需要公网 URL） | WebSocket 长连接（无需公网） |
| **本地开发** | 需要内网穿透（如 ngrok） | ✅ 直接本地开发 |
| **消息格式** | XML | JSON |
| **加密方式** | AES 加密（需处理加解密） | SDK 内置处理 |
| **SDK 支持** | 官方提供多种语言 SDK | 官方 Node.js SDK |
| **消息长度** | 文本限制较严格 | 40000 字符 |

### 2.4 企业微信应用创建步骤

#### 步骤 1：创建自建应用

1. 登录 [企业微信管理后台](https://work.weixin.qq.com/wework_admin/)
2. 进入 **应用管理** > **自建应用**
3. 点击 **创建应用**
4. 填写应用信息（名称、描述、图标）
5. 设置应用可见范围

#### 步骤 2：获取应用凭证

1. 进入应用详情页
2. 获取以下信息：
   - `AgentId`（应用 ID）
   - `CorpId`（企业 ID）- 在 **我的企业** 页面获取
   - `Secret`（应用密钥）- 在 **应用详情** 页面获取

```
环境变量配置：
WECHAT_WORK_CORP_ID=wwxxxxxxxxxxxxx
WECHAT_WORK_AGENT_ID=1000001
WECHAT_WORK_AGENT_SECRET=xxxxxxxxxxxxxxxxxxxxxx
```

#### 步骤 3：获取 Access Token

企业微信所有 API 调用都需要 `access_token`：

```bash
# 获取 access_token
curl "https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=wwxxxx&corpsecret=xxxx"

# 响应
{
  "errcode": 0,
  "errmsg": "ok",
  "access_token": "xxxxxx",
  "expires_in": 7200
}
```

#### 步骤 4：配置接收消息（回调模式）

1. 进入应用详情页
2. 点击 **接收消息** > **设置 API 接收**
3. 配置以下三项：
   - **URL**：你的回调服务地址（如 `https://yourdomain.com/wechat/callback`）
   - **Token**：自定义Token（用于生成签名验证）
   - **EncodingAESKey**：自定义加密密钥（43位字符）

> **重要**：企业微信要求回调 URL 必须是公网可访问的 HTTPS 地址。本地开发需要使用内网穿透工具（如 ngrok、frp）。

#### 步骤 5：内网穿透配置（本地开发必需）

由于企业微信只能回调公网地址，本地开发需要内网穿透：

**ngrok 方式（推荐用于测试）**：
```bash
# 安装 ngrok
brew install ngrok

# 配置 token（首次需要）
ngrok config add-authtoken YOUR_TOKEN

# 启动隧道到本地 3000 端口
ngrok http 3000

# 输出示例：
# Forwarding  https://abc123.ngrok.io -> http://localhost:3000
```

**配置企业微信回调 URL**：
将 `https://abc123.ngrok.io/wechat/callback` 配置为企业微信的回调地址。

---

## 三、微信公众号接入方案

### 3.1 官方资源链接

| 资源 | 链接 |
|------|------|
| **微信公众平台** | https://mp.weixin.qq.com/ |
| **开发者文档** | https://developers.weixin.qq.com/doc/offiaccount/Getting_Started/Overview.html |
| **接收消息文档** | https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Passive_user/Message_interface_instructions.html |

### 3.2 核心限制

| 项目 | 说明 |
|------|------|
| **被动回复** | 只能被动回复用户消息，且需在 5 秒内响应 |
| **48 小时限制** | 只有用户 48 小时内与公众号交互，才能主动发送消息 |
| **消息格式** | XML |
| **认证要求** | 需要微信认证（300元/年） |
| **适用场景** | 客服咨询、消息推送，不适合实时对话 |

### 3.3 消息接收机制

用户发送消息 → 微信服务器 POST 到配置的 URL → 返回 XML 响应

```xml
<!-- 文本消息示例 -->
<xml>
  <ToUserName><![CDATA[toUser]]></ToUserName>
  <FromUserName><![CDATA[fromUser]]></FromUserName>
  <CreateTime>1348831860</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[this is a test]]></Content>
  <MsgId>1234567890123456</MsgId>
</xml>
```

### 3.4 被动回复消息格式

```xml
<xml>
  <ToUserName><![CDATA[用户OpenID]]></ToUserName>
  <FromUserName><![CDATA[公众号ID]]></FromUserName>
  <CreateTime>12345678</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[回复内容]]></Content>
</xml>
```

---

## 四、Wechaty 个人微信接入方案

### 4.1 官方资源链接

| 资源 | 链接 |
|------|------|
| **Wechaty 官网** | https://wechaty.js.org/ |
| **Wechaty GitHub** | https://github.com/wechaty/wechaty |
| **Wechaty npm** | https://www.npmjs.com/package/wechaty |
| **Puppet 驱动** | https://www.npmjs.com/package/wechaty-puppet-wechat4u |

### 4.2 核心警告

> ⚠️ **封号风险警示**
>
> Wechaty 基于微信网页版协议，微信官方可能检测到异常行为并封号。
> - 个人测试号风险较低
> - 商业使用风险极高
> - 建议使用小号/专门账号进行测试
> - 避免高频发送消息、使用敏感词汇

### 4.3 与企业微信对比

| 对比维度 | Wechaty 个人微信 | 企业微信 |
|----------|-----------------|----------|
| **无需企业** | ✅ 不需要 | ❌ 需要企业 |
| **无需公网 URL** | ✅ 扫码登录即可 | ❌ 需要公网回调 |
| **封号风险** | 🔴 高 | ⚠️ 低 |
| **消息类型** | 全面 | 受限 |
| **稳定性** | 不稳定（协议可能失效） | 稳定 |
| **适合场景** | 个人助手、测试 | 企业应用 |

### 4.4 Wechaty 接入示例

```bash
# 安装 Wechaty 和 Puppet 驱动
npm install wechaty wechaty-puppet-wechat4u
```

```typescript
// src/channels/wechat.ts
import { Wechaty, Contact, Message } from 'wechaty';

export class WechatChannel implements Channel {
  name = 'wechat';

  private bot: Wechaty;
  private opts: WechatChannelOpts;

  constructor(opts: WechatChannelOpts) {
    this.opts = opts;
    this.bot = WechatyBuilder.build({
      puppet: 'wechaty-puppet-wechat4u',
    });

    this.bot.on('message', async (message: Message) => {
      // 忽略来自机器人的消息
      if (message.self()) return;

      const talker = message.talker();
      const content = message.text();
      const room = message.room();

      let chatJid: string;
      let chatName: string;
      let isGroup: boolean;

      if (room) {
        // 群消息
        chatJid = `wc:room:${await room.id}`;
        chatName = await room.topic();
        isGroup = true;
      } else {
        // 私聊消息
        chatJid = `wc:user:${talker.id}`;
        chatName = talker.name();
        isGroup = false;
      }

      // 触发聊天元数据发现
      this.opts.onChatMetadata(chatJid, new Date().toISOString(), chatName, 'wechat', isGroup);

      // 仅对注册群组处理
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      // 交付消息
      this.opts.onMessage(chatJid, {
        id: message.id,
        chat_jid: chatJid,
        sender: talker.id,
        sender_name: talker.name(),
        content,
        timestamp: message.date().toISOString(),
        is_from_me: false,
      });
    });
  }

  async connect(): Promise<void> {
    await this.bot.start();
    console.log('Wechaty bot started, scan QR code to login');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const roomOrUserId = jid.replace(/^wc:(room|user):/, '');
    if (jid.startsWith('wc:room:')) {
      const room = await this.bot.Room.find({ id: roomOrUserId });
      if (room) await room.say(text);
    } else {
      const contact = await this.bot.Contact.find({ id: roomOrUserId });
      if (contact) await contact.say(text);
    }
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('wc:');
  }

  async disconnect(): Promise<void> {
    await this.bot.stop();
  }
}

registerChannel('wechat', (opts) => {
  // Wechaty 不需要环境变量配置，扫码登录
  return new WechatChannel(opts);
});
```

### 4.5 Wechaty 与 NanoClaw 的集成挑战

| 挑战 | 说明 | 解决方案 |
|------|------|----------|
| **扫码登录** | 需要手动扫码，无法自动化 | 首次登录后使用 `MemoryCard` 持久化会话 |
| **协议不稳定** | 微信可能更新协议导致失效 | 使用稳定版本的 Puppet 驱动 |
| **消息延迟** | 网页版协议可能有时延 | 接受合理延迟 |
| **并发限制** | 同时只能一个实例运行 | 单一实例设计 |

---

## 五、NanoClaw 企业微信渠道实现要点

### 5.1 JID 格式设计

| 企业微信场景 | JID 格式 | 示例 |
|--------------|----------|------|
| 用户 ID | `wx:user:{userid}` | `wx:user:zhangsan` |
| 群组 ID | `wx:group:{chatid}` | `wx:group:2xxxxxxxxxx` |

### 5.2 环境变量配置

```bash
# .env 文件

# 企业微信应用凭证（必填）
WECHAT_WORK_CORP_ID=wwxxxxxxxxxxxxx
WECHAT_WORK_AGENT_ID=1000001
WECHAT_WORK_AGENT_SECRET=xxxxxxxxxxxxxxxxxxxxxx

# 回调验证配置（必填）
WECHAT_WORK_CALLBACK_TOKEN=your_token
WECHAT_WORK_CALLBACK_AES_KEY=your_aes_key_43_characters

# 可选：内网穿透 URL（本地开发用）
# WECHAT_WORK_CALLBACK_URL=https://abc123.ngrok.io
```

### 5.3 核心接口实现

```typescript
// src/channels/wechat-work.ts

export class WechatWorkChannel implements Channel {
  name = 'wechat-work';

  private accessToken: string | null = null;
  private tokenExpireTime: number = 0;

  async connect(): Promise<void> {
    // 企业微信不需要主动连接，只需确保能接收回调
    // 启动一个 HTTP 服务器监听回调
    await this.startCallbackServer();
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const { userid, isRoom } = this.parseJid(jid);
    await this.ensureValidToken();

    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${this.accessToken}`;

    const data: any = {
      touser: isRoom ? undefined : userid,
      toparty: isRoom ? userid : undefined,
      msgtype: 'text',
      agentid: process.env.WECHAT_WORK_AGENT_ID,
      text: { content: text },
    };

    if (isRoom) {
      data.chatid = userid;
      delete data.touser;
      delete data.toparty;
    }

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async ensureValidToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpireTime) return;

    const resp = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${process.env.WECHAT_WORK_CORP_ID}&corpsecret=${process.env.WECHAT_WORK_AGENT_SECRET}`
    );
    const data = await resp.json();
    this.accessToken = data.access_token;
    this.tokenExpireTime = Date.now() + (data.expires_in - 200) * 1000;
  }

  parseJid(jid: string): { userid: string; isRoom: boolean } {
    const [, type, id] = jid.split(':');
    return { userid: id, isRoom: type === 'group' };
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('wx:');
  }
}

// 消息解密示例（需要官方加解密库）
async handleCallback(req: Request): Promise<void> {
  const { msg_signature, timestamp, nonce, echostr, encrypt_type } = req.params;

  if (echostr) {
    // URL 验证请求
    const decrypted = this.decryptEcho(echostr, msg_signature, timestamp, nonce);
    return decrypted; // 返回解密后的内容
  }

  // 处理消息事件
  const body = await req.text();
  const decryptedMsg = this.decryptMessage(body, msg_signature, timestamp, nonce);
  const msg = this.parseXml(decryptedMsg);

  const chatJid = msg.ChatType === 'single'
    ? `wx:user:${msg.FromUserName}`
    : `wx:group:${msg.ToUserName}`;

  this.opts.onChatMetadata(chatJid, new Date().to(msg.CreateTime * 1000).toISOString());

  const group = this.opts.registeredGroups()[chatJid];
  if (!group) return;

  this.opts.onMessage(chatJid, {
    id: msg.MsgId,
    chat_jid: chatJid,
    sender: msg.FromUserName,
    content: msg.Content || '',
    timestamp: new Date(msg.CreateTime * 1000).toISOString(),
  });
}
```

### 5.4 消息类型解析

| MsgType | content 格式 | 解析方式 |
|---------|--------------|----------|
| `text` | 文本内容 | 直接使用 `Content` 字段 |
| `image` | `{"picurl":"..."}` | 下载媒体获取图片 |
| `voice` | `{"mediaid":"..."}` | 下载媒体获取语音 |
| `video` | `{"thumbmediaid":"..."}` | 下载媒体获取视频 |
| `location` | `{"x":...,"y":...,"scale":...,"label":"..."}` | 解析 JSON |
| `link` | `{"title":"...","url":"...","description":"..."}` | 解析 JSON |

---

## 六、方案选择建议

### 6.1 根据使用场景选择

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| **企业内部协作助手** | 企业微信 | 官方支持，稳定可靠 |
| **已有飞书/钉钉生态** | 飞书 | 与现有工具统一 |
| **个人日常使用** | Wechaty（风险自担） | 无企业微信只能选此 |
| **公众号运营者** | 微信公众号 | 与现有公众号集成 |
| **追求稳定性** | 企业微信 | 官方 API，稳定性高 |

### 6.2 本地运行的挑战

NanoClaw 设计为本地运行的个人助手，主要挑战是：

| 方案 | 挑战 | 解决思路 |
|------|------|----------|
| **企业微信** | 需要公网回调 URL | 使用 ngrok 等内网穿透 |
| **微信公众号** | 需要公网回调 URL | 使用 ngrok 等内网穿透 |
| **Wechaty** | 无官方方案 | ✅ 直接本地运行 |

### 6.3 混合方案建议

考虑同时接入多个渠道，实现冗余备份：

```
飞书（主要渠道） + 企业微信（企业用户）+ Wechaty（个人用户）
```

这种设计可以：
- 覆盖企业用户（飞书/企业微信）和个人用户（Wechaty）
- 飞书作为主要渠道（稳定、无需穿透）
- 企业微信作为企业用户的备用方案
- Wechaty 作为个人用户的应急方案

---

## 七、后续步骤

完成本文档的准备工作后，可以选择以下方式开始实现：

### 企业微信实现：
1. 申请企业微信管理员权限
2. 创建自建应用并获取凭证
3. 配置 ngrok 内网穿透
4. 参考 `add-discord/SKILL.md` 创建 `add-wechat-work/SKILL.md`
5. 实现 `src/channels/wechat-work.ts`

### Wechaty 实现：
1. `npm install wechaty wechaty-puppet-wechat4u`
2. 参考本文档 4.4 节实现 `src/channels/wechat.ts`
3. 注意处理扫码登录和会话持久化

---

## 八、参考资料

| 类型 | 资源 |
|------|------|
| **企业微信开发者中心** | https://developer.work.weixin.qq.com/ |
| **企业微信消息推送** | https://developer.work.weixin.qq.com/document/path/90244 |
| **微信公众平台** | https://mp.weixin.qq.com/ |
| **Wechaty 官网** | https://wechaty.js.org/ |
| **Wechaty GitHub** | https://github.com/wechaty/wechaty |
| **ngrok 下载** | https://ngrok.com/download |

---

*文档版本：2026-03-31*
*基于企业微信、微信公众号、Wechaty 最新资料整理*
