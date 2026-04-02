---
name: add-qq
description: Add QQ bot channel integration to NanoClaw. Supports WebSocket mode - no public URL required, ideal for local development.
---

# Add QQ Channel

This skill adds QQ bot support to NanoClaw, then walks through interactive setup.

## Phase 1: Pre-flight

### Check if already applied

Check if `src/channels/qq.ts` exists. If it does, skip to Phase 3 (Setup). The code changes are already in place.

### Ask the user

Use `AskUserQuestion` to collect configuration:

AskUserQuestion: Do you have a QQ bot (App ID and App Secret), or do you need to create one?

If they have one, collect it now. If not, we'll create one in Phase 3.

## Phase 2: Apply Code Changes

### Ensure channel remote

```bash
git remote -v
```

If `qq` is missing, add it:

```bash
git remote add qq https://github.com/qwibitai/nanoclaw-qq.git
```

### Merge the skill branch

```bash
git fetch qq main
git merge qq/main || {
  git checkout --theirs package-lock.json
  git add package-lock.json
  git merge --continue
}
```

This merges in:
- `src/channels/qq.ts` (QQChannel class with self-registration via `registerChannel`)
- `src/channels/qq.test.ts` (unit tests)
- `import './qq.js'` appended to the channel barrel file `src/channels/index.ts`
- `qq-official-bot` npm dependency in `package.json`
- `QQ_BOT_APP_ID` and `QQ_BOT_APP_SECRET` in `.env.example`

If the merge reports conflicts, resolve them by reading the conflicted files and understanding the intent of both sides.

### Validate code changes

```bash
npm install
npm run build
npx vitest run src/channels/qq.test.ts
```

All tests must pass (including the new QQ tests) and build must be clean before proceeding.

## Phase 3: Setup

### Create QQ Bot (if needed)

If the user doesn't have a QQ bot, tell them:

> I need you to create a QQ bot:
>
> 1. Go to the [QQ Bot Platform](https://bot.qq.com/)
> 2. Click **立即注册** (Register Now)
> 3. Choose **个人** (Personal) or **企业** (Enterprise)
> 4. After registration, create a bot application
> 5. Get the `AppID` and `AppSecret` from the application details
> 6. Configure bot intents (needed for receiving messages):
>    - `GROUP_AT_MESSAGE_CREATE` (Receive group @mentions)
>    - `C2C_MESSAGE_CREATE` (Receive private messages)
>    - `GUILD_MESSAGES` (Receive channel messages)

Wait for the user to provide the App ID and App Secret.

### Configure environment

Add to `.env`:

```bash
QQ_BOT_APP_ID=1234567890
QQ_BOT_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
QQ_BOT_SANDBOX=false
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
> **For Group Chat:**
> 1. Add the bot to a QQ group
> 2. @mention the bot in the group
> 3. Check the logs: `tail -f logs/nanoclaw.log`
> 4. Look for the chat JID like `qq:group:xxx`
>
> **For Private Chat:**
> 1. Send a message to the bot directly
> 2. Check the logs for the chat JID like `qq:user:xxx`
>
> **For Guild (Channel):**
> 1. Add the bot to a guild channel
> 2. Send a message in the channel
> 3. Check the logs for the chat JID like `qq:guild:xxx:xxx`

Wait for the user to provide the chat ID.

### Register the channel

The chat ID, name, and folder name are needed. Use `npx tsx setup/index.ts --step register` with the appropriate flags.

For a main channel (responds to all messages):

```bash
npx tsx setup/index.ts --step register -- --jid "qq:user:<user_openid>" --name "<chat-name>" --folder "qq_main" --trigger "@${ASSISTANT_NAME}" --channel qq --no-trigger-required --is-main
```

For group chats (trigger-only):

```bash
npx tsx setup/index.ts --step register -- --jid "qq:group:<group_openid>" --name "<group-name>" --folder "qq_<group-name>" --trigger "@${ASSISTANT_NAME}" --channel qq
```

## Phase 5: Verify

### Test the connection

Tell the user:

> Send a message to your registered QQ chat:
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

1. Check `QQ_BOT_APP_ID` and `QQ_BOT_APP_SECRET` are set in `.env`
2. Check chat is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE 'qq:%'"`
3. For non-main chats: message must include trigger pattern
4. Service is running: `launchctl list | grep nanoclaw`
5. Verify intents are configured in QQ Bot Platform

### WebSocket connection failed

1. Check network connectivity
2. Verify App ID and App Secret are correct
3. Check if sandbox mode is enabled (for testing)

### Rate limits

QQ bot has message limits:
- **Private chat**: 4 messages/month per user (proactive), 5 replies/60min
- **Group chat**: 4 messages/month per group (proactive), 5 replies/5min
- **Guild channel**: 20 messages/day per channel (proactive)

Use trigger-based responses (passive replies) to avoid rate limits.

## After Setup

The QQ bot supports:
- Private chat (C2C)
- Group chat (@mentions)
- Guild channels
- Message splitting for long responses

## Why QQ?

QQ bot WebSocket mode is ideal for NanoClaw local development:
- ✅ WebSocket mode - no public URL required
- ✅ No need for ngrok or reverse proxy
- ✅ Works behind NAT/firewall
- ✅ Official Node.js SDK with TypeScript support

## JID Format

| QQ Scenario | JID Format | Example |
|-------------|------------|---------|
| Group chat | `qq:group:{group_openid}` | `qq:group:C9F778FE...` |
| Private chat | `qq:user:{user_openid}` | `qq:user:E4F4AEA3...` |
| Guild channel | `qq:guild:{guild_id}:{channel_id}` | `qq:guild:18700...:100010` |
