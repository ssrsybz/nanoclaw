---
name: add-feishu
description: Add Feishu (Lark) bot channel integration to NanoClaw. Supports WebSocket long polling - no public URL required, ideal for local development.
---

# Add Feishu Channel

This skill adds Feishu (Lark) support to NanoClaw, then walks through interactive setup.

## Phase 1: Pre-flight

### Check if already applied

Check if `src/channels/feishu.ts` exists. If it does, skip to Phase 3 (Setup). The code changes are already in place.

### Ask the user

Use `AskUserQuestion` to collect configuration:

AskUserQuestion: Do you have a Feishu app (App ID and App Secret), or do you need to create one?

If they have one, collect it now. If not, we'll create one in Phase 3.

## Phase 2: Apply Code Changes

### Ensure channel remote

```bash
git remote -v
```

If `feishu` is missing, add it:

```bash
git remote add feishu https://github.com/qwibitai/nanoclaw-feishu.git
```

### Merge the skill branch

```bash
git fetch feishu main
git merge feishu/main || {
  git checkout --theirs package-lock.json
  git add package-lock.json
  git merge --continue
}
```

This merges in:
- `src/channels/feishu.ts` (FeishuChannel class with self-registration via `registerChannel`)
- `src/channels/feishu.test.ts` (unit tests)
- `import './feishu.js'` appended to the channel barrel file `src/channels/index.ts`
- `@larksuiteoapi/node-sdk` npm dependency in `package.json`
- `FEISHU_APP_ID` and `FEISHU_APP_SECRET` in `.env.example`

If the merge reports conflicts, resolve them by reading the conflicted files and understanding the intent of both sides.

### Validate code changes

```bash
npm install
npm run build
npx vitest run src/channels/feishu.test.ts
```

All tests must pass (including the new Feishu tests) and build must be clean before proceeding.

## Phase 3: Setup

### Create Feishu App (if needed)

If the user doesn't have a Feishu app, tell them:

> I need you to create a Feishu app:
>
> 1. Go to the [Feishu Developer Console](https://open.feishu.cn/app)
> 2. Click **Create Enterprise Self-Built App** (创建企业自建应用)
> 3. Fill in app name (e.g., "NanoClaw Assistant") and description
> 4. After creation, go to **Credentials & Basic Info** (凭证与基础信息) to get:
>    - App ID (格式: `cli_xxx`)
>    - App Secret
> 5. Go to **App Capabilities** > **Add Capability** > **Bot** (机器人)
> 6. Go to **Permission Management** (权限管理) and enable:
>     - `im:message.p2p_msg:readonly` (Get bot messages in 1:1 chats)
>     - `im:message.group_at_msg:readonly` (Get messages where bot is @mentioned)
>     - `im:message:send_as_bot` (Send messages as bot)
>     - `contact:user.id:readonly` (Get user ID)
> 7. Go to **Events & Callbacks** > **Event Configuration** (事件订阅)
>     - Select **Use Long Connection to Receive Events** (使用长连接接收事件)
>     - Add event: `im.message.receive_v1` (Receive message)

Wait for the user to provide the App ID and App Secret.

### Configure environment

Add to `.env`:

```bash
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxx
```

Channels auto-enable when their credentials are present — no extra configuration needed.

Sync to container environment (if using container mode):

```bash
mkdir -p data/env && cp .env data/env/env
```

### Build and restart

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Phase 4: Registration

### Get Chat ID

Tell the user:

> To get the chat ID for registration:
>
> **For Private Chat (P2P):**
> 1. Send a message to your bot in Feishu
> 2. Check the logs: `tail -f logs/nanoclaw.log`
> 3. Look for the chat JID like `fs:p2p:ou_xxx`
>
> **For Group Chat:**
> 1. Add the bot to a group
> 2. @mention the bot in the group
> 3. Check the logs for the chat JID like `fs:group:oc_xxx`

Wait for the user to provide the chat ID.

### Register the channel

The chat ID, name, and folder name are needed. Use `npx tsx setup/index.ts --step register` with the appropriate flags.

For a main channel (responds to all messages):

```bash
npx tsx setup/index.ts --step register -- --jid "fs:p2p:<open_id>" --name "<chat-name>" --folder "feishu_main" --trigger "@${ASSISTANT_NAME}" --channel feishu --no-trigger-required --is-main
```

For group chats (trigger-only):

```bash
npx tsx setup/index.ts --step register -- --jid "fs:group:<chat_id>" --name "<group-name>" --folder "feishu_<group-name>" --trigger "@${ASSISTANT_NAME}" --channel feishu
```

## Phase 5: Verify

### Test the connection

Tell the user:

> Send a message to your registered Feishu chat:
> - For main chat: Any message works
> - For non-main: @mention the bot
>
> The bot should respond within a few seconds.

### Check logs if needed

```bash
tail -f logs/nanoclaw.log
```

## Troubleshooting

### Bot not responding

1. Check `FEISHU_APP_ID` and `FEISHU_APP_SECRET` are set in `.env`
2. Check chat is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE 'fs:%'"`
3. For non-main chats: message must include trigger pattern
4. Service is running: `launchctl list | grep nanoclaw`
5. Verify permissions are enabled in Feishu Developer Console
6. Verify the app is published (version management > publish)

### Long connection not established

1. Ensure the app has Bot capability enabled
2. Ensure `im.message.receive_v1` event is subscribed
3. Check logs for WebSocket connection errors
4. Try restarting the service

### Permission errors

If you see permission errors in logs:
1. Go to Feishu Developer Console > Permission Management
2. Add the missing permission
3. Republish the app
4. Restart NanoClaw

### Getting Chat ID

If you can't find the chat ID:
1. Send a message to the bot (P2P) or @mention in a group
2. Check logs immediately: `tail -f logs/nanoclaw.log`
3. Look for "Feishu message received" with the chatJid

## After Setup

The Feishu bot supports:
- Text messages in registered chats
- Rich text (post) messages (converted to plain text)
- P2P (private) and group chats
- @mention detection
- Message splitting for responses over 40000 characters

## Why Feishu?

Feishu is ideal for NanoClaw local development:
- ✅ WebSocket long polling - no public URL required
- ✅ No need for ngrok or reverse proxy
- ✅ Works behind NAT/firewall
- ✅ Official Node.js SDK with TypeScript support
- ✅ Generous message limits (40000 characters)
