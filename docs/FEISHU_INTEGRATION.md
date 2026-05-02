# 飞书（Feishu）接入 OKClaw 渠道对接文档

## 一、概述

本文档描述如何将飞书（Feishu）机器人接入 OKClaw，实现与其他渠道（Discord、WhatsApp、Telegram 等）一致的自注册体验。

OKClaw 的渠道系统采用**工厂注册模式**，每个渠道通过 `registerChannel()` 在模块加载时自注册。飞书渠道的实现完全遵循这一模式，核心代码位于 `src/channels/feishu.ts`。

---

## 二、飞书开放平台核心资料

### 2.1 官方资源链接

| 资源 | 链接 |
|------|------|
| **飞书开放平台首页** | https://open.feishu.cn |
| **开发者后台** | https://open.feishu.cn/document/client-docs/intro |
| **机器人概述** | https://open.feishu.cn/document/client-docs/bot-v3/bot-overview |
| **消息发送 API** | https://open.feishu.cn/document/server-docs/im-v1/message/create |
| **接收消息事件** | https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure- |
| **长连接事件订阅** | https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case |
| **Node.js SDK 文档** | https://github.com/larksuite/node-sdk/blob/main/README.zh.md |
| **MCP 智能助手开发教程** | https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/mcp_integration/develop-mcp-intelligent-assistant-bot |

### 2.2 核心能力

飞书机器人具备以下与 OKClaw 相关的核心能力：

| 能力 | 说明 |
|------|------|
| **消息收发** | 支持文本、富文本、图片、卡片、视频、音频、文件、表情等 |
| **事件订阅** | 支持 WebSocket 长连接（**无需公网 IP**）和 Webhook 回调两种模式 |
| **单聊** | 机器人与用户一对一对话 |
| **群聊** | 机器人被 @ 时响应，或接收群内所有消息（需权限） |
| **消息卡片** | 支持交互式卡片消息 |
| **@提及** | 支持在消息中 @ 指定用户或所有人 |

---

## 三、接入方案对比

### 3.1 两种事件订阅方式

飞书支持两种事件订阅方式，对 OKClaw 本地运行场景有重要影响：

| 方式 | 说明 | 是否需要公网 IP/域名 | 适用场景 |
|------|------|----------------------|----------|
| **长连接模式（推荐）** | SDK 通过 WebSocket 与飞书服务器保持连接，事件通过该连接推送 | ❌ 不需要 | 本地开发测试、生产环境 |
| **Webhook 模式** | 飞书将事件 POST 到指定的公网 URL | ✅ 需要 | 已部署到云服务器 |

**OKClaw 强烈推荐使用长连接模式**，因为：
- OKClaw 设计为本地运行的个人助手
- 无需配置内网穿透（ngrok 等）
- 开发周期从 1 周缩短到 5 分钟
- 加密传输，无需额外处理加解密逻辑

### 3.2 飞书与 Discord 的功能对比

| 功能 | Discord | 飞书 |
|------|---------|------|
| 连接方式 | WebSocket（discord.js） | WebSocket 长连接（`@larksuiteoapi/node-sdk`） |
| 消息长度限制 | 2000 字符 | 40000 字符（文本） |
| @机器人检测 | `message.mentions.users.has(botId)` | 事件体直接提供 `mentions` 字段 |
| 消息格式 | Markdown | Markdown / 富文本 / 卡片 |
| 回复上下文 | `message.reference` | 事件体包含 `root_id`、`parent_id` |
| 附件处理 | `message.attachments` | 需要调用 `im.v1.file.get` 获取 |

---

## 四、飞书应用创建步骤

### 4.1 创建企业自建应用

1. 登录 [飞书开发者后台](https://open.feishu.cn)
2. 点击 **创建企业自建应用**
3. 填写应用名称（如 "OKClaw Assistant"）、描述和图标
4. 点击 **创建**

### 4.2 获取应用凭证

1. 进入应用详情页
2. 在 **凭证与基础信息** > **应用凭证** 下获取：
   - `App ID`（格式：`cli_xxx`）
   - `App Secret`

这两个值将作为 OKClaw 的环境变量：
```bash
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
```

### 4.3 添加机器人能力

1. 进入 **应用能力** > **添加应用能力**
2. 选择 **机器人** 并添加

### 4.4 申请权限

进入 **开发配置** > **权限管理**，开通以下权限：

| 权限 | 权限码 | 说明 |
|------|--------|------|
| **获取用户发给机器人的单聊消息** | `im:message.p2p_msg:readonly` | 接收单聊消息 |
| **获取用户在群组中@机器人的消息** | `im:message.group_at_msg:readonly` | 接收群聊 @ 机器人消息 |
| **获取群组中所有消息** | `im:message.group_msg`（敏感权限） | 接收群内所有消息（可选） |
| **以应用身份发消息** | `im:message:send_as_bot` | 发送消息 |
| **获取用户 ID** | `contact:user.id:readonly` | 获取用户身份 |

批量导入权限 JSON：
```json
{
  "scopes": {
    "tenant": [
      "im:message:send_as_bot",
      "im:message:readonly",
      "contact:user.id:readonly",
      "im:message.group_at_msg:readonly",
      "im:message.p2p_msg:readonly"
    ]
  }
}
```

### 4.5 配置事件订阅（长连接模式）

1. 进入 **事件与回调** > **事件配置**
2. 选择订阅方式为 **使用长连接接收事件**
3. 添加事件：**接收消息**（`im.message.receive_v1`）

> **注意**：必须先启动本地 OKClaw 服务（建立长连接），才能保存配置成功。

### 4.6 发布应用

1. 进入 **版本管理与发布**
2. 创建版本并发布
3. 如果企业设置了发布审核，需等待管理员审核通过

---

## 五、OKClaw 飞书渠道实现要点

### 5.1 架构设计

飞书渠道实现遵循 OKClaw 的标准 Channel 接口：

```
src/channels/feishu.ts  →  registerChannel('feishu', factory)
                                    ↓
src/channels/index.ts   →  import './feishu.js'  (触发自注册)
                                    ↓
src/index.ts           →  getChannelFactory('feishu') → factory(channelOpts)
```

### 5.2 JID 格式设计

| 飞书场景 | JID 格式 | 示例 |
|----------|----------|------|
| 单聊 | `fs:p2p:{open_id}` | `fs:p2p:ou_xxx` |
| 群聊 | `fs:group:{chat_id}` | `fs:group:oc_xxx` |

### 5.3 核心接口实现

```typescript
// src/channels/feishu.ts

export class FeishuChannel implements Channel {
  name = 'feishu';
  
  async connect(): Promise<void> {
    // 1. 创建 WSClient 长连接
    const wsClient = new Lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: Lark.LoggerLevel.debug,
    });

    // 2. 注册消息接收事件
    const eventDispatcher = new Lark.EventDispatcher({});
    eventDispatcher.register({
      'im.message.receive_v1': async (data) => {
        const { message } = data;
        const chatJid = message.chat_type === 'p2p' 
          ? `fs:p2p:${message.sender.open_id}`
          : `fs:group:${message.chat_id}`;
        
        // 3. 触发 onChatMetadata（用于聊天发现）
        this.opts.onChatMetadata(chatJid, message.create_time, 
          message.chat_name, 'feishu', message.chat_type === 'group');

        // 4. 检查是否注册，交付消息
        const group = this.opts.registeredGroups()[chatJid];
        if (!group) return;

        this.opts.onMessage(chatJid, {
          id: message.message_id,
          chat_jid: chatJid,
          sender: message.sender.open_id,
          sender_name: message.sender.name,
          content: this.parseContent(message),
          timestamp: new Date(message.create_time).toISOString(),
        });
      }
    });

    // 5. 启动长连接
    await wsClient.start({ eventDispatcher });
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    // 解析 JID 获取 chat_id
    const chatId = jid.replace(/^fs:(p2p|group):/, '');
    
    await this.client.im.v1.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text }),
      },
    });
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('fs:');
  }
}
```

### 5.4 消息内容解析

飞书消息内容存储在 `message.content` 中（JSON 字符串），需要根据 `message.message_type` 解析：

| 消息类型 | content 格式 | 解析方式 |
|----------|--------------|----------|
| `text` | `{"text":"内容"}` | `JSON.parse(content).text` |
| `post` | 富文本 JSON | 需要处理多语言、多元素 |
| `image` | `{"image_key":"xxx"}` | 调用 `im.v1.image.get` 获取 |
| `file` | `{"file_key":"xxx"}` | 调用 `im.v1.file.get` 获取 |
| `audio` | `{"file_key":"xxx"}` | 调用 `im.v1.messageResource.get` 获取 |
| `sticker` | 表情包 | 显示为 `[表情包]` |
| `share_card` | 卡片分享 | 显示为 `[分享卡片]` |
| `interactive` | 卡片交互 | 显示为 `[交互卡片]` |

### 5.5 @提及处理

飞书消息事件中的 `mentions` 字段包含被 @ 的用户信息：

```typescript
// 解析 @提及
if (message.mentions && message.mentions.length > 0) {
  const mentionText = message.mentions
    .map(m => `<at>${m.name}</at>`)
    .join(' ');
  content = `${mentionText} ${content}`;
}
```

---

## 六、环境变量配置

OKClaw 飞书渠道使用以下环境变量：

```bash
# .env 文件

# 飞书应用凭证（必填）
FEISHU_APP_ID=cli_a8f75e4d913abcef
FEISHU_APP_SECRET=RekOQ8EV14shNMtZokRAmdmlabcefabc

# 可选：自定义长连接域名（默认 open.feishu.cn）
# FEISHU_DOMAIN=https://open.feishu.cn
```

凭证获取位置：飞书开发者后台 > 你的应用 > **凭证与基础信息** > **应用凭证**

---

## 七、飞书机器人使用限制

| 限制项 | 数值 | 说明 |
|--------|------|------|
| 向同一用户发消息 | 5 QPS | 每秒最多 5 条 |
| 向同一群组发消息 | 群内机器人共享 5 QPS | 所有机器人共享限额 |
| 消息内容 | 文本最大 150KB | 卡片/富文本最大 30KB |
| 长连接数 | 每应用最多 50 个 | 建议开发环境使用 1 个 |
| 消息响应时间 | 3 秒内 | 长连接模式需要在 3 秒内处理完成 |

---

## 八、常见问题

### Q1：长连接模式无法保存配置？

**原因**：本地 OKClaw 服务未启动，或长连接未成功建立。

**解决**：
1. 确保 OKClaw 已启动并连接到飞书服务器
2. 检查控制台是否输出 `connected to wss://` 开头的日志
3. 确认飞书开发者后台显示的连接状态为"已连接"

### Q2：机器人无法接收消息？

**排查步骤**：
1. 确认应用已开通 `im:message.p2p_msg:readonly`（单聊）或 `im:message.group_at_msg:readonly`（群聊）权限
2. 确认应用已发布且在可用范围内
3. 确认消息发送者在应用的可用范围内

### Q3：如何获取 chat_id？

**方法**：
1. 在飞书客户端中，打开目标聊天
2. 点击右上角 **...** > **设置** > **群管理**
3. 或者通过机器人接收消息事件，从 `message.chat_id` 获取

### Q4：消息发送失败？

**错误码参考**：
| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 230002 | 机器人不在群组中 | 将机器人添加到群组 |
| 230006 | 应用未启用机器人能力 | 启用机器人能力并发布 |
| 230013 | 用户不在可用范围内 | 检查应用可用范围配置 |
| 230035 | 没有发送消息权限 | 检查群禁言设置 |

### Q5：如何处理富文本消息？

飞书富文本（post）消息结构复杂，包含多个语言版本和元素。建议简化处理：

```typescript
function parsePostContent(content: string): string {
  try {
    const post = JSON.parse(content);
    // post.post.zh_cn 是中文内容
    const zhContent = post.post?.zh_cn;
    if (!zhContent) return '[富文本消息]';
    
    const texts = zhContent.content.map((row: any[]) =>
      row.map((elem: any) => elem.text || '').join('')
    ).join('\n');
    
    return texts || '[富文本消息]';
  } catch {
    return '[富文本消息]';
  }
}
```

---

## 九、参考代码仓库

### 9.1 官方示例

| 示例 | 说明 |
|------|------|
| [飞书 Node.js SDK](https://github.com/larksuite/node-sdk) | 官方 SDK，包含完整示例 |
| [MCP Larkbot Demo](https://github.com/larksuite/lark-samples) | MCP 智能助手示例 |
| [飞书开放平台示例仓库](https://github.com/larksuite/lark-samples) | 多语言示例代码 |

### 9.2 Node.js 长连接示例

```typescript
import * as Lark from '@larksuiteoapi/node-sdk';

const wsClient = new Lark.WSClient({
  appId: process.env.FEISHU_APP_ID!,
  appSecret: process.env.FEISHU_APP_SECRET!,
  loggerLevel: Lark.LoggerLevel.debug,
});

wsClient.start({
  eventDispatcher: new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': async (data) => {
      console.log('收到消息:', JSON.stringify(data, null, 2));
    }
  })
});
```

---

## 十、后续步骤

完成本文档的准备工作后，可以开始实现飞书渠道代码：

1. 安装依赖：`npm install @larksuiteoapi/node-sdk`
2. 创建 `src/channels/feishu.ts` 实现 `Channel` 接口
3. 在 `src/channels/index.ts` 中添加 `import './feishu.js'`
4. 在 `.env.example` 中添加 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`
5. 参考 `add-discord/SKILL.md` 创建 `add-feishu/SKILL.md` 安装技能

---

*文档版本：2026-03-31*
*基于飞书开放平台最新文档整理*
